import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceApi } from '../api/client';
import { useSortable } from '../components/ui';
import toast from 'react-hot-toast';

const U = {
  overdue:  { color:'#f87171', bg:'rgba(248,113,113,.1)',  border:'rgba(248,113,113,.25)',  label:'Overdue'   },
  due_soon: { color:'#fbbf24', bg:'rgba(251,191,36,.1)',   border:'rgba(251,191,36,.25)',   label:'Due Soon'  },
  ok:       { color:'#4ade80', bg:'rgba(74,222,128,.1)',   border:'rgba(74,222,128,.25)',   label:'OK'        },
};

// Badge colour per service number
const SERVICE_TYPE_COLOR = {
  '1st Service': { color:'#60a5fa', bg:'rgba(96,165,250,.12)', border:'rgba(96,165,250,.3)' },
  '2nd Service': { color:'#4ade80', bg:'rgba(74,222,128,.12)', border:'rgba(74,222,128,.3)' },
  '3rd Service': { color:'#fbbf24', bg:'rgba(251,191,36,.12)', border:'rgba(251,191,36,.3)' },
};
function serviceTypeBadge(type) {
  const s = SERVICE_TYPE_COLOR[type] || { color:'var(--muted)', bg:'var(--surface2)', border:'var(--border)' };
  return (
    <span style={{ fontSize:9, padding:'2px 7px', borderRadius:10, fontWeight:700,
      background:s.bg, color:s.color, border:`1px solid ${s.border}`,
      letterSpacing:'.04em', whiteSpace:'nowrap' }}>
      {type}
    </span>
  );
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
      `Your vehicle was delivered ${r.days_since} days ago. Visit us soon! 🏍`
    );
  }
  return encodeURIComponent(
    `Hi ${r.customer_name}, your ${veh} is due for its ${r.service_type} at MM Motors, Malur. ` +
    `Last serviced ${r.days_since} days ago. Call us or visit to book. 🏍`
  );
}

