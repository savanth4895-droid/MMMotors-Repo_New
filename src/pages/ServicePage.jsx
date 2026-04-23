import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceApi, billsApi, customersApi } from '../api/client';
import { Btn, GhostBtn, Field, Skeleton, Empty, ApiError } from '../components/ui';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';
import FileUpload from '../components/FileUpload';

const BRANDS = ['HERO','HONDA','BAJAJ','TVS','YAMAHA','SUZUKI','ROYAL ENFIELD','KTM','PIAGGIO','APRILIA','TRIUMPH'];
const MODELS = {
  HERO:['Splendor+','HF Deluxe','Passion Pro','Glamour','Xtreme 160R'],
  HONDA:['Activa 6G','Shine','Unicorn','SP125','CB350'],
  BAJAJ:['Pulsar 150','Pulsar NS200','Platina','Dominar 400'],
  TVS:['Jupiter','Ntorq 125','Apache RTR 160','Raider 125'],
  YAMAHA:['FZ-S','MT-15','R15 V4','Fascino 125'],
  SUZUKI:['Access 125','Gixxer SF'],
  'ROYAL ENFIELD':['Classic 350','Meteor 350','Hunter 350'],
  KTM:['Duke 200','Duke 390'],
  PIAGGIO:['Vespa SXL 150'],
  APRILIA:['SR 160','SR 125'],
  TRIUMPH:['Speed 400'],
};
const STATUS_STYLE = {
  pending:     { color:'#6b6b78', bg:'rgba(107,107,120,.12)', border:'rgba(107,107,120,.3)', label:'Pending' },
  in_progress: { color:'#f0c040', bg:'rgba(240,192,64,.12)',  border:'rgba(240,192,64,.3)',  label:'In Progress' },
  ready:       { color:'#4ade80', bg:'rgba(74,222,128,.12)',   border:'rgba(74,222,128,.3)',  label:'Ready' },
  delivered:   { color:'#3a3a44', bg:'rgba(58,58,68,.2)',      border:'rgba(58,58,68,.3)',    label:'Delivered' },
};

