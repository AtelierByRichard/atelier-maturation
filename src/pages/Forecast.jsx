import { useEffect, useState, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { fetchBatches } from '../lib/supabase.js';
import { formatDate, formatKg, daysBetween, today, addDays } from '../lib/calculations.js';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Tooltip, Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

function groupByWeek(batches, weeks = 12) {
  const now   = today();
  const start = new Date(now);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));

  const buckets = Array.from({ length: weeks }, (_, i) => {
    const weekStart = addDays(start, i * 7);
    const weekEnd   = addDays(weekStart, 6);
    return { label: formatDate(weekStart).slice(0, 6), weekStart, weekEnd, batches: [], totalKg: 0, totalPieces: 0 };
  });

  for (const batch of batches) {
    if (!batch.ready_date) continue;
    const rd = new Date(batch.ready_date);
    for (const bucket of buckets) {
      if (rd >= bucket.weekStart && rd <= bucket.weekEnd) {
        bucket.batches.push(batch);
        bucket.totalKg     += batch.current_weight_kg || 0;
        bucket.totalPieces += batch.current_pieces    || 0;
        break;
      }
    }
  }
  return buckets;
}

function TimelineCard({ batch, unit }) {
  const now      = today();
  const rd       = new Date(batch.ready_date);
  const daysLeft = daysBetween(now, rd);
  const isReady  = daysLeft <= 0;
  const isPast7  = daysLeft <= 7 && daysLeft > 0;

  const primaryValue = unit === 'pieces'
    ? (batch.current_pieces != null ? `${batch.current_pieces} pcs` : '— pcs')
    : formatKg(batch.current_weight_kg);
  const secondaryValue = unit === 'pieces'
    ? formatKg(batch.current_weight_kg)
    : (batch.current_pieces != null ? `${batch.current_pieces} pcs` : null);

  return (
    <div className={`flex items-center justify-between px-4 py-3 border-b border-stone-100 last:border-0 ${isReady ? 'bg-emerald-50' : ''}`}>
      <div>
        <p className="text-sm font-semibold text-stone-900">{batch.products?.name}</p>
        <p className="text-xs text-stone-400 font-mono">{batch.batch_code}</p>
      </div>
      <div className="text-right">
        <p className={`text-sm font-semibold ${isReady ? 'text-emerald-600' : isPast7 ? 'text-amber-600' : 'text-stone-700'}`}>
          {isReady ? '✓ Ready' : `D-${daysLeft}`}
        </p>
        <p className="text-xs text-stone-400">{formatDate(batch.ready_date)}</p>
      </div>
      <div className="text-right ml-4">
        <p className="text-sm text-stone-700">{primaryValue}</p>
        {secondaryValue && <p className="text-xs text-stone-400">{secondaryValue}</p>}
      </div>
    </div>
  );
}

