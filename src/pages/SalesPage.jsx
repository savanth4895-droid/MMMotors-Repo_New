import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { salesApi, customersApi, vehiclesApi, errMsg} from '../api/client';
import { Btn, GhostBtn, Field, Skeleton, Empty, ApiError, useSortable } from '../components/ui';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';
import FileUpload from '../components/FileUpload';
import { useDraft, DraftBar } from '../hooks/useDraft';
import { useBadges, CustomerBadges } from '../hooks/useBadges';

// ── Helpers ──────────────────────────────────────────────────────────
function sendWA(mobile, msg) {
  if (!mobile) return toast.error('No mobile number saved');
  const cleanMobile = String(mobile).replace(/\D/g, '');
  window.open(`https://wa.me/91${cleanMobile}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ── Standalone client-side PDF/print ────────────────────────────────
function printSaleInvoice(sale) {
  // reuse the same logic as InvoiceModal.print but without notes state
  const RS = '\u20b9';
  const fmt = n => Number(n||0).toLocaleString('en-IN');
  const nominee = sale.nominee || {};
  const total = sale.total_amount || 0;
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
  const exShowroom  = sale.ex_showroom_price || sale.total_amount || 0;
  const insurance   = sale.insurance  || 0;
  const accessories = sale.accessories|| 0;
  const discount    = sale.discount   || 0;
  const descRows = [
    ['Ex-Showroom Price', exShowroom],
    insurance   ? ['Insurance', insurance]   : null,
    accessories ? ['Accessories',accessories]: null,
    discount    ? ['Discount', -discount]    : null,
  ].filter(Boolean).map(([l,v],i) =>
    `<tr style="background:${i%2?'#fafafa':'#fff'}">
      <td style="padding:7px 14px;font-size:11px;color:#555;border-bottom:1px solid #eee">${l}</td>
      <td style="padding:7px 14px;font-size:11px;text-align:right;border-bottom:1px solid #eee">${v<0?'− ':''}${RS}${fmt(Math.abs(v))}</td>
    </tr>`
  ).join('');

  // Use the same HTML template as InvoiceModal but get it directly via InvoiceModal's print logic
  // Simplest: open InvoiceModal data as print window
  const invoiceModal = document.createElement('div');
  invoiceModal.style.display = 'none';
  document.body.appendChild(invoiceModal);

  // Build the same HTML as InvoiceModal.print()
  const w = window.open('', '_blank');
  if (!w) return toast?.error?.('Popup blocked — allow popups for this site');

  // Trigger the InvoiceModal print by setting sale into a temporary modal
  // Actually: just duplicate the HTML building here (same as InvoiceModal)
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
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
    .irow{display:flex;justify-content:space-between;margin-bottom:4px}
    .lbl{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.04em}
    .val{font-size:11px;font-weight:600;color:#111;text-align:right}
    table{width:100%;border-collapse:collapse}
    .total-row td{font-weight:800;font-size:13px;background:#B8860B!important;color:#fff;padding:9px 14px}
    .words-row td{font-size:10px;font-style:italic;color:#555;padding:6px 14px;background:#fdf8ec;border-bottom:1px solid #e8d090}
    .sig-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:24px}
    .sig-box{text-align:center}
    .sig-line{border-top:1px solid #333;margin-bottom:4px;padding-top:4px;font-size:9px;color:#555}
    .footer{text-align:center;font-size:8px;color:#aaa;margin-top:16px;padding:12px 24px;border-top:1px solid #eee}
    @media print{body{-webkit-print-color-adjust:exact}}
  </style></head><body>
  <div class="page">
    <div class="topbar"></div><div class="goldbar"></div>
    <div class="hdr">
      <div>
        <div class="brand">MM MOTORS</div>
        <div class="brand-sub">AUTHORISED TWO-WHEELER DEALER</div>
        <div style="font-size:9px;color:#888;margin-top:2px">Bengaluru, Karnataka</div>
      </div>
      <div>
        <div class="inv-label">Tax Invoice</div>
        <div class="inv-no">${sale.invoice_number||'—'}</div>
        <div class="inv-date">${sale.sale_date||''}</div>
      </div>
    </div>
    <div class="body">
      <div class="info-grid">
        <div>
          <div class="sec-lbl">Customer</div>
          <div class="irow"><div class="lbl">Name</div><div class="val">${sale.customer_name||'—'}</div></div>
          <div class="irow"><div class="lbl">Mobile</div><div class="val">${sale.customer_mobile||'—'}</div></div>
          ${sale.customer_address ? `<div class="irow"><div class="lbl">Address</div><div class="val" style="max-width:180px;text-align:right">${sale.customer_address}</div></div>` : ''}
          ${nominee?.name ? `<div class="irow"><div class="lbl">Nominee</div><div class="val">${nominee.name}</div></div>` : ''}
        </div>
        <div>
          <div class="sec-lbl">Vehicle</div>
          <div class="irow"><div class="lbl">Brand</div><div class="val">${sale.vehicle_brand||'—'}</div></div>
          <div class="irow"><div class="lbl">Model</div><div class="val">${sale.vehicle_model||'—'}</div></div>
          ${sale.vehicle_variant ? `<div class="irow"><div class="lbl">Variant</div><div class="val">${sale.vehicle_variant}</div></div>` : ''}
          ${sale.vehicle_color   ? `<div class="irow"><div class="lbl">Colour</div><div class="val">${sale.vehicle_color}</div></div>` : ''}
          ${sale.chassis_number  ? `<div class="irow"><div class="lbl">Chassis</div><div class="val" style="font-family:monospace;font-size:10px">${sale.chassis_number}</div></div>` : ''}
          ${sale.engine_number   ? `<div class="irow"><div class="lbl">Engine</div><div class="val" style="font-family:monospace;font-size:10px">${sale.engine_number}</div></div>` : ''}
          ${sale.vehicle_number  ? `<div class="irow"><div class="lbl">Reg No.</div><div class="val" style="font-family:monospace">${sale.vehicle_number}</div></div>` : ''}
          ${sale.rto             ? `<div class="irow"><div class="lbl">RTO</div><div class="val" style="font-family:monospace">${sale.rto}</div></div>` : ''}
        </div>
      </div>
      <div class="sec-lbl" style="margin-bottom:8px">Amount Details</div>
      <table style="margin-bottom:16px">
        <thead><tr style="background:#f5f5f5"><th style="padding:7px 14px;text-align:left;font-size:9px;letter-spacing:.06em;color:#888;text-transform:uppercase">Description</th><th style="padding:7px 14px;text-align:right;font-size:9px;letter-spacing:.06em;color:#888;text-transform:uppercase">Amount</th></tr></thead>
        <tbody>
          ${descRows}
          <tr class="total-row"><td>Total Amount</td><td style="text-align:right">${RS}${fmt(total)}</td></tr>
          <tr class="words-row"><td colspan="2">${amtWords}</td></tr>
        </tbody>
      </table>
      <div class="info-grid" style="margin-bottom:0">
        <div>
          <div class="sec-lbl">Payment</div>
          <div class="irow"><div class="lbl">Mode</div><div class="val">${sale.payment_mode||'—'}</div></div>
          <div class="irow"><div class="lbl">Status</div><div class="val">${sale.status||'—'}</div></div>
        </div>
      </div>
      <div class="sig-grid">
        <div class="sig-box"><div style="height:36px"></div><div class="sig-line">Customer Signature</div></div>
        <div class="sig-box"><div style="height:36px"></div><div class="sig-line">Authorised Signatory</div></div>
        <div class="sig-box"><div style="height:36px"></div><div class="sig-line">Received By</div></div>
      </div>
    </div>
    <div class="footer">This is a computer-generated invoice. Thank you for your purchase at MM Motors.</div>
    <div class="goldbar"></div>
  </div>
  <script>window.onload=()=>{window.print();}</script>
  </body></html>`);
  w.document.close();
}

