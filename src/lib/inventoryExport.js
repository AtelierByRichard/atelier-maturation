// ============================================================
// ATELIER BY RICHARD — Live Inventory Count export
// ============================================================
// Downloads the physical-count workbook (public/templates/inventory-count-template.xlsx)
// with the "Count Sheet" tab filled from today's live active pieces,
// grouped by product with a green header band per product (same style as
// "Count Sheet (Pieces)"). One row = one physical item — a batch holding
// 5 pieces gets 5 lines, each with its own tracking number. Count Sheet's
// own Source line is refreshed with today's date and totals.
//
// Nothing else in the workbook is redesigned: Instructions, Count Sheet
// (Pieces) and Reconciliation's wording/formulas are left exactly as
// designed. The one necessary exception is Reconciliation's cross-sheet
// SUMIF/COUNTIF ranges, which are repointed at Count Sheet's real last row
// every time (its row count changes daily) — only the row-number half of
// those ranges is touched, never their shape or wording.

import { fetchActiveItems } from './supabase.js';
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
 * physical item underneath. One item = one line, with its own tracking
 * number, not one line per batch. The block is rebuilt to the exact size
 * needed every time, since stock changes day to day.
 */
function fillCountSheet(wb, items, now) {
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

  // Group live items by product code, in the Reconciliation tab's order;
  // any product code that isn't in that list is appended at the end so
  // nothing is silently dropped.
  const byCode = new Map();
  for (const it of items) {
    const code = it.batches?.products?.code || '—';
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(it);
  }
  const orderedCodes = [
    ...PRODUCT_ORDER.filter((c) => byCode.has(c)),
    ...[...byCode.keys()].filter((c) => !PRODUCT_ORDER.includes(c)).sort(),
  ];
  const groups = orderedCodes.map((code) => {
    const list = [...byCode.get(code)].sort((a, b) => (a.item_code || '').localeCompare(b.item_code || ''));
    return { code, name: list[0]?.batches?.products?.name || code, items: list };
  });

  const neededRows = groups.reduce((s, g) => s + 1 + g.items.length, 0);
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

    for (const it of group.items) {
      for (let c = 1; c <= 13; c++) applyStyle(ws.getCell(r, c), dataStyle[c]);
      ws.getRow(r).height = dataRowHeight;

      const batch = it.batches;
      const isReady = calcBatchStatus(batch, batch?.products, batch?.dimension_cm).isReady;
      ws.getCell(r, 1).value = batch?.products?.name || '';
      ws.getCell(r, 2).value = batch?.products?.code || '';
      ws.getCell(r, 3).value = it.item_code || '';

      const reception = parseDateOnly(it.pigs?.receiving_date);
      if (reception) {
        ws.getCell(r, 4).value = reception;
        ws.getCell(r, 4).numFmt = 'm/d/yyyy';
      }

      ws.getCell(r, 5).value = it.weight_g != null ? Number(it.weight_g) / 1000 : null;
      ws.getCell(r, 6).value = 1;
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
 * Builds the live workbook from an already-fetched items array and the
 * template's raw bytes. Kept separate from the fetch/download glue below
 * so it can be exercised with synthetic data.
 */
export async function buildInventoryCountWorkbook(templateBuffer, items, now = new Date()) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBuffer);

  const sorted = [...items].sort((a, b) => {
    const pa = a.batches?.products?.name || '';
    const pb = b.batches?.products?.name || '';
    if (pa !== pb) return pa.localeCompare(pb);
    return (a.item_code || '').localeCompare(b.item_code || '');
  });

  const pieceCount = sorted.length;
  const batchCount = new Set(sorted.map((it) => it.batch_id)).size;
  const totalKg    = sorted.reduce((s, it) => s + (it.weight_g != null ? Number(it.weight_g) / 1000 : 0), 0);
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

/** Fetches live items + the template, builds the workbook, and triggers a browser download. */
export async function downloadInventoryCount() {
  const now = new Date();
  const [items, templateResp] = await Promise.all([
    fetchActiveItems(),
    fetch(TEMPLATE_URL),
  ]);
  if (!templateResp.ok) throw new Error('Could not load the inventory count template.');
  if (!items || items.length === 0) {
    throw new Error('No active pieces were found — the Count Sheet would come out empty. Check your connection and try again.');
  }
  const templateBuffer = await templateResp.arrayBuffer();

  const wb = await buildInventoryCountWorkbook(templateBuffer, items, now);

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
