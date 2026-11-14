import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceApi } from '../api/client';
import { useSortable, Skeleton, Empty, ApiError } from '../components/ui';
import toast from 'react-hot-toast';

const U = {
  overdue:  { color:'var(--color-error)',   cls:'pill-red',   label:'Overdue'   },
  due_soon: { color:'var(--color-warn)',    cls:'pill-amber', label:'Due Soon'  },
  ok:       { color:'var(--color-success)', cls:'pill-green', label:'OK'        },
};

// Badge colour per service number
const SERVICE_TYPE_COLOR = {
  '1st Service': 'pill-blue',
  '2nd Service': 'pill-green',
  '3rd Service': 'pill-amber',
};
function serviceTypeBadge(type) {
  return <span className={`pill ${SERVICE_TYPE_COLOR[type] || 'pill-dim'}`}>{type}</span>;
}

function daysLabel(n) {
  if (n == null) return '—';
  if (n === 0) return 'Today';
  return `${n}d ago`;
}

function waMsg(r) {
  const veh = [r.brand, r.model, r.vehicle_number].filter(Boolean).join(' ');
  if (r.source === 'sale') {
    return encodeURIComponent(
      `Hi ${r.customer_name}, your ${veh} is due for its 1st service at MM Motors, Malur. ` +
      `Your vehicle was delivered ${r.days_since} days ago. Visit us soon! 🏍
` +
      `Book online: ${window.location.origin}/book`
    );
  }
  return encodeURIComponent(
    `Hi ${r.customer_name}, your ${veh} is due for its ${r.service_type} at MM Motors, Malur. ` +
    `Last serviced ${r.days_since} days ago. Call us or visit to book. 🏍
` +
    `Book online: ${window.location.origin}/book`
  );
}

