// CSV/Excel export — generates a UTF-8 BOM .csv file (opens cleanly in Excel)
// PDF export — generates an executive Financial & Operations Audit PDF matching the exact audit report specification

export function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (val: string | number) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const csv = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename + '.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface AuditSummaryRow {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'negative' | 'teal';
}

export interface AuditTableSection {
  heading: string;
  headers: string[];
  rows: (string | number | { primary: string; secondary?: string })[][];
}

export interface AuditReportConfig {
  companyName?: string;
  systemSubtitle?: string;
  reportCode: string; // e.g., "MONTHLY AUDIT" | "PROFIT & LOSS AUDIT"
  statusText?: string; // e.g., "GENERATED REPORT"
  periodFrom: string; // YYYY-MM-DD or DD/MM/YYYY
  periodTo: string;
  transactionsBoxTitle?: string;
  transactionsRows: AuditSummaryRow[];
  financeBoxTitle?: string;
  financeRows: AuditSummaryRow[];
  bannerLabel: string;
  bannerValue: string;
  bannerPositive?: boolean;
  metaLine2?: string;
  footnote?: string;
  sections: AuditTableSection[];
}

function formatDMY(dateStr: string): string {
  if (!dateStr) return '';
  if (dateStr.includes('/')) return dateStr;
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatGeneratedTimestamp(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy}, ${hh}:${min}:${ss}`;
}

export function buildAuditReportHTML(config: AuditReportConfig): string {
  const company = config.companyName || 'LUCENTIA BEAUTY & SALON';
  const subtitle = config.systemSubtitle || 'Financial & Salon Operations Audit System';
  const status = config.statusText || 'GENERATED REPORT';
  const generatedAt = formatGeneratedTimestamp();
  const periodStr = `${formatDMY(config.periodFrom)} - ${formatDMY(config.periodTo)}`;
  const isPositive = config.bannerPositive !== false;

  const toneClass = (tone?: AuditSummaryRow['tone']) => {
    if (tone === 'positive') return 'val-green';
    if (tone === 'negative') return 'val-red';
    if (tone === 'teal') return 'val-teal';
    return 'val-dark';
  };

  const renderBoxRows = (rows: AuditSummaryRow[]) =>
    rows
      .map(
        (r) => `
        <div class="box-row">
          <span class="box-label">${r.label}</span>
          <span class="box-val ${toneClass(r.tone)}">${r.value}</span>
        </div>`,
      )
      .join('');

  const renderSection = (section: AuditTableSection) => {
    const headHtml = section.headers.map((h) => `<th>${h}</th>`).join('');
    const bodyHtml =
      section.rows.length === 0
        ? `<tr><td colspan="${section.headers.length}" class="empty-row">No records recorded in this period</td></tr>`
        : section.rows
            .map((row) => {
              const cells = row
                .map((cell) => {
                  if (cell && typeof cell === 'object' && 'primary' in cell) {
                    return `<td><div class="cell-primary">${cell.primary}</div>${
                      cell.secondary ? `<div class="cell-secondary">${cell.secondary}</div>` : ''
                    }</td>`;
                  }
                  return `<td>${cell ?? ''}</td>`;
                })
                .join('');
              return `<tr>${cells}</tr>`;
            })
            .join('');

    return `
      <div class="ledger-section">
        <h2 class="section-heading">${section.heading}</h2>
        <table class="ledger-table">
          <thead>
            <tr>${headHtml}</tr>
          </thead>
          <tbody>
            ${bodyHtml}
          </tbody>
        </table>
      </div>
    `;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${company} — ${config.reportCode}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 14mm 14mm 16mm 14mm;
  }
  * {
    box-sizing: border-box;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body {
    margin: 0;
    padding: 28px 36px;
    background: #FFFFFF;
    color: #1E293B;
    font-size: 11px;
    line-height: 1.45;
  }
  .page-container {
    max-width: 820px;
    margin: 0 auto;
  }
  /* Top Action Bar (hidden when printing) */
  .print-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #160D24;
    color: #FFFFFF;
    padding: 10px 18px;
    border-radius: 10px;
    margin-bottom: 24px;
  }
  .print-toolbar-title {
    font-size: 12px;
    font-weight: 700;
    color: #FAE29C;
  }
  .print-btn {
    background: linear-gradient(90deg, #7C3AED 0%, #6D28D9 100%);
    color: #FFFFFF;
    border: none;
    padding: 7px 16px;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }
  .print-btn:hover {
    opacity: 0.92;
  }
  /* Header */
  .audit-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 14px;
    border-bottom: 1.5px solid #CBD5E1;
    margin-bottom: 20px;
  }
  .brand-title {
    font-size: 24px;
    font-weight: 800;
    color: #0D9488;
    letter-spacing: 0.4px;
    margin: 0;
    line-height: 1.15;
    text-transform: uppercase;
  }
  .brand-subtitle {
    font-size: 12px;
    color: #64748B;
    margin: 4px 0 0 0;
    font-weight: 500;
  }
  .report-meta {
    text-align: right;
    font-size: 11px;
    line-height: 1.55;
  }
  .report-meta-type {
    font-weight: 800;
    color: #334155;
    font-size: 11.5px;
  }
  .report-meta-date {
    color: #64748B;
  }
  .report-meta-status {
    font-weight: 800;
    color: #0D9488;
    text-transform: uppercase;
  }
  /* Section Headings */
  .section-heading {
    font-size: 13px;
    font-weight: 800;
    color: #0F172A;
    text-transform: uppercase;
    letter-spacing: 0.2px;
    margin: 0 0 10px 0;
  }
  /* Operational Summary Grid */
  .summary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 14px;
  }
  .summary-box {
    background: #F8FAFC;
    border: 1px solid #CBD5E1;
    padding: 13px 16px;
  }
  .summary-box-title {
    font-size: 11px;
    font-weight: 800;
    color: #334155;
    text-transform: uppercase;
    margin: 0 0 10px 0;
    letter-spacing: 0.3px;
  }
  .box-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 3.5px 0;
    font-size: 11px;
  }
  .box-label {
    color: #475569;
    font-weight: 500;
  }
  .box-val {
    font-weight: 800;
  }
  .val-dark { color: #0F172A; }
  .val-green { color: #16A34A; }
  .val-teal { color: #0D9488; }
  .val-red { color: #DC2626; }
  /* Profit Banner */
  .profit-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    margin-bottom: 12px;
    background: ${isPositive ? '#F0FDF4' : '#FEF2F2'};
    border: 1px solid ${isPositive ? '#86EFAC' : '#FCA5A5'};
  }
  .profit-banner-label {
    font-size: 12.5px;
    font-weight: 800;
    color: #1E293B;
  }
  .profit-banner-value {
    font-size: 18px;
    font-weight: 800;
    color: ${isPositive ? '#16A34A' : '#DC2626'};
  }
  /* Period & Notes */
  .audit-notes {
    margin-bottom: 22px;
    color: #475569;
    font-size: 11px;
  }
  .audit-notes p {
    margin: 0 0 4px 0;
  }
  .audit-notes .footnote {
    margin-top: 6px;
    color: #64748B;
    font-size: 10.5px;
    line-height: 1.45;
  }
  /* Ledger Tables */
  .ledger-section {
    margin-top: 22px;
    page-break-inside: auto;
  }
  .ledger-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10.5px;
  }
  .ledger-table thead tr {
    background: #F1F5F9;
    border-bottom: 1.5px solid #CBD5E1;
  }
  .ledger-table th {
    padding: 8px 10px;
    text-align: left;
    font-weight: 800;
    color: #334155;
    font-size: 10.5px;
  }
  .ledger-table td {
    padding: 8px 10px;
    border-bottom: 1px solid #CBD5E1;
    color: #334155;
    vertical-align: top;
  }
  .cell-primary {
    font-weight: 600;
    color: #1E293B;
  }
  .cell-secondary {
    color: #475569;
    margin-top: 1px;
  }
  .empty-row {
    text-align: center;
    color: #94A3B8;
    padding: 16px !important;
    font-style: italic;
  }
  .audit-footer {
    margin-top: 28px;
    padding-top: 10px;
    border-top: 1px solid #E2E8F0;
    display: flex;
    justify-content: space-between;
    font-size: 9.5px;
    color: #94A3B8;
  }
  @media print {
    body {
      padding: 0;
    }
    .print-toolbar {
      display: none !important;
    }
  }
</style>
</head>
<body>
  <div class="page-container">
    <div class="print-toolbar">
      <span class="print-toolbar-title">${company} — ${config.reportCode} (PDF Print Ready)</span>
      <button class="print-btn" onclick="window.print()">Save as PDF / Print</button>
    </div>

    <header class="audit-header">
      <div>
        <h1 class="brand-title">${company}</h1>
        <p class="brand-subtitle">${subtitle}</p>
      </div>
      <div class="report-meta">
        <div class="report-meta-type">Report: ${config.reportCode}</div>
        <div class="report-meta-date">Generated: ${generatedAt}</div>
        <div class="report-meta-status">Status: ${status}</div>
      </div>
    </header>

    <section>
      <h2 class="section-heading">OPERATIONAL SUMMARY</h2>
      <div class="summary-grid">
        <div class="summary-box">
          <h3 class="summary-box-title">${config.transactionsBoxTitle || 'TRANSACTIONS'}</h3>
          ${renderBoxRows(config.transactionsRows)}
        </div>
        <div class="summary-box">
          <h3 class="summary-box-title">${config.financeBoxTitle || 'FINANCE'}</h3>
          ${renderBoxRows(config.financeRows)}
        </div>
      </div>

      <div class="profit-banner">
        <span class="profit-banner-label">${config.bannerLabel}</span>
        <span class="profit-banner-value">${config.bannerValue}</span>
      </div>

      <div class="audit-notes">
        <p>Period: ${periodStr}</p>
        ${config.metaLine2 ? `<p>${config.metaLine2}</p>` : ''}
        ${config.footnote ? `<p class="footnote">${config.footnote}</p>` : ''}
      </div>
    </section>

    ${config.sections.map(renderSection).join('')}

    <footer class="audit-footer">
      <span>${company} — Official Financial &amp; Operations Audit</span>
      <span>Generated on ${generatedAt}</span>
    </footer>
  </div>
  <script>
    window.onload = function () {
      setTimeout(function () {
        window.print();
      }, 250);
    };
  </script>
</body>
</html>`;
}

