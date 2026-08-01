import { useState, useEffect, useMemo } from 'react';
import {
  parseSequenceRanges, sequenceRun, formatSequenceRanges,
  splitAgainstUsed, usesStandardWeight, itemCode, MAX_SEQUENCE,
} from '../lib/calculations';

/**
 * Piece-number entry.
 *
 * Two modes, matching how the numbers actually arrive:
 *
 *   mode="generate"  — new batch. You give a start number and a
 *                      quantity, the app fills the whole run.
 *   mode="manual"    — inventory count. You key in exactly what you
 *                      counted: single numbers, several ranges, gaps.
 *
 * Calls onChange({ numbers, items, valid }) whenever the entry changes.
 * The parent does the actual insert.
 */
export default function ItemEntry({
  pig,
  product,
  mode = 'generate',
  usedNumbers = new Set(),
  suggestedStart = 1,
  onChange,
}) {
  const [tab, setTab]           = useState(mode);
  const [start, setStart]       = useState(suggestedStart);
  const [quantity, setQuantity] = useState('');
  const [rangeText, setRangeText] = useState('');
  const [weights, setWeights]     = useState({});   // { [sequence_num]: grams }

  const standardWeight = usesStandardWeight(product);

  useEffect(() => { setStart(suggestedStart); }, [suggestedStart]);
  useEffect(() => { setTab(mode); }, [mode]);

  // ── Work out the piece numbers ──────────────────────────
  const result = useMemo(() => {
    if (tab === 'generate') {
      if (!quantity) return { numbers: [], errors: [] };
      return sequenceRun(start, quantity);
    }
    return parseSequenceRanges(rangeText);
  }, [tab, start, quantity, rangeText]);

  const { fresh, clashes } = useMemo(
    () => splitAgainstUsed(result.numbers, usedNumbers),
    [result.numbers, usedNumbers]
  );

  // Whole muscle: every piece needs its own weight before saving.
  const missingWeights = standardWeight
    ? []
    : fresh.filter(n => !weights[n] || Number(weights[n]) <= 0);

  // ── Hand the parent something ready to insert ───────────
  useEffect(() => {
    const items = fresh.map(n => ({
      sequence_num: n,
      item_code: itemCode(pig, product.code, n),
      weight_g: standardWeight
        ? product.target_weight_g
        : (weights[n] ? Math.round(Number(weights[n])) : null),
      status: 'maturing',
      source: tab === 'generate' ? 'generated' : 'manual',
    }));
    onChange?.({
      numbers: fresh,
      items,
      valid: fresh.length > 0
        && result.errors.length === 0
        && clashes.length === 0
        && missingWeights.length === 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh.join(','), clashes.length, result.errors.length, standardWeight, tab,
      JSON.stringify(weights), missingWeights.length]);

  const totalKg = standardWeight
    ? ((fresh.length * (product.target_weight_g || 0)) / 1000).toFixed(3)
    : (fresh.reduce((s, n) => s + (Number(weights[n]) || 0), 0) / 1000).toFixed(3);

  return (
    <div className="space-y-4 rounded-lg border border-stone-200 bg-stone-50 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-stone-700">
          Piece numbers — {product.name}
        </h4>
        <span className="font-mono text-xs text-stone-400">{product.code}</span>
      </div>

      {/* Mode switch */}
      <div className="flex gap-1 rounded-md bg-stone-200 p-1 text-xs">
        <button
          type="button"
          onClick={() => setTab('generate')}
          className={`flex-1 rounded px-3 py-1.5 font-medium transition ${
            tab === 'generate' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
          }`}
        >
          Generate a run
        </button>
        <button
          type="button"
          onClick={() => setTab('manual')}
          className={`flex-1 rounded px-3 py-1.5 font-medium transition ${
            tab === 'manual' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
          }`}
        >
          Key in a count
        </button>
      </div>

      {/* Generate: start + quantity */}
      {tab === 'generate' && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-600">Start at</span>
            <input
              type="number" min="1" max={MAX_SEQUENCE}
              value={start}
              onChange={e => setStart(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-600">How many pieces</span>
            <input
              type="number" min="1" max={MAX_SEQUENCE}
              value={quantity}
              onChange={e => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="e.g. 120"
              className="w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm"
            />
          </label>
        </div>
      )}

      {/* Manual: free-form ranges */}
      {tab === 'manual' && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-600">
            Piece numbers as counted
          </span>
          <textarea
            rows={3}
            value={rangeText}
            onChange={e => setRangeText(e.target.value)}
            placeholder={'001-045, 067-120, 133'}
            className="w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm"
          />
          <span className="mt-1 block text-xs text-stone-500">
            Ranges and single numbers, separated by commas. Gaps are fine —
            enter only the pieces you actually have in front of you.
          </span>
        </label>
      )}

      {/* Weight */}
      {standardWeight ? (
        <p className="text-xs text-stone-600">
          Weight is filled in automatically:{' '}
          <strong>{product.target_weight_g} g per piece</strong>. No weighing needed.
        </p>
      ) : fresh.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium text-stone-600">
            Weigh each piece and enter it below — grams.
          </p>
          <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {fresh.map(n => (
              <div key={n} className="flex items-center gap-2">
                <span className="w-10 font-mono text-xs text-stone-500">
                  {String(n).padStart(3, '0')}
                </span>
                <input
                  type="number" min="1" step="1"
                  value={weights[n] ?? ''}
                  onChange={e => setWeights(w => ({ ...w, [n]: e.target.value }))}
                  placeholder="e.g. 1850"
                  className={`w-32 rounded-md border px-2 py-1 font-mono text-sm ${
                    !weights[n] || Number(weights[n]) <= 0
                      ? 'border-amber-300 bg-amber-50'
                      : 'border-stone-300'
                  }`}
                />
                <span className="text-xs text-stone-400">g</span>
                {weights[n] > 0 && (
                  <span className="text-xs text-stone-500">
                    {(Number(weights[n]) / 1000).toFixed(3)} kg
                  </span>
                )}
              </div>
            ))}
          </div>
          {missingWeights.length > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              Still to weigh: {missingWeights.length} piece
              {missingWeights.length === 1 ? '' : 's'}.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-stone-600">
          {product.name} is weighed piece by piece. Enter the piece numbers first,
          then a weight box appears for each one.
        </p>
      )}

      {/* Errors */}
      {result.errors.length > 0 && (
        <ul className="space-y-1 rounded-md bg-red-50 p-3 text-xs text-red-700">
          {result.errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}

      {/* Clashes with numbers already used */}
      {clashes.length > 0 && (
        <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
          <strong>Already used for this pig:</strong>{' '}
          <span className="font-mono">{formatSequenceRanges(clashes)}</span>
          <span className="mt-1 block">
            These will be skipped. Remove them from your entry, or use different numbers.
          </span>
        </div>
      )}

      {/* Summary */}
      {fresh.length > 0 && (
        <div className="rounded-md bg-emerald-50 p-3 text-xs text-emerald-900">
          <div className="font-semibold">
            {fresh.length} piece{fresh.length === 1 ? '' : 's'}
            {Number(totalKg) > 0 && <> — {totalKg} kg total</>}
          </div>
          <div className="mt-1 font-mono">{formatSequenceRanges(fresh)}</div>
          <div className="mt-2 font-mono text-emerald-700">
            {itemCode(pig, product.code, fresh[0])}
            {fresh.length > 1 && <> … {itemCode(pig, product.code, fresh[fresh.length - 1])}</>}
          </div>
        </div>
      )}
    </div>
  );
}