export default function ServiceDuePage() {
  const qc = useQueryClient();
  // Look-ahead window: list vehicles whose next service falls within this many days.
  // The schedule itself is fixed on the server: 1st service 30 days after sale, then every 90.
  const [days,             setDays]            = useState(90);
  const [filter,           setFilter]          = useState('all');   // all | overdue | due_soon | first | repeat
  const [search,           setSearch]          = useState('');
  const [selected,         setSelected]        = useState(new Set());

  const { data: raw, isLoading, error } = useQuery({
    queryKey: ['service-due', days],
    queryFn: () => serviceApi.due(days).then(r => r.data),
    refetchInterval: 60_000,
  });
  const { data: notifMap } = useQuery({
    queryKey: ['service-notifications'],
    queryFn:  () => serviceApi.notifications().then(r => r.data),
  });

  const notifyMut = useMutation({
    mutationFn: veh => serviceApi.markNotified(veh),
    onSuccess:  () => { qc.invalidateQueries(['service-notifications']); },
    onError:    () => toast.error('Failed to mark notified'),
  });

  const list = (raw || [])
    .filter(r => {
      if (filter === 'overdue')  return r.urgency === 'overdue';
      if (filter === 'due_soon') return r.urgency === 'due_soon';
      if (filter === 'first')    return r.source === 'sale';
      if (filter === 'repeat')   return r.source === 'service';
      if (filter === 'workshop') return r.in_workshop;
      return true;
    })
    .filter(r => !search ||
      r.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.customer_mobile?.includes(search) ||
      r.vehicle_number?.toLowerCase().includes(search.toLowerCase()));

  const overdue   = (raw || []).filter(r => r.urgency === 'overdue').length;
  const due_soon  = (raw || []).filter(r => r.urgency === 'due_soon').length;
  const firstSvc  = (raw || []).filter(r => r.source === 'sale').length;
  const inShop    = (raw || []).filter(r => r.in_workshop).length;

  const handleWhatsApp = (r) => {
    const mobile = (r.customer_mobile || '').replace(/\D/g, '');
    if (!mobile) return toast.error('No mobile number');
    window.open(`https://wa.me/91${mobile}?text=${waMsg(r)}`, '_blank');
    notifyMut.mutate(r.vehicle_number);
  };

  const handleCall = (r) => {
    const mobile = (r.customer_mobile || '').replace(/\D/g, '');
    window.open(`tel:+91${mobile}`);
    notifyMut.mutate(r.vehicle_number);
  };

  // Browsers block every pop-up not opened by a click, so bulk send is a queue:
  // one click per customer opens that chat and marks only that customer notified.
  const [queue, setQueue] = useState([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const handleBulkWhatsApp = () => {
    const targets = list.filter(r => selected.has(r.vehicle_number) && r.customer_mobile);
    if (!targets.length) return toast.error('Select customers first');
    setQueue(targets); setQueueTotal(targets.length);
    setSelected(new Set());
  };
  const sendNext = () => {
    const [r, ...rest] = queue;
    handleWhatsApp(r);
    setQueue(rest);
    if (!rest.length) toast.success(`Done — ${queueTotal} reminders opened`);
  };

  const toggleSelect = (veh) => {
    setSelected(s => { const n = new Set(s); n.has(veh) ? n.delete(veh) : n.add(veh); return n; });
  };
  const toggleAll = () => {
    setSelected(s => s.size === sortedList.length ? new Set() : new Set(sortedList.map(r => r.vehicle_number)));
  };

  const { sorted: sortedList, Th: DueTh } = useSortable(list, 'due_in_days', 'asc');
  const [editRecord,   setEditRecord]   = useState(null);   // record being edited
  const [editForm,     setEditForm]     = useState({});

  const openEdit = (r) => {
    setEditForm({
      customer_name:   r.customer_name   || '',
      customer_mobile: r.customer_mobile || '',
      vehicle_number:  r.vehicle_number  || '',
      brand:           r.brand           || '',
      model:           r.model           || '',
      check_in_date:   r.check_in_date   || '',
    });
    setEditRecord(r);
  };

  const saveMut = useMutation({
    mutationFn: ({ id, payload }) => serviceApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries(['service-due']);
      toast.success('Record updated');
      setEditRecord(null);
    },
    onError: () => toast.error('Failed to update'),
  });

  const saveEdit = () => {
    if (!editRecord?.id) return toast.error('No service job to update');
    saveMut.mutate({ id: editRecord.id, payload: editForm });
  };


  const filtering = filter !== 'all' || !!search;

  return (
    <div className="due">

      {/* ── Edit modal ── */}
      {editRecord && (
        <div className="dialog-backdrop" onClick={() => setEditRecord(null)}>
          <div className="dialog dialog-wide due-edit" role="dialog" aria-modal="true" aria-labelledby="due-edit-title"
            onClick={e => e.stopPropagation()}>
            <h2 id="due-edit-title" className="dialog-title">Edit Record</h2>
            <p className="dialog-sub">
              <span className="mono">{editRecord.vehicle_number}</span>, {editRecord.source === 'sale' ? 'Sold vehicle' : 'Service-only'}
            </p>
            {!editRecord.id && (
              <div className="notice notice-error" role="alert">No service job linked. Only name/mobile can be edited via sales record.</div>
            )}
            <div className="form-grid due-edit-grid">
              {[
                ['Customer Name',   'customer_name',   'text'],
                ['Mobile',          'customer_mobile', 'tel'],
                ['Brand',           'brand',           'text'],
                ['Model',           'model',           'text'],
                ['Reg. Number',     'vehicle_number',  'text'],
                ['Last Service Date','check_in_date',  'text'],
              ].map(([label, key, type]) => (
                <div key={key} className="field">
                  <label className="field-label" htmlFor={`due-edit-${key}`}>{label}</label>
                  <input
                    id={`due-edit-${key}`}
                    type={type}
                    value={editForm[key] || ''}
                    onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="dialog-actions" style={{ padding:0, marginTop:'var(--space-lg)' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setEditRecord(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={saveEdit} disabled={saveMut.isPending}>
                {saveMut.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats bar */}
      <section className="stat-strip" aria-label="Service due figures">
        {[
          { l:'Total tracked',        v: raw?.length ?? '—' },
          { l:'Overdue',              v: overdue,  c: overdue  > 0 ? 'var(--color-error)' : undefined },
          { l:`Due within ${days} days`, v: due_soon, c: due_soon > 0 ? 'var(--color-warn)'  : undefined },
          { l:'1st service pending',  v: firstSvc },
          { l:'Service schedule',     v: '1st at 30 days, then every 90', small: true },
        ].map((s,i) => (
          <div key={i} className="stat">
            <span className="stat-label">{s.l}</span>
            <span className={`stat-value${s.small ? ' stat-value-s' : ''}`} style={s.c ? { color:s.c } : undefined}>{s.v}</span>
          </div>
        ))}
      </section>

      {/* Toolbar */}
      <div className="page-toolbar">
        <input type="search" className="page-search" aria-label="Search service due" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search customer, mobile, vehicle…" />

        {/* Filters */}
        <div className="chips" role="group" aria-label="Filter">
          {[['all','All'],['workshop',`In Workshop${inShop?` (${inShop})`:''}`],['overdue','Overdue'],['due_soon','Due Soon'],['first','1st Service'],['repeat','Repeat']].map(([v,l]) => (
            <button key={v} type="button" className="chip" aria-pressed={filter===v} onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>

        {/* Look-ahead window */}
        <div className="due-intervals">
          <label className="due-interval">
            <span>Show due within</span>
            <select value={days} onChange={e => setDays(Number(e.target.value))}>
              {[[30,'30 days'],[60,'60 days'],[90,'90 days'],[180,'180 days']].map(([v,l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Bulk WhatsApp */}
        {queue.length > 0 ? (
          <>
            <button type="button" className="btn btn-primary" onClick={sendNext}>
              Send {queueTotal - queue.length + 1} of {queueTotal}: {queue[0].customer_name || queue[0].vehicle_number}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setQueue([])}>Stop</button>
          </>
        ) : selected.size > 0 && (
          <button type="button" className="btn btn-primary" onClick={handleBulkWhatsApp}>
            WhatsApp {selected.size} selected
          </button>
        )}

        <span className="toolbar-count" role="status">{list.length} vehicles</span>
      </div>

      {/* Table */}
      <div className="due-scroll">
        {isLoading ? (
          <div className="table-skeleton" aria-label="Checking service history…">{[1,2,3,4].map(i=><Skeleton key={i} h={48}/>)}</div>
        ) : error ? (
          <div style={{ padding:'var(--space-lg)' }}><ApiError error={error} /></div>
        ) : list.length === 0 ? (
          filtering
            ? <Empty message="No vehicles match" sub="Clear the search or pick All to see every tracked vehicle." />
            : <Empty message="All up to date!" sub="No vehicles overdue for service" />
        ) : (
          <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width:36 }}>
                  <input type="checkbox" aria-label="Select all" checked={selected.size === list.length && list.length > 0}
                    onChange={toggleAll} />
                </th>
                {[
                  ['Customer',     'customer_name'],
                  ['Mobile',       'customer_mobile'],
                  ['Vehicle',      'brand'],
                  ['Next Service', 'service_type'],
                  ['Last Date',    'check_in_date'],
                  ['Days Since',   'days_since'],
                  ['Next Due',     'next_due_date'],
                  ['Status',       'urgency'],
                  ['Last Notified',''],
                  ['Actions',      ''],
                ].map(([h, f]) => (
                  <DueTh key={h} field={f||null}>{h}</DueTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedList.map(r => {
                const u = U[r.urgency] || U.ok;
                const lastNotified = notifMap?.[r.vehicle_number];
                const isSelected = selected.has(r.vehicle_number);
                return (
                  <tr key={r.vehicle_number} className={isSelected ? 'is-selected' : undefined}>
                    <td>
                      <input type="checkbox" checked={isSelected}
                        aria-label={`Select ${r.customer_name || r.vehicle_number}`}
                        onChange={() => toggleSelect(r.vehicle_number)} />
                    </td>
                    <td className="cell-strong">{r.customer_name}</td>
                    <td className="mono cell-muted cell-nowrap">
                      {r.customer_mobile || '—'}
                    </td>
                    <td>
                      <div className="cell-strong">{r.brand} {r.model}</div>
                      <div className="mono cell-sub">{r.vehicle_number || '—'}</div>
                      {r.in_workshop && (
                        <div className="due-workshop"
                          title={`In for a repair${r.workshop_job_number ? `, ${r.workshop_job_number}` : ''}. Service is due, offer it now.`}>
                          <span className="pill pill-amber">In workshop</span>
                          {r.workshop_job_number && <span className="mono cell-sub">{r.workshop_job_number}</span>}
                        </div>
                      )}
                    </td>
                    {/* Next service type */}
                    <td>
                      {serviceTypeBadge(r.service_type)}
                      {r.source === 'sale' && (
                        <div className="cell-sub">New vehicle</div>
                      )}
                    </td>
                    {/* Last service / delivery date */}
                    <td>
                      <div className="cell-nowrap">{r.check_in_date || '—'}</div>
                      <div className="cell-sub cell-clip" style={{ maxWidth:160 }}>
                        {r.source === 'sale' ? 'Delivery date' : r.complaint || ''}
                      </div>
                    </td>
                    <td className="num due-days" style={{ color:u.color }}>
                      {daysLabel(r.days_since)}
                    </td>
                    {/* Next due date */}
                    <td>
                      <div className="cell-nowrap" style={{ fontWeight:600, color: r.due_in_days < 0 ? 'var(--color-error)' : r.due_in_days <= 7 ? 'var(--color-warn)' : 'var(--color-ink)' }}>
                        {r.next_due_date || '—'}
                      </div>
                      {r.due_in_days != null && (
                        <div className="cell-sub">
                          {r.due_in_days < 0 ? `${Math.abs(r.due_in_days)}d overdue` : r.due_in_days === 0 ? 'Due today' : `in ${r.due_in_days}d`}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`pill ${u.cls}`}>{u.label}</span>
                    </td>
                    <td className="cell-muted">
                      {lastNotified ? (
                        <div>
                          <div className="cell-sub" style={{ marginTop:0 }}>Notified</div>
                          <div className="cell-nowrap">{lastNotified.slice(0,10)}</div>
                        </div>
                      ) : <span>Not yet</span>}
                    </td>
                    <td>
                      <div className="row-actions" style={{ flexWrap:'nowrap', minWidth:0 }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>
                          Edit
                        </button>
                        {r.customer_mobile && (
                          <>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleWhatsApp(r)}>
                              WhatsApp
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleCall(r)}>
                              Call
                            </button>
                          </>
                        )}
                        {!r.customer_mobile && <span className="cell-sub">No mobile</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
