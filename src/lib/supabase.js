// ============================================================
// ATELIER BY RICHARD — Supabase Client & Query Helpers
// ============================================================
// Environment variables (set in .env.local):
//   VITE_SUPABASE_URL
//   VITE_SUPABASE_ANON_KEY

import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.\n' +
    'Copy .env.example to .env.local and fill in your Supabase project values.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// ── Generic error handler ─────────────────────────────────

function handleError(error, context) {
  if (error) {
    console.error(`[supabase] ${context}:`, error.message);
    throw new Error(error.message);
  }
}

// ── PRODUCTS ──────────────────────────────────────────────

export async function fetchProducts(activeOnly = true) {
  const query = supabase
    .from('products')
    .select('*')
    .order('category')
    .order('name');

  if (activeOnly) query.eq('active', true);

  const { data, error } = await query;
  handleError(error, 'fetchProducts');
  return data;
}

export async function upsertProduct(product) {
  const { data, error } = await supabase
    .from('products')
    .upsert(product, { onConflict: 'id' })
    .select()
    .single();
  handleError(error, 'upsertProduct');
  return data;
}

export async function setProductActive(id, active) {
  const { data, error } = await supabase
    .from('products')
    .update({ active })
    .eq('id', id)
    .select()
    .single();
  handleError(error, 'setProductActive');
  return data;
}

// ── PIGS ──────────────────────────────────────────────────

export async function fetchPigs(limit = 50) {
  const { data, error } = await supabase
    .from('pigs')
    .select('*')
    .order('receiving_date', { ascending: false })
    .limit(limit);
  handleError(error, 'fetchPigs');
  return data;
}

export async function fetchPig(id) {
  const { data, error } = await supabase
    .from('pigs')
    .select('*, batches(*, products(*))')
    .eq('id', id)
    .single();
  handleError(error, 'fetchPig');
  return data;
}

export async function insertPig(pig) {
  const { data, error } = await supabase
    .from('pigs')
    .insert(pig)
    .select()
    .single();
  handleError(error, 'insertPig');
  return data;
}