export default function Forecast() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [horizon, setHorizon] = useState(12);
  const [unit,    setUnit]    = useState('kg'); // 'kg' | 'pieces'
  const [exporting, setExporting] = useState(false);

  const reportRef = useRef(null);

  useEffect(() => {
    fetchBatches(['maturing', 'ready'])
      .then(setBatches)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // ── PDF export ──────────────────────────────────────────────────────────────
  const handleExportPDF = async () => {
    if (!reportRef.current || exporting) return;
    setExporting(true);

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    try {
      // Page & margin setup (Word-standard margins)
      const pdf        = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW       = 210;   // A4 width mm
      const pdfH       = 297;   // A4 height mm
      const mTop       = 25.4;  // 2.54 cm
      const mBottom    = 25.4;  // 2.54 cm
      const mLeft      = 19.0;  // 1.90 cm
      const mRight     = 19.0;  // 1.90 cm
      const usableW    = pdfW - mLeft - mRight;   // 172 mm

      // ── 1. Logo (top-left, within top margin) ─────────────────────────────
      const logoImg = await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width  = img.width;
          c.height = img.height;
          c.getContext('2d').drawImage(img, 0, 0);
          resolve({ data: c.toDataURL('image/png'), w: img.width, h: img.height });
        };
        img.onerror = reject;
        img.src = window.location.origin + '/logo.png';
      });

      const logoH  = 10;                                  // mm — small logo
      const logoW  = (logoImg.w / logoImg.h) * logoH;    // keep ratio
      const logoY  = mTop - logoH - 4;                   // sits just above content area
      pdf.addImage(logoImg.data, 'PNG', mLeft, logoY, logoW, logoH);

      // ── 2. "Forecast Report" + date line (top-right) ──────────────────────
      const printDate = new Date().toLocaleDateString('en-GB', {
        day: '2-digit', month: 'long', year: 'numeric',
      });
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(30, 30, 30);
      pdf.text('IN-STOCK MATURATION READY REPORT', pdfW - mRight, logoY + 5, { align: 'right' });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(120, 120, 120);
      pdf.text(
        `${printDate} · ${horizon}-week horizon · ${isKg ? 'Kg' : 'Pieces'}`,
        pdfW - mRight, logoY + 10, { align: 'right' }
      );

      // ── 3. Thin separator line at top of content area ─────────────────────
      pdf.setDrawColor(210, 210, 210);
      pdf.setLineWidth(0.3);
      pdf.line(mLeft, mTop, pdfW - mRight, mTop);

      // ── 4. Capture data content only (no header div) ──────────────────────
      const canvas = await html2canvas(reportRef.current, {
        scale: isMobile ? 1.5 : 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        allowTaint: true,
      });

      const imgData    = canvas.toDataURL('image/png');
      const imgRatio   = usableW / canvas.width;          // mm per pixel
      const totalImgH  = canvas.height * imgRatio;         // total image height in mm

      // Content starts just below the separator
      const contentY   = mTop + 4;
      const page1H     = pdfH - contentY - mBottom;       // usable height on page 1
      const pageNH     = pdfH - mTop    - mBottom;        // usable height on subsequent pages

      // Page 1
      pdf.addImage(imgData, 'PNG', mLeft, contentY, usableW, totalImgH);

      // Additional pages if content overflows
      if (totalImgH > page1H) {
        let consumed = page1H;
        while (consumed < totalImgH) {
          pdf.addPage();
          // Shift the image up so the next slice starts at mTop
          pdf.addImage(imgData, 'PNG', mLeft, mTop - consumed, usableW, totalImgH);
          consumed += pageNH;
        }
      }

      // ── 5. Save / Share ───────────────────────────────────────────────────
      const dateStr  = new Date().toISOString().slice(0, 10);
      const fileName = `atelier-forecast-${dateStr}.pdf`;

      if (isMobile && navigator.share) {
        const blob = pdf.output('blob');
        const file = new File([blob], fileName, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ title: 'Atelier Forecast Report', files: [file] });
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
  // ────────────────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" />
    </div>
  );

  if (error) return (
    <div className="card p-6 border border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>
  );

  const sorted = [...batches].sort((a, b) => new Date(a.ready_date) - new Date(b.ready_date));
  const weeks  = groupByWeek(sorted, horizon);
  const isKg   = unit === 'kg';

  const chartData = {
    labels: weeks.map(w => w.label),
    datasets: [{
      label: isKg ? 'Stock ready (kg)' : 'Stock ready (pieces)',
      data: isKg
        ? weeks.map(w => Number(w.totalKg.toFixed(2)))
        : weeks.map(w => w.totalPieces),
      backgroundColor: weeks.map(w =>
        w.batches.some(b => daysBetween(today(), new Date(b.ready_date)) <= 0)
          ? 'rgba(16, 185, 129, 0.7)'
          : 'rgba(212, 130, 44, 0.7)'
      ),
      borderRadius: 4,
      borderSkipped: false,
    }],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false, // disable animation so html2canvas captures it correctly
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          afterLabel: (ctx) => {
            const bucket = weeks[ctx.dataIndex];
            return bucket.batches.map(b =>
              isKg
                ? `  · ${b.products?.name}: ${formatKg(b.current_weight_kg)}`
                : `  · ${b.products?.name}: ${b.current_pieces ?? '—'} pcs`
            ).join('\n');
          },
        },
      },
    },
    scales: {
      y: { title: { display: true, text: isKg ? 'kg available' : 'pieces available' }, beginAtZero: true },
      x: { grid: { display: false } },
    },
  };

  const byProduct = {};
  for (const b of sorted) {
    const name = b.products?.name || 'Unknown';
    if (!byProduct[name]) byProduct[name] = { name, totalKg: 0, totalPieces: 0, batches: [] };
    byProduct[name].totalKg     += b.current_weight_kg || 0;
    byProduct[name].totalPieces += b.current_pieces    || 0;
    byProduct[name].batches.push(b);
  }

  return (
    <div className="space-y-6">

      {/* ── Page header & controls (NOT captured in PDF) ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Forecast</h2>
          <p className="text-sm text-stone-500 mt-1">Future availability by week</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">

          {/* Kg / Pieces toggle */}
          <div className="flex rounded-lg border border-stone-200 overflow-hidden text-sm font-medium">
            <button
              onClick={() => setUnit('kg')}
              className={`px-3 py-1.5 transition-colors ${isKg ? 'bg-brand-600 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'}`}
            >
              Kg
            </button>
            <button
              onClick={() => setUnit('pieces')}
              className={`px-3 py-1.5 transition-colors ${!isKg ? 'bg-brand-600 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'}`}
            >
              Pieces
            </button>
          </div>

          {/* Horizon selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-stone-500">Horizon:</label>
            <select className="input w-auto" value={horizon} onChange={e => setHorizon(Number(e.target.value))}>
              <option value={1}>1 week</option>
              <option value={4}>4 weeks</option>
              <option value={8}>8 weeks</option>
              <option value={12}>12 weeks</option>
              <option value={24}>24 weeks</option>
            </select>
          </div>

          {/* Export PDF button */}
          <button
            onClick={handleExportPDF}
            disabled={exporting}
            className="btn btn-secondary flex items-center gap-2"
          >
            {exporting ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Generating…
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
                Export PDF
              </>
            )}
          </button>

        </div>
      </div>

      {/* ── Report content — this div is captured for the PDF ── */}
      <div ref={reportRef} className="space-y-6">

        {/* Chart */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-stone-700 mb-4">Stock ready by week ({isKg ? 'kg' : 'pieces'})</h3>
          <div className="h-64">
            <Bar data={chartData} options={chartOptions} />
          </div>
        </div>

        {/* Summary by product */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-stone-200 bg-stone-50">
            <h3 className="text-sm font-semibold text-stone-700">Summary by product</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-100">
                <th className="text-left text-xs font-semibold text-stone-400 uppercase tracking-wide px-5 py-2.5">Product</th>
                <th className="text-left text-xs font-semibold text-stone-400 uppercase tracking-wide px-5 py-2.5">Batches</th>
                <th className="text-left text-xs font-semibold text-stone-400 uppercase tracking-wide px-5 py-2.5">
                  Total stock ({isKg ? 'kg' : 'pcs'})
                </th>
                <th className="text-left text-xs font-semibold text-stone-400 uppercase tracking-wide px-5 py-2.5">Next ready</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(byProduct).map(({ name, totalKg, totalPieces, batches: bList }) => {
                const nextReady = bList.find(b => new Date(b.ready_date) >= today());
                return (
                  <tr key={name} className="border-b border-stone-100 last:border-0">
                    <td className="px-5 py-3 text-sm font-semibold text-stone-900">{name}</td>
                    <td className="px-5 py-3 text-sm text-stone-600">{bList.length} batch{bList.length > 1 ? 'es' : ''}</td>
                    <td className="px-5 py-3 text-sm text-stone-700">
                      {isKg ? formatKg(totalKg) : `${totalPieces} pcs`}
                    </td>
                    <td className="px-5 py-3 text-sm text-stone-500">
                      {nextReady ? formatDate(nextReady.ready_date) : '—'}
                    </td>
                  </tr>
                );
              })}
              {Object.keys(byProduct).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-stone-400 text-sm">No active batches.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Maturity calendar */}
        <div>
          <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wide mb-3">
            Maturity calendar ({sorted.length} batches)
          </h3>
          <div className="card overflow-hidden">
            {sorted.length === 0 ? (
              <p className="text-center text-stone-400 text-sm py-8">No active batches.</p>
            ) : (
              sorted.map(b => <TimelineCard key={b.id} batch={b} unit={unit} />)
            )}
          </div>
        </div>

      </div>
      {/* end reportRef */}

    </div>
  );
}
