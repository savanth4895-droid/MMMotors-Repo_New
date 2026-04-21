import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { partsApi, partsSalesApi } from '../api/client';
import { Btn, GhostBtn, Field, Skeleton, Empty, ApiError } from '../components/ui';
import toast from 'react-hot-toast';

const CATEGORIES = ['Engine','Electrical','Brakes','Tyres & Tubes','Filters','Body Parts','Transmission','Suspension','Accessories','Consumables'];

function stockStyle(p) {
  if (p.stock === 0)                         return { color:'#f87171', bg:'rgba(248,113,113,.08)', border:'rgba(248,113,113,.2)', label:'Out of stock' };
  if (p.stock <= (p.reorder_level||5))       return { color:'#fbbf24', bg:'rgba(251,191,36,.08)',  border:'rgba(251,191,36,.2)',  label:'Low stock' };
  return                                            { color:'#4ade80', bg:'rgba(74,222,128,.08)',   border:'rgba(74,222,128,.2)',  label:'OK' };
}

// ── Add part form ────────────────────────────────────────────────────
function AddPartForm({ onSave, onCancel, saving }) {
  const [f, setF] = useState({ part_number:'', name:'', category:'', brand:'', stock:'0', reorder_level:'5', purchase_price:'', selling_price:'', gst_rate:'18', hsn_code:'', location:'' });
  const s = k => e => setF(p=>({...p,[k]:e.target.value}));
  const selStyle = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3, padding:'8px 10px', color:'var(--text)', outline:'none', fontSize:13, fontFamily:'IBM Plex Sans,sans-serif', width:'100%' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:680 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <Field label="Part number *"><input value={f.part_number}    onChange={s('part_number')}    placeholder="30050-KWB-901" className="mono" /></Field>
        <Field label="Name *">       <input value={f.name}           onChange={s('name')}           placeholder="Spark Plug (Iridium)" /></Field>
        <Field label="Category">
          <select value={f.category} onChange={s('category')} style={selStyle}>
            <option value="">Select category</option>
            {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Brand">       <input value={f.brand}          onChange={s('brand')}          placeholder="NGK, Honda, MRF…" /></Field>
        <Field label="Opening stock"><input type="number" value={f.stock}          onChange={s('stock')}          placeholder="0" /></Field>
        <Field label="Reorder level"><input type="number" value={f.reorder_level} onChange={s('reorder_level')} placeholder="5" /></Field>
        <Field label="Purchase price (₹)"><input type="number" value={f.purchase_price} onChange={s('purchase_price')} placeholder="0" /></Field>
        <Field label="Selling price (₹) *"><input type="number" value={f.selling_price} onChange={s('selling_price')} placeholder="0" /></Field>
        <Field label="GST rate (%)">
          <select value={f.gst_rate} onChange={s('gst_rate')} style={selStyle}>
            {[5,12,18,28].map(r=><option key={r} value={r}>{r}%</option>)}
          </select>
        </Field>
        <Field label="HSN code"><input value={f.hsn_code}  onChange={s('hsn_code')}  placeholder="8511"  className="mono" /></Field>
        <Field label="Location">  <input value={f.location}  onChange={s('location')}  placeholder="A1-R2" className="mono" /></Field>
      </div>
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
        <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
        <Btn disabled={!f.part_number||!f.name||!f.selling_price||saving} onClick={()=>onSave({
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

  const subtotal = cart.reduce((s,{part,qty})=>s+part.selling_price*qty,0);
  const gstTotal = cart.reduce((s,{part,qty})=>s+part.selling_price*qty*part.gst_rate/100,0);
  const grand    = subtotal+gstTotal;

  const handleSubmit = async () => {
    if (!cart.length) return toast.error('Add at least one part');
    setSaving(true);
    try {
      await partsSalesApi.create({
        customer_name:   customer.name,
        customer_mobile: customer.mobile,
        items: cart.map(({part,qty})=>({ part_id:part.id, part_number:part.part_number, name:part.name, hsn_code:part.hsn_code||'', qty, unit_price:part.selling_price, gst_rate:part.gst_rate })),
        payment_mode: payMode,
      });
      toast.success('Bill created');
      onDone();
    } catch(e) {
      toast.error(e?.response?.data?.detail||'Failed');
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
        {/* Left */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:3, padding:'14px 16px' }}>
            <div className="label-xs" style={{ marginBottom:10 }}>Customer</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <Field label="Name"><input value={customer.name}   onChange={e=>setCustomer(p=>({...p,name:e.target.value}))}   placeholder="Customer name" /></Field>
              <Field label="Mobile"><input value={customer.mobile} onChange={e=>setCustomer(p=>({...p,mobile:e.target.value}))} placeholder="10-digit" /></Field>
            </div>
          </div>
          {/* search */}
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
          {/* cart */}
          {cart.length>0 && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:3, overflow:'hidden' }}>
              <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', fontSize:10, color:'var(--muted)', letterSpacing:'.06em', textTransform:'uppercase' }}>Cart — {cart.length} item{cart.length>1?'s':''}</div>
              {cart.map(({part,qty})=>(
                <div key={part.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, fontWeight:500 }}>{part.name}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>₹{part.selling_price.toLocaleString('en-IN')} + {part.gst_rate}% GST</div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <button onClick={()=>updateQty(part.id,qty-1)} style={{ width:24, height:24, background:'var(--surface2)', border:'1px solid var(--border2)', borderRadius:2, cursor:'pointer', fontSize:14, fontFamily:'inherit' }}>−</button>
                    <span style={{ fontSize:12, fontWeight:600, width:24, textAlign:'center' }}>{qty}</span>
                    <button onClick={()=>updateQty(part.id,qty+1)} style={{ width:24, height:24, background:'var(--surface2)', border:'1px solid var(--border2)', borderRadius:2, cursor:'pointer', fontSize:14, fontFamily:'inherit' }}>+</button>
                  </div>
                  <div style={{ textAlign:'right', minWidth:70 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'var(--accent)' }}>₹{Math.round(part.selling_price*qty*(1+part.gst_rate/100)).toLocaleString('en-IN')}</div>
                    <div style={{ fontSize:10, color:'var(--dim)' }}>incl. GST</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right — summary */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:3, padding:16 }}>
            <div className="label-xs" style={{ marginBottom:12 }}>Bill summary</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--muted)' }}>
                <span>Subtotal (excl. GST)</span><span className="mono">₹{Math.round(subtotal).toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--muted)' }}>
                <span>GST</span><span className="mono">₹{Math.round(gstTotal).toLocaleString('en-IN')}</span>
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
  const [tab,    setTab]    = useState('stock');
  const [view,   setView]   = useState('list');
  const [search, setSearch] = useState('');
  const [cat,    setCat]    = useState('');
  const [filter, setFilter] = useState('all');

  const { data:statsData } = useQuery({
    queryKey:['parts-stats'],
    queryFn: ()=>partsApi.stats().then(r=>r.data),
  });
  const { data, isLoading, error } = useQuery({
    queryKey:['parts', search, cat, filter],
    queryFn: ()=>partsApi.list({ search:search||undefined, category:cat||undefined, limit:300 }).then(r=>r.data),
  });
  const { data:billsData, isLoading:billsLoading } = useQuery({
    queryKey:['parts-sales'],
    queryFn: ()=>partsSalesApi.list({ limit:100 }).then(r=>r.data),
    enabled: tab==='bills',
  });

  const createMut = useMutation({
    mutationFn: d=>partsApi.create(d),
    onSuccess: ()=>{ qc.invalidateQueries(['parts']); qc.invalidateQueries(['parts-stats']); setView('list'); toast.success('Part added'); },
    onError:   e=>toast.error(e?.response?.data?.detail||'Failed'),
  });
  const adjustMut = useMutation({
    mutationFn: ({id,qty,reason})=>partsApi.adjustStock(id,{qty,reason}),
    onSuccess: ()=>{ qc.invalidateQueries(['parts']); qc.invalidateQueries(['parts-stats']); toast.success('Stock updated'); },
    onError: ()=>toast.error('Adjust failed'),
  });

  const parts = Array.isArray(data)?data:[];
  const st    = statsData||{};

  // client-side filter for low/out
  const visibleParts = parts.filter(p => {
    if (filter==='low') return p.stock>0 && p.stock<=(p.reorder_level||5);
    if (filter==='out') return p.stock===0;
    return true;
  }).filter(p => !cat || p.category===cat);

  const selStyle = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3, padding:'8px 10px', color:'var(--text)', outline:'none', fontSize:13, fontFamily:'IBM Plex Sans,sans-serif' };

  if (view==='add') {
    return (
      <div style={{ padding:24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
          <GhostBtn onClick={()=>setView('list')} sm>← Parts</GhostBtn>
          <span style={{ fontSize:13, fontWeight:500 }}>Add new part</span>
        </div>
        <AddPartForm onSave={d=>createMut.mutate(d)} onCancel={()=>setView('list')} saving={createMut.isPending} />
      </div>
    );
  }

  if (view==='new-bill') {
    return <NewBillForm parts={parts} onCancel={()=>setView('list')} onDone={()=>{ setView('list'); setTab('bills'); qc.invalidateQueries(['parts-sales']); qc.invalidateQueries(['parts']); qc.invalidateQueries(['parts-stats']); }} />;
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
        {[{id:'stock',l:'Stock inventory'},{id:'bills',l:'Bills history'}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ padding:'10px 20px', background:'transparent', border:'none', borderBottom:tab===t.id?'2px solid var(--accent)':'2px solid transparent', color:tab===t.id?'var(--accent)':'var(--muted)', cursor:'pointer', fontSize:11, letterSpacing:'.06em', textTransform:'uppercase', fontFamily:'IBM Plex Sans,sans-serif' }}>
            {t.l.toUpperCase()}
          </button>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center', padding:'0 16px' }}>
          <Btn onClick={()=>setView('new-bill')}>+ New bill</Btn>
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

          {/* alert banner */}
          {(st.low_stock>0||st.out_of_stock>0) && (
            <div style={{ margin:'14px 20px', padding:'10px 14px', background:'rgba(251,191,36,.06)', border:'1px solid rgba(251,191,36,.2)', borderRadius:3, display:'flex', gap:12, alignItems:'center' }}>
              <div style={{ width:6, height:6, background:'#fbbf24', borderRadius:'50%', flexShrink:0 }} />
              <div style={{ fontSize:12 }}>
                {st.low_stock>0&&<><span style={{ fontWeight:600, color:'#fbbf24' }}>{st.low_stock} parts</span><span style={{ color:'var(--muted)' }}> below reorder level</span></>}
                {st.out_of_stock>0&&<> · <span style={{ fontWeight:600, color:'var(--red)' }}>{st.out_of_stock} out of stock</span></>}
              </div>
            </div>
          )}

          {error ? <div style={{ padding:20 }}><ApiError error={error}/></div>
            : isLoading ? <div style={{ padding:20, display:'flex', flexDirection:'column', gap:8 }}>{[1,2,3,4,5].map(i=><Skeleton key={i} h={44}/>)}</div>
            : visibleParts.length===0 ? <Empty message="No parts found" />
            : (
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)' }}>
                    {['Part no.','Name','Category','Brand','Loc','Stock','Reorder','Purchase','Selling','GST','Margin','Status',''].map(h=>(
                      <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:9, letterSpacing:'.06em', color:'var(--dim)', fontWeight:500, textTransform:'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleParts.map(p=>{
                    const sc  = stockStyle(p);
                    const margin = p.selling_price>0 ? Math.round((p.selling_price-p.purchase_price)/p.selling_price*100) : 0;
                    return (
                      <tr key={p.id} style={{ borderBottom:'1px solid var(--border)' }}>
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
                        <td style={{ padding:'9px 12px' }}>
                          <button onClick={()=>{
                            const qty=parseInt(prompt(`Adjust stock for "${p.name}"\nCurrent: ${p.stock}\n+ for in, - for out:`));
                            if(!isNaN(qty)&&qty!==0) adjustMut.mutate({id:p.id,qty,reason:'Manual adjustment'});
                          }} style={{ padding:'4px 10px', background:'transparent', border:'1px solid var(--border2)', borderRadius:3, fontSize:10, cursor:'pointer', color:'var(--muted)', fontFamily:'IBM Plex Sans,sans-serif' }}>±Adj</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
        </>
      )}

      {/* bills tab */}
      {tab==='bills' && (
        billsLoading ? <div style={{ padding:20 }}><Skeleton h={200}/></div>
        : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                {['Bill #','Date','Customer','Mobile','Items','Amount','Payment'].map(h=>(
                  <th key={h} style={{ padding:'9px 20px', textAlign:'left', fontSize:9, letterSpacing:'.07em', color:'var(--dim)', fontWeight:500, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(billsData)?billsData:[]).map(b=>{
                const total = b.items?.reduce((s,i)=>s+i.unit_price*i.qty*(1+i.gst_rate/100),0)||b.grand_total||0;
                return (
                  <tr key={b.id} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td className="mono" style={{ padding:'11px 20px', fontSize:11, color:'var(--blue)' }}>{b.bill_number}</td>
                    <td className="mono" style={{ padding:'11px 20px', fontSize:11, color:'var(--dim)' }}>{b.sale_date||b.created_at?.slice(0,10)}</td>
                    <td style={{ padding:'11px 20px', fontSize:12, fontWeight:500 }}>{b.customer_name||'—'}</td>
                    <td className="mono" style={{ padding:'11px 20px', fontSize:11, color:'var(--muted)' }}>{b.customer_mobile||'—'}</td>
                    <td style={{ padding:'11px 20px', fontSize:11, color:'var(--muted)' }}>{b.items?.map(i=>`${i.name} ×${i.qty}`).join(', ').slice(0,45)}</td>
                    <td className="display" style={{ padding:'11px 20px', fontSize:14, color:'var(--accent)' }}>₹{Math.round(total).toLocaleString('en-IN')}</td>
                    <td style={{ padding:'11px 20px', fontSize:10 }}><span className="pill pill-green">{b.payment_mode}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}
