const mb = (value: number): number => value * 1024 * 1024;

const positiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

// Deliberately bounded defaults for real-world source archives. Values can be
// tightened by deployment configuration without permitting unbounded uploads.
export const projectIngestionLimits = {
  maxArchiveBytes: positiveInteger(process.env.PROJECT_MAX_ARCHIVE_BYTES, mb(250)),
  maxArchiveEntries: positiveInteger(process.env.PROJECT_MAX_ARCHIVE_ENTRIES, 50_000),
  maxEntries: positiveInteger(process.env.PROJECT_MAX_ENTRIES, 10_000),
  maxEntryBytes: positiveInteger(process.env.PROJECT_MAX_ENTRY_BYTES, mb(20)),
  maxTotalBytes: positiveInteger(process.env.PROJECT_MAX_TOTAL_BYTES, mb(500)),
};

export const megabytes = (bytes: number): string => `${Math.round(bytes / 1024 / 1024)}MB`;
