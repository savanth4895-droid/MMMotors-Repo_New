import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { partsApi, customersApi, salesApi, serviceApi, errMsg } from '../api/client';
import { Btn, GhostBtn, Field, Skeleton, Empty, ApiError, useSortable } from '../components/ui';
import { notifyLowStock } from '../utils/lowStockToast';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';
import { useDraft, DraftBar } from '../hooks/useDraft';
import { escapeDeep } from '../utils/escapeHtml';

// A–Z so staff can scan for one; existing names unchanged so saved parts keep their category
const CATEGORIES = [
  'Accessories', 'Battery', 'Bearings', 'Body Parts', 'Brakes', 'Cables', 'Chain & Sprocket',
  'Clutch', 'Consumables', 'Electrical', 'Engine', 'Engine Oil & Lubricants', 'Exhaust & Silencer',
  'Filters', 'Fuel System', 'Gaskets & Seals', 'Handlebar & Controls', 'Helmets & Riding Gear',
  'Lights & Indicators', 'Mirrors', 'Nuts, Bolts & Fasteners', 'Rubber Parts', 'Seats & Covers',
  'Suspension', 'Tools', 'Transmission', 'Tyres & Tubes', 'Wheels & Rims',
  'Other',
];
const NO_CATEGORY = '__none__';   // category filter value: parts with no category yet
// Same list as VehiclesPage — a part is a standard fitting for whichever of these it is ticked for.
const BRANDS = [
  'HERO', 'HONDA', 'BAJAJ', 'TVS', 'YAMAHA', 'SUZUKI', 'ROYAL ENFIELD',
  'KTM', 'PIAGGIO', 'APRILIA', 'TRIUMPH', 'KAWASAKI', 'JAWA', 'YEZDI',
  'BMW', 'ATHER', 'OLA', 'VIDA'
];

// ── PDF invoice printer ─────────────────────────────────────────────
function printPartsBill(rawBill) {
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

// ── View Bill Modal ──────────────────────────────────────────────────
function ViewBillModal({ bill, onClose, onEdit }) {
  const items    = bill.items    || [];
  const grand    = bill.grand_total || 0;
  const subtotal = bill.subtotal    || 0;
  const gstTotal = bill.gst_total   || 0;
  const cgst     = Math.round(gstTotal / 2 * 100) / 100;
  const sgst     = Math.round((gstTotal - cgst) * 100) / 100;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={onClose}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, width:740, maxWidth:'96vw', maxHeight:'90vh', display:'flex', flexDirection:'column' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="record-head" style={{ alignItems:'center', borderRadius:'var(--radius-card) var(--radius-card) 0 0' }}>
          <div>
            <div className="record-id" style={{ marginTop:0 }}>Parts Invoice</div>
            <h2 className="record-title mono">{bill.bill_number}</h2>
            <div className="record-id">{bill.bill_date || bill.created_at?.slice(0,10)}</div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button onClick={() => printPartsBill(bill)}
              style={{ padding:'7px 14px', background:'rgba(184,134,11,.15)', border:'1px solid rgba(184,134,11,.4)', borderRadius:4, color:'var(--color-accent-text)', fontSize:11, cursor:'pointer', fontWeight:600 }}>
              Print
            </button>
            {onEdit && (
              <button onClick={onEdit}
                style={{ padding:'7px 14px', background:'rgba(59,130,246,.1)', border:'1px solid rgba(59,130,246,.35)', borderRadius:4, color:'var(--blue)', fontSize:11, cursor:'pointer', fontWeight:600 }}>
                Edit
              </button>
            )}
            <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--color-muted)', fontSize:22, cursor:'pointer', padding:'0 4px', lineHeight:1 }}>×</button>
          </div>
        </div>

        <div style={{ overflowY:'auto', flex:1, padding:20 }}>
          {/* Customer + Payment */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:18 }}>
            <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:4, padding:'12px 16px' }}>
              <div style={{ fontSize:9, color:'var(--color-accent-text)', fontWeight:700, marginBottom:8 }}>Customer</div>
              {[['Name', bill.customer_name], ['Mobile', bill.customer_mobile], ['Vehicle', bill.customer_vehicle]].map(([k, v]) =>
                v ? (
                  <div key={k} style={{ display:'flex', gap:8, fontSize:11, marginBottom:4 }}>
                    <span style={{ color:'var(--muted)', width:60, flexShrink:0 }}>{k}</span>
                    <span style={{ fontWeight:600 }}>{v}</span>
                  </div>
                ) : null
              )}
            </div>
            <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:4, padding:'12px 16px' }}>
              <div style={{ fontSize:9, color:'var(--color-accent-text)', fontWeight:700, marginBottom:8 }}>Payment</div>
              <div style={{ fontSize:16, fontWeight:800 }}>{bill.payment_mode || 'Cash'}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>Sold by: {bill.sold_by || 'MM Motors'}</div>
            </div>
          </div>

          {/* Items table */}
          <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:16 }}>
            <thead>
              <tr style={{ background:'var(--surface2)', borderBottom:'1px solid var(--border)' }}>
                {[['Description','left'],['Part No.','left'],['HSN','center'],['Qty','center'],['Unit Price','center'],['GST%','center'],['Amount','right']].map(([h,a]) => (
                  <th key={h} style={{ padding:'8px 10px', fontSize:9, fontWeight:600, color:'var(--muted)', textAlign:a }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} style={{ borderBottom:'1px solid var(--border)', background: i%2===0?'transparent':'var(--surface2)' }}>
                  <td style={{ padding:'9px 10px', fontSize:11, fontWeight:500 }}>{item.description || item.name}</td>
                  <td className="mono" style={{ padding:'9px 10px', fontSize:10, color:'var(--blue)' }}>{item.part_number || '—'}</td>
                  <td className="mono" style={{ padding:'9px 10px', fontSize:10, color:'var(--muted)', textAlign:'center' }}>{item.hsn_code || '—'}</td>
                  <td style={{ padding:'9px 10px', textAlign:'center', fontSize:13, fontWeight:700 }}>{item.qty}</td>
                  <td style={{ padding:'9px 10px', textAlign:'center', fontSize:11 }}>₹{(item.unit_price || 0).toLocaleString('en-IN')}</td>
                  <td style={{ padding:'9px 10px', textAlign:'center', fontSize:11, color:'var(--muted)' }}>{item.gst_rate || 18}%</td>
                  <td style={{ padding:'9px 10px', textAlign:'right', fontSize:12, fontWeight:700, color:'var(--accent)' }}>₹{Math.round(item.total || (item.unit_price || 0) * item.qty).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            <div style={{ width:250 }}>
              {[['Taxable', Math.round(subtotal)], ['CGST', Math.round(cgst)], ['SGST', Math.round(sgst)]].map(([k,v]) => (
                <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border)', fontSize:11 }}>
                  <span style={{ color:'var(--muted)' }}>{k}</span>
                  <span className="mono" style={{ fontWeight:600 }}>₹{v.toLocaleString('en-IN')}</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:4, marginTop:8 }}>
                <span style={{ fontSize:11, fontWeight:700, color:'var(--muted)' }}>Total</span>
                <span className="display" style={{ fontSize:20, color:'var(--accent)' }}>₹{Math.round(grand).toLocaleString('en-IN')}</span>
              </div>
              {bill.amount_in_words && (
                <div style={{ fontSize:10, color:'var(--muted)', fontStyle:'italic', marginTop:6, textAlign:'right' }}>{bill.amount_in_words}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Edit Bill Modal ──────────────────────────────────────────────────
function EditBillModal({ bill, onClose, onSaved }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    customer_name:    bill.customer_name    || '',
    customer_mobile:  bill.customer_mobile  || '',
    customer_vehicle: bill.customer_vehicle || '',
    payment_mode:     bill.payment_mode     || 'Cash',
  });
  const [saving, setSaving] = useState(false);

  const s = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await partsApi.updateBill(bill.id, form);
      qc.invalidateQueries(['parts-bills-list']);
      toast.success('Bill updated');
      onSaved();
    } catch (e) {
      toast.error(errMsg(e, 'Update failed'));
    } finally {
      setSaving(false);
    }
  };

  const inp = { width:'100%' };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={onClose}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, width:480, maxWidth:'96vw' }}
        onClick={e => e.stopPropagation()}>

        <div className="record-head" style={{ alignItems:'center', borderRadius:'var(--radius-card) var(--radius-card) 0 0' }}>
          <div>
            <h2 className="record-title">Edit Bill</h2>
            <div className="record-id mono">{bill.bill_number}</div>
          </div>
          <button type="button" className="record-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:12 }}>
          <Field label="Customer Name"><input value={form.customer_name}    onChange={s('customer_name')}    placeholder="Customer name"   style={inp} /></Field>
          <Field label="Mobile">       <input value={form.customer_mobile}  onChange={s('customer_mobile')}  placeholder="Mobile number"   style={inp} /></Field>
          <Field label="Vehicle">      <input value={form.customer_vehicle} onChange={s('customer_vehicle')} placeholder="KA 01 AB 1234"  style={inp} /></Field>
          <Field label="Payment Mode">
            <select value={form.payment_mode} onChange={s('payment_mode')} style={inp}>
              {['Cash','UPI','Card','Bank Transfer','Credit'].map(m => <option key={m}>{m}</option>)}
            </select>
          </Field>
        </div>

        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'12px 20px', borderTop:'1px solid var(--border)' }}>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <Btn disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save changes'}</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Parts Bill Modal (walk-in counter) ───────────────────────────────
