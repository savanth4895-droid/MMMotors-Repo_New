import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { salesApi, customersApi, vehiclesApi, partsApi, errMsg} from '../api/client';
import { upiQrHtml } from '../utils/upi';
import { Btn, GhostBtn, Field, Skeleton, Empty, ApiError, useSortable } from '../components/ui';
import { notifyLowStock } from '../utils/lowStockToast';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';
import FileUpload from '../components/FileUpload';
import { escapeDeep } from '../utils/escapeHtml';
import { useDraft, DraftBar } from '../hooks/useDraft';
import { useBadges, CustomerBadges } from '../hooks/useBadges';

// ── Helpers ──────────────────────────────────────────────────────────
function sendWA(mobile, msg) {
  if (!mobile) return toast.error('No mobile number saved');
  const cleanMobile = String(mobile).replace(/\D/g, '');
  window.open(`https://wa.me/91${cleanMobile}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ── Sale invoice print ───────────────────────────────────────────────
// Used by both the PDF button in the sales table and Print in the sale record.
function printSaleInvoice(rawSale) {
  const sale = escapeDeep(rawSale);
  const RS = '\u20b9';
  const fmt = n => Number(n||0).toLocaleString('en-IN');
  const nominee = sale.nominee || {};
  const total = sale.total_amount || 0;
  const totalStr = fmt(total);

  // amount in words (simple)
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function numWords(n) {
    n = Math.round(n);
    if (n === 0) return 'Zero';
    if (n < 0) return 'Minus ' + numWords(-n);
    let w = '';
    if (n >= 10000000) { w += numWords(Math.floor(n/10000000)) + ' Crore '; n %= 10000000; }
    if (n >= 100000)   { w += numWords(Math.floor(n/100000))   + ' Lakh '; n %= 100000; }
    if (n >= 1000)     { w += numWords(Math.floor(n/1000))     + ' Thousand '; n %= 1000; }
    if (n >= 100)      { w += ones[Math.floor(n/100)]          + ' Hundred '; n %= 100; }
    if (n >= 20)       { w += tens[Math.floor(n/10)]; if (n%10) w += ' ' + ones[n%10]; }
    else if (n > 0)    { w += ones[n]; }
    return w.trim();
  }
  const amtWords = numWords(total) + ' Rupees Only';

  // Fittings are listed separately below, never as a price row: the sale total is typed
  // by the salesperson and adding a row here would stop the invoice adding up.
  const fittingRows = (sale.fittings || []).map(ft => `
    <tr>
      <td style="padding:6px 14px;font-size:11px;border-bottom:1px solid #eee">${ft.name}${ft.part_number ? ` <span style="color:#888">(${ft.part_number})</span>` : ''}</td>
      <td style="padding:6px 14px;font-size:11px;text-align:center;border-bottom:1px solid #eee">${ft.qty}</td>
      <td style="padding:6px 14px;font-size:11px;text-align:right;border-bottom:1px solid #eee">${ft.complimentary ? 'Free' : `${RS}${fmt((ft.unit_price||0) * (ft.qty||0))}`}</td>
    </tr>`).join('');
  const fittingsBlock = fittingRows ? `
    <div style="margin-top:18px">
      <div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#555;margin-bottom:6px">Fittings supplied with this vehicle</div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #eee">
        <thead><tr style="background:#fafafa">
          <th style="padding:6px 14px;font-size:10px;text-align:left;color:#666">Item</th>
          <th style="padding:6px 14px;font-size:10px;text-align:center;color:#666">Qty</th>
          <th style="padding:6px 14px;font-size:10px;text-align:right;color:#666">Value</th>
        </tr></thead>
        <tbody>${fittingRows}</tbody>
      </table>
    </div>` : '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>Invoice ${sale.invoice_number}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#111;background:#fff}
    .page{max-width:700px;margin:0 auto;padding:0}
    .topbar{background:#1a1a1a;height:10px}
    .goldbar{background:#B8860B;height:3px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;padding:16px 24px 14px;border-bottom:1.5px solid #B8860B}
    .brand{font-size:22px;font-weight:900;color:#1a1a1a;letter-spacing:-.5px}
    .brand-sub{font-size:9px;color:#888;margin-top:3px;letter-spacing:.04em}
    .inv-label{font-size:9px;color:#888;font-weight:700;letter-spacing:.1em;text-transform:uppercase;text-align:right}
    .inv-no{font-size:18px;font-weight:800;color:#B8860B;text-align:right}
    .inv-date{font-size:9px;color:#888;text-align:right;margin-top:3px}
    .body{padding:20px 24px}
    .sec-lbl{font-size:8px;font-weight:800;color:#B8860B;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px;padding-bottom:3px;border-bottom:1px solid #e8d090}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:18px}
    .info-box{background:#f9f9f9;border:1px solid #e5e5e5;border-radius:4px;padding:12px 14px}
    .irow{display:flex;padding:5px 0;border-bottom:1px solid #eee;font-size:11px}
    .irow:last-child{border-bottom:none}
    .irow .lbl{width:110px;color:#888;flex-shrink:0;font-size:10px}
    .irow .val{font-weight:600;word-break:break-word;color:#111}
    .nom-box{display:grid;grid-template-columns:1fr 1fr 80px 1fr;background:#f9f9f9;border:1px solid #e5e5e5;border-radius:4px;margin-bottom:18px}
    .nom-cell{padding:10px 12px;border-right:1px solid #eee}
    .nom-cell:last-child{border-right:none}
    .nom-cell .lbl{font-size:9px;color:#888;margin-bottom:4px}
    .nom-cell .val{font-size:11px;font-weight:600}
    .desc-tbl{width:100%;border-collapse:collapse;margin-bottom:0}
    .desc-tbl th{background:#1a1a1a;color:#fff;padding:8px 12px;font-size:9px;letter-spacing:.08em;font-weight:700;text-align:left}
    .desc-tbl th:last-child{text-align:right}
    .desc-tbl td{padding:7px 14px;font-size:11px;border-bottom:1px solid #eee}
    .amt-tbl{width:100%;border-collapse:collapse;margin-bottom:0}
    .amt-tbl td{padding:6px 14px;font-size:11px;border-bottom:1px solid #eee}
    .total-box{background:#f5e6c0;border:1.5px solid #B8860B;border-radius:3px;padding:8px 14px;text-align:right;margin-top:2px}
    .total-lbl{font-size:9px;color:#7a5800;font-weight:700;letter-spacing:.08em}
    .total-val{font-size:16px;font-weight:900;color:#1a1a1a}
    .sig-row{display:flex;justify-content:space-between;align-items:flex-end;margin:22px 0 0;padding-top:12px;border-top:1px solid #ddd}
    .sig-col{text-align:center}
    .sig-col .sig-line{width:120px;border-bottom:1px solid #555;margin:0 auto 5px}
    .sig-col .sig-lbl{font-size:9px;color:#888}
    .sig-col .sig-name{font-size:10px;font-weight:700;color:#1a1a1a;margin-top:2px}
    .sched-wrap{margin-top:20px;border:1px solid #ddd;border-radius:3px;overflow:hidden}
    .sched-hdr{background:#1a1a1a;padding:9px 14px;display:flex;align-items:center;gap:0}
    .sched-hdr-gold{background:#B8860B;height:3px;margin-bottom:0}
    .sched-title{color:#fff;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
    .dear-box{background:#fdf8ec;border-bottom:1px solid #e8d090;padding:10px 14px;font-size:10px;color:#5a4800}
    .sched-tbl{width:100%;border-collapse:collapse}
    .sched-tbl th{background:#1a1a1a;color:#fff;padding:8px 12px;font-size:9px;letter-spacing:.08em;font-weight:700;text-align:left}
    .sched-tbl td{padding:8px 12px;font-size:11px;border-bottom:1px solid #eee}
    .sched-tbl tr:nth-child(even) td{background:#fafafa}
    .sched-note{background:#fdf8ec;border-top:1.5px solid #B8860B;padding:7px 14px;font-size:9.5px;font-weight:700;color:#7a5800;text-align:center}
    .sched-footer{display:flex;justify-content:space-between;padding:7px 14px;font-size:9.5px;color:#777;border-top:1px solid #eee}
    .thankyou{text-align:center;padding:12px 0 4px;font-size:13px;font-weight:900;color:#1a1a1a}
    .thankyou-sub{text-align:center;font-size:9.5px;color:#888;font-style:italic;padding-bottom:2px}
    .thankyou-pts{text-align:center;font-size:9.5px;color:#666;padding-bottom:10px}
    .page-footer{background:#1a1a1a;color:#777;font-size:8px;display:flex;justify-content:space-between;padding:7px 24px;margin-top:0}
    @media print{body{margin:0}@page{margin:0}}
  </style></head><body>
  <div class="page">
    <div class="topbar"></div>
    <div class="goldbar"></div>
    <div class="hdr">
      <div>
        <div class="brand">MM MOTORS</div>
        <div class="brand-sub">MULTI-BRAND DEALERSHIP &nbsp;·&nbsp; MALUR</div>
      </div>
      <div>
        <div class="inv-label">Sale Invoice</div>
        <div class="inv-no">${sale.invoice_number||'—'}</div>
        <div class="inv-date">Date: ${sale.sale_date||new Date().toLocaleDateString('en-IN')}</div>
      </div>
    </div>

    <div class="body">
      <div class="info-grid">
        <div class="info-box">
          <div class="sec-lbl">Customer Details</div>
          <div class="irow"><div class="lbl">Name</div><div class="val">${sale.customer_name||'—'}</div></div>
          <div class="irow"><div class="lbl">C/O</div><div class="val">${sale.care_of||sale.customer_care_of||'—'}</div></div>
          <div class="irow"><div class="lbl">Mobile</div><div class="val">${sale.customer_mobile||'—'}</div></div>
          <div class="irow"><div class="lbl">Address</div><div class="val">${sale.customer_address||'—'}</div></div>
          <div class="irow"><div class="lbl">Payment</div><div class="val">${sale.payment_mode||'—'}</div></div>
        </div>
        <div class="info-box">
          <div class="sec-lbl">Vehicle Details</div>
          <div class="irow"><div class="lbl">Brand</div><div class="val">${sale.vehicle_brand||'—'}</div></div>
          <div class="irow"><div class="lbl">Model</div><div class="val">${sale.vehicle_model||'—'}</div></div>
          <div class="irow"><div class="lbl">Variant</div><div class="val">${sale.vehicle_variant||'—'}</div></div>
          <div class="irow"><div class="lbl">Colour</div><div class="val">${sale.vehicle_color||'—'}</div></div>
          <div class="irow"><div class="lbl">Financier</div><div class="val">${sale.financier||'—'}</div></div>
        </div>
      </div>

      <div class="info-grid" style="margin-bottom:18px">
        <div class="info-box">
          <div class="sec-lbl">Registration / Chassis</div>
          <div class="irow"><div class="lbl">Vehicle No.</div><div class="val">${sale.vehicle_number||'—'}</div></div>
          <div class="irow"><div class="lbl">RTO</div><div class="val">${sale.rto||'—'}</div></div>
          <div class="irow"><div class="lbl">Chassis No.</div><div class="val" style="font-family:monospace">${sale.chassis_number||'—'}</div></div>
          <div class="irow"><div class="lbl">Engine No.</div><div class="val" style="font-family:monospace">${sale.engine_number||'—'}</div></div>
        </div>
        <div class="info-box">
          <div class="sec-lbl">Nominee (Insurance)</div>
          <div class="irow"><div class="lbl">Name</div><div class="val">${nominee.name||'—'}</div></div>
          <div class="irow"><div class="lbl">Relation</div><div class="val">${nominee.relation||'—'}</div></div>
          <div class="irow"><div class="lbl">Age</div><div class="val">${nominee.age||'—'}</div></div>
          <div class="irow"><div class="lbl">Mobile</div><div class="val">${nominee.number||'—'}</div></div>
        </div>
      </div>

      <table class="desc-tbl" style="margin-bottom:2px">
        <thead>
          <tr>
            <th style="width:35%">DESCRIPTION</th>
            <th style="width:22%">CHASSIS / DETAILS</th>
            <th style="width:13%">PAYMENT</th>
            <th style="width:14%">MODE</th>
            <th style="width:16%;text-align:right">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background:#f7f7f4">
            <td>
              <div style="font-weight:700;font-size:12px">${sale.vehicle_brand||''} ${sale.vehicle_model||''}</div>
              <div style="font-size:10px;color:#888;margin-top:2px">${[sale.vehicle_variant,sale.vehicle_color].filter(Boolean).join('  ·  ')}</div>
            </td>
            <td style="font-family:monospace;font-size:10px">${sale.chassis_number||'—'}</td>
            <td>${sale.payment_mode||'—'}</td>
            <td>Full Payment</td>
            <td style="text-align:right;font-weight:800;font-size:13px;color:#B8860B">${RS}${fmt(total)}</td>
          </tr>
        </tbody>
      </table>
      <div style="border-top:1px solid #c0a040;margin-bottom:6px"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-size:10px;font-style:italic;color:#888">${amtWords}</div>
        <div class="total-box">
          <div class="total-lbl">TOTAL AMOUNT</div>
          <div class="total-val">${RS}${totalStr}</div>
        </div>
      </div>

      ${upiQrHtml({ note: `Invoice ${sale.invoice_number || ''}`.trim() })}

      ${fittingsBlock}

      <div class="sig-row">
        <div class="sig-col" style="text-align:left">
          <div class="sig-line" style="margin:0 0 5px 0"></div>
          <div class="sig-lbl">Customer's Signature</div>
          <div class="sig-name">${(sale.customer_name||'').toUpperCase()}</div>
        </div>
        <div class="sig-col">
          <div class="sig-lbl" style="margin-bottom:0">Sold by: ${sale.sold_by||sale.staff_name||'MM MOTORS'}</div>
        </div>
        <div class="sig-col" style="text-align:right">
          <div class="sig-line" style="margin:0 0 5px auto"></div>
          <div class="sig-lbl">Authorised Signatory</div>
          <div class="sig-name">MM MOTORS</div>
        </div>
      </div>

      <div class="sched-wrap">
        <div style="background:#B8860B;height:3px"></div>
        <div class="sched-hdr"><span class="sched-title">Service Schedule</span></div>
        <div class="dear-box">
          <strong>DEAR VALUED CUSTOMER,</strong><br/>
          We thank you for choosing our world-class vehicle. To ensure optimal performance and longevity,
          please follow the service schedule below for a pleasant riding experience at all times.
        </div>
        <table class="sched-tbl">
          <thead>
            <tr><th>SERVICE DATE</th><th>SERVICE TYPE</th><th>RECOMMENDED SCHEDULE</th></tr>
          </thead>
          <tbody>
            <tr><td style="font-family:monospace;color:#888">__/__/____</td><td style="font-weight:700;color:#B8860B">FIRST SERVICE</td><td>500-700 kms or 15-30 days</td></tr>
            <tr><td style="font-family:monospace;color:#888">__/__/____</td><td style="font-weight:700;color:#B8860B">SECOND SERVICE</td><td>3000-3500 kms or 30-90 days</td></tr>
            <tr><td style="font-family:monospace;color:#888">__/__/____</td><td style="font-weight:700;color:#B8860B">THIRD SERVICE</td><td>6000-6500 kms or 90-180 days</td></tr>
            <tr><td style="font-family:monospace;color:#888">__/__/____</td><td style="font-weight:700;color:#B8860B">FOURTH SERVICE</td><td>9000-9500 kms or 180-270 days</td></tr>
          </tbody>
        </table>
        <div class="sched-note">IMPORTANT: Follow whichever milestone comes first (km or days)</div>
        <div class="sched-footer">
          <span>* Trusted Dealer</span><span>* 24/7 Service Support</span><span>* Quality Guaranteed</span>
        </div>
        <div class="thankyou">Thank You for Choosing M M Motors!</div>
        <div class="thankyou-sub">Your trust drives our excellence in two-wheeler sales and service.</div>
        <div class="thankyou-pts">* Premium Quality &nbsp; * Expert Service &nbsp; * Customer First</div>
      </div>
    </div>

    <div class="goldbar"></div>
    <div class="page-footer">
      <span>This is a computer-generated document. No signature required if digitally authenticated.</span>
      <span>MM Motors &nbsp;·&nbsp; Malur &nbsp;·&nbsp; Multi-brand Dealership</span>
    </div>
  </div>
  <script>window.onload=()=>{window.print();}</script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) return toast.error('Popup blocked — allow popups for this site');
  w.document.write(html);
  w.document.close();
}

// ── Invoice modal ────────────────────────────────────────────────────
function InvoiceModal({ sale, onClose }) {
  const [notes, setNotes] = useState(sale.notes || '');
  const recordSale = sale;

  const print = () => printSaleInvoice(recordSale);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog record" role="dialog" aria-modal="true" aria-labelledby="sale-record-title"
        onClick={e=>e.stopPropagation()}>
        <div className="record-head">
          <div>
            <h2 id="sale-record-title" className="record-title">Sale Record</h2>
            <div className="mono record-id">{sale.invoice_number}</div>
          </div>
          <button type="button" className="record-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="record-body">
          <dl className="record-list">
          {[
            ['Sales Date',     sale.sale_date || '—'],
            ['Name',           sale.customer_name || '—'],
            ['C/O',            sale.care_of || sale.customer_care_of || '—'],
            ['Mobile Number',  sale.customer_mobile || '—'],
            ['Address',        sale.customer_address || '—'],
            ['Brand',          sale.vehicle_brand || '—'],
            ['Model',          sale.vehicle_model || '—'],
            ['Variant',        sale.vehicle_variant || '—'],
            ['Colour',         sale.vehicle_color || '—'],
            ['Vehicle No',     sale.vehicle_number || '—'],
            ['Chassis No',     sale.chassis_number || '—'],
            ['Engine No',      sale.engine_number || '—'],
            ['RTO',            sale.rto || '—'],
            ['HP (Financier)', sale.financier || '—'],
            ['Nominee Name',   sale.nominee?.name || '—'],
            ['Relation',       sale.nominee?.relation || '—'],
            ['Age',            sale.nominee?.age || '—'],
            ['Number',         sale.nominee?.number || '—'],
            ['Total Amount',   sale.total_amount ? `₹${sale.total_amount.toLocaleString('en-IN')}` : '—'],
            ['Payment Mode',   sale.payment_mode || '—'],
          ].map(([l,v]) => (
            <div key={l} className="record-row">
              <dt>{l}</dt>
              <dd>{v}</dd>
            </div>
          ))}
          </dl>
          {/* Notes field */}
          <div className="field record-notes">
            <label className="field-label" htmlFor="sale-record-notes">Notes</label>
            <textarea
              id="sale-record-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Additional notes for this sale…"
            />
          </div>
        </div>

        <div className="record-foot">
          <Btn onClick={print}>Print</Btn>
          <GhostBtn onClick={()=>sendWA(sale.customer_mobile,`Dear ${sale.customer_name}, your vehicle documentation is ready. Thank you for choosing MM Motors!`)}>WhatsApp</GhostBtn>
          <GhostBtn onClick={() => {
            const lines = [
              `Invoice    : ${sale.invoice_number || '—'}`,
              `Date       : ${sale.sale_date || '—'}`,
              `Name       : ${sale.customer_name || '—'}`,
              `C/O        : ${sale.care_of || sale.customer_care_of || '—'}`,
              `Mobile     : ${sale.customer_mobile || '—'}`,
              `Address    : ${sale.customer_address || '—'}`,
              `Brand      : ${sale.vehicle_brand || '—'}`,
              `Model      : ${sale.vehicle_model || '—'}`,
              `Variant    : ${sale.vehicle_variant || '—'}`,
              `Colour     : ${sale.vehicle_color || '—'}`,
              `Vehicle No : ${sale.vehicle_number || '—'}`,
              `Chassis No : ${sale.chassis_number || '—'}`,
              `Engine No  : ${sale.engine_number || '—'}`,
              `RTO        : ${sale.rto || '—'}`,
              `Financier  : ${sale.financier || '—'}`,
              `Nominee    : ${sale.nominee?.name || '—'} (${sale.nominee?.relation || '—'}, ${sale.nominee?.age || '—'})`,
              `Amount     : ${sale.total_amount ? `₹${sale.total_amount.toLocaleString('en-IN')}` : '—'}`,
              `Payment    : ${sale.payment_mode || '—'}`,
            ].join("\n");
            navigator.clipboard.writeText(lines).then(() => {
              const btn = document.activeElement;
              const orig = btn.textContent;
              btn.textContent = 'Copied!';
              setTimeout(() => { btn.textContent = orig; }, 1800);
            });
          }}>Copy</GhostBtn>
        </div>
      </div>
    </div>
  );
}

// ── Sale Wizard Form ────────────────────────────────────────────────
// ── Fittings step ────────────────────────────────────────────────────
// Accessories fitted to the bike at sale time. Stock comes off spare_parts when the
// sale saves, which is what makes the low-stock alerts work for fittings at all.
// Pre-filled from the brand's standard set so staff remove rather than remember —
// if this were four manual rows per sale it would get skipped on a busy day.
function FittingsStep({ brand, value, isLoading, onChange }) {
  const [search, setSearch] = useState('');
  const rows = value || [];

  const { data: found } = useQuery({
    queryKey: ['fitting-search', search],
    queryFn: () => partsApi.list({ search, limit: 10 }).then(r => r.data),
    enabled: search.trim().length >= 2,
  });

  const setRow = (i, patch) => onChange(rows.map((r, n) => n === i ? { ...r, ...patch } : r));
  const removeRow = (i) => onChange(rows.filter((_, n) => n !== i));
  const addPart = (p) => {
    setSearch('');
    if (rows.some(r => r.part_id === p.id)) return toast.error('Already on this sale');
    onChange([...rows, { part_id: p.id, part_number: p.part_number, name: p.name,
      qty: p.fitting_qty || 1, unit_price: p.selling_price || 0, complimentary: false }]);
  };

  const charged = rows.reduce((t, r) => t + (r.complimentary ? 0 : (Number(r.unit_price) || 0) * (Number(r.qty) || 0)), 0);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:'var(--text-xs)', color:'var(--muted)' }}>
        {isLoading ? 'Loading the standard fittings…'
          : brand ? <>Standard fittings for <strong>{brand}</strong>. Remove anything not fitted. Stock comes off when you save the sale.</>
          : 'Pick a vehicle in step 2 and its standard fittings will load here.'}
      </div>

      {rows.length === 0 ? (
        <Empty
          message="No fittings on this sale"
          sub={brand ? `No standard fittings are set up for ${brand}. Add them below, or in Parts → Edit tick the brand and check Compatible Models is empty or includes this model.` : undefined}
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fitting</th><th>Part no.</th>
                <th className="num">Qty</th><th className="num">Price each</th>
                <th>Free</th><th className="num">Line</th><th><span className="visually-hidden">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.part_id || r.part_number || i}>
                  <td className="cell-strong">{r.name}</td>
                  <td className="mono cell-muted">{r.part_number || '—'}</td>
                  <td className="num">
                    <input type="number" min="1" value={r.qty} style={{ width:64 }}
                      aria-label={`Quantity of ${r.name}`}
                      onChange={e => setRow(i, { qty: Math.max(1, parseInt(e.target.value) || 1) })} />
                  </td>
                  <td className="num">
                    <input type="number" min="0" value={r.complimentary ? 0 : r.unit_price} style={{ width:90 }}
                      disabled={r.complimentary} aria-label={`Price of ${r.name}`}
                      onChange={e => setRow(i, { unit_price: Math.max(0, parseFloat(e.target.value) || 0) })} />
                  </td>
                  <td>
                    <input type="checkbox" checked={!!r.complimentary}
                      aria-label={`${r.name} given free`}
                      onChange={e => setRow(i, { complimentary: e.target.checked })} />
                  </td>
                  <td className="num cell-amount">
                    {r.complimentary ? <span className="pill pill-dim">FREE</span>
                      : `₹${((Number(r.unit_price)||0) * (Number(r.qty)||0)).toLocaleString('en-IN')}`}
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm btn-ghost-danger"
                      aria-label={`Remove ${r.name}`} onClick={() => removeRow(i)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Field label="Add another fitting">
        <div style={{ position:'relative' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search parts by name or number…" />
          {search.trim().length >= 2 && Array.isArray(found) && found.length > 0 && (
            <div className="fitting-results">
              {found.map(p => (
                <button key={p.id} type="button" className="fitting-result" onClick={() => addPart(p)}>
                  <span>{p.name}</span>
                  <span className="cell-muted">{p.part_number} · stock {p.stock}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Field>

      {charged > 0 && (
        <div className="notice">
          Fittings charged: <strong>₹{charged.toLocaleString('en-IN')}</strong>. This is recorded and printed on the
          invoice but is <strong>not</strong> added to the sale price — type the full amount the customer pays in step 4.
        </div>
      )}
    </div>
  );
}

function SaleForm({ initial = {}, onSave, onCancel, saving }) {
  const [step, setStep] = useState(1);

  // ── Search state for customer ──────────────────────────────────────────────
  const [custSearch, setCustSearch] = useState('');
  const [custFocus, setCustFocus]   = useState(false);
  const { data: custData } = useQuery({
    queryKey: ['customers-search', custSearch],
    queryFn: () => customersApi.list({ search: custSearch || undefined, limit: 20 }).then(r => r.data),
    enabled: custSearch.length >= 1,
  });
  const custResults = Array.isArray(custData) ? custData : [];

  // ── Search state for vehicle ───────────────────────────────────────────────
  const [vehSearch, setVehSearch] = useState(
    initial?.chassis_number || (initial?.vehicle_brand ? `${initial.vehicle_brand} ${initial.vehicle_model || ''}` : '')
  );
  const [vehFocus, setVehFocus]   = useState(false);
  const { data: vehData } = useQuery({
    queryKey: ['vehicles-search', vehSearch],
    queryFn: () => vehiclesApi.list({
      search: vehSearch || undefined,
      status: 'in_stock',
      limit: 20,
    }).then(r => r.data),
    enabled: vehSearch.length >= 1,
  });
  const vehResults = Array.isArray(vehData)
    ? vehData.filter(v => v.status === 'Instock' || v.status === 'in_stock' || v.id === initial.vehicle_id)
    : [];

  const [f, setF] = useState({
    customer_id: '', customer_name: '', care_of: '', customer_mobile: '', customer_address: '',
    vehicle_id: '', vehicle_brand: '', vehicle_model: '', vehicle_variant: '', vehicle_color: '', chassis_number: '', engine_number: '',
    nominee_name: initial?.nominee?.name || '', nominee_relation: initial?.nominee?.relation || '', nominee_age: initial?.nominee?.age || '', nominee_number: initial?.nominee?.number || '',
    sale_date: new Date().toISOString().split('T')[0], sale_price: '', payment_mode: 'Cash', financier: '', sold_by: '', notes: '',
    vehicle_number: '', rto: '', hsrp_front: '', hsrp_back: '', hsrp_front_id: null, hsrp_back_id: null, hsrp_date: '', hsrp_notes: '',
    fittings: null,   // null = the standard set for this brand has not been loaded yet
    ...initial
  });

  const s = k => e => setF(p => ({ ...p, [k]: e.target.value }));

  // Draft — only for new sales (skip when editing)
  const isEdit = !!initial?.id;
  const draft  = useDraft({ key: 'mm_draft_sale', state: f, enabled: !isEdit });

  // The brand's standard fittings load as soon as the vehicle is picked, NOT when the
  // Fittings tab is opened — otherwise a sale saved without visiting that tab would
  // record no fittings and the stock would silently never come off.
  const { data: standardFittings, isLoading: fittingsLoading } = useQuery({
    queryKey: ['standard-fittings', f.vehicle_brand, f.vehicle_model],
    queryFn: () => partsApi.fittings(f.vehicle_brand, f.vehicle_model).then(r => r.data),
    enabled: !!f.vehicle_brand && f.fittings === null && !isEdit,
  });
  // Derived, not copied into state: f.fittings stays null until the user edits the list,
  // and then it wins. So an emptied list stays empty instead of refilling itself.
  const fittings = f.fittings ?? (standardFittings || []).map(sf => ({
    part_id: sf.id, part_number: sf.part_number, name: sf.name,
    qty: sf.fitting_qty || 1, unit_price: sf.selling_price || 0, complimentary: false,
  }));

  // Fields take the global field style; these stay as hooks for per-field overrides.
  const inpStyle = {};
  const dropStyle = { position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:'var(--z-dropdown)', background:'var(--color-paper)', border:'1px solid var(--color-rule-2)', borderRadius:'var(--radius-control)', boxShadow:'0 8px 20px -10px color-mix(in oklab, var(--color-ink) 30%, transparent)', maxHeight:240, overflowY:'auto' };
  const dropItemStyle = (hover) => ({ padding:'var(--space-xs) var(--space-sm)', fontSize:'var(--text-sm)', cursor:'pointer', background: hover ? 'var(--color-paper-2)' : 'transparent', borderBottom:'1px solid var(--color-rule)' });

  const handleSave = () => {
    if (!f.customer_name || !f.customer_mobile) return toast.error('Please provide Customer Name and Mobile in Step 1');
    // In edit mode, vehicle details (brand/model/chassis) are already on the record — no need to re-select
    const hasVehicleDetails = f.vehicle_brand && f.vehicle_model;
    if (!f.vehicle_id && !hasVehicleDetails) return toast.error('Please select a vehicle in Step 2');

    const payload = {
      ...f,
      nominee: {
        name: f.nominee_name,
        relation: f.nominee_relation,
        age: f.nominee_age,
        number: f.nominee_number
      },
      sale_price: parseFloat(f.sale_price) || 0,
      total_amount: parseFloat(f.sale_price) || 0,
      fittings,   // derived: the brand's standard set unless the user changed it
    };
    onSave(payload);
    if (!isEdit) draft.clearDraft();
  };

  return (
    <div className="sale-form">
      {!isEdit && (
        <DraftBar
          draft={draft}
          onRestore={(data) => setF(p => ({ ...p, ...data }))}
          onDiscard={() => {}}
        />
      )}
      {/* ── Tabs ── */}
      <div className="tabs" role="tablist" aria-label="Sale steps">
        {['CUSTOMER', 'VEHICLE', 'NOMINEE', 'PRICING', 'FITTINGS', 'HSRP'].map((t, i) => (
          <button key={t} type="button" role="tab" className="tab" aria-selected={step === i+1} onClick={() => setStep(i+1)}>
            <span className="tab-num">{i+1}</span>{t === 'HSRP' ? t : t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* ── Step 1: Customer ── */}
      {step === 1 && (
        <div style={{ display:'flex', flexDirection:'column', gap: 12 }}>
          <Field label="Search Existing Customer (Optional)">
            <div style={{ position:'relative' }}>
              <input
                value={custSearch}
                onChange={e => {
                  setCustSearch(e.target.value);
                  // Clear linked customer if user changes search
                  if (f.customer_id) setF(p => ({ ...p, customer_id: '' }));
                }}
                onFocus={() => setCustFocus(true)}
                onBlur={() => setTimeout(() => setCustFocus(false), 180)}
                placeholder="Type name or mobile to search..."
                style={inpStyle}
              />
              {custFocus && custResults.length > 0 && (
                <div style={dropStyle}>
                  {custResults.map(cust => (
                    <div key={cust.id}
                      onMouseDown={() => {
                        setF(p => ({ ...p,
                          customer_id:      cust.id,
                          customer_name:    cust.name,
                          customer_mobile:  cust.mobile,
                          customer_address: cust.address || '',
                        }));
                        setCustSearch(`${cust.name} (${cust.mobile})`);
                        setCustFocus(false);
                      }}
                      style={dropItemStyle(false)}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ fontWeight:600 }}>{cust.name}</div>
                      <div style={{ fontSize:'var(--text-xs)', color:'var(--color-muted)' }}>{cust.mobile}{cust.address ? `, ${cust.address}` : ''}</div>
                    </div>
                  ))}
                </div>
              )}
              {f.customer_id && (
                <div className="field-note is-ok" role="status">
                  ✓ Linked to existing customer
                  <button type="button" className="link-btn" onClick={() => { setF(p => ({ ...p, customer_id:'', customer_name:'', customer_mobile:'', customer_address:'' })); setCustSearch(''); }}>clear</button>
                </div>
              )}
            </div>
          </Field>
          <div className="form-grid-2col form-grid">
            <Field label="Full Name *"><input value={f.customer_name} onChange={s('customer_name')} placeholder="Customer Name" style={inpStyle} /></Field>
            <Field label="C/O (Care Of)"><input value={f.care_of} onChange={s('care_of')} placeholder="Father/Husband Name" style={inpStyle} /></Field>
            <Field label="Mobile Number *"><input value={f.customer_mobile} onChange={s('customer_mobile')} placeholder="10-digit mobile" style={inpStyle} /></Field>
            <Field label="Address"><textarea value={f.customer_address} onChange={s('customer_address')} rows={2} placeholder="Full address" style={{...inpStyle, gridColumn: 'span 2' }} /></Field>
          </div>
        </div>
      )}

      {/* ── Step 2: Vehicle ── */}
      {step === 2 && (
        <div style={{ display:'flex', flexDirection:'column', gap: 12 }}>
          <Field label="Search Vehicle by Chassis No, Brand or Model *">
            <div style={{ position:'relative' }}>
              <input
                value={vehSearch}
                onChange={e => {
                  setVehSearch(e.target.value);
                  // Only clear vehicle_id so a new pick can be made; keep field values intact for editing
                  if (f.vehicle_id) setF(p => ({ ...p, vehicle_id:'' }));
                }}
                onFocus={() => setVehFocus(true)}
                onBlur={() => setTimeout(() => setVehFocus(false), 180)}
                placeholder="Type chassis number, brand or model..."
                style={inpStyle}
              />
              {vehFocus && vehResults.length > 0 && (
                <div style={dropStyle}>
                  {vehResults.map(v => (
                    <div key={v.id}
                      onMouseDown={() => {
                        setF(p => ({ ...p,
                          vehicle_id:      v.id,
                          vehicle_brand:   v.brand,
                          vehicle_model:   v.model,
                          vehicle_variant: v.variant || '',
                          vehicle_color:   v.color || '',
                          chassis_number:  v.chassis_number || '',
                          engine_number:   v.engine_number || '',
                          fittings:        null,   // reload the standard set for this bike
                        }));
                        setVehSearch(v.chassis_number || `${v.brand} ${v.model}`);
                        setVehFocus(false);
                      }}
                      style={dropItemStyle(false)}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ fontWeight:600 }}>{v.brand} {v.model}{v.variant ? `, ${v.variant}` : ''}</div>
                      <div style={{ fontSize:'var(--text-xs)', color:'var(--color-muted)' }}><span className="mono">{v.chassis_number}</span>{v.color ? `, ${v.color}` : ''}</div>
                    </div>
                  ))}
                </div>
              )}
              {vehSearch.length > 0 && vehResults.length === 0 && (
                <div className="field-note" role="status">No in-stock vehicles found</div>
              )}
              {f.vehicle_id && (
                <div className="field-note is-ok" role="status">
                  ✓ Vehicle selected
                  <button type="button" className="link-btn" onClick={() => { setF(p => ({ ...p, vehicle_id:'', vehicle_brand:'', vehicle_model:'', vehicle_variant:'', vehicle_color:'', chassis_number:'', engine_number:'', fittings:null })); setVehSearch(''); }}>clear</button>
                </div>
              )}
            </div>
          </Field>
          <div className="form-grid-2col form-grid">
            <Field label="Brand"><input value={f.vehicle_brand} onChange={e => setF(p => ({...p, vehicle_brand: e.target.value, fittings: null}))} style={inpStyle} /></Field>
            <Field label="Model"><input value={f.vehicle_model} onChange={e => setF(p => ({...p, vehicle_model: e.target.value, fittings: null}))} style={inpStyle} /></Field>
            <Field label="Variant"><input value={f.vehicle_variant} onChange={e => setF(p => ({...p, vehicle_variant: e.target.value}))} style={inpStyle} /></Field>
            <Field label="Colour"><input value={f.vehicle_color} onChange={e => setF(p => ({...p, vehicle_color: e.target.value}))} style={inpStyle} /></Field>
            <Field label="Chassis No"><input value={f.chassis_number} onChange={e => setF(p => ({...p, chassis_number: e.target.value}))} className="mono" style={inpStyle} /></Field>
            <Field label="Engine No"><input value={f.engine_number} onChange={e => setF(p => ({...p, engine_number: e.target.value}))} className="mono" style={inpStyle} /></Field>
            <Field label="RTO Code"><input value={f.rto} onChange={s('rto')} placeholder="e.g. KA01, KA07" className="mono" style={inpStyle} /></Field>
          </div>
        </div>
      )}

      {/* ── Step 3: Insurance Nominee ── */}
      {step === 3 && (
        <div className="form-grid-2col form-grid">
          <Field label="Nominee Name"><input value={f.nominee_name} onChange={s('nominee_name')} placeholder="Full Name" style={inpStyle} /></Field>
          <Field label="Relation"><input value={f.nominee_relation} onChange={s('nominee_relation')} placeholder="Spouse, Son, Mother..." style={inpStyle} /></Field>
          <Field label="Age"><input type="number" value={f.nominee_age} onChange={s('nominee_age')} placeholder="e.g. 35" style={inpStyle} /></Field>
          <Field label="Number"><input value={f.nominee_number} onChange={s('nominee_number')} placeholder="Mobile Number" style={inpStyle} /></Field>
        </div>
      )}

      {/* ── Step 4: Pricing ── */}
      {step === 4 && (
        <div className="form-grid-2col form-grid">
          <Field label="Sale Date"><input type="date" value={f.sale_date} onChange={s('sale_date')} style={inpStyle} /></Field>
          <Field label="Sale Price (₹)"><input type="number" value={f.sale_price} onChange={s('sale_price')} placeholder="0" style={inpStyle} /></Field>
          <Field label="Payment Mode">
            <select value={f.payment_mode} onChange={s('payment_mode')} style={inpStyle}>
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="UPI">UPI</option>
              <option value="Finance">Finance</option>
              <option value="Cheque">Cheque</option>
            </select>
          </Field>
          <Field label="Financier / Bank"><input value={f.financier} onChange={s('financier')} placeholder="HDFC, Bajaj Finance..." style={inpStyle} /></Field>
          <Field label="Sold By"><input value={f.sold_by} onChange={s('sold_by')} placeholder="Salesperson Name" style={inpStyle} /></Field>
          <Field label="Notes"><textarea value={f.notes} onChange={s('notes')} rows={2} placeholder="Any additional details..." style={{...inpStyle, gridColumn: 'span 2' }} /></Field>
        </div>
      )}

      {/* ── Step 5: Fittings ── */}
      {step === 5 && (
        <FittingsStep
          brand={[f.vehicle_brand, f.vehicle_model].filter(Boolean).join(' ')}
          value={fittings}
          isLoading={fittingsLoading}
          onChange={(next) => setF(p => ({ ...p, fittings: next }))}
        />
      )}

      {/* ── Step 6: HSRP ── */}
      {step === 6 && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="form-grid-2col form-grid">
            <Field label="Reg Number"><input value={f.vehicle_number} onChange={s('vehicle_number')} className="mono" placeholder="KA01HH1234" style={inpStyle} /></Field>
            <Field label="Number Plate Issued Date"><input type="date" value={f.hsrp_date} onChange={s('hsrp_date')} style={inpStyle} /></Field>
          </div>

          {/* NEW: HSRP Text Fields */}
          <div className="form-grid-2col form-grid">
            <Field label="HSRP Front (Code)"><input value={f.hsrp_front} onChange={s('hsrp_front')} placeholder="Front Laser Code" style={inpStyle} /></Field>
            <Field label="HSRP Back (Code)"><input value={f.hsrp_back} onChange={s('hsrp_back')} placeholder="Back Laser Code" style={inpStyle} /></Field>
          </div>

          <div className="form-grid-2col form-grid">
            <FileUpload label="Upload HSRP Front Photo" existingFileId={f.hsrp_front_id || null} onUploadSuccess={(fileId) => setF(p => ({ ...p, hsrp_front_id: fileId }))} />
            <FileUpload label="Upload HSRP Back Photo" existingFileId={f.hsrp_back_id || null} onUploadSuccess={(fileId) => setF(p => ({ ...p, hsrp_back_id: fileId }))} />
          </div>

          {/* NEW: HSRP Notes */}
          <div>
            <Field label="HSRP Notes"><textarea value={f.hsrp_notes} onChange={s('hsrp_notes')} rows={2} placeholder="Courier delays, missing rivets, specific customer requests..." style={{...inpStyle, width: '100%'}} /></Field>
          </div>
        </div>
      )}

      {/* ── Navigation Buttons ── */}
      <div className="form-actions">
        <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
        <div className="form-actions-end">
          {step > 1 && <GhostBtn onClick={() => setStep(s => s - 1)}>Back</GhostBtn>}
          {step < 6
            ? <Btn onClick={() => setStep(s => s + 1)}>Next</Btn>
            : <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Sale'}</Btn>
          }
        </div>
      </div>

    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────
export default function SalesPage() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { byName, badgesFor } = useBadges();
  const [showAdd, setShowAdd] = useState(false);
  const [editSale, setEditSale] = useState(null);
  const [selSale, setSelSale] = useState(null);
  const [search, setSearch]   = useState('');
  const [fittingFilter, setFittingFilter] = useState(false);
  const [sheetFilter, setSheetFilter]     = useState(false);

  const { data:stats } = useQuery({
    queryKey:['sales-stats'],
    refetchInterval: 30_000,
    queryFn: () => salesApi.stats().then(r=>r.data),
  });

  const { data, isLoading, error } = useQuery({
    queryKey:['sales', search],
    queryFn: () => salesApi.list({ search: search||undefined, limit:1000 }).then(r=>r.data),
  });

const createMut = useMutation({
    mutationFn: async (d) => {
      let payload = { ...d };

      // Find existing customer by mobile, or create new one — prevents duplicates
      if (!payload.customer_id) {
        const existing = await customersApi.list({ search: payload.customer_mobile, limit: 1 }).then(r => r.data);
        const match = Array.isArray(existing) ? existing.find(c => c.mobile === payload.customer_mobile) : null;
        if (match) {
          payload.customer_id = match.id;
        } else {
          const custRes = await customersApi.create({
            name: payload.customer_name,
            mobile: payload.customer_mobile,
            address: payload.customer_address,
          });
          payload.customer_id = custRes.data.id;
        }
      }

      return salesApi.create(payload);
    },
    onSuccess: (res) => {
      qc.invalidateQueries(['sales']);
      qc.invalidateQueries(['sales-stats']);
      qc.invalidateQueries(['customers']); // Instantly refresh the customer dropdown
      qc.invalidateQueries(['parts']);
      qc.invalidateQueries(['parts-stats']);
      setShowAdd(false);
      toast.success('Sale recorded');
      notifyLowStock(res?.data?.low_stock_alerts);
      const pending = res?.data?.pending_fittings;
      if (Array.isArray(pending) && pending.length > 0) {
        toast(`Sold without ${pending.map(p => p.name).join(', ')} — marked on the sales list`,
          { duration: 8000, icon: '⚠' });
      }
      if (res?.data?.sheet_ok === false) {
        toast('Saved here, but not written to the Google Sheet. Use the ⟳ on the row to retry.',
          { duration: 8000, icon: '⟳' });
      }
    },
    onError: e => {
      // Unmasks the real error from the backend instead of just saying "Failed"
      const errorMsg = typeof e?.response?.data?.detail === 'string'
        ? e.response.data.detail
        : JSON.stringify(e?.response?.data) || e.message || 'Failed';
      toast.error(errorMsg);
    }
  });

  const updateMut = useMutation({
    mutationFn: ({id,d}) => salesApi.update(id,d),
    onSuccess: (res) => {
      qc.invalidateQueries(['sales']);
      qc.invalidateQueries(['sales-stats']);
      qc.invalidateQueries(['parts']);
      qc.invalidateQueries(['parts-stats']);
      setEditSale(null);
      toast.success('Updated');
      notifyLowStock(res?.data?.low_stock_alerts);
    },
    onError: e => {
      const errorMsg = typeof e?.response?.data?.detail === 'string'
        ? e.response.data.detail
        : JSON.stringify(e?.response?.data) || e.message || 'Failed';
      toast.error(errorMsg);
    }
  });

  const sheetMut = useMutation({
    mutationFn: id => salesApi.syncSheet(id),
    onSuccess: () => { qc.invalidateQueries(['sales']); toast.success('Saved to the Google Sheet'); },
    onError:   e => toast.error(errMsg(e, 'Sheet still unreachable')),
  });
  // Clears the pending-fitting marker and finishes the stock deduction.
  const fittedMut = useMutation({
    mutationFn: ({ id }) => salesApi.markFitted(id),
    onSuccess: (res) => {
      qc.invalidateQueries(['sales']); qc.invalidateQueries(['parts']); qc.invalidateQueries(['parts-stats']);
      toast.success('Fittings marked as fitted');
      notifyLowStock(res?.data?.low_stock_alerts);
    },
    onError: e => toast.error(errMsg(e, 'Could not update')),
  });

  const allSales    = Array.isArray(data) ? data : [];
  const isPending   = s => (s.pending_fittings || []).length > 0;
  const pendingCount = allSales.filter(isPending).length;
  // Only a recorded error counts as unsynced. An install with no sheet configured never
  // attempts a sync, so the field is absent and no sale is wrongly marked.
  const notInSheet  = s => !!s.sheet_sync_error;
  const unsyncedCount = allSales.filter(notInSheet).length;
  const sales = fittingFilter ? allSales.filter(isPending)
              : sheetFilter   ? allSales.filter(notInSheet)
              : allSales;
  const { sorted: sortedSales, Th: SalesTh } = useSortable(sales, 'sale_date', 'desc');
  const st = stats || {};

  return (
    <div>
      {selSale && <InvoiceModal sale={selSale} onClose={()=>setSelSale(null)} />}
      {/* Edit Sale Modal */}
      {editSale && (
        <div className="dialog-backdrop" onClick={() => setEditSale(null)}>
          <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="edit-sale-title"
            onClick={e=>e.stopPropagation()}>
            <h2 id="edit-sale-title" className="dialog-title">Edit Sale Record</h2>
            <SaleForm initial={editSale} onSave={d => updateMut.mutate({ id: editSale.id, d })} onCancel={() => setEditSale(null)} saving={updateMut.isPending} />
          </div>
        </div>
      )}

      {/* Stats Row */}
      <section className="stat-strip" aria-label="Sales figures">
        <div className="stat">
          <span className="stat-label">Total Revenue</span>
          <span className="stat-value">₹{st.total_revenue > 1000 ? (st.total_revenue/1000).toFixed(0)+'K' : (st.total_revenue||0)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Total Invoices</span>
          <span className="stat-value">{st.total_count||0}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Pending Delivery</span>
          <span className="stat-value" style={st.pending_delivery > 0 ? { color:'var(--color-warn)' } : undefined}>{st.pending_delivery||0}</span>
        </div>
      </section>

      {/* Add New Sale Form */}
      {showAdd && (
        <section className="page-panel" aria-labelledby="new-sale-title">
          <h2 id="new-sale-title" className="page-panel-title">New Sale</h2>
          <SaleForm onSave={d=>createMut.mutate(d)} onCancel={()=>setShowAdd(false)} saving={createMut.isPending} />
        </section>
      )}

      {/* Toolbar */}
      <div className="page-toolbar">
        <input type="search" className="page-search" aria-label="Search sales" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search invoices, customer, vehicle…" />
        {pendingCount > 0 && (
          <button type="button" className="chip" aria-pressed={fittingFilter}
            onClick={()=>{ setFittingFilter(v=>!v); setSheetFilter(false); }}>
            ⚠ Fitting pending ({pendingCount})
          </button>
        )}
        {unsyncedCount > 0 && (
          <button type="button" className="chip" aria-pressed={sheetFilter}
            onClick={()=>{ setSheetFilter(v=>!v); setFittingFilter(false); }}>
            ⟳ Not in sheet ({unsyncedCount})
          </button>
        )}
        <Btn style={{ marginLeft:'auto' }} onClick={()=>setShowAdd(v=>!v)}>+ New Sale</Btn>
      </div>

      {/* Data Table */}
      {error ? <div style={{ padding:20 }}><ApiError error={error}/></div>
        : isLoading ? <div className="table-skeleton">{[1,2,3].map(i=><Skeleton key={i} h={44}/>)}</div>
        : sales.length===0 ? <Empty message="No sales found" sub={search ? 'Try another invoice number, name or chassis.' : 'Record the first sale with New Sale.'} />
        : (
          <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {[['Invoice #','invoice_number'],['Date','sale_date'],['Customer','customer_name'],['Mobile','customer_mobile'],['Vehicle','vehicle_model'],['Vehicle No','vehicle_number'],['Amount','total_amount'],['Payment','payment_mode'],['Status','status'],['','']].map(([h,f])=>(
                  <SalesTh key={h} field={f||null} className={f === 'total_amount' ? 'num' : undefined}>{h || <span className="visually-hidden">Actions</span>}</SalesTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedSales.map(s => (
                <tr key={s.id}>
                  <td className="mono cell-id">
                    {s.invoice_number}
                    {isPending(s) && (
                      <button
                        type="button"
                        className="fitting-warn"
                        disabled={fittedMut.isPending}
                        title={`Sold without: ${(s.pending_fittings||[]).map(p => `${p.name} ×${p.qty_short}`).join(', ')}. Click once fitted.`}
                        aria-label={`${s.invoice_number} is missing ${(s.pending_fittings||[]).map(p => p.name).join(', ')}. Mark as fitted.`}
                        onClick={async () => {
                          const names = (s.pending_fittings||[]).map(p => `${p.name} ×${p.qty_short}`).join(', ');
                          if (await confirm(`Mark as fitted on ${s.invoice_number}?\n\n${names}\n\nThis takes the stock off now.`, { danger:false })) {
                            fittedMut.mutate({ id: s.id });
                          }
                        }}
                      >⚠</button>
                    )}
                    {notInSheet(s) && (
                      <button
                        type="button"
                        className="sheet-warn"
                        disabled={sheetMut.isPending}
                        title={`Not saved to the Google Sheet: ${s.sheet_sync_error}. Click to try again.`}
                        aria-label={`${s.invoice_number} is not in the Google Sheet. Try again.`}
                        onClick={() => sheetMut.mutate(s.id)}
                      >⟳</button>
                    )}
                  </td>
                  <td className="cell-muted cell-nowrap">{s.sale_date?.slice(0,11)}</td>
                  <td className="cell-strong">
                    <span style={{ verticalAlign:'middle' }}>{s.customer_name}</span>
                    <CustomerBadges names={badgesFor(s.customer_mobile)} byName={byName} compact />
                  </td>
                  <td className="mono cell-nowrap">{s.customer_mobile || '—'}</td>
                  <td className="cell-muted">{s.vehicle_brand} {s.vehicle_model}</td>
                  <td className="mono cell-nowrap">{s.vehicle_number || '—'}</td>
                  <td className="num cell-amount">₹{s.total_amount?.toLocaleString('en-IN')||0}</td>
                  <td>{s.payment_mode}</td>

                  {/* Status Badge */}
                  <td>
                    <span className={`pill ${s.status==='completed' || s.status==='delivered' ? 'pill-green' : 'pill-amber'}`}>
                      {s.status==='completed' || s.status==='delivered' ? 'Delivered' : 'Pending'}
                    </span>
                  </td>

                  <td>
                    <div className="row-actions">
                      <GhostBtn sm onClick={()=>setSelSale(s)}>View</GhostBtn>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => printSaleInvoice(s)}>PDF</button>
                      <GhostBtn sm onClick={()=>setEditSale(s)}>Edit</GhostBtn>

                      {s.status !== 'completed' && s.status !== 'delivered' && (
                        <button
                          onClick={async () => {
                            if (await confirm("Mark this invoice as delivered?", { danger: false })) {
                              updateMut.mutate({ id: s.id, d: { status: 'delivered' } });
                            }
                          }}
                          type="button"
                          className="btn btn-ghost btn-sm"
                        >
                          Deliver
                        </button>
                      )}

                      <button onClick={()=>sendWA(s.customer_mobile, `Dear ${s.customer_name}, congratulations on your new ${s.vehicle_brand} ${s.vehicle_model}! Your total invoice amount is ₹${s.total_amount?.toLocaleString('en-IN')}. Thank you for choosing MM Motors!`)} type="button" className="btn btn-ghost btn-sm">WhatsApp</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
    </div>
  );
}
