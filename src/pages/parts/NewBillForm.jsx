import { useState } from 'react';
import { partsApi, errMsg } from '../../api/client';
import { Btn, GhostBtn, Field } from '../../components/ui';
import { notifyLowStock } from '../../utils/lowStockToast';
import toast from 'react-hot-toast';
import { useDraft, DraftBar } from '../../hooks/useDraft';
import { stockStyle } from './shared';

// ── New parts bill ───────────────────────────────────────────────────
export function NewBillForm({ parts, onCancel, onDone }) {
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
  const pbCgst    = Math.round(pbGst / 2 * 100) / 100;
  const pbSgst    = Math.round((pbGst - pbCgst) * 100) / 100;
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
