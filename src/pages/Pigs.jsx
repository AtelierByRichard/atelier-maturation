import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPigs, insertPig, fetchProducts, insertBatch, nextSequenceNum } from '../lib/supabase.js';
import {
  pigCode, batchCode, calcTotalDays, calcReadyDate,
  formatDate, toISO, today,
} from '../lib/calculations.js';

function PigForm({ onSaved, products }) {
  const todayStr = toISO(today());

  const [form, setForm] = useState({
    prefix:          'BH',
    breed_name:      'Bangkal Hitam',
    gross_weight_kg: '',
    receiving_date:  todayStr,
    supplier:        'Heritage Pig Farm',
    pieces:          1,
    notes:           '',
  });

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const previewCode =
    form.gross_weight_kg && form.receiving_date
      ? pigCode({ ...form, gross_weight_kg: Number(form.gross_weight_kg) })
      : '—';

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const pig = {
        ...form,
        gross_weight_kg: Number(form.gross_weight_kg),
        pieces:          Number(form.pieces),
        master_code:     previewCode,
      };
      const saved = await insertPig(pig);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Breed prefix</label>
          <input className="input" value={form.prefix} onChange={e => set('prefix', e.target.value)} required />
        </div>
        <div>
          <label className="label">Breed name</label>
          <input className="input" value={form.breed_name} onChange={e => set('breed_name', e.target.value)} required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Gross weight (kg)</label>
          <input
            className="input" type="number" step="0.1" min="1" max="500"
            value={form.gross_weight_kg}
            onChange={e => set('gross_weight_kg', e.target.value)}
            placeholder="e.g. 94.6"
            required
          />
        </div>
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Supplier</label>
          <input className="input" value={form.supplier} onChange={e => set('supplier', e.target.value)} />
        </div>
        <div>
          <label className="label">Number of animals</label>
          <input
            className="input" type="number" min="1" max="10"
            value={form.pieces}
            onChange={e => set('pieces', e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>

      <div className="bg-brand-50 border border-brand-200 rounded-lg p-3">
        <p className="text-xs text-brand-600 font-semibold uppercase tracking-wide mb-1">Generated batch code</p>
        <p className="font-mono text-brand-800 text-lg font-bold">{previewCode}</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={saving} className="btn-primary w-full">
        {saving ? 'Saving…' : 'Save reception'}
      </button>
    </form>
  );
}

function BatchForm({ pig, products, onBatchAdded }) {
  const [form, setForm] = useState({
    product_id:     '',
    cut_weight_kg:  '',
    pieces:         '',
    dimension_cm:   '',
    start_date:     pig.receiving_date,
    notes:          '',
  });

  const [preview, setPreview] = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState(null);

  const selectedProduct = products.find(p => p.id === form.product_id);

  useEffect(() => {
    if (!selectedProduct) { setPreview(null); return; }
    const dim  = Number(form.dimension_cm) || 0;
    const wt   = Number(form.cut_weight_kg) || 0;
    const days = calcTotalDays(selectedProduct, dim, wt);
    const rd   = form.start_date ? calcReadyDate(form.start_date, days) : null;
    setPreview({ days, readyDate: rd });
  }, [form.product_id, form.dimension_cm, form.cut_weight_kg, form.start_date, selectedProduct]);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const prod = selectedProduct;
      const seqNum = await nextSequenceNum(pig.id, prod.code);
      const dim  = Number(form.dimension_cm) || 0;
      const wt   = Number(form.cut_weight_kg);
      const days = calcTotalDays(prod, dim, wt);
      const rd   = form.start_date ? toISO(calcReadyDate(form.start_date, days)) : null;
      const code = batchCode(pig, prod.code, seqNum);

      const batch = {
        pig_id:            pig.id,
        product_id:        prod.id,
        product_code:      prod.code,
        sequence_num:      seqNum,
        batch_code:        code,
        cut_weight_kg:     wt,
        pieces:            Number(form.pieces) || 0,
        dimension_cm:      dim || null,
        start_date:        form.start_date,
        ready_date:        rd,
        current_weight_kg: wt,
        current_pieces:    Number(form.pieces) || 0,
        notes:             form.notes,
        status:            'maturing',
      };

      const saved = await insertBatch(batch);
      onBatchAdded(saved);

      setForm(prev => ({
        ...prev,
        product_id: '', cut_weight_kg: '', pieces: '', dimension_cm: '', notes: '',
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const needsDimension = selectedProduct &&
    !selectedProduct.is_nduja && !selectedProduct.is_bacon && !selectedProduct.is_wet;

  const dimensionLabel = selectedProduct?.category === 'flat'
    ? 'Avg thickness (cm)'
    : 'Avg diameter (cm)';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Product</label>
        <select className="input" value={form.product_id} onChange={e => set('product_id', e.target.value)} required>
          <option value="">— Select a product —</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Cut weight (kg)</label>
          <input
            className="input" type="number" step="0.01" min="0.1"
            value={form.cut_weight_kg}
            onChange={e => set('cut_weight_kg', e.target.value)}
            placeholder="e.g. 12.5"
            required
          />
        </div>
        <div>
          <label className="label">Number of pieces</label>
          <input
            className="input" type="number" min="1"
            value={form.pieces}
            onChange={e => set('pieces', e.target.value)}
            placeholder="e.g. 8"
          />
        </div>
      </div>

      {needsDimension && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">{dimensionLabel}</label>
            <input
              className="input" type="number" step="0.1" min="0.5"
              value={form.dimension_cm}
              onChange={e => set('dimension_cm', e.target.value)}
              placeholder={selectedProduct?.category === 'flat' ? 'e.g. 4.5' : 'e.g. 12.0'}
            />
          </div>
          <div>
            <label className="label">Start date</label>
            <input
              className="input" type="date"
              value={form.start_date}
              onChange={e => set('start_date', e.target.value)}
              required
            />
          </div>
        </div>
      )}

      {preview && selectedProduct && (
        <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 text-sm">
          <p className="font-semibold text-stone-700 mb-1">Maturation estimate</p>
          <div className="flex gap-6 flex-wrap">
            <div>
              <span className="text-stone-400 text-xs">Total duration</span>
              <p className="font-bold text-stone-900">{preview.days} days</p>
            </div>
            {preview.readyDate && (
              <div>
                <span className="text-stone-400 text-xs">Ready on</span>
                <p className="font-bold text-brand-600">{formatDate(preview.readyDate)}</p>
              </div>
            )}
            {selectedProduct.is_nduja && <p className="text-stone-500">Nduja → bulk stock (2 days)</p>}
            {selectedProduct.is_bacon && <p className="text-stone-500">Bacon → slow cook + smoke (3 days)</p>}
            {selectedProduct.is_wet   && <p className="text-stone-500">Jambon Blanc — wet cure</p>}
          </div>
        </div>
      )}

      <div>
        <label className="label">Notes</label>
        <textarea className="input resize-none" rows={1} value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={saving || !form.product_id} className="btn-primary">
        {saving ? 'Saving…' : '+ Add this batch'}
      </button>
    </form>
  );
}

export default function Pigs() {
  const [pigs,     setPigs]     = useState([]);
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [showNewPig,   setShowNewPig]   = useState(false);
  const [activePig,    setActivePig]    = useState(null);
  const [batchesByPig, setBatchesByPig] = useState({});

  useEffect(() => {
    async function load() {
      try {
        const [p, prods] = await Promise.all([fetchPigs(), fetchProducts()]);
        setPigs(p);
        setProducts(prods);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function handlePigSaved(pig) {
    setPigs(prev => [pig, ...prev]);
    setShowNewPig(false);
    setActivePig(pig);
  }

  function handleBatchAdded(batch) {
    setBatchesByPig(prev => ({
      ...prev,
      [activePig.id]: [...(prev[activePig.id] || []), batch],
    }));
  }

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Receptions</h2>
          <p className="text-sm text-stone-500 mt-1">One pig received → one master code → product batches</p>
        </div>
        <button className="btn-primary" onClick={() => setShowNewPig(true)}>
          + New reception
        </button>
      </div>

      {showNewPig && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-stone-900">New pig reception</h3>
            <button className="text-stone-400 hover:text-stone-600" onClick={() => setShowNewPig(false)}>✕</button>
          </div>
          <PigForm onSaved={handlePigSaved} products={products} />
        </div>
      )}

      {activePig && (
        <div className="card p-5 border-brand-200 bg-brand-50">
          <div className="flex items-center justify-between mb-1">
            <div>
              <span className="text-xs font-semibold text-brand-600 uppercase tracking-wide">Master batch</span>
              <p className="font-mono text-brand-800 font-bold text-lg">{activePig.master_code}</p>
            </div>
            <button className="text-stone-400 hover:text-stone-600 text-sm" onClick={() => setActivePig(null)}>
              Close
            </button>
          </div>
          <p className="text-sm text-brand-700 mb-4">
            {activePig.gross_weight_kg} kg — {activePig.breed_name} — {formatDate(activePig.receiving_date)}
          </p>

          <h4 className="font-semibold text-stone-800 mb-3">Assign product batches</h4>
          <BatchForm pig={activePig} products={products} onBatchAdded={handleBatchAdded} />

          {batchesByPig[activePig.id]?.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Batches created</p>
              {batchesByPig[activePig.id].map(b => (
                <div key={b.id} className="flex items-center justify-between bg-white rounded-lg border border-stone-200 px-3 py-2 text-sm">
                  <span className="font-mono text-stone-700 text-xs">{b.batch_code}</span>
                  <span className="text-stone-500">{b.cut_weight_kg} kg</span>
                  <span className="text-brand-600 text-xs">{formatDate(b.ready_date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {pigs.length === 0 ? (
          <div className="card p-10 text-center text-stone-400">
            <p className="text-4xl mb-3">🐷</p>
            <p className="font-medium">No receptions recorded yet.</p>
            <p className="text-sm mt-1">Start by registering your first pig.</p>
          </div>
        ) : (
          pigs.map(pig => (
            <div key={pig.id} className="card p-4 flex items-center justify-between">
              <div>
                <p className="font-mono font-semibold text-stone-800">{pig.master_code}</p>
                <p className="text-xs text-stone-400 mt-0.5">
                  {pig.breed_name} · {pig.gross_weight_kg} kg · {formatDate(pig.receiving_date)}
                  {pig.supplier && ` · ${pig.supplier}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-secondary text-xs" onClick={() => setActivePig(pig)}>
                  + Batches
                </button>
                <Link to={`/pigs/${pig.id}`} className="btn-secondary text-xs">
                  View →
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