// ── Invoice modal ────────────────────────────────────────────────────
function InvoiceModal({ sale, onClose }) {
  const [notes, setNotes] = useState(sale.notes || '');

  const print = () => {
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

    const exShowroom  = sale.ex_showroom_price || sale.total_amount || 0;
    const insurance   = sale.insurance  || 0;
    const accessories = sale.accessories|| 0;
    const discount    = sale.discount   || 0;

    const descRows = [
      ['Ex-Showroom Price', exShowroom],
      insurance   ? ['Insurance', insurance]   : null,
      accessories ? ['Accessories',accessories]: null,
      discount    ? ['Discount', -discount]    : null,
    ].filter(Boolean).map(([l,v],i) =>
      `<tr style="background:${i%2?'#fafafa':'#fff'}">
        <td style="padding:7px 14px;font-size:11px;color:#555;border-bottom:1px solid #eee">${l}</td>
        <td style="padding:7px 14px;font-size:11px;text-align:right;border-bottom:1px solid #eee">${v<0?'− ':''}${RS}${fmt(Math.abs(v))}</td>
      </tr>`
    ).join('');

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
    w.document.write(html);
    w.document.close();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={onClose}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, width:'100%', maxWidth:520, display:'flex', flexDirection:'column', maxHeight:'90vh' }}
        onClick={e=>e.stopPropagation()}>
        <div style={{ background:'#1c1c20', padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div className="display" style={{ fontSize:13, color:'var(--accent)', fontWeight:700 }}>Sale Record</div>
            <div className="mono" style={{ fontSize:11, color:'#6b6460', marginTop:2 }}>{sale.invoice_number}</div>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#6b6460', cursor:'pointer', fontSize:20 }}>×</button>
        </div>

        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:0, overflowY:'auto' }}>
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
            <div key={l} style={{ display:'flex', fontSize:12, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
              <div style={{ width:140, color:'var(--muted)', flexShrink:0, fontWeight:500 }}>{l}</div>
              <div style={{ color:'var(--text)', wordBreak:'break-word' }}>{v}</div>
            </div>
          ))}
          {/* Notes field */}
          <div style={{ marginTop:14 }}>
            <div style={{ fontSize:10, letterSpacing:'.07em', textTransform:'uppercase', color:'var(--muted)', fontWeight:600, marginBottom:6 }}>Notes</div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Additional notes for this sale…"
              style={{ width:'100%', padding:'8px 10px', border:'1px solid var(--border)', borderRadius:4, background:'var(--surface2)', color:'var(--text)', fontSize:12, fontFamily:'IBM Plex Sans, sans-serif', resize:'vertical', boxSizing:'border-box' }}
            />
          </div>
        </div>

        <div style={{ padding:'16px 20px', background:'var(--surface2)', borderTop:'1px solid var(--border)', display:'flex', gap:8, flexShrink:0 }}>
          <Btn onClick={print}>Print →</Btn>
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
    ...initial
  });

  const s = k => e => setF(p => ({ ...p, [k]: e.target.value }));

  // Draft — only for new sales (skip when editing)
  const isEdit = !!initial?.id;
  const draft  = useDraft({ key: 'mm_draft_sale', state: f, enabled: !isEdit });

  const inpStyle = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3, padding:'8px 10px', color:'var(--text)', outline:'none', fontSize:13, width:'100%' };
  const dropStyle = { position:'absolute', top:'100%', left:0, right:0, zIndex:100, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:3, boxShadow:'0 4px 16px rgba(0,0,0,.12)', maxHeight:200, overflowY:'auto' };
  const dropItemStyle = (hover) => ({ padding:'8px 12px', fontSize:12, cursor:'pointer', background: hover ? 'var(--surface2)' : 'transparent', borderBottom:'1px solid var(--border)' });

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
      total_amount: parseFloat(f.sale_price) || 0 
    };
    onSave(payload);
    if (!isEdit) draft.clearDraft();
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:700 }}>
      {!isEdit && (
        <DraftBar
          draft={draft}
          onRestore={(data) => setF(p => ({ ...p, ...data }))}
          onDiscard={() => {}}
        />
      )}
      {/* ── Tabs ── */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:10, overflowX: 'auto' }}>
        {['CUSTOMER', 'VEHICLE', 'NOMINEE', 'PRICING', 'HSRP'].map((t, i) => (
          <div key={t} onClick={() => setStep(i+1)} 
            style={{ 
              padding:'10px 20px', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace: 'nowrap',
              color: step === i+1 ? 'var(--accent)' : 'var(--muted)', 
              borderBottom: step === i+1 ? '2px solid var(--accent)' : '2px solid transparent' 
            }}>
            {t}
          </div>
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
                      <div style={{ fontWeight:600, fontSize:12 }}>{cust.name}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{cust.mobile}{cust.address ? ` · ${cust.address}` : ''}</div>
                    </div>
                  ))}
                </div>
              )}
              {f.customer_id && (
                <div style={{ marginTop:6, fontSize:11, color:'var(--accent)' }}>
                  ✓ Linked to existing customer
                  <button onClick={() => { setF(p => ({ ...p, customer_id:'', customer_name:'', customer_mobile:'', customer_address:'' })); setCustSearch(''); }}
                    style={{ marginLeft:8, background:'transparent', border:'none', color:'var(--red)', cursor:'pointer', fontSize:10 }}>clear</button>
                </div>
              )}
            </div>
          </Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop: 4 }}>
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
                        }));
                        setVehSearch(v.chassis_number || `${v.brand} ${v.model}`);
                        setVehFocus(false);
                      }}
                      style={dropItemStyle(false)}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ fontWeight:600, fontSize:12 }}>{v.brand} {v.model} {v.variant ? `· ${v.variant}` : ''}</div>
                      <div style={{ fontSize:11, color:'var(--muted)', fontFamily:'IBM Plex Mono, monospace' }}>{v.chassis_number} {v.color ? `· ${v.color}` : ''}</div>
                    </div>
                  ))}
                </div>
              )}
              {vehSearch.length > 0 && vehResults.length === 0 && (
                <div style={{ marginTop:6, fontSize:11, color:'var(--muted)' }}>No in-stock vehicles found</div>
              )}
              {f.vehicle_id && (
                <div style={{ marginTop:6, fontSize:11, color:'var(--accent)' }}>
                  ✓ Vehicle selected
                  <button onClick={() => { setF(p => ({ ...p, vehicle_id:'', vehicle_brand:'', vehicle_model:'', vehicle_variant:'', vehicle_color:'', chassis_number:'', engine_number:'' })); setVehSearch(''); }}
                    style={{ marginLeft:8, background:'transparent', border:'none', color:'var(--red)', cursor:'pointer', fontSize:10 }}>clear</button>
                </div>
              )}
            </div>
          </Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop: 4 }}>
            <Field label="Brand"><input value={f.vehicle_brand} onChange={e => setF(p => ({...p, vehicle_brand: e.target.value}))} style={inpStyle} /></Field>
            <Field label="Model"><input value={f.vehicle_model} onChange={e => setF(p => ({...p, vehicle_model: e.target.value}))} style={inpStyle} /></Field>
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
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <Field label="Nominee Name"><input value={f.nominee_name} onChange={s('nominee_name')} placeholder="Full Name" style={inpStyle} /></Field>
          <Field label="Relation"><input value={f.nominee_relation} onChange={s('nominee_relation')} placeholder="Spouse, Son, Mother..." style={inpStyle} /></Field>
          <Field label="Age"><input type="number" value={f.nominee_age} onChange={s('nominee_age')} placeholder="e.g. 35" style={inpStyle} /></Field>
          <Field label="Number"><input value={f.nominee_number} onChange={s('nominee_number')} placeholder="Mobile Number" style={inpStyle} /></Field>
        </div>
      )}

      {/* ── Step 4: Pricing ── */}
      {step === 4 && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
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

      {/* ── Step 5: HSRP ── */}
      {step === 5 && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="Reg Number"><input value={f.vehicle_number} onChange={s('vehicle_number')} className="mono" placeholder="KA01HH1234" style={inpStyle} /></Field>
            <Field label="Number Plate Issued Date"><input type="date" value={f.hsrp_date} onChange={s('hsrp_date')} style={inpStyle} /></Field>
          </div>
          
          {/* NEW: HSRP Text Fields */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="HSRP Front (Code)"><input value={f.hsrp_front} onChange={s('hsrp_front')} placeholder="Front Laser Code" style={inpStyle} /></Field>
            <Field label="HSRP Back (Code)"><input value={f.hsrp_back} onChange={s('hsrp_back')} placeholder="Back Laser Code" style={inpStyle} /></Field>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop: '8px' }}>
            <FileUpload label="Upload HSRP Front Photo" existingFileId={f.hsrp_front_id || null} onUploadSuccess={(fileId) => setF(p => ({ ...p, hsrp_front_id: fileId }))} />
            <FileUpload label="Upload HSRP Back Photo" existingFileId={f.hsrp_back_id || null} onUploadSuccess={(fileId) => setF(p => ({ ...p, hsrp_back_id: fileId }))} />
          </div>

          {/* NEW: HSRP Notes */}
          <div style={{ marginTop: '8px' }}>
            <Field label="HSRP Notes"><textarea value={f.hsrp_notes} onChange={s('hsrp_notes')} rows={2} placeholder="Courier delays, missing rivets, specific customer requests..." style={{...inpStyle, width: '100%'}} /></Field>
          </div>
        </div>
      )}

      {/* ── Navigation Buttons ── */}
      <div style={{ display:'flex', justifyContent:'space-between', gap:8, marginTop: 16 }}>
        <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
        <div style={{ display:'flex', gap:8 }}>
          {step > 1 && <GhostBtn onClick={() => setStep(s => s - 1)}>← Back</GhostBtn>}
          {step < 5 
            ? <Btn onClick={() => setStep(s => s + 1)}>Next →</Btn>
            : <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Sale'}</Btn>
          }
        </div>
      </div>

    </div>
  );
}

