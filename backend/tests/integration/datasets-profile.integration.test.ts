import request from 'supertest';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import app from '../../src/app';

const fixturePath = path.resolve(__dirname, '../../../data-engine/app/tests/fixtures/normal.csv');
const uploadDir = path.resolve(__dirname, '../../..', 'data/uploads');
const fastApiHealthUrl = 'http://127.0.0.1:8000/health';

const readUploadedFileNames = (): string[] => {
  if (!fs.existsSync(uploadDir)) {
    return [];
  }

  return fs.readdirSync(uploadDir);
};

const cleanupUploadedFiles = (before: string[] = []) => {
  if (!fs.existsSync(uploadDir)) {
    return;
  }

  const after = readUploadedFileNames();
  const created = after.filter((name) => !before.includes(name));

  for (const name of created) {
    const fullPath = path.join(uploadDir, name);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }
};

const isFastApiAvailable = async (): Promise<boolean> => {
  try {
    await axios.get(fastApiHealthUrl, { timeout: 2000 });
    return true;
  } catch (error) {
    return false;
  }
};

describe('Express dataset profile integration', () => {
  beforeEach(() => {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
  });

  afterEach(() => {
    cleanupUploadedFiles();
  });

  it('profiles a real CSV through Express, service, FastAPI, and contract validation', async () => {
    const profilerAvailable = await isFastApiAvailable();
    if (!profilerAvailable) {
      console.warn('Skipping E2E dataset profiling integration test because FastAPI is not running at http://127.0.0.1:8000');
      return;
    }

    const beforeFiles = readUploadedFileNames();
    const csvBuffer = fs.readFileSync(fixturePath);

    const response = await request(app)
      .post('/api/v1/datasets/profile')
      .attach('file', csvBuffer, { filename: 'normal.csv', contentType: 'text/csv' });

    expect(response.status).toBe(200);
    expect(response.body.profiler_version).toBe('testpilot-profiler-v1');
    expect(response.body.file_summary).toMatchObject({
      row_count: 3,
      column_count: 4,
      delimiter: ',',
      header_quality: 'good'
    });
    expect(response.body.health_score).toMatchObject({
      score: 100,
      scoring_version: 'score-v1'
    });
    expect(response.body.severity_totals).toEqual({ info: 0, warning: 0, error: 0 });
    expect(response.body.findings).toEqual([]);
    expect(response.body.column_profiles).toHaveLength(4);

    const afterFiles = readUploadedFileNames();
    expect(afterFiles).toEqual(beforeFiles);
  });

});
