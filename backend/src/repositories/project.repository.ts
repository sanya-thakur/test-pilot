export interface ProjectFileSummary {
  path: string;
  sizeBytes: number;
  extension: string;
}

export interface ProjectRecord {
  id: string;
  originalFilename: string;
  createdAt: string;
  fileCount: number;
  totalUncompressedBytes: number;
  languages: string[];
  frameworks: string[];
  manifests: string[];
  routes: string[];
  schemas: string[];
  tests: string[];
  files: ProjectFileSummary[];
}

export interface ProjectRepository {
  create(input: Omit<ProjectRecord, 'id' | 'createdAt'>): Promise<ProjectRecord>;
  list(): Promise<ProjectRecord[]>;
  findById(id: string): Promise<ProjectRecord | null>;
}
