import { useState, useEffect, useMemo } from 'react';
import { fetchItems } from '../lib/supabase';
import { parseSequenceRanges, formatSequenceRanges } from '../lib/calculations';

const pad = n => String(n).padStart(3, '0');

/**
 * Choose which physical pieces are leaving stock.
 *
 * Two ways to pick, because both happen in real life:
 *   - type a range   "001-012"    — fast when you take a run off the rack
 *   - tap the pieces               — when the ones you took are scattered
 *
 * The weight is worked out from the pieces, never typed.
 * Calls onChange({ ids, numbers, kg, valid }).
 */
export default function PieceSelect({ batch, onChange, requireWeight = true }) {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [picker,  setPicker]  = useState('range');
  const [text,    setText]    = useState('');
  const [tapped,  setTapped]  = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setText('');
    setTapped(new Set());
    fetchItems(batch.id)
      .then(rows => { if (!cancelled) setItems(rows || []); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [batch.id]);

  // Only pieces still physically in stock can go out.
  const available = useMemo(
    () => items.filter(i => i.status === 'maturing' || i.status === 'ready'),
    [items]
  );
  const availableBySeq = useMemo(
    () => new Map(available.map(i => [i.sequence_num, i])),
    [available]
  );

  // ── Resolve the selection ───────────────────────────────
  const { chosen, problems } = useMemo(() => {
    if (picker === 'tap') {
      return { chosen: available.filter(i => tapped.has(i.id)), problems: [] };
    }
    if (!text.trim()) return { chosen: [], problems: [] };

    const { numbers, errors } = parseSequenceRanges(text);
    const problems = [...errors];
    const chosen = [];
    const missing = [];

    for (const n of numbers) {
      const item = availableBySeq.get(n);
      if (item) chosen.push(item);
      else missing.push(n);
    }
    if (missing.length) {
      problems.push(
        `Not in stock: ${formatSequenceRanges(missing)}. ` +
        `Already gone out, or never entered.`
      );
    }
    return { chosen, problems };
  }, [picker, text, tapped, available, availableBySeq]);

  // Only relevant for standard-weight products, where the kg figure is
  // derived from the pieces. Whole muscle keeps its typed kg, so a piece
  // without a stored weight is perfectly normal there.
  const unweighed = useMemo(
    () => (requireWeight ? chosen.filter(i => !i.weight_g || i.weight_g <= 0) : []),
    [chosen, requireWeight]
  );

  const kg = useMemo(
    () => chosen.reduce((sum, i) => sum + (i.weight_g || 0), 0) / 1000,
    [chosen]
  );

  useEffect(() => {
    onChange?.({
      ids:     chosen.map(i => i.id),
      numbers: chosen.map(i => i.sequence_num),
      kg:      Number(kg.toFixed(3)),
      valid:   chosen.length > 0 && problems.length === 0 && unweighed.length === 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen.map(i => i.id).join(','), problems.length, unweighed.length]);

  function toggle(id) {
    setTapped(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (loading) {
    return <p className="text-sm text-stone-500">Loading pieces…</p>;
  }

  if (!available.length) {
    return (
      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
        No pieces left in stock for this batch.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-4">
      <div className="flex items-center justify-between">
        <label className="label mb-0">Which pieces are going out?</label>
        <span className="text-xs text-stone-500">{available.length} in stock</span>
      </div>

      <div className="flex gap-1 rounded-md bg-stone-200 p-1 text-xs">
        <button
          type="button" onClick={() => setPicker('range')}
          className={`flex-1 rounded px-3 py-1.5 font-medium transition ${
            picker === 'range' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'}`}
        >
          Type a range
        </button>
        <button
          type="button" onClick={() => setPicker('tap')}
          className={`flex-1 rounded px-3 py-1.5 font-medium transition ${
            picker === 'tap' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'}`}
        >
          Tap the pieces
        </button>
      </div>

      {picker === 'range' ? (
        <div>
          <input
            className="input font-mono"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="001-012"
          />
          <p className="mt-1 text-xs text-stone-500">
            A run like <span className="font-mono">001-012</span>, or separate ones like{' '}
            <span className="font-mono">003, 007, 019</span>.
          </p>
        </div>
      ) : (
        <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
          {available.map(i => (
            <button
              key={i.id}
              type="button"
              onClick={() => toggle(i.id)}
              className={`rounded border px-2.5 py-1.5 text-center font-mono text-xs leading-tight transition ${
                tapped.has(i.id)
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400'
              }`}
            >
              <div>{pad(i.sequence_num)}</div>
              <div className={`text-[10px] ${tapped.has(i.id) ? 'text-emerald-50' : 'text-stone-400'}`}>
                {i.weight_g ? `${(i.weight_g / 1000).toFixed(3)} kg` : 'no weight'}
              </div>
            </button>
          ))}
        </div>
      )}

      {unweighed.length > 0 && (
        <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
          <strong>These pieces have no weight yet:</strong>{' '}
          <span className="font-mono">
            {formatSequenceRanges(unweighed.map(i => i.sequence_num))}
          </span>
          <span className="mt-1 block">
            Weigh them and enter the weight on the batch first, otherwise they would
            leave stock at 0 kg.
          </span>
        </div>
      )}

      {problems.length > 0 && (
        <ul className="space-y-1 rounded-md bg-red-50 p-3 text-xs text-red-700">
          {problems.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}

      {chosen.length > 0 && (
        <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
          <div className="font-semibold">
            {chosen.length} piece{chosen.length === 1 ? '' : 's'}
            {requireWeight && <> — {kg.toFixed(3)} kg</>}
          </div>
          <div className="mt-1 font-mono text-xs">
            {formatSequenceRanges(chosen.map(i => i.sequence_num))}
          </div>
        </div>
      )}
    </div>
  );
}
