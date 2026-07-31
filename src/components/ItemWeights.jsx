import { useEffect, useState } from 'react';
import { fetchItems } from '../lib/supabase';
import { formatSequenceRanges } from '../lib/calculations';

const pad = n => String(n).padStart(3, '0');

/**
 * The tracking numbers of one batch — read only.
 *
 * This is a stock tracking list, not a data entry screen. It shows
 * which numbered pieces belong to this batch and which are still in
 * stock. Pieces leave stock through the Stock Out page, as before.
 */
export default function ItemWeights({ batch, product }) {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchItems(batch.id)
      .then(rows => { if (!cancelled) setItems(rows || []); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [batch.id]);

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;
  if (error)   return <p className="text-sm text-red-600">{error}</p>;
  if (!items.length) {
    return (
      <p className="text-sm text-stone-500">
        No tracking numbers recorded for this batch.
      </p>
    );
  }

  const inStock = items.filter(i => i.status === 'maturing' || i.status === 'ready');
  const gone    = items.filter(i => i.status === 'out');
  const lost    = items.filter(i => i.status === 'lost');

  return (
    <div className="space-y-2 text-sm">
      <div>
        <span className="text-xs text-stone-400">In stock ({inStock.length})</span>
        <p className="font-mono text-xs text-stone-700">
          {inStock.length ? formatSequenceRanges(inStock.map(i => i.sequence_num)) : '—'}
        </p>
      </div>

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

      <p className="pt-1 font-mono text-xs text-stone-400">
        {items[0].item_code}
        {items.length > 1 && <> … {pad(items[items.length - 1].sequence_num)}</>}
      </p>
    </div>
  );
}
