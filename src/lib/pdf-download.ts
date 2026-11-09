// Direct-download PDF generator (no print dialog) — reproduces the executive audit layout
import type { AuditReportConfig, AuditSummaryRow } from './export';

type RGB = [number, number, number];
const TEAL: RGB = [13, 148, 136];
const DARK: RGB = [15, 23, 42];
const SLATE: RGB = [71, 85, 105];
const MUTED: RGB = [100, 116, 139];
const BORDER: RGB = [203, 213, 225];
const BOX_BG: RGB = [248, 250, 252];
const GREEN: RGB = [22, 163, 74];
const RED: RGB = [220, 38, 38];

const toneRGB = (tone?: AuditSummaryRow['tone']): RGB =>
  tone === 'positive' ? GREEN : tone === 'negative' ? RED : tone === 'teal' ? TEAL : DARK;

function dmy(dateStr: string): string {
  if (!dateStr || dateStr.includes('/')) return dateStr || '';
  const p = dateStr.slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : dateStr;
}

function stamp(): string {
  const n = new Date();
  const z = (v: number) => String(v).padStart(2, '0');
  return `${z(n.getDate())}/${z(n.getMonth() + 1)}/${n.getFullYear()}, ${z(n.getHours())}:${z(n.getMinutes())}:${z(n.getSeconds())}`;
}

export function buildAuditFilename(config: AuditReportConfig): string {
  const code = (config.reportCode || 'REPORT')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  const d = new Date();
  const z = (v: number) => String(v).padStart(2, '0');
  return `LUCENTIA_${code}_${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}.pdf`;
}

export async function downloadAuditPDF(config: AuditReportConfig): Promise<void> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = autoTableMod.default;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 40;
  const contentW = pageW - M * 2;
  let y = M + 6;

  const company = config.companyName || 'LUCENTIA BEAUTY & SALON';
  const subtitle = config.systemSubtitle || 'Financial & Salon Operations Audit System';
  const status = config.statusText || 'GENERATED REPORT';

  // ---- Header ----------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...TEAL);
  doc.text(company, M, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(subtitle, M, y + 26);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...SLATE);
  doc.text(`Report: ${config.reportCode}`, pageW - M, y + 4, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(`Generated: ${stamp()}`, pageW - M, y + 16, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEAL);
  doc.text(`Status: ${status}`, pageW - M, y + 28, { align: 'right' });

  y += 40;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(1.2);
  doc.line(M, y, pageW - M, y);
  y += 22;

  // ---- Operational summary --------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text('OPERATIONAL SUMMARY', M, y);
  y += 12;

  const gap = 14;
  const boxW = (contentW - gap) / 2;
  const rowH = 14;
  const rowsMax = Math.max(config.transactionsRows.length, config.financeRows.length);
  const boxH = 30 + rowsMax * rowH;

  const drawBox = (x: number, title: string, rows: AuditSummaryRow[]) => {
    doc.setFillColor(...BOX_BG);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.8);
    doc.rect(x, y, boxW, boxH, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE);
    doc.text(title.toUpperCase(), x + 10, y + 16);
    rows.forEach((r, i) => {
      const ry = y + 32 + i * rowH;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...SLATE);
      doc.text(r.label, x + 10, ry);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...toneRGB(r.tone));
      doc.text(r.value, x + boxW - 10, ry, { align: 'right' });
    });
  };
  drawBox(M, config.transactionsBoxTitle || 'TRANSACTIONS', config.transactionsRows);
  drawBox(M + boxW + gap, config.financeBoxTitle || 'FINANCE', config.financeRows);
  y += boxH + 12;

  // ---- Banner ----------------------------------------------------------
  const positive = config.bannerPositive !== false;
  doc.setFillColor(...((positive ? [240, 253, 244] : [254, 242, 242]) as RGB));
  doc.setDrawColor(...((positive ? [134, 239, 172] : [252, 165, 165]) as RGB));
  doc.rect(M, y, contentW, 32, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(config.bannerLabel, M + 12, y + 20);
  doc.setFontSize(15);
  doc.setTextColor(...(positive ? GREEN : RED));
  doc.text(config.bannerValue, pageW - M - 12, y + 21, { align: 'right' });
  y += 48;

  // ---- Meta lines ------------------------------------------------------
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE);
  doc.text(`Period: ${dmy(config.periodFrom)} - ${dmy(config.periodTo)}`, M, y);
  y += 12;
  if (config.metaLine2) {
    const lines = doc.splitTextToSize(config.metaLine2, contentW);
    doc.text(lines, M, y);
    y += lines.length * 11;
  }
  if (config.footnote) {
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(config.footnote, contentW);
    doc.text(lines, M, y + 2);
    y += lines.length * 10 + 4;
  }
  y += 14;

  // ---- Ledger sections -------------------------------------------------
  for (const section of config.sections) {
    if (y > doc.internal.pageSize.getHeight() - 90) {
      doc.addPage();
      y = M;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text(section.heading, M, y);
    y += 8;

    const body =
      section.rows.length === 0
        ? [[{ content: 'No records recorded in this period', colSpan: section.headers.length, styles: { halign: 'center' as const, fontStyle: 'italic' as const, textColor: [148, 163, 184] as RGB } }]]
        : section.rows.map((row) =>
            row.map((cell) =>
              cell && typeof cell === 'object' && 'primary' in cell
                ? cell.secondary
                  ? `${cell.primary}\n${cell.secondary}`
                  : cell.primary
                : String(cell ?? ''),
            ),
          );

    autoTable(doc, {
      startY: y,
      head: [section.headers],
      body,
      margin: { left: M, right: M },
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 8, textColor: [51, 65, 85], cellPadding: { top: 6, bottom: 6, left: 6, right: 6 }, valign: 'top' },
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: 'bold', lineWidth: { bottom: 1.2 }, lineColor: BORDER },
      bodyStyles: { lineWidth: { bottom: 0.6 }, lineColor: BORDER },
      didParseCell: (data) => {
        const raw = data.cell.raw;
        if (data.section === 'body' && typeof raw === 'string') {
          if (/^(COMPLETED|PAID|RECEIVED|IN_STOCK|ACTIVE|DELIVERED)$/.test(raw)) data.cell.styles.textColor = GREEN;
          else if (/^(UNPAID|CANCELLED|OUT_OF_STOCK)$/.test(raw)) data.cell.styles.textColor = RED;
          else if (/^(PENDING_BALANCE|LOW_STOCK|DISCOUNTED)$/.test(raw)) data.cell.styles.textColor = [217, 119, 6];
        }
      },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y) + 26;
  }

  // ---- Footer page numbers --------------------------------------------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    const h = doc.internal.pageSize.getHeight();
    doc.text(`${company} — ${config.reportCode}`, M, h - 20);
    doc.text(`Page ${i} of ${pages}`, pageW - M, h - 20, { align: 'right' });
  }

  doc.save(buildAuditFilename(config));
}