export default function ServiceDuePage() {
  const qc = useQueryClient();
  const [days,             setDays]            = useState(90);
  const [firstServiceDays, setFirstServiceDays] = useState(30);
  const [filter,           setFilter]          = useState('all');   // all | overdue | due_soon | first | repeat
  const [search,           setSearch]          = useState('');
  const [selected,         setSelected]        = useState(new Set());

  const { data: raw, isLoading } = useQuery({
    queryKey: ['service-due', days, firstServiceDays],
    queryFn: () => serviceApi.due(days, firstServiceDays).then(r => r.data),
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
      return true;
    })
    .filter(r => !search ||
      r.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.customer_mobile?.includes(search) ||
      r.vehicle_number?.toLowerCase().includes(search.toLowerCase()));

  const overdue   = (raw || []).filter(r => r.urgency === 'overdue').length;
  const due_soon  = (raw || []).filter(r => r.urgency === 'due_soon').length;
  const firstSvc  = (raw || []).filter(r => r.source === 'sale').length;

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

  const handleBulkWhatsApp = () => {
    const targets = list.filter(r => selected.has(r.vehicle_number) && r.customer_mobile);
    if (!targets.length) return toast.error('Select customers first');
    targets.forEach((r, i) => {
      setTimeout(() => {
        const mobile = (r.customer_mobile || '').replace(/\D/g, '');
        window.open(`https://wa.me/91${mobile}?text=${waMsg(r)}`, '_blank');
        notifyMut.mutate(r.vehicle_number);
      }, i * 800);
    });
    setSelected(new Set());
    toast.success(`Sending WhatsApp to ${targets.length} customers`);
  };

  const toggleSelect = (veh) => {
    setSelected(s => { const n = new Set(s); n.has(veh) ? n.delete(veh) : n.add(veh); return n; });
  };
  const toggleAll = () => {
    setSelected(s => s.size === sortedList.length ? new Set() : new Set(sortedList.map(r => r.vehicle_number)));
  };

  const { sorted: sortedList, Th: DueTh } = useSortable(list, 'due_in_days', 'asc');
  const inp = { padding:'8px 12px', border:'1px solid var(--border)', borderRadius:4, background:'var(--surface2)', color:'var(--text)', fontSize:12, fontFamily:'IBM Plex Sans,sans-serif', outline:'none' };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>

      {/* Stats bar */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        {[
          { l:'Total tracked',        v: raw?.length ?? '—',       c:'var(--text)'  },
          { l:'Overdue',              v: overdue,                   c:'#f87171'      },
          { l:'Due within 30 days',   v: due_soon,                  c:'#fbbf24'      },
          { l:'1st service pending',  v: firstSvc,                  c:'#60a5fa'      },
          { l:'Service interval',     v: `1st: 30d  |  2nd+: 90d`, c:'var(--muted)' },
        ].map((s,i) => (
          <div key={i} style={{ padding:'14px 20px', borderRight:i<4?'1px solid var(--border)':0 }}>
            <div style={{ fontSize:10, letterSpacing:'.07em', textTransform:'uppercase', color:'var(--muted)', fontWeight:600 }}>{s.l}</div>
            <div style={{ fontSize:22, fontWeight:800, color:s.c, marginTop:6, fontFamily:'display' }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 20px', borderBottom:'1px solid var(--border)', flexWrap:'wrap', flexShrink:0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search customer, mobile, vehicle…"
          style={{ ...inp, width:240 }} />

        {/* Filters */}
        <div style={{ display:'flex', gap:6 }}>
          {[['all','All'],['overdue','Overdue'],['due_soon','Due Soon'],['first','1st Service'],['repeat','Repeat']].map(([v,l]) => (
            <button key={v} onClick={() => setFilter(v)} style={{
              padding:'6px 12px', borderRadius:3, fontSize:10, cursor:'pointer',
              fontFamily:'IBM Plex Sans,sans-serif', letterSpacing:'.05em', textTransform:'uppercase',
              background: filter===v ? 'var(--surface2)' : 'transparent',
              border: `1px solid ${filter===v ? 'var(--accent)' : 'var(--border)'}`,
              color: filter===v ? 'var(--accent)' : 'var(--muted)',
            }}>{l}</button>
          ))}
        </div>

        {/* Interval selectors */}
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <span style={{ fontSize:10, color:'var(--muted)', letterSpacing:'.05em' }}>REPEAT:</span>
          <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ ...inp, width:150, padding:'6px 10px' }}>
            {[[30,'Monthly (30d)'],[60,'Bi-monthly (60d)'],[90,'Quarterly (90d)'],[180,'Half-yearly (180d)']].map(([v,l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <span style={{ fontSize:10, color:'var(--muted)', letterSpacing:'.05em' }}>1ST:</span>
          <select value={firstServiceDays} onChange={e => setFirstServiceDays(Number(e.target.value))} style={{ ...inp, width:110, padding:'6px 10px' }}>
            {[[15,'15 days'],[30,'30 days'],[45,'45 days'],[60,'60 days']].map(([v,l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {/* Bulk WhatsApp */}
        {selected.size > 0 && (
          <button onClick={handleBulkWhatsApp}
            style={{ padding:'8px 14px', background:'rgba(37,211,102,.12)', border:'1px solid rgba(37,211,102,.4)', borderRadius:4, color:'#25d366', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'IBM Plex Sans,sans-serif' }}>
            💬 WhatsApp {selected.size} selected
          </button>
        )}

        <span style={{ marginLeft:'auto', fontSize:11, color:'var(--muted)' }}>{list.length} vehicles</span>
      </div>

      {/* Table */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {isLoading ? (
          <div style={{ padding:24, color:'var(--muted)', fontSize:12 }}>Checking service history…</div>
        ) : list.length === 0 ? (
          <div style={{ padding:48, textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>All up to date!</div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>No vehicles overdue for service</div>
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                <th style={{ padding:'9px 16px', width:36 }}>
                  <input type="checkbox" checked={selected.size === list.length && list.length > 0}
                    onChange={toggleAll} style={{ accentColor:'var(--accent)', cursor:'pointer' }} />
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
                  <DueTh key={h} field={f||null} style={{ padding:'9px 16px', textAlign:'left', fontSize:9, letterSpacing:'.07em', color:'var(--dim)', fontWeight:600, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</DueTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedList.map(r => {
                const u = U[r.urgency] || U.ok;
                const lastNotified = notifMap?.[r.vehicle_number];
                const isSelected = selected.has(r.vehicle_number);
                return (
                  <tr key={r.vehicle_number}
                    style={{ borderBottom:'1px solid var(--border)', background: isSelected ? 'rgba(184,134,11,.04)' : 'transparent' }}
                    onMouseEnter={e => { if(!isSelected) e.currentTarget.style.background='var(--surface2)'; }}
                    onMouseLeave={e => { if(!isSelected) e.currentTarget.style.background='transparent'; }}>
                    <td style={{ padding:'10px 16px' }}>
                      <input type="checkbox" checked={isSelected}
                        onChange={() => toggleSelect(r.vehicle_number)}
                        style={{ accentColor:'var(--accent)', cursor:'pointer' }} />
                    </td>
                    <td style={{ padding:'10px 16px' }}>
                      <div style={{ fontSize:12, fontWeight:600 }}>{r.customer_name}</div>
                    </td>
                    <td style={{ padding:'10px 16px', fontSize:11, fontFamily:'monospace', color:'var(--muted)' }}>
                      {r.customer_mobile || '—'}
                    </td>
                    <td style={{ padding:'10px 16px' }}>
                      <div style={{ fontSize:12, fontWeight:500 }}>{r.brand} {r.model}</div>
                      <div className="mono" style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>{r.vehicle_number || '—'}</div>
                    </td>
                    {/* Next service type */}
                    <td style={{ padding:'10px 16px' }}>
                      {serviceTypeBadge(r.service_type)}
                      {r.source === 'sale' && (
                        <div style={{ fontSize:9, color:'var(--dim)', marginTop:3 }}>New vehicle</div>
                      )}
                    </td>
                    {/* Last service / delivery date */}
                    <td style={{ padding:'10px 16px' }}>
                      <div style={{ fontSize:12 }}>{r.check_in_date || '—'}</div>
                      <div style={{ fontSize:10, color:'var(--dim)', marginTop:1, maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {r.source === 'sale' ? 'Delivery date' : r.complaint || ''}
                      </div>
                    </td>
                    <td style={{ padding:'10px 16px', fontSize:14, fontWeight:800, color:u.color }}>
                      {daysLabel(r.days_since)}
                    </td>
                    {/* Next due date */}
                    <td style={{ padding:'10px 16px' }}>
                      <div style={{ fontSize:11, fontWeight:600, color: r.due_in_days < 0 ? '#f87171' : r.due_in_days <= 7 ? '#fbbf24' : 'var(--text)' }}>
                        {r.next_due_date || '—'}
                      </div>
                      {r.due_in_days != null && (
                        <div style={{ fontSize:9, color:'var(--dim)', marginTop:1 }}>
                          {r.due_in_days < 0 ? `${Math.abs(r.due_in_days)}d overdue` : r.due_in_days === 0 ? 'Due today' : `in ${r.due_in_days}d`}
                        </div>
                      )}
                    </td>
                    <td style={{ padding:'10px 16px' }}>
                      <span style={{ fontSize:9, padding:'3px 9px', borderRadius:3, fontWeight:700,
                        background:u.bg, color:u.color, border:`1px solid ${u.border}`,
                        textTransform:'uppercase', letterSpacing:'.05em' }}>
                        {u.label}
                      </span>
                    </td>
                    <td style={{ padding:'10px 16px', fontSize:10, color:'var(--dim)' }}>
                      {lastNotified ? (
                        <div>
                          <div style={{ color:'var(--muted)' }}>Notified</div>
                          <div>{lastNotified.slice(0,10)}</div>
                        </div>
                      ) : <span style={{ color:'var(--dim)' }}>—</span>}
                    </td>
                    <td style={{ padding:'10px 16px' }}>
                      <div style={{ display:'flex', gap:5 }}>
                        {r.customer_mobile && (
                          <>
                            <button onClick={() => handleWhatsApp(r)}
                              style={{ padding:'5px 10px', background:'rgba(37,211,102,.1)', border:'1px solid rgba(37,211,102,.3)', borderRadius:3, color:'#25d366', fontSize:10, cursor:'pointer', fontWeight:700, fontFamily:'IBM Plex Sans,sans-serif', whiteSpace:'nowrap' }}>
                              💬 WA
                            </button>
                            <button onClick={() => handleCall(r)}
                              style={{ padding:'5px 10px', background:'rgba(59,130,246,.1)', border:'1px solid rgba(59,130,246,.3)', borderRadius:3, color:'var(--blue)', fontSize:10, cursor:'pointer', fontWeight:700, fontFamily:'IBM Plex Sans,sans-serif' }}>
                              📞
                            </button>
                          </>
                        )}
                        {!r.customer_mobile && <span style={{ fontSize:10, color:'var(--dim)' }}>No mobile</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