export async function updatePig(id, updates) {
  const { data, error } = await supabase
    .from('pigs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  handleError(error, 'updatePig');
  return data;
}

/**
 * Number of product batches attached to a pig reception.
 * Used to guard deletion — a reception with batches shouldn't be deleted here.
 */
export async function countBatchesForPig(pigId) {
  const { count, error } = await supabase
    .from('batches')
    .select('id', { count: 'exact', head: true })
    .eq('pig_id', pigId);
  handleError(error, 'countBatchesForPig');
  return count || 0;
}

/**
 * Delete a pig reception. Caller should check countBatchesForPig first —
 * batches cascade-delete at the DB level (ON DELETE CASCADE), so this is
 * only safe to expose in the UI for receptions with zero batches.
 */
export async function deletePig(id) {
  const { error } = await supabase
    .from('pigs')
    .delete()
    .eq('id', id);
  handleError(error, 'deletePig');
}

// ── BATCHES ───────────────────────────────────────────────

/**
 * All batches with product info joined.
 * Optionally filter by status.
 */
export async function fetchBatches(statusFilter = null) {
  const query = supabase
    .from('batches')
    .select(`
      *,
      products (*),
      pigs (id, master_code, receiving_date, breed_name, prefix, gross_weight_kg)
    `)
    .order('ready_date', { ascending: true });

  if (statusFilter) {
    if (Array.isArray(statusFilter)) {
      query.in('status', statusFilter);
    } else {
      query.eq('status', statusFilter);
    }
  }

  const { data, error } = await query;
  handleError(error, 'fetchBatches');
  return data;
}

export async function fetchBatch(id) {
  const { data, error } = await supabase
    .from('batches')
    .select(`
      *,
      products (*),
      pigs (*),
      stock_movements (*),
      inventory_adjustments (*)
    `)
    .eq('id', id)
    .single();
  handleError(error, 'fetchBatch');
  return data;
}

export async function insertBatch(batch) {
  const { data, error } = await supabase
    .from('batches')
    .insert(batch)
    .select()
    .single();
  handleError(error, 'insertBatch');
  return data;
}

export async function updateBatch(id, updates) {
  const { data, error } = await supabase
    .from('batches')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  handleError(error, 'updateBatch');
  return data;
}

/**
 * Auto-increment sequence number for a product within a pig.
 * Returns the next available sequence number (1-based).
 */
export async function nextSequenceNum(pigId, productCode) {
  const { data, error } = await supabase
    .from('batches')
    .select('sequence_num')
    .eq('pig_id', pigId)
    .eq('product_code', productCode)
    .order('sequence_num', { ascending: false })
    .limit(1);
  handleError(error, 'nextSequenceNum');
  return data.length > 0 ? data[0].sequence_num + 1 : 1;
}

// ── STOCK MOVEMENTS ───────────────────────────────────────

/**
 * Fetch movements for a batch, or all recent movements.
 */
export async function fetchMovements(batchId = null, limit = 100) {
  const query = supabase
    .from('stock_movements')
    .select(`
      *,
      batches (
        batch_code, product_code, current_weight_kg, current_pieces,
        products (name, code)
      )
    `)
    .order('movement_date', { ascending: false })
    .limit(limit);

  if (batchId) query.eq('batch_id', batchId);

  const { data, error } = await query;
  handleError(error, 'fetchMovements');
  return data;
}

/**
 * Record a stock movement AND update batch current_weight_kg / current_pieces.
 */
export async function recordMovement(movement, batchUpdates) {
  // Insert the movement record
  const { data: movData, error: movError } = await supabase
    .from('stock_movements')
    .insert(movement)
    .select()
    .single();
  handleError(movError, 'recordMovement/insert');

  // Update the batch stock levels
  const { error: batchError } = await supabase
    .from('batches')
    .update(batchUpdates)
    .eq('id', movement.batch_id);
  handleError(batchError, 'recordMovement/updateBatch');

  return movData;
}

// ── INVENTORY ADJUSTMENTS ─────────────────────────────────

export async function fetchAdjustments(batchId = null, limit = 50) {
  const query = supabase
    .from('inventory_adjustments')
    .select(`*, batches (batch_code, products (name))`)
    .order('adjustment_date', { ascending: false })
    .limit(limit);

  if (batchId) query.eq('batch_id', batchId);

  const { data, error } = await query;
  handleError(error, 'fetchAdjustments');
  return data;
}

/**
 * Record an inventory adjustment AND update batch current levels.
 */
export async function recordAdjustment(adjustment, batch) {
  // Read current values as "previous"
  const adj = {
    ...adjustment,
    previous_weight_kg: batch.current_weight_kg,
    previous_pieces:    batch.current_pieces,
  };

  const { data: adjData, error: adjError } = await supabase
    .from('inventory_adjustments')
    .insert(adj)
    .select()
    .single();
  handleError(adjError, 'recordAdjustment/insert');

  // Patch batch
  const batchPatch = {};
  if (adj.new_weight_kg != null) batchPatch.current_weight_kg = adj.new_weight_kg;
  if (adj.new_pieces    != null) batchPatch.current_pieces    = adj.new_pieces;

  const { error: batchError } = await supabase
    .from('batches')
    .update(batchPatch)
    .eq('id', adjustment.batch_id);
  handleError(batchError, 'recordAdjustment/updateBatch');

  return adjData;
}

// ── DASHBOARD QUERIES ─────────────────────────────────────

/**
 * Batches that are ready for sale (ready_date ≤ today, status = 'maturing' or 'ready').
 */
export async function fetchReadyBatches() {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('batches')
    .select('*, products(*), pigs(master_code)')
    .lte('ready_date', today)
    .in('status', ['maturing', 'ready'])
    .order('ready_date', { ascending: true });
  handleError(error, 'fetchReadyBatches');
  return data;
}

/**
 * Batches maturing in the next N days.
 */
export async function fetchUpcomingBatches(withinDays = 14) {
  const today = new Date().toISOString().slice(0, 10);
  const until = new Date();
  until.setDate(until.getDate() + withinDays);
  const untilStr = until.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('batches')
    .select('*, products(*), pigs(master_code)')
    .gt('ready_date', today)
    .lte('ready_date', untilStr)
    .in('status', ['maturing'])
    .order('ready_date', { ascending: true });
  handleError(error, 'fetchUpcomingBatches');
  return data;
}

/**
 * Weekly movement summary: sales vs internal, grouped by product.
 * Uses the last 7 days.
 */
export async function fetchWeeklySummary() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const since = sevenDaysAgo.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('stock_movements')
    .select(`
      movement_type, customer_type, internal_sub_type,
      quantity_kg, quantity_pcs, movement_date,
      batches ( product_code, products (name, sales_price_idr) )
    `)
    .gte('movement_date', since)
    .order('movement_date', { ascending: false });
  handleError(error, 'fetchWeeklySummary');
  return data;
}
