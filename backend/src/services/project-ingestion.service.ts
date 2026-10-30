import fs from 'fs/promises';
import path from 'path';
import yauzl from 'yauzl';
import { LocalProjectRepository } from '../repositories/local-project.repository';
import type { ProjectFileSummary, ProjectRecord, ProjectRepository } from '../repositories/project.repository';
import { projectIngestionLimits } from './project-ingestion.limits';

const SUPPORTED_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rb', '.php', '.cs', '.json', '.yaml', '.yml', '.sql', '.prisma', '.html', '.css', '.md', '.txt']);
const SUPPORTED_EXTENSIONLESS_FILES = new Set(['dockerfile', 'makefile', 'procfile', 'license', 'license.txt', 'copying', 'readme', 'readme.txt', '.gitignore', '.dockerignore', '.npmignore', '.editorconfig', '.env.example', '.env.sample', '.env.template']);
const LANGUAGE_BY_EXTENSION: Record<string, string> = { '.js': 'JavaScript', '.jsx': 'JavaScript', '.ts': 'TypeScript', '.tsx': 'TypeScript', '.py': 'Python', '.java': 'Java', '.go': 'Go', '.rb': 'Ruby', '.php': 'PHP', '.cs': 'C#', '.sql': 'SQL', '.prisma': 'Prisma' };
const EXCLUDED_DIRECTORY_NAMES = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.cache']);

export class ProjectIngestionError extends Error {
  constructor(public readonly code: 'INVALID_ARCHIVE' | 'RESOURCE_LIMIT' | 'UNSUPPORTED_FILE', message: string) { super(message); }
}

const isUnsafePath = (entryPath: string): boolean => {
  if (!entryPath || path.posix.isAbsolute(entryPath) || entryPath.includes('\\')) return true;
  const parts = entryPath.split('/');
  // ZIP directory entries conventionally end in `/`; only that final empty
  // component is valid. Empty intermediate components and traversal are not.
  return parts.some((part, index) => part === '..' || part === '.' || (part === '' && index !== parts.length - 1));
};
const uniqueSorted = (values: string[]) => [...new Set(values)].sort();
const shouldSkipEntry = (entryPath: string): boolean => {
  const parts = entryPath.split('/').filter(Boolean);
  const basename = parts.at(-1)?.toLowerCase() || '';
  return parts.some((part) => EXCLUDED_DIRECTORY_NAMES.has(part.toLowerCase())) || basename === '.env' || basename.startsWith('.env.');
};

export class ProjectIngestionService {
  constructor(
    private readonly repository: ProjectRepository = new LocalProjectRepository(),
    private readonly extractionRoot = path.resolve(__dirname, '../../..', 'data/projects/extracted'),
  ) {}

