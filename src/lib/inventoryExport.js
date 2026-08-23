// ============================================================
// ATELIER BY RICHARD — Live Inventory Count export
// ============================================================
// Downloads the physical-count workbook (public/templates/inventory-count-template.xlsx)
// with the "Count Sheet" tab filled from today's live active batches,
// grouped by product with a green header band per product (same style as
// "Count Sheet (Pieces)"), one row per batch underneath. Count Sheet's own
// Source line is refreshed with today's date and totals.
//
// Nothing else in the workbook is redesigned: Instructions, Count Sheet
// (Pieces) and Reconciliation's wording/formulas are left exactly as
// designed. The one necessary exception is Reconciliation's cross-sheet
// SUMIF/COUNTIF ranges, which are repointed at Count Sheet's real last row
// every time (its row count changes daily) — only the row-number half of
// those ranges is touched, never their shape or wording.

import { fetchBatches } from './supabase.js';
import { calcBatchStatus } from './calculations.js';

const TEMPLATE_URL = '/templates/inventory-count-template.xlsx';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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

// ExcelJS shares internal style objects across cells when you assign
// cell.font / cell.fill / etc. as separate property writes — a later cell's
// style can silently overwrite an earlier cell's, even with unrelated plain
// objects. Assigning the whole style in one `cell.style =` call avoids it.
function applyStyle(cell, style) {
  cell.style = {
    font: style.font,
    fill: style.fill,
    border: style.border,
    alignment: style.alignment,
    numFmt: style.numFmt,
  };
}

// Same product order Reconciliation already lists them in, so Count Sheet's
// grouping reads the same way as every other tab in the workbook.
const PRODUCT_ORDER = [
  'BBQ', 'BER', 'CHP', 'CHC', 'COP', 'CUL', 'FIC',
  'GUA', 'LON', 'PIT', 'SAU', 'BAC', 'TYR', 'VEN',
];

/**
 * Fills "Count Sheet" grouped by product — a green header band per product
 * (matching "Count Sheet (Pieces)"'s banner style) with one row per live
 * active batch under it. The block is rebuilt to the exact size needed
 * every time, since which products have stock changes day to day.
 */
