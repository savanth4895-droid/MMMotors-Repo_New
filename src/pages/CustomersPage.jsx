import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customersApi } from '../api/client';
import { Btn, GhostBtn, Field, Avatar, Skeleton, Empty, ApiError } from '../components/ui';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';
import { FileUpload } from '../components/FileUpload';

const TAG_PILL = { VIP:'pill-amber', Corporate:'pill-blue', Loyal:'pill-green' };

function sendWA(mobile, msg) {
  if (!mobile) return toast.error('No mobile number');
  window.open(`https://wa.me/91${mobile}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ── Add customer form ────────────────────────────────────────────────
function CustomerForm({ initial = {}, onSave, onCancel, saving }) {
  const [f, setF] = useState({ name:'', mobile:'', email:'', address:'', gstin:'', ...initial });
  const [idProofFileId, setIdProofFileId] = useState(null);
  const s = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:540 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <Field label="Full name *"><input value={f.name}    onChange={s('name')}    placeholder="Customer name" /></Field>
        <Field label="Mobile *">   <input value={f.mobile}  onChange={s('mobile')}  placeholder="10-digit mobile" /></Field>
        <Field label="Email">      <input value={f.email}   onChange={s('email')}   placeholder="email@example.com" /></Field>
        <Field label="GSTIN">      <input value={f.gstin}   onChange={s('gstin')}   placeholder="29XXXXX0000X1ZX" className="mono" /></Field>
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

// ── Customer detail ──────────────────────────────────────────────────
function CustomerDetail({ cust, onBack }) {
  const [tab, setTab] = useState('overview');

  const { data: tl, isLoading } = useQuery({
    queryKey: ['customer-timeline', cust.id],
    queryFn: () => customersApi.timeline(cust.id).then(r => r.data),
  });

  const TABS = ['overview','vehicles','service','sales'];

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
          { l:'Service visits', v: tl?.service_jobs?.length ?? '—', c:'var(--text)' },
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
                  {[['Mobile', cust.mobile, true],['Email', cust.email||'—', false],['Address', cust.address||'—', false],['GSTIN', cust.gstin||'—', true]].map(([l,v,mono]) => (
                    <div key={l} style={{ display:'flex', marginBottom:12, paddingBottom:12, borderBottom:'1px solid var(--border)' }}>
                      <div style={{ width:100, fontSize:11, color:'var(--muted)', flexShrink:0 }}>{l}</div>
                      <div className={mono?'mono':''} style={{ fontSize:12 }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="label-xs" style={{ marginBottom:14 }}>Recent activity</div>
                  {[...(tl?.service_jobs||[]),...(tl?.sales||[])].slice(0,5).map((item,i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', marginBottom:10, paddingBottom:10, borderBottom:'1px solid var(--border)', fontSize:11 }}>
                      <span>{item.job_number||item.invoice_number}</span>
                      <span className="pill pill-dim">{item.status}</span>
                    </div>
                  ))}
                  {!tl?.service_jobs?.length && !tl?.sales?.length && <div style={{ fontSize:11, color:'var(--dim)' }}>No activity yet</div>}
                </div>
              </div>
            )}
            {tab === 'vehicles' && (
              tl?.sales?.length ? tl.sales.map((s,i) => (
                <div key={i} style={{ padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ fontWeight:600, fontSize:13 }}>{s.vehicle_brand} {s.vehicle_model}</div>
                  <div className="mono" style={{ fontSize:10, color:'var(--dim)', marginTop:3 }}>{s.invoice_number} · {s.sale_date}</div>
                  <div className="display" style={{ fontSize:16, color:'var(--accent)', marginTop:4 }}>₹{s.total_amount?.toLocaleString('en-IN')}</div>
                </div>
              )) : <Empty message="No vehicles purchased" />
            )}
            {tab === 'service' && (
              tl?.service_jobs?.length ? tl.service_jobs.map((j,i) => (
                <div key={i} style={{ display:'flex', gap:12, padding:'12px 0', borderBottom:'1px solid var(--border)', alignItems:'center' }}>
                  <div style={{ flex:1 }}>
                    <div className="mono" style={{ fontSize:10, color:'var(--blue)' }}>{j.job_number}</div>
                    <div style={{ fontSize:12, marginTop:2 }}>{j.complaint}</div>
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{j.check_in_date} · {j.technician||'—'}</div>
                  </div>
                  <span className="pill pill-dim">{j.status}</span>
                </div>
              )) : <Empty message="No service records" />
            )}
            {tab === 'sales' && (
              tl?.sales?.length ? tl.sales.map((s,i) => (
                <div key={i} style={{ display:'flex', gap:12, padding:'12px 0', borderBottom:'1px solid var(--border)', alignItems:'center' }}>
                  <div className="mono" style={{ fontSize:10, color:'var(--blue)', marginTop:2 }}>{s.invoice_number}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:500 }}>{s.vehicle_brand} {s.vehicle_model}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{s.sale_date} · {s.payment_mode}</div>
                  </div>
                  <div className="display" style={{ fontSize:14, color:'var(--accent)' }}>₹{s.total_amount?.toLocaleString('en-IN')}</div>
                </div>
              )) : <Empty message="No purchases" />
            )}
          </>
        )}
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