function sendWA(mobile, msg) {
  if (!mobile) return toast.error('No mobile number saved');
  const cleanMobile = String(mobile).replace(/\D/g, '');
  window.open(`https://wa.me/91${cleanMobile}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ── GST Bill modal ───────────────────────────────────────────────────
function BillModal({ job, onClose, onDone }) {
  const [rows, setRows] = useState([{ desc:'Labour charges', hsn:'9987', qty:1, unit_price:'', gst_rate:18 }]);
  const [payMode, setPayMode] = useState('Cash');
  const [saving, setSaving]   = useState(false);

  const upd = (i,k,v) => setRows(p=>p.map((r,idx)=>idx===i?{...r,[k]:v}:r));
  const addRow    = () => setRows(p=>[...p,{ desc:'', hsn:'', qty:1, unit_price:'', gst_rate:18 }]);
  const removeRow = i  => setRows(p=>p.filter((_,idx)=>idx!==i));

  const subtotal = rows.reduce((s,r)=>(s+(parseFloat(r.unit_price)||0)*(parseInt(r.qty)||1)),0);
  const gstTotal = rows.reduce((s,r)=>(s+(parseFloat(r.unit_price)||0)*(parseInt(r.qty)||1)*(r.gst_rate/100)),0);
  const grand    = subtotal + gstTotal;

  const handleSubmit = async () => {
    const valid = rows.filter(r=>r.desc&&r.unit_price);
    if (!valid.length) return toast.error('Add at least one item');
    setSaving(true);
    try {
      await billsApi.create({
        job_id: job.id,
        items: valid.map(r=>({ description:r.desc, part_number:'', hsn_code:r.hsn||'', qty:parseInt(r.qty)||1, unit_price:parseFloat(r.unit_price)||0, gst_rate:r.gst_rate })),
        payment_mode: payMode,
      });
      toast.success('Bill generated');
      onDone();
    } catch(e) {
      toast.error(e?.response?.data?.detail||'Failed');
    } finally {
      setSaving(false);
    }
  };

  const inp = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3, padding:'6px 8px', color:'var(--text)', outline:'none', fontSize:12, fontFamily:'IBM Plex Sans,sans-serif', width:'100%' };
  const sel = { ...inp };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={onClose}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, width:'100%', maxWidth:700, maxHeight:'90vh', overflowY:'auto' }}
        onClick={e=>e.stopPropagation()}>
        <div style={{ background:'#1c1c20', padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div className="display" style={{ fontSize:13, color:'var(--accent)', fontWeight:700 }}>Service Bill</div>
            <div className="mono" style={{ fontSize:11, color:'#6b6460', marginTop:2 }}>{job.job_number} · {job.vehicle_number} · {job.customer_name}</div>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#6b6460', cursor:'pointer', fontSize:20 }}>×</button>
        </div>
        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 60px 1fr 80px 28px', gap:6 }}>
            {['Description','HSN','Qty','Unit Price (₹)','GST %',''].map(h=><span key={h} className="label-xs">{h}</span>)}
          </div>
          {rows.map((r,i)=>(
            <div key={i} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 60px 1fr 80px 28px', gap:6 }}>
              <input style={inp} value={r.desc}       onChange={e=>upd(i,'desc',e.target.value)}              placeholder="Labour / part name" />
              <input style={inp} value={r.hsn}        onChange={e=>upd(i,'hsn',e.target.value)}               placeholder="9987" />
              <input style={inp} type="number" value={r.qty}        onChange={e=>upd(i,'qty',e.target.value)} min="1" />
              <input style={inp} type="number" value={r.unit_price} onChange={e=>upd(i,'unit_price',e.target.value)} placeholder="0" />
              <select style={sel} value={r.gst_rate}  onChange={e=>upd(i,'gst_rate',parseFloat(e.target.value))}>
                {[5,12,18,28].map(g=><option key={g} value={g}>{g}%</option>)}
              </select>
              {rows.length>1
                ? <button onClick={()=>removeRow(i)} style={{ background:'transparent', border:'none', color:'var(--red)', cursor:'pointer', fontSize:14 }}>×</button>
                : <div/>}
            </div>
          ))}
          <button onClick={addRow} style={{ background:'transparent', border:'1px dashed var(--border2)', borderRadius:3, padding:'7px', fontSize:11, color:'var(--muted)', cursor:'pointer', fontFamily:'IBM Plex Sans,sans-serif' }}>+ Add line item</button>
          <div style={{ borderTop:'1px solid var(--border)', paddingTop:12, display:'flex', flexDirection:'column', gap:4, alignItems:'flex-end' }}>
            <div style={{ fontSize:11, color:'var(--muted)' }}>Subtotal: ₹{Math.round(subtotal).toLocaleString('en-IN')}</div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>GST: ₹{Math.round(gstTotal).toLocaleString('en-IN')}</div>
            <div className="display" style={{ fontSize:18, color:'var(--accent)', marginTop:4 }}>Total: ₹{Math.round(grand).toLocaleString('en-IN')}</div>
          </div>
          <Field label="Payment mode">
            <select value={payMode} onChange={e=>setPayMode(e.target.value)} style={{ ...sel, width:'auto' }}>
              {['Cash','UPI','Card','Credit'].map(o=><option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <GhostBtn onClick={onClose}>Cancel</GhostBtn>
            <Btn disabled={saving} onClick={handleSubmit}>{saving?'Generating…':'Generate Bill'}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── New job wizard ───────────────────────────────────────────────────
function NewJobWizard({ onDone }) {
  const [step, setStep]         = useState(1);
  const [custSearch, setCustSearch] = useState('');
  const [selCust, setSelCust]   = useState(null);
  const [veh, setVeh]           = useState({ vehicle_number:'', brand:'', model:'', odometer_km:'', complaint:'', technician:'' });
  const [saving, setSaving]     = useState(false);
  const [vehiclePhotoId, setVehiclePhotoId] = useState(null);

  const { data:custsData } = useQuery({
    queryKey:['cust-srch-svc', custSearch],
    queryFn: ()=>customersApi.list({ search:custSearch, limit:20 }).then(r=>r.data),
    enabled: custSearch.length>1,
  });
  const custs = Array.isArray(custsData)?custsData:[];

  const selStyle = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3, padding:'8px 10px', color:'var(--text)', outline:'none', fontSize:13, fontFamily:'IBM Plex Sans,sans-serif', width:'100%' };

  const handleCreate = async () => {
    setSaving(true);
    try {
      await serviceApi.create({
        customer_id:    selCust.id,
        vehicle_number: veh.vehicle_number.toUpperCase(),
        brand:          veh.brand,
        model:          veh.model,
        odometer_km:    parseInt(veh.odometer_km)||0,
        complaint:      veh.complaint,
        technician:     veh.technician,
        vehicle_photo_id: vehiclePhotoId //
      });
      toast.success('Job card created');
      onDone();
    } catch(e) {
      toast.error(e?.response?.data?.detail||'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth:560, padding:24 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <GhostBtn onClick={onDone} sm>← Service</GhostBtn>
        <span style={{ fontSize:13, fontWeight:500 }}>New job card</span>
      </div>
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:24 }}>
        {['Customer','Vehicle details'].map((l,i)=>{
          const n=i+1; const active=step===n; const past=step>n;
          return (
            <div key={l} onClick={()=>n<step&&setStep(n)} style={{ flex:1, padding:'10px 0', textAlign:'center', fontSize:10, letterSpacing:'.07em', cursor:n<step?'pointer':'default', borderBottom:active?'2px solid var(--accent)':'2px solid transparent', color:active?'var(--accent)':past?'var(--text)':'var(--dim)', fontWeight:active?600:400, textTransform:'uppercase' }}>
              {past?'✓ ':''}{l}
            </div>
          );
        })}
      </div>

      {step===1 && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Field label="Search customer by name or mobile">
            <input value={custSearch} onChange={e=>setCustSearch(e.target.value)} placeholder="Name or mobile" />
          </Field>
          {custs.map(c=>(
            <div key={c.id} onClick={()=>setSelCust(c)} style={{ padding:'12px 14px', background:'var(--surface2)', border:`1px solid ${selCust?.id===c.id?'var(--green)':'var(--border)'}`, borderRadius:3, cursor:'pointer' }}>
              <div style={{ fontWeight:500 }}>{c.name}</div>
              <div className="mono" style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{c.mobile} · {c.address}</div>
            </div>
          ))}
          {custSearch.length>1&&custs.length===0&&<div style={{ fontSize:11, color:'var(--dim)' }}>No customers found</div>}
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <GhostBtn onClick={onDone}>Cancel</GhostBtn>
            <Btn disabled={!selCust} onClick={()=>setStep(2)}>Next →</Btn>
          </div>
        </div>
      )}

      {step===2 && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="Vehicle reg no. *"><input value={veh.vehicle_number} onChange={e=>setVeh(p=>({...p,vehicle_number:e.target.value}))} placeholder="KA01HH1234" className="mono" /></Field>
            <Field label="Brand *">
              <select value={veh.brand} onChange={e=>setVeh(p=>({...p,brand:e.target.value,model:''}))} style={selStyle}>
                <option value="">Select brand</option>
                {BRANDS.map(b=><option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Model *">
              <select value={veh.model} onChange={e=>setVeh(p=>({...p,model:e.target.value}))} style={selStyle}>
                <option value="">{veh.brand?'Select model':'Brand first'}</option>
                {(MODELS[veh.brand]||[]).map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Odometer (km)"><input type="number" value={veh.odometer_km} onChange={e=>setVeh(p=>({...p,odometer_km:e.target.value}))} placeholder="12500" /></Field>
            <Field label="Technician">   <input value={veh.technician}  onChange={e=>setVeh(p=>({...p,technician:e.target.value}))}  placeholder="Suresh / Arun…" /></Field>
          </div>
          <Field label="Complaint / work needed *">
            <textarea rows={3} value={veh.complaint} onChange={e=>setVeh(p=>({...p,complaint:e.target.value}))} placeholder="Describe the issue or work required…" />
          </Field>
          <div style={{ marginTop: '8px' }}>
            <FileUpload 
              label="Upload Vehicle Condition Photo (Optional)" 
              onUploadSuccess={(fileId) => setVehiclePhotoId(fileId)} 
            />
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
            <GhostBtn onClick={()=>setStep(1)}>← Back</GhostBtn>
            <Btn disabled={!veh.vehicle_number||!veh.brand||!veh.complaint||saving} onClick={handleCreate}>
              {saving?'Creating…':'Create job card →'}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────
export default function ServicePage({ user }) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [view, setView]         = useState('list');
  const [statusF, setStatusF]   = useState('all');
  const [search, setSearch]     = useState('');
  const [billJob, setBillJob]   = useState(null);

  const { data:stats } = useQuery({
    queryKey:['service-stats'],
    queryFn: ()=>serviceApi.stats().then(r=>r.data),
  });
  const { data, isLoading, error } = useQuery({
    queryKey:['service', statusF, search],
    queryFn: ()=>serviceApi.list({ status:statusF!=='all'?statusF:undefined, search:search||undefined, limit:200 }).then(r=>r.data),
  });
  const updateMut = useMutation({
    mutationFn: ({id,d})=>serviceApi.update(id,d),
    onSuccess: ()=>{ qc.invalidateQueries(['service']); qc.invalidateQueries(['service-stats']); },
    onError: ()=>toast.error('Update failed'),
  });
  const deleteMut = useMutation({
    mutationFn: id=>serviceApi.delete(id),
    onSuccess: ()=>{ qc.invalidateQueries(['service']); qc.invalidateQueries(['service-stats']); toast.success('Deleted'); },
    onError: e=>toast.error(e?.response?.data?.detail||'Cannot delete'),
  });

  const jobs = Array.isArray(data)?data:[];
  const st   = stats||{};
  const selStyle = { fontSize:9, padding:'3px 6px', borderRadius:2, fontWeight:500, appearance:'none', cursor:'pointer', fontFamily:'IBM Plex Sans,sans-serif', border:'1px solid', width:'auto' };

  if (view==='new') {
    return <NewJobWizard onDone={()=>{ setView('list'); qc.invalidateQueries(['service']); qc.invalidateQueries(['service-stats']); }} />;
  }

  return (
    <div>
      {billJob && (
        <BillModal job={billJob} onClose={()=>setBillJob(null)} onDone={()=>{ setBillJob(null); qc.invalidateQueries(['service']); }} />
      )}

      {/* stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', borderBottom:'1px solid var(--border)' }}>
        {[
          { l:'Pending',     v:st.pending??'—',     c:'var(--muted)' },
          { l:'In progress', v:st.in_progress??'—', c:'var(--accent)' },
          { l:'Ready',       v:st.ready??'—',       c:'var(--green)' },
          { l:'Delivered',   v:st.delivered??'—',   c:'var(--dim)' },
        ].map((s,i)=>(
          <div key={i} style={{ padding:'16px 20px', borderRight:i<3?'1px solid var(--border)':0 }}>
            <div className="label-xs">{s.l}</div>
            <div className="display" style={{ fontSize:28, color:s.c, marginTop:6 }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* toolbar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', borderBottom:'1px solid var(--border)', gap:10, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:6 }}>
          {['all','pending','in_progress','ready','delivered'].map(s=>(
            <button key={s} onClick={()=>setStatusF(s)} style={{ padding:'6px 12px', background:statusF===s?'var(--surface2)':'transparent', border:`1px solid ${statusF===s?'var(--accent)':'var(--border)'}`, borderRadius:3, color:statusF===s?'var(--accent)':'var(--muted)', cursor:'pointer', fontSize:10, letterSpacing:'.06em', fontFamily:'IBM Plex Sans,sans-serif' }}>
              {s==='all'?'ALL':s==='in_progress'?'IN PROGRESS':s.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{ width:180 }} />
          <Btn onClick={()=>setView('new')}>+ New job card</Btn>
        </div>
      </div>

      {/* table */}
      {error ? <div style={{ padding:20 }}><ApiError error={error}/></div>
        : isLoading ? <div style={{ padding:20, display:'flex', flexDirection:'column', gap:8 }}>{[1,2,3,4,5].map(i=><Skeleton key={i} h={44}/>)}</div>
        : jobs.length===0 ? <Empty message="No service jobs found" />
        : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                {['Job #','Vehicle','Reg no.','Customer','Complaint','Status','Tech',''].map(h=>(
                  <th key={h} style={{ padding:'9px 20px', textAlign:'left', fontSize:10, letterSpacing:'.07em', color:'var(--dim)', fontWeight:500, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map(j=>{
                const sc = STATUS_STYLE[j.status]||STATUS_STYLE.pending;
                return (
                  <tr key={j.id} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td className="mono" style={{ padding:'11px 20px', fontSize:11, color:'var(--blue)' }}>{j.job_number}</td>
                    <td style={{ padding:'11px 20px', fontSize:12, fontWeight:500 }}>{j.brand} {j.model}</td>
                    <td className="mono" style={{ padding:'11px 20px', fontSize:11, color:'var(--muted)' }}>{j.vehicle_number}</td>
                    <td style={{ padding:'11px 20px', fontSize:12, color:'var(--muted)' }}>{j.customer_name}</td>
                    <td style={{ padding:'11px 20px', fontSize:11, color:'var(--dim)', maxWidth:140 }}>{j.complaint}</td>
                    <td style={{ padding:'11px 20px' }}>
                      <select value={j.status}
                        onChange={e=>updateMut.mutate({id:j.id,d:{status:e.target.value}})}
                        style={{ ...selStyle, color:sc.color, background:sc.bg, borderColor:sc.border }}>
                        {['pending','in_progress','ready','delivered'].map(s=><option key={s} value={s}>{STATUS_STYLE[s]?.label||s}</option>)}
                      </select>
                    </td>
                    <td style={{ padding:'11px 20px', fontSize:11, color:'var(--muted)' }}>{j.technician||'—'}</td>
                    <td style={{ padding:'11px 20px' }}>
                      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                        {j.status==='ready' && (
                          <button onClick={()=>sendWA(j.customer_mobile,`Dear ${j.customer_name}, your vehicle ${j.vehicle_number} is ready for pickup at MM Motors. Job: ${j.job_number}.${amountText} Please contact us if you have any questions!`)}
                            style={{ padding:'5px 10px', background:'rgba(22,163,74,.1)', border:'1px solid rgba(22,163,74,.3)', borderRadius:3, color:'var(--green)', cursor:'pointer', fontSize:10, fontFamily:'IBM Plex Sans,sans-serif' }}>
                            Notify
                          </button>
                        )}
                        <GhostBtn sm onClick={()=>setBillJob(j)}>Bill</GhostBtn>
                        {user?.role==='owner' && (
                          <button onClick={async () => { if (await confirm(`Delete ${j.job_number}?`)) { deleteMut.mutate(j.id); } }}
                            style={{ padding:'5px 8px', background:'transparent', border:'1px solid rgba(220,38,38,.3)', borderRadius:3, color:'var(--red)', cursor:'pointer', fontSize:10, fontFamily:'IBM Plex Sans,sans-serif' }}>✕</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
    </div>
  );
}
