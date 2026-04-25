import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceApi, partsApi, customersApi, billsApi, salesApi, errMsg} from '../api/client';
import toast from 'react-hot-toast';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const RS   = '₹';
const fmt  = n => Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtI = n => Number(n||0).toLocaleString('en-IN');

function numWords(n) {
  const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  if (!n||n===0) return 'Zero';
  n=Math.round(n);
  if(n<20)       return a[n];
  if(n<100)      return b[Math.floor(n/10)]+(n%10?' '+a[n%10]:'');
  if(n<1000)     return a[Math.floor(n/100)]+' Hundred'+(n%100?' '+numWords(n%100):'');
  if(n<100000)   return numWords(Math.floor(n/1000))+' Thousand'+(n%1000?' '+numWords(n%1000):'');
  if(n<10000000) return numWords(Math.floor(n/100000))+' Lakh'+(n%100000?' '+numWords(n%100000):'');
  return numWords(Math.floor(n/10000000))+' Crore'+(n%10000000?' '+numWords(n%10000000):'');
}

const emptyRow = () => ({ description:'', hsn:'9987', qty:1, unit_price:0, gst_rate:18, _key:Math.random() });

// ─── Style tokens ─────────────────────────────────────────────────────────────
const C = {
  surface: 'var(--surface,#141414)',
  s2:      'var(--surface2,#1a1a1a)',
  border:  'var(--border,#222)',
  border2: 'var(--border2,#2a2a2a)',
  text:    'var(--text,#e8e8e8)',
  muted:   'var(--muted,#888)',
  gold:    '#B8860B',
  green:   '#4ade80',
  amber:   '#fbbf24',
  red:     '#f87171',
};

const inp = {
  background:'var(--surface2,#1a1a1a)', border:'1px solid var(--border,#222)',
  borderRadius:3, padding:'7px 10px', color:'var(--text,#e8e8e8)',
  outline:'none', fontSize:12, fontFamily:'IBM Plex Sans, sans-serif',
  width:'100%', boxSizing:'border-box',
};
const btnPrimary = {
  background:'#B8860B', color:'#fff', border:'none', borderRadius:3,
  padding:'9px 20px', fontWeight:700, fontSize:12, cursor:'pointer',
  fontFamily:'IBM Plex Sans, sans-serif', letterSpacing:'.04em',
};
const btnGhost = {
  background:'transparent', color:'var(--muted,#888)', border:'1px solid var(--border2,#2a2a2a)',
  borderRadius:3, padding:'8px 14px', fontSize:12, cursor:'pointer',
  fontFamily:'IBM Plex Sans, sans-serif',
};

const STATUS_CFG = {
  pending:     { label:'Pending',     color:'#888',    bg:'rgba(136,136,136,.12)' },
  in_progress: { label:'In Progress', color:'#fbbf24', bg:'rgba(251,191,36,.12)'  },
  ready:       { label:'Ready',       color:'#4ade80', bg:'rgba(74,222,128,.12)'  },
  delivered:   { label:'Delivered',   color:'#555',    bg:'rgba(85,85,85,.12)'    },
};

function StatusBadge({ status }) {
  const s = STATUS_CFG[status] || STATUS_CFG.pending;
  return (
    <span style={{ fontSize:10, fontWeight:700, letterSpacing:'.06em', padding:'3px 8px',
      borderRadius:3, background:s.bg, color:s.color, textTransform:'uppercase' }}>
      {s.label}
    </span>
  );
}

const labelSt = { display:'block', fontSize:10, letterSpacing:'.07em', fontWeight:600,
  color:'var(--muted,#888)', marginBottom:5, textTransform:'uppercase' };

const secHdr = { fontSize:10, letterSpacing:'.08em', fontWeight:700,
  color:'var(--muted,#888)', marginBottom:10, textTransform:'uppercase' };


