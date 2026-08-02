import { useState } from 'react';
import { updatePigCascade } from '../lib/supabase';
import { pigCode } from '../lib/calculations';

/**
 * Correct a reception after it has been saved.
 *
 * Changing the weight or the date changes the master code, which is
 * embedded in every batch and piece code beneath it. Those are rewritten
 * automatically, so the codes never drift from the pig.
 */
export default function PigEdit({ pig, onSaved, onCancel }) {
  const [form, setForm] = useState({
    prefix:          pig.prefix || 'BH',
    breed_name:      pig.breed_name || '',
    gross_weight_kg: pig.gross_weight_kg ?? '',
    receiving_date:  pig.receiving_date,
    supplier:        pig.supplier || '',
    notes:           pig.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const isOpening = !!pig.is_opening_stock;

  // Opening stock keeps its counter; the code only changes with the date.
  const newCode = isOpening
    ? pig.master_code.replace(
        /\s\d{8}\s/,
        ` ${form.receiving_date.replace(/-/g, '')} `
      )
    : (form.gross_weight_kg && form.receiving_date
        ? pigCode({ ...form, gross_weight_kg: Number(form.gross_weight_kg) })
        : pig.master_code);

  const codeChanges = newCode !== pig.master_code;

  async function save(e) {
    e.preventDefault();
    if (!isOpening && !(Number(form.gross_weight_kg) > 0)) {
      setError('Gross weight must be more than 0.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const updates = {
        prefix:          form.prefix,
        breed_name:      form.breed_name,
        gross_weight_kg: isOpening ? null : Number(form.gross_weight_kg),
        receiving_date:  form.receiving_date,
        supplier:        form.supplier || null,
        notes:           form.notes || null,
        master_code:     newCode,
      };
      const saved = await updatePigCascade(pig.id, updates, pig.master_code, newCode);
      onSaved?.(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-4 space-y-3 rounded-lg border border-brand-200 bg-brand-50 p-4">
      <p className="text-sm font-semibold text-stone-800">Edit reception</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Breed prefix</label>
          <input className="input" value={form.prefix}
                 onChange={e => set('prefix', e.target.value)} required />
        </div>
        <div>
          <label className="label">Breed name</label>
          <input className="input" value={form.breed_name}
                 onChange={e => set('breed_name', e.target.value)} required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {!isOpening && (
          <div>
            <label className="label">Gross weight (kg)</label>
            <input
              className="input" type="number" step="0.01" min="1" max="500"
              value={form.gross_weight_kg}
              onChange={e => set('gross_weight_kg', e.target.value)}
              required
            />
          </div>
        )}
        <div>
          <label className="label">Reception date</label>
          <input
            className="input" type="date"
            value={form.receiving_date}
            onChange={e => set('receiving_date', e.target.value)}
            required
          />
        </div>
      </div>

      <div>
        <label className="label">Supplier</label>
        <input className="input" value={form.supplier}
               onChange={e => set('supplier', e.target.value)} />
      </div>

      <div>
        <label className="label">Notes</label>
        <input className="input" value={form.notes}
               onChange={e => set('notes', e.target.value)} />
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">
          Master code
        </p>
        <p className="font-mono text-sm font-bold text-stone-800">{newCode}</p>
        {codeChanges && (
          <p className="mt-2 text-xs text-amber-700">
            The code changes from <span className="font-mono">{pig.master_code}</span>.
            Every batch and piece code underneath will be rewritten to match.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary text-sm">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
