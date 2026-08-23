// ============================================================
// ATELIER BY RICHARD — Live Inventory Count export
// ============================================================
// Downloads the physical-count workbook (public/templates/inventory-count-template.xlsx)
// with the "Count Sheet" tab filled from today's live active batches, and
// every "Source: ..." line refreshed with today's date and totals.
//
// The template's tabs, columns, colours, formulas and dropdowns are never
// redesigned here — only live numbers are written into the cells the
// template already reserves for them. If there are more active batches
// than the template currently has rows for, new rows are inserted with
// the same style/formula/dropdown as the existing ones, and the TOTAL row
// plus the Reconciliation tab's cross-sheet ranges are extended to match.

import { fetchBatches } from './supabase.js';
import { calcBatchStatus } from './calculations.js';

const TEMPLATE_URL = '/templates/inventory-count-template.xlsx';

const MONTHS_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function dateFull(d)  { return `${d.getDate()} ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`; }
function dateShort(d) { return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`; }

// Supabase returns DATE columns as 'YYYY-MM-DD' strings. ExcelJS serializes
// Date objects using their absolute UTC instant, not local wall-clock time —
// so the Date we hand it must represent midnight UTC on that calendar day,
// or the written cell can show the previous day once opened in Excel.
function parseDateOnly(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function findRowByLabel(ws, col, label, startRow = 1, maxScan = 2000) {
  for (let r = startRow; r <= startRow + maxScan; r++) {
    if (ws.getCell(r, col).value === label) return r;
  }
  throw new Error(`"${label}" row not found in column ${col} of sheet "${ws.name}"`);
}

function cloneStyle(cell) {
  return JSON.parse(JSON.stringify({
    font: cell.font,
    fill: cell.fill,
    border: cell.border,
    alignment: cell.alignment,
    numFmt: cell.numFmt,
  }));
}

function applyStyle(cell, style) {
  cell.font = style.font;
  cell.fill = style.fill;
  cell.border = style.border;
  cell.alignment = style.alignment;
  cell.numFmt = style.numFmt;
}

/**
 * Fills "Count Sheet" with one row per live active batch. Grows the block
 * (and reports how many rows it grew by) if there are more batches than
 * the template reserves.
 */
function fillCountSheet(wb, batches, now) {
  const ws = wb.getWorksheet('Count Sheet');
  const FIRST_ROW = 5;
  const TOTAL_LABEL_COL = 4; // "Reception" column also holds the TOTAL label, per the original design
  const STYLE_TEMPLATE_ROW = FIRST_ROW;

  const originalTotalRow = findRowByLabel(ws, TOTAL_LABEL_COL, 'TOTAL', FIRST_ROW);
  const originalCapacity = originalTotalRow - FIRST_ROW;

  let totalRow = originalTotalRow;
  let grownBy = 0;

  if (batches.length > originalCapacity) {
    grownBy = batches.length - originalCapacity;

    const style = {};
    for (let c = 1; c <= 13; c++) style[c] = cloneStyle(ws.getCell(STYLE_TEMPLATE_ROW, c));
    const rowHeight = ws.getRow(STYLE_TEMPLATE_ROW).height;
    const reasonValidation = ws.getCell(`L${FIRST_ROW}`).dataValidation;

    const blankRow = new Array(13).fill(null);
    ws.spliceRows(originalTotalRow, 0, ...new Array(grownBy).fill(blankRow));

    for (let i = 0; i < grownBy; i++) {
      const r = originalTotalRow + i;
      for (let c = 1; c <= 13; c++) applyStyle(ws.getCell(r, c), style[c]);
      ws.getRow(r).height = rowHeight;
      ws.getCell(r, 10).value = { formula: `IF(H${r}="","",ROUND(H${r}-E${r},2))` };
      ws.getCell(r, 11).value = { formula: `IF(I${r}="","",I${r}-F${r})` };
      if (reasonValidation) ws.getCell(r, 12).dataValidation = { ...reasonValidation };
    }

    totalRow = originalTotalRow + grownBy;
    const lastDataRow = totalRow - 1;
    ws.getCell(totalRow, 5).value  = { formula: `SUM(E5:E${lastDataRow})` };
    ws.getCell(totalRow, 6).value  = { formula: `SUM(F5:F${lastDataRow})` };
    ws.getCell(totalRow, 8).value  = { formula: `SUM(H5:H${lastDataRow})` };
    ws.getCell(totalRow, 9).value  = { formula: `SUM(I5:I${lastDataRow})` };
    ws.getCell(totalRow, 10).value = { formula: `SUM(J5:J${lastDataRow})` };
    ws.getCell(totalRow, 11).value = { formula: `SUM(K5:K${lastDataRow})` };
  }

  batches.forEach((b, i) => {
    const r = FIRST_ROW + i;
    const product = b.products;
    const isReady = calcBatchStatus(b, product, b.dimension_cm).isReady;

    ws.getCell(r, 1).value = product?.name || '';
    ws.getCell(r, 2).value = product?.code || '';
    ws.getCell(r, 3).value = b.batch_code || '';

    const reception = parseDateOnly(b.pigs?.receiving_date);
    if (reception) {
      ws.getCell(r, 4).value = reception;
      ws.getCell(r, 4).numFmt = 'm/d/yyyy';
    }

    ws.getCell(r, 5).value = b.current_weight_kg != null ? Number(b.current_weight_kg) : null;
    ws.getCell(r, 6).value = b.current_pieces != null ? b.current_pieces : null;
    ws.getCell(r, 7).value = isReady ? 'Ready' : 'In maturation';
    // H, I (Counted kg / pcs), L (Reason), M (Notes) are left blank for the counter to fill.
    // J, K (Var kg / pcs) already carry the template's per-row formula.
  });

  return { totalRow, grownBy, originalCapacity };
}

/** Extends Reconciliation's 'Count Sheet'!$X$5:$X$160-style ranges to the new last data row. */
function growReconciliationRanges(wb, newLastDataRow, originalCapacity) {
  const ws = wb.getWorksheet('Reconciliation');
  const originalLastRow = originalCapacity + 4; // FIRST_ROW - 1 + originalCapacity
  const pattern = new RegExp(`(\\$[A-Z]\\$5:\\$[A-Z]\\$)${originalLastRow}`, 'g');

  ws.eachRow((row) => {
    row.eachCell((cell) => {
      if (cell.value && typeof cell.value === 'object' && cell.value.formula) {
        cell.value = { formula: cell.value.formula.replace(pattern, `$1${newLastDataRow}`) };
      } else if (typeof cell.value === 'string' && cell.value.startsWith('=')) {
        cell.value = cell.value.replace(pattern, `$1${newLastDataRow}`);
      }
    });
  });
}

/**
 * Builds the live workbook from an already-fetched batches array and the
 * template's raw bytes. Kept separate from the fetch/download glue below
 * so it can be exercised with synthetic data.
 */
export async function buildInventoryCountWorkbook(templateBuffer, batches, now = new Date()) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBuffer);

  const sorted = [...batches].sort((a, b) => {
    const pa = a.products?.name || '';
    const pb = b.products?.name || '';
    if (pa !== pb) return pa.localeCompare(pb);
    return (a.batch_code || '').localeCompare(b.batch_code || '');
  });

  const batchCount = sorted.length;
  const pieceCount = sorted.reduce((s, b) => s + (b.current_pieces || 0), 0);
  const totalKg    = sorted.reduce((s, b) => s + (Number(b.current_weight_kg) || 0), 0);
  const totalKgStr = totalKg.toFixed(1);

  const { totalRow, grownBy, originalCapacity } = fillCountSheet(wb, sorted, now);
  if (grownBy > 0) {
    growReconciliationRanges(wb, totalRow - 1, originalCapacity);
  }

  // Source lines (Instructions, Count Sheet, Count Sheet (Pieces))
  const full  = dateFull(now);
  const short = dateShort(now);

  wb.getWorksheet('Instructions').getCell('A2').value =
    `Source: Maturation Stock Report, ${full} (${batchCount} active batches, ${totalKgStr} kg)`;

  wb.getWorksheet('Count Sheet').getCell('A2').value =
    `Count date: ____________     Counted by: ____________     Source: Maturation Stock Report ${short}`;

  const pieces = wb.getWorksheet('Count Sheet (Pieces)');
  if (pieces) {
    pieces.getCell('A2').value =
      `Count date: ____________     Counted by: ____________     Source: Maturation Stock Report ${short} (${batchCount} batches · ${pieceCount} pieces · ${totalKgStr} kg)`;
  }

  const recon = wb.getWorksheet('Reconciliation');
  if (recon) {
    // The footer sentence is the only cell that starts with this fixed prefix.
    recon.eachRow((row) => {
      const cell = row.getCell(1);
      if (typeof cell.value === 'string' && cell.value.startsWith('System figures are from the Maturation Stock Report')) {
        cell.value = `System figures are from the Maturation Stock Report exported ${full} (${batchCount} active batches, ${totalKgStr} kg).`;
      }
    });
  }

  return wb;
}

/** Fetches live batches + the template, builds the workbook, and triggers a browser download. */
export async function downloadInventoryCount() {
  const now = new Date();
  const [batches, templateResp] = await Promise.all([
    fetchBatches(['maturing', 'ready']),
    fetch(TEMPLATE_URL),
  ]);
  if (!templateResp.ok) throw new Error('Could not load the inventory count template.');
  const templateBuffer = await templateResp.arrayBuffer();

  const wb = await buildInventoryCountWorkbook(templateBuffer, batches, now);

  const outBuffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const dateStr = now.toISOString().slice(0, 10);
  const fileName = `Atelier_Inventory_Count_${dateStr}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
