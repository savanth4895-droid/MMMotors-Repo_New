import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceApi, customersApi, salesApi, errMsg } from '../../api/client';
import toast from 'react-hot-toast';
import { useDraft, DraftBar } from '../../hooks/useDraft';
import { ModalShell, ModalFoot } from './Modal';
import { openWA, PROGRESS_MSG, C, inp, labelSt } from './shared';

// Past job cards as vehicle rows in the same shape as sales rows, so bikes that were only
// ever serviced here (bought elsewhere) can be picked too.
const jobAsVehicle = j => ({
  vehicle_number: j.vehicle_number, chassis_number: j.chassis_number,
  vehicle_brand: j.brand, vehicle_model: j.model, vehicle_variant: j.variant,
  customer_name: j.customer_name, note: `Last service ${j.check_in_date || ''}`.trim(),
});

const vehicleKey = v => (v.chassis_number || v.vehicle_number || '').replace(/\s/g, '').toUpperCase();

// Sales first, then newest job per bike; one row per chassis / registration number
const uniqueVehicles = (rows) => {
  const seen = new Set();
  return rows.filter(v => { const k = vehicleKey(v); if (!k || seen.has(k)) return false; seen.add(k); return true; });
};

// Common job-card complaints: tapping one adds it to the Complaint box, tapping again removes it
const COMMON_COMPLAINTS = [
  'General service', 'Oil change', 'Brake adjustment', 'Brake shoe / pad change',
  'Chain lube & adjustment', 'Starting problem', 'Self-start not working', 'Engine noise',
  'Low mileage', 'Battery issue', 'Lights / electrical', 'Horn not working', 'Clutch issue',
  'Hard gear shifting', 'Oil leakage', 'Overheating', 'Puncture / tyre', 'Speedometer not working',
  'Washing',
];

