import { useState, useMemo, useRef, useEffect } from 'react';
import { batchLabel, formatKg } from '../lib/calculations';

/**
 * Pick a batch by typing, instead of scrolling a list of hundreds.
 *
 * Matching ignores spaces and dashes, so "BH2026" finds "BH 20260713-…"
 * and "CHC" finds every Chorizo courbe. Several words all have to match,
 * so "chc 0713" narrows to one pig's chorizos.
 */
const squash = s => String(s || '').toLowerCase().replace(/[\s\-_.]/g, '');

export default function BatchPicker({ batches, value, onChange, placeholder }) {
  const [query, setQuery] = useState('');
  const [open,  setOpen]  = useState(false);
  const boxRef = useRef(null);

  const selected = batches.find(b => b.id === value);

  // Close when clicking away
  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const results = useMemo(() => {
    const terms = query.trim().split(/\s+/).filter(Boolean).map(squash);
    const list = batches.map(b => ({
      b,
      hay: squash(
        `${b.batch_code} ${b.products?.name || ''} ${b.products?.code || ''} ${b.pigs?.master_code || ''}`
      ),
    }));
    const hits = terms.length
      ? list.filter(x => terms.every(t => x.hay.includes(t)))
      : list;
    return hits.slice(0, 80).map(x => x.b);
  }, [batches, query]);

  function choose(b) {
    onChange(b.id);
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      {selected && !open ? (
        <button
          type="button"
          onClick={() => { setOpen(true); setQuery(''); }}
          className="input flex w-full items-center justify-between text-left"
        >
          <span className="truncate">
            <span className="font-medium">{selected.products?.name}</span>
            <span className="ml-2 font-mono text-xs text-stone-500">
              {batchLabel(selected)}
            </span>
            <span className="ml-2 text-xs text-stone-400">
              {selected.current_pieces ? `${selected.current_pieces} pcs · ` : ''}
              {formatKg(selected.current_weight_kg)}
            </span>
          </span>
          <span className="ml-2 shrink-0 text-xs text-stone-400">change</span>
        </button>
      ) : (
        <input
          className="input font-mono"
          value={query}
          autoFocus={open}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder || 'Type BH2026, CHC, or part of a code'}
        />
      )}

      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-stone-300 bg-white shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-stone-500">
              Nothing matches “{query.trim()}”.
            </p>
          ) : (
            <>
              <p className="border-b border-stone-100 px-3 py-1.5 text-xs text-stone-400">
                {results.length}{results.length === 80 ? '+' : ''} match
                {results.length === 1 ? '' : 'es'}
              </p>
              {results.map(b => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => choose(b)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-stone-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-stone-800">
                      {b.products?.name}
                    </span>
                    <span className="block truncate font-mono text-xs text-stone-500">
                      {batchLabel(b)}
                    </span>
                  </span>
                  <span className="ml-3 shrink-0 text-right">
                    <span className="block text-xs text-stone-600">
                      {formatKg(b.current_weight_kg)}
                    </span>
                    {b.current_pieces != null && (
                      <span className="block text-xs text-stone-400">
                        {b.current_pieces} pcs
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
