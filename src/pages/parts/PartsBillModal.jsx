import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { partsApi, customersApi, salesApi, serviceApi, errMsg } from '../../api/client';
import { notifyLowStock } from '../../utils/lowStockToast';
import toast from 'react-hot-toast';
import { printPartsBill } from './printPartsBill';

// ── Parts Bill Modal (walk-in counter) ───────────────────────────────
export function PartsBillModal({ onClose }) {
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
                      <span>CGST</span><span>₹{fmtI(Math.round(pbGst / 2 * 100) / 100)}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', fontSize:12, color:C.muted, borderBottom:`1px solid ${C.border}` }}>
                      <span>SGST</span><span>₹{fmtI(pbGst - Math.round(pbGst / 2 * 100) / 100)}</span>
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
