import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { searchItems } from '../lib/supabase';
import { formatDate, formatKg } from '../lib/calculations';

const pad = n => String(n).padStart(3, '0');

const STATUS = {
  maturing: { label: 'Maturing', cls: 'badge-amber' },
  ready:    { label: 'Ready',    cls: 'badge-green' },
  out:      { label: 'Out',      cls: 'badge-stone' },
  lost:     { label: 'Lost',     cls: 'badge-red'   },
};

/**
 * Find a piece from the number on its tag.
 *
 * Typing a bare number matches that piece number across every product,
 * which is what you have in hand when holding a tagged saucisson.
 * Typing part of a code narrows it further.
 */
export default function PieceLookup() {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [busy,    setBusy]    = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    let cancelled = false;
    setBusy(true);
    // Wait for typing to settle before hitting the database.
    const t = setTimeout(() => {
      searchItems(q)
        .then(rows => { if (!cancelled) setResults(rows); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setBusy(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  return (
    <div className="card p-4">
      <label className="label">Find a piece</label>
      <input
        className="input font-mono"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="034   or   COP-034   or   BH 20260722"
      />
      <p className="mt-1 text-xs text-stone-500">
        Type the number from the tag, or any part of the code.
      </p>

      {query.trim() && (
        <div className="mt-3">
          {busy && <p className="text-sm text-stone-400">Searching…</p>}

          {!busy && results.length === 0 && (
            <p className="text-sm text-stone-500">Nothing found for “{query.trim()}”.</p>
          )}

          {results.length > 0 && (
            <div className="max-h-80 overflow-y-auto rounded-lg border border-stone-200">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-stone-100">
                  {results.map(i => {
                    const s = STATUS[i.status] || STATUS.maturing;
                    return (
                      <tr key={i.id} className="hover:bg-stone-50">
                        <td className="px-3 py-2">
                          <Link to={`/pigs/${i.pig_id}`} className="group">
                            <p className="font-mono text-xs font-semibold text-stone-800 group-hover:underline">
                              {i.item_code}
                            </p>
                            <p className="text-xs text-stone-500">
                              {i.products?.name} · piece {pad(i.sequence_num)}
                            </p>
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <p className="font-mono text-xs text-stone-600">
                            {i.weight_g ? formatKg(i.weight_g / 1000) : '—'}
                          </p>
                          <p className="text-xs text-stone-400">
                            {i.batches?.ready_date ? formatDate(i.batches.ready_date) : '—'}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={s.cls}>{s.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
