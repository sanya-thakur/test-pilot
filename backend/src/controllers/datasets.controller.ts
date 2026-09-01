import { Request, Response } from 'express';
import fs from 'fs';

export const uploadDataset = (req: Request, res: Response): void => {
  if (!req.file) {
    res.status(400).json({ error: 'Missing file. Please upload a CSV file.' });
    return;
  }

  // Basic sanity check for CSV structural content
  try {
    const buffer = fs.readFileSync(req.file.path);
    // Just read first 512 bytes for a quick check. Should not contain null bytes (binary indicator).
    const chunk = buffer.subarray(0, 512);
    if (chunk.includes(0x00)) {
      // It's binary, not a CSV
      fs.unlinkSync(req.file.path);
      res.status(400).json({ error: 'Invalid file format. Expected a text-based CSV.' });
      return;
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to read uploaded file' });
    return;
  }

  // File is accepted
  res.status(202).json({
    uploadId: req.file.filename.split('.')[0],
    status: 'stored',
    message: 'File accepted for profiling.',
  });
};
