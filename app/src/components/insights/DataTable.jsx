import { formatInr } from '../../lib/chartColors';
import { useChartLayout } from '../../hooks/useChartLayout';

/**
 * Generic table for an agent dataset.
 *
 * Reuses the report page's table styling so the two pages look like one
 * product. Column types come from the server's `columns` metadata, so
 * currency values format correctly without the UI knowing what was asked.
 *
 * On mobile a wide table becomes stacked label/value rows rather than a
 * horizontal scroll, which is unusable one-handed.
 */
function formatCell(value, type) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (type === 'currency') {
    return formatInr(value);
  }
  if (type === 'number') {
    return typeof value === 'number' ? value.toLocaleString('en-IN') : String(value);
  }
  return String(value);
}

export default function DataTable({ dataset }) {
  const layout = useChartLayout();
  const columns = dataset?.columns || [];
  const rows = dataset?.rows || [];

  if (rows.length === 0 || columns.length === 0) {
    return <p className="help-text">No rows to show.</p>;
  }

  // Three or more columns on a phone is where a table stops being readable.
  const stacked = layout.isMobile && columns.length > 2;

  if (stacked) {
    return (
      <div className="insights-table-stack">
        {rows.map((row, index) => (
          <div className="insights-table-stack-row" key={index}>
            {columns.map((column) => (
              <div className="insights-table-stack-cell" key={column.key}>
                <span className="insights-table-stack-label">{column.label}</span>
                <span className="insights-table-stack-value">
                  {formatCell(row[column.key], column.type)}
                </span>
              </div>
            ))}
          </div>
        ))}
        {dataset.truncated ? (
          <p className="help-text">Showing the first {rows.length} rows.</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="insights-table-wrap">
      <table className="report-proto-table insights-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={
                  column.type === 'currency' || column.type === 'number'
                    ? 'insights-table-numeric'
                    : undefined
                }
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={
                    column.type === 'currency' || column.type === 'number'
                      ? 'insights-table-numeric'
                      : undefined
                  }
                >
                  {formatCell(row[column.key], column.type)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {dataset.truncated ? (
        <p className="help-text">Showing the first {rows.length} rows.</p>
      ) : null}
    </div>
  );
}
