import { useState } from 'react';
import { updateBatch, setBatchItemWeights, deleteBatch } from '../lib/supabase';
import {
  calcTotalDays, calcReadyDate, toISO, formatDate,
  isPieceTracked, usesStandardWeight,
} from '../lib/calculations';

/**
 * Correct a batch after it has been saved — weight, dates, notes.
 *
 * Piece counts are NOT edited here. For piece-tracked products the count
 * comes from the tracking numbers themselves, so use "Adjust numbers".
 * Editing it in two places would let the two disagree.
 */
export default function BatchEdit({ batch, product, onSaved, onCancel, onDeleted }) {
  const tracked  = isPieceTracked(product);
  const standard = usesStandardWeight(product);
  const pieces   = batch.pieces || 1;

  // Sausages are entered per piece; everything else as a batch total.
  const perPiece = standard && pieces > 0
    ? (Number(batch.cut_weight_kg) / pieces)
    : Number(batch.cut_weight_kg);

  const [form, setForm] = useState({
    cut_weight_kg: (perPiece || 0).toFixed(3),
    pieces:        pieces,
    start_date:    batch.start_date,
    notes:         batch.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    setError(null);
    setSaving(true);
    try {
      await deleteBatch(batch.id);
      onDeleted?.(batch.id);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const entered    = Number(form.cut_weight_kg) || 0;
  const pieceCount = tracked ? pieces : (Number(form.pieces) || 1);
  const totalKg    = standard ? entered * pieceCount : entered;

  const days      = product ? calcTotalDays(product, batch.dimension_cm, totalKg) : 0;
  const readyDate = form.start_date ? calcReadyDate(form.start_date, days) : null;

  async function save(e) {
    e.preventDefault();
    if (entered <= 0) { setError('Weight must be more than 0.'); return; }
    setError(null);
    setSaving(true);
    try {
      const updates = {
        cut_weight_kg: Number(totalKg.toFixed(3)),
        start_date:    form.start_date,
        ready_date:    readyDate ? toISO(readyDate) : null,
        notes:         form.notes || null,
      };
      // Untracked products keep their typed piece count and stock weight.
      if (!tracked) {
        updates.pieces            = pieceCount;
        updates.current_pieces    = pieceCount;
        updates.current_weight_kg = Number(totalKg.toFixed(3));
      }

      const saved = await updateBatch(batch.id, updates);

      // Whole muscle: the pieces have no standard weight, so they follow
      // the batch. The DB trigger then recalculates the stock weight.
      if (tracked && !standard) {
        await setBatchItemWeights(batch.id, Math.round((totalKg * 1000) / pieceCount));
      }

      onSaved?.({ ...batch, ...saved });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-3 space-y-3 rounded-lg border border-brand-200 bg-brand-50 p-4">
      <p className="text-sm font-semibold text-stone-800">Edit batch</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">
            {standard ? 'Cut weight per piece (kg)' : 'Cut weight (kg)'}
          </label>
          <input
            className="input" type="number" step="0.001" min="0.001"
            value={form.cut_weight_kg}
            onChange={e => set('cut_weight_kg', e.target.value)}
            required
          />
          {standard && entered > 0 && (
            <p className="mt-1 text-xs text-stone-500">
              {pieceCount} × {entered} kg = <strong>{totalKg.toFixed(3)} kg</strong> fresh
            </p>
          )}
        </div>

        <div>
          <label className="label">Number of pieces</label>
          {tracked ? (
            <div className="input flex items-center bg-stone-100 text-stone-500">
              {pieces}
              <span className="ml-2 text-xs">use Adjust numbers</span>
            </div>
          ) : (
            <input
              className="input" type="number" min="1"
              value={form.pieces}
              onChange={e => set('pieces', e.target.value)}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Start date</label>
          <input
            className="input" type="date"
            value={form.start_date}
            onChange={e => set('start_date', e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Ready on</label>
          <div className="input flex items-center bg-stone-100 text-stone-600">
            {readyDate ? formatDate(readyDate) : '—'}
            <span className="ml-2 text-xs text-stone-400">{days}d</span>
          </div>
        </div>
      </div>

      <div>
        <label className="label">Notes</label>
        <input className="input" value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={saving || confirming} className="btn-primary text-sm">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">
          Cancel
        </button>

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="ml-auto text-sm text-red-600 hover:underline"
          >
            Delete batch
          </button>
        ) : (
          <span className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-red-700">Delete and its {pieces} piece{pieces > 1 ? 's' : ''}?</span>
            <button
              type="button"
              onClick={remove}
              disabled={saving}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            >
              {saving ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-xs text-stone-600 hover:underline"
            >
              No
            </button>
          </span>
        )}
      </div>
    </form>
  );
}