function PartsBillModal({ onClose }) {
  const qc = useQueryClient();
  const [cust, setCust]       = useState({ name:'', mobile:'', vehicle:'' });
  const [lookup, setLookup]   = useState(null); // null | 'found' | 'new'
  const [cart, setCart]       = useState([]);
  const [psearch, setPsearch] = useState('');
  const [payMode, setPayMode] = useState('Cash');
  const [billDiscount, setBillDiscount] = useState(0);
  const [billDiscIsPct, setBillDiscIsPct] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [doneBill, setDoneBill] = useState(null);

  const { data: partsRaw } = useQuery({
    queryKey: ['parts', '', '', 'all'],
    queryFn: () => partsApi.list({ limit: 2000 }).then(r => r.data),
  });
  const allParts = (Array.isArray(partsRaw) ? partsRaw : []).filter(p => p.stock > 0);

  // Customer lookup on mobile blur
  const lookupCustomer = async (mobile) => {
    if (mobile.replace(/\D/g,'').length < 10) { setLookup(null); return; }
    try {
      const res = await customersApi.list({ search: mobile, limit: 10 });
      const list = Array.isArray(res.data) ? res.data : [];
      const exact = list.find(c => c.mobile === mobile);
      if (exact) {
        setCust(p => ({ ...p, name: p.name || exact.name }));
        setLookup('found');
        // Also try to fill vehicle from latest sale or service record
        if (!cust.vehicle) {
          try {
            const [salesRes, svcRes] = await Promise.all([
              salesApi.list({ search: mobile, limit: 1 }),
              serviceApi.list({ search: mobile, limit: 1 }),
            ]);
            const sales = Array.isArray(salesRes.data) ? salesRes.data : [];
            const jobs  = Array.isArray(svcRes.data)   ? svcRes.data   : [];
            const veh = sales[0]?.vehicle_number || jobs[0]?.vehicle_number || '';
            if (veh) setCust(p => ({ ...p, vehicle: p.vehicle || veh }));
          } catch { /* silent */ }
        }
      } else {
        setLookup('new');
      }
    } catch { setLookup('new'); }
  };

  // Vehicle lookup — fetch customer details from sales or service records
  const lookupByVehicle = async (vehNum) => {
    const v = vehNum.trim().toUpperCase();
    if (v.length < 4) return;
    // Skip if customer already filled
    if (cust.name && cust.mobile) return;
    try {
      // Try sales first
      const salesRes = await salesApi.list({ search: v, limit: 1 });
      const sales = Array.isArray(salesRes.data) ? salesRes.data : [];
      if (sales.length > 0) {
        const s = sales[0];
        setCust(p => ({
          name:    p.name    || s.customer_name    || '',
          mobile:  p.mobile  || s.customer_mobile  || '',
          vehicle: p.vehicle || s.vehicle_number   || v,
        }));
        if (s.customer_mobile) setLookup('found');
        return;
      }
      // Try service records
      const svcRes = await serviceApi.list({ search: v, limit: 1 });
      const jobs = Array.isArray(svcRes.data) ? svcRes.data : [];
      if (jobs.length > 0) {
        const j = jobs[0];
        setCust(p => ({
          name:    p.name    || j.customer_name    || '',
          mobile:  p.mobile  || j.customer_mobile  || '',
          vehicle: p.vehicle || j.vehicle_number   || v,
        }));
        if (j.customer_mobile) setLookup('found');
      }
    } catch { /* silent */ }
  };

  const results = psearch.length > 1
    ? allParts.filter(p =>
        p.name?.toLowerCase().includes(psearch.toLowerCase()) ||
        p.part_number?.toLowerCase().includes(psearch.toLowerCase())
      ).slice(0, 10)
    : [];

  const addToCart = part => {
    setCart(prev => {
      const ex = prev.find(c => c.id === part.id);
      if (ex) {
        if (ex.qty >= part.stock) { toast.error('Not enough stock'); return prev; }
        return prev.map(c => c.id === part.id ? { ...c, qty: c.qty + 1 } : c);
      }
      return [...prev, { ...part, qty: 1, discount: 0, discIsPct: false, complimentary: false }];
    });
    setPsearch('');
  };

  const setQty = (id, qty) => {
    const p = allParts.find(p => p.id === id);
    if (qty > (p?.stock || 0)) { toast.error('Not enough stock'); return; }
    setCart(prev => qty <= 0 ? prev.filter(c => c.id !== id) : prev.map(c => c.id === id ? { ...c, qty } : c));
  };

  const setLineDiscount = (id, val) => setCart(prev => prev.map(c => c.id === id ? { ...c, discount: Math.max(0, Number(val) || 0) } : c));
  const toggleDiscPct   = (id) => setCart(prev => prev.map(c => c.id === id ? { ...c, discIsPct: !c.discIsPct, discount: 0 } : c));
  const toggleCartFree  = (id) => setCart(prev => prev.map(c => c.id === id ? { ...c, complimentary: !c.complimentary, discount: 0 } : c));

  // Per-line: convert discount input to rupee amount
  const lineDiscRs = (c) => {
    if (c.complimentary) return 0;
    const gross = (c.selling_price || 0) * c.qty;
    const raw = c.discIsPct ? gross * (Number(c.discount) || 0) / 100 : Number(c.discount) || 0;
    return Math.max(0, Math.min(gross, raw));
  };

  const pbGross   = cart.reduce((s, c) => s + (c.complimentary ? 0 : (c.selling_price || 0) * c.qty), 0);
  const pbLineDisc= cart.reduce((s, c) => s + lineDiscRs(c), 0);
  const pbNet     = pbGross - pbLineDisc;
  const pbTaxable = cart.reduce((s, c) => {
    if (c.complimentary) return s;
    const gross = (c.selling_price || 0) * c.qty;
    const net   = gross - lineDiscRs(c);
    return s + net / (1 + ((c.gst_rate || 18) / 100));
  }, 0);
  const pbGst     = pbNet - pbTaxable;
  const grandBeforeBillDisc = pbNet;

  // Bill-level discount
  const billDiscRs = billDiscIsPct
    ? Math.max(0, Math.min(grandBeforeBillDisc, grandBeforeBillDisc * (Number(billDiscount) || 0) / 100))
    : Math.max(0, Math.min(grandBeforeBillDisc, Number(billDiscount) || 0));
  const total       = Math.round(grandBeforeBillDisc - billDiscRs);

  const handleGenerate = async () => {
    if (!cart.length) return toast.error('Add at least one part');
    setSaving(true);
    try {
      const res = await partsApi.createBill({
        customer_name:    cust.name,
        customer_mobile:  cust.mobile,
        customer_vehicle: cust.vehicle,
        payment_mode:     payMode,
        discount:         Math.round(billDiscRs * 100) / 100,
        items: cart.map(c => ({
          part_id:       c.id,
          part_number:   c.part_number || '',
          name:          c.name,
          hsn_code:      c.hsn_code || '8714',
          qty:           c.qty,
          unit_price:    c.selling_price || 0,
          gst_rate:      c.gst_rate || 18,
          discount:      Math.round(lineDiscRs(c) * 100) / 100,
          complimentary: !!c.complimentary,
        })),
      });
      setDoneBill(res.data);
      notifyLowStock(res.data?.low_stock_alerts);
      qc.invalidateQueries(['parts-bills-list']);
      qc.invalidateQueries(['parts']);
      qc.invalidateQueries(['parts-stats']);
    } catch (e) {
      toast.error(errMsg(e, 'Failed to generate bill'));
    } finally {
      setSaving(false);
    }
  };

  const C = { gold:'var(--color-accent-text)', muted:'var(--muted)', s2:'var(--surface2)', red:'var(--red)', green:'var(--green)', amber:'var(--color-warn)', surface:'var(--surface)', text:'var(--text)', blue:'var(--blue)', border:'var(--border)' };
  const inp = { width:'100%' };
  const fmtI = n => Math.round(n).toLocaleString('en-IN');

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:300, padding:'24px 16px', overflowY:'auto' }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="New Parts Bill" style={{ background:C.surface, width:'100%', maxWidth:860, borderRadius:'var(--radius-card)', overflow:'hidden', boxShadow:'0 12px 32px -8px color-mix(in oklab, var(--color-ink) 22%, transparent)' }}>

        {/* Header */}
        <div className="record-head">
          <div>
            <h2 className="record-title">New Parts Bill</h2>
            <div className="record-id">Walk-in counter sale</div>
          </div>
          <button type="button" className="record-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {doneBill ? (
          /* ── Success screen ── */
          <div style={{ padding:40, textAlign:'center' }}>
            <div style={{ fontSize:18, fontWeight:800, marginBottom:6 }}>Bill Generated!</div>
            <div style={{ fontSize:13, color:C.muted, fontFamily:'var(--font-outlier)', marginBottom:4 }}>{doneBill.bill_number}</div>
            <div style={{ fontSize:16, fontWeight:700, color:C.gold, marginBottom:28 }}>
              ₹{fmtI(doneBill.grand_total || total)}, {payMode}
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
              <button onClick={() => printPartsBill(doneBill)}
                style={{ padding:'10px 22px', background:C.gold, border:'none', borderRadius:4, color:'var(--color-ink)', fontSize:13, fontWeight:700, cursor:'pointer', }}>
                Print Bill
              </button>
              <button onClick={onClose}
                style={{ padding:'10px 22px', background:'transparent', border:`1px solid ${C.border}`, borderRadius:4, color:C.muted, fontSize:13, cursor:'pointer', }}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding:'16px 20px 0' }}>
            {/* Customer */}
            <div style={{ marginBottom:16 }}>
              <h3 className="sheet-sec">Customer Details</h3>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                <div>
                  <label style={{ fontSize:9, color:C.muted, display:'block', marginBottom:4 }}>Name</label>
                  <input value={cust.name} onChange={e => setCust(p => ({ ...p, name: e.target.value }))} placeholder="Customer name" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize:9, color:C.muted, display:'block', marginBottom:4 }}>
                    Mobile
                    {lookup === 'found' && <span style={{ marginLeft:6, color:'var(--color-success)', fontSize:9 }}>✓ Found</span>}
                    {lookup === 'new'   && <span style={{ marginLeft:6, color:'var(--color-warn)', fontSize:9 }}>+ New customer</span>}
                  </label>
                  <input
                    value={cust.mobile}
                    onChange={e => { setCust(p => ({ ...p, mobile: e.target.value })); setLookup(null); }}
                    onBlur={e => lookupCustomer(e.target.value)}
                    placeholder="Mobile number"
                    style={inp}
                  />
                </div>
                <div>
                  <label style={{ fontSize:9, color:C.muted, display:'block', marginBottom:4 }}>Vehicle (optional)</label>
                  <input value={cust.vehicle} onChange={e => setCust(p => ({ ...p, vehicle: e.target.value }))} onBlur={e => lookupByVehicle(e.target.value)} placeholder="KA 07 U 3915" style={inp} />
                </div>
              </div>
            </div>

            {/* Parts search */}
            <div style={{ marginBottom:14 }}>
              <h3 className="sheet-sec">Add Parts</h3>
              <div style={{ position:'relative', maxWidth:400 }}>
                <input value={psearch} onChange={e => setPsearch(e.target.value)}
                  placeholder="Search part name or number…" style={inp} />
                {results.length > 0 && (
                  <div style={{ position:'absolute', top:'100%', left:0, right:0, background:C.surface, border:`1px solid ${C.border}`, borderRadius:4, zIndex:200, boxShadow:'0 8px 24px rgba(0,0,0,.5)', maxHeight:240, overflowY:'auto' }}>
                    {results.map(p => (
                      <div key={p.id} onClick={() => addToCart(p)}
                        style={{ padding:'9px 12px', cursor:'pointer', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}
                        onMouseEnter={e => e.currentTarget.style.background = C.s2}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <div>
                          <div style={{ fontSize:12, fontWeight:600 }}>{p.name}</div>
                          <div style={{ fontSize:10, color:C.muted }}>{p.part_number} · {p.category}</div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:12, fontWeight:700, color:C.gold }}>₹{p.selling_price}</div>
                          <div style={{ fontSize:10, color: p.stock <= 5 ? C.amber : C.green }}>Stock: {p.stock}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Cart */}
            {cart.length === 0 ? (
              <div style={{ padding:'24px 0', textAlign:'center', color:C.muted, fontSize:12, borderTop:`1px solid ${C.border}`, marginBottom:12 }}>No parts added yet.</div>
            ) : (
              <>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, marginBottom:10 }}>
                  <thead>
                    <tr className="bill-head">
                      {['Part','Part No.','Qty','Unit Price','Discount','Free','GST%','CGST%','SGST%','Amount',''].map((h, i) => (
                        <th key={i} style={{ textAlign: i >= 2 ? 'right' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item, idx) => {
                      const gstR   = item.gst_rate || 18;
                      const half   = (gstR / 2).toFixed(1).replace('.0', '');
                      const gross  = (item.selling_price || 0) * item.qty;
                      const dRs    = lineDiscRs(item);
                      const amount = item.complimentary ? 0 : Math.round(gross - dRs);
                      const dim    = item.complimentary;
                      return (
                        <tr key={item.id} style={{ background: dim ? 'rgba(184,134,11,.06)' : (idx%2===0 ? 'transparent' : C.s2), borderBottom:`1px solid ${C.border}` }}>
                          <td style={{ padding:'8px 8px', fontWeight:600, textDecoration: dim?'line-through':'none', opacity: dim?.6:1 }}>{item.name}</td>
                          <td style={{ padding:'8px 8px', fontFamily:'var(--font-outlier)', fontSize:11, color:C.muted }}>{item.part_number}</td>
                          <td style={{ padding:'8px 4px', textAlign:'right' }}>
                            <input type="number" min="1" max={item.stock} value={item.qty}
                              onChange={e => setQty(item.id, Number(e.target.value))}
                              style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:3, padding:'3px 6px', color:C.text, fontSize:11, width:48, textAlign:'right', outline:'none' }} />
                          </td>
                          <td style={{ padding:'8px 8px', textAlign:'right', textDecoration: dim?'line-through':'none', opacity: dim?.5:1 }}>₹{item.selling_price}</td>
                          <td style={{ padding:'8px 4px', textAlign:'right' }}>
                            <div style={{ display:'flex', gap:2, justifyContent:'flex-end', alignItems:'center' }}>
                              <input type="number" min="0" value={item.discount || 0}
                                disabled={dim}
                                onChange={e => setLineDiscount(item.id, e.target.value)}
                                style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:3, padding:'3px 5px', color:dim?C.muted:C.text, fontSize:11, width:54, textAlign:'right', outline:'none', opacity: dim?.5:1 }} />
                              <button type="button" disabled={dim} onClick={() => toggleDiscPct(item.id)}
                                style={{ background: item.discIsPct ? 'var(--color-accent)' : 'transparent', border:`1px solid ${C.border}`, borderRadius:3, padding:'3px 6px', color: item.discIsPct ? 'var(--color-accent-ink)' : C.muted, fontSize:10, fontWeight:700, cursor: dim?'default':'pointer', opacity: dim?.4:1 }}>
                                {item.discIsPct ? '%' : '₹'}
                              </button>
                            </div>
                          </td>
                          <td style={{ padding:'8px 4px', textAlign:'center' }}>
                            <input type="checkbox" checked={!!item.complimentary}
                              onChange={() => toggleCartFree(item.id)}
                              style={{ cursor:'pointer', accentColor:C.gold }} />
                          </td>
                          <td style={{ padding:'8px 8px', textAlign:'right', color:C.muted, opacity: dim?.5:1 }}>{gstR}%</td>
                          <td style={{ padding:'8px 8px', textAlign:'right', color:C.muted, opacity: dim?.5:1 }}>{half}%</td>
                          <td style={{ padding:'8px 8px', textAlign:'right', color:C.muted, opacity: dim?.5:1 }}>{half}%</td>
                          <td style={{ padding:'8px 8px', textAlign:'right', fontWeight:700, color: dim?C.muted:C.gold }}>₹{fmtI(amount)}</td>
                          <td style={{ padding:'8px 4px' }}>
                            <button onClick={() => setCart(p => p.filter(c => c.id !== item.id))}
                              style={{ background:'transparent', border:'none', color:C.red, cursor:'pointer', fontSize:16, padding:0 }}>×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
                  <div style={{ minWidth:280 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', fontSize:12, color:C.muted, borderBottom:`1px solid ${C.border}` }}>
                      <span>Subtotal (gross)</span><span>₹{fmtI(pbGross)}</span>
                    </div>
                    {pbLineDisc > 0 && (
                      <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', fontSize:12, color:C.muted, borderBottom:`1px solid ${C.border}` }}>
                        <span>Line Discount</span><span>− ₹{fmtI(pbLineDisc)}</span>
                      </div>
                    )}
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', fontSize:12, color:C.muted, borderBottom:`1px solid ${C.border}` }}>
                      <span>Taxable</span><span>₹{fmtI(pbTaxable)}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', fontSize:12, color:C.muted, borderBottom:`1px solid ${C.border}` }}>
                      <span>CGST</span><span>₹{fmtI(pbGst/2)}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', fontSize:12, color:C.muted, borderBottom:`1px solid ${C.border}` }}>
                      <span>SGST</span><span>₹{fmtI(pbGst/2)}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', fontSize:12, color:C.muted, borderBottom:`1px solid ${C.border}` }}>
                      <span>Bill Discount</span>
                      <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                        <input type="number" min="0" value={billDiscount}
                          onChange={e => setBillDiscount(e.target.value)}
                          style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:3, padding:'3px 6px', color:C.text, fontSize:11, width:70, textAlign:'right', outline:'none' }} />
                        <button type="button" onClick={() => { setBillDiscIsPct(v => !v); setBillDiscount(0); }}
                          style={{ background: billDiscIsPct ? 'var(--color-accent)' : 'transparent', border:`1px solid ${C.border}`, borderRadius:3, padding:'3px 8px', color: billDiscIsPct ? 'var(--color-accent-ink)' : C.muted, fontSize:10, fontWeight:700, cursor:'pointer' }}>
                          {billDiscIsPct ? '%' : '₹'}
                        </button>
                      </div>
                    </div>
                    {billDiscRs > 0 && (
                      <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:11, color:C.muted }}>
                        <span>&nbsp;</span><span>− ₹{fmtI(billDiscRs)}</span>
                      </div>
                    )}
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', fontSize:15, fontWeight:800, color:C.gold, borderTop:`1px solid ${C.border}` }}>
                      <span>Total</span><span>₹{fmtI(total)}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Payment mode */}
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:9, color:C.muted, display:'block', marginBottom:4 }}>Payment Mode</label>
              <select value={payMode} onChange={e => setPayMode(e.target.value)} style={{ ...inp, maxWidth:200 }}>
                {['Cash','UPI','Card','Bank Transfer','Credit'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
        )}

        {!doneBill && (
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'14px 20px', background:C.s2, borderTop:`1px solid ${C.border}` }}>
            <button onClick={onClose} style={{ padding:'9px 18px', background:'transparent', border:`1px solid ${C.border}`, borderRadius:4, color:C.muted, fontSize:12, cursor:'pointer', }}>
              Cancel
            </button>
            <button onClick={handleGenerate} disabled={saving || cart.length === 0}
              style={{ padding:'9px 20px', background: saving || cart.length === 0 ? 'var(--color-paper-3)' : 'var(--color-accent)', border:'none', borderRadius:4, color:'var(--color-ink)', fontSize:12, fontWeight:700, cursor: saving || cart.length === 0 ? 'default' : 'pointer', }}>
              {saving ? 'Generating…' : `Generate Bill — ₹${fmtI(total)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function stockStyle(p) {
  if (p.stock === 0)                   return { color:'var(--color-error)',   bg:'color-mix(in oklab, var(--color-error) 9%, var(--color-paper))',    border:'transparent', label:'Out of stock', cls:'pill-red' };
  if (p.stock <= (p.reorder_level||5)) return { color:'var(--color-warn)',    bg:'color-mix(in oklab, var(--color-accent) 16%, var(--color-paper))',  border:'transparent', label:'Low stock',    cls:'pill-amber' };
  return                                      { color:'var(--color-success)', bg:'color-mix(in oklab, var(--color-success) 10%, var(--color-paper))', border:'transparent', label:'OK',           cls:'pill-green' };
}

// ── Add / Edit part form ─────────────────────────────────────────────
function PartForm({ initial = {}, onSave, onCancel, saving }) {
  const [f, setF] = useState({
    part_number:'', name:'', category:'', brand:'', hsn_code:'', location:'',
    ...initial,
    priority: !!initial.priority,
    fitting_brands: initial.fitting_brands || [],
    fitting_qty: String(initial.fitting_qty ?? 1),
    compatible_with: (initial.compatible_with || []).join(', '),   // typed as text, split on save so spaces survive typing
    stock: String(initial.stock ?? 0),
    reorder_level: String(initial.reorder_level ?? 5),
    purchase_price: String(initial.purchase_price ?? ''),
    selling_price: String(initial.selling_price ?? ''),
    gst_rate: String(initial.gst_rate ?? 18),
  });
  const s = k => e => setF(p=>({...p,[k]:e.target.value}));
  const selStyle = { width:'100%' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:680 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <Field label="Part number"><input value={f.part_number}    onChange={s('part_number')}    placeholder="Leave blank to auto-generate" className="mono" /></Field>
        <Field label="Name *">       <input value={f.name}           onChange={s('name')}           placeholder="Spark Plug (Iridium)" /></Field>
        <Field label="Category">
          <select value={f.category} onChange={s('category')} style={selStyle}>
            <option value="">Select category</option>
            {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Brand">       <input value={f.brand}          onChange={s('brand')}          placeholder="NGK, Honda, MRF…" /></Field>
        <Field label="Stock quantity"><input type="number" value={f.stock}          onChange={s('stock')}          placeholder="0" /></Field>
        <Field label="Reorder level"><input type="number" value={f.reorder_level} onChange={s('reorder_level')} placeholder="5" /></Field>
        <Field label="Purchase price (₹)"><input type="number" value={f.purchase_price} onChange={s('purchase_price')} placeholder="0" /></Field>
        <Field label="Selling price (₹) *"><input type="number" value={f.selling_price} onChange={s('selling_price')} placeholder="0" /></Field>
        <Field label="GST rate (%)">
          <select value={f.gst_rate} onChange={s('gst_rate')} style={selStyle}>
            {[0,5,12,18,28].map(r=><option key={r} value={r}>{r}%</option>)}
          </select>
        </Field>
        <Field label="HSN code"><input value={f.hsn_code}  onChange={s('hsn_code')}  placeholder="8511"  className="mono" /></Field>
        <Field label="Location">  <input value={f.location}  onChange={s('location')}  placeholder="A1-R2" className="mono" /></Field>
      </div>
      {/* Compatible models — free text */}
      <Field label="Compatible Models">
        <input
          value={f.compatible_with}
          onChange={s('compatible_with')}
          placeholder="e.g. Activa 6G, Jupiter, Splendor Plus"
        />
      </Field>
      <label style={{ display:'flex', alignItems:'flex-start', gap:8, cursor:'pointer' }}>
        <input type="checkbox" checked={f.priority} onChange={e=>setF(p=>({...p,priority:e.target.checked}))} />
        <span>
          <strong>Priority part</strong> (fast moving)
          <span style={{ display:'block', fontSize:'var(--text-xs)', color:'var(--muted)' }}>
            You get an alert the moment this one drops to its reorder level. Other parts stay on the order list quietly.
          </span>
        </span>
      </label>
      {/* Standard fitting: pre-fills the New Sale form for these brands */}
      <fieldset style={{ border:'1px solid var(--border)', borderRadius:'var(--radius-control)', padding:'10px 12px' }}>
        <legend style={{ fontSize:'var(--text-sm)', fontWeight:600, padding:'0 4px' }}>Standard fitting</legend>
        <div style={{ fontSize:'var(--text-xs)', color:'var(--muted)', marginBottom:8 }}>
          Tick the brands this is fitted to as standard. Every new sale of those bikes starts with it listed, and stock comes off when the sale is saved. Leave all unticked for a part that is not a fitting. To fit it to only some models, list them in Compatible Models above (exactly as the model is written on the vehicle).
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 12px' }}>
          {BRANDS.map(b => (
            <label key={b} style={{ display:'flex', alignItems:'center', gap:5, fontSize:'var(--text-xs)', cursor:'pointer' }}>
              <input
                type="checkbox"
                checked={f.fitting_brands.includes(b)}
                onChange={e=>setF(p=>({ ...p, fitting_brands: e.target.checked
                  ? [...p.fitting_brands, b]
                  : p.fitting_brands.filter(x=>x!==b) }))}
              />
              {b}
            </label>
          ))}
        </div>
        {f.fitting_brands.length > 0 && (
          <div style={{ marginTop:10, maxWidth:200 }}>
            <Field label="How many per bike"><input type="number" min="1" value={f.fitting_qty} onChange={s('fitting_qty')} /></Field>
          </div>
        )}
      </fieldset>
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
        <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
        <Btn disabled={!f.name||!f.selling_price||saving} onClick={()=>onSave({
          ...f,
          stock:          parseInt(f.stock)||0,
          reorder_level:  parseInt(f.reorder_level)||5,
          purchase_price: parseFloat(f.purchase_price)||0,
          selling_price:  parseFloat(f.selling_price)||0,
          gst_rate:       parseFloat(f.gst_rate)||18,
          compatible_with: f.compatible_with.split(',').map(m => m.trim()).filter(Boolean),
          priority:       !!f.priority,
          fitting_brands: f.fitting_brands || [],
          fitting_qty:    parseInt(f.fitting_qty)||1,
        })}>
          {saving?'Saving…':'Save part'}
        </Btn>
      </div>
    </div>
  );
}

// ── Parts Order Modal (low stock) ────────────────────────────────────
function PartsOrderModal({ onClose }) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['parts-low-stock-order'],
    // include_out: a part at zero stock is the most urgent thing to order, and the
    // plain low-stock query leaves those out.
    queryFn: () => partsApi.lowStock({ include_out: true }).then(r => r.data),
  });
  const lowParts = Array.isArray(data) ? data : [];
  const byUrgency = (a, b) => (a.stock - b.stock) || String(a.name).localeCompare(String(b.name));
  const priorityParts = lowParts.filter(p => p.priority).sort(byUrgency);
  const otherParts    = lowParts.filter(p => !p.priority).sort(byUrgency);

  const [showSuggest, setShowSuggest] = useState(false);
  const { data: suggestData, isLoading: suggestLoading } = useQuery({
    queryKey: ['parts-suggest-priority'],
    queryFn: () => partsApi.suggestPriority({ days: 60, limit: 15 }).then(r => r.data),
    enabled: showSuggest,
  });
  const suggestions = suggestData?.parts || [];

  const starMut = useMutation({
    mutationFn: ({ id, reorder_level }) =>
      partsApi.update(id, reorder_level ? { priority: true } : { priority: true, reorder_level: 5 }),
    onSuccess: () => {
      qc.invalidateQueries(['parts-suggest-priority']); qc.invalidateQueries(['parts-low-stock-order']);
      qc.invalidateQueries(['parts']); qc.invalidateQueries(['parts-stats']);
      toast.success('Added to priority list');
    },
    onError: e => toast.error(errMsg(e, 'Could not add')),
  });

  // inline edit state: { [partId]: { reorder_level: number } }
  const [editing, setEditing] = useState({});
  const [saving, setSaving]   = useState({});
  const [adding, setAdding]   = useState(false);
  const [newPart, setNewPart] = useState({ part_number:'', name:'', brand:'', category:'', stock:0, reorder_level:5, purchase_price:0, selling_price:0, gst_rate:18, hsn_code:'' });

  // ── Bulk selection ────────────────────────────────────────────────
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const toggleOne = (id) => setSelected(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const allSelected = lowParts.length > 0 && lowParts.every(p => selected.has(p.id));
  const toggleAll   = () => setSelected(allSelected ? new Set() : new Set(lowParts.map(p => p.id)));

  // Marks the selected parts as ordered from the vendor. The old version of this
  // button set reorder_level to 0, which hid the part from every future low-stock
  // check — it never warned again. Now the part stays listed, stamped with the date,
  // and the stamp clears itself when the stock arrives.
  const bulkMarkOrdered = async () => {
    if (selected.size === 0) return;
    if (!(await confirm(`Mark ${selected.size} part${selected.size > 1 ? 's' : ''} as ordered from the vendor?`))) return;
    setBulkDeleting(true);
    try {
      await Promise.all([...selected].map(id => partsApi.markOrdered(id, true)));
      qc.invalidateQueries(['parts-low-stock-order']);
      qc.invalidateQueries(['parts']);
      qc.invalidateQueries(['parts-stats']);
      toast.success(`${selected.size} part${selected.size > 1 ? 's' : ''} marked as ordered`);
      setSelected(new Set());
    } catch { toast.error('Some updates failed'); }
    finally { setBulkDeleting(false); }
  };

  const startEdit = (p) => setEditing(prev => ({ ...prev, [p.id]: { reorder_level: p.reorder_level } }));
  const cancelEdit = (id) => setEditing(prev => { const n={...prev}; delete n[id]; return n; });

  const saveEdit = async (p) => {
    setSaving(prev => ({ ...prev, [p.id]: true }));
    try {
      await partsApi.update(p.id, { reorder_level: Number(editing[p.id].reorder_level) });
      qc.invalidateQueries(['parts-low-stock-order']);
      qc.invalidateQueries(['parts']);
      toast.success('Reorder level updated');
      cancelEdit(p.id);
    } catch { toast.error('Failed to update'); }
    finally { setSaving(prev => ({ ...prev, [p.id]: false })); }
  };

  const toggleOrdered = async (p) => {
    try {
      await partsApi.markOrdered(p.id, !p.ordered_at);
      qc.invalidateQueries(['parts-low-stock-order']);
      qc.invalidateQueries(['parts']);
      qc.invalidateQueries(['parts-stats']);
      setSelected(prev => { const n = new Set(prev); n.delete(p.id); return n; });
      toast.success(p.ordered_at ? 'Order mark cleared' : 'Marked as ordered');
    } catch(e) { toast.error(errMsg(e, 'Failed to update')); }
  };

  const addPart = async () => {
    if (!newPart.part_number || !newPart.name) return toast.error('Part number and name required');
    try {
      await partsApi.create(newPart);
      qc.invalidateQueries(['parts-low-stock-order']);
      qc.invalidateQueries(['parts']);
      qc.invalidateQueries(['parts-stats']);
      toast.success('Part added');
      setAdding(false);
      setNewPart({ part_number:'', name:'', brand:'', category:'', stock:0, reorder_level:5, purchase_price:0, selling_price:0, gst_rate:18, hsn_code:'' });
    } catch(e) { toast.error(errMsg(e,'Failed to add')); }
  };

  const inp = { width:'100%', minHeight:30, padding:'var(--space-3xs) var(--space-xs)', fontSize:'var(--text-sm)' };

  const handlePrint = () => {
    // Priority parts first — that is the order the counter should work through them.
    const rows = escapeDeep([...priorityParts, ...otherParts]).map(p => `
      <tr>
        <td>${p.priority ? '★' : ''}</td>
        <td>${p.part_number}</td>
        <td>${p.name}${p.ordered_at ? ' <span style="color:#16a34a;font-size:10px">(ordered)</span>' : ''}</td>
        <td>${p.brand||'—'}</td>
        <td>${p.category||'—'}</td>
        <td style="color:#dc2626;font-weight:700">${p.stock}</td>
        <td>${p.reorder_level}</td>
        <td>${p.reorder_level - p.stock + 10}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><title>Parts Reorder List</title>
    <style>body{font-family:Arial,sans-serif;padding:24px}h2{margin-bottom:4px}p{color:#666;font-size:12px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse}th{background:#B8860B;color:#fff;padding:8px 10px;font-size:11px;text-align:left;letter-spacing:.05em;text-transform:uppercase}
    td{padding:8px 10px;border-bottom:1px solid #eee;font-size:12px}tr:nth-child(even){background:#f9f9f9}
    @media print{body{padding:10px}}</style></head><body>
    <h2>MM Motors — Parts Reorder List</h2>
    <p>Generated: ${new Date().toLocaleDateString('en-IN')} | ${lowParts.length} items at or below reorder level, ${priorityParts.length} priority</p>
    <table><thead><tr><th>★</th><th>Part No.</th><th>Name</th><th>Brand</th><th>Category</th><th>Current Stock</th><th>Reorder Level</th><th>Suggested Order</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <script>window.onload=()=>{window.print();}</script></body></html>`;
    const w = window.open('','_blank');
    w.document.write(html);
    w.document.close();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={onClose}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, width:860, maxWidth:'96vw', maxHeight:'90vh', display:'flex', flexDirection:'column' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ background:'var(--color-paper-2)', padding:'16px 20px', borderRadius:'8px 8px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:700 }}>Parts Reorder List</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
              {priorityParts.length > 0
                ? `${priorityParts.length} priority part${priorityParts.length > 1 ? 's' : ''} to order now`
                : 'Parts at or below reorder level'}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {selected.size > 0 && (
              <button onClick={bulkMarkOrdered} disabled={bulkDeleting}
                style={{ padding:'7px 14px', background:'rgba(34,197,94,.12)', border:'1px solid rgba(34,197,94,.4)', borderRadius:4, color:'var(--color-success)', fontSize:11, cursor:'pointer', fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
                {bulkDeleting ? 'Saving…' : `Mark ${selected.size} as ordered`}
              </button>
            )}
            <button onClick={() => setShowSuggest(v => !v)}
              style={{ padding:'7px 14px', background:'transparent', border:'1px solid var(--border)', borderRadius:4, color:'var(--muted)', fontSize:11, cursor:'pointer', fontWeight:600 }}>
              {showSuggest ? 'Hide suggestions' : 'Suggest priority parts'}
            </button>
            <button onClick={() => setAdding(v => !v)}
              style={{ padding:'7px 14px', background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.35)', borderRadius:4, color:'var(--color-success)', fontSize:11, cursor:'pointer', fontWeight:600 }}>
              + Add Part
            </button>
            {lowParts.length > 0 && (
              <button onClick={handlePrint}
                style={{ padding:'7px 14px', background:'rgba(184,134,11,.15)', border:'1px solid rgba(184,134,11,.4)', borderRadius:4, color:'var(--accent)', fontSize:11, cursor:'pointer', fontWeight:600 }}>
                Print Order List
              </button>
            )}
            <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--muted)', fontSize:20, cursor:'pointer' }}>×</button>
          </div>
        </div>

        {/* Suggested priority parts — most used in the last 60 days, from the stock log */}
        {showSuggest && (
          <div style={{ padding:'14px 20px', background:'var(--color-paper-2)', borderBottom:'1px solid var(--border)', flexShrink:0, maxHeight:220, overflowY:'auto' }}>
            <div style={{ fontSize:11, fontWeight:700, marginBottom:2 }}>Your fastest-moving parts, last 60 days</div>
            <div style={{ fontSize:10, color:'var(--muted)', marginBottom:10 }}>
              Counted from bills already in the system. Starring one means you get an alert the moment it runs low.
            </div>
            {suggestLoading ? (
              <div style={{ fontSize:11, color:'var(--muted)' }}>Working it out…</div>
            ) : suggestions.length === 0 ? (
              <div style={{ fontSize:11, color:'var(--muted)' }}>
                Nothing to suggest — either every fast mover is already starred, or there are no parts on bills from the last 60 days.
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {suggestions.map(s => (
                  <div key={s.id} style={{ display:'flex', alignItems:'center', gap:10, fontSize:11 }}>
                    <button onClick={() => starMut.mutate({ id:s.id, reorder_level:s.reorder_level })} disabled={starMut.isPending}
                      title={`Add ${s.name} to the priority list`}
                      style={{ padding:'2px 9px', background:'rgba(184,134,11,.15)', border:'1px solid rgba(184,134,11,.4)', borderRadius:3, color:'var(--accent)', fontSize:10, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
                      ☆ Add
                    </button>
                    <span style={{ fontWeight:600, flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.name}</span>
                    <span className="mono" style={{ fontSize:10, color:'var(--muted)', flexShrink:0 }}>{s.part_number}</span>
                    <span style={{ fontSize:10, color:'var(--muted)', flexShrink:0, width:120, textAlign:'right' }}>
                      {s.used} used · {s.times} bill{s.times === 1 ? '' : 's'}
                    </span>
                    <span style={{ fontSize:10, color:'var(--muted)', flexShrink:0, width:70, textAlign:'right' }}>stock {s.stock}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Add Part Form */}
        {adding && (
          <div style={{ padding:'14px 20px', background:'rgba(34,197,94,.05)', borderBottom:'1px solid var(--border)', display:'grid', gridTemplateColumns:'repeat(5,1fr) auto', gap:8, alignItems:'end', flexShrink:0 }}>
            {[['Part No.','part_number','text'],['Name','name','text'],['Brand','brand','text'],['Stock','stock','number'],['Reorder Lvl','reorder_level','number']].map(([label,key,type])=>(
              <div key={key}>
                <div style={{ fontSize:9, color:'var(--muted)', marginBottom:3 }}>{label}</div>
                <input type={type} value={newPart[key]} onChange={e=>setNewPart(p=>({...p,[key]:type==='number'?Number(e.target.value):e.target.value}))} style={inp} />
              </div>
            ))}
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={addPart} style={{ padding:'5px 12px', background:'var(--color-success)', border:'none', borderRadius:3, color:'var(--color-ink)', fontSize:11, fontWeight:700, cursor:'pointer' }}>Add</button>
              <button onClick={()=>setAdding(false)} style={{ padding:'5px 10px', background:'transparent', border:'1px solid var(--border)', borderRadius:3, color:'var(--muted)', fontSize:11, cursor:'pointer' }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Table */}
        <div style={{ overflowY:'auto', flex:1 }}>
          {isLoading ? (
            <div style={{ padding:24, color:'var(--muted)', fontSize:12 }}>Loading…</div>
          ) : lowParts.length === 0 ? (
            <div style={{ padding:48, textAlign:'center', color:'var(--muted)', fontSize:12 }}>
              All parts are well stocked!
            </div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--border)' }}>
                  {/* Select-all checkbox */}
                  <th style={{ padding:'9px 10px 9px 16px', width:36 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      title={allSelected ? 'Deselect all' : 'Select all'}
                      style={{ cursor:'pointer', accentColor:'var(--accent)', width:14, height:14 }}
                    />
                  </th>
                  {['Part No.','Name','Brand','Category','Stock','Reorder','Suggested Order','Actions'].map(h => (
                    <th key={h} style={{ padding:'9px 16px', textAlign:'left', fontSize:9, color:'var(--dim)', fontWeight:600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[['Order now — priority parts', priorityParts], ['Can wait', otherParts]].map(([heading, group]) => group.length === 0 ? null : [
                  <tr key={heading}>
                    <th colSpan={9} scope="colgroup"
                      style={{ padding:'8px 16px', textAlign:'left', fontSize:10, fontWeight:700, letterSpacing:'.04em', textTransform:'uppercase',
                               color: group === priorityParts ? 'var(--color-warn)' : 'var(--muted)', background:'var(--color-paper-2)' }}>
                      {heading} ({group.length})
                    </th>
                  </tr>,
                  ...group.map(p => {
                  const isEditing  = !!editing[p.id];
                  const isSelected = selected.has(p.id);
                  return (
                    <tr key={p.id} style={{ borderBottom:'1px solid var(--border)', background: isSelected ? 'rgba(239,68,68,.05)' : isEditing ? 'rgba(184,134,11,.05)' : 'transparent', transition:'background .1s' }}>
                      {/* Row checkbox */}
                      <td style={{ padding:'10px 10px 10px 16px' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(p.id)}
                          style={{ cursor:'pointer', accentColor:'var(--color-error)', width:14, height:14 }}
                        />
                      </td>
                      <td className="mono" style={{ padding:'10px 16px', fontSize:10, color:'var(--blue)' }}>{p.part_number}</td>
                      <td style={{ padding:'10px 16px', fontSize:11, fontWeight:600 }}>
                        {p.name}
                        {p.ordered_at && (
                          <span style={{ display:'block', fontSize:9, fontWeight:600, color:'var(--color-success)' }}>
                            Ordered {new Date(p.ordered_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}
                            {p.ordered_by ? ` · ${p.ordered_by}` : ''}
                          </span>
                        )}
                      </td>
                      <td style={{ padding:'10px 16px', fontSize:10, color:'var(--muted)' }}>{p.brand||'—'}</td>
                      <td style={{ padding:'10px 16px', fontSize:10, color:'var(--muted)' }}>{p.category||'—'}</td>
                      <td style={{ padding:'10px 16px' }}>
                        <span style={{ fontSize:14, fontWeight:800, color:p.stock===0?'var(--color-error)':'var(--color-warn)' }}>{p.stock}</span>
                      </td>
                      <td style={{ padding:'10px 16px', fontSize:11, color:'var(--muted)' }}>
                        {isEditing ? (
                          <input type="number" min="1" value={editing[p.id].reorder_level}
                            onChange={e => setEditing(prev => ({ ...prev, [p.id]: { ...prev[p.id], reorder_level: e.target.value } }))}
                            style={{ ...inp, width:60 }} autoFocus />
                        ) : p.reorder_level}
                      </td>
                      <td style={{ padding:'10px 16px' }}>
                        <span style={{ fontSize:12, fontWeight:700, color:'var(--accent)' }}>
                          {Math.max((p.reorder_level||5) - p.stock + 10, 10)} units
                        </span>
                      </td>
                      <td style={{ padding:'10px 12px', whiteSpace:'nowrap' }}>
                        {isEditing ? (
                          <div style={{ display:'flex', gap:5 }}>
                            <button onClick={() => saveEdit(p)} disabled={saving[p.id]}
                              style={{ padding:'3px 10px', background:'var(--color-accent)', border:'none', borderRadius:3, color:'var(--color-ink)', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                              {saving[p.id] ? '…' : 'Save'}
                            </button>
                            <button onClick={() => cancelEdit(p.id)}
                              style={{ padding:'3px 8px', background:'transparent', border:'1px solid var(--border)', borderRadius:3, color:'var(--muted)', fontSize:10, cursor:'pointer' }}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div style={{ display:'flex', gap:5 }}>
                            <button onClick={() => startEdit(p)}
                              style={{ padding:'3px 10px', background:'rgba(184,134,11,.12)', border:'1px solid rgba(184,134,11,.3)', borderRadius:3, color:'var(--accent)', fontSize:10, cursor:'pointer' }}>
                              Edit
                            </button>
                            <button onClick={() => toggleOrdered(p)}
                              title={p.ordered_at ? 'Clear the order mark' : 'Record that you have ordered this from the vendor'}
                              style={{ padding:'3px 8px', background: p.ordered_at ? 'transparent' : 'rgba(34,197,94,.1)', border:`1px solid ${p.ordered_at ? 'var(--border)' : 'rgba(34,197,94,.35)'}`, borderRadius:3, color: p.ordered_at ? 'var(--muted)' : 'var(--color-success)', fontSize:10, cursor:'pointer' }}>
                              {p.ordered_at ? 'Not ordered' : 'Mark ordered'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })])}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── New parts bill ───────────────────────────────────────────────────
function NewBillForm({ parts, onCancel, onDone }) {
  const [customer, setCustomer] = useState({ name:'', mobile:'' });
  const [search, setSearch]     = useState('');
  const [cart, setCart]         = useState([]);
  const [payMode, setPayMode]   = useState('Cash');
  const [saving, setSaving]     = useState(false);

  const filtered = parts.filter(p => p.stock>0 && (p.name.toLowerCase().includes(search.toLowerCase()) || p.part_number.toLowerCase().includes(search.toLowerCase())));

  const addToCart = p => {
    setCart(prev => {
      const ex = prev.find(i=>i.part.id===p.id);
      return ex ? prev.map(i=>i.part.id===p.id?{...i,qty:i.qty+1}:i) : [...prev,{part:p,qty:1,complimentary:false}];
    });
    setSearch('');
  };
  const updateQty = (id, qty) => {
    if (qty<=0) setCart(p=>p.filter(i=>i.part.id!==id));
    else setCart(p=>p.map(i=>i.part.id===id?{...i,qty}:i));
  };
  const toggleFree = (id) => setCart(p=>p.map(i=>i.part.id===id?{...i,complimentary:!i.complimentary}:i));

  const paidCart  = cart.filter(i => !i.complimentary);
  const freeCart  = cart.filter(i => i.complimentary);
  const pbTotal   = paidCart.reduce((s,{part,qty})=>s+part.selling_price*qty,0);
  const pbTaxable = paidCart.reduce((s,{part,qty})=>s+part.selling_price*qty/(1+(part.gst_rate/100)),0);
  const pbGst     = pbTotal - pbTaxable;
  const pbCgst    = pbGst / 2;
  const pbSgst    = pbGst / 2;
  const grand     = pbTotal;
  const freeValue = freeCart.reduce((s,{part,qty})=>s+part.selling_price*qty,0);

  const handleSubmit = async () => {
    if (!cart.length) return toast.error('Add at least one part');
    setSaving(true);
    try {
      const res = await partsApi.createBill({
        customer_name:    customer.name,
        customer_mobile:  customer.mobile,
        customer_vehicle: '',
        items: cart.map(({part,qty,complimentary})=>({ part_id:part.id, part_number:part.part_number, name:part.name, hsn_code:part.hsn_code||'8714', qty, unit_price:part.selling_price, gst_rate:part.gst_rate, complimentary: !!complimentary })),
        payment_mode: payMode,
      });
      toast.success('Bill created');
      notifyLowStock(res.data?.low_stock_alerts);
      draft.clearDraft();
      onDone();
    } catch(e) {
      toast.error(errMsg(e, 'Failed'));
    } finally {
      setSaving(false);
    }
  };

  // Draft — store cart as {partId, qty, complimentary} (parts refetched from live inventory on restore)
  const draftState = {
    customer, payMode,
    cart: cart.map(({part,qty,complimentary}) => ({ partId: part.id, qty, complimentary: !!complimentary })),
  };
  const draft = useDraft({ key: 'mm_draft_parts_bill', state: draftState });

  const selStyle = { width:'100%' };

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <GhostBtn onClick={onCancel} sm>← Parts</GhostBtn>
        <span style={{ fontSize:13, fontWeight:500 }}>New parts bill</span>
      </div>
      <DraftBar
        draft={draft}
        onRestore={(d) => {
          if (d.customer) setCustomer(d.customer);
          if (d.payMode)  setPayMode(d.payMode);
          if (Array.isArray(d.cart)) {
            const rebuilt = d.cart
              .map(({partId, qty, complimentary}) => {
                const part = parts.find(p => p.id === partId);
                return part ? { part, qty, complimentary: !!complimentary } : null;
              })
              .filter(Boolean);
            setCart(rebuilt);
            if (rebuilt.length < d.cart.length) {
              toast('Some parts no longer available');
            }
          }
        }}
        onDiscard={() => {}}
      />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:20 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:3, padding:'14px 16px' }}>
            <div className="label-xs" style={{ marginBottom:10 }}>Customer</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <Field label="Name"><input value={customer.name}   onChange={e=>setCustomer(p=>({...p,name:e.target.value}))}   placeholder="Customer name" /></Field>
              <Field label="Mobile"><input value={customer.mobile} onChange={e=>setCustomer(p=>({...p,mobile:e.target.value}))} placeholder="10-digit" /></Field>
            </div>
          </div>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:3, overflow:'hidden' }}>
            <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)' }}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search part name or number…" />
            </div>
            {search.length>1 ? (
              <div style={{ maxHeight:260, overflowY:'auto' }}>
                {filtered.slice(0,20).map(p=>{
                  const sc=stockStyle(p);
                  return (
                    <div key={p.id} onClick={()=>addToCart(p)} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:11, fontWeight:600 }}>{p.name}</div>
                        <div className="mono" style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>{p.part_number} · {p.category}</div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'var(--accent)' }}>₹{p.selling_price.toLocaleString('en-IN')}</div>
                        <span style={{ fontSize:9, padding:'2px 7px', borderRadius:2, color:sc.color, background:sc.bg, border:`1px solid ${sc.border}` }}>{sc.label} ({p.stock})</span>
                      </div>
                      <div style={{ width:28, height:28, background:'var(--color-accent)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, color:'var(--color-ink)', flexShrink:0 }}>+</div>
                    </div>
                  );
                })}
                {filtered.length===0&&<div style={{ padding:20, textAlign:'center', fontSize:11, color:'var(--dim)' }}>No parts found</div>}
              </div>
            ) : <div style={{ padding:16, fontSize:11, color:'var(--dim)', textAlign:'center' }}>Type to search parts</div>}
          </div>
          {cart.length>0 && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:3, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'var(--surface2)', borderBottom:'1px solid var(--border)' }}>
                    {['Part Name','Qty','Unit Price','Free','GST%','CGST%','SGST%','Amount',''].map((h,i)=>(
                      <th key={i} style={{ padding:'8px 10px', fontSize:10, fontWeight:600, color:'var(--muted)', textAlign:i>=1?'center':'left', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cart.map(({part,qty,complimentary},idx)=>{
                    const half = (part.gst_rate/2).toFixed(1).replace('.0','');
                    const amt  = complimentary ? 0 : Math.round(part.selling_price*qty);
                    return (
                      <tr key={part.id} style={{ borderBottom:'1px solid var(--border)', background: complimentary ? 'rgba(184,134,11,.06)' : (idx%2===0?'transparent':'var(--surface2)') }}>
                        <td style={{ padding:'8px 10px', fontSize:11, fontWeight:500 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <span>{part.name}</span>
                            {complimentary && (
                              <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', background:'var(--accent)', color:'var(--color-ink)', borderRadius:3 }}>FREE</span>
                            )}
                          </div>
                          <div className="mono" style={{ fontSize:9, color:'var(--muted)', marginTop:1 }}>{part.part_number}</div>
                        </td>
                        <td style={{ padding:'8px 6px', textAlign:'center' }}>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
                            <button onClick={()=>updateQty(part.id,qty-1)} style={{ width:22, height:22, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:2, cursor:'pointer', fontSize:13, fontFamily:'inherit' }}>−</button>
                            <span style={{ fontSize:12, fontWeight:600, width:22, textAlign:'center' }}>{qty}</span>
                            <button onClick={()=>updateQty(part.id,qty+1)} style={{ width:22, height:22, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:2, cursor:'pointer', fontSize:13, fontFamily:'inherit' }}>+</button>
                          </div>
                        </td>
                        <td style={{ padding:'8px 10px', textAlign:'center', fontSize:11, textDecoration: complimentary ? 'line-through' : 'none', opacity: complimentary ? .5 : 1 }}>₹{part.selling_price.toLocaleString('en-IN')}</td>
                        <td style={{ padding:'8px 6px', textAlign:'center' }}>
                          <input type="checkbox" checked={!!complimentary} onChange={()=>toggleFree(part.id)} style={{ cursor:'pointer', accentColor:'var(--accent)' }} />
                        </td>
                        <td style={{ padding:'8px 10px', textAlign:'center', fontSize:11, color:'var(--muted)', opacity: complimentary ? .5 : 1 }}>{part.gst_rate}%</td>
                        <td style={{ padding:'8px 10px', textAlign:'center', fontSize:11, color:'var(--muted)', opacity: complimentary ? .5 : 1 }}>{half}%</td>
                        <td style={{ padding:'8px 10px', textAlign:'center', fontSize:11, color:'var(--muted)', opacity: complimentary ? .5 : 1 }}>{half}%</td>
                        <td style={{ padding:'8px 10px', textAlign:'center', fontSize:12, fontWeight:700, color:'var(--accent)' }}>₹{amt.toLocaleString('en-IN')}</td>
                        <td style={{ padding:'8px 6px', textAlign:'center' }}>
                          <button onClick={()=>setCart(p=>p.filter(i=>i.part.id!==part.id))} style={{ background:'transparent', border:'none', color:'var(--red)', cursor:'pointer', fontSize:16, padding:0 }}>×</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:3, padding:16 }}>
            <div className="label-xs" style={{ marginBottom:12 }}>Bill summary</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--muted)' }}>
                <span>Taxable Amount</span><span className="mono">₹{Math.round(pbTaxable).toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--muted)' }}>
                <span>CGST</span><span className="mono">₹{Math.round(pbCgst).toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--muted)' }}>
                <span>SGST</span><span className="mono">₹{Math.round(pbSgst).toLocaleString('en-IN')}</span>
              </div>
              <div style={{ height:1, background:'var(--border)', margin:'4px 0' }} />
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                <span style={{ fontSize:12, fontWeight:600 }}>Total</span>
                <span className="display" style={{ fontSize:20, color:'var(--accent)' }}>₹{Math.round(grand).toLocaleString('en-IN')}</span>
              </div>
              {freeCart.length > 0 && (
                <div style={{ marginTop:6, padding:'6px 10px', background:'rgba(184,134,11,.08)', border:'1px solid rgba(184,134,11,.25)', borderRadius:3, fontSize:10, color:'var(--accent)', textAlign:'center' }}>
                  {freeCart.length} free item{freeCart.length>1?'s':''} · MRP ₹{Math.round(freeValue).toLocaleString('en-IN')}
                </div>
              )}
            </div>
          </div>
          <Field label="Payment mode">
            <select value={payMode} onChange={e=>setPayMode(e.target.value)} style={selStyle}>
              {['Cash','UPI','Card','Credit'].map(o=><option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Btn disabled={!cart.length||saving} onClick={handleSubmit}>{saving?'Generating…':'Generate bill →'}</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────
export default function PartsPage() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [tab,           setTab]           = useState('stock');
  const [view,          setView]          = useState('list');
  const [search,        setSearch]        = useState('');
  const [cat,           setCat]           = useState('');
  const [filter,        setFilter]        = useState('all');
  const [partsBillOpen, setPartsBillOpen] = useState(false);
  const [orderOpen,     setOrderOpen]     = useState(false);
  const [editPart,      setEditPart]      = useState(null);
  const [viewBill,      setViewBill]      = useState(null);
  const [editBill,      setEditBill]      = useState(null);

  const { data:statsData } = useQuery({
    queryKey:['parts-stats'],
    refetchInterval: 30_000,
    queryFn: ()=>partsApi.stats().then(r=>r.data),
  });
  const { data, isLoading, error } = useQuery({
    queryKey:['parts', search, cat, filter],
    queryFn: ()=>partsApi.list({ search:search||undefined, category:(cat && cat!==NO_CATEGORY) ? cat : undefined, limit:2000 }).then(r=>r.data),
  });
  // 1. Bills History now shows parts-bills (from service PartsBillModal)
  const { data:billsData, isLoading:billsLoading } = useQuery({
    queryKey:['parts-bills-list'],
    queryFn: ()=>partsApi.listBills({ limit:100 }).then(r=>r.data),
    enabled: tab==='bills',
  });

  const createMut = useMutation({
    mutationFn: d=>partsApi.create(d),
    onSuccess: ()=>{ qc.invalidateQueries(['parts']); qc.invalidateQueries(['parts-stats']); setView('list'); toast.success('Part added'); },
    onError:   e=>toast.error(errMsg(e, 'Failed')),
  });
  const updateMut = useMutation({
    mutationFn: ({id,data})=>partsApi.update(id,data),
    onSuccess: ()=>{ qc.invalidateQueries(['parts']); qc.invalidateQueries(['parts-stats']); setEditPart(null); toast.success('Part updated'); },
    onError:   e=>toast.error(errMsg(e, 'Update failed')),
  });
  const deleteMut = useMutation({
    mutationFn: id=>partsApi.delete(id),
    onSuccess: ()=>{ qc.invalidateQueries(['parts']); qc.invalidateQueries(['parts-stats']); toast.success('Part deleted'); },
    onError:   ()=>toast.error('Delete failed'),
  });
  const adjustMut = useMutation({
    mutationFn: ({id,qty,reason})=>partsApi.adjustStock(id,{qty,reason}),
    onSuccess: ()=>{ qc.invalidateQueries(['parts']); qc.invalidateQueries(['parts-stats']); toast.success('Stock updated'); },
    onError: ()=>toast.error('Adjust failed'),
  });
  const deleteBillMut = useMutation({
    mutationFn: id=>partsApi.deleteBill(id),
    onSuccess: ()=>{ qc.invalidateQueries(['parts-bills-list']); toast.success('Bill deleted'); },
    onError: ()=>toast.error('Delete failed'),
  });
  const categoryMut = useMutation({
    mutationFn: ({ id, category }) => partsApi.update(id, { category }),
    onSuccess: ()=>{ qc.invalidateQueries(['parts']); toast.success('Category saved', { id:'part-category' }); },
    onError: e=>toast.error(errMsg(e, 'Could not save category')),
  });
  // A part with reorder level 0 can only ever read as out of stock, so starring one
  // gives it a starting level of 5 — otherwise the star would look on but never alert.
  const priorityMut = useMutation({
    mutationFn: ({ id, priority, reorder_level }) =>
      partsApi.update(id, priority && !reorder_level ? { priority, reorder_level:5 } : { priority }),
    onSuccess: (_r, v)=>{
      qc.invalidateQueries(['parts']); qc.invalidateQueries(['parts-stats']);
      qc.invalidateQueries(['parts-low-stock-order']); qc.invalidateQueries(['parts-suggest-priority']);
      toast.success(v.priority ? 'Added to priority list' : 'Removed from priority list');
    },
    onError: e=>toast.error(errMsg(e, 'Could not change priority')),
  });

  const parts = Array.isArray(data)?data:[];
  const st    = statsData||{};

  const visibleParts = parts.filter(p => {
    if (filter==='priority') return !!p.priority;
    if (filter==='low') return p.stock>0 && p.stock<=(p.reorder_level||5);
    if (filter==='out') return p.stock===0;
    return true;
  }).filter(p => !cat || (cat===NO_CATEGORY ? !p.category : p.category===cat));

  const { sorted: sortedParts, Th: PartsTh } = useSortable(visibleParts, 'name', 'asc');


  if (view==='add') {
    return (
      <div className="page-pad">
        <div className="page-back">
          <GhostBtn onClick={()=>setView('list')} sm>Back to parts</GhostBtn>
          <h2 className="page-panel-title" style={{ margin:0 }}>Add new part</h2>
        </div>
        <PartForm onSave={d=>createMut.mutate(d)} onCancel={()=>setView('list')} saving={createMut.isPending} />
      </div>
    );
  }

  if (view==='edit' && editPart) {
    return (
      <div className="page-pad">
        <div className="page-back">
          <GhostBtn onClick={()=>{ setView('list'); setEditPart(null); }} sm>Back to parts</GhostBtn>
          <h2 className="page-panel-title" style={{ margin:0 }}>Edit part <span className="mono cell-muted">{editPart.part_number}</span></h2>
        </div>
        <PartForm
          initial={editPart}
          onSave={d=>updateMut.mutate({ id:editPart.id, data:d })}
          onCancel={()=>{ setView('list'); setEditPart(null); }}
          saving={updateMut.isPending}
        />
      </div>
    );
  }

  if (view==='new-bill') {
    return <NewBillForm parts={parts} onCancel={()=>setView('list')} onDone={()=>{ setView('list'); setTab('bills'); qc.invalidateQueries(['parts-bills-list']); qc.invalidateQueries(['parts']); qc.invalidateQueries(['parts-stats']); }} />;
  }

  return (
    <div>
      {/* stats */}
      <section className="stat-strip" aria-label="Parts figures">
        {[
          { l:'Total SKUs',    v:st.total_skus??'—' },
          { l:'Low stock',     v:st.low_stock??'—',    c: st.low_stock > 0 ? 'var(--color-warn)' : undefined },
          { l:'Out of stock',  v:st.out_of_stock??'—', c: st.out_of_stock > 0 ? 'var(--color-error)' : undefined },
          { l:'Stock value',   v:st.stock_value   ? '₹'+Math.round(st.stock_value/1000)+'K'   : '—' },
          { l:'Selling value', v:st.selling_value ? '₹'+Math.round(st.selling_value/1000)+'K' : '—' },
        ].map((s,i)=>(
          <div key={i} className="stat">
            <span className="stat-label">{s.l}</span>
            <span className="stat-value" style={s.c ? { color:s.c } : undefined}>{s.v}</span>
          </div>
        ))}
      </section>

      {/* tabs + actions */}
      <div className="tabbar">
        <div className="tabs" role="tablist" aria-label="Parts views" style={{ borderBottom:0 }}>
          {[{id:'stock',l:'Stock Inventory'},{id:'bills',l:'Bills History'}].map(t=>(
            <button key={t.id} type="button" role="tab" className="tab" aria-selected={tab===t.id} onClick={()=>setTab(t.id)}>
              {t.l}
            </button>
          ))}
        </div>
        <div className="tabbar-actions">
          <Btn onClick={()=>setPartsBillOpen(true)}>+ Parts Bill</Btn>
          {/* 2. Parts Order replaces New Bill — shows low stock list */}
          <button type="button" className="btn btn-ghost" onClick={()=>setOrderOpen(true)}>
            Parts Order
          </button>
          <GhostBtn onClick={()=>setView('add')}>+ Add part</GhostBtn>
        </div>
      </div>

      {/* stock tab */}
      {tab==='stock' && (
        <>
          <div className="page-toolbar">
            <input type="search" className="page-search" aria-label="Search parts" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search parts…" style={{ width:'min(240px, 100%)' }} />
            <select aria-label="Category" value={cat} onChange={e=>setCat(e.target.value)} style={{ width:170 }}>
              <option value="">All categories</option>
              <option value={NO_CATEGORY}>No category yet</option>
              {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <div className="chips" role="group" aria-label="Stock filter">
              {[['all','All'],['priority','Priority'],['low','Low stock'],['out','Out of stock']].map(([v,l])=>(
                <button key={v} type="button" className="chip" aria-pressed={filter===v} onClick={()=>setFilter(v)}>{l}</button>
              ))}
            </div>
            <span className="toolbar-count" role="status">{visibleParts.length} parts</span>
          </div>

          {(st.low_stock>0||st.out_of_stock>0) && (
            <div className="notice notice-warn parts-alert">
              <div>
                {st.low_stock>0&&<><strong>{st.low_stock} parts</strong> below reorder level</>}
                {st.low_stock>0&&st.out_of_stock>0&&', '}
                {st.out_of_stock>0&&<strong style={{ color:'var(--color-error)' }}>{st.out_of_stock} out of stock</strong>}
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setOrderOpen(true)}>
                View Order List
              </button>
            </div>
          )}

          {error ? <div style={{ padding:'var(--space-lg)' }}><ApiError error={error}/></div>
            : isLoading ? <div className="table-skeleton">{[1,2,3,4,5].map(i=><Skeleton key={i} h={44}/>)}</div>
            : visibleParts.length===0 ? <Empty message="No parts found" sub={search || cat || filter !== 'all' ? 'Clear a filter or the search to see more.' : 'Add the first part with Add part.'} />
            : (
              <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    {[['Priority','priority'],['Part no.','part_number'],['Name','name'],['Compatible',''],['Category','category'],['Brand','brand'],['Loc','location'],['Stock','stock'],['Reorder','reorder_level'],['Purchase','purchase_price'],['Selling','selling_price'],['GST','gst_rate'],['Margin',''],['Status',''],['','']].map(([h,f])=>(
                      <PartsTh key={h} field={f||null} className={['stock','reorder_level','purchase_price','selling_price','gst_rate'].includes(f) || h==='Margin' ? 'num' : undefined}>{h || <span className="visually-hidden">Actions</span>}</PartsTh>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedParts.map(p=>{
                    const sc     = stockStyle(p);
                    const margin = p.selling_price>0 ? Math.round((p.selling_price-p.purchase_price)/p.selling_price*100) : 0;
                    return (
                      <tr key={p.id}>
                        {/* Star = fast mover. Only these raise low-stock alerts. */}
                        <td>
                          <button
                            type="button"
                            className="star-toggle"
                            aria-pressed={!!p.priority}
                            aria-label={p.priority ? `Remove ${p.name} from the priority list` : `Add ${p.name} to the priority list`}
                            title={p.priority ? 'On the priority list — you get alerted when it runs low' : 'Add to the priority list'}
                            disabled={priorityMut.isPending}
                            onClick={()=>priorityMut.mutate({ id:p.id, priority:!p.priority, reorder_level:p.reorder_level })}
                          >{p.priority ? '★' : '☆'}</button>
                        </td>
                        <td className="mono cell-id">{p.part_number}</td>
                        <td className="cell-strong" style={{ maxWidth:200 }}>
                          <div className="cell-clip">{p.name}</div>
                        </td>
                        {/* Compatible models */}
                        <td style={{ maxWidth:200 }}>
                          {p.compatible_with?.length > 0 ? (
                            <div className="tag-row">
                              {p.compatible_with.slice(0,3).map(m => (
                                <span key={m} className="pill pill-dim">{m}</span>
                              ))}
                              {p.compatible_with.length > 3 && (
                                <span className="pill pill-dim" title={p.compatible_with.slice(3).join(', ')}>+{p.compatible_with.length - 3}</span>
                              )}
                            </div>
                          ) : (
                            <span className="cell-muted">Not set</span>
                          )}
                        </td>
                        <td>
                          <select aria-label={`Category of ${p.name}`} value={p.category || ''}
                            disabled={categoryMut.isPending && categoryMut.variables?.id === p.id}
                            onChange={e => categoryMut.mutate({ id: p.id, category: e.target.value })}
                            style={{ minWidth:140, fontSize:'var(--text-xs)', ...(p.category ? null : { color:'var(--color-muted)' }) }}>
                            <option value="">Not set</option>
                            {/* keep an older or imported name visible even if it's not in the list */}
                            {p.category && !CATEGORIES.includes(p.category) && <option value={p.category}>{p.category}</option>}
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="cell-muted">{p.brand}</td>
                        <td className="mono cell-muted">{p.location}</td>
                        <td className="num">
                          <span className="parts-stock" style={{ color:p.stock===0?'var(--color-error)':p.stock<=(p.reorder_level||5)?'var(--color-warn)':'var(--color-ink)' }}>{p.stock}</span>
                        </td>
                        <td className="num cell-muted">{p.reorder_level}</td>
                        <td className="num cell-muted">₹{p.purchase_price?.toLocaleString('en-IN')}</td>
                        <td className="num cell-amount">₹{p.selling_price?.toLocaleString('en-IN')}</td>
                        <td className="num cell-muted">{p.gst_rate}%</td>
                        <td className="num" style={{ fontWeight:600, color:margin>=30?'var(--color-success)':margin>=15?'var(--color-warn)':'var(--color-error)' }}>{margin}%</td>
                        <td>
                          <span className={`pill ${sc.cls}`}>{sc.label}</span>
                        </td>
                        {/* 3. Edit + Delete + Adj buttons */}
                        <td>
                          <div className="row-actions" style={{ flexWrap:'nowrap', minWidth:0 }}>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={()=>{ setEditPart(p); setView('edit'); }}>
                              Edit
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" aria-label={`Adjust stock for ${p.name}`} onClick={()=>{ const qty=parseInt(prompt(`Adjust stock for "${p.name}"\nCurrent: ${p.stock}\n+ for in, - for out:`)); if(!isNaN(qty)&&qty!==0) adjustMut.mutate({id:p.id,qty,reason:'Manual adjustment'}); }}>
                              ±Adj
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm btn-ghost-danger" aria-label={`Delete ${p.name}`} onClick={async () => { if (await confirm(`Delete "${p.name}"? This cannot be undone.`)) deleteMut.mutate(p.id); }}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
        </>
      )}

      {/* bills tab — parts-bills (from service PartsBillModal) */}
      {tab==='bills' && (
        billsLoading ? <div className="table-skeleton">{[1,2,3].map(i=><Skeleton key={i} h={44}/>)}</div>
        : (
          <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {['Bill #','Date','Job #','Customer','Parts Used','Amount','Payment','Actions'].map(h=>(
                  <th key={h} className={h==='Amount' ? 'num' : undefined}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(billsData)?billsData:[]).length===0 && (
                <tr><td colSpan={8}><Empty message="No parts bills yet" sub="Counter sales made with Parts Bill appear here." /></td></tr>
              )}
              {(Array.isArray(billsData)?billsData:[]).map(b=>{
                const total = b.grand_total || b.items?.reduce((s,i)=>s+i.unit_price*i.qty,0) || 0;
                return (
                  <tr key={b.id}>
                    <td className="mono cell-id">{b.bill_number}</td>
                    <td className="cell-muted cell-nowrap">{b.bill_date || b.created_at?.slice(0,10)}</td>
                    <td className="mono cell-muted">{b.job_number||'—'}</td>
                    <td className="cell-strong">{b.customer_name||'—'}</td>
                    <td className="cell-muted" style={{ maxWidth:240 }}>
                      <div className="cell-clip">
                        {b.items?.map(i=>`${i.description||i.name} ×${i.qty}`).join(', ') || '—'}
                      </div>
                    </td>
                    <td className="num cell-amount">₹{Math.round(total).toLocaleString('en-IN')}</td>
                    <td><span className="pill pill-dim">{b.payment_mode||'Cash'}</span></td>
                    <td>
                      <div className="row-actions" style={{ flexWrap:'nowrap', minWidth:0 }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setViewBill(b)}>
                          View
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditBill(b)}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm btn-ghost-danger" aria-label={`Delete bill ${b.bill_number}`} onClick={async () => { if (await confirm(`Delete bill ${b.bill_number}?`)) deleteBillMut.mutate(b.id); }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )
      )}

      {partsBillOpen && <PartsBillModal onClose={() => { setPartsBillOpen(false); qc.invalidateQueries(['parts-bills-list']); }} />}
      {orderOpen    && <PartsOrderModal onClose={() => setOrderOpen(false)} />}
      {viewBill     && (
        <ViewBillModal
          bill={viewBill}
          onClose={() => setViewBill(null)}
          onEdit={() => { setEditBill(viewBill); setViewBill(null); }}
        />
      )}
      {editBill     && (
        <EditBillModal
          bill={editBill}
          onClose={() => setEditBill(null)}
          onSaved={() => { setEditBill(null); qc.invalidateQueries(['parts-bills-list']); }}
        />
      )}
    </div>
  );
}
