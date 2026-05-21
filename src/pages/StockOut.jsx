import { useEffect, useState } from 'react';
import { fetchBatches, recordMovement, recordAdjustment } from '../lib/supabase.js';
import { formatDate, formatKg, applyMovement, today, toISO } from '../lib/calculations.js';

const TABS = [
  { key: 'sale',       label: 'Sale' },
  { key: 'internal',   label: 'Internal use' },
  { key: 'adjustment', label: 'Stock adjustment' },
];

function MovementForm({ type, batches, onSaved }) {
  const todayStr = toISO(today());

  const [form, setForm] = useState({
    batch_id:          '',
    customer_type:     'b2c',
    internal_sub_type: 'board',
    quantity_kg:       '',
    quantity_pcs:      '',
    movement_date:     todayStr,
    notes:             '',
  });

  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState(null);
  const [success, setSuccess] = useState(false);

  const selectedBatch = batches.find(b => b.id === form.batch_id);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.quantity_kg && !form.quantity_pcs) {
      setError('Please enter a weight or number of pieces.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const movement = {
        batch_id:      form.batch_id,
        movement_type: type,
        movement_date: form.movement_date,
        notes:         form.notes || null,
        quantity_kg:   form.quantity_kg  ? Number(form.quantity_kg)  : null,
        quantity_pcs:  form.quantity_pcs ? Number(form.quantity_pcs) : null,
      };

      if (type === 'sale') {
        movement.customer_type = form.customer_type;
      } else {
        movement.internal_sub_type = form.internal_sub_type;
      }

      const { newWeightKg, newPieces } = applyMovement(selectedBatch, movement);
      const batchUpdates = {
        current_weight_kg: newWeightKg,
        current_pieces:    newPieces,
        status: (newWeightKg <= 0 && newPieces <= 0) ? 'depleted' : selectedBatch.status,
      };

      await recordMovement(movement, batchUpdates);
      setSuccess(true);
      setForm(prev => ({ ...prev, batch_id: '', quantity_kg: '', quantity_pcs: '', notes: '' }));
      setTimeout(() => setSuccess(false), 3000);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const availableBatches = batches.filter(b => b.status !== 'depleted' && b.status !== 'discarded');

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-3 text-sm font-medium">
          ✓ Stock out recorded successfully
        </div>
      )}

      <div>
        <label className="label">Batch</label>
        <select className="input" value={form.batch_id} onChange={e => set('batch_id', e.target.value)} required>
          <option value="">— Select a batch —</option>
          {availableBatches.map(b => (
            <option key={b.id} value={b.id}>
              {b.products?.name} — {b.batch_code} — {formatKg(b.current_weight_kg)}
            </option>
          ))}
        </select>
        {selectedBatch && (
          <div className="mt-1.5 flex gap-4 text-xs text-stone-500">
            <span>Stock: {formatKg(selectedBatch.current_weight_kg)}</span>
            {selectedBatch.current_pieces != null && <span>{selectedBatch.current_pieces} pcs</span>}
            <span>Ready: {formatDate(selectedBatch.ready_date)}</span>
          </div>
        )}
      </div>

      {type === 'sale' && (
        <div>
          <label className="label">Customer type</label>
          <div className="flex gap-3">
            {[{ v: 'b2c', label: 'B2C (individual)' }, { v: 'b2b', label: 'B2B (business)' }].map(opt => (
              <label key={opt.v} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio" name="customer_type" value={opt.v}
                  checked={form.customer_type === opt.v}
                  onChange={() => set('customer_type', opt.v)}
                  className="accent-brand-600"
                />
                <span className="text-sm text-stone-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {type === 'internal' && (
        <div>
          <label className="label">Purpose</label>
          <div className="flex gap-3 flex-wrap">
            {[
              { v: 'board',   label: 'Charcuterie board' },
              { v: 'tasting', label: 'Tasting' },
              { v: 'promo',   label: 'Promo event' },
            ].map(opt => (
              <label key={opt.v} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio" name="internal_sub_type" value={opt.v}
                  checked={form.internal_sub_type === opt.v}
                  onChange={() => set('internal_sub_type', opt.v)}
                  className="accent-brand-600"
                />
                <span className="text-sm text-stone-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Quantity (kg)</label>
          <input
            className="input" type="number" step="0.01" min="0"
            value={form.quantity_kg}
            onChange={e => set('quantity_kg', e.target.value)}
            placeholder="e.g. 1.25"
          />
        </div>
        <div>
          <label className="label">Quantity (pieces)</label>
          <input
            className="input" type="number" min="0"
            value={form.quantity_pcs}
            onChange={e => set('quantity_pcs', e.target.value)}
            placeholder="e.g. 2"
          />
        </div>
      </div>

      <div>
        <label className="label">Date</label>
        <input
          className="input" type="date"
          value={form.movement_date}
          onChange={e => set('movement_date', e.target.value)}
          required
        />
      </div>

      <div>
        <label className="label">Notes (optional)</label>
        <input className="input" value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={saving || !form.batch_id} className="btn-primary w-full">
        {saving ? 'Saving…' : type === 'sale' ? 'Record sale' : 'Record internal use'}
      </button>
    </form>
  );
}

function AdjustmentForm({ batches, onSaved }) {
  const todayStr = toISO(today());

  const [form, setForm] = useState({
    batch_id:        '',
    new_weight_kg:   '',
    new_pieces:      '',
    reason:          'count_error',
    notes:           '',
    adjustment_date: todayStr,
  });

  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState(null);
  const [success, setSuccess] = useState(false);

  const selectedBatch = batches.find(b => b.id === form.batch_id);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.new_weight_kg && !form.new_pieces) {
      setError('Please enter the actual new value (weight or pieces).');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const adj = {
        batch_id:        form.batch_id,
        new_weight_kg:   form.new_weight_kg ? Number(form.new_weight_kg) : null,
        new_pieces:      form.new_pieces    ? Number(form.new_pieces)    : null,
        reason:          form.reason,
        notes:           form.notes || null,
        adjustment_date: form.adjustment_date,
      };
      await recordAdjustment(adj, selectedBatch);
      setSuccess(true);
      setForm(prev => ({ ...prev, batch_id: '', new_weight_kg: '', new_pieces: '', notes: '' }));
      setTimeout(() => setSuccess(false), 3000);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const activeBatches = batches.filter(b => b.status !== 'depleted' && b.status !== 'discarded');

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-3 text-sm font-medium">
          ✓ Adjustment recorded
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
        <p className="font-semibold mb-0.5">Manual stock correction</p>
        <p>Use this when the physical count no longer matches the system (counting error, loss, damage).</p>
      </div>

      <div>
        <label className="label">Batch</label>
        <select className="input" value={form.batch_id} onChange={e => set('batch_id', e.target.value)} required>
          <option value="">— Select a batch —</option>
          {activeBatches.map(b => (
            <option key={b.id} value={b.id}>
              {b.products?.name} — {b.batch_code}
            </option>
          ))}
        </select>
        {selectedBatch && (
          <div className="mt-1.5 text-xs text-stone-500 flex gap-4">
            <span>System: {formatKg(selectedBatch.current_weight_kg)}</span>
            {selectedBatch.current_pieces != null && <span>{selectedBatch.current_pieces} pcs</span>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Actual weight (kg)</label>
          <input
            className="input" type="number" step="0.01" min="0"
            value={form.new_weight_kg}
            onChange={e => set('new_weight_kg', e.target.value)}
            placeholder={selectedBatch ? String(selectedBatch.current_weight_kg || '') : ''}
          />
        </div>
        <div>
          <label className="label">Actual pieces</label>
          <input
            className="input" type="number" min="0"
            value={form.new_pieces}
            onChange={e => set('new_pieces', e.target.value)}
            placeholder={selectedBatch ? String(selectedBatch.current_pieces || '') : ''}
          />
        </div>
      </div>

      <div>
        <label className="label">Reason</label>
        <select className="input" value={form.reason} onChange={e => set('reason', e.target.value)}>
          <option value="count_error">Counting error</option>
          <option value="damage">Damage / spoilage</option>
          <option value="loss">Loss (theft, breakage)</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div>
        <label className="label">Date</label>
        <input
          className="input" type="date"
          value={form.adjustment_date}
          onChange={e => set('adjustment_date', e.target.value)}
        />
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={saving || !form.batch_id} className="btn-primary w-full">
        {saving ? 'Saving…' : 'Correct stock'}
      </button>
    </form>
  );
}

export default function StockOut() {
  const [tab,     setTab]     = useState('sale');
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  async function loadBatches() {
    try {
      const data = await fetchBatches(['maturing', 'ready']);
      setBatches(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadBatches(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" />
    </div>
  );

  if (error) return (
    <div className="card p-6 border border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-stone-900">Stock Out</h2>
        <p className="text-sm text-stone-500 mt-1">Sales, internal use, and stock corrections</p>
      </div>

      <div className="flex border-b border-stone-200">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card p-5">
        {tab === 'sale'       && <MovementForm type="sale"     batches={batches} onSaved={loadBatches} />}
        {tab === 'internal'   && <MovementForm type="internal" batches={batches} onSaved={loadBatches} />}
        {tab === 'adjustment' && <AdjustmentForm batches={batches} onSaved={loadBatches} />}
      </div>
    </div>
  );
}