// ── Sale Milestones ─────────────────────────────────────────────────
// Order matches business flow: docs collected → invoice generated →
// insurance done → tax paid → number plate fitted.
const MILESTONE_DEFS = [
  { key:'documents',    label:'Documents',    short:'D', color:'#c8940a' },
  { key:'invoice',      label:'Invoice',      short:'I', color:'#c8940a' },
  { key:'insurance',    label:'Insurance',    short:'N', color:'#c8940a' },
  { key:'tax_paid',     label:'Tax Paid',     short:'T', color:'#c8940a' },
  { key:'number_plate', label:'Number Plate', short:'P', color:'#c8940a' },
];

// Format YYYY-MM-DD → DD Mon YYYY for display (falls back to raw on parse failure)
function fmtMilestoneDate(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mo = months[parseInt(m[2],10) - 1] || m[2];
  return `${m[3]} ${mo} ${m[1]}`;
}

// Popup for entering / viewing / editing the completion date of a milestone.
// mode: 'add' (unchecked → mark done) | 'edit' (already done → change or remove)
function MilestoneDateModal({ open, mode, milestoneLabel, defaultDate, onSave, onRemove, onCancel, saving }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(defaultDate || today);
  // Reset date when opening for a different milestone
  const [prevOpen, setPrevOpen] = useState(false);
  if (open && !prevOpen) {
    setDate(defaultDate || today);
    setPrevOpen(true);
  } else if (!open && prevOpen) {
    setPrevOpen(false);
  }

  if (!open) return null;
  const isEdit = mode === 'edit';
  return (
    <div
      onClick={onCancel}
      style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,.55)',
        display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background:'var(--card, #1a1a1c)', border:'1px solid var(--border, #333)',
          borderRadius:6, padding:24, minWidth:340, maxWidth:'90vw',
          boxShadow:'0 20px 60px rgba(0,0,0,.5)',
        }}
      >
        <div style={{ fontSize:11, letterSpacing:'.15em', color:'var(--dim)', textTransform:'uppercase', marginBottom:6 }}>
          {isEdit ? 'Milestone completed' : 'Mark milestone complete'}
        </div>
        <div style={{ fontSize:18, fontWeight:700, marginBottom:6, color:'var(--text, #eee)' }}>
          {milestoneLabel}
        </div>
        {isEdit && (
          <div style={{
            background:'rgba(200,148,10,.08)',
            border:'1px solid rgba(200,148,10,.35)',
            borderRadius:4,
            padding:'10px 14px',
            marginBottom:16,
          }}>
            <div style={{
              fontSize:10, letterSpacing:'.12em', textTransform:'uppercase',
              color:'#c8940a', marginBottom:4, fontWeight:600,
            }}>
              Completion date on record
            </div>
            <div style={{ fontSize:16, fontWeight:700, color:'#c8940a' }}>
              {defaultDate ? fmtMilestoneDate(defaultDate) : 'Not recorded (was marked done before dates were tracked)'}
            </div>
          </div>
        )}
        <Field label={isEdit ? 'Change date' : 'Completion date'}>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            autoFocus
            style={{ width:'100%' }}
          />
        </Field>
        <div style={{ display:'flex', gap:10, justifyContent:'space-between', marginTop:22, alignItems:'center' }}>
          <div>
            {isEdit && (
              <GhostBtn onClick={onRemove} style={{ color:'#e05555', borderColor:'#e05555' }}>
                Remove
              </GhostBtn>
            )}
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
            <Btn onClick={() => onSave(date)} disabled={saving || !date}>
              {saving ? 'Saving…' : (isEdit ? 'Update' : 'Save')}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function MilestoneRow({ sale, onToggle, disabled }) {
  const m  = sale.milestones       || {};
  const md = sale.milestone_dates  || {};
  const done = MILESTONE_DEFS.filter(d => m[d.key]).length;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4, minWidth:170 }}>
      <div style={{ display:'flex', gap:4, alignItems:'center' }}>
        {MILESTONE_DEFS.map(def => {
          const checked = !!m[def.key];
          const dateStr = md[def.key] ? fmtMilestoneDate(md[def.key]) : '';
          const title = checked
            ? `${def.label} — Done${dateStr ? ` on ${dateStr}` : ''} (click to view / change / remove)`
            : `${def.label} — Pending (click to mark done)`;
          return (
            <button
              key={def.key}
              type="button"
              title={title}
              disabled={disabled}
              onClick={(e) => { e.stopPropagation(); onToggle(sale, def, !checked); }}
              style={{
                width:22, height:22, borderRadius:4,
                background: checked ? def.color : 'transparent',
                border: `1.5px solid ${checked ? def.color : 'var(--border)'}`,
                color:   checked ? '#fff' : 'var(--dim)',
                fontSize:9, fontWeight:700, letterSpacing:'.02em',
                cursor: disabled ? 'not-allowed' : 'pointer',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontFamily:'IBM Plex Sans,sans-serif',
                transition:'all .15s ease',
                padding:0,
              }}
              onMouseEnter={e => { if (!disabled && !checked) e.currentTarget.style.borderColor = def.color; }}
              onMouseLeave={e => { if (!disabled && !checked) e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              {checked ? '✓' : def.short}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize:9, color: done === 5 ? '#4ade80' : 'var(--dim)', letterSpacing:'.05em', fontWeight: done === 5 ? 600 : 500 }}>
        {done}/5 {done === 5 ? 'complete' : ''}
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
    onSuccess: () => { 
      qc.invalidateQueries(['sales']); 
      qc.invalidateQueries(['sales-stats']); 
      qc.invalidateQueries(['customers']); // Instantly refresh the customer dropdown
      setShowAdd(false); 
      toast.success('Sale recorded'); 
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
    onSuccess: () => { 
      qc.invalidateQueries(['sales']); 
      qc.invalidateQueries(['sales-stats']); 
      setEditSale(null); 
      toast.success('Updated'); 
    },
    onError: e => {
      const errorMsg = typeof e?.response?.data?.detail === 'string' 
        ? e.response.data.detail 
        : JSON.stringify(e?.response?.data) || e.message || 'Failed';
      toast.error(errorMsg);
    }
  });

  const deleteMut = useMutation({
    mutationFn: id => salesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries(['sales']); qc.invalidateQueries(['sales-stats']); toast.success('Deleted'); },
    onError:   e => toast.error(errMsg(e, 'Cannot delete')),
  });

  // ─── Milestone toggle with optimistic update ─────────────────────────
  // Popup state: when a user tries to CHECK a milestone, we open a date picker
  // and defer the actual mutation until they confirm.
  const [pendingMilestone, setPendingMilestone] = useState(null);
  // { saleId, key, label, defaultDate }

  const milestoneMut = useMutation({
    mutationFn: ({ id, key, value, date }) => salesApi.updateMilestone(id, key, value, date),
    onMutate: async ({ id, key, value, date }) => {
      await qc.cancelQueries({ queryKey: ['sales'] });
      const previous = qc.getQueriesData({ queryKey: ['sales'] });
      qc.setQueriesData({ queryKey: ['sales'] }, (old) => {
        if (!Array.isArray(old)) return old;
        return old.map(s => {
          if (s.id !== id) return s;
          const nextMs    = { ...(s.milestones      || {}), [key]: value };
          const nextDates = { ...(s.milestone_dates || {}) };
          if (value) nextDates[key] = date || nextDates[key] || new Date().toISOString().slice(0,10);
          else       delete nextDates[key];
          return { ...s, milestones: nextMs, milestone_dates: nextDates };
        });
      });
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      // Roll back
      if (ctx?.previous) ctx.previous.forEach(([qk, data]) => qc.setQueryData(qk, data));
      toast.error(errMsg(err, 'Milestone update failed'));
    },
    onSuccess: () => setPendingMilestone(null),
    onSettled: () => { qc.invalidateQueries(['sales']); },
  });

  // Called by MilestoneRow buttons. Always opens the modal — 'edit' mode when the
  // milestone is already done (view date, change date, or remove), 'add' mode otherwise.
  const handleMilestoneToggle = (sale, def, nextValue) => {
    const existing = (sale.milestone_dates || {})[def.key]; // undefined for legacy sales
    setPendingMilestone({
      saleId:      sale.id,
      key:         def.key,
      label:       def.label,
      mode:        nextValue ? 'add' : 'edit',
      defaultDate: existing || '', // '' triggers "not recorded" in modal; picker still defaults to today
    });
  };

  const sales = Array.isArray(data) ? data : [];
  const { sorted: sortedSales, Th: SalesTh } = useSortable(sales, 'sale_date', 'desc');
  const st = stats || {};

  return (
    <div>
      {selSale && <InvoiceModal sale={selSale} onClose={()=>setSelSale(null)} />}
      <MilestoneDateModal
        open={!!pendingMilestone}
        mode={pendingMilestone?.mode || 'add'}
        milestoneLabel={pendingMilestone?.label || ''}
        defaultDate={pendingMilestone?.defaultDate}
        saving={milestoneMut.isPending}
        onCancel={() => setPendingMilestone(null)}
        onRemove={() => {
          if (!pendingMilestone) return;
          milestoneMut.mutate({
            id:    pendingMilestone.saleId,
            key:   pendingMilestone.key,
            value: false,
          });
        }}
        onSave={(date) => {
          if (!pendingMilestone) return;
          milestoneMut.mutate({
            id:    pendingMilestone.saleId,
            key:   pendingMilestone.key,
            value: true,
            date,
          });
        }}
      />

      {/* Edit Sale Modal */}
      {editSale && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setEditSale(null)}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:6, padding:24, width:'100%', maxWidth:800, maxHeight:'90vh', overflowY:'auto' }}
            onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:18 }}>Edit Sale Record</div>
            <SaleForm initial={editSale} onSave={d => updateMut.mutate({ id: editSale.id, d })} onCancel={() => setEditSale(null)} saving={updateMut.isPending} />
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ padding:'14px 20px', borderRight:'1px solid var(--border)' }}>
          <div className="label-xs">Total Revenue</div>
          <div className="display" style={{ fontSize:24, color:'var(--accent)', marginTop:6 }}>₹{st.total_revenue > 1000 ? (st.total_revenue/1000).toFixed(0)+'K' : (st.total_revenue||0)}</div>
        </div>
        <div style={{ padding:'14px 20px', borderRight:'1px solid var(--border)' }}>
          <div className="label-xs">Total Invoices</div>
          <div className="display" style={{ fontSize:24, color:'var(--text)', marginTop:6 }}>{st.total_count||0}</div>
        </div>
        <div style={{ padding:'14px 20px' }}>
          <div className="label-xs">Pending Delivery</div>
          <div className="display" style={{ fontSize:24, color:'var(--accent)', marginTop:6 }}>{st.pending_delivery||0}</div>
        </div>
      </div>

      {/* Add New Sale Form */}
      {showAdd && (
        <div style={{ margin:20, padding:20, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:4 }}>
          <div style={{ fontSize:12, fontWeight:600, marginBottom:16 }}>New Sale</div>
          <SaleForm onSave={d=>createMut.mutate(d)} onCancel={()=>setShowAdd(false)} saving={createMut.isPending} />
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 20px', borderBottom:'1px solid var(--border)' }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search invoices, customer, vehicle..." style={{ width:260 }} />
        <Btn style={{ marginLeft:'auto' }} onClick={()=>setShowAdd(v=>!v)}>+ New Sale</Btn>
      </div>

      {/* Data Table */}
      {error ? <div style={{ padding:20 }}><ApiError error={error}/></div>
        : isLoading ? <div style={{ padding:20, display:'flex', flexDirection:'column', gap:8 }}>{[1,2,3].map(i=><Skeleton key={i} h={44}/>)}</div>
        : sales.length===0 ? <Empty message="No sales found" />
        : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                {[['Invoice #','invoice_number'],['Date','sale_date'],['Customer','customer_name'],['Vehicle','vehicle_model'],['Amount','total_amount'],['Payment','payment_mode'],['Status','status'],['Milestones',null],['','']].map(([h,f])=>(
                  <SalesTh key={h} field={f||null} style={{ padding:'9px 16px', textAlign:'left', fontSize:9, letterSpacing:'.07em', color:'var(--dim)', fontWeight:500, textTransform:'uppercase' }}>{h}</SalesTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedSales.map(s => (
                <tr key={s.id} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td className="mono" style={{ padding:'12px 16px', fontSize:11, color:'var(--blue)' }}>{s.invoice_number}</td>
                  <td style={{ padding:'12px 16px', fontSize:11, color:'var(--muted)' }}>{s.sale_date?.slice(0,11)}</td>
                  <td style={{ padding:'12px 16px', fontSize:12, fontWeight:500 }}>
                    <span style={{ verticalAlign:'middle' }}>{s.customer_name}</span>
                    <CustomerBadges names={badgesFor(s.customer_mobile)} byName={byName} compact />
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:11, color:'var(--muted)' }}>{s.vehicle_brand} {s.vehicle_model}</td>
                  <td className="mono" style={{ padding:'12px 16px', fontSize:12, fontWeight:600, color:'var(--accent)' }}>₹{s.total_amount?.toLocaleString('en-IN')||0}</td>
                  <td style={{ padding:'12px 16px', fontSize:11 }}>{s.payment_mode}</td>
                  
                  {/* Status Badge */}
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ 
                      fontSize:9, padding:'3px 8px', borderRadius:2, fontWeight:500, 
                      color: s.status==='completed' || s.status==='delivered' ? '#4ade80' : '#f0c040', 
                      background: s.status==='completed' || s.status==='delivered' ? 'rgba(74,222,128,.1)' : 'rgba(240,192,64,.1)', 
                      border: s.status==='completed' || s.status==='delivered' ? '1px solid rgba(74,222,128,.25)' : '1px solid rgba(240,192,64,.25)' 
                    }}>
                      {s.status==='completed' || s.status==='delivered' ? 'Delivered' : 'Pending'}
                    </span>
                  </td>

                  {/* Milestones column */}
                  <td style={{ padding:'10px 16px' }}>
                    <MilestoneRow
                      sale={s}
                      disabled={milestoneMut.isPending}
                      onToggle={handleMilestoneToggle}
                    />
                  </td>

                  <td style={{ padding:'10px 16px' }}>
                    <div style={{ display:'flex', gap:6, alignItems: 'center' }}>
                      <GhostBtn sm onClick={()=>setSelSale(s)}>View</GhostBtn>
                      <button onClick={() => printSaleInvoice(s)}
                        style={{ padding:'5px 10px', background:'rgba(184,134,11,.1)', border:'1px solid rgba(184,134,11,.3)', borderRadius:3, color:'#7A5800', cursor:'pointer', fontSize:10, fontFamily:'IBM Plex Sans,sans-serif' }}>PDF</button>
                      <GhostBtn sm onClick={()=>setEditSale(s)}>Edit</GhostBtn>
                      
                      {s.status !== 'completed' && s.status !== 'delivered' && (
                        <button 
                          onClick={async () => {
                            if (await confirm("Mark this invoice as delivered?")) {
                              updateMut.mutate({ id: s.id, d: { status: 'delivered' } });
                            }
                          }}
                          style={{ padding:'5px 10px', background:'rgba(59,130,246,.1)', border:'1px solid rgba(59,130,246,.3)', borderRadius:3, color:'#3b82f6', cursor:'pointer', fontSize:10, fontFamily:'IBM Plex Sans,sans-serif' }}
                        >
                          ✓ Deliver
                        </button>
                      )}
                      
                      <button onClick={()=>sendWA(s.customer_mobile, `Dear ${s.customer_name}, congratulations on your new ${s.vehicle_brand} ${s.vehicle_model}! Your total invoice amount is ₹${s.total_amount?.toLocaleString('en-IN')}. Thank you for choosing MM Motors!`)} style={{ padding:'5px 10px', background:'rgba(37,211,102,.1)', border:'1px solid rgba(37,211,102,.3)', borderRadius:3, color:'#16a34a', cursor:'pointer', fontSize:10, fontFamily:'IBM Plex Sans,sans-serif' }}>WhatsApp</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </div>
  );
}
