import { useEffect, useState } from 'react';
import { fetchProducts, upsertProduct, setProductActive } from '../lib/supabase.js';
import { formatIDR } from '../lib/calculations.js';

const CATEGORIES = [
  { value: 'sausage', label: 'Sausage / Salami' },
  { value: 'flat',    label: 'Flat muscle (ventrèche, guanciale…)' },
  { value: 'round',   label: 'Round muscle (coppa, lonzo…)' },
  { value: 'wet',     label: 'Wet cure (jambon blanc)' },
  { value: 'special', label: 'Special' },
];

const EMPTY_PRODUCT = {
  id: null, code: '', name: '', category: 'sausage', drying_days: 0,
  has_incubation: false, has_smoke: false, has_marinade: false,
  is_nduja: false, is_bacon: false, is_wet: false,
  target_weight_g: '', cost_price_idr: '', sales_price_idr: '', active: true,
};

function ProductForm({ product, onSaved, onCancel }) {
  const [form,   setForm]   = useState({ ...EMPTY_PRODUCT, ...product });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  function set(field, value) { setForm(prev => ({ ...prev, [field]: value })); }
  function toggle(field)     { setForm(prev => ({ ...prev, [field]: !prev[field] })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        ...form,
        drying_days:     Number(form.drying_days) || 0,
        target_weight_g: form.target_weight_g ? Number(form.target_weight_g) : null,
        cost_price_idr:  form.cost_price_idr  ? Number(form.cost_price_idr)  : null,
        sales_price_idr: form.sales_price_idr ? Number(form.sales_price_idr) : null,
        code:            form.code.toUpperCase().slice(0, 4),
      };
      if (!payload.id) delete payload.id;
      const saved = await upsertProduct(payload);
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
          <label className="label">Code (max 4 letters)</label>
          <input
            className="input font-mono uppercase" maxLength={4}
            value={form.code} onChange={e => set('code', e.target.value.toUpperCase())}
            placeholder="SAU" required
          />
        </div>
        <div>
          <label className="label">Product name</label>
          <input
            className="input" value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="Saucisson sec" required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Category</label>
          <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Drying duration (days)</label>
          <input className="input" type="number" min="0" value={form.drying_days} onChange={e => set('drying_days', e.target.value)} />
        </div>
      </div>

      <div>
        <label className="label">Special steps</label>
        <div className="flex flex-wrap gap-3 mt-1">
          {[
            { field: 'has_incubation', label: 'Incubation (48h)' },
            { field: 'has_smoke',      label: 'Smoking' },
            { field: 'has_marinade',   label: 'Red wine marinade' },
            { field: 'is_nduja',       label: 'Nduja (bulk, no drying)' },
            { field: 'is_bacon',       label: 'Bacon (slow cook + smoke)' },
            { field: 'is_wet',         label: 'Wet cure' },
          ].map(({ field, label }) => (
            <label key={field} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!form[field]} onChange={() => toggle(field)} className="accent-brand-600 w-4 h-4" />
              <span className="text-sm text-stone-700">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="label">Target weight (g/piece)</label>
          <input className="input" type="number" min="0" value={form.target_weight_g} onChange={e => set('target_weight_g', e.target.value)} placeholder="250" />
          <p className="text-xs text-stone-400 mt-0.5">Leave blank = sold by kg</p>
        </div>
        <div>
          <label className="label">Cost price (IDR/kg)</label>
          <input className="input" type="number" min="0" value={form.cost_price_idr} onChange={e => set('cost_price_idr', e.target.value)} placeholder="280000" />
        </div>
        <div>
          <label className="label">Sales price (IDR/kg)</label>
          <input className="input" type="number" min="0" value={form.sales_price_idr} onChange={e => set('sales_price_idr', e.target.value)} placeholder="750000" />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : form.id ? 'Update' : 'Create product'}
        </button>
      </div>
    </form>
  );
}

export default function Settings() {
  const [products,     setProducts]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [editing,      setEditing]      = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  async function loadProducts() {
    try {
      const data = await fetchProducts(false);
      setProducts(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadProducts(); }, []);

  function handleSaved(saved) {
    setProducts(prev => {
      const exists = prev.find(p => p.id === saved.id);
      return exists ? prev.map(p => p.id === saved.id ? saved : p) : [saved, ...prev];
    });
    setEditing(null);
  }

  async function toggleActive(product) {
    try {
      const updated = await setProductActive(product.id, !product.active);
      setProducts(prev => prev.map(p => p.id === updated.id ? updated : p));
    } catch (e) {
      alert(e.message);
    }
  }

  const visible = showInactive ? products : products.filter(p => p.active);

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
      <div>
        <h2 className="text-2xl font-bold text-stone-900">Settings</h2>
        <p className="text-sm text-stone-500 mt-1">Manage your product catalogue</p>
      </div>

      {editing && (
        <div className="card p-5">
          <h3 className="font-semibold text-stone-900 mb-4">
            {editing === 'new' ? 'New product' : `Edit — ${editing.name}`}
          </h3>
          <ProductForm
            product={editing === 'new' ? {} : editing}
            onSaved={handleSaved}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wide">
              Products ({visible.length})
            </h3>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="accent-brand-600" />
              <span className="text-xs text-stone-500">Show inactive</span>
            </label>
          </div>
          <button className="btn-primary text-sm" onClick={() => setEditing('new')}>
            + New product
          </button>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 hidden md:table-cell">Category</th>
                <th className="px-4 py-3 hidden md:table-cell">Drying</th>
                <th className="px-4 py-3 hidden lg:table-cell">Sales price</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(p => (
                <tr key={p.id} className={`border-b border-stone-100 last:border-0 ${!p.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-stone-600">{p.code}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-stone-900">{p.name}</p>
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {p.has_incubation && <span className="badge-blue">Incubation</span>}
                      {p.has_smoke      && <span className="badge-stone">Smoke</span>}
                      {p.has_marinade   && <span className="badge-stone">Marinade</span>}
                      {p.is_nduja       && <span className="badge-amber">Nduja</span>}
                      {p.is_bacon       && <span className="badge-amber">Bacon</span>}
                      {p.is_wet         && <span className="badge-blue">Wet cure</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-sm text-stone-600 capitalize">{p.category}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-sm text-stone-600">
                    {p.drying_days > 0 ? `${p.drying_days}d` : '—'}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-sm text-stone-600">
                    {p.sales_price_idr ? formatIDR(p.sales_price_idr) + '/kg' : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => setEditing(p)} className="text-xs text-stone-500 hover:text-stone-900 underline">Edit</button>
                      <button onClick={() => toggleActive(p)} className={`text-xs ${p.active ? 'text-red-500 hover:text-red-700' : 'text-emerald-600 hover:text-emerald-800'}`}>
                        {p.active ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-5 border-stone-200 bg-stone-50">
        <h3 className="font-semibold text-stone-700 mb-2">Cure formula</h3>
        <p className="text-sm text-stone-600">Duration = ROUNDUP(dimension × 3.72, 0) days</p>
        <ul className="text-sm text-stone-500 mt-2 space-y-1 ml-4 list-disc">
          <li>Flat cuts (ventrèche, guanciale, lardo, speck) → thickness in cm</li>
          <li>Round cuts (coppa, lonzo, fiocco, culatello) → radius = diameter ÷ 2</li>
          <li>Sausages → radius = diameter ÷ 2</li>
          <li>Jambon Blanc → ROUNDUP(weight kg × 1.625, 0) + 1 cooking day</li>
        </ul>
      </div>
    </div>
  );
}