function fillCountSheet(wb, batches, now) {
  const ws = wb.getWorksheet('Count Sheet');
  const piecesWs = wb.getWorksheet('Count Sheet (Pieces)');
  const FIRST_ROW = 5;
  const TOTAL_LABEL_COL = 4; // "Reception" column also holds the TOTAL label, per the original design

  const originalTotalRow = findRowByLabel(ws, TOTAL_LABEL_COL, 'TOTAL', FIRST_ROW);

  // Capture styles from the pristine template before any row is touched.
  const dataStyle = {};
  for (let c = 1; c <= 13; c++) dataStyle[c] = cloneStyle(ws.getCell(FIRST_ROW, c));
  const dataRowHeight = ws.getRow(FIRST_ROW).height;
  const reasonValidation = ws.getCell(`L${FIRST_ROW}`).dataValidation;

  const headerStyle = {};
  for (let c = 1; c <= 13; c++) headerStyle[c] = cloneStyle(piecesWs.getCell(FIRST_ROW, c));
  const headerRowHeight = piecesWs.getRow(FIRST_ROW).height;

  // Group live batches by product code, in the Reconciliation tab's order;
  // any product code that isn't in that list is appended at the end so
  // nothing is silently dropped.
  const byCode = new Map();
  for (const b of batches) {
    const code = b.products?.code || '—';
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(b);
  }
  const orderedCodes = [
    ...PRODUCT_ORDER.filter((c) => byCode.has(c)),
    ...[...byCode.keys()].filter((c) => !PRODUCT_ORDER.includes(c)).sort(),
  ];
  const groups = orderedCodes.map((code) => {
    const list = [...byCode.get(code)].sort((a, b) => (a.batch_code || '').localeCompare(b.batch_code || ''));
    return { code, name: list[0]?.products?.name || code, batches: list };
  });

  const neededRows = groups.reduce((s, g) => s + 1 + g.batches.length, 0);
  const delta = neededRows - (originalTotalRow - FIRST_ROW);

  if (delta > 0) {
    ws.spliceRows(originalTotalRow, 0, ...new Array(delta).fill(new Array(13).fill(null)));
  } else if (delta < 0) {
    ws.spliceRows(originalTotalRow + delta, -delta);
  }
  const totalRow = originalTotalRow + delta;

  let r = FIRST_ROW;
  for (const group of groups) {
    for (let c = 1; c <= 13; c++) applyStyle(ws.getCell(r, c), headerStyle[c]);
    ws.getRow(r).height = headerRowHeight;
    ws.getCell(r, 1).value = `${group.name}  (${group.code})`;
    r += 1;

    for (const b of group.batches) {
      for (let c = 1; c <= 13; c++) applyStyle(ws.getCell(r, c), dataStyle[c]);
      ws.getRow(r).height = dataRowHeight;

      const isReady = calcBatchStatus(b, b.products, b.dimension_cm).isReady;
      ws.getCell(r, 1).value = b.products?.name || '';
      ws.getCell(r, 2).value = b.products?.code || '';
      ws.getCell(r, 3).value = b.batch_code || '';

      const reception = parseDateOnly(b.pigs?.receiving_date);
      if (reception) {
        ws.getCell(r, 4).value = reception;
        ws.getCell(r, 4).numFmt = 'm/d/yyyy';
      }

      ws.getCell(r, 5).value = b.current_weight_kg != null ? Number(b.current_weight_kg) : null;
      ws.getCell(r, 6).value = b.current_pieces != null ? b.current_pieces : null;
      ws.getCell(r, 7).value = isReady ? 'Ready' : 'In maturation';
      // H, I (Counted kg / pcs), L (Reason), M (Notes) stay blank for the counter to fill.
      ws.getCell(r, 10).value = { formula: `IF(H${r}="","",ROUND(H${r}-E${r},2))` };
      ws.getCell(r, 11).value = { formula: `IF(I${r}="","",I${r}-F${r})` };
      if (reasonValidation) ws.getCell(r, 12).dataValidation = { ...reasonValidation };
      r += 1;
    }
  }

  const lastDataRow = totalRow - 1;
  ws.getCell(totalRow, 5).value  = { formula: `SUM(E5:E${lastDataRow})` };
  ws.getCell(totalRow, 6).value  = { formula: `SUM(F5:F${lastDataRow})` };
  ws.getCell(totalRow, 8).value  = { formula: `SUM(H5:H${lastDataRow})` };
  ws.getCell(totalRow, 9).value  = { formula: `SUM(I5:I${lastDataRow})` };
  ws.getCell(totalRow, 10).value = { formula: `SUM(J5:J${lastDataRow})` };
  ws.getCell(totalRow, 11).value = { formula: `SUM(K5:K${lastDataRow})` };
  ws.getCell(totalRow, 4).value  = 'TOTAL';

  return { totalRow, lastDataRow, originalTotalRow };
}

/**
 * Count Sheet's row count changes every download (products come and go,
 * header bands are inserted), so Reconciliation's 'Count Sheet'!$X$5:$X$160
 * ranges must be repointed at the real last data row every time or its
 * totals would quietly miss rows. This only ever rewrites the row-number
 * half of those ranges — none of Reconciliation's labels, formulas'
 * shape, or layout change.
 */
function retargetReconciliationRanges(wb, originalLastRow, newLastDataRow) {
  if (originalLastRow === newLastDataRow) return;
  const ws = wb.getWorksheet('Reconciliation');
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

  const { lastDataRow, originalTotalRow } = fillCountSheet(wb, sorted, now);
  retargetReconciliationRanges(wb, originalTotalRow - 1, lastDataRow);

  // Only Count Sheet's own Source line is refreshed — every other tab
  // (Instructions, Count Sheet (Pieces), Reconciliation's wording) is left
  // exactly as designed.
  const short = dateShort(now);
  wb.getWorksheet('Count Sheet').getCell('A2').value =
    `Count date: ____________     Counted by: ____________     Source: Maturation Stock Report ${short} (${batchCount} batches · ${pieceCount} pieces · ${totalKgStr} kg)`;

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
  if (!batches || batches.length === 0) {
    throw new Error('No active batches were found — the Count Sheet would come out empty. Check your connection and try again.');
  }
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
