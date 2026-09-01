import request from 'supertest';
import app from '../src/app';
import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = path.resolve(__dirname, '../../data/uploads');

describe('POST /api/v1/datasets/profile', () => {
  const dummyCsvPath = path.join(__dirname, 'dummy.csv');
  const dummyBinPath = path.join(__dirname, 'dummy.bin');

  beforeAll(() => {
    fs.writeFileSync(dummyCsvPath, 'id,name\n1,Alice\n2,Bob');
    // Binary file containing null bytes
    fs.writeFileSync(dummyBinPath, Buffer.from([0x00, 0x01, 0x02, 0x00]));
  });

  afterAll(() => {
    if (fs.existsSync(dummyCsvPath)) fs.unlinkSync(dummyCsvPath);
    if (fs.existsSync(dummyBinPath)) fs.unlinkSync(dummyBinPath);
  });

  it('should reject missing file', async () => {
    const res = await request(app).post('/api/v1/datasets/profile');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing file/);
  });

  it('should reject unsupported file type based on extension/mimetype', async () => {
    const res = await request(app)
      .post('/api/v1/datasets/profile')
      .attach('file', dummyBinPath, 'dummy.exe'); // wrong extension

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unsupported file type/);
  });

  it('should reject structurally invalid file even with .csv extension', async () => {
    const res = await request(app)
      .post('/api/v1/datasets/profile')
      .attach('file', dummyBinPath, 'malicious.csv');

    // Mimetype might default to application/octet-stream, which is rejected.
    // If it bypasses mimetype, the controller will read 0x00 and reject.
    expect(res.status).toBe(400);
  });

  it('should accept valid CSV and store it safely without trusting filename', async () => {
    const originalName = '../../../malicious.csv';
    const res = await request(app)
      .post('/api/v1/datasets/profile')
      .attach('file', dummyCsvPath, originalName);

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('stored');
    expect(res.body.uploadId).toBeDefined();
    
    // Ensure path traversal didn't happen and original filename wasn't used directly
    expect(res.body.uploadId).not.toContain('../');
    expect(res.body).not.toHaveProperty('path'); // Local filesystem path not exposed
    
    const storedFilePath = path.join(UPLOAD_DIR, `${res.body.uploadId}.csv`);
    expect(fs.existsSync(storedFilePath)).toBe(true);

    // Clean up
    fs.unlinkSync(storedFilePath);
  });
});
