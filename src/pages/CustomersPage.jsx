import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customersApi, salesApi, serviceApi } from '../api/client';
import { Btn, GhostBtn, Field, Avatar, Skeleton, Empty, ApiError } from '../components/ui';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';
import FileUpload from '../components/FileUpload';

const TAG_PILL = { VIP:'pill-amber', Corporate:'pill-blue', Loyal:'pill-green' };

function sendWA(mobile, msg) {
  if (!mobile) return toast.error('No mobile number');
  window.open(`https://wa.me/91${mobile}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ── Add customer form ────────────────────────────────────────────────
function CustomerForm({ initial = {}, onSave, onCancel, saving }) {
  const [f, setF] = useState({ name:'', mobile:'', email:'', address:'', ...initial });
  const [idProofFileId, setIdProofFileId] = useState(null);
  const s = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:540 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <Field label="Full name *"><input value={f.name}    onChange={s('name')}    placeholder="Customer name" /></Field>
        <Field label="Mobile *">   <input value={f.mobile}  onChange={s('mobile')}  placeholder="10-digit mobile" /></Field>
        <Field label="Email">      <input value={f.email}   onChange={s('email')}   placeholder="email@example.com" /></Field>

      </div>
      <Field label="Address">
        <textarea value={f.address} onChange={s('address')} rows={2} placeholder="Full address" />
      </Field>
      <div style={{ marginTop: '8px' }}>
        <FileUpload 
          label="Upload Aadhar / ID Proof (Optional)" 
          onUploadSuccess={(fileId) => setIdProofFileId(fileId)} 
        />
      </div>
      
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
        <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
        {/* NEW: Merge the file ID into the save payload */}
        <Btn disabled={!f.name || !f.mobile || saving} onClick={() => onSave({ ...f, id_proof_file_id: idProofFileId })}>
          {saving ? 'Saving…' : 'Save customer'}
        </Btn>
      </div>
    </div>
  );
}

// ── Inline detail panel ──────────────────────────────────────────────
function DetailPanel({ item, type, onClose }) {
  const isSale = type === 'sale';
  const isJob  = type === 'job';
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={onClose}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:0, width:520, maxWidth:'94vw', maxHeight:'88vh', overflowY:'auto' }}
        onClick={e => e.stopPropagation()}>
        {/* header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 20px', borderBottom:'1px solid var(--border)', background:'#141414', borderRadius:'8px 8px 0 0' }}>
          <div>
            <div style={{ fontSize:11, color:'var(--muted)', letterSpacing:'.07em', textTransform:'uppercase' }}>{isSale ? 'Sale' : 'Service Job'}</div>
            <div style={{ fontSize:15, fontWeight:700, marginTop:2 }}>{isSale ? item.invoice_number : item.job_number}</div>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--muted)', fontSize:18, cursor:'pointer', padding:'4px 8px' }}>×</button>
        </div>
        <div style={{ padding:'20px' }}>
          {isSale && (
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              {[
                ['Vehicle',      `${item.vehicle_brand||''} ${item.vehicle_model||''}`.trim() || '—'],
                ['Vehicle No.',  item.vehicle_number || '—'],
                ['Chassis No.',  item.chassis_number || '—'],
                ['Sale Date',    item.sale_date      || '—'],
                ['Payment Mode', item.payment_mode   || '—'],
                ['Sales Person', item.salesperson    || '—'],
                ['Total Amount', item.total_amount ? '₹'+Number(item.total_amount).toLocaleString('en-IN') : '—'],
                ['Status',       item.status         || '—'],
              ].map(([l,v]) => (
                <div key={l} style={{ display:'flex', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ width:140, fontSize:11, color:'var(--muted)', flexShrink:0 }}>{l}</div>
                  <div style={{ fontSize:12, fontWeight:500 }}>{v}</div>
                </div>
              ))}
            </div>
          )}
          {isJob && (
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              {[
                ['Vehicle No.',   item.vehicle_number || '—'],
                ['Brand / Model', `${item.brand||''} ${item.model||''}`.trim() || '—'],
                ['Chassis No.',   item.chassis_number || '—'],
                ['Odometer',      item.odometer_km ? `${item.odometer_km} km` : '—'],
                ['Complaint',     item.complaint      || '—'],
                ['Technician',    item.technician     || '—'],
                ['Check-in Date', item.check_in_date  || '—'],
                ['Est. Delivery', item.estimated_delivery || '—'],
                ['Status',        item.status         || '—'],
                ['Bill Amount',   item.grand_total ? '₹'+Number(item.grand_total).toLocaleString('en-IN') : '—'],
                ['Notes',         item.notes          || '—'],
              ].map(([l,v]) => (
                <div key={l} style={{ display:'flex', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ width:140, fontSize:11, color:'var(--muted)', flexShrink:0 }}>{l}</div>
                  <div style={{ fontSize:12, fontWeight:500 }}>{v}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Inline action buttons ────────────────────────────────────────────
const actBtn = (label, color, onClick) => (
  <button onClick={e => { e.stopPropagation(); onClick(); }} style={{
    padding:'4px 10px', background:'transparent', borderRadius:3, cursor:'pointer',
    fontSize:10, fontFamily:'IBM Plex Sans,sans-serif', fontWeight:600,
    border: color === 'red'
      ? '1px solid rgba(220,38,38,.35)'
      : color === 'blue'
      ? '1px solid rgba(59,130,246,.35)'
      : '1px solid var(--border)',
    color: color === 'red' ? 'var(--red)'
      : color === 'blue' ? 'var(--blue)'
      : 'var(--muted)',
  }}>{label}</button>
);

// ── Customer detail ──────────────────────────────────────────────────
function CustomerDetail({ cust, onBack }) {
  const [tab, setTab] = useState('overview');
  const qc = useQueryClient();

  const { data: tl, isLoading } = useQuery({
    queryKey: ['customer-timeline', cust.id],
    queryFn: () => customersApi.timeline(cust.id).then(r => r.data),
  });

  // ── Edit modals state ──
  const [editSale, setEditSale]       = useState(null);
  const [editJob,  setEditJob]        = useState(null);
  const [viewDetail, setViewDetail]   = useState(null); // { item, type }

  // ── Delete mutations ──
  const delSale = useMutation({
    mutationFn: id => salesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries(['customer-timeline', cust.id]); toast.success('Sale deleted'); },
    onError: () => toast.error('Delete failed'),
  });
  const delJob = useMutation({
    mutationFn: id => serviceApi.delete(id),
    onSuccess: () => { qc.invalidateQueries(['customer-timeline', cust.id]); toast.success('Job deleted'); },
    onError: () => toast.error('Delete failed'),
  });

  // ── Edit mutations ──
  const updSale = useMutation({
    mutationFn: ({ id, data }) => salesApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries(['customer-timeline', cust.id]); setEditSale(null); toast.success('Sale updated'); },
    onError: e => toast.error(e?.response?.data?.detail || 'Update failed'),
  });
  const updJob = useMutation({
    mutationFn: ({ id, data }) => serviceApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries(['customer-timeline', cust.id]); setEditJob(null); toast.success('Job updated'); },
    onError: e => toast.error(e?.response?.data?.detail || 'Update failed'),
  });

  const TABS = ['overview','vehicles','service','sales'];
  const inp  = { padding:'8px 10px', border:'1px solid var(--border)', borderRadius:4, background:'var(--surface2)', color:'var(--text)', fontSize:12, width:'100%', fontFamily:'IBM Plex Sans,sans-serif', boxSizing:'border-box' };
  const lb   = { fontSize:10, letterSpacing:'.07em', textTransform:'uppercase', color:'var(--muted)', fontWeight:600, marginBottom:4, display:'block' };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 20px', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0 }}>
        <GhostBtn onClick={onBack} sm>← Back</GhostBtn>
        <div style={{ width:1, height:16, background:'var(--border)' }} />
        <Avatar name={cust.name} size={32} />
        <span style={{ fontSize:14, fontWeight:600 }}>{cust.name}</span>
        <span style={{ fontSize:11, color:'var(--muted)' }}>{cust.mobile}</span>
        {cust.tags?.map(t => <span key={t} className={`pill ${TAG_PILL[t]||'pill-dim'}`}>{t}</span>)}
        <div style={{ marginLeft:'auto' }}>
          <GhostBtn onClick={() => sendWA(cust.mobile, `Dear ${cust.name}, thank you for visiting MM Motors!`)}>
            WhatsApp
          </GhostBtn>
        </div>
      </div>

      {/* stats bar */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        {[
          { l:'Total spent',    v: tl?.total_spent  ? '₹'+tl.total_spent.toLocaleString('en-IN') : '—', c:'var(--accent)' },
          { l:'Vehicles',       v: tl?.sales?.length      ?? '—', c:'var(--text)' },
          { l:'Service visits', v: tl?.service?.length ?? '—', c:'var(--text)' },
          { l:'Service spend',  v: tl?.service_spend ? '₹'+tl.service_spend.toLocaleString('en-IN') : '—', c:'var(--blue)' },
        ].map((s,i) => (
          <div key={i} style={{ padding:'14px 20px', borderRight:i<3?'1px solid var(--border)':0 }}>
            <div className="label-xs">{s.l}</div>
            <div className="display" style={{ fontSize:22, color:s.c, marginTop:6 }}>{isLoading ? '…' : s.v}</div>
          </div>
        ))}
      </div>

      {/* tabs */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding:'10px 20px', background:'transparent', border:'none',
            borderBottom: tab===t ? '2px solid var(--accent)' : '2px solid transparent',
            color: tab===t ? 'var(--accent)' : 'var(--muted)', cursor:'pointer',
            fontSize:11, letterSpacing:'.06em', textTransform:'uppercase', fontFamily:'IBM Plex Sans,sans-serif',
          }}>{t}</button>
        ))}
      </div>

      {/* content */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        {isLoading ? <Skeleton h={120} /> : (
          <>
            {tab === 'overview' && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>
                <div>
                  <div className="label-xs" style={{ marginBottom:14 }}>Contact</div>
                  {[['Mobile', cust.mobile, true],['Email', cust.email||'—', false],['Address', cust.address||'—', false]].map(([l,v,mono]) => (
                    <div key={l} style={{ display:'flex', marginBottom:12, paddingBottom:12, borderBottom:'1px solid var(--border)' }}>
                      <div style={{ width:100, fontSize:11, color:'var(--muted)', flexShrink:0 }}>{l}</div>
                      <div className={mono?'mono':''} style={{ fontSize:12 }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="label-xs" style={{ marginBottom:14 }}>Recent activity</div>
                  {[...(tl?.service||[]),...(tl?.sales||[])].slice(0,5).map((item,i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', marginBottom:10, paddingBottom:10, borderBottom:'1px solid var(--border)', fontSize:11 }}>
                      <span>{item.job_number||item.invoice_number}</span>
                      <span className="pill pill-dim">{item.status}</span>
                    </div>
                  ))}
                  {!tl?.service?.length && !tl?.sales?.length && <div style={{ fontSize:11, color:'var(--dim)' }}>No activity yet</div>}
                </div>
              </div>
            )}

            {/* ── VEHICLES TAB ── */}
            {tab === 'vehicles' && (
              tl?.sales?.length ? tl.sales.map((s,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, fontSize:13 }}>{s.vehicle_brand} {s.vehicle_model}</div>
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{s.vehicle_number || '—'}</div>
                    <div className="mono" style={{ fontSize:10, color:'var(--dim)', marginTop:3 }}>{s.invoice_number} · {s.sale_date}</div>
                    <div className="display" style={{ fontSize:16, color:'var(--accent)', marginTop:4 }}>₹{s.total_amount?.toLocaleString('en-IN')}</div>
                  </div>
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    {actBtn('View →', 'muted', () => setViewDetail({ item: s, type: 'sale' }))}
                    {actBtn('Edit', 'blue', () => setEditSale(s))}
                    {actBtn('✕ Delete', 'red', () => window.confirm(`Delete ${s.invoice_number}?`) && delSale.mutate(s.id||s._id))}
                  </div>
                </div>
              )) : <Empty message="No vehicles purchased" />
            )}

            {/* ── SERVICE TAB ── */}
            {tab === 'service' && (
              tl?.service?.length ? tl.service.map((j,i) => (
                <div key={i} style={{ display:'flex', gap:12, padding:'14px 0', borderBottom:'1px solid var(--border)', alignItems:'center' }}>
                  <div style={{ flex:1 }}>
                    <div className="mono" style={{ fontSize:10, color:'var(--blue)' }}>{j.job_number}</div>
                    <div style={{ fontSize:12, marginTop:2, fontWeight:500 }}>{j.complaint}</div>
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>
                      {j.vehicle_number} · {j.check_in_date} · {j.technician||'—'}
                    </div>
                    {j.grand_total > 0 && (
                      <div className="display" style={{ fontSize:14, color:'var(--accent)', marginTop:3 }}>
                        ₹{j.grand_total?.toLocaleString('en-IN')}
                      </div>
                    )}
                  </div>
                  <span className="pill pill-dim" style={{ flexShrink:0 }}>{j.status}</span>
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    {actBtn('View →', 'muted', () => setViewDetail({ item: j, type: 'job' }))}
                    {actBtn('Edit', 'blue', () => setEditJob(j))}
                    {actBtn('✕ Delete', 'red', () => window.confirm(`Delete job ${j.job_number}?`) && delJob.mutate(j.id||j._id))}
                  </div>
                </div>
              )) : <Empty message="No service records" />
            )}

            {/* ── SALES TAB ── */}
            {tab === 'sales' && (
              tl?.sales?.length ? tl.sales.map((s,i) => (
                <div key={i} style={{ display:'flex', gap:12, padding:'14px 0', borderBottom:'1px solid var(--border)', alignItems:'center' }}>
                  <div className="mono" style={{ fontSize:10, color:'var(--blue)', marginTop:2 }}>{s.invoice_number}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:500 }}>{s.vehicle_brand} {s.vehicle_model}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{s.sale_date} · {s.payment_mode}</div>
                  </div>
                  <div className="display" style={{ fontSize:14, color:'var(--accent)', flexShrink:0 }}>₹{s.total_amount?.toLocaleString('en-IN')}</div>
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    {actBtn('View →', 'muted', () => setViewDetail({ item: s, type: 'sale' }))}
                    {actBtn('Edit', 'blue', () => setEditSale(s))}
                    {actBtn('✕ Delete', 'red', () => window.confirm(`Delete ${s.invoice_number}?`) && delSale.mutate(s.id||s._id))}
                  </div>
                </div>
              )) : <Empty message="No purchases" />
            )}
          </>
        )}
      </div>

      {/* ── VIEW DETAIL PANEL ── */}
      {viewDetail && (
        <DetailPanel item={viewDetail.item} type={viewDetail.type} onClose={() => setViewDetail(null)} />
      )}

      {/* ── EDIT SALE MODAL ── */}
      {editSale && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setEditSale(null)}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:28, width:440, maxWidth:'94vw' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>Edit Sale</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:20 }}>{editSale.invoice_number}</div>
            <EditSaleForm sale={editSale} inp={inp} lb={lb}
              onSave={data => updSale.mutate({ id: editSale.id||editSale._id, data })}
              onCancel={() => setEditSale(null)}
              saving={updSale.isPending} />
          </div>
        </div>
      )}

      {/* ── EDIT JOB MODAL ── */}
      {editJob && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setEditJob(null)}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:28, width:480, maxWidth:'94vw' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>Edit Service Job</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:20 }}>{editJob.job_number}</div>
            <EditJobForm job={editJob} inp={inp} lb={lb}
              onSave={data => updJob.mutate({ id: editJob.id||editJob._id, data })}
              onCancel={() => setEditJob(null)}
              saving={updJob.isPending} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Edit Sale Form ───────────────────────────────────────────────────
function EditSaleForm({ sale, inp, lb, onSave, onCancel, saving }) {
  const [f, setF] = useState({
    vehicle_brand:  sale.vehicle_brand  || '',
    vehicle_model:  sale.vehicle_model  || '',
    vehicle_number: sale.vehicle_number || '',
    sale_date:      sale.sale_date      || '',
    payment_mode:   sale.payment_mode   || 'Cash',
    total_amount:   sale.total_amount   || 0,
  });
  const s = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <div><label style={lb}>Brand</label><input value={f.vehicle_brand} onChange={s('vehicle_brand')} style={inp} /></div>
        <div><label style={lb}>Model</label><input value={f.vehicle_model} onChange={s('vehicle_model')} style={inp} /></div>
        <div><label style={lb}>Vehicle Number</label><input value={f.vehicle_number} onChange={s('vehicle_number')} style={inp} /></div>
        <div><label style={lb}>Sale Date</label><input type="date" value={f.sale_date} onChange={s('sale_date')} style={inp} /></div>
        <div>
          <label style={lb}>Payment Mode</label>
          <select value={f.payment_mode} onChange={s('payment_mode')} style={inp}>
            {['Cash','UPI','Card','Bank Transfer','Finance'].map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
        <div><label style={lb}>Total Amount</label><input type="number" value={f.total_amount} onChange={s('total_amount')} style={inp} /></div>
      </div>
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:8 }}>
        <button onClick={onCancel} style={{ padding:'8px 16px', background:'transparent', border:'1px solid var(--border)', borderRadius:4, color:'var(--muted)', cursor:'pointer', fontFamily:'IBM Plex Sans,sans-serif', fontSize:12 }}>Cancel</button>
        <button onClick={() => onSave(f)} disabled={saving}
          style={{ padding:'8px 16px', background:'var(--accent)', border:'none', borderRadius:4, color:'#000', cursor:'pointer', fontWeight:700, fontFamily:'IBM Plex Sans,sans-serif', fontSize:12, opacity:saving?.5:1 }}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

// ── Edit Job Form ────────────────────────────────────────────────────
function EditJobForm({ job, inp, lb, onSave, onCancel, saving }) {
  const [f, setF] = useState({
    vehicle_number:     job.vehicle_number     || '',
    technician:         job.technician         || '',
    complaint:          job.complaint          || '',
    status:             job.status             || 'pending',
    estimated_delivery: job.estimated_delivery || '',
    notes:              job.notes              || '',
  });
  const s = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  const STATUSES = ['pending','in_progress','ready','delivered'];
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <div><label style={lb}>Vehicle Number</label><input value={f.vehicle_number} onChange={s('vehicle_number')} style={inp} /></div>
        <div><label style={lb}>Technician</label><input value={f.technician} onChange={s('technician')} style={inp} /></div>
        <div>
          <label style={lb}>Status</label>
          <select value={f.status} onChange={s('status')} style={inp}>
            {STATUSES.map(st => <option key={st} value={st}>{st.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>)}
          </select>
        </div>
        <div><label style={lb}>Est. Delivery</label><input type="date" value={f.estimated_delivery} onChange={s('estimated_delivery')} style={inp} /></div>
      </div>
      <div>
        <label style={lb}>Complaint / Work Required</label>
        <textarea value={f.complaint} onChange={s('complaint')} rows={3} style={{ ...inp, resize:'vertical' }} />
      </div>
      <div><label style={lb}>Notes</label><input value={f.notes} onChange={s('notes')} placeholder="Additional notes" style={inp} /></div>
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:8 }}>
        <button onClick={onCancel} style={{ padding:'8px 16px', background:'transparent', border:'1px solid var(--border)', borderRadius:4, color:'var(--muted)', cursor:'pointer', fontFamily:'IBM Plex Sans,sans-serif', fontSize:12 }}>Cancel</button>
        <button onClick={() => onSave(f)} disabled={saving}
          style={{ padding:'8px 16px', background:'var(--accent)', border:'none', borderRadius:4, color:'#000', cursor:'pointer', fontWeight:700, fontFamily:'IBM Plex Sans,sans-serif', fontSize:12, opacity:saving?.5:1 }}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────
export default function CustomersPage() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [view, setView]       = useState('list');
  const [selected, setSelected] = useState(null);
  const [search, setSearch]   = useState('');
  const [tag, setTag]         = useState('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['customers', search, tag],
    queryFn: () => customersApi.list({ search: search||undefined, tag: tag!=='all'?tag:undefined, limit:200 }).then(r => r.data),
    keepPreviousData: true,
  });

  const createMut = useMutation({
    mutationFn: d => customersApi.create(d),
    onSuccess: () => { qc.invalidateQueries(['customers']); setView('list'); toast.success('Customer added'); },
    onError:   e => toast.error(e?.response?.data?.detail || 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: id => customersApi.delete(id),
    onSuccess: () => { qc.invalidateQueries(['customers']); toast.success('Deleted'); },
    onError:   () => toast.error('Delete failed'),
  });

  const customers = Array.isArray(data) ? data : [];

  if (view === 'detail' && selected) {
    return <CustomerDetail cust={selected} onBack={() => { setView('list'); setSelected(null); }} />;
  }

  if (view === 'new') {
    return (
      <div style={{ padding:24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
          <GhostBtn onClick={() => setView('list')} sm>← Back</GhostBtn>
          <span style={{ fontSize:13, fontWeight:500 }}>New customer</span>
        </div>
        <CustomerForm onSave={d => createMut.mutate(d)} onCancel={() => setView('list')} saving={createMut.isPending} />
      </div>
    );
  }

  return (
    <div>
      {/* stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', borderBottom:'1px solid var(--border)' }}>
        {[
          { l:'Total', v:customers.length, c:'var(--accent)' },
          { l:'VIP',   v:customers.filter(c=>c.tags?.includes('VIP')).length, c:'var(--accent)' },
          { l:'Corporate', v:customers.filter(c=>c.tags?.includes('Corporate')).length, c:'var(--blue)' },
          { l:'Showing', v:customers.length, c:'var(--text)' },
        ].map((s,i) => (
          <div key={i} style={{ padding:'14px 20px', borderRight:i<3?'1px solid var(--border)':0 }}>
            <div className="label-xs">{s.l}</div>
            <div className="display" style={{ fontSize:24, color:s.c, marginTop:6 }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 20px', borderBottom:'1px solid var(--border)', flexWrap:'wrap' }}>
        <input value={search} onChange={e=>{setSearch(e.target.value)}} placeholder="Search name, mobile, email…" style={{ width:260 }} />
        <div style={{ display:'flex', gap:6 }}>
          {['all','VIP','Corporate','Loyal'].map(t => (
            <button key={t} onClick={()=>setTag(t)} style={{
              padding:'6px 12px', background:tag===t?'var(--surface2)':'transparent',
              border:`1px solid ${tag===t?'var(--accent)':'var(--border)'}`,
              borderRadius:3, color:tag===t?'var(--accent)':'var(--muted)',
              cursor:'pointer', fontSize:10, letterSpacing:'.06em', fontFamily:'IBM Plex Sans,sans-serif',
            }}>{t.toUpperCase()}</button>
          ))}
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          <span className="label-xs">{customers.length} customers</span>
          <Btn onClick={() => setView('new')}>+ New customer</Btn>
        </div>
      </div>

      {/* table */}
      {error ? <div style={{ padding:20 }}><ApiError error={error} /></div>
        : isLoading ? <div style={{ padding:20, display:'flex', flexDirection:'column', gap:8 }}>{[1,2,3,4,5].map(i=><Skeleton key={i} h={44}/>)}</div>
        : customers.length === 0 ? <Empty message="No customers found" sub="Add one or import from Excel" />
        : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                {['Customer','Mobile','Email','Address','Tags',''].map(h => (
                  <th key={h} style={{ padding:'9px 20px', textAlign:'left', fontSize:10, letterSpacing:'.07em', color:'var(--dim)', fontWeight:500, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.id} style={{ borderBottom:'1px solid var(--border)', cursor:'pointer' }}
                    onClick={() => { setSelected(c); setView('detail'); }}>
                  <td style={{ padding:'12px 20px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <Avatar name={c.name} size={28} bg="var(--surface2)" color="var(--muted)" />
                      <div>
                        <div style={{ fontSize:12, fontWeight:600 }}>{c.name}</div>
                        <div style={{ fontSize:10, color:'var(--dim)' }}>Since {c.created_at?.slice(0,10)||'—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="mono" style={{ padding:'12px 20px', fontSize:11 }}>{c.mobile}</td>
                  <td style={{ padding:'12px 20px', fontSize:11, color:'var(--muted)' }}>{c.email||'—'}</td>
                  <td style={{ padding:'12px 20px', fontSize:11, color:'var(--muted)', maxWidth:180 }}>
                    <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.address||'—'}</div>
                  </td>
                  <td style={{ padding:'12px 20px' }}>
                    <div style={{ display:'flex', gap:4 }}>
                      {c.tags?.length ? c.tags.map(t=><span key={t} className={`pill ${TAG_PILL[t]||'pill-dim'}`}>{t}</span>) : <span style={{ fontSize:11, color:'var(--dim)' }}>—</span>}
                    </div>
                  </td>
                  <td style={{ padding:'12px 20px' }} onClick={e=>e.stopPropagation()}>
                    <div style={{ display:'flex', gap:6 }}>
                      <GhostBtn sm onClick={() => { setSelected(c); setView('detail'); }}>View →</GhostBtn>
                      <button onClick={() => window.confirm(`Delete ${c.name}?`) && deleteMut.mutate(c.id)}
                        style={{ padding:'5px 8px', background:'transparent', border:'1px solid rgba(220,38,38,.3)', borderRadius:3, color:'var(--red)', cursor:'pointer', fontSize:10, fontFamily:'IBM Plex Sans,sans-serif' }}>✕</button>
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