function ComplaintPicks({ value, onChange }) {
  const parts = (value || '').split(',').map(s => s.trim()).filter(Boolean);
  const has   = c => parts.some(p => p.toLowerCase() === c.toLowerCase());
  const toggle = c => onChange((has(c) ? parts.filter(p => p.toLowerCase() !== c.toLowerCase()) : [...parts, c]).join(', '));
  return (
    <div className="chips" role="group" aria-label="Common complaints" style={{ marginTop:'var(--space-xs)' }}>
      {COMMON_COMPLAINTS.map(c => (
        <button key={c} type="button" className="chip" aria-pressed={has(c)} onClick={() => toggle(c)}>{c}</button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EDIT JOB MODAL  — FIX #2
// ═══════════════════════════════════════════════════════════════════════════════
export function EditJobModal({ job, onClose }) {
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
    check_in_date:      job.check_in_date      || '',
    notes:              job.notes              || '',
    service_type:       job.service_type       || '',
  });
  const upd = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const editMut = useMutation({
    mutationFn: () => {
      const payload = { ...form };
      // Convert created_date (YYYY-MM-DD) to ISO string for created_at
      if (payload.created_date) {
        payload.created_at = payload.created_date + 'T00:00:00';
        delete payload.created_date;
      }
      return serviceApi.update(job._id || job.id, payload);
    },
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
        <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginBottom:10 }}>Vehicle Details</div>
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
        <div style={{ fontSize:10, fontWeight:700, color:C.muted, marginBottom:10 }}>Service Details</div>
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
          <div>
            <label style={labelSt}>Check-in Date</label>
            <div style={{ position:'relative' }}>
              <input
                type="date"
                value={form.check_in_date}
                onChange={upd('check_in_date')}
                style={{ ...inp, paddingRight:32 }}
              />
            </div>
          </div>
          <div>
            <label style={labelSt}>Created Date</label>
            <div style={{ position:'relative' }}>
              <input
                type="date"
                value={form.created_date || (job.created_at ? job.created_at.slice(0,10) : '')}
                onChange={e => setForm(p => ({ ...p, created_date: e.target.value }))}
                style={{ ...inp, paddingRight:32 }}
              />
            </div>
          </div>
          <div>
            <label style={labelSt}>Service Type</label>
            <select value={form.service_type} onChange={upd('service_type')} style={inp}>
              <option value="">— Not set (legacy) —</option>
              <option>Repair / Walk-in</option>
              <option>1st Service</option>
              <option>2nd Service</option>
              <option>3rd Service</option>
              <option>4th Service</option>
              <option>5th Service</option>
              <option>6th+ Service</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom:12 }}>
          <label style={labelSt}>Complaint / Work Required</label>
          <textarea value={form.complaint} onChange={upd('complaint')} rows={3}
            style={{ ...inp, resize:'vertical', fontFamily:'inherit' }} />
          <ComplaintPicks value={form.complaint} onChange={v => setForm(p => ({ ...p, complaint: v }))} />
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={labelSt}>Notes</label>
          <input value={form.notes} onChange={upd('notes')} placeholder="Additional notes" style={inp} />
        </div>
      </div>
      <ModalFoot>
        <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        <button onClick={() => editMut.mutate()} disabled={editMut.isPending}
          className="btn btn-primary" style={{ opacity: editMut.isPending ? .5 : 1 }}>
          {editMut.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </ModalFoot>
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  NEW JOB CARD MODAL
// ═══════════════════════════════════════════════════════════════════════════════
export function NewJobModal({ onClose }) {
  const qc = useQueryClient();
  const [step, setStep]             = useState(1);
  const [custSearch, setCustSearch] = useState('');
  const [selCust, setSelCust]       = useState(null);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [form, setForm]             = useState({
    vehicle_number:'', chassis_number:'', brand:'HERO', model:'', odometer_km:'',
    complaint:'', technician:'', estimated_delivery:'', notes:'',
    service_type:'Repair / Walk-in',
  });
  const upd = k => e => setForm(p => ({ ...p, [k]:e.target.value }));

  // Schedule hint — tells staff whether this visit is the due scheduled
  // service or just a repair, instead of making them guess.
  const vnTrimmed = (form.vehicle_number || '').trim();
  const { data:schedData } = useQuery({
    queryKey: ['svc-schedule', vnTrimmed.toUpperCase()],
    queryFn:  () => serviceApi.schedule(vnTrimmed),
    enabled:  vnTrimmed.length >= 4,
    staleTime: 60_000,
  });
  const sched = schedData?.data || null;

  const { data:custData } = useQuery({
    queryKey: ['cust-search', custSearch],
    queryFn: () => customersApi.list({ search:custSearch, limit:10 }),
    enabled: custSearch.length > 1,
  });
  const custs = custData?.data?.items || custData?.data || [];

  // Auto-fetch this customer's vehicles from sales when customer selected.
  // Query by customer_id — exact FK, not a fuzzy mobile/name text match.
  const selCustId = selCust?._id || selCust?.id;
  const { data:custSalesData } = useQuery({
    queryKey: ['cust-sales-vehicles', selCustId],
    queryFn: () => salesApi.list({ customer_id: selCustId, limit:50 }),
    enabled: !!selCustId,
  });
  const { data:custJobsData } = useQuery({
    queryKey: ['cust-service-vehicles', selCustId],
    queryFn: () => serviceApi.list({ customer_id: selCustId, limit:50 }),
    enabled: !!selCustId,
  });
  const custVehicles = uniqueVehicles([
    ...(custSalesData?.data?.items || custSalesData?.data || []).map(s => ({ ...s, note: s.sale_date })),
    ...(custJobsData?.data?.items || custJobsData?.data || []).map(jobAsVehicle),
  ]);

  // Also search by vehicle_number while typing
  const { data:salesData } = useQuery({
    queryKey: ['sales-vehicle-lookup', vehicleSearch],
    queryFn: () => salesApi.list({ search: vehicleSearch, limit:5 }),
    enabled: vehicleSearch.length > 3,
  });
  const { data:jobSearchData } = useQuery({
    queryKey: ['service-vehicle-lookup', vehicleSearch],
    queryFn: () => serviceApi.list({ search: vehicleSearch, limit:5 }),
    enabled: vehicleSearch.length > 3,
  });
  const searchVehicles = vehicleSearch.length > 3
    ? uniqueVehicles([
        ...(salesData?.data?.items || salesData?.data || []),
        ...(jobSearchData?.data?.items || jobSearchData?.data || []).map(jobAsVehicle),
      ])
    : [];

  // FIX #5: createJob → create
  const createMut = useMutation({
    mutationFn: () => serviceApi.create({
      customer_id: selCust._id || selCust.id,
      ...form,
      odometer_km: Number(form.odometer_km) || 0,
    }),
    onSuccess: (res) => {
      toast.success('Job card created!');
      if (res?.data) openWA(res.data.customer_mobile, PROGRESS_MSG.received(res.data));
      qc.invalidateQueries(['service-jobs']);
      qc.invalidateQueries(['service-stats']);
      draft.clearDraft();
      onClose();
    },
    onError: e => toast.error(errMsg(e, 'Failed to create job')),
  });

  // Draft — full state snapshot for restore
  const draftState = { form, selCust, step, custSearch, vehicleSearch };
  const draft = useDraft({ key: 'mm_draft_service', state: draftState });

  const BRANDS = ['HERO','HONDA','BAJAJ','TVS','YAMAHA','SUZUKI','ROYAL ENFIELD','KTM'];

  return (
    <ModalShell onClose={onClose} title="New Job Card" sub="Service check-in">
      <div style={{ padding:'12px 20px 0' }}>
        <DraftBar
          draft={draft}
          onRestore={(d) => {
            if (d.form)          setForm(d.form);
            if (d.selCust)       setSelCust(d.selCust);
            if (d.step)          setStep(d.step);
            if (d.custSearch)    setCustSearch(d.custSearch);
            if (d.vehicleSearch) setVehicleSearch(d.vehicleSearch);
          }}
          onDiscard={() => {}}
        />
      </div>
      {step === 1 ? (
        <div style={{ padding:'20px 20px 0' }}>
          <label style={labelSt}>Search Customer</label>
          <input value={custSearch} onChange={e => setCustSearch(e.target.value)}
            placeholder="Type name or mobile…" style={{ ...inp, marginBottom:8 }} autoFocus />
          {custs.length > 0 && (
            <div style={{ border:'1px solid var(--border)', borderRadius:4, overflow:'hidden', marginBottom:12 }}>
              {custs.map(c => (
                <div key={c._id||c.id} onClick={() => { setSelCust(c); setStep(2); }}
                  style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid var(--border)',
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
            <span><strong>{selCust?.name}</strong>, {selCust?.mobile}</span>
            <button onClick={() => { setSelCust(null); setStep(1); }}
              style={{ background:'transparent', border:'none', color:C.muted, cursor:'pointer', fontSize:14 }}>×</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            {/* Vehicle picker — shows customer's bikes from sales, or manual entry */}
            <div style={{ gridColumn:'1 / -1' }}>
              <label style={labelSt}>Select Vehicle *</label>

              {/* Customer bikes from sales */}
              {custVehicles.length > 0 && (
                <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:10 }}>
                  {custVehicles.map((s, i) => {
                    const isSelected = vehicleKey(form) === vehicleKey(s);
                    return (
                      <div key={i}
                        onClick={() => setForm(p => ({
                          ...p,
                          vehicle_number: s.vehicle_number || '',
                          chassis_number: s.chassis_number || '',
                          brand:          s.vehicle_brand  || p.brand,
                          model:          s.vehicle_model  || '',
                        }))}
                        style={{
                          display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                          border:`1.5px solid ${isSelected ? C.gold : 'var(--border)'}`,
                          borderRadius:6, cursor:'pointer', background: isSelected ? 'rgba(184,134,11,.08)' : C.surface,
                          transition:'all .15s',
                        }}
                        onMouseEnter={e => { if(!isSelected) e.currentTarget.style.background=C.s2; }}
                        onMouseLeave={e => { if(!isSelected) e.currentTarget.style.background=C.surface; }}
                      >
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, fontSize:13 }}>
                            {s.vehicle_brand} {s.vehicle_model}
                            {s.vehicle_variant ? <span style={{ fontSize:10, color:C.muted, marginLeft:6 }}>{s.vehicle_variant}</span> : null}
                          </div>
                          <div style={{ fontSize:11, color:C.muted, marginTop:2, display:'flex', gap:10 }}>
                            {s.vehicle_number && <span className="mono">{s.vehicle_number}</span>}
                            {s.chassis_number && <span>Chassis: <span className="mono">{s.chassis_number}</span></span>}
                          </div>
                          <div style={{ fontSize:10, color:C.dim, marginTop:1 }}>{s.note}</div>
                        </div>
                        {isSelected && (
                          <div style={{ width:22, height:22, borderRadius:'50%', background:C.gold,
                            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            <span style={{ color:'var(--color-ink)', fontSize:12, fontWeight:900 }}>✓</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {custVehicles.length === 0 && selCust && (
                <div style={{ fontSize:11, color:C.muted, marginBottom:8, fontStyle:'italic' }}>
                  No bikes on record for this customer. Enter vehicle details below.
                </div>
              )}

              {/* Manual vehicle search */}
              <div style={{ position:'relative' }}>
                <input
                  value={vehicleSearch}
                  onChange={e => { setVehicleSearch(e.target.value); }}
                  placeholder="Or search by vehicle number / chassis…"
                  style={{ ...inp, fontSize:11 }}
                />
                {searchVehicles.length > 0 && (
                  <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:300,
                    background:C.surface, border:'1px solid var(--border2)',
                    borderRadius:4, boxShadow:'0 8px 24px rgba(0,0,0,.5)', overflow:'hidden' }}>
                    {searchVehicles.map(s => (
                      <div key={vehicleKey(s)}
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
                          borderBottom:'1px solid var(--border)', fontSize:12 }}
                        onMouseEnter={e => e.currentTarget.style.background=C.s2}
                        onMouseLeave={e => e.currentTarget.style.background='transparent'}
                      >
                        <strong>{s.vehicle_number || '(no reg. no.)'}</strong>
                        {' — '}{s.vehicle_brand} {s.vehicle_model}
                        <span style={{ fontSize:10, color:C.muted, marginLeft:8 }}>{s.customer_name}</span>
                        {s.chassis_number && (
                          <div style={{ fontSize:10, color:C.dim, marginTop:2, fontFamily:'var(--font-outlier)' }}>
                            Chassis: {s.chassis_number}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {vehicleSearch.length > 3 && searchVehicles.length === 0 && (
                  <div style={{ fontSize:10, color:C.muted, marginTop:4, fontStyle:'italic' }}>
                    No bike found matching “{vehicleSearch}”. Fill the vehicle details manually below.
                  </div>
                )}
              </div>
            </div>

            {/* Manual override fields */}
            {[
              ['vehicle_number','Vehicle Number *','KA 07 U 3915'],
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
            <div>
              <label style={labelSt}>Service Type *</label>
              <select value={form.service_type} onChange={upd('service_type')} style={inp}>
                <option>Repair / Walk-in</option>
                <option>1st Service</option>
                <option>2nd Service</option>
                <option>3rd Service</option>
                <option>4th Service</option>
                <option>5th Service</option>
                <option>6th+ Service</option>
              </select>
              {sched?.found && (
                <div style={{ fontSize:10, marginTop:5, lineHeight:1.5,
                  color: sched.days_until_due <= 15 ? C.gold : C.muted }}>
                  {sched.days_until_due <= 15
                    ? `${sched.next_service} due ${sched.next_due_date}` +
                      (sched.days_until_due < 0
                        ? ` — ${Math.abs(sched.days_until_due)}d overdue`
                        : ` — in ${sched.days_until_due}d`)
                    : `No service due until ${sched.next_due_date}`}
                  {sched.days_until_due <= 15 && form.service_type === 'Repair / Walk-in' && (
                    <button
                      onClick={() => setForm(p => ({ ...p, service_type: sched.next_service }))}
                      style={{ marginLeft:6, background:'none', border:'none', padding:0,
                        color:C.gold, fontSize:10, fontWeight:700, cursor:'pointer',
                        textDecoration:'underline' }}>
                      log as {sched.next_service}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={labelSt}>Complaint / Work Required *</label>
            <textarea value={form.complaint} onChange={upd('complaint')} rows={3}
              placeholder="Engine noise, routine service, brake issue…"
              style={{ ...inp, resize:'vertical', fontFamily:'inherit' }} />
            <ComplaintPicks value={form.complaint} onChange={v => setForm(p => ({ ...p, complaint: v }))} />
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={labelSt}>Notes</label>
            <input value={form.notes} onChange={upd('notes')} placeholder="Additional notes" style={inp} />
          </div>
        </div>
      )}
      <ModalFoot>
        <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        {step === 2 && (
          <button onClick={() => createMut.mutate()}
            disabled={createMut.isPending || !form.vehicle_number || !form.model || !form.complaint}
            className="btn btn-primary" style={{ opacity:createMut.isPending||!form.vehicle_number||!form.model||!form.complaint ? .5 : 1 }}>
            {createMut.isPending ? 'Creating…' : 'Create Job Card'}
          </button>
        )}
      </ModalFoot>
    </ModalShell>
  );
}
