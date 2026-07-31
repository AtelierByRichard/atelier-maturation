import { useEffect, useState, useMemo } from 'react';
import { fetchItems, insertItems, deleteItem } from '../lib/supabase';
import {
  formatSequenceRanges, parseSequenceRanges, itemCode, splitAgainstUsed,
} from '../lib/calculations';

const pad = n => String(n).padStart(3, '0');

/**
 * The tracking numbers of one batch, with the ability to correct them
 * against a physical count: add numbers, remove numbers, use ranges
 * with gaps. Pieces already out of stock cannot be removed.
 */
export default function ItemWeights({ batch, product, pig }) {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [busy,    setBusy]    = useState(false);
  const [editing, setEditing] = useState(false);
  const [addText, setAddText] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchItems(batch.id)
      .then(rows => { if (!cancelled) setItems(rows || []); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [batch.id]);

  const inStock = items.filter(i => i.status === 'maturing' || i.status === 'ready');
  const gone    = items.filter(i => i.status === 'out');
  const lost    = items.filter(i => i.status === 'lost');

  const usedSet = useMemo(
    () => new Set(items.map(i => i.sequence_num)),
    [items]
  );

  const parsed = useMemo(() => parseSequenceRanges(addText), [addText]);
  const { fresh, clashes } = useMemo(
    () => splitAgainstUsed(addText.trim() ? parsed.numbers : [], usedSet),
    [parsed.numbers, usedSet, addText]
  );

  async function addPieces() {
    if (!fresh.length) return;
    setBusy(true); setError(null);
    try {
      const rows = fresh.map(n => ({
        batch_id:     batch.id,
        pig_id:       batch.pig_id,
        product_id:   batch.product_id,
        product_code: product.code,
        sequence_num: n,
        item_code:    itemCode(pig, product.code, n),
        weight_g:     product.target_weight_g ?? null,
        status:       'maturing',
        source:       'manual',
      }));
      const saved = await insertItems(rows);
      setItems(prev => [...prev, ...saved].sort((a, b) => a.sequence_num - b.sequence_num));
      setAddText('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removePiece(item) {
    setBusy(true); setError(null);
    try {
      await deleteItem(item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs text-stone-400">In stock ({inStock.length})</span>
        <button
          type="button"
          onClick={() => setEditing(v => !v)}
          className="text-xs underline text-stone-500 hover:text-stone-700"
        >
          {editing ? 'Done' : 'Adjust numbers'}
        </button>
      </div>

      {!editing ? (
        <p className="font-mono text-xs text-stone-700">
          {inStock.length ? formatSequenceRanges(inStock.map(i => i.sequence_num)) : '—'}
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {inStock.map(i => (
            <button
              key={i.id}
              type="button"
              disabled={busy}
              onClick={() => removePiece(i)}
              title="Remove this piece"
              className="rounded border border-stone-300 bg-white px-2 py-1 font-mono text-xs
                         text-stone-700 hover:border-red-400 hover:bg-red-50 hover:text-red-700"
            >
              {pad(i.sequence_num)} ×
            </button>
          ))}
          {!inStock.length && <span className="text-xs text-stone-400">No pieces yet.</span>}
        </div>
      )}

      {editing && (
        <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3">
          <label className="block text-xs font-medium text-stone-600">
            Add piece numbers as counted
          </label>
          <div className="flex gap-2">
            <input
              className="input font-mono flex-1"
              value={addText}
              onChange={e => setAddText(e.target.value)}
              placeholder="001-045, 067-120, 133"
            />
            <button
              type="button"
              onClick={addPieces}
              disabled={busy || !fresh.length || parsed.errors.length > 0}
              className="btn-primary shrink-0 text-sm disabled:opacity-40"
            >
              Add
            </button>
          </div>
          <p className="text-xs text-stone-500">
            Ranges and single numbers, separated by commas. Gaps are fine — enter only
            the pieces you actually have.
          </p>

          {parsed.errors.length > 0 && addText.trim() && (
            <ul className="space-y-1 rounded bg-red-50 p-2 text-xs text-red-700">
              {parsed.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          {clashes.length > 0 && (
            <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">
              Already exist, will be skipped:{' '}
              <span className="font-mono">{formatSequenceRanges(clashes)}</span>
            </p>
          )}
          {fresh.length > 0 && (
            <p className="rounded bg-emerald-50 p-2 text-xs text-emerald-900">
              Will add {fresh.length} piece{fresh.length === 1 ? '' : 's'}:{' '}
              <span className="font-mono">{formatSequenceRanges(fresh)}</span>
            </p>
          )}
          <p className="text-xs text-stone-500">
            Click a number above to remove it. Pieces already out of stock cannot be removed.
          </p>
        </div>
      )}

      {gone.length > 0 && (
        <div>
          <span className="text-xs text-stone-400">Out of stock ({gone.length})</span>
          <p className="font-mono text-xs text-stone-400">
            {formatSequenceRanges(gone.map(i => i.sequence_num))}
          </p>
        </div>
      )}

      {lost.length > 0 && (
        <div>
          <span className="text-xs text-stone-400">Lost / damaged ({lost.length})</span>
          <p className="font-mono text-xs text-stone-400">
            {formatSequenceRanges(lost.map(i => i.sequence_num))}
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