function openAuditPrintWindow(config: AuditReportConfig) {
  const printWindow = window.open('', '_blank', 'width=960,height=800');
  if (!printWindow) return;
  const html = buildAuditReportHTML(config);
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

/**
 * Generates the audit report as a real .pdf file and downloads it immediately
 * (no print dialog). Falls back to the printable HTML window if generation fails.
 */
export async function exportAuditPDF(config: AuditReportConfig): Promise<void> {
  try {
    const { downloadAuditPDF } = await import('./pdf-download');
    await downloadAuditPDF(config);
  } catch (err) {
    console.error('PDF auto-download failed, falling back to print view', err);
    openAuditPrintWindow(config);
  }
}

export function exportPDF(
  title: string,
  sections: { heading: string; headers: string[]; rows: (string | number)[][] }[],
  summary?: { label: string; value: string }[],
) {
  const today = new Date().toISOString().slice(0, 10);
  const firstVal = summary?.[0]?.value || 'TZS 0';
  exportAuditPDF({
    reportCode: title.toUpperCase(),
    periodFrom: today,
    periodTo: today,
    transactionsRows: [
      { label: 'Total Sections:', value: String(sections.length), tone: 'default' },
      {
        label: 'Total Records:',
        value: String(sections.reduce((s, sec) => s + sec.rows.length, 0)),
        tone: 'teal',
      },
    ],
    financeRows:
      summary && summary.length > 0
        ? summary.map((s) => ({ label: `${s.label}:`, value: s.value, tone: 'positive' as const }))
        : [{ label: 'Summary Total:', value: firstVal, tone: 'positive' }],
    bannerLabel: summary?.[summary.length - 1]?.label || title,
    bannerValue: summary?.[summary.length - 1]?.value || firstVal,
    bannerPositive: true,
    sections: sections.map((s) => ({
      heading: s.heading.toUpperCase(),
      headers: s.headers,
      rows: s.rows,
    })),
  });
}