// ═══════════════════════════════════════════════════════════════════════════════
//  SERVICE PAGE  — default export (required by router)
// ═══════════════════════════════════════════════════════════════════════════════
export default function ServicePage() {
  const qc = useQueryClient();
  const [filter, setFilter]         = useState('all');
  const [search, setSearch]         = useState('');
  const [newJobOpen, setNewJobOpen]  = useState(false);
  const [billJob, setBillJob]       = useState(null);
  const [editJob, setEditJob]       = useState(null); // FIX #2: edit state

  // ── Jobs list ────────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['service-jobs', filter, search],
    queryFn: () => serviceApi.list({
      status: filter === 'all' ? undefined : filter,
      search: search || undefined,
      limit:  5000,
    }),
    keepPreviousData: true,
  });
  const jobs = data?.data?.items || data?.data || [];

  // ── Stats ────────────────────────────────────────────────────────────────────
  const { data: statsData } = useQuery({
    queryKey: ['service-stats'],
    queryFn: serviceApi.stats,
    refetchInterval: 30000,
  });
  const stats = statsData?.data || {};

  // ── Update status ────────────────────────────────────────────────────────────
  const updateMut = useMutation({
    mutationFn: ({ jobId, status }) => serviceApi.update(jobId, { status }), // FIX #5: updateJob → update
    onSuccess: () => {
      qc.invalidateQueries(['service-jobs']);
      qc.invalidateQueries(['service-stats']);
      toast.success('Status updated');
    },
    onError: () => toast.error('Failed to update'),
  });

  // FIX #2: delete mutation
  const deleteMut = useMutation({
    mutationFn: (id) => serviceApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries(['service-jobs']);
      qc.invalidateQueries(['service-stats']);
      toast.success('Job deleted');
    },
    onError: () => toast.error('Failed to delete'),
  });

  const TABS = [
    { key:'all',         label:'All',         count:(stats.pending||0)+(stats.in_progress||0)+(stats.ready||0)+(stats.delivered||0) },
    { key:'pending',     label:'Pending',     count:stats.pending     ||0 },
    { key:'in_progress', label:'In Progress', count:stats.in_progress ||0 },
    { key:'ready',       label:'Ready',       count:stats.ready       ||0 },
    { key:'delivered',   label:'Delivered',   count:stats.delivered   ||0 },
  ];

  return (
    <div style={{ fontFamily:'IBM Plex Sans, sans-serif', color:'var(--text,#e8e8e8)', minHeight:'100vh' }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'16px 24px', borderBottom:'1px solid var(--border,#222)' }}>
        <div>
          <div style={{ fontSize:9, letterSpacing:'.12em', color:C.gold, fontWeight:700, marginBottom:3 }}>SERVICE</div>
          <div style={{ fontSize:20, fontWeight:800, letterSpacing:'-.01em' }}>Job Board</div>
        </div>
        {/* FIX #3: removed + Parts Bill button — moved to PartsPage */}
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => setNewJobOpen(true)} style={btnPrimary}>
            + New Job Card
          </button>
        </div>
      </div>

      {/* ── Stat strip ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', borderBottom:'1px solid var(--border,#222)' }}>
        {[
          { label:'PENDING',     value:stats.pending     ||0, color:'#888'    },
          { label:'IN PROGRESS', value:stats.in_progress ||0, color:'#fbbf24' },
          { label:'READY',       value:stats.ready       ||0, color:'#4ade80' },
          { label:'DELIVERED',   value:stats.delivered   ||0, color:'#555'    },
        ].map(s => (
          <div key={s.label}
            style={{ padding:'18px 24px', borderRight:'1px solid var(--border,#222)', cursor:'pointer' }}
            onClick={() => setFilter(s.label.toLowerCase().replace(' ','_'))}
            onMouseEnter={e => e.currentTarget.style.background=C.s2}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}
          >
            <div style={{ fontSize:9, letterSpacing:'.1em', color:C.muted, fontWeight:600, marginBottom:6 }}>{s.label}</div>
            <div style={{ fontSize:28, fontWeight:800, color:s.color, lineHeight:1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Filter tabs + search ── */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 24px',
        borderBottom:'1px solid var(--border,#222)', flexWrap:'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            style={{ ...btnGhost, padding:'6px 14px', fontSize:11,
              background:    filter===t.key ? C.s2            : 'transparent',
              color:         filter===t.key ? C.gold          : C.muted,
              borderColor:   filter===t.key ? C.gold          : '#2a2a2a' }}>
            {t.label}
            {t.count>0 && <span style={{ marginLeft:6, fontSize:10, color:filter===t.key?C.gold:'#555' }}>{t.count}</span>}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search job#, customer, vehicle…"
          style={{ ...inp, maxWidth:260, marginLeft:'auto' }} />
      </div>

      {/* ── Job table ── */}
      <div style={{ padding:'0 24px 40px' }}>
        {isLoading ? (
          <div style={{ padding:48, textAlign:'center', color:C.muted, fontSize:13 }}>Loading jobs…</div>
        ) : jobs.length === 0 ? (
          <div style={{ padding:48, textAlign:'center', color:C.muted, fontSize:13 }}>
            No jobs found{filter!=='all' ? ` with status "${filter}"` : ''}.
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, marginTop:8 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border,#222)' }}>
                {['Job #','Customer','Vehicle','Complaint','Tech','Status','Actions'].map((h,i) => (
                  <th key={i} style={{ padding:'10px 12px', textAlign:'left',
                    fontSize:10, letterSpacing:'.07em', color:C.muted, fontWeight:700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job, idx) => (
                <tr key={job._id||job.id}
                  style={{ borderBottom:'1px solid var(--border,#222)',
                    background:idx%2===0?'transparent':C.s2, transition:'background .1s' }}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(184,134,11,.04)'}
                  onMouseLeave={e => e.currentTarget.style.background=idx%2===0?'transparent':C.s2}
                >
                  <td style={{ padding:'12px 12px' }}>
                    <span style={{ fontFamily:'monospace', fontSize:11, color:C.gold }}>
                      {job.job_number || (job._id||'').slice(-6)}
                    </span>
                  </td>
                  <td style={{ padding:'12px 12px' }}>
                    <div style={{ fontWeight:600 }}>{job.customer_name}</div>
                    <div style={{ fontSize:10, color:C.muted }}>{job.customer_mobile}</div>
                  </td>
                  <td style={{ padding:'12px 12px' }}>
                    <div style={{ fontWeight:600 }}>{job.vehicle_number}</div>
                    <div style={{ fontSize:10, color:C.muted }}>{job.brand} {job.model}</div>
                  </td>
                  <td style={{ padding:'12px 12px', maxWidth:180 }}>
                    <div style={{ color:C.muted, fontSize:11, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {job.complaint}
                    </div>
                    <div style={{ fontSize:10, color:'#555', marginTop:2 }}>{job.check_in_date}</div>
                  </td>
                  <td style={{ padding:'12px 12px', fontSize:11, color:job.technician?C.text:C.muted }}>
                    {job.technician || '—'}
                  </td>
                  <td style={{ padding:'12px 12px' }}>
                    <select
                      value={job.status}
                      onChange={e => updateMut.mutate({ jobId: job._id||job.id, status: e.target.value })}
                      style={{
                        background: STATUS_CFG[job.status]?.bg || 'rgba(136,136,136,.12)',
                        color:      STATUS_CFG[job.status]?.color || '#888',
                        border:     `1px solid ${STATUS_CFG[job.status]?.color || '#888'}`,
                        borderRadius: 3, padding:'3px 6px', fontSize:10, fontWeight:700,
                        letterSpacing:'.06em', textTransform:'uppercase', cursor:'pointer',
                        outline:'none', fontFamily:'IBM Plex Sans, sans-serif',
                      }}
                    >
                      {Object.entries(STATUS_CFG).map(([k,v]) => (
                        <option key={k} value={k} style={{ background:'#141414', color:v.color }}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding:'12px 12px' }}>
                    <div style={{ display:'flex', gap:5, alignItems:'center', flexWrap:'wrap' }}>
                      {job.status === 'ready' && (
                        <button onClick={() => {
                            const amt = job.grand_total ? ` Bill amount: ₹${Number(job.grand_total).toLocaleString('en-IN')}.` : '';
                            const msg = `Hello ${job.customer_name}, your vehicle ${job.vehicle_number} (${job.brand} ${job.model}) service is complete.${amt} Ready for pickup at MM Motors!`;
                            window.open(`https://wa.me/91${job.customer_mobile}?text=${encodeURIComponent(msg)}`,'_blank');
                          }}
                          style={{ ...btnGhost, padding:'5px 9px', fontSize:10,
                            color:C.green, borderColor:'rgba(74,222,128,.3)' }}>
                          Notify
                        </button>
                      )}
                      <button onClick={() => setBillJob(job)}
                        style={{ ...btnGhost, padding:'5px 9px', fontSize:10,
                          color:     job.bill_number ? C.gold : C.muted,
                          borderColor:job.bill_number ? C.gold : '#2a2a2a' }}>
                        {job.bill_number ? 'View Bill' : 'Bill'}
                      </button>
                      {/* FIX #2: Edit button */}
                      <button onClick={() => setEditJob(job)}
                        style={{ ...btnGhost, padding:'5px 9px', fontSize:10 }}>
                        Edit
                      </button>
                      {/* FIX #2: Delete button */}
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete job ${job.job_number || job._id}? This cannot be undone.`))
                            deleteMut.mutate(job._id || job.id);
                        }}
                        style={{ ...btnGhost, padding:'5px 9px', fontSize:10,
                          color:C.red, borderColor:'rgba(248,113,113,.3)' }}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modals ── */}
      {newJobOpen && <NewJobModal   onClose={() => setNewJobOpen(false)} />}
      {billJob    && <ServiceBillModal job={billJob} onClose={() => setBillJob(null)} />}
      {editJob    && <EditJobModal job={editJob} onClose={() => setEditJob(null)} />}
      {/* FIX #3: PartsBillModal removed — moved to PartsPage */}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
//  EDIT JOB MODAL  — FIX #2
// ═══════════════════════════════════════════════════════════════════════════════
function EditJobModal({ job, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    vehicle_number:     job.vehicle_number     || '',
    chassis_number:     job.chassis_number     || '',
    brand:              job.brand              || '',
    model:              job.model              || '',
    odometer_km:        job.odometer_km        || '',
    technician:         job.technician         || '',
    status:             job.status             || 'pending',
    complaint:          job.complaint          || '',
    estimated_delivery: job.estimated_delivery || '',
    notes:              job.notes              || '',
  });
  const upd = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const editMut = useMutation({
    mutationFn: () => serviceApi.update(job._id || job.id, form),
    onSuccess: () => {
      toast.success('Job updated');
      qc.invalidateQueries(['service-jobs']);
      qc.invalidateQueries(['service-stats']);
      onClose();
    },
    onError: e => toast.error(errMsg(e, 'Failed to update job')),
  });

  const STATUSES = ['pending','in_progress','ready','delivered'];
  const BRANDS   = ['HERO','HONDA','BAJAJ','TVS','YAMAHA','SUZUKI','ROYAL ENFIELD','KTM'];

  return (
    <ModalShell onClose={onClose}
      title={`Edit — ${job.job_number || (job._id||'').slice(-6)}`}
      sub={`${job.customer_name} · ${job.vehicle_number}`}>
      <div style={{ padding:'20px 20px 0' }}>
        {/* Vehicle section */}
        <div style={{ fontSize:10, letterSpacing:'.08em', fontWeight:700, color:C.muted, marginBottom:10, textTransform:'uppercase' }}>Vehicle Details</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
          <div>
            <label style={labelSt}>Vehicle Number</label>
            <input value={form.vehicle_number} onChange={upd('vehicle_number')} placeholder="KA 07 U 3915" style={inp} />
          </div>
          <div>
            <label style={labelSt}>Chassis Number</label>
            <input value={form.chassis_number} onChange={upd('chassis_number')} placeholder="MBLHA10AT8HF12345" style={inp} />
          </div>
          <div>
            <label style={labelSt}>Brand</label>
            <select value={form.brand} onChange={upd('brand')} style={inp}>
              {BRANDS.map(b => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label style={labelSt}>Model</label>
            <input value={form.model} onChange={upd('model')} placeholder="Splendor Plus" style={inp} />
          </div>
          <div>
            <label style={labelSt}>Odometer (km)</label>
            <input type="number" value={form.odometer_km} onChange={upd('odometer_km')} placeholder="12500" style={inp} />
          </div>
        </div>
        {/* Service section */}
        <div style={{ fontSize:10, letterSpacing:'.08em', fontWeight:700, color:C.muted, marginBottom:10, textTransform:'uppercase' }}>Service Details</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <div>
            <label style={labelSt}>Technician</label>
            <input value={form.technician} onChange={upd('technician')} placeholder="Technician name" style={inp} />
          </div>
          <div>
            <label style={labelSt}>Status</label>
            <select value={form.status} onChange={upd('status')} style={inp}>
              {STATUSES.map(s => (
                <option key={s} value={s}>{s.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelSt}>Est. Delivery</label>
            <input type="date" value={form.estimated_delivery} onChange={upd('estimated_delivery')} style={inp} />
          </div>
        </div>
        <div style={{ marginBottom:12 }}>
          <label style={labelSt}>Complaint / Work Required</label>
          <textarea value={form.complaint} onChange={upd('complaint')} rows={3}
            style={{ ...inp, resize:'vertical', fontFamily:'inherit' }} />
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={labelSt}>Notes</label>
          <input value={form.notes} onChange={upd('notes')} placeholder="Additional notes" style={inp} />
        </div>
      </div>
      <ModalFoot>
        <button onClick={onClose} style={btnGhost}>Cancel</button>
        <button onClick={() => editMut.mutate()} disabled={editMut.isPending}
          style={{ ...btnPrimary, opacity: editMut.isPending ? .5 : 1 }}>
          {editMut.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </ModalFoot>
    </ModalShell>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
//  NEW JOB CARD MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function NewJobModal({ onClose }) {
  const qc = useQueryClient();
  const [step, setStep]             = useState(1);
  const [custSearch, setCustSearch] = useState('');
  const [selCust, setSelCust]       = useState(null);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [form, setForm]             = useState({
    vehicle_number:'', chassis_number:'', brand:'HERO', model:'', odometer_km:'',
    complaint:'', technician:'', estimated_delivery:'', notes:'',
  });
  const upd = k => e => setForm(p => ({ ...p, [k]:e.target.value }));

  const { data:custData } = useQuery({
    queryKey: ['cust-search', custSearch],
    queryFn: () => customersApi.list({ search:custSearch, limit:10 }),
    enabled: custSearch.length > 1,
  });
  const custs = custData?.data?.items || custData?.data || [];

  // Auto-fetch this customer's vehicles from sales when customer selected
  const { data:custSalesData } = useQuery({
    queryKey: ['cust-sales-vehicles', selCust?._id || selCust?.id],
    queryFn: () => salesApi.list({ search: selCust?.mobile || selCust?.name, limit:10 }),
    enabled: !!selCust,
  });
  const custVehicles = custSalesData?.data?.items || custSalesData?.data || [];

  // Also search by vehicle_number while typing
  const { data:salesData } = useQuery({
    queryKey: ['sales-vehicle-lookup', vehicleSearch],
    queryFn: () => salesApi.list({ search: vehicleSearch, limit:5 }),
    enabled: vehicleSearch.length > 3,
  });
  const salesVehicles = vehicleSearch.length > 3
    ? (salesData?.data?.items || salesData?.data || [])
    : custVehicles;

  // FIX #5: createJob → create
  const createMut = useMutation({
    mutationFn: () => serviceApi.create({
      customer_id: selCust._id || selCust.id,
      ...form,
      odometer_km: Number(form.odometer_km) || 0,
    }),
    onSuccess: () => {
      toast.success('Job card created!');
      qc.invalidateQueries(['service-jobs']);
      qc.invalidateQueries(['service-stats']);
      onClose();
    },
    onError: e => toast.error(errMsg(e, 'Failed to create job')),
  });

  const BRANDS = ['HERO','HONDA','BAJAJ','TVS','YAMAHA','SUZUKI','ROYAL ENFIELD','KTM'];

  return (
    <ModalShell onClose={onClose} title="New Job Card" sub="Service check-in">
      {step === 1 ? (
        <div style={{ padding:'20px 20px 0' }}>
          <label style={labelSt}>Search Customer</label>
          <input value={custSearch} onChange={e => setCustSearch(e.target.value)}
            placeholder="Type name or mobile…" style={{ ...inp, marginBottom:8 }} autoFocus />
          {custs.length > 0 && (
            <div style={{ border:'1px solid var(--border,#222)', borderRadius:4, overflow:'hidden', marginBottom:12 }}>
              {custs.map(c => (
                <div key={c._id||c.id} onClick={() => { setSelCust(c); setStep(2); }}
                  style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid var(--border,#222)',
                    display:'flex', justifyContent:'space-between' }}
                  onMouseEnter={e => e.currentTarget.style.background=C.s2}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}
                >
                  <div>
                    <div style={{ fontWeight:600, fontSize:13 }}>{c.name}</div>
                    <div style={{ fontSize:11, color:C.muted }}>{c.mobile}</div>
                  </div>
                  <span style={{ fontSize:10, color:C.muted, alignSelf:'center' }}>Select →</span>
                </div>
              ))}
            </div>
          )}
          {custSearch.length > 1 && custs.length === 0 && (
            <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>No customers found.</div>
          )}
        </div>
      ) : (
        <div style={{ padding:'20px 20px 0' }}>
          <div style={{ padding:'8px 14px', background:'rgba(184,134,11,.08)',
            border:'1px solid rgba(184,134,11,.2)', borderRadius:4, marginBottom:16,
            display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12 }}>
            <span><strong>{selCust?.name}</strong> — {selCust?.mobile}</span>
            <button onClick={() => { setSelCust(null); setStep(1); }}
              style={{ background:'transparent', border:'none', color:C.muted, cursor:'pointer', fontSize:14 }}>×</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            {/* FIX #4: vehicle_number has its own block with sales lookup dropdown */}
            <div style={{ position:'relative' }}>
              <label style={labelSt}>Vehicle Number *</label>
              <input
                value={form.vehicle_number}
                onChange={e => {
                  upd('vehicle_number')(e);
                  setVehicleSearch(e.target.value);
                }}
                placeholder="KA 07 U 3915"
                style={inp}
              />
              {salesVehicles.length > 0 && !form.model && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:300,
                  background:C.surface, border:'1px solid var(--border2,#2a2a2a)',
                  borderRadius:4, boxShadow:'0 8px 24px rgba(0,0,0,.5)', overflow:'hidden' }}>
                  {salesVehicles.map(s => (
                    <div key={s._id}
                      onClick={() => {
                        setForm(p => ({
                          ...p,
                          vehicle_number: s.vehicle_number || p.vehicle_number,
                          chassis_number: s.chassis_number || p.chassis_number,
                          brand:          s.vehicle_brand  || p.brand,
                          model:          s.vehicle_model  || p.model,
                        }));
                        setVehicleSearch('');
                      }}
                      style={{ padding:'8px 12px', cursor:'pointer',
                        borderBottom:'1px solid var(--border,#222)', fontSize:12 }}
                      onMouseEnter={e => e.currentTarget.style.background=C.s2}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}
                    >
                      <strong>{s.vehicle_number}</strong>
                      {' — '}{s.vehicle_brand} {s.vehicle_model}
                      <span style={{ fontSize:10, color:C.muted, marginLeft:8 }}>{s.customer_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {[
              ['model','Model *','Splendor Plus'],
              ['chassis_number','Chassis Number','MBLHA10AT8HF12345'],
              ['odometer_km','Odometer (km)','12500'],
              ['technician','Technician','Suresh'],
            ].map(([k,l,ph]) => (
              <div key={k}>
                <label style={labelSt}>{l}</label>
                <input value={form[k]} onChange={upd(k)} placeholder={ph}
                  type={k==='odometer_km'?'number':'text'} style={inp} />
              </div>
            ))}
            <div>
              <label style={labelSt}>Brand</label>
              <select value={form.brand} onChange={upd('brand')} style={inp}>
                {BRANDS.map(b => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label style={labelSt}>Est. Delivery</label>
              <input type="date" value={form.estimated_delivery} onChange={upd('estimated_delivery')} style={inp} />
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={labelSt}>Complaint / Work Required *</label>
            <textarea value={form.complaint} onChange={upd('complaint')} rows={3}
              placeholder="Engine noise, routine service, brake issue…"
              style={{ ...inp, resize:'vertical', fontFamily:'inherit' }} />
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={labelSt}>Notes</label>
            <input value={form.notes} onChange={upd('notes')} placeholder="Additional notes" style={inp} />
          </div>
        </div>
      )}
      <ModalFoot>
        <button onClick={onClose} style={btnGhost}>Cancel</button>
        {step === 2 && (
          <button onClick={() => createMut.mutate()}
            disabled={createMut.isPending || !form.vehicle_number || !form.model || !form.complaint}
            style={{ ...btnPrimary,
              opacity:createMut.isPending||!form.vehicle_number||!form.model||!form.complaint ? .5 : 1 }}>
            {createMut.isPending ? 'Creating…' : 'Create Job Card'}
          </button>
        )}
      </ModalFoot>
    </ModalShell>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
//  SERVICE BILL MODAL  (named export — also used from other pages)
// ═══════════════════════════════════════════════════════════════════════════════
// ─── Print Bill ───────────────────────────────────────────────────────────────
function printBill(job, bill, rows, total, taxable, cgst, sgst) {
  const RS = '₹';
  const fmt2 = n => Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtI = n => Number(n||0).toLocaleString('en-IN');

  const rows_html = rows.map(r => `
    <tr>
      <td>${r.description}</td>
      <td style="text-align:center">${r.hsn||'9987'}</td>
      <td style="text-align:center">${r.qty}</td>
      <td style="text-align:right">${RS}${fmt2(r.unit_price)}</td>
      <td style="text-align:center">${r.gst_rate}%</td>
      <td style="text-align:right">${RS}${fmtI(Math.round(r.unit_price*r.qty))}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>Bill — ${bill.bill_number||''}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#111;padding:24px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #B8860B}
    .brand{font-size:22px;font-weight:800;color:#B8860B;letter-spacing:-.5px}
    .brand-sub{font-size:10px;color:#666;margin-top:2px}
    .bill-meta{text-align:right}
    .bill-meta .bill-no{font-size:16px;font-weight:700}
    .bill-meta .bill-date{font-size:10px;color:#666;margin-top:4px}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
    .info-box{background:#f9f9f9;border:1px solid #e0e0e0;border-radius:4px;padding:12px}
    .info-box h4{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#888;margin-bottom:8px}
    .info-box p{font-size:12px;margin-bottom:3px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    thead tr{background:#B8860B;color:#fff}
    th{padding:8px 10px;font-size:10px;letter-spacing:.05em;text-transform:uppercase;text-align:left}
    td{padding:7px 10px;border-bottom:1px solid #eee}
    tbody tr:nth-child(even){background:#f9f9f9}
    .totals{display:flex;justify-content:flex-end;margin-bottom:16px}
    .totals-box{min-width:260px}
    .tot-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #eee;font-size:12px}
    .tot-row.grand{font-size:15px;font-weight:800;color:#B8860B;border-top:2px solid #B8860B;border-bottom:none;padding-top:8px}
    .words{text-align:right;font-size:10px;color:#888;font-style:italic;margin-bottom:20px}
    .payment{font-size:11px;color:#444;margin-bottom:24px}
    .footer{border-top:1px solid #ddd;padding-top:12px;font-size:10px;color:#888;display:flex;justify-content:space-between}
    @media print{body{padding:10px}.no-print{display:none}}
  </style></head><body>
  <div style="max-width:720px;margin:0 auto">
    <div class="header">
      <div>
        <div class="brand">MM MOTORS</div>
        <div class="brand-sub">Authorised Multi-Brand Service Centre</div>
      </div>
      <div class="bill-meta">
        <div class="bill-no">TAX INVOICE</div>
        <div class="bill-no" style="font-size:13px;color:#B8860B">${bill.bill_number||''}</div>
        <div class="bill-date">Date: ${bill.created_at?.slice(0,10) || new Date().toLocaleDateString('en-IN')}</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <h4>Customer</h4>
        <p><strong>${job.customer_name||''}</strong></p>
        <p>${job.customer_mobile||''}</p>
        ${job.customer_address ? `<p>${job.customer_address}</p>` : ''}
      </div>
      <div class="info-box">
        <h4>Vehicle</h4>
        <p><strong>${job.vehicle_number||''}</strong></p>
        <p>${job.brand||''} ${job.model||''}</p>
        <p style="font-size:10px;color:#888">Job: ${job.job_number||''} &nbsp;|&nbsp; ${job.check_in_date||''}</p>
        ${job.chassis_number ? `<p style="font-size:10px;color:#888">Chassis: ${job.chassis_number}</p>` : ''}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:center">HSN</th>
          <th style="text-align:center">Qty</th>
          <th style="text-align:right">Unit Price</th>
          <th style="text-align:center">GST%</th>
          <th style="text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>${rows_html}</tbody>
    </table>

    <div class="totals">
      <div class="totals-box">
        <div class="tot-row"><span>Taxable Amount</span><span>${RS}${fmt2(taxable)}</span></div>
        <div class="tot-row"><span>CGST</span><span>${RS}${fmt2(cgst)}</span></div>
        <div class="tot-row"><span>SGST</span><span>${RS}${fmt2(sgst)}</span></div>
        <div class="tot-row grand"><span>Total</span><span>${RS}${fmtI(total)}</span></div>
      </div>
    </div>
    <div class="words">${bill.amount_in_words || ''}</div>
    <div class="payment">Payment Mode: <strong>${bill.payment_mode||'Cash'}</strong></div>

    <div class="footer">
      <span>Thank you for choosing MM Motors!</span>
      <span>Authorised Signature</span>
    </div>
  </div>
  <script>window.onload=()=>{window.print();}</script>
  </body></html>`;

  const w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
}

export function ServiceBillModal({ job, onClose }) {
  const qc = useQueryClient();

  const jobId = job._id || job.id;

  // FIX #1: getBillByJobId → billsApi.list({ job_id })
  const { data:billData, isLoading:loadingBill } = useQuery({
    queryKey: ['service-bill', jobId],
    queryFn: () => billsApi.list({ job_id: jobId }),
    retry: false,
  });

  // billsApi.list returns array — grab first item
  const rawBill = billData?.data;
  const existingBill = Array.isArray(rawBill) ? rawBill[0] : rawBill || null;

  const [rows, setRows]       = useState([emptyRow()]);
  const [payMode, setPayMode] = useState('Cash');
  const [inited, setInited]   = useState(false);

  if (!loadingBill && !inited) {
    if (existingBill?.items?.length > 0) {
      setRows(existingBill.items.map(it => ({
        _key:        Math.random(),
        description: it.description  || '',
        hsn:         it.hsn_code     || '9987',
        qty:         it.qty          || 1,
        unit_price:  it.unit_price   || 0,
        gst_rate:    it.gst_rate     || 18,
        _savedQty:   it.qty          || 0,
        _partNumber: it.part_number  || null,
      })));
      setPayMode(existingBill.payment_mode || 'Cash');
    }
    setInited(true);
  }

  const { data:partsData } = useQuery({
    queryKey: ['parts-list'],
    queryFn: () => partsApi.list({ limit:2000 }),
  });
  const allParts = partsData?.data?.items || partsData?.data || [];

  const updateRow   = (key, field, val) => setRows(p => p.map(r => r._key===key ? { ...r, [field]:val } : r));
  const addRow      = () => setRows(p => [...p, emptyRow()]);
  const removeRow   = key => {
    setRows(p => {
      const row = p.find(r => r._key===key);
      // FIX #1: adjustStockByNumber with correct payload
      if (row?._partNumber && row?._savedQty)
        partsApi.adjustStockByNumber(row._partNumber, { qty: row._savedQty, action: 'add' }).catch(()=>{});
      return p.filter(r => r._key!==key);
    });
  };
  const fillFromPart = (key, part) => setRows(p => p.map(r => r._key===key ? {
    ...r, description:part.name, hsn:part.hsn_code||'9987',
    unit_price:part.selling_price||0, gst_rate:part.gst_rate||18, _partNumber:part.part_number||null,
  } : r));

  const validRows = rows.filter(r => r.description && r.unit_price > 0);
  const total     = validRows.reduce((s,r) => s + r.unit_price*r.qty, 0);
  const taxable   = validRows.reduce((s,r) => s + (r.unit_price*r.qty) / (1 + (r.gst_rate||0)/100), 0);
  const gstTotal  = total - taxable;
  const cgst      = gstTotal / 2;
  const sgst      = gstTotal / 2;
  const grandTotal = Math.round(total);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        job_id: jobId, payment_mode: payMode,
        items: validRows.map(r => ({
          description: r.description, hsn_code: r.hsn||'9987',
          qty: Number(r.qty), unit_price: Number(r.unit_price),
          gst_rate: Number(r.gst_rate), part_number: r._partNumber||'',
        })),
      };
      // FIX #1: adjustStockByNumber with correct payload shape
      for (const row of validRows) {
        if (row._partNumber) {
          const diff = Number(row.qty) - (row._savedQty||0);
          if (diff>0)
            await partsApi.adjustStockByNumber(row._partNumber, { qty: diff, action: 'subtract' }).catch(()=>{});
          else if (diff<0)
            await partsApi.adjustStockByNumber(row._partNumber, { qty: Math.abs(diff), action: 'add' }).catch(()=>{});
        }
      }
      // createBill/updateBill → billsApi
      const billId = existingBill?.id || existingBill?._id;
      return billId
        ? billsApi.update(billId, payload)
        : billsApi.create(payload);
    },
    onSuccess: () => {
      toast.success('Bill saved!');
      qc.invalidateQueries(['service-bill', jobId]);
      qc.invalidateQueries(['service-jobs']);
      qc.invalidateQueries(['service-stats']);
      qc.invalidateQueries(['parts-list']);
      onClose();
    },
    onError: e => toast.error(errMsg(e, 'Failed to save bill')),
  });

  return (
    <ModalShell onClose={onClose}
      title={`${job.job_number||(jobId||'').slice(-6)} — ${job.customer_name}`}
      sub={`${job.vehicle_number||''} · ${job.brand||''} ${job.model||''}`}>
      {loadingBill ? (
        <div style={{ padding:32, textAlign:'center', color:C.muted, fontSize:13 }}>Loading bill…</div>
      ) : (
        <div style={{ padding:'16px 20px 0' }}>
          {existingBill && (
            <div style={{ marginBottom:12, padding:'8px 14px', borderRadius:4, fontSize:11,
              fontWeight:600, color:C.gold, background:'rgba(184,134,11,.08)',
              border:'1px solid rgba(184,134,11,.25)' }}>
              ✏️  Editing saved bill — {existingBill.bill_number}
            </div>
          )}
          <div style={{ overflowX:'auto', marginBottom:8 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#1A1A1A' }}>
                  {['Description / Part','HSN','Qty','Unit Price (₹)','GST %','Amount',''].map((h,i) => (
                    <th key={i} style={{ padding:'8px 10px', color:C.gold, fontWeight:700, fontSize:10,
                      letterSpacing:'.06em', textAlign:i>=2?'right':'left', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <BillRow key={row._key} row={row} idx={idx} allParts={allParts}
                    onChange={updateRow} onRemove={removeRow} onSelectPart={fillFromPart} />
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addRow} style={{ ...btnGhost, fontSize:11, padding:'5px 12px', marginBottom:16 }}>
            + Add line item
          </button>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
            <div style={{ minWidth:260 }}>
              <TotRow label="Taxable Amount" val={`${RS}${fmt(taxable)}`} />
              <TotRow label="CGST"           val={`${RS}${fmt(cgst)}`} />
              <TotRow label="SGST"           val={`${RS}${fmt(sgst)}`} />
              <TotRow label="Total"          val={`${RS}${fmtI(grandTotal)}`} bold gold />
              <div style={{ fontSize:10, color:C.muted, fontStyle:'italic', textAlign:'right', marginTop:4 }}>
                {numWords(grandTotal)} Rupees Only
              </div>
            </div>
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={labelSt}>PAYMENT MODE</label>
            <select value={payMode} onChange={e => setPayMode(e.target.value)} style={{ ...inp, maxWidth:200 }}>
              {['Cash','UPI','Card','Bank Transfer','Credit'].map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
      )}
      <ModalFoot>
        <button onClick={onClose} style={btnGhost}>Cancel</button>
        {existingBill && (
          <button onClick={() => printBill(job, existingBill, validRows, grandTotal, taxable, cgst, sgst)}
            style={{ ...btnGhost, color:C.gold, borderColor:'rgba(184,134,11,.4)' }}>
            🖨 Print Bill
          </button>
        )}
        <button onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending || validRows.length===0}
          style={{ ...btnPrimary, opacity:saveMut.isPending||validRows.length===0 ? .5 : 1 }}>
          {saveMut.isPending ? 'Saving…' : existingBill ? 'Update Bill' : 'Generate Bill'}
        </button>
      </ModalFoot>
    </ModalShell>
  );
}


// ─── Bill Row ─────────────────────────────────────────────────────────────────
function BillRow({ row, idx, allParts, onChange, onRemove, onSelectPart }) {
  const [search, setSearch]     = useState('');
  const [showDrop, setShowDrop] = useState(false);

  const filtered = search.length > 1
    ? allParts.filter(p =>
        p.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.part_number?.toLowerCase().includes(search.toLowerCase())
      ).slice(0,8)
    : [];

  const amount = row.unit_price * row.qty; // price already includes GST

  return (
    <tr style={{ background:idx%2===0?'transparent':C.s2 }}>
      <td style={{ padding:'6px 8px', minWidth:190, position:'relative' }}>
        <input value={row.description}
          onChange={e => { onChange(row._key,'description',e.target.value); setSearch(e.target.value); setShowDrop(true); }}
          onBlur={() => setTimeout(()=>setShowDrop(false),160)}
          placeholder="Labour / part name" style={inp} />
        {showDrop && filtered.length > 0 && (
          <div style={{ position:'absolute', top:'100%', left:0, right:0, background:C.surface,
            border:'1px solid var(--border2,#2a2a2a)', borderRadius:4, zIndex:200,
            boxShadow:'0 8px 24px rgba(0,0,0,.5)', maxHeight:200, overflowY:'auto' }}>
            {filtered.map(p => (
              <div key={p._id}
                onMouseDown={() => { onSelectPart(row._key,p); setSearch(''); setShowDrop(false); }}
                style={{ padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid var(--border,#222)', fontSize:12 }}
                onMouseEnter={e=>e.currentTarget.style.background=C.s2}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}
              >
                <div style={{ fontWeight:600 }}>{p.name}</div>
                <div style={{ fontSize:10, color:C.muted }}>{p.part_number} · {RS}{p.selling_price} · Stock:{p.stock}</div>
              </div>
            ))}
          </div>
        )}
      </td>
      <td style={{ padding:'6px 6px', width:76 }}>
        <input value={row.hsn} onChange={e=>onChange(row._key,'hsn',e.target.value)} placeholder="9987" style={inp}/>
      </td>
      <td style={{ padding:'6px 6px', width:60 }}>
        <input type="number" min="1" value={row.qty}
          onChange={e=>onChange(row._key,'qty',Math.max(1,Number(e.target.value)))}
          style={{ ...inp, textAlign:'right' }}/>
      </td>
      <td style={{ padding:'6px 6px', width:106 }}>
        <input type="number" min="0" value={row.unit_price}
          onChange={e=>onChange(row._key,'unit_price',Number(e.target.value))}
          style={{ ...inp, textAlign:'right' }}/>
      </td>
      <td style={{ padding:'6px 6px', width:72 }}>
        <select value={row.gst_rate} onChange={e=>onChange(row._key,'gst_rate',Number(e.target.value))} style={inp}>
          {[0,5,12,18,28].map(r=><option key={r} value={r}>{r}%</option>)}
        </select>
      </td>
      <td style={{ padding:'6px 10px', textAlign:'right', fontWeight:600, fontSize:12, whiteSpace:'nowrap' }}>
        {RS}{fmtI(Math.round(amount))}
      </td>
      <td style={{ padding:'6px 6px', width:26 }}>
        <button onClick={()=>onRemove(row._key)}
          style={{ background:'transparent', border:'none', color:C.red, cursor:'pointer', fontSize:16, padding:0 }}>×</button>
      </td>
    </tr>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
//  PARTS BILL MODAL  (named export — used by PartsPage)
// ═══════════════════════════════════════════════════════════════════════════════
export function PartsBillModal({ onClose }) {
  const qc = useQueryClient();
  const [cust, setCust]       = useState({ name:'', mobile:'', vehicle:'' });
  const updC = k => e => setCust(p=>({...p,[k]:e.target.value}));
  const [cart, setCart]       = useState([]);
  const [psearch, setPsearch] = useState('');
  const [payMode, setPayMode] = useState('Cash');
  const [done, setDone]       = useState(false);
  const [billNo, setBillNo]   = useState('');

  const { data:partsData } = useQuery({ queryKey:['parts-list'], queryFn:()=>partsApi.list({limit:500}) });
  const allParts = partsData?.data?.items || partsData?.data || [];

  const results = psearch.length>1
    ? allParts.filter(p=>(p.name?.toLowerCase().includes(psearch.toLowerCase())||
        p.part_number?.toLowerCase().includes(psearch.toLowerCase()))&&p.stock>0).slice(0,10)
    : [];

  const addToCart = part => {
    setCart(prev => {
      const ex = prev.find(c=>c._id===part._id);
      if (ex) {
        if (ex.qty>=part.stock){toast.error('Not enough stock');return prev;}
        return prev.map(c=>c._id===part._id?{...c,qty:c.qty+1}:c);
      }
      return [...prev,{...part,qty:1}];
    });
    setPsearch('');
  };

  const setQty = (id,qty)=>{
    const p=allParts.find(p=>p._id===id);
    if(qty>(p?.stock||0)){toast.error('Not enough stock');return;}
    setCart(prev=>qty<=0?prev.filter(c=>c._id!==id):prev.map(c=>c._id===id?{...c,qty}:c));
  };

  const pbTotal   = cart.reduce((s,c)=>s+(c.selling_price||0)*c.qty,0);
  const pbTaxable = cart.reduce((s,c)=>s+(c.selling_price||0)*c.qty/(1+((c.gst_rate||18)/100)),0);
  const pbGst     = pbTotal - pbTaxable;
  const pbCgst    = pbGst / 2;
  const pbSgst    = pbGst / 2;
  const total     = Math.round(pbTotal);

  const genMut = useMutation({
    mutationFn: () => partsApi.createBill({
      customer_name: cust.name, customer_mobile: cust.mobile, customer_vehicle: cust.vehicle,
      payment_mode: payMode,
      items: cart.map(c=>({ part_id:c._id, part_number:c.part_number||'', name:c.name,
        hsn_code:c.hsn_code||'8714', qty:c.qty, unit_price:c.selling_price||0, gst_rate:c.gst_rate||18 })),
    }),
    onSuccess: res => {
      setBillNo(res?.data?.bill_number||`PRT-${Date.now().toString().slice(-6)}`);
      setDone(true);
      qc.invalidateQueries(['parts-list']);
      toast.success('Parts bill generated!');
    },
    onError: e => toast.error(errMsg(e, 'Failed')),
  });

  return (
    <ModalShell onClose={onClose} title="New Parts Bill" sub="Walk-in counter sale">
      {done ? (
        <div style={{ padding:40, textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
          <div style={{ fontSize:18, fontWeight:800, marginBottom:6 }}>Bill Generated!</div>
          <div style={{ fontSize:13, color:C.muted, marginBottom:4 }}>{billNo}</div>
          <div style={{ fontSize:16, fontWeight:700, color:C.gold, marginBottom:24 }}>
            {RS}{fmtI(total)} — {payMode}
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
            <button onClick={()=>window.print()} style={btnPrimary}>Print Bill</button>
            <button onClick={onClose} style={btnGhost}>Close</button>
          </div>
        </div>
      ):(
        <div style={{ padding:'16px 20px 0' }}>
          {/* Customer */}
          <div style={{ marginBottom:16 }}>
            <div style={secHdr}>CUSTOMER DETAILS</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
              {[['name','Name','Customer name'],['mobile','Mobile','Mobile number'],['vehicle','Vehicle (optional)','KA 07 U 3915']].map(([k,l,ph])=>(
                <div key={k}>
                  <label style={labelSt}>{l}</label>
                  <input value={cust[k]} onChange={updC(k)} placeholder={ph} style={inp}/>
                </div>
              ))}
            </div>
          </div>

          {/* Parts search */}
          <div style={{ marginBottom:14 }}>
            <div style={secHdr}>ADD PARTS</div>
            <div style={{ position:'relative', maxWidth:380 }}>
              <input value={psearch} onChange={e=>setPsearch(e.target.value)}
                placeholder="Search part name or number…" style={inp}/>
              {results.length>0&&(
                <div style={{ position:'absolute', top:'100%', left:0, right:0, background:C.surface,
                  border:'1px solid var(--border2,#2a2a2a)', borderRadius:4, zIndex:200,
                  boxShadow:'0 8px 24px rgba(0,0,0,.5)', maxHeight:240, overflowY:'auto' }}>
                  {results.map(p=>(
                    <div key={p._id} onClick={()=>addToCart(p)}
                      style={{ padding:'9px 12px', cursor:'pointer', borderBottom:'1px solid var(--border,#222)',
                        display:'flex', justifyContent:'space-between', alignItems:'center' }}
                      onMouseEnter={e=>e.currentTarget.style.background=C.s2}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                    >
                      <div>
                        <div style={{ fontSize:12, fontWeight:600 }}>{p.name}</div>
                        <div style={{ fontSize:10, color:C.muted }}>{p.part_number} · {p.category}</div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:12, fontWeight:700, color:C.gold }}>{RS}{p.selling_price}</div>
                        <div style={{ fontSize:10, color:p.stock<=5?C.amber:C.green }}>Stock:{p.stock}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cart */}
          {cart.length===0?(
            <div style={{ padding:'24px 0', textAlign:'center', color:C.muted, fontSize:12,
              borderTop:'1px solid var(--border,#222)', marginBottom:12 }}>
              No parts added yet.
            </div>
          ):(
            <>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, marginBottom:10 }}>
                <thead>
                  <tr style={{ background:'#1A1A1A' }}>
                    {['Part Name','Part No','Qty','Price','GST','Amount',''].map((h,i)=>(
                      <th key={i} style={{ padding:'7px 10px', color:C.gold, fontWeight:700, fontSize:10,
                        letterSpacing:'.06em', textAlign:i>=2?'right':'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item,idx)=>{
                    const price=item.selling_price||0, gstR=item.gst_rate||18;
                    const amount=price*item.qty; // price is GST-inclusive
                    return(
                      <tr key={item._id} style={{ background:idx%2===0?'transparent':C.s2, borderBottom:'1px solid var(--border,#222)' }}>
                        <td style={{ padding:'8px 10px', fontWeight:600 }}>{item.name}</td>
                        <td style={{ padding:'8px 10px', fontFamily:'monospace', fontSize:11, color:C.muted }}>{item.part_number}</td>
                        <td style={{ padding:'8px 6px', textAlign:'right' }}>
                          <input type="number" min="1" max={item.stock} value={item.qty}
                            onChange={e=>setQty(item._id,Number(e.target.value))}
                            style={{ ...inp, width:52, textAlign:'right' }}/>
                        </td>
                        <td style={{ padding:'8px 10px', textAlign:'right' }}>{RS}{price}</td>
                        <td style={{ padding:'8px 10px', textAlign:'right', color:C.muted }}>{gstR}%</td>
                        <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, color:C.gold }}>
                          {RS}{fmtI(Math.round(amount))}
                        </td>
                        <td style={{ padding:'8px 6px' }}>
                          <button onClick={()=>setCart(p=>p.filter(c=>c._id!==item._id))}
                            style={{ background:'transparent', border:'none', color:C.red, cursor:'pointer', fontSize:16, padding:0 }}>×</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
                <div style={{ minWidth:260 }}>
                  <TotRow label="Taxable Amount" val={`${RS}${fmt(pbTaxable)}`}/>
                  <TotRow label="CGST"           val={`${RS}${fmt(pbCgst)}`}/>
                  <TotRow label="SGST"           val={`${RS}${fmt(pbSgst)}`}/>
                  <TotRow label="Total"          val={`${RS}${fmtI(total)}`} bold gold/>
                  <div style={{ fontSize:10, color:C.muted, fontStyle:'italic', textAlign:'right', marginTop:4 }}>
                    {numWords(total)} Rupees Only
                  </div>
                </div>
              </div>
            </>
          )}

          <div style={{ marginBottom:20 }}>
            <label style={labelSt}>PAYMENT MODE</label>
            <select value={payMode} onChange={e=>setPayMode(e.target.value)} style={{ ...inp, maxWidth:200 }}>
              {['Cash','UPI','Card','Bank Transfer','Credit'].map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
      )}
      {!done&&(
        <ModalFoot>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button onClick={()=>genMut.mutate()}
            disabled={genMut.isPending||cart.length===0}
            style={{ ...btnPrimary, opacity:genMut.isPending||cart.length===0 ? .5 : 1 }}>
            {genMut.isPending?'Generating…':`Generate Bill — ${RS}${fmtI(total)}`}
          </button>
        </ModalFoot>
      )}
    </ModalShell>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
//  SHARED PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════════

function ModalShell({ children, onClose, title, sub }) {
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)',
      display:'flex', alignItems:'flex-start', justifyContent:'center',
      zIndex:2000, padding:'24px 16px', overflowY:'auto' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:C.surface, width:'100%', maxWidth:840,
        borderRadius:6, overflow:'hidden', boxShadow:'0 24px 80px rgba(0,0,0,.7)',
        fontFamily:'IBM Plex Sans, sans-serif' }}>
        <div style={{ background:'#1A1A1A', borderTop:'3px solid #B8860B',
          padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontSize:9, letterSpacing:'.12em', color:C.gold, fontWeight:700, marginBottom:4 }}>MM MOTORS</div>
            <div style={{ fontSize:17, fontWeight:800, color:'#fff', letterSpacing:'-.01em' }}>{title}</div>
            {sub && <div style={{ fontSize:11, color:'#888', marginTop:3 }}>{sub}</div>}
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#888', fontSize:20, cursor:'pointer', padding:4 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalFoot({ children }) {
  return (
    <div style={{ display:'flex', justifyContent:'flex-end', gap:8,
      padding:'14px 20px', background:C.s2, borderTop:'1px solid var(--border,#222)' }}>
      {children}
    </div>
  );
}

function TotRow({ label, val, bold, gold }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0',
      fontSize:bold?15:12, fontWeight:bold?800:400,
      color:gold?C.gold:C.muted, borderBottom:'1px solid var(--border,#222)' }}>
      <span>{label}</span><span>{val}</span>
    </div>
  );
}