  async ingest(zipPath: string, originalFilename: string): Promise<ProjectRecord> {
    const files: ProjectFileSummary[] = [];
    const root = path.resolve(this.extractionRoot, `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    let totalBytes = 0;
    await fs.mkdir(root, { recursive: true });
    try {
      await new Promise<void>((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true, validateEntrySizes: true }, (openError, zip) => {
          if (openError || !zip) return reject(new ProjectIngestionError('INVALID_ARCHIVE', 'The uploaded file is not a readable ZIP archive.'));
          let archiveEntries = 0;
          let sourceEntries = 0;
          const fail = (error: Error) => { zip.close(); reject(error); };
          zip.readEntry();
          zip.on('entry', (entry) => {
            archiveEntries += 1;
            if (archiveEntries > projectIngestionLimits.maxArchiveEntries) return fail(new ProjectIngestionError('RESOURCE_LIMIT', `Archive exceeds the ${projectIngestionLimits.maxArchiveEntries} archive entry limit.`));
            if (isUnsafePath(entry.fileName)) return fail(new ProjectIngestionError('INVALID_ARCHIVE', 'Archive contains an unsafe file path.'));
            if (/\/$/.test(entry.fileName)) return zip.readEntry();
            if (shouldSkipEntry(entry.fileName)) return zip.readEntry();
            sourceEntries += 1;
            if (sourceEntries > projectIngestionLimits.maxEntries) return fail(new ProjectIngestionError('RESOURCE_LIMIT', `Archive exceeds the ${projectIngestionLimits.maxEntries} supported source file limit.`));
            if (entry.uncompressedSize > projectIngestionLimits.maxEntryBytes || totalBytes + entry.uncompressedSize > projectIngestionLimits.maxTotalBytes) return fail(new ProjectIngestionError('RESOURCE_LIMIT', 'Archive exceeds the allowed uncompressed size.'));
            const ext = path.extname(entry.fileName).toLowerCase();
            const basename = path.posix.basename(entry.fileName).toLowerCase();
            const isSupported = SUPPORTED_EXTENSIONS.has(ext) || SUPPORTED_EXTENSIONLESS_FILES.has(basename) || basename.startsWith('.env.');
            if (!isSupported) return zip.readEntry();
            totalBytes += entry.uncompressedSize;
            const destination = path.resolve(root, entry.fileName);
            if (!destination.startsWith(`${root}${path.sep}`)) return fail(new ProjectIngestionError('INVALID_ARCHIVE', 'Archive contains an unsafe file path.'));
            zip.openReadStream(entry, async (streamError, stream) => {
              if (streamError || !stream) return fail(new ProjectIngestionError('INVALID_ARCHIVE', 'Unable to read an archive entry.'));
              try {
                await fs.mkdir(path.dirname(destination), { recursive: true });
                const chunks: Buffer[] = [];
                stream.on('data', (chunk: Buffer) => chunks.push(chunk));
                stream.on('error', () => fail(new ProjectIngestionError('INVALID_ARCHIVE', 'Unable to read an archive entry.')));
                stream.on('end', async () => { await fs.writeFile(destination, Buffer.concat(chunks)); files.push({ path: entry.fileName, sizeBytes: entry.uncompressedSize, extension: ext }); zip.readEntry(); });
              } catch { fail(new ProjectIngestionError('INVALID_ARCHIVE', 'Unable to safely extract the archive.')); }
            });
          });
          zip.on('end', resolve);
          zip.on('error', () => fail(new ProjectIngestionError('INVALID_ARCHIVE', 'The uploaded file is not a readable ZIP archive.')));
        });
      });
    } catch (error) { await fs.rm(root, { recursive: true, force: true }); throw error; }
    return this.repository.create({ ...this.inventory(originalFilename, files, totalBytes), sourceRoot: root });
  }

  async list(): Promise<ProjectRecord[]> { return this.repository.list(); }
  async findById(id: string): Promise<ProjectRecord | null> { return this.repository.findById(id); }

  private inventory(originalFilename: string, files: ProjectFileSummary[], totalUncompressedBytes: number): Omit<ProjectRecord, 'id' | 'createdAt'> {
    const paths = files.map((file) => file.path);
    const lower = paths.map((file) => file.toLowerCase());
    const languages = uniqueSorted(files.map((file) => LANGUAGE_BY_EXTENSION[file.extension]).filter((x): x is string => Boolean(x)));
    const manifests = paths.filter((file) => /(^|\/)(package\.json|requirements\.txt|pyproject\.toml|pom\.xml|build\.gradle|go\.mod|gemfile|composer\.json|cargo\.toml)$/i.test(file));
    const frameworks: string[] = [];
    if (lower.some((file) => file.endsWith('vite.config.ts') || file.endsWith('vite.config.js'))) frameworks.push('Vite');
    if (lower.some((file) => file.includes('next.config.'))) frameworks.push('Next.js');
    if (lower.some((file) => file.includes('manage.py'))) frameworks.push('Django');
    if (lower.some((file) => file.includes('app.ts') || file.includes('app.js'))) frameworks.push('Express (possible)');
    return { originalFilename, fileCount: files.length, totalUncompressedBytes, languages, frameworks: uniqueSorted(frameworks), manifests: manifests.sort(), routes: paths.filter((file) => /(^|\/)(routes?|pages|api)\//i.test(file) || /\.route\.[jt]sx?$/i.test(file)).sort(), schemas: paths.filter((file) => /(schema|migration|model)/i.test(file)).sort(), tests: paths.filter((file) => /(^|\/)(__tests__|tests?|spec)\//i.test(file) || /\.(test|spec)\.[jt]sx?$/i.test(file)).sort(), files: files.sort((a, b) => a.path.localeCompare(b.path)) };
  }
}

export const projectIngestionService = new ProjectIngestionService();
