import { Fragment, useMemo, useState } from 'react';
import type { ProfilerResponse } from '../types/profiler';

interface HealthReportProps {
  report: ProfilerResponse;
  onReset: () => void;
}

const severityOrder = ['error', 'warning', 'info'] as const;

const formatNumber = (value: number) => (Number.isInteger(value) ? value.toString() : value.toFixed(2));

const renderMetricValue = (value: unknown): string => {
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '—');
};

const getHealthStatus = (score: number, findingCount: number) => {
  if (score >= 90 && findingCount === 0) return { label: 'Healthy', tone: 'healthy' };
  if (score >= 80) return { label: 'Monitor closely', tone: 'warning' };
  if (score >= 60) return { label: 'Needs attention', tone: 'warning' };
  return { label: 'Critical', tone: 'error' };
};

const getColumnStatus = (column: ProfilerResponse['column_profiles'][number]) => {
  if (column.inferred_type === 'empty') return 'Empty';
  if (column.null_percentage > 0 || column.duplicate_value_rate > 0 || column.invalid_parsed_value_count > 0 || column.empty_string_count > 0) {
    return 'Needs attention';
  }
  return 'Healthy';
};

const formatFindingMessage = (finding: ProfilerResponse['findings'][number]) => {
  if (!finding.column) {
    return `Data quality issue detected for ${finding.rule_id}.`;
  }

  return `Data quality issue detected in ${finding.column} for ${finding.rule_id}.`;
};

