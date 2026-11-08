import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { customersApi, salesApi, serviceApi, errMsg} from '../api/client';
import { Btn, GhostBtn, Field, Avatar, Skeleton, Empty, ApiError, useSortable } from '../components/ui';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';
import FileUpload from '../components/FileUpload';
import { useAuth } from '../context/AuthContext';
import { useBadgeTypes, CustomerBadges } from '../hooks/useBadges';

function sendWA(mobile, msg) {
  if (!mobile) return toast.error('No mobile number');
  window.open(`https://wa.me/91${mobile}?text=${encodeURIComponent(msg)}`, '_blank');
}

// Owner-only badge picker. Uses dynamic badge_types from the server (managed on the Badge Types page).
// For staff/non-owner: shows read-only chips using the customer's stored tags.
function TagDropdown({ customer, onUpdate, canEdit, badgeTypes }) {
  const [open, setOpen]     = useState(false);
  const [saving, setSaving] = useState(false);
  const tags = customer.tags || [];
  const byName = new Map((badgeTypes || []).map(b => [b.name, b]));

  const toggle = async (name) => {
    if (!canEdit) return;
    setSaving(true);
    const next = tags.includes(name) ? tags.filter(t => t !== name) : [...tags, name];
    try {
      await customersApi.setTags(customer.id, next);
      onUpdate();
    } catch (e) {
      toast.error(errMsg(e, 'Failed to update badges'));
    }
    setSaving(false);
  };

  // Read-only view for non-owners
  if (!canEdit) {
    if (tags.length === 0) return <span className="cell-muted">None</span>;
    return <CustomerBadges names={tags} byName={byName} align="stack" />;
  }

  return (
    <div style={{ position:'relative' }} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Badges for ${customer.name}`}
        style={{ display:'flex', gap:'var(--space-2xs)', flexWrap:'wrap', alignItems:'center', cursor:'pointer', minHeight:28, padding:0, background:'transparent', border:0, color:'inherit', textAlign:'left' }}
        onClick={() => setOpen(o => !o)}
      >
        {tags.length
          ? <CustomerBadges names={tags} byName={byName} align="stack" />
          : <span className="cell-muted" style={{ fontSize:'var(--text-xs)' }}>+ Assign</span>}
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position:'fixed', inset:0, zIndex:'var(--z-dropdown)' }}
          />
          <div role="menu" aria-label="Assign badges" style={{
            position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:'calc(var(--z-dropdown) + 1)',
            background:'var(--color-paper)', border:'1px solid var(--color-rule)', borderRadius:'var(--radius-control)',
            padding:'var(--space-2xs)', minWidth:200, maxHeight:280, overflowY:'auto',
            boxShadow:'0 8px 20px -8px color-mix(in oklab, var(--color-ink) 24%, transparent)',
          }}>
            <div className="label-xs" style={{ padding:'var(--space-2xs) var(--space-xs)' }}>
              Assign badges
            </div>
            {(!badgeTypes || badgeTypes.length === 0) && (
              <div className="cell-muted" style={{ fontSize:'var(--text-xs)', padding:'var(--space-xs)' }}>
                No badge types yet. Owner can create them on the Badge Types page.
              </div>
            )}
            {(badgeTypes || []).map(b => {
              const active = tags.includes(b.name);
              return (
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={active}
                  key={b.id || b.name}
                  className="btn btn-ghost btn-sm"
                  onClick={() => !saving && toggle(b.name)}
                  style={{
                    width:'100%', justifyContent:'flex-start', gap:'var(--space-xs)',
                    borderColor:'transparent', cursor: saving ? 'wait' : 'pointer',
                    background: active ? `color-mix(in oklab, ${b.color} 12%, var(--color-paper))` : undefined,
                  }}
                >
                  <span aria-hidden="true" style={{
                    width:14, height:14, borderRadius:3,
                    border:`1.5px solid ${active ? b.color : 'var(--color-rule-2)'}`,
                    background: active ? b.color : 'transparent',
                    flexShrink:0,
                  }} />
                  <span style={{ fontWeight:600, color: b.color }}>
                    {b.name}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Add customer form ────────────────────────────────────────────────
function CustomerForm({ initial = {}, onSave, onCancel, saving }) {
  const [f, setF] = useState({ name:'', mobile:'', email:'', address:'', ...initial });
  const [idProofFileId, setIdProofFileId] = useState(null);
  const s = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  return (
    <div className="sale-form" style={{ maxWidth:540 }}>
      <div className="form-grid form-grid-2col">
        <Field label="Full name *"><input value={f.name}    onChange={s('name')}    placeholder="Customer name" /></Field>
        <Field label="Mobile *">   <input value={f.mobile}  onChange={s('mobile')}  placeholder="10-digit mobile" /></Field>
        <Field label="Email">      <input value={f.email}   onChange={s('email')}   placeholder="email@example.com" /></Field>
        <Field label="Birthday">   <input type="date" value={f.dob || ''} onChange={s('dob')} max={new Date().toISOString().slice(0, 10)} /></Field>

      </div>
      <Field label="Address">
        <textarea value={f.address} onChange={s('address')} rows={2} placeholder="Full address" />
      </Field>
      <div>
        <FileUpload
          label="Upload Aadhar / ID Proof (Optional)"
          onUploadSuccess={(fileId) => setIdProofFileId(fileId)}
        />
      </div>

      <div className="form-actions" style={{ justifyContent:'flex-end' }}>
        <div className="form-actions-end">
          <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
          {/* NEW: Merge the file ID into the save payload */}
          <Btn disabled={!f.name || !f.mobile || saving} onClick={() => onSave({ ...f, id_proof_file_id: idProofFileId })}>
            {saving ? 'Saving…' : 'Save customer'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── Inline detail panel ──────────────────────────────────────────────
function DetailPanel({ item, type, onClose }) {
  const isSale = type === 'sale';
  const isJob  = type === 'job';
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog record" role="dialog" aria-modal="true" aria-labelledby="cust-detail-title"
        onClick={e => e.stopPropagation()}>
        {/* header */}
        <div className="record-head">
          <div>
            <h2 id="cust-detail-title" className="record-title">{isSale ? item.invoice_number : item.job_number}</h2>
            <div className="record-id">{isSale ? 'Sale' : 'Service job'}</div>
          </div>
          <button type="button" className="record-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="record-body">
          {isSale && (
            <dl className="record-list">
              {[
                ['Vehicle',      `${item.vehicle_brand||''} ${item.vehicle_model||''}`.trim() || 'Not set'],
                ['Vehicle no.',  item.vehicle_number || 'Not set'],
                ['Chassis no.',  item.chassis_number || 'Not set'],
                ['Sale date',    item.sale_date      || 'Not set'],
                ['Payment mode', item.payment_mode   || 'Not set'],
                ['Salesperson',  item.salesperson    || 'Not set'],
                ['Total amount', item.total_amount ? '₹'+Number(item.total_amount).toLocaleString('en-IN') : 'Not set'],
                ['Status',       item.status         || 'Not set'],
                ['Notes',        item.notes          || 'None'],
              ].map(([l,v]) => (
                <div key={l} className="record-row">
                  <dt>{l}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {isJob && (
            <dl className="record-list">
              {[
                ['Vehicle no.',   item.vehicle_number || 'Not set'],
                ['Brand / model', `${item.brand||''} ${item.model||''}`.trim() || 'Not set'],
                ['Chassis no.',   item.chassis_number || 'Not set'],
                ['Odometer',      item.odometer_km ? `${item.odometer_km} km` : 'Not set'],
                ['Complaint',     item.complaint      || 'Not set'],
                ['Technician',    item.technician     || 'Not set'],
                ['Check-in date', item.check_in_date  || 'Not set'],
                ['Est. delivery', item.estimated_delivery || 'Not set'],
                ['Status',        item.status         || 'Not set'],
                ['Bill amount',   item.grand_total ? '₹'+Number(item.grand_total).toLocaleString('en-IN') : 'Not set'],
                ['Notes',         item.notes          || 'None'],
              ].map(([l,v]) => (
                <div key={l} className="record-row">
                  <dt>{l}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Inline action buttons ────────────────────────────────────────────
const actBtn = (label, color, onClick) => (
  <button type="button" onClick={e => { e.stopPropagation(); onClick(); }}
    className={color === 'red' ? 'btn btn-ghost btn-sm btn-ghost-danger' : 'btn btn-ghost btn-sm'}
  >{label}</button>
);

// ── Customer detail ──────────────────────────────────────────────────
function CustomerDetail({ cust, onBack }) {
  const confirm = useConfirm();
  const { data: badgeTypes } = useBadgeTypes();
  const byName = new Map(Array.isArray(badgeTypes) ? badgeTypes.map(b => [b.name, b]) : []);
  const [tab, setTab] = useState('overview');
  const qc = useQueryClient();

  // Birthday is edited right here (used for the birthday WhatsApp list on Follow-ups)
  const [dob, setDob] = useState(cust.dob || '');
  const dobMut = useMutation({
    mutationFn: v => customersApi.update(cust.id, { dob: v }),
    onSuccess: (_r, v) => { setDob(v); qc.invalidateQueries(['customers']); toast.success(v ? 'Birthday saved' : 'Birthday removed'); },
    onError: e => toast.error(errMsg(e, 'Could not save birthday')),
  });

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
    onError: e => toast.error(errMsg(e, 'Update failed')),
  });
  const updJob = useMutation({
    mutationFn: ({ id, data }) => serviceApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries(['customer-timeline', cust.id]); setEditJob(null); toast.success('Job updated'); },
    onError: e => toast.error(errMsg(e, 'Update failed')),
  });

  const TABS = ['overview','vehicles','service','sales'];
  const TAB_LABEL = { overview:'Overview', vehicles:'Vehicles', service:'Service', sales:'Sales' };
  const inp  = { width:'100%' };
  const lb   = { display:'block' };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* header */}
      <div className="page-head" style={{ flexShrink:0, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap:'var(--space-sm)', minWidth:0 }}>
          <GhostBtn onClick={onBack} sm>Back</GhostBtn>
          <Avatar name={cust.name} size={32} />
          <h2 className="page-head-title">{cust.name}</h2>
          <span className="mono cell-muted" style={{ fontSize:'var(--text-sm)' }}>{cust.mobile}</span>
          {cust.tags?.length > 0 && <CustomerBadges names={cust.tags} byName={byName} align="stack" />}
        </div>
        <GhostBtn onClick={() => sendWA(cust.mobile, `Dear ${cust.name}, thank you for visiting MM Motors!`)}>
          WhatsApp
        </GhostBtn>
      </div>

      {/* stats bar */}
      <section className="stat-strip" aria-label="Customer totals" style={{ flexShrink:0 }}>
        {[
          { l:'Total spent',    v: tl?.total_spent  ? '₹'+tl.total_spent.toLocaleString('en-IN') : 'None' },
          { l:'Vehicles',       v: tl?.sales?.length      ?? 'None' },
          { l:'Service visits', v: tl?.service?.length ?? 'None' },
          { l:'Service spend',  v: tl?.service_spend ? '₹'+tl.service_spend.toLocaleString('en-IN') : 'None' },
        ].map((s,i) => (
          <div key={i} className="stat">
            <span className="stat-label">{s.l}</span>
            <span className="stat-value">{isLoading ? '…' : s.v}</span>
          </div>
        ))}
      </section>

      {/* tabs */}
      <div className="tabs" role="tablist" aria-label="Customer record" style={{ padding:'0 var(--space-lg)', flexShrink:0 }}>
        {TABS.map(t => (
          <button key={t} type="button" role="tab" className="tab" aria-selected={tab===t} onClick={() => setTab(t)}>{TAB_LABEL[t]}</button>
        ))}
      </div>

      {/* content */}
      <div style={{ flex:1, overflowY:'auto', padding:'var(--space-lg)' }}>
        {isLoading ? <Skeleton h={120} /> : (
          <>
            {tab === 'overview' && (
              <div className="form-grid form-grid-2col" style={{ gap:'var(--space-lg)' }}>
                <div>
                  <h3 className="sheet-sec">Contact</h3>
                  <dl className="record-list">
                    {[['Mobile', cust.mobile, true],['Email', cust.email||'Not set', false],['Address', cust.address||'Not set', false]].map(([l,v,mono]) => (
                      <div key={l} className="record-row" style={{ gridTemplateColumns:'100px minmax(0, 1fr)' }}>
                        <dt>{l}</dt>
                        <dd className={mono?'mono':''}>{v}</dd>
                      </div>
                    ))}
                    <div className="record-row" style={{ gridTemplateColumns:'100px minmax(0, 1fr)', alignItems:'center' }}>
                      <dt><label htmlFor="cust-dob">Birthday</label></dt>
                      <dd>
                        <input id="cust-dob" type="date" value={dob} max={new Date().toISOString().slice(0, 10)}
                          disabled={dobMut.isPending} onChange={e => dobMut.mutate(e.target.value)}
                          style={{ width:'auto', fontSize:'var(--text-sm)' }} />
                      </dd>
                    </div>
                  </dl>
                </div>
                <div>
                  <h3 className="sheet-sec">Recent activity</h3>
                  {[...(tl?.service||[]),...(tl?.sales||[])].slice(0,5).map((item,i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'var(--space-sm)', padding:'var(--space-xs) 0', borderBottom:'1px solid var(--color-rule)', fontSize:'var(--text-sm)' }}>
                      <span className="mono cell-id">{item.job_number||item.invoice_number}</span>
                      <span className="pill pill-dim">{item.status}</span>
                    </div>
                  ))}
                  {!tl?.service?.length && !tl?.sales?.length && <div className="cell-muted" style={{ fontSize:'var(--text-sm)' }}>No activity yet</div>}
                </div>
              </div>
            )}

            {/* ── VEHICLES TAB ── */}
            {tab === 'vehicles' && (
              tl?.sales?.length ? tl.sales.map((s,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap:'var(--space-sm)', padding:'var(--space-sm) 0', borderBottom:'1px solid var(--color-rule)' }}>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div className="cell-strong">{s.vehicle_brand} {s.vehicle_model}</div>
                    <div className="cell-sub">{s.vehicle_number || 'No vehicle number'}</div>
                    <div className="cell-sub mono">{s.invoice_number}, {s.sale_date}</div>
                    <div className="cell-amount" style={{ marginTop:'var(--space-2xs)' }}>₹{s.total_amount?.toLocaleString('en-IN')}</div>
                  </div>
                  <div className="row-actions" style={{ flexShrink:0 }}>
                    {actBtn('View', 'muted', () => setViewDetail({ item: s, type: 'sale' }))}
                    {actBtn('Edit', 'blue', () => setEditSale(s))}
                    {actBtn('Delete', 'red', async () => { if (await confirm(`Delete ${s.invoice_number}?`)) delSale.mutate(s.id||s._id); })}
                  </div>
                </div>
              )) : <Empty message="No vehicles purchased" />
            )}

            {/* ── SERVICE TAB ── */}
            {tab === 'service' && (
              tl?.service?.length ? tl.service.map((j,i) => (
                <div key={i} style={{ display:'flex', flexWrap:'wrap', gap:'var(--space-sm)', padding:'var(--space-sm) 0', borderBottom:'1px solid var(--color-rule)', alignItems:'center' }}>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div className="mono cell-id">{j.job_number}</div>
                    <div className="cell-strong" style={{ marginTop:'var(--space-3xs)' }}>{j.complaint}</div>
                    <div className="cell-sub">
                      {j.vehicle_number}, {j.check_in_date}, {j.technician||'No technician'}
                    </div>
                    {j.grand_total > 0 && (
                      <div className="cell-amount" style={{ marginTop:'var(--space-2xs)' }}>
                        ₹{j.grand_total?.toLocaleString('en-IN')}
                      </div>
                    )}
                  </div>
                  <span className="pill pill-dim" style={{ flexShrink:0 }}>{j.status}</span>
                  <div className="row-actions" style={{ flexShrink:0 }}>
                    {actBtn('View', 'muted', () => setViewDetail({ item: j, type: 'job' }))}
                    {actBtn('Edit', 'blue', () => setEditJob(j))}
                    {actBtn('Delete', 'red', async () => { if (await confirm(`Delete job ${j.job_number}?`)) delJob.mutate(j.id||j._id); })}
                  </div>
                </div>
              )) : <Empty message="No service records" />
            )}

            {/* ── SALES TAB ── */}
            {tab === 'sales' && (
              tl?.sales?.length ? tl.sales.map((s,i) => (
                <div key={i} style={{ display:'flex', flexWrap:'wrap', gap:'var(--space-sm)', padding:'var(--space-sm) 0', borderBottom:'1px solid var(--color-rule)', alignItems:'center' }}>
                  <div className="mono cell-id">{s.invoice_number}</div>
                  <div style={{ flex:1, minWidth:160 }}>
                    <div className="cell-strong">{s.vehicle_brand} {s.vehicle_model}</div>
                    <div className="cell-sub">{s.sale_date}, {s.payment_mode}</div>
                  </div>
                  <div className="cell-amount" style={{ flexShrink:0, fontVariantNumeric:'tabular-nums' }}>₹{s.total_amount?.toLocaleString('en-IN')}</div>
                  <div className="row-actions" style={{ flexShrink:0 }}>
                    {actBtn('View', 'muted', () => setViewDetail({ item: s, type: 'sale' }))}
                    {actBtn('Edit', 'blue', () => setEditSale(s))}
                    {actBtn('Delete', 'red', async () => { if (await confirm(`Delete ${s.invoice_number}?`)) delSale.mutate(s.id||s._id); })}
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
        <div className="dialog-backdrop" onClick={() => setEditSale(null)}>
          <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="edit-sale-title" style={{ maxWidth:480 }}
            onClick={e => e.stopPropagation()}>
            <h2 id="edit-sale-title" className="dialog-title" style={{ marginBottom:0 }}>Edit sale</h2>
            <p className="dialog-sub mono" style={{ marginBottom:'var(--space-md)' }}>{editSale.invoice_number}</p>
            <EditSaleForm sale={editSale} inp={inp} lb={lb}
              onSave={data => updSale.mutate({ id: editSale.id||editSale._id, data })}
              onCancel={() => setEditSale(null)}
              saving={updSale.isPending} />
          </div>
        </div>
      )}

      {/* ── EDIT JOB MODAL ── */}
      {editJob && (
        <div className="dialog-backdrop" onClick={() => setEditJob(null)}>
          <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="edit-job-title" style={{ maxWidth:520 }}
            onClick={e => e.stopPropagation()}>
            <h2 id="edit-job-title" className="dialog-title" style={{ marginBottom:0 }}>Edit service job</h2>
            <p className="dialog-sub mono" style={{ marginBottom:'var(--space-md)' }}>{editJob.job_number}</p>
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
    <div className="sale-form">
      <div className="form-grid form-grid-2col">
        <div className="field"><label className="field-label" htmlFor="es-brand" style={lb}>Brand</label><input id="es-brand" value={f.vehicle_brand} onChange={s('vehicle_brand')} style={inp} /></div>
        <div className="field"><label className="field-label" htmlFor="es-model" style={lb}>Model</label><input id="es-model" value={f.vehicle_model} onChange={s('vehicle_model')} style={inp} /></div>
        <div className="field"><label className="field-label" htmlFor="es-number" style={lb}>Vehicle number</label><input id="es-number" value={f.vehicle_number} onChange={s('vehicle_number')} style={inp} /></div>
        <div className="field"><label className="field-label" htmlFor="es-date" style={lb}>Sale date</label><input id="es-date" type="date" value={f.sale_date} onChange={s('sale_date')} style={inp} /></div>
        <div className="field">
          <label className="field-label" htmlFor="es-pay" style={lb}>Payment mode</label>
          <select id="es-pay" value={f.payment_mode} onChange={s('payment_mode')} style={inp}>
            {['Cash','UPI','Card','Bank Transfer','Finance'].map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
        <div className="field"><label className="field-label" htmlFor="es-total" style={lb}>Total amount</label><input id="es-total" type="number" value={f.total_amount} onChange={s('total_amount')} style={inp} /></div>
      </div>
      <div className="form-actions" style={{ justifyContent:'flex-end' }}>
        <div className="form-actions-end">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(f)} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
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
    <div className="sale-form">
      <div className="form-grid form-grid-2col">
        <div className="field"><label className="field-label" htmlFor="ej-number" style={lb}>Vehicle number</label><input id="ej-number" value={f.vehicle_number} onChange={s('vehicle_number')} style={inp} /></div>
        <div className="field"><label className="field-label" htmlFor="ej-tech" style={lb}>Technician</label><input id="ej-tech" value={f.technician} onChange={s('technician')} style={inp} /></div>
        <div className="field">
          <label className="field-label" htmlFor="ej-status" style={lb}>Status</label>
          <select id="ej-status" value={f.status} onChange={s('status')} style={inp}>
            {STATUSES.map(st => <option key={st} value={st}>{st.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>)}
          </select>
        </div>
        <div className="field"><label className="field-label" htmlFor="ej-eta" style={lb}>Est. delivery</label><input id="ej-eta" type="date" value={f.estimated_delivery} onChange={s('estimated_delivery')} style={inp} /></div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="ej-complaint" style={lb}>Complaint or work required</label>
        <textarea id="ej-complaint" value={f.complaint} onChange={s('complaint')} rows={3} style={{ ...inp, resize:'vertical' }} />
      </div>
      <div className="field"><label className="field-label" htmlFor="ej-notes" style={lb}>Notes</label><input id="ej-notes" value={f.notes} onChange={s('notes')} placeholder="Additional notes" style={inp} /></div>
      <div className="form-actions" style={{ justifyContent:'flex-end' }}>
        <div className="form-actions-end">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(f)} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────
export default function CustomersPage() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isOwner  = user?.role === 'owner';
  const { data: badgeTypes } = useBadgeTypes();
  const [view, setView]       = useState('list');
  const [selected, setSelected] = useState(null);
  const [search, setSearch]   = useState('');
  const [tag, setTag]         = useState('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['customers', search, tag],
    queryFn: () => customersApi.list({ search: search||undefined, tag: tag!=='all'?tag:undefined, limit:2000 }).then(r => r.data),
    placeholderData: keepPreviousData,  // v5 name; keeps the list on screen while a new search loads
  });

  const createMut = useMutation({
    mutationFn: d => customersApi.create(d),
    onSuccess: () => { qc.invalidateQueries(['customers']); setView('list'); toast.success('Customer added'); },
    onError:   e => toast.error(errMsg(e, 'Failed')),
  });

  const deleteMut = useMutation({
    mutationFn: id => customersApi.delete(id),
    onSuccess: () => { qc.invalidateQueries(['customers']); toast.success('Deleted'); },
    onError:   () => toast.error('Delete failed'),
  });

  const customers = Array.isArray(data) ? data : [];
  const { sorted: sortedCustomers, Th: CustTh } = useSortable(customers, 'name', 'asc');
  const TAG_LABEL = { all:'All' };

  if (view === 'detail' && selected) {
    return <CustomerDetail cust={selected} onBack={() => { setView('list'); setSelected(null); }} />;
  }

  if (view === 'new') {
    return (
      <div className="page-pad">
        <div className="page-back">
          <GhostBtn onClick={() => setView('list')} sm>Back</GhostBtn>
          <h2 className="page-head-title">New customer</h2>
        </div>
        <CustomerForm onSave={d => createMut.mutate(d)} onCancel={() => setView('list')} saving={createMut.isPending} />
      </div>
    );
  }

  return (
    <div>
      {/* stats */}
      <section className="stat-strip" aria-label="Customer figures">
        {[
          { l:'Total', v:customers.length },
          { l:'Badged', v:customers.filter(c => (c.tags || []).length > 0).length },
          { l:'Multi-badge', v:customers.filter(c => (c.tags || []).length > 1).length },
          { l:'Showing', v:customers.length },
        ].map((s,i) => (
          <div key={i} className="stat">
            <span className="stat-label">{s.l}</span>
            <span className="stat-value">{s.v}</span>
          </div>
        ))}
      </section>

      {/* toolbar */}
      <div className="page-toolbar">
        <input type="search" className="page-search" aria-label="Search customers" value={search} onChange={e=>{setSearch(e.target.value)}} placeholder="Search name, mobile, email…" />
        <div className="chips" role="group" aria-label="Badge">
          {['all','VIP','Corporate','Loyal'].map(t => (
            <button key={t} type="button" className="chip" aria-pressed={tag===t} onClick={()=>setTag(t)}>{TAG_LABEL[t] || t}</button>
          ))}
        </div>
        <span className="toolbar-count" role="status">{customers.length} customers</span>
        <Btn onClick={() => setView('new')}>+ New customer</Btn>
      </div>

      {/* table */}
      {error ? <div style={{ padding:'var(--space-lg)' }}><ApiError error={error} /></div>
        : isLoading ? <div className="table-skeleton">{[1,2,3,4,5].map(i=><Skeleton key={i} h={44}/>)}</div>
        : customers.length === 0 ? <Empty message="No customers found" sub="Add one or import from Excel" />
        : (
          <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {[['Customer','name'],['Mobile','mobile'],['Email','email'],['Address','address'],['Tags',''],['','']].map(([h,f]) => (
                  <CustTh key={h} field={f||null}>{h || <span className="visually-hidden">Actions</span>}</CustTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedCustomers.map(c => (
                <tr key={c.id} style={{ cursor:'pointer' }}
                    onClick={() => { setSelected(c); setView('detail'); }}>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:'var(--space-xs)' }}>
                      <Avatar name={c.name} size={28} bg="var(--color-paper-2)" color="var(--color-muted)" />
                      <div>
                        <div className="cell-strong">{c.name}</div>
                        <div className="cell-sub">Since {c.created_at?.slice(0,10)||'unknown'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="mono cell-nowrap">{c.mobile}</td>
                  <td className="cell-muted">{c.email||'Not set'}</td>
                  <td className="cell-muted" style={{ maxWidth:180 }}>
                    <div className="cell-clip">{c.address||'Not set'}</div>
                  </td>
                  <td onClick={e=>e.stopPropagation()}>
                    <TagDropdown
                      customer={c}
                      onUpdate={() => { qc.invalidateQueries(['customers']); qc.invalidateQueries(['customer-badges-map']); }}
                      canEdit={isOwner}
                      badgeTypes={badgeTypes}
                    />
                  </td>
                  <td onClick={e=>e.stopPropagation()}>
                    <div className="row-actions" style={{ flexWrap:'nowrap', minWidth:0 }}>
                      <GhostBtn sm onClick={() => { setSelected(c); setView('detail'); }}>View</GhostBtn>
                      <button type="button" className="btn btn-ghost btn-sm btn-ghost-danger" aria-label={`Delete ${c.name}`}
                        onClick={async () => { if (await confirm(`Delete ${c.name}?`)) deleteMut.mutate(c.id); }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
    </div>
  );
}
