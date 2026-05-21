// ============================================================
// ATELIER BY RICHARD — Core Calculation Engine
// ============================================================

// ── Batch code generators ─────────────────────────────────

/**
 * Build the master pig code.
 * e.g.  "BH 94.6-20260302"
 */
export function pigCode(pig) {
  const prefix = pig.prefix || 'BH';
  const weight = Number(pig.gross_weight_kg).toFixed(1);
  const date = pig.receiving_date.replace(/-/g, '');   // "2026-03-02" → "20260302"
  return `${prefix} ${weight}-${date}`;
}

/**
 * Build a product batch code.
 * e.g.  "BH 94.6-20260302-SAU-01"
 */
export function batchCode(pig, productCode, sequenceNum) {
  const masterCode = pig.master_code || pigCode(pig);
  const seq = String(sequenceNum).padStart(2, '0');
  return `${masterCode}-${productCode}-${seq}`;
}

// ── Date helpers ──────────────────────────────────────────

/**
 * Format a Date or ISO string to "DD MMM YYYY" (e.g. "02 Mar 2026")
 */
export function formatDate(d) {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Add N calendar days to a Date or ISO string, return a Date.
 */
export function addDays(d, n) {
  const date = d instanceof Date ? new Date(d) : new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

/**
 * Difference in days between two dates (b − a), always an integer.
 */
export function daysBetween(a, b) {
  const msA = new Date(a).setHours(0, 0, 0, 0);
  const msB = new Date(b).setHours(0, 0, 0, 0);
  return Math.round((msB - msA) / 86_400_000);
}

/**
 * Today's date as a Date object (midnight local).
 */
export function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * ISO date string (YYYY-MM-DD) for any Date or ISO string.
 */
export function toISO(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 10);
}

// ── Cure & total duration calculations ────────────────────

/**
 * Equilibrium-cure duration based on cut geometry.
 *
 * Formula: ROUNDUP(dimension × 3.72, 0) days
 *   - Flat (ventrèche, guanciale, lardo, speck, bacon): dimension = avg thickness in cm
 *   - Round (coppa, lonzo, fiocco, culatello, ham): dimension = avg DIAMETER in cm
 *     → radius = diameter / 2 is used in the formula
 *   - Sausage: dimension = avg diameter in cm → radius used
 *   - Wet cure (jambon blanc): different formula — see calcTotalDays
 *   - No-cure products (nduja, bacon): returns 0
 *
 * @param {object} product  Row from products table
 * @param {number} dimension_cm  Avg thickness (flat) or avg diameter (round/sausage)
 * @returns {number} cure days (integer, ≥ 0)
 */
export function calcCureDays(product, dimension_cm) {
  if (!dimension_cm || dimension_cm <= 0) return 0;
  if (product.is_nduja || product.is_bacon || product.is_wet) return 0;

  const dim = Number(dimension_cm);

  if (product.category === 'flat') {
    // thickness in cm, formula applies directly
    return Math.ceil(dim * 3.72);
  }
  if (product.category === 'round' || product.category === 'sausage') {
    // radius = diameter / 2
    return Math.ceil((dim / 2) * 3.72);
  }
  return 0;
}

/**
 * Jambon Blanc wet-cure duration.
 * ROUNDUP(cut_weight_kg × 1.625, 0) days + 1 cooking day.
 */
export function calcWetCureDays(cutWeightKg) {
  return Math.ceil(Number(cutWeightKg) * 1.625) + 1;
}

/**
 * Total pipeline duration in calendar days, from Day 1 (start_date) to ready.
 *
 * Timeline stages (cumulative):
 *   1. Cure             calcCureDays(product, dim)
 *   2. Resting          2 days (round & flat) / 0 (sausage)
 *   3. Marinade         2 days if has_marinade (guanciale, coppa)
 *   4. Incubation       2 days if has_incubation (saucisson, pitina, finocchiona)
 *   5. Smoke            1 day  if has_smoke (speck, pitina)
 *   6. Drying           product.drying_days (from products table)
 *
 * Special paths:
 *   - is_nduja: 2 days total (melee → bulk stock)
 *   - is_bacon: slow cook + smoke = 3 days total (no drying)
 *   - is_wet:   calcWetCureDays(cutWeightKg) — jambon blanc only
 *
 * @param {object} product
 * @param {number} dimension_cm
 * @param {number} cutWeightKg  Only used for wet cure
 * @returns {number} total days
 */
export function calcTotalDays(product, dimension_cm, cutWeightKg) {
  if (product.is_nduja) return 2;
  if (product.is_bacon) return 3;
  if (product.is_wet)   return calcWetCureDays(cutWeightKg);

  const cure     = calcCureDays(product, dimension_cm);
  const resting  = (product.category === 'round' || product.category === 'flat') ? 2 : 0;
  const marinade = product.has_marinade ? 2 : 0;
  const incub    = product.has_incubation ? 2 : 0;
  const smoke    = product.has_smoke ? 1 : 0;
  const drying   = product.drying_days || 0;

  return cure + resting + marinade + incub + smoke + drying;
}

/**
 * Calculate the ready date given a start date and total days.
 * @param {string|Date} startDate
 * @param {number} totalDays
 * @returns {Date}
 */
export function calcReadyDate(startDate, totalDays) {
  return addDays(startDate, totalDays);
}

// ── Stage timeline builder ────────────────────────────────

/**
 * Build an ordered list of processing stages with start/end day offsets.
 * Useful for a visual timeline in the UI.
 *
 * Returns: [ { label, startDay, endDay, days } ]
 * startDay = 0 means "day processing begins"
 */
export function buildStages(product, dimension_cm, cutWeightKg) {
  const stages = [];
  let cursor = 0;

  const push = (label, days) => {
    if (days <= 0) return;
    stages.push({ label, startDay: cursor, endDay: cursor + days, days });
    cursor += days;
  };

  if (product.is_nduja) {
    push('Mélange & Mise en pot', 2);
    return stages;
  }

  if (product.is_bacon) {
    push('Cure sèche', 1);
    push('Cuisson lente', 1);
    push('Fumage', 1);
    return stages;
  }

  if (product.is_wet) {
    const wetDays = calcWetCureDays(cutWeightKg);
    push('Saumurage', wetDays - 1);
    push('Cuisson', 1);
    return stages;
  }

  // Standard dry-cured path
  const cure = calcCureDays(product, dimension_cm);
  push('Salage à sec', cure);

  if (product.category === 'round' || product.category === 'flat') {
    push('Repos', 2);
  }

  if (product.has_marinade) push('Marinade au vin rouge', 2);
  if (product.has_incubation) push('Incubation', 2);
  if (product.has_smoke) push('Fumage', 1);

  const drying = product.drying_days || 0;
  if (drying > 0) push('Séchage', drying);

  return stages;
}

// ── Batch status calculation ──────────────────────────────

/**
 * Given a batch and its product, compute live maturation status.
 *
 * @param {object} batch   Row from batches table (must have start_date, ready_date, status)
 * @param {object} product Row from products table
 * @returns {object} {
 *   elapsed,          // days elapsed since start
 *   remaining,        // days remaining until ready (0 if past)
 *   totalDays,        // total pipeline length
 *   pct,              // progress percentage (0–100)
 *   currentStage,     // label of the current stage
 *   readyDate,        // Date object
 *   isReady,          // boolean
 *   isOverdue,        // boolean (ready_date passed but status still 'maturing')
 *   daysOverdue,      // how many days past ready date
 * }
 */
export function calcBatchStatus(batch, product, dimension_cm) {
  const startDate = new Date(batch.start_date);
  const readyDate = batch.ready_date ? new Date(batch.ready_date) : null;
  const now = today();

  const totalDays = readyDate ? daysBetween(startDate, readyDate) : 0;
  const elapsed   = daysBetween(startDate, now);
  const remaining = readyDate ? Math.max(0, daysBetween(now, readyDate)) : null;
  const pct       = totalDays > 0 ? Math.min(100, Math.round((elapsed / totalDays) * 100)) : 0;

  const isReady   = readyDate ? now >= readyDate : false;
  const isOverdue = isReady && batch.status === 'maturing';
  const daysOverdue = isOverdue ? daysBetween(readyDate, now) : 0;

  // Determine current stage from dimension (if available)
  let currentStage = '—';
  if (dimension_cm && product) {
    const stages = buildStages(product, dimension_cm, batch.cut_weight_kg);
    const activeStage = stages.find(s => elapsed >= s.startDay && elapsed < s.endDay);
    currentStage = activeStage?.label ?? (isReady ? 'Prêt' : stages[stages.length - 1]?.label ?? '—');
  }

  return {
    elapsed,
    remaining,
    totalDays,
    pct,
    currentStage,
    readyDate,
    isReady,
    isOverdue,
    daysOverdue,
  };
}

// ── Stock helpers ─────────────────────────────────────────

/**
 * Apply a stock movement to a batch's current stock.
 * Returns { newWeightKg, newPieces }.
 */
export function applyMovement(batch, movement) {
  const newWeightKg = movement.quantity_kg
    ? Math.max(0, (batch.current_weight_kg || 0) - movement.quantity_kg)
    : batch.current_weight_kg;

  const newPieces = movement.quantity_pcs
    ? Math.max(0, (batch.current_pieces || 0) - movement.quantity_pcs)
    : batch.current_pieces;

  return { newWeightKg, newPieces };
}

/**
 * Stock value in IDR.
 * @param {number} weightKg
 * @param {number} pricePerKgIdr
 */
export function stockValue(weightKg, pricePerKgIdr) {
  return Math.round((weightKg || 0) * (pricePerKgIdr || 0));
}

/**
 * Format IDR currency  →  "Rp 1.250.000"
 */
export function formatIDR(amount) {
  if (amount == null || isNaN(amount)) return '—';
  return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

/**
 * Format kg weight  →  "12.5 kg"
 */
export function formatKg(kg) {
  if (kg == null) return '—';
  return `${Number(kg).toFixed(2)} kg`;
}
