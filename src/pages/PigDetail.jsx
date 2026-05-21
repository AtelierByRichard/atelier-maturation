import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchPig, updateBatch } from '../lib/supabase.js';
import { formatDate, formatKg, calcBatchStatus, buildStages } from '../lib/calculations.js';

function StatusBadge({ status, isReady }) {
  if (isReady || status === 'ready')  return <span className="badge-green">Ready</span>;
  if (status === 'maturing')          return <span className="badge-amber">Maturing</span>;
  if (status === 'depleted')          return <span className="badge-stone">Depleted</span>;
  if (status === 'discarded')         return <span className="badge-red">Discarded</span>;
  return <span className="badge-stone">{status}</span>;
}

function StageTimeline({ stages, elapsed }) {
  return (
    <div className="mt-3 space-y-1.5">
      {stages.map((s, i) => {
        const done    = elapsed >= s.endDay;
        const current = elapsed >= s.startDay && elapsed < s.endDay;
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full shrink-0 ${done ? 'bg-emerald-500' : current ? 'bg-brand-500' : 'bg-stone-300'}`} />
            <span className={current ? 'font-semibold text-brand-700' : done ? 'text-stone-400 line-through' : 'text-stone-600'}>
              {s.label}
            </span>
            <span className="text-stone-300">·</span>
            <span className="text-stone-400">{s.days}d</span>
            {current && <span className="badge-amber ml-auto">In progress</span>}
            {done && <span className="text-emerald-500 ml-auto">✓</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function PigDetail() {
  const { id } = useParams();
  const [pig,     setPig]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    fetchPig(id)
      .then(setPig)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function markReady(batch) {
    await updateBatch(batch.id, { status: 'ready' });
    setPig(prev => ({
      ...prev,
      batches: prev.batches.map(b => b.id === batch.id ? { ...b, status: 'ready' } : b),
    }));
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" />
    </div>
  );

  if (error) return <div className="card p-6 border border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>;
  if (!pig)  return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-stone-500">
        <Link to="/pigs" className="hover:text-stone-900">Receptions</Link>
        <span>›</span>
        <span className="font-mono font-semibold text-stone-800">{pig.master_code}</span>
      </div>

      <div className="card p-5">
        <h2 className="font-mono text-xl font-bold text-stone-900 mb-1">{pig.master_code}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
          <div><p className="text-xs text-stone-400">Breed</p><p className="font-medium">{pig.breed_name}</p></div>
          <div><p className="text-xs text-stone-400">Gross weight</p><p className="font-medium">{pig.gross_weight_kg} kg</p></div>
          <div><p className="text-xs text-stone-400">Reception date</p><p className="font-medium">{formatDate(pig.receiving_date)}</p></div>
          <div><p className="text-xs text-stone-400">Supplier</p><p className="font-medium">{pig.supplier || '—'}</p></div>
        </div>
        {pig.notes && <p className="mt-3 text-sm text-stone-500 bg-stone-50 rounded-lg px-3 py-2">{pig.notes}</p>}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wide mb-3">
          Product batches ({pig.batches?.length ?? 0})
        </h3>

        {!pig.batches?.length ? (
          <div className="card p-8 text-center text-stone-400 text-sm">
            No batches assigned. Go back to the receptions list to add some.
          </div>
        ) : (
          <div className="space-y-4">
            {pig.batches.map(batch => {
              const product = batch.products;
              const status  = calcBatchStatus(batch, product, batch.dimension_cm);
              const stages  = product ? buildStages(product, batch.dimension_cm, batch.cut_weight_kg) : [];

              return (
                <div key={batch.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-stone-900">{product?.name}</p>
                      <p className="font-mono text-xs text-stone-400 mt-0.5">{batch.batch_code}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={batch.status} isReady={status.isReady} />
                      {status.isReady && batch.status === 'maturing' && (
                        <button onClick={() => markReady(batch)} className="btn-secondary text-xs">
                          Mark ready
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
                    <div><p className="text-xs text-stone-400">Cut weight</p><p className="font-medium">{formatKg(batch.cut_weight_kg)}</p></div>
                    <div><p className="text-xs text-stone-400">Current stock</p><p className="font-medium">{formatKg(batch.current_weight_kg)}</p></div>
                    <div><p className="text-xs text-stone-400">Started</p><p className="font-medium">{formatDate(batch.start_date)}</p></div>
                    <div>
                      <p className="text-xs text-stone-400">Ready on</p>
                      <p className={`font-medium ${status.isReady ? 'text-emerald-600' : 'text-stone-900'}`}>
                        {formatDate(batch.ready_date)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-stone-400 mb-1">
                      <span>Day {status.elapsed}</span>
                      <span>
                        {status.isReady ? '✓ Ready' : `D-${status.remaining} · ${status.pct}%`}
                      </span>
                    </div>
                    <div className="w-full bg-stone-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${status.isReady ? 'bg-emerald-500' : 'bg-brand-500'}`}
                        style={{ width: `${status.pct}%` }}
                      />
                    </div>
                  </div>

                  {stages.length > 0 && (
                    <details className="mt-3">
                      <summary className="text-xs text-stone-400 cursor-pointer hover:text-stone-600 select-none">
                        Stage details
                      </summary>
                      <StageTimeline stages={stages} elapsed={status.elapsed} />
                    </details>
                  )}

                  {batch.notes && (
                    <p className="mt-2 text-xs text-stone-400 bg-stone-50 rounded px-2 py-1">{batch.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
