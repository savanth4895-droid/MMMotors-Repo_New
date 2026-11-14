import { upiQrHtml } from '../../utils/upi';
import { escapeDeep } from '../../utils/escapeHtml';

// ── PDF invoice printer ─────────────────────────────────────────────
export function printPartsBill(rawBill) {
  const bill = escapeDeep(rawBill);
  const RS = 'Rs.';
  const items = bill.items || [];
  const grand    = bill.grand_total || 0;
  const subtotal = bill.subtotal    || 0;
  const gstTotal = bill.gst_total   || 0;
  const cgst     = Math.round(gstTotal / 2 * 100) / 100;
  const sgst     = Math.round((gstTotal - cgst) * 100) / 100;

  const rows = items.map((item, i) => {
    const isFree   = !!item.complimentary;
    const priceRaw = isFree ? (Number(item.mrp) || 0) : (Number(item.unit_price) || 0);
    const amt      = isFree ? 0 : Math.round(item.total || (item.unit_price || 0) * item.qty);
    return `
    <tr style="background:${isFree ? '#fdf6e3' : (i % 2 === 0 ? '#fff' : '#f9f7f3')}">
      <td>${item.description || item.name || '—'}${isFree ? ' <span style="font-size:9px;font-weight:700;color:#B8860B;background:#fff3cd;padding:1px 5px;border-radius:2px;margin-left:4px;">FREE</span>' : ''}</td>
      <td style="font-family:monospace">${item.part_number || '—'}</td>
      <td style="font-family:monospace;text-align:center">${item.hsn_code || '—'}</td>
      <td style="text-align:center;font-weight:700">${item.qty}</td>
      <td style="text-align:right">${isFree ? `<s>${RS}${priceRaw.toLocaleString('en-IN')}</s>` : `${RS}${priceRaw.toLocaleString('en-IN')}`}</td>
      <td style="text-align:center">${isFree ? '—' : (item.gst_rate || 18) + '%'}</td>
      <td style="text-align:right;font-weight:700;color:#B8860B">${RS}${amt.toLocaleString('en-IN')}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Parts Invoice ${bill.bill_number || ''}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;color:#1a1a1a;padding:20px;font-size:12px}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:12px;border-bottom:2.5px solid #B8860B}
  .co-name{font-size:22px;font-weight:800;letter-spacing:.04em}
  .co-sub{font-size:10px;color:#888;margin-top:3px;text-transform:uppercase;letter-spacing:.06em}
  .inv-box{text-align:right}
  .inv-label{font-size:10px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:.08em}
  .inv-num{font-size:18px;font-weight:800;font-family:monospace;margin-top:2px}
  .inv-date{font-size:10px;color:#888;margin-top:3px}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;padding:12px 16px;background:#f9f7f3;border:1px solid #e8e0cc;border-radius:4px}
  .meta-label{font-size:9px;color:#B8860B;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
  .meta-row{display:flex;gap:8px;font-size:11px;margin-bottom:3px}
  .meta-key{color:#888;width:65px;flex-shrink:0}
  .meta-val{font-weight:600}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  thead tr{background:#1a1a1a}
  thead th{padding:8px 10px;font-size:9px;font-weight:700;color:#fff;text-align:left;text-transform:uppercase;letter-spacing:.07em}
  tbody td{padding:8px 10px;border-bottom:1px solid #eee;font-size:11px;vertical-align:middle}
  .totals{display:flex;justify-content:flex-end}
  .totals-inner{width:260px}
  .tot-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #eee;font-size:11px}
  .tot-key{color:#888}.tot-val{font-family:monospace;font-weight:600}
  .tot-grand{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#1a1a1a;border-radius:3px;margin-top:8px}
  .tot-grand-key{color:#aaa;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
  .tot-grand-val{font-family:monospace;font-size:17px;font-weight:800;color:#B8860B}
  .words{font-size:10px;color:#888;font-style:italic;margin-top:6px;text-align:right}
  .footer{margin-top:24px;padding-top:12px;border-top:1px solid #eee;display:flex;justify-content:space-between;align-items:flex-end}
  .footer-note{font-size:9px;color:#bbb}
  .sig{border-top:1px solid #ccc;width:140px;text-align:center;padding-top:4px;font-size:9px;color:#888}
  @media print{body{padding:10px}}
</style></head>
<body>
<div class="hdr">
  <div><div class="co-name">MM MOTORS</div><div class="co-sub">Multi-Brand Dealership · Malur</div><div class="co-sub" style="margin-top:3px;text-transform:none;font-weight:700;color:#B8860B;letter-spacing:.04em">GSTIN: 29CUJPM6814P1ZQ</div></div>
  <div class="inv-box">
    <div class="inv-label">Parts Invoice</div>
    <div class="inv-num">${bill.bill_number || '—'}</div>
    <div class="inv-date">${bill.bill_date || new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</div>
  </div>
</div>
<div class="meta">
  <div>
    <div class="meta-label">Customer</div>
    <div class="meta-row"><span class="meta-key">Name</span><span class="meta-val">${bill.customer_name || '—'}</span></div>
    <div class="meta-row"><span class="meta-key">Mobile</span><span class="meta-val">${bill.customer_mobile || '—'}</span></div>
    <div class="meta-row"><span class="meta-key">Vehicle</span><span class="meta-val">${bill.customer_vehicle || '—'}</span></div>
  </div>
  <div style="text-align:right">
    <div class="meta-label">Payment</div>
    <div style="font-size:15px;font-weight:800;margin-top:8px">${bill.payment_mode || 'Cash'}</div>
    <div style="font-size:10px;color:#888;margin-top:4px">Sold by: ${bill.sold_by || 'MM Motors'}</div>
  </div>
</div>
<table>
  <thead><tr>
    <th>Description</th><th>Part No.</th><th style="text-align:center">HSN</th>
    <th style="text-align:center">Qty</th><th style="text-align:right">Unit Price</th>
    <th style="text-align:center">GST%</th><th style="text-align:right">Amount</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="totals"><div class="totals-inner">
  <div class="tot-row"><span class="tot-key">Taxable Amount</span><span class="tot-val">${RS}${Math.round(subtotal).toLocaleString('en-IN')}</span></div>
  <div class="tot-row"><span class="tot-key">CGST</span><span class="tot-val">${RS}${Math.round(cgst).toLocaleString('en-IN')}</span></div>
  <div class="tot-row"><span class="tot-key">SGST</span><span class="tot-val">${RS}${Math.round(sgst).toLocaleString('en-IN')}</span></div>
  <div class="tot-grand"><span class="tot-grand-key">Total</span><span class="tot-grand-val">${RS}${Math.round(grand).toLocaleString('en-IN')}</span></div>
  <div class="words">${bill.amount_in_words || ''}</div>
</div></div>
${upiQrHtml({ amount: Math.round(grand), note: `Bill ${bill.bill_number || ''}`.trim() })}
<div class="footer">
  <div class="footer-note">Computer-generated document. No signature required if digitally authenticated.</div>
  <div class="sig">Authorised Signatory<br><strong>MM MOTORS</strong></div>
</div>
<script>window.onload=()=>window.print()</script>
</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}
