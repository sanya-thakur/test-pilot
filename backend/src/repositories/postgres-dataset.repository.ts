import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../db/prisma';
import {
  DatasetRecord,
  DatasetSummary,
  CreateDatasetInput,
  IDatasetRepository,
} from './dataset.repository';
import { ProfilerResponseV1 } from '../contracts/profiler-response';

export class PostgresDatasetRepository implements IDatasetRepository {
  private client: PrismaClient;

  constructor(client?: PrismaClient) {
    this.client = client || defaultPrisma;
  }

  private mapToRecord(dbRecord: any): DatasetRecord {
    return {
      id: dbRecord.id,
      originalFilename: dbRecord.originalFilename,
      storedFilename: dbRecord.storedFilename,
      fileSha256: dbRecord.fileSha256,
      sizeBytes: Number(dbRecord.sizeBytes),
      rowCount: dbRecord.rowCount,
      columnCount: dbRecord.columnCount,
      duplicateRowCount: dbRecord.duplicateRowCount,
      encoding: dbRecord.encoding,
      delimiter: dbRecord.delimiter,
      headerQuality: dbRecord.headerQuality,
      healthScore: dbRecord.healthScore,
      healthScoreDeductions: dbRecord.healthScoreDeductions as Record<string, number>,
      scoringVersion: dbRecord.scoringVersion,
      severityTotals: dbRecord.severityTotals as { info: number; warning: number; error: number },
      findings: dbRecord.findings as any[],
      columnProfiles: dbRecord.columnProfiles as any[],
      profilerVersion: dbRecord.profilerVersion,
      report: dbRecord.report as ProfilerResponseV1,
      createdAt: typeof dbRecord.createdAt === 'string' ? dbRecord.createdAt : dbRecord.createdAt.toISOString(),
      updatedAt: dbRecord.updatedAt,
    };
  }

  private mapToSummary(dbRecord: any): DatasetSummary {
    return {
      id: dbRecord.id,
      originalFilename: dbRecord.originalFilename,
      storedFilename: dbRecord.storedFilename,
      fileSha256: dbRecord.fileSha256,
      sizeBytes: Number(dbRecord.sizeBytes),
      rowCount: dbRecord.rowCount,
      columnCount: dbRecord.columnCount,
      healthScore: dbRecord.healthScore,
      profilerVersion: dbRecord.profilerVersion,
      createdAt: typeof dbRecord.createdAt === 'string' ? dbRecord.createdAt : dbRecord.createdAt.toISOString(),
    };
  }

  async create(input: CreateDatasetInput | (Omit<DatasetRecord, 'id' | 'createdAt'> & Partial<Pick<DatasetRecord, 'id' | 'createdAt'>>)): Promise<DatasetRecord> {
    const report = input.report;
    const dbRecord = await this.client.datasetRecord.create({
      data: {
        originalFilename: input.originalFilename,
        storedFilename: input.storedFilename,
        fileSha256: report.file_summary?.file_sha256 || 'unknown',
        sizeBytes: BigInt(report.file_summary?.size_bytes || 0),
        rowCount: report.file_summary?.row_count || 0,
        columnCount: report.file_summary?.column_count || 0,
        duplicateRowCount: report.file_summary?.duplicate_row_count || 0,
        encoding: report.file_summary?.encoding || 'utf-8',
        delimiter: report.file_summary?.delimiter || ',',
        headerQuality: report.file_summary?.header_quality || 'good',
        healthScore: input.healthScore ?? report.health_score?.score ?? 100,
        healthScoreDeductions: (report.health_score?.deductions || {}) as any,
        scoringVersion: report.health_score?.scoring_version || 'v1',
        severityTotals: (report.severity_totals || { info: 0, warning: 0, error: 0 }) as any,
        findings: (report.findings || []) as any,
        columnProfiles: (report.column_profiles || []) as any,
        profilerVersion: input.profilerVersion || report.profiler_version || 'testpilot-profiler-v1',
        report: report as any,
      },
    });

    return this.mapToRecord(dbRecord);
  }

  async findById(id: string): Promise<DatasetRecord | null> {
    const dbRecord = await this.client.datasetRecord.findUnique({
      where: { id },
    });

    if (!dbRecord) {
      return null;
    }

    return this.mapToRecord(dbRecord);
  }

  async list(): Promise<DatasetSummary[]> {
    const dbRecords = await this.client.datasetRecord.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return dbRecords.map((r) => this.mapToSummary(r));
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.client.datasetRecord.delete({
        where: { id },
      });
      return true;
    } catch {
      return false;
    }
  }
}
