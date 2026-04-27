import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { partsApi, customersApi, errMsg } from '../api/client';
import { Btn, GhostBtn, Field, Skeleton, Empty, ApiError, useSortable } from '../components/ui';
import toast from 'react-hot-toast';

// ── PDF invoice printer ─────────────────────────────────────────────
function printPartsBill(bill) {
  const RS = 'Rs.';
  const items = bill.items || [];
  const grand    = bill.grand_total || 0;
  const subtotal = bill.subtotal    || 0;
  const gstTotal = bill.gst_total   || 0;
  const cgst     = Math.round(gstTotal / 2 * 100) / 100;
  const sgst     = Math.round((gstTotal - cgst) * 100) / 100;

  const rows = items.map((item, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f9f7f3'}">
      <td>${item.description || item.name || '—'}</td>
      <td style="font-family:monospace">${item.part_number || '—'}</td>
      <td style="font-family:monospace;text-align:center">${item.hsn_code || '—'}</td>
      <td style="text-align:center;font-weight:700">${item.qty}</td>
      <td style="text-align:right">${RS}${(item.unit_price || 0).toLocaleString('en-IN')}</td>
      <td style="text-align:center">${item.gst_rate || 18}%</td>
      <td style="text-align:right;font-weight:700;color:#B8860B">${RS}${Math.round(item.total || (item.unit_price || 0) * item.qty).toLocaleString('en-IN')}</td>
    </tr>`).join('');

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
        <div style={{ background:'#141414', borderTop:'3px solid #B8860B', padding:'16px 20px', borderRadius:'8px 8px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:9, color:'#B8860B', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase' }}>Parts Invoice</div>
            <div style={{ fontSize:18, fontWeight:800, fontFamily:'monospace', color:'#fff', marginTop:3 }}>{bill.bill_number}</div>
            <div style={{ fontSize:11, color:'#888', marginTop:2 }}>{bill.bill_date || bill.created_at?.slice(0,10)}</div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button onClick={() => printPartsBill(bill)}
              style={{ padding:'7px 14px', background:'rgba(184,134,11,.15)', border:'1px solid rgba(184,134,11,.4)', borderRadius:4, color:'#B8860B', fontSize:11, cursor:'pointer', fontFamily:'IBM Plex Sans,sans-serif', fontWeight:600 }}>
              🖨 Print
            </button>
            {onEdit && (
              <button onClick={onEdit}
                style={{ padding:'7px 14px', background:'rgba(59,130,246,.1)', border:'1px solid rgba(59,130,246,.35)', borderRadius:4, color:'var(--blue)', fontSize:11, cursor:'pointer', fontFamily:'IBM Plex Sans,sans-serif', fontWeight:600 }}>
                ✏ Edit
              </button>
            )}
            <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#888', fontSize:22, cursor:'pointer', padding:'0 4px', lineHeight:1 }}>×</button>
          </div>
        </div>

        <div style={{ overflowY:'auto', flex:1, padding:20 }}>
          {/* Customer + Payment */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:18 }}>
            <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:4, padding:'12px 16px' }}>
              <div style={{ fontSize:9, color:'#B8860B', fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:8 }}>Customer</div>
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
              <div style={{ fontSize:9, color:'#B8860B', fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:8 }}>Payment</div>
              <div style={{ fontSize:16, fontWeight:800 }}>{bill.payment_mode || 'Cash'}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>Sold by: {bill.sold_by || 'MM Motors'}</div>
            </div>
          </div>

          {/* Items table */}
          <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:16 }}>
            <thead>
              <tr style={{ background:'var(--surface2)', borderBottom:'1px solid var(--border)' }}>
                {[['Description','left'],['Part No.','left'],['HSN','center'],['Qty','center'],['Unit Price','center'],['GST%','center'],['Amount','right']].map(([h,a]) => (
                  <th key={h} style={{ padding:'8px 10px', fontSize:9, fontWeight:600, color:'var(--muted)', letterSpacing:'.06em', textAlign:a, textTransform:'uppercase' }}>{h}</th>
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
                <span style={{ fontSize:11, fontWeight:700, color:'var(--muted)', letterSpacing:'.06em', textTransform:'uppercase' }}>Total</span>
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

  const inp = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3, padding:'8px 10px', color:'var(--text)', outline:'none', fontSize:13, fontFamily:'IBM Plex Sans,sans-serif', width:'100%' };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={onClose}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, width:480, maxWidth:'96vw' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ background:'#141414', borderTop:'3px solid #B8860B', padding:'14px 20px', borderRadius:'8px 8px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:9, color:'#B8860B', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase' }}>Edit Bill</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#fff', marginTop:2 }}>{bill.bill_number}</div>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#888', fontSize:22, cursor:'pointer' }}>×</button>
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
      } else {
        setLookup('new');
      }
    } catch { setLookup('new'); }
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
      return [...prev, { ...part, qty: 1 }];
    });
    setPsearch('');
  };

  const setQty = (id, qty) => {
    const p = allParts.find(p => p.id === id);
    if (qty > (p?.stock || 0)) { toast.error('Not enough stock'); return; }
    setCart(prev => qty <= 0 ? prev.filter(c => c.id !== id) : prev.map(c => c.id === id ? { ...c, qty } : c));
  };

  const pbTotal   = cart.reduce((s, c) => s + (c.selling_price || 0) * c.qty, 0);
  const pbTaxable = cart.reduce((s, c) => s + (c.selling_price || 0) * c.qty / (1 + ((c.gst_rate || 18) / 100)), 0);
  const pbGst     = pbTotal - pbTaxable;
  const total     = Math.round(pbTotal);

  const handleGenerate = async () => {
    if (!cart.length) return toast.error('Add at least one part');
    setSaving(true);
    try {
      const res = await partsApi.createBill({
        customer_name:    cust.name,
        customer_mobile:  cust.mobile,
        customer_vehicle: cust.vehicle,
        payment_mode:     payMode,
        items: cart.map(c => ({
          part_id:     c.id,
          part_number: c.part_number || '',
          name:        c.name,
          hsn_code:    c.hsn_code || '8714',
          qty:         c.qty,
          unit_price:  c.selling_price || 0,
          gst_rate:    c.gst_rate || 18,
        })),
      });
      setDoneBill(res.data);
      qc.invalidateQueries(['parts-bills-list']);
      qc.invalidateQueries(['parts']);
      qc.invalidateQueries(['parts-stats']);
    } catch (e) {
      toast.error(errMsg(e, 'Failed to generate bill'));
    } finally {
      setSaving(false);
    }
  };

  const C = { gold:'#B8860B', muted:'var(--muted)', s2:'var(--surface2)', red:'var(--red,#ef4444)', green:'var(--green,#4ade80)', amber:'#fbbf24', surface:'var(--surface)', text:'var(--text)', blue:'var(--blue)', border:'var(--border)' };
  const inp = { background:C.s2, border:`1px solid ${C.border}`, borderRadius:3, padding:'8px 10px', color:C.text, outline:'none', fontSize:13, fontFamily:'IBM Plex Sans,sans-serif', width:'100%' };
  const fmtI = n => Math.round(n).toLocaleString('en-IN');

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:300, padding:'24px 16px', overflowY:'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background:C.surface, width:'100%', maxWidth:860, borderRadius:6, overflow:'hidden', boxShadow:'0 24px 80px rgba(0,0,0,.7)', fontFamily:'IBM Plex Sans,sans-serif' }}>

        {/* Header */}
        <div style={{ background:'#1A1A1A', borderTop:'3px solid #B8860B', padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontSize:9, letterSpacing:'.12em', color:C.gold, fontWeight:700, marginBottom:4 }}>MM MOTORS</div>
            <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>New Parts Bill</div>
            <div style={{ fontSize:11, color:'#888', marginTop:3 }}>Walk-in counter sale</div>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#888', fontSize:20, cursor:'pointer', padding:4 }}>×</button>
        </div>

        {doneBill ? (
          /* ── Success screen ── */
          <div style={{ padding:40, textAlign:'center' }}>
            <div style={{ fontSize:44, marginBottom:12 }}>✅</div>
            <div style={{ fontSize:18, fontWeight:800, marginBottom:6 }}>Bill Generated!</div>
            <div style={{ fontSize:13, color:C.muted, fontFamily:'monospace', marginBottom:4 }}>{doneBill.bill_number}</div>
            <div style={{ fontSize:16, fontWeight:700, color:C.gold, marginBottom:28 }}>
              ₹{fmtI(doneBill.grand_total || total)} — {payMode}
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
              <button onClick={() => printPartsBill(doneBill)}
                style={{ padding:'10px 22px', background:C.gold, border:'none', borderRadius:4, color:'#0c0c0d', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'IBM Plex Sans,sans-serif' }}>
                Print Bill
              </button>
              <button onClick={onClose}
                style={{ padding:'10px 22px', background:'transparent', border:`1px solid ${C.border}`, borderRadius:4, color:C.muted, fontSize:13, cursor:'pointer', fontFamily:'IBM Plex Sans,sans-serif' }}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding:'16px 20px 0' }}>
            {/* Customer */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:9, color:C.gold, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', marginBottom:10 }}>Customer Details</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                <div>
                  <label style={{ fontSize:9, color:C.muted, textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:4 }}>Name</label>
                  <input value={cust.name} onChange={e => setCust(p => ({ ...p, name: e.target.value }))} placeholder="Customer name" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize:9, color:C.muted, textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:4 }}>
                    Mobile
                    {lookup === 'found' && <span style={{ marginLeft:6, color:'#4ade80', fontSize:9 }}>✓ Found</span>}
                    {lookup === 'new'   && <span style={{ marginLeft:6, color:'#fbbf24', fontSize:9 }}>+ New customer</span>}
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
                  <label style={{ fontSize:9, color:C.muted, textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:4 }}>Vehicle (optional)</label>
                  <input value={cust.vehicle} onChange={e => setCust(p => ({ ...p, vehicle: e.target.value }))} placeholder="KA 07 U 3915" style={inp} />
                </div>
              </div>
            </div>

            {/* Parts search */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:9, color:C.gold, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', marginBottom:10 }}>Add Parts</div>
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
                    <tr style={{ background:'#1A1A1A' }}>
                      {['Part','Part No.','Qty','Unit Price','GST%','CGST%','SGST%','Amount',''].map((h, i) => (
                        <th key={i} style={{ padding:'7px 10px', color:C.gold, fontWeight:700, fontSize:10, letterSpacing:'.06em', textAlign: i >= 2 ? 'right' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item, idx) => {
                      const gstR   = item.gst_rate || 18;
                      const half   = (gstR / 2).toFixed(1).replace('.0', '');
                      const amount = (item.selling_price || 0) * item.qty;
                      return (
                        <tr key={item.id} style={{ background: idx%2===0 ? 'transparent' : C.s2, borderBottom:`1px solid ${C.border}` }}>
                          <td style={{ padding:'8px 10px', fontWeight:600 }}>{item.name}</td>
                          <td style={{ padding:'8px 10px', fontFamily:'monospace', fontSize:11, color:C.muted }}>{item.part_number}</td>
                          <td style={{ padding:'8px 6px', textAlign:'right' }}>
                            <input type="number" min="1" max={item.stock} value={item.qty}
                              onChange={e => setQty(item.id, Number(e.target.value))}
                              style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:3, padding:'3px 6px', color:C.text, fontSize:11, fontFamily:'IBM Plex Sans,sans-serif', width:52, textAlign:'right', outline:'none' }} />
                          </td>
                          <td style={{ padding:'8px 10px', textAlign:'right' }}>₹{item.selling_price}</td>
                          <td style={{ padding:'8px 10px', textAlign:'right', color:C.muted }}>{gstR}%</td>
                          <td style={{ padding:'8px 10px', textAlign:'right', color:C.muted }}>{half}%</td>
                          <td style={{ padding:'8px 10px', textAlign:'right', color:C.muted }}>{half}%</td>
                          <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, color:C.gold }}>₹{fmtI(Math.round(amount))}</td>
                          <td style={{ padding:'8px 6px' }}>
                            <button onClick={() => setCart(p => p.filter(c => c.id !== item.id))}
                              style={{ background:'transparent', border:'none', color:C.red, cursor:'pointer', fontSize:16, padding:0 }}>×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
                  <div style={{ minWidth:260 }}>
                    {[['Taxable Amount', `₹${fmtI(pbTaxable)}`], ['CGST', `₹${fmtI(pbGst / 2)}`], ['SGST', `₹${fmtI(pbGst / 2)}`]].map(([k,v]) => (
                      <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', fontSize:12, color:C.muted, borderBottom:`1px solid ${C.border}` }}>
                        <span>{k}</span><span>{v}</span>
                      </div>
                    ))}
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', fontSize:15, fontWeight:800, color:C.gold }}>
                      <span>Total</span><span>₹{fmtI(total)}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Payment mode */}
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:9, color:C.muted, textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:4 }}>Payment Mode</label>
              <select value={payMode} onChange={e => setPayMode(e.target.value)} style={{ ...inp, maxWidth:200 }}>
                {['Cash','UPI','Card','Bank Transfer','Credit'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
        )}

        {!doneBill && (
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'14px 20px', background:C.s2, borderTop:`1px solid ${C.border}` }}>
            <button onClick={onClose} style={{ padding:'9px 18px', background:'transparent', border:`1px solid ${C.border}`, borderRadius:4, color:C.muted, fontSize:12, cursor:'pointer', fontFamily:'IBM Plex Sans,sans-serif' }}>
              Cancel
            </button>
            <button onClick={handleGenerate} disabled={saving || cart.length === 0}
              style={{ padding:'9px 20px', background: saving || cart.length === 0 ? '#555' : C.gold, border:'none', borderRadius:4, color:'#0c0c0d', fontSize:12, fontWeight:700, cursor: saving || cart.length === 0 ? 'default' : 'pointer', fontFamily:'IBM Plex Sans,sans-serif' }}>
              {saving ? 'Generating…' : `Generate Bill — ₹${fmtI(total)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function stockStyle(p) {
  if (p.stock === 0)                   return { color:'#f87171', bg:'rgba(248,113,113,.08)', border:'rgba(248,113,113,.2)', label:'Out of stock' };
  if (p.stock <= (p.reorder_level||5)) return { color:'#fbbf24', bg:'rgba(251,191,36,.08)',  border:'rgba(251,191,36,.2)',  label:'Low stock' };
  return                                      { color:'#4ade80', bg:'rgba(74,222,128,.08)',   border:'rgba(74,222,128,.2)',  label:'OK' };
}

// ── Add / Edit part form ─────────────────────────────────────────────
function PartForm({ initial = {}, onSave, onCancel, saving }) {
  const [f, setF] = useState({
    part_number:'', name:'', category:'', brand:'', stock:'0', reorder_level:'5',
    purchase_price:'', selling_price:'', gst_rate:'18', hsn_code:'', location:'',
    ...initial,
    stock: String(initial.stock ?? 0),
    reorder_level: String(initial.reorder_level ?? 5),
    purchase_price: String(initial.purchase_price ?? ''),
    selling_price: String(initial.selling_price ?? ''),
    gst_rate: String(initial.gst_rate ?? 18),
  });
  const s = k => e => setF(p=>({...p,[k]:e.target.value}));
  const selStyle = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3, padding:'8px 10px', color:'var(--text)', outline:'none', fontSize:13, fontFamily:'IBM Plex Sans,sans-serif', width:'100%' };

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
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
        <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
        <Btn disabled={!f.name||!f.selling_price||saving} onClick={()=>onSave({
          ...f,
          stock:          parseInt(f.stock)||0,
          reorder_level:  parseInt(f.reorder_level)||5,
          purchase_price: parseFloat(f.purchase_price)||0,
          selling_price:  parseFloat(f.selling_price)||0,
          gst_rate:       parseFloat(f.gst_rate)||18,
          compatible_with:[],
        })}>
          {saving?'Saving…':'Save part'}
        </Btn>
      </div>
    </div>
  );
}

// ── Parts Order Modal (low stock) ────────────────────────────────────
function PartsOrderModal({ onClose }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['parts-low-stock-order'],
    queryFn: () => partsApi.lowStock().then(r => r.data),
  });
  const lowParts = Array.isArray(data) ? data : [];

  // inline edit state: { [partId]: { reorder_level: number } }
  const [editing, setEditing] = useState({});
  const [saving, setSaving]   = useState({});
  const [adding, setAdding]   = useState(false);
  const [newPart, setNewPart] = useState({ part_number:'', name:'', brand:'', category:'', stock:0, reorder_level:5, purchase_price:0, selling_price:0, gst_rate:18, hsn_code:'' });

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
    } catch(e) { toast.error('Failed to update'); }
    finally { setSaving(prev => ({ ...prev, [p.id]: false })); }
  };

  const deletePart = async (p) => {
    if (!window.confirm(`Remove "${p.name}" from the reorder list? This deletes the part entirely.`)) return;
    try {
      await partsApi.delete(p.id);
      qc.invalidateQueries(['parts-low-stock-order']);
      qc.invalidateQueries(['parts']);
      qc.invalidateQueries(['parts-stats']);
      toast.success('Part deleted');
    } catch(e) { toast.error('Failed to delete'); }
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

  const inp = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3, padding:'3px 6px', color:'var(--text)', fontSize:11, fontFamily:'IBM Plex Sans,sans-serif', width:'100%', outline:'none' };

  const handlePrint = () => {
    const rows = lowParts.map(p => `
      <tr>
        <td>${p.part_number}</td>
        <td>${p.name}</td>
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
    <p>Generated: ${new Date().toLocaleDateString('en-IN')} | ${lowParts.length} items below reorder level</p>
    <table><thead><tr><th>Part No.</th><th>Name</th><th>Brand</th><th>Category</th><th>Current Stock</th><th>Reorder Level</th><th>Suggested Order</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <script>window.onload=()=>{window.print();}</script></body></html>`;
    const w = window.open('','_blank');
    w.document.write(html);
    w.document.close();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={onClose}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, width:820, maxWidth:'96vw', maxHeight:'90vh', display:'flex', flexDirection:'column' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ background:'#141414', padding:'16px 20px', borderRadius:'8px 8px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:700 }}>Parts Reorder List</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>Parts below reorder level — needs restocking</div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button onClick={() => setAdding(v => !v)}
              style={{ padding:'7px 14px', background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.35)', borderRadius:4, color:'#22c55e', fontSize:11, cursor:'pointer', fontFamily:'IBM Plex Sans,sans-serif', fontWeight:600 }}>
              + Add Part
            </button>
            {lowParts.length > 0 && (
              <button onClick={handlePrint}
                style={{ padding:'7px 14px', background:'rgba(184,134,11,.15)', border:'1px solid rgba(184,134,11,.4)', borderRadius:4, color:'var(--accent)', fontSize:11, cursor:'pointer', fontFamily:'IBM Plex Sans,sans-serif', fontWeight:600 }}>
                Print Order List
              </button>
            )}
            <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--muted)', fontSize:20, cursor:'pointer' }}>×</button>
          </div>
        </div>

        {/* Add Part Form */}
        {adding && (
          <div style={{ padding:'14px 20px', background:'rgba(34,197,94,.05)', borderBottom:'1px solid var(--border)', display:'grid', gridTemplateColumns:'repeat(5,1fr) auto', gap:8, alignItems:'end', flexShrink:0 }}>
            {[['Part No.','part_number','text'],['Name','name','text'],['Brand','brand','text'],['Stock','stock','number'],['Reorder Lvl','reorder_level','number']].map(([label,key,type])=>(
              <div key={key}>
                <div style={{ fontSize:9, color:'var(--muted)', marginBottom:3, letterSpacing:'.05em', textTransform:'uppercase' }}>{label}</div>
                <input type={type} value={newPart[key]} onChange={e=>setNewPart(p=>({...p,[key]:type==='number'?Number(e.target.value):e.target.value}))} style={inp} />
              </div>
            ))}
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={addPart} style={{ padding:'5px 12px', background:'#22c55e', border:'none', borderRadius:3, color:'#000', fontSize:11, fontWeight:700, cursor:'pointer' }}>Add</button>
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
              <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
              All parts are well stocked!
            </div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--border)' }}>
                  {['Part No.','Name','Brand','Category','Stock','Reorder','Suggested Order','Actions'].map(h => (
                    <th key={h} style={{ padding:'9px 16px', textAlign:'left', fontSize:9, letterSpacing:'.06em', color:'var(--dim)', fontWeight:600, textTransform:'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lowParts.map(p => {
                  const isEditing = !!editing[p.id];
                  return (
                    <tr key={p.id} style={{ borderBottom:'1px solid var(--border)', background: isEditing ? 'rgba(184,134,11,.05)' : 'transparent' }}>
                      <td className="mono" style={{ padding:'10px 16px', fontSize:10, color:'var(--blue)' }}>{p.part_number}</td>
                      <td style={{ padding:'10px 16px', fontSize:11, fontWeight:600 }}>{p.name}</td>
                      <td style={{ padding:'10px 16px', fontSize:10, color:'var(--muted)' }}>{p.brand||'—'}</td>
                      <td style={{ padding:'10px 16px', fontSize:10, color:'var(--muted)' }}>{p.category||'—'}</td>
                      <td style={{ padding:'10px 16px' }}>
                        <span style={{ fontSize:14, fontWeight:800, color:p.stock===0?'var(--red)':'#fbbf24' }}>{p.stock}</span>
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
                              style={{ padding:'3px 10px', background:'var(--accent)', border:'none', borderRadius:3, color:'#000', fontSize:10, fontWeight:700, cursor:'pointer' }}>
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
                            <button onClick={() => deletePart(p)}
                              style={{ padding:'3px 8px', background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)', borderRadius:3, color:'var(--red,#ef4444)', fontSize:10, cursor:'pointer' }}>
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
      return ex ? prev.map(i=>i.part.id===p.id?{...i,qty:i.qty+1}:i) : [...prev,{part:p,qty:1}];
    });
    setSearch('');
  };
  const updateQty = (id, qty) => {
    if (qty<=0) setCart(p=>p.filter(i=>i.part.id!==id));
    else setCart(p=>p.map(i=>i.part.id===id?{...i,qty}:i));
  };

  const pbTotal   = cart.reduce((s,{part,qty})=>s+part.selling_price*qty,0);
  const pbTaxable = cart.reduce((s,{part,qty})=>s+part.selling_price*qty/(1+(part.gst_rate/100)),0);
  const pbGst     = pbTotal - pbTaxable;
  const pbCgst    = pbGst / 2;
  const pbSgst    = pbGst / 2;
  const grand     = pbTotal;

  const handleSubmit = async () => {
    if (!cart.length) return toast.error('Add at least one part');
    setSaving(true);
    try {
      await partsApi.createBill({
        customer_name:    customer.name,
        customer_mobile:  customer.mobile,
        customer_vehicle: '',
        items: cart.map(({part,qty})=>({ part_id:part.id, part_number:part.part_number, name:part.name, hsn_code:part.hsn_code||'8714', qty, unit_price:part.selling_price, gst_rate:part.gst_rate })),
        payment_mode: payMode,
      });
      toast.success('Bill created');
      onDone();
    } catch(e) {
      toast.error(errMsg(e, 'Failed'));
    } finally {
      setSaving(false);
    }
  };

  const selStyle = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3, padding:'8px 10px', color:'var(--text)', outline:'none', fontSize:13, fontFamily:'IBM Plex Sans,sans-serif', width:'100%' };

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <GhostBtn onClick={onCancel} sm>← Parts</GhostBtn>
        <span style={{ fontSize:13, fontWeight:500 }}>New parts bill</span>
      </div>
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
                      <div style={{ width:28, height:28, background:'var(--accent)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, color:'#0c0c0d', flexShrink:0 }}>+</div>
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
                    {['Part Name','Qty','Unit Price','GST%','CGST%','SGST%','Amount',''].map((h,i)=>(
                      <th key={i} style={{ padding:'8px 10px', fontSize:10, fontWeight:600, color:'var(--muted)', letterSpacing:'.05em', textAlign:i>=1?'center':'left', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cart.map(({part,qty},idx)=>{
                    const half = (part.gst_rate/2).toFixed(1).replace('.0','');
                    return (
                      <tr key={part.id} style={{ borderBottom:'1px solid var(--border)', background:idx%2===0?'transparent':'var(--surface2)' }}>
                        <td style={{ padding:'8px 10px', fontSize:11, fontWeight:500 }}>{part.name}<div className="mono" style={{ fontSize:9, color:'var(--muted)', marginTop:1 }}>{part.part_number}</div></td>
                        <td style={{ padding:'8px 6px', textAlign:'center' }}>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
                            <button onClick={()=>updateQty(part.id,qty-1)} style={{ width:22, height:22, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:2, cursor:'pointer', fontSize:13, fontFamily:'inherit' }}>−</button>
                            <span style={{ fontSize:12, fontWeight:600, width:22, textAlign:'center' }}>{qty}</span>
                            <button onClick={()=>updateQty(part.id,qty+1)} style={{ width:22, height:22, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:2, cursor:'pointer', fontSize:13, fontFamily:'inherit' }}>+</button>
                          </div>
                        </td>
                        <td style={{ padding:'8px 10px', textAlign:'center', fontSize:11 }}>₹{part.selling_price.toLocaleString('en-IN')}</td>
                        <td style={{ padding:'8px 10px', textAlign:'center', fontSize:11, color:'var(--muted)' }}>{part.gst_rate}%</td>
                        <td style={{ padding:'8px 10px', textAlign:'center', fontSize:11, color:'var(--muted)' }}>{half}%</td>
                        <td style={{ padding:'8px 10px', textAlign:'center', fontSize:11, color:'var(--muted)' }}>{half}%</td>
                        <td style={{ padding:'8px 10px', textAlign:'center', fontSize:12, fontWeight:700, color:'var(--accent)' }}>₹{Math.round(part.selling_price*qty).toLocaleString('en-IN')}</td>
                        <td style={{ padding:'8px 6px', textAlign:'center' }}>
                          <button onClick={()=>setCart(p=>p.filter(i=>i.part.id!==part.id))} style={{ background:'transparent', border:'none', color:'var(--red,#ef4444)', cursor:'pointer', fontSize:16, padding:0 }}>×</button>
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
    queryFn: ()=>partsApi.list({ search:search||undefined, category:cat||undefined, limit:2000 }).then(r=>r.data),
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

  const parts = Array.isArray(data)?data:[];
  const st    = statsData||{};

  const visibleParts = parts.filter(p => {
    if (filter==='low') return p.stock>0 && p.stock<=(p.reorder_level||5);
    if (filter==='out') return p.stock===0;
    return true;
  }).filter(p => !cat || p.category===cat);

  const { sorted: sortedParts, Th: PartsTh } = useSortable(visibleParts, 'name', 'asc');

  const selStyle = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3, padding:'8px 10px', color:'var(--text)', outline:'none', fontSize:13, fontFamily:'IBM Plex Sans,sans-serif' };

  if (view==='add') {
    return (
      <div style={{ padding:24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
          <GhostBtn onClick={()=>setView('list')} sm>← Parts</GhostBtn>
          <span style={{ fontSize:13, fontWeight:500 }}>Add new part</span>
        </div>
        <PartForm onSave={d=>createMut.mutate(d)} onCancel={()=>setView('list')} saving={createMut.isPending} />
      </div>
    );
  }

  if (view==='edit' && editPart) {
    return (
      <div style={{ padding:24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
          <GhostBtn onClick={()=>{ setView('list'); setEditPart(null); }} sm>← Parts</GhostBtn>
          <span style={{ fontSize:13, fontWeight:500 }}>Edit part — {editPart.part_number}</span>
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
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', borderBottom:'1px solid var(--border)' }}>
        {[
          { l:'Total SKUs',    v:st.total_skus??'—',   c:'var(--accent)' },
          { l:'Low stock',     v:st.low_stock??'—',    c:'#fbbf24' },
          { l:'Out of stock',  v:st.out_of_stock??'—', c:'var(--red)' },
          { l:'Stock value',   v:st.stock_value   ? '₹'+Math.round(st.stock_value/1000)+'K'   : '—', c:'var(--blue)' },
          { l:'Selling value', v:st.selling_value ? '₹'+Math.round(st.selling_value/1000)+'K' : '—', c:'var(--green)' },
        ].map((s,i)=>(
          <div key={i} style={{ padding:'14px 20px', borderRight:i<4?'1px solid var(--border)':0 }}>
            <div className="label-xs">{s.l}</div>
            <div className="display" style={{ fontSize:24, color:s.c, marginTop:6 }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* tabs + actions */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', background:'var(--surface)' }}>
        {[{id:'stock',l:'Stock Inventory'},{id:'bills',l:'Bills History'}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ padding:'10px 20px', background:'transparent', border:'none', borderBottom:tab===t.id?'2px solid var(--accent)':'2px solid transparent', color:tab===t.id?'var(--accent)':'var(--muted)', cursor:'pointer', fontSize:11, letterSpacing:'.06em', textTransform:'uppercase', fontFamily:'IBM Plex Sans,sans-serif' }}>
            {t.l}
          </button>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center', padding:'0 16px' }}>
          <Btn onClick={()=>setPartsBillOpen(true)}>+ Parts Bill</Btn>
          {/* 2. Parts Order replaces New Bill — shows low stock list */}
          <button onClick={()=>setOrderOpen(true)}
            style={{ padding:'8px 14px', background:'rgba(251,191,36,.12)', border:'1px solid rgba(251,191,36,.4)', borderRadius:4, color:'#fbbf24', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'IBM Plex Sans,sans-serif', letterSpacing:'.02em' }}>
            📦 Parts Order
          </button>
          <GhostBtn onClick={()=>setView('add')}>+ Add part</GhostBtn>
        </div>
      </div>

      {/* stock tab */}
      {tab==='stock' && (
        <>
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 20px', borderBottom:'1px solid var(--border)', flexWrap:'wrap' }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search parts…" style={{ width:220 }} />
            <select value={cat} onChange={e=>setCat(e.target.value)} style={{ ...selStyle, width:160 }}>
              <option value="">All categories</option>
              {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ display:'flex', gap:6 }}>
              {[['all','All'],['low','Low stock'],['out','Out of stock']].map(([v,l])=>(
                <button key={v} onClick={()=>setFilter(v)} style={{ padding:'6px 12px', background:filter===v?'var(--surface2)':'transparent', border:`1px solid ${filter===v?'var(--accent)':'var(--border)'}`, borderRadius:3, color:filter===v?'var(--accent)':'var(--muted)', cursor:'pointer', fontSize:10, letterSpacing:'.06em', fontFamily:'IBM Plex Sans,sans-serif' }}>{l.toUpperCase()}</button>
              ))}
            </div>
            <span className="label-xs" style={{ marginLeft:'auto' }}>{visibleParts.length} parts</span>
          </div>

          {(st.low_stock>0||st.out_of_stock>0) && (
            <div style={{ margin:'14px 20px', padding:'10px 14px', background:'rgba(251,191,36,.06)', border:'1px solid rgba(251,191,36,.2)', borderRadius:3, display:'flex', gap:12, alignItems:'center' }}>
              <div style={{ width:6, height:6, background:'#fbbf24', borderRadius:'50%', flexShrink:0 }} />
              <div style={{ fontSize:12 }}>
                {st.low_stock>0&&<><span style={{ fontWeight:600, color:'#fbbf24' }}>{st.low_stock} parts</span><span style={{ color:'var(--muted)' }}> below reorder level</span></>}
                {st.out_of_stock>0&&<> · <span style={{ fontWeight:600, color:'var(--red)' }}>{st.out_of_stock} out of stock</span></>}
              </div>
              <button onClick={()=>setOrderOpen(true)} style={{ marginLeft:'auto', padding:'4px 12px', background:'rgba(251,191,36,.15)', border:'1px solid rgba(251,191,36,.4)', borderRadius:3, color:'#fbbf24', fontSize:10, cursor:'pointer', fontWeight:600, fontFamily:'IBM Plex Sans,sans-serif' }}>
                View Order List →
              </button>
            </div>
          )}

          {error ? <div style={{ padding:20 }}><ApiError error={error}/></div>
            : isLoading ? <div style={{ padding:20, display:'flex', flexDirection:'column', gap:8 }}>{[1,2,3,4,5].map(i=><Skeleton key={i} h={44}/>)}</div>
            : visibleParts.length===0 ? <Empty message="No parts found" />
            : (
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)' }}>
                    {[['Part no.','part_number'],['Name','name'],['Category','category'],['Brand','brand'],['Loc','location'],['Stock','stock'],['Reorder','reorder_level'],['Purchase','purchase_price'],['Selling','selling_price'],['GST','gst_rate'],['Margin',''],['Status',''],['','']].map(([h,f])=>(
                      <PartsTh key={h} field={f||null} style={{ padding:'8px 12px', textAlign:'left', fontSize:9, letterSpacing:'.06em', color:'var(--dim)', fontWeight:500, textTransform:'uppercase' }}>{h}</PartsTh>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedParts.map(p=>{
                    const sc     = stockStyle(p);
                    const margin = p.selling_price>0 ? Math.round((p.selling_price-p.purchase_price)/p.selling_price*100) : 0;
                    return (
                      <tr key={p.id} style={{ borderBottom:'1px solid var(--border)' }}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <td className="mono" style={{ padding:'9px 12px', fontSize:10, color:'var(--blue)' }}>{p.part_number}</td>
                        <td style={{ padding:'9px 12px', fontSize:11, fontWeight:500, maxWidth:160 }}>
                          <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
                        </td>
                        <td style={{ padding:'9px 12px', fontSize:10, color:'var(--muted)' }}>{p.category}</td>
                        <td style={{ padding:'9px 12px', fontSize:10, color:'var(--muted)' }}>{p.brand}</td>
                        <td className="mono" style={{ padding:'9px 12px', fontSize:10, color:'var(--dim)' }}>{p.location}</td>
                        <td style={{ padding:'9px 12px' }}>
                          <span className="display" style={{ fontSize:16, color:p.stock===0?'var(--red)':p.stock<=(p.reorder_level||5)?'#fbbf24':'var(--text)' }}>{p.stock}</span>
                        </td>
                        <td style={{ padding:'9px 12px', fontSize:10, color:'var(--dim)' }}>{p.reorder_level}</td>
                        <td className="mono" style={{ padding:'9px 12px', fontSize:10, color:'var(--muted)' }}>₹{p.purchase_price?.toLocaleString('en-IN')}</td>
                        <td className="mono" style={{ padding:'9px 12px', fontSize:11, fontWeight:700, color:'var(--accent)' }}>₹{p.selling_price?.toLocaleString('en-IN')}</td>
                        <td style={{ padding:'9px 12px', fontSize:10, color:'var(--muted)' }}>{p.gst_rate}%</td>
                        <td style={{ padding:'9px 12px', fontSize:10, fontWeight:600, color:margin>=30?'var(--green)':margin>=15?'#fbbf24':'var(--red)' }}>{margin}%</td>
                        <td style={{ padding:'9px 12px' }}>
                          <span style={{ fontSize:9, padding:'3px 8px', borderRadius:2, fontWeight:500, color:sc.color, background:sc.bg, border:`1px solid ${sc.border}` }}>{sc.label}</span>
                        </td>
                        {/* 3. Edit + Delete + Adj buttons */}
                        <td style={{ padding:'9px 8px' }}>
                          <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                            <button onClick={()=>{ setEditPart(p); setView('edit'); }}
                              style={{ padding:'4px 9px', background:'transparent', border:'1px solid rgba(59,130,246,.35)', borderRadius:3, fontSize:10, cursor:'pointer', color:'var(--blue)', fontFamily:'IBM Plex Sans,sans-serif' }}>
                              Edit
                            </button>
                            <button onClick={()=>{ const qty=parseInt(prompt(`Adjust stock for "${p.name}"\nCurrent: ${p.stock}\n+ for in, - for out:`)); if(!isNaN(qty)&&qty!==0) adjustMut.mutate({id:p.id,qty,reason:'Manual adjustment'}); }}
                              style={{ padding:'4px 9px', background:'transparent', border:'1px solid var(--border)', borderRadius:3, fontSize:10, cursor:'pointer', color:'var(--muted)', fontFamily:'IBM Plex Sans,sans-serif' }}>
                              ±Adj
                            </button>
                            <button onClick={()=>window.confirm(`Delete "${p.name}"? This cannot be undone.`)&&deleteMut.mutate(p.id)}
                              style={{ padding:'4px 8px', background:'transparent', border:'1px solid rgba(220,38,38,.3)', borderRadius:3, fontSize:10, cursor:'pointer', color:'var(--red)', fontFamily:'IBM Plex Sans,sans-serif' }}>
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
        </>
      )}

      {/* bills tab — parts-bills (from service PartsBillModal) */}
      {tab==='bills' && (
        billsLoading ? <div style={{ padding:20 }}><Skeleton h={200}/></div>
        : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                {['Bill #','Date','Job #','Customer','Parts Used','Amount','Payment','Actions'].map(h=>(
                  <th key={h} style={{ padding:'9px 20px', textAlign:'left', fontSize:9, letterSpacing:'.07em', color:'var(--dim)', fontWeight:500, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(billsData)?billsData:[]).length===0 && (
                <tr><td colSpan={8}><div style={{ padding:40, textAlign:'center', color:'var(--muted)', fontSize:12 }}>No parts bills yet</div></td></tr>
              )}
              {(Array.isArray(billsData)?billsData:[]).map(b=>{
                const total = b.grand_total || b.items?.reduce((s,i)=>s+i.unit_price*i.qty,0) || 0;
                return (
                  <tr key={b.id} style={{ borderBottom:'1px solid var(--border)' }}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td className="mono" style={{ padding:'11px 20px', fontSize:11, color:'var(--blue)' }}>{b.bill_number}</td>
                    <td className="mono" style={{ padding:'11px 20px', fontSize:11, color:'var(--dim)' }}>{b.bill_date || b.created_at?.slice(0,10)}</td>
                    <td className="mono" style={{ padding:'11px 20px', fontSize:11, color:'var(--muted)' }}>{b.job_number||'—'}</td>
                    <td style={{ padding:'11px 20px', fontSize:12, fontWeight:500 }}>{b.customer_name||'—'}</td>
                    <td style={{ padding:'11px 20px', fontSize:10, color:'var(--muted)', maxWidth:200 }}>
                      <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {b.items?.map(i=>`${i.description||i.name} ×${i.qty}`).join(', ') || '—'}
                      </div>
                    </td>
                    <td className="display" style={{ padding:'11px 20px', fontSize:14, color:'var(--accent)' }}>₹{Math.round(total).toLocaleString('en-IN')}</td>
                    <td style={{ padding:'11px 20px', fontSize:10 }}><span className="pill pill-green">{b.payment_mode||'Cash'}</span></td>
                    <td style={{ padding:'11px 20px' }}>
                      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                        <button onClick={() => setViewBill(b)}
                          style={{ padding:'4px 10px', background:'rgba(184,134,11,.1)', border:'1px solid rgba(184,134,11,.35)', borderRadius:3, fontSize:10, cursor:'pointer', color:'var(--accent)', fontFamily:'IBM Plex Sans,sans-serif' }}>
                          View
                        </button>
                        <button onClick={() => setEditBill(b)}
                          style={{ padding:'4px 10px', background:'rgba(59,130,246,.08)', border:'1px solid rgba(59,130,246,.3)', borderRadius:3, fontSize:10, cursor:'pointer', color:'var(--blue)', fontFamily:'IBM Plex Sans,sans-serif' }}>
                          Edit
                        </button>
                        <button onClick={()=>window.confirm(`Delete bill ${b.bill_number}?`)&&deleteBillMut.mutate(b.id)}
                          style={{ padding:'4px 8px', background:'transparent', border:'1px solid rgba(220,38,38,.3)', borderRadius:3, fontSize:10, cursor:'pointer', color:'var(--red)', fontFamily:'IBM Plex Sans,sans-serif' }}>✕</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
