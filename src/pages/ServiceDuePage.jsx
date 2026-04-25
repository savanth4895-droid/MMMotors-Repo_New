import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceApi } from '../api/client';
import toast from 'react-hot-toast';

const U = {
  overdue:  { color:'#f87171', bg:'rgba(248,113,113,.1)',  border:'rgba(248,113,113,.25)',  label:'Overdue'   },
  due_soon: { color:'#fbbf24', bg:'rgba(251,191,36,.1)',   border:'rgba(251,191,36,.25)',   label:'Due Soon'  },
  ok:       { color:'#4ade80', bg:'rgba(74,222,128,.1)',   border:'rgba(74,222,128,.25)',   label:'OK'        },
};

function daysLabel(n) {
  if (n == null) return '—';
  if (n === 0) return 'Today';
  return `${n}d ago`;
}

function waMsg(r) {
  const veh = [r.brand, r.model, r.vehicle_number].filter(Boolean).join(' ');
  return encodeURIComponent(
    `Hi ${r.customer_name}, your ${veh} is due for service at MM Motors, Malur. ` +
    `Last serviced ${r.days_since} days ago. Call us or visit to book your appointment. 🏍`
  );
}

export default function ServiceDuePage() {
  const qc = useQueryClient();
  const [days,    setDays]    = useState(90);
  const [filter,  setFilter]  = useState('all');   // all | overdue | due_soon
  const [search,  setSearch]  = useState('');
  const [selected, setSelected] = useState(new Set());

  const { data: raw, isLoading } = useQuery({
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
    .filter(r => filter === 'all' || r.urgency === filter)
    .filter(r => !search || r.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.customer_mobile?.includes(search) || r.vehicle_number?.toLowerCase().includes(search.toLowerCase()));

  const overdue  = (raw || []).filter(r => r.urgency === 'overdue').length;
  const due_soon = (raw || []).filter(r => r.urgency === 'due_soon').length;

  const handleWhatsApp = (r) => {
    window.open(`https://wa.me/91${r.customer_mobile}?text=${waMsg(r)}`, '_blank');
    notifyMut.mutate(r.vehicle_number);
  };

  const handleCall = (r) => {
    window.open(`tel:${r.customer_mobile}`);
    notifyMut.mutate(r.vehicle_number);
  };

  const handleBulkWhatsApp = () => {
    const targets = list.filter(r => selected.has(r.vehicle_number) && r.customer_mobile);
    if (!targets.length) return toast.error('Select customers first');
    targets.forEach((r, i) => {
      setTimeout(() => {
        window.open(`https://wa.me/91${r.customer_mobile}?text=${waMsg(r)}`, '_blank');
        notifyMut.mutate(r.vehicle_number);
      }, i * 800);
    });
    setSelected(new Set());
    toast.success(`Sending WhatsApp to ${targets.length} customers`);
  };

  const toggleSelect = (veh) => {
    setSelected(s => {
      const n = new Set(s);
      n.has(veh) ? n.delete(veh) : n.add(veh);
      return n;
    });
  };

  const toggleAll = () => {
    setSelected(s => s.size === list.length ? new Set() : new Set(list.map(r => r.vehicle_number)));
  };

  const inp = { padding:'8px 12px', border:'1px solid var(--border)', borderRadius:4, background:'var(--surface2)', color:'var(--text)', fontSize:12, fontFamily:'IBM Plex Sans,sans-serif', outline:'none' };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>

      {/* Stats bar */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        {[
          { l:'Total vehicles tracked', v: raw?.length ?? '—',  c:'var(--text)'   },
          { l:'Overdue',                v: overdue,              c:'#f87171'       },
          { l:'Due within 30 days',     v: due_soon,             c:'#fbbf24'       },
          { l:'Service interval',       v: `${days} days`,       c:'var(--muted)'  },
        ].map((s,i) => (
          <div key={i} style={{ padding:'14px 20px', borderRight:i<3?'1px solid var(--border)':0 }}>
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

        {/* Urgency filter */}
        <div style={{ display:'flex', gap:6 }}>
          {[['all','All'],['overdue','Overdue'],['due_soon','Due Soon']].map(([v,l]) => (
            <button key={v} onClick={() => setFilter(v)} style={{
              padding:'6px 12px', borderRadius:3, fontSize:10, cursor:'pointer',
              fontFamily:'IBM Plex Sans,sans-serif', letterSpacing:'.05em', textTransform:'uppercase',
              background: filter===v ? 'var(--surface2)' : 'transparent',
              border: `1px solid ${filter===v ? 'var(--accent)' : 'var(--border)'}`,
              color: filter===v ? 'var(--accent)' : 'var(--muted)',
            }}>{l}</button>
          ))}
        </div>

        {/* Service interval selector */}
        <select value={days} onChange={e => setDays(Number(e.target.value))}
          style={{ ...inp, width:160 }}>
          {[[30,'Monthly (30d)'],[60,'Bi-monthly (60d)'],[90,'Quarterly (90d)'],[180,'Half-yearly (180d)']].map(([v,l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        {/* Bulk WhatsApp */}
        {selected.size > 0 && (
          <button onClick={handleBulkWhatsApp}
            style={{ padding:'8px 14px', background:'rgba(37,211,102,.12)', border:'1px solid rgba(37,211,102,.4)', borderRadius:4, color:'#25d366', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'IBM Plex Sans,sans-serif' }}>
            💬 WhatsApp {selected.size} selected
          </button>
        )}

        <span style={{ marginLeft:'auto', fontSize:11, color:'var(--muted)' }}>
          {list.length} vehicles
        </span>
      </div>

      {/* Table */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {isLoading ? (
          <div style={{ padding:24, color:'var(--muted)', fontSize:12 }}>Checking service history…</div>
        ) : list.length === 0 ? (
          <div style={{ padding:48, textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>All up to date!</div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>No vehicles overdue for service in the last {days} days</div>
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                <th style={{ padding:'9px 16px', width:36 }}>
                  <input type="checkbox" checked={selected.size === list.length && list.length > 0}
                    onChange={toggleAll} style={{ accentColor:'var(--accent)', cursor:'pointer' }} />
                </th>
                {['Customer','Mobile','Vehicle','Last Service','Days Since','Status','Last Notified','Actions'].map(h => (
                  <th key={h} style={{ padding:'9px 16px', textAlign:'left', fontSize:9, letterSpacing:'.07em', color:'var(--dim)', fontWeight:600, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(r => {
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
                    <td style={{ padding:'10px 16px' }}>
                      <div style={{ fontSize:12 }}>{r.check_in_date || '—'}</div>
                      <div style={{ fontSize:10, color:'var(--dim)', marginTop:1, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.complaint}</div>
                    </td>
                    <td style={{ padding:'10px 16px', fontSize:14, fontWeight:800, color:u.color }}>
                      {daysLabel(r.days_since)}
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
                              💬 WhatsApp
                            </button>
                            <button onClick={() => handleCall(r)}
                              style={{ padding:'5px 10px', background:'rgba(59,130,246,.1)', border:'1px solid rgba(59,130,246,.3)', borderRadius:3, color:'var(--blue)', fontSize:10, cursor:'pointer', fontWeight:700, fontFamily:'IBM Plex Sans,sans-serif' }}>
                              📞 Call
                            </button>
                          </>
                        )}
                        {!r.customer_mobile && (
                          <span style={{ fontSize:10, color:'var(--dim)' }}>No mobile</span>
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
    </div>
  );
}
