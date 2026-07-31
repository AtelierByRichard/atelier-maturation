import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

/**
 * LabelPrint — label preview with print (Mac) and save-as-image (iPhone) options.
 * Props:
 *   batch   — batch object with batch_code, start_date, ready_date
 *   product — product object with name
 *   onClose — called to dismiss
 */
export default function LabelPrint({ batch, product, onClose }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, batch.batch_code, {
      width: 96,
      margin: 1,
      color: { dark: '#1c1917', light: '#ffffff' },
    });
  }, [batch.batch_code]);

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

  function buildLabelHTML(qrDataUrl) {
    const weightG = batch.cut_weight_kg
      ? `${Math.round(batch.cut_weight_kg * 1000).toLocaleString('fr-FR')} g`
      : '—';
    const targetWeightG = product?.target_weight_g
      ? `≈ ${Number(product.target_weight_g).toLocaleString('fr-FR')} g`
      : '—';
    const stage   = batch.current_stage ?? '—';
    const pigBreed = batch.pig_prefix === 'BH' ? 'Bangkal Hitam' : (batch.pig_prefix ?? '');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Label — ${batch.batch_code}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #fff; font-family: 'Helvetica Neue', Arial, sans-serif; }
    @page { size: 70mm 40mm landscape; margin: 0; }
    .label {
      width: 70mm; height: 40mm;
      display: flex; flex-direction: row; overflow: hidden;
    }
    /* LEFT */
    .left {
      width: 23mm; flex-shrink: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 2mm 1.5mm; gap: 1mm;
      border-right: 0.3pt solid #e0e0e0;
    }
    .left img.logo { width: 20mm; height: auto; object-fit: contain; }
    .left img.qr   { width: 13mm; height: 13mm; }
    /* RIGHT */
    .right {
      flex: 1; display: flex; flex-direction: column; justify-content: center;
      padding: 2mm 2mm 2mm 1.5mm; gap: 0.3mm;
    }
    .product-name { font-size: 9.5pt; font-weight: 900; color: #111; text-transform: uppercase; line-height: 1.1; }
    .batch-code   { font-family: 'Courier New', monospace; font-size: 5.5pt; color: #555; margin-top: 0.5mm; }
    hr.div        { border: none; border-top: 0.3pt solid #ddd; margin: 1mm 0; }
    .row          { display: flex; gap: 2.5mm; align-items: flex-start; }
    .field        { display: flex; flex-direction: column; }
    .lbl          { font-size: 4.5pt; color: #aaa; text-transform: uppercase; letter-spacing: 0.04em; }
    .val          { font-size: 6.5pt; font-weight: 700; color: #111; }
    .val.ready    { color: #2e7d32; }
    .val.stage    { color: #7b4f1e; font-weight: 600; }
    .storage      { font-size: 4.5pt; color: #888; margin-top: 0.8mm; }
  </style>
</head>
<body>
  <div class="label">
    <div class="left">
      <img class="logo" src="data:image/png;base64,LOGO_PLACEHOLDER" alt="Atelier by Richard" />
      ${qrDataUrl ? `<img class="qr" src="${qrDataUrl}" alt="QR" />` : ''}
    </div>
    <div class="right">
      <div class="product-name">${product?.name ?? '—'}${pigBreed ? `<br><span style="font-size:7.5pt">${pigBreed}</span>` : ''}</div>
      <div class="batch-code">${batch.batch_code}</div>
      <hr class="div" />
      <div class="row">
        <div class="field"><span class="lbl">MFD</span><span class="val">${fmtDate(batch.start_date)}</span></div>
        <div class="field"><span class="lbl">BBD</span><span class="val ready">${fmtDate(batch.ready_date)}</span></div>
        <div class="field"><span class="lbl">Stage</span><span class="val stage">${stage}</span></div>
      </div>
      <div class="row" style="margin-top:1mm; gap:2.5mm">
        <div class="field"><span class="lbl">Initial weight</span><span class="val">${weightG}</span></div>
        <div class="field"><span class="lbl">Target weight</span><span class="val ready">${targetWeightG}</span></div>
      </div>
      <div class="storage">Store at 12–16 °C · 70–80% humidity</div>
    </div>
  </div>
  <script>window.onload = function () { window.print(); window.onafterprint = function () { window.close(); }; };<\/script>
</body>
</html>`;
  }

  function handlePrint() {
    const qrDataUrl = canvasRef.current?.toDataURL() ?? '';
    const win = window.open('', '_blank', 'width=600,height=400');
    win.document.write(buildLabelHTML(qrDataUrl));
    win.document.close();
    onClose?.();
  }

  async function handleSaveImage() {
    const qrDataUrl = canvasRef.current?.toDataURL() ?? '';

    // Draw the label onto an offscreen canvas (at 8px per mm → 62×29mm = 496×232px)
    const PX_PER_MM = 8;
    const W = 62 * PX_PER_MM;   // 496
    const H = 29 * PX_PER_MM;   // 232

    const c = document.createElement('canvas');
    c.width  = W;
    c.height = H;
    const ctx = c.getContext('2d');

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // QR code image
    const qrSize = 23 * PX_PER_MM;   // 184px
    const qrX    = 2  * PX_PER_MM;   // 16px
    const qrY    = 3  * PX_PER_MM;   // 24px
    if (qrDataUrl) {
      await new Promise((res) => {
        const img = new Image();
        img.onload = () => { ctx.drawImage(img, qrX, qrY, qrSize, qrSize); res(); };
        img.src = qrDataUrl;
      });
    }

    // Text area
    const textX = (2 + 23 + 2.5) * PX_PER_MM;  // after QR + gap

    ctx.textBaseline = 'top';

    // Brand
    ctx.fillStyle = '#78716c';
    ctx.font = `${3.5 * PX_PER_MM * 0.55}px Arial`;
    ctx.fillText('ATELIER BY RICHARD', textX, 2.5 * PX_PER_MM);

    // Product name
    ctx.fillStyle = '#1c1917';
    ctx.font = `bold ${6 * PX_PER_MM * 0.55}px Arial`;
    ctx.fillText(product?.name ?? '—', textX, 5.5 * PX_PER_MM);

    // Batch code
    ctx.fillStyle = '#44403c';
    ctx.font = `${5 * PX_PER_MM * 0.55}px 'Courier New', monospace`;
    ctx.fillText(batch.batch_code, textX, 12 * PX_PER_MM);

    // Dates
    const labelFont = `${3.5 * PX_PER_MM * 0.55}px Arial`;
    const valFont   = `bold ${4.5 * PX_PER_MM * 0.55}px Arial`;

    ctx.fillStyle = '#a8a29e';
    ctx.font = labelFont;
    ctx.fillText('PROD.', textX, 17 * PX_PER_MM);
    ctx.fillText('READY', textX + 14 * PX_PER_MM, 17 * PX_PER_MM);

    ctx.fillStyle = '#292524';
    ctx.font = valFont;
    ctx.fillText(fmtDate(batch.start_date), textX, 20 * PX_PER_MM);
    ctx.fillText(fmtDate(batch.ready_date), textX + 14 * PX_PER_MM, 20 * PX_PER_MM);

    // Trigger download
    const link = document.createElement('a');
    link.download = `${batch.batch_code}.png`;
    link.href = c.toDataURL('image/png');
    link.click();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-xs space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-semibold text-stone-900 text-sm">Print label</h3>

        {/* Preview */}
        <div className="border border-stone-200 rounded-lg p-3 flex items-center gap-3 bg-stone-50">
          <canvas ref={canvasRef} className="w-16 h-16 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-stone-400 uppercase tracking-wide">Atelier by Richard</p>
            <p className="font-bold text-stone-900 text-sm truncate">{product?.name ?? '—'}</p>
            <p className="font-mono text-xs text-stone-500">{batch.batch_code}</p>
            <div className="flex gap-3 mt-1">
              <span className="text-[10px] text-stone-400">Prod. {fmtDate(batch.start_date)}</span>
              <span className="text-[10px] text-stone-400">Ready {fmtDate(batch.ready_date)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={handleSaveImage}
            className="btn-primary w-full text-sm"
          >
            📱 Save image (iPhone → iPrint&Label)
          </button>
          <button
            onClick={handlePrint}
            className="btn-secondary w-full text-sm"
          >
            🖥 Print directly (Mac)
          </button>
        </div>

        <p className="text-xs text-stone-400 leading-relaxed">
          On iPhone: save the image, open it in the <strong>Brother iPrint&Label</strong> app, and print to your B3S via Bluetooth.
        </p>

        <button onClick={onClose} className="text-xs text-stone-400 w-full text-center hover:text-stone-600">
          Cancel
        </button>
      </div>
    </div>
  );
}
