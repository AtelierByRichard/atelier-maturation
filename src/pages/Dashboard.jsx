import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  fetchReadyBatches,
  fetchUpcomingBatches,
  fetchBatches,
} from '../lib/supabase.js';
import {
  formatDate,
  formatKg,
  formatIDR,
  stockValue,
  calcBatchStatus,
} from '../lib/calculations.js';

function StatCard({ label, value, sub, color = 'stone' }) {
  const colors = {
    green:  'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber:  'bg-amber-50  border-amber-200  text-amber-700',
    brand:  'bg-brand-50  border-brand-200  text-brand-700',
    stone:  'bg-stone-50  border-stone-200  text-stone-700',
  };
  return (
    <div className={`card p-5 border ${colors[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-1">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  );
}

function ProgressBar({ pct, isReady }) {
  return (
    <div className="w-full bg-stone-100 rounded-full h-1.5">
      <div
        className={`h-1.5 rounded-full transition-all ${isReady ? 'bg-emerald-500' : 'bg-brand-500'}`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

function BatchRow({ batch }) {
  const product = batch.products;
  const status  = calcBatchStatus(batch, product, batch.dimension_cm);

  return (
    <tr className="border-b border-stone-100 last:border-0 hover:bg-stone-50 transition-colors">
      <td className="py-3 pr-3 pl-4">
        <p className="text-sm font-semibold text-stone-900">{product?.name}</p>
        <p className="text-xs text-stone-400 font-mono">{batch.batch_code}</p>
      </td>
      <td className="py-3 pr-3 hidden sm:table-cell">
        <p className="text-sm text-stone-700">{formatKg(batch.current_weight_kg)}</p>
        {batch.current_pieces != null && (
          <p className="text-xs text-stone-400">{batch.current_pieces} pcs</p>
        )}
      </td>
      <td className="py-3 pr-3 hidden md:table-cell">
        <p className="text-sm text-stone-700">{formatDate(batch.ready_date)}</p>
        {status.isOverdue && (
          <p className="text-xs text-red-600 font-medium">+{status.daysOverdue}d overdue</p>
        )}
      </td>
      <td className="py-3 w-32">
        <ProgressBar pct={status.pct} isReady={status.isReady} />
        <p className="text-xs text-stone-400 mt-0.5 text-right">{status.pct}%</p>
      </td>
      <td className="py-3 pl-3 pr-4">
        {status.isReady ? (
          <span className="badge-green">Ready</span>
        ) : status.remaining <= 7 ? (
          <span className="badge-amber">D-{status.remaining}</span>
        ) : (
          <span className="badge-stone">D-{status.remaining}</span>
        )}
      </td>
    </tr>
  );
}

export default function Dashboard() {
  const [ready,     setReady]     = useState([]);
  const [upcoming,  setUpcoming]  = useState([]);
  const [allActive, setAllActive] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        const [r, u, all] = await Promise.all([
          fetchReadyBatches(),
          fetchUpcomingBatches(14),
          fetchBatches(['maturing', 'ready']),
        ]);
        setReady(r);
        setUpcoming(u);
        setAllActive(all);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleExportPDF = async () => {
    if (!reportRef.current || exporting) return;
    setExporting(true);
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    try {
      const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW   = 210;
      const pdfH   = 297;
      const mTop   = 25.4;
      const mBottom = 25.4;
      const mLeft  = 19.0;
      const mRight = 19.0;
      const usableW = pdfW - mLeft - mRight;

      const logoImg = await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          c.getContext('2d').drawImage(img, 0, 0);
          resolve({ data: c.toDataURL('image/png'), w: img.width, h: img.height });
        };
        img.onerror = reject;
        img.src = window.location.origin + '/logo.png';
      });

      const logoH = 10;
      const logoW = (logoImg.w / logoImg.h) * logoH;
      const logoY = mTop - logoH - 4;
      pdf.addImage(logoImg.data, 'PNG', mLeft, logoY, logoW, logoH);

      const printDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(30, 30, 30);
      pdf.text('MATURATION STOCK REPORT', pdfW - mRight, logoY + 5, { align: 'right' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(120, 120, 120);
      pdf.text(printDate, pdfW - mRight, logoY + 10, { align: 'right' });

      pdf.setDrawColor(210, 210, 210);
      pdf.setLineWidth(0.3);
      pdf.line(mLeft, mTop, pdfW - mRight, mTop);

      const canvas = await html2canvas(reportRef.current, {
        scale: isMobile ? 1.5 : 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        allowTaint: true,
      });

      const imgData   = canvas.toDataURL('image/png');
      const imgRatio  = usableW / canvas.width;
      const totalImgH = canvas.height * imgRatio;
      const contentY  = mTop + 4;
      const page1H    = pdfH - contentY - mBottom;
      const pageNH    = pdfH - mTop - mBottom;

      pdf.addImage(imgData, 'PNG', mLeft, contentY, usableW, totalImgH);
      if (totalImgH > page1H) {
        let consumed = page1H;
        while (consumed < totalImgH) {
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', mLeft, mTop - consumed, usableW, totalImgH);
          consumed += pageNH;
        }
      }

      const dateStr  = new Date().toISOString().slice(0, 10);
      const fileName = `atelier-stock-${dateStr}.pdf`;
      if (isMobile && navigator.share) {
        const blob = pdf.output('blob');
        const file = new File([blob], fileName, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ title: 'Atelier Stock Report', files: [file] });
        } else {
          window.open(URL.createObjectURL(blob), '_blank');
        }
      } else {
        pdf.save(fileName);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('PDF export failed:', err);
        alert('PDF export failed. Please try again.');
      }
    } finally {
      setExporting(false);
    }
  };

  const totalWeightKg = allActive.reduce((s, b) => s + (b.current_weight_kg || 0), 0);
  const costValue     = allActive.reduce((s, b) =>
    s + stockValue(b.current_weight_kg, b.products?.cost_price_idr), 0);
  const salesValue    = allActive.reduce((s, b) =>
    s + stockValue(b.current_weight_kg, b.products?.sales_price_idr), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 border border-red-200 bg-red-50 text-red-700">
        <p className="font-semibold">Connection error</p>
        <p className="text-sm mt-1">{error}</p>
        <p className="text-sm mt-2">Check your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY variables.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Dashboard</h2>
          <p className="text-sm text-stone-500 mt-1">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button
          onClick={handleExportPDF}
          disabled={exporting}
          className="btn-secondary text-sm flex items-center gap-1.5"
        >
          {exporting ? 'Generating…' : '↓ Export PDF'}
        </button>
      </div>

      <div ref={reportRef}>
      {ready.length > 0 && (
        <div className="card p-4 border-emerald-300 bg-emerald-50">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-emerald-600 text-lg">✓</span>
            <p className="font-semibold text-emerald-800">
              {ready.length} batch{ready.length > 1 ? 'es' : ''} ready for sale
            </p>
          </div>
          <ul className="space-y-1">
            {ready.map(b => (
              <li key={b.id} className="flex items-center justify-between text-sm">
                <span className="text-emerald-800 font-medium">{b.products?.name}</span>
                <span className="text-emerald-600 font-mono text-xs">{formatKg(b.current_weight_kg)}</span>
              </li>
            ))}
          </ul>
          <Link to="/stock-out" className="mt-3 block text-center btn-primary text-sm">
            Record a stock out →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active batches" value={allActive.length} color="brand" />
        <StatCard label="Total stock" value={`${totalWeightKg.toFixed(1)} kg`} color="stone" />
        <StatCard label="Cost value" value={formatIDR(costValue)} color="stone" />
        <StatCard label="Sales value" value={formatIDR(salesValue)} color="green" />
      </div>

      {ready.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wide mb-3">
            Ready for sale ({ready.length})
          </h3>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="text-left text-xs font-semibold text-stone-500 uppercase tracking-wide py-2.5 pr-3 pl-4">Product</th>
                  <th className="text-left text-xs font-semibold text-stone-500 uppercase tracking-wide py-2.5 pr-3 hidden sm:table-cell">Stock</th>
                  <th className="text-left text-xs font-semibold text-stone-500 uppercase tracking-wide py-2.5 pr-3 hidden md:table-cell">Ready on</th>
                  <th className="text-left text-xs font-semibold text-stone-500 uppercase tracking-wide py-2.5">Progress</th>
                  <th className="py-2.5 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {ready.map(b => (
                  <tr key={b.id} className="border-b border-stone-100 last:border-0">
                    <td className="py-3 pr-3 pl-4">
                      <p className="text-sm font-semibold text-stone-900">{b.products?.name}</p>
                      <p className="text-xs text-stone-400 font-mono">{b.batch_code}</p>
                    </td>
                    <td className="py-3 pr-3 hidden sm:table-cell">
                      <p className="text-sm">{formatKg(b.current_weight_kg)}</p>
                    </td>
                    <td className="py-3 pr-3 hidden md:table-cell">
                      <p className="text-sm">{formatDate(b.ready_date)}</p>
                    </td>
                    <td className="py-3 pr-3 w-32">
                      <ProgressBar pct={100} isReady />
                    </td>
                    <td className="py-3 pl-3 pr-4">
                      <span className="badge-green">Ready ✓</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wide mb-3">
          Maturing — next 14 days ({upcoming.length})
        </h3>
        {upcoming.length === 0 ? (
          <div className="card p-6 text-center text-stone-400 text-sm">
            No batches ready in the next 14 days.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="text-left text-xs font-semibold text-stone-500 uppercase tracking-wide py-2.5 pr-3 pl-4">Product</th>
                  <th className="text-left text-xs font-semibold text-stone-500 uppercase tracking-wide py-2.5 pr-3 hidden sm:table-cell">Stock</th>
                  <th className="text-left text-xs font-semibold text-stone-500 uppercase tracking-wide py-2.5 pr-3 hidden md:table-cell">Ready on</th>
                  <th className="text-left text-xs font-semibold text-stone-500 uppercase tracking-wide py-2.5">Progress</th>
                  <th className="py-2.5 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map(b => <BatchRow key={b.id} batch={b} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wide">
            All active batches ({allActive.length})
          </h3>
          <Link to="/pigs" className="text-xs text-brand-600 hover:underline">
            + New reception
          </Link>
        </div>
        {allActive.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-stone-400 text-sm">No active batches.</p>
            <Link to="/pigs" className="mt-3 inline-block btn-primary text-sm">
              Start with a pig reception →
            </Link>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="text-left text-xs font-semibold text-stone-500 uppercase tracking-wide py-2.5 pr-3 pl-4">Product</th>
                  <th className="text-left text-xs font-semibold text-stone-500 uppercase tracking-wide py-2.5 pr-3 hidden sm:table-cell">Stock</th>
                  <th className="text-left text-xs font-semibold text-stone-500 uppercase tracking-wide py-2.5 pr-3 hidden md:table-cell">Ready on</th>
                  <th className="text-left text-xs font-semibold text-stone-500 uppercase tracking-wide py-2.5">Progress</th>
                  <th className="py-2.5 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {allActive.map(b => <BatchRow key={b.id} batch={b} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