export function HealthReport({ report, onReset }: HealthReportProps) {
  const [expandedColumns, setExpandedColumns] = useState<Record<string, boolean>>({});

  const totalFindings = report.findings.length;
  const healthStatus = getHealthStatus(report.health_score.score, totalFindings);

  const quickOverview = useMemo(() => {
    const totalCells = Math.max(report.file_summary.row_count * report.file_summary.column_count, 0);
    const missingValues = report.column_profiles.reduce((sum, column) => sum + column.null_count + column.empty_string_count, 0);
    const missingPercent = totalCells > 0 ? (missingValues / totalCells) * 100 : 0;

    return {
      rows: report.file_summary.row_count,
      columns: report.file_summary.column_count,
      missingValueCount: missingValues,
      missingValuePercent: missingPercent,
      duplicateRows: report.file_summary.duplicate_row_count,
      errors: report.severity_totals.error ?? 0,
      warnings: report.severity_totals.warning ?? 0,
      info: report.severity_totals.info ?? 0,
      columnsAnalyzed: report.column_profiles.length,
    };
  }, [report]);

  const renderFindingMetrics = (finding: ProfilerResponse['findings'][number]) => {
    if (!finding.metrics || Object.keys(finding.metrics).length === 0) {
      return null;
    }

    return (
      <div className="finding-metrics">
        {Object.entries(finding.metrics).map(([key, value]) => (
          <div key={key} className="fact-row">
            <span>{key}</span>
            <strong>{renderMetricValue(value)}</strong>
          </div>
        ))}
      </div>
    );
  };

  const toggleColumn = (columnName: string) => {
    setExpandedColumns((current) => ({
      ...current,
      [columnName]: !current[columnName],
    }));
  };

  const details = [
    { label: 'File size', value: `${report.file_summary.size_bytes} bytes` },
    { label: 'Rows', value: report.file_summary.row_count.toLocaleString() },
    { label: 'Columns', value: report.file_summary.column_count.toLocaleString() },
    { label: 'Encoding', value: report.file_summary.encoding },
    { label: 'Delimiter', value: report.file_summary.delimiter || 'auto' },
    { label: 'Header quality', value: report.file_summary.header_quality },
    { label: 'Profiler version', value: report.profiler_version },
    { label: 'Scoring version', value: report.health_score.scoring_version },
  ];

  return (
    <div className="report-shell">
      <header className="report-header">
        <div className="report-heading-group">
          <p className="eyebrow">Dataset Health</p>
          <h2>{report.file_summary.file_sha256 ? 'Uploaded dataset' : 'Dataset report'}</h2>
        </div>
        <button type="button" className="secondary-button" onClick={onReset}>
          Analyze another dataset
        </button>
      </header>

      <section className="hero-panel">
        <div className="score-wrap" aria-label={`Health score ${report.health_score.score}`}>
          <div className="score-ring" style={{ ['--score' as string]: `${report.health_score.score * 3.6}deg` }}>
            <div className="score-ring-inner">
              <strong>{report.health_score.score}</strong>
              <span>/ 100</span>
            </div>
          </div>
        </div>

        <div className="hero-copy">
          <div className={`status-pill ${healthStatus.tone}`}>
            {healthStatus.label}
          </div>
          <h3>Data quality score</h3>
          <p className="muted-copy">
            {totalFindings === 0
              ? 'No quality issues were detected in this dataset.'
              : `${totalFindings} issue${totalFindings === 1 ? '' : 's'} require attention.`}
          </p>
          <p className="hero-meta">
            Profiler version {report.profiler_version} • scoring {report.health_score.scoring_version}
          </p>
        </div>
      </section>

      <section className="layout-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">Quick Overview</p>
            <h3>Dataset snapshot</h3>
          </div>
        </div>

        <div className="overview-grid">
          <div className="overview-stat">
            <span>Rows</span>
            <strong>{quickOverview.rows.toLocaleString()}</strong>
          </div>
          <div className="overview-stat">
            <span>Columns</span>
            <strong>{quickOverview.columns.toLocaleString()}</strong>
          </div>
          <div className="overview-stat">
            <span>Missing</span>
            <strong>{quickOverview.missingValueCount.toLocaleString()}</strong>
            <small>{quickOverview.missingValuePercent.toFixed(1)}%</small>
          </div>
          <div className="overview-stat">
            <span>Duplicates</span>
            <strong>{quickOverview.duplicateRows.toLocaleString()}</strong>
          </div>
          <div className="overview-stat">
            <span>Errors</span>
            <strong>{quickOverview.errors}</strong>
          </div>
          <div className="overview-stat">
            <span>Warnings</span>
            <strong>{quickOverview.warnings}</strong>
          </div>
          <div className="overview-stat">
            <span>Info</span>
            <strong>{quickOverview.info}</strong>
          </div>
          <div className="overview-stat">
            <span>Columns analyzed</span>
            <strong>{quickOverview.columnsAnalyzed}</strong>
          </div>
        </div>
      </section>

      <section className="layout-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">What Needs Attention</p>
            <h3>Prioritized findings</h3>
          </div>
        </div>

        {report.findings.length === 0 ? (
          <div className="empty-state-box">
            <h4>Your dataset looks healthy</h4>
            <p>No quality issues were detected.</p>
          </div>
        ) : (
          <div className="finding-groups">
            {severityOrder.map((severity) => {
              const items = report.findings.filter((finding) => finding.severity === severity);
              if (items.length === 0) return null;

              return (
                <div key={severity} className="finding-group">
                  <div className="group-heading-row">
                    <span className={`severity-badge ${severity}`}>{severity}</span>
                    <h4>{severity === 'error' ? 'Errors' : severity === 'warning' ? 'Warnings' : 'Info'}</h4>
                  </div>

                  <div className="finding-list">
                    {items.map((finding, index) => (
                      <article key={`${finding.rule_id}-${index}`} className="finding-item">
                        <div className="finding-header-row">
                          <div>
                            <div className="finding-rule">{finding.rule_id}</div>
                            <p className="finding-message">{formatFindingMessage(finding)}</p>
                          </div>
                          <span className={`severity-badge ${finding.severity}`}>{finding.severity}</span>
                        </div>

                        {finding.column && <div className="finding-column">Column: {finding.column}</div>}
                        {renderFindingMetrics(finding)}
                      </article>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="layout-section compact-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">Dataset Details</p>
            <h3>Metadata</h3>
          </div>
        </div>

        <div className="details-grid">
          {details.map((detail) => (
            <div key={detail.label} className="meta-item">
              <span>{detail.label}</span>
              <strong>{detail.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="layout-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">Column Profiles</p>
            <h3>Column health</h3>
          </div>
        </div>

        <div className="table-wrap">
          <table className="column-table">
            <thead>
              <tr>
                <th>Column</th>
                <th>Type</th>
                <th>Missing</th>
                <th>Distinct</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {report.column_profiles.map((column) => {
                const isExpanded = !!expandedColumns[column.column_name];
                const status = getColumnStatus(column);

                return (
                  <Fragment key={column.column_name}>
                    <tr className={isExpanded ? 'expanded-row' : ''}>
                      <td>
                        <button
                          type="button"
                          className="column-toggle"
                          onClick={() => toggleColumn(column.column_name)}
                          aria-expanded={isExpanded}
                        >
                          {column.column_name}
                        </button>
                      </td>
                      <td>{column.inferred_type}</td>
                      <td>{column.null_count}</td>
                      <td>{column.distinct_count}</td>
                      <td>
                        <span className={`status-pill ${status === 'Healthy' ? 'healthy' : status === 'Empty' ? 'info' : 'warning'}`}>
                          {status}
                        </span>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="column-detail-row" key={`${column.column_name}-detail`}>
                        <td colSpan={5}>
                          <div className="column-detail-panel">
                            <div className="detail-metrics">
                              <div className="fact-row"><span>Null %</span><strong>{column.null_percentage.toFixed(2)}%</strong></div>
                              <div className="fact-row"><span>Empty strings</span><strong>{column.empty_string_count}</strong></div>
                              <div className="fact-row"><span>Distinct %</span><strong>{column.distinct_percentage.toFixed(2)}%</strong></div>
                              <div className="fact-row"><span>Duplicate rate</span><strong>{column.duplicate_value_rate.toFixed(2)}</strong></div>
                              <div className="fact-row"><span>Invalid parsed values</span><strong>{column.invalid_parsed_value_count}</strong></div>
                            </div>

                            {column.numeric_statistics && (
                              <div className="detail-section">
                                <h5>Numeric statistics</h5>
                                <div className="detail-metrics">
                                  {Object.entries(column.numeric_statistics).map(([key, value]) => (
                                    <div key={key} className="fact-row">
                                      <span>{key}</span>
                                      <strong>{renderMetricValue(value)}</strong>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {column.string_length_statistics && (
                              <div className="detail-section">
                                <h5>String length statistics</h5>
                                <div className="detail-metrics">
                                  {Object.entries(column.string_length_statistics).map(([key, value]) => (
                                    <div key={key} className="fact-row">
                                      <span>{key}</span>
                                      <strong>{renderMetricValue(value)}</strong>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {column.date_range && (
                              <div className="detail-section">
                                <h5>Date range</h5>
                                <div className="detail-metrics">
                                  {Object.entries(column.date_range).map(([key, value]) => (
                                    <div key={key} className="fact-row">
                                      <span>{key}</span>
                                      <strong>{renderMetricValue(value)}</strong>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {column.samples && column.samples.length > 0 && (
                              <div className="detail-section">
                                <h5>Samples</h5>
                                <ul className="sample-list">
                                  {column.samples.map((sample, sampleIndex) => (
                                    <li key={`${sample}-${sampleIndex}`}>{sample}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
