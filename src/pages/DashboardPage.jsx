import { useQuery } from '@tanstack/react-query';
import { dashboardApi, salesApi, vehiclesApi, partsApi, serviceApi } from '../api/client';
import { Skeleton, ApiError } from '../components/ui';
import { useAuth } from '../context/AuthContext';

const ACTIVITY_PILL = {
  sale:    'pill-amber',
  service: 'pill-green',
  parts:   'pill-dim',
  alert:   'pill-red',
};

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (diff < 1)  return 'just now';
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff/60)}h ago`;
  return `${Math.floor(diff/1440)}d ago`;
}

function StatCard({ label, value, color='var(--accent)', sub, onClick }) {
  return (
    <div onClick={onClick} style={{ padding:'16px 22px', borderRight:'1px solid var(--border)', cursor:onClick?'pointer':'default' }}>
      <div className="label-xs">{label}</div>
      <div className="display fade-up" style={{ fontSize:28, color, marginTop:8, letterSpacing:'-.03em' }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:'var(--dim)', marginTop:3 }}>{sub}</div>}
    </div>
  );
}

function QuickAction({ label, desc, onClick }) {
  return (
    <button onClick={onClick} style={{
      background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:4,
      padding:'14px 16px', cursor:'pointer', textAlign:'left', width:'100%',
      fontFamily:'IBM Plex Sans,sans-serif', transition:'border-color .15s',
    }}
      onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'}
      onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}
    >
      <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{label}</div>
      <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{desc}</div>
    </button>
  );
}

function AlertBanner({ icon, message, color, onClick }) {
  return (
    <div onClick={onClick} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', background:`${color}08`, border:`1px solid ${color}25`, borderRadius:3, cursor:onClick?'pointer':'default' }}>
      <span style={{ fontSize:14 }}>{icon}</span>
      <span style={{ fontSize:11, color:'var(--text)' }}>{message}</span>
      {onClick && <span style={{ marginLeft:'auto', fontSize:10, color:'var(--dim)' }}>View →</span>}
    </div>
  );
}

export default function DashboardPage({ setActive }) {
  const { user } = useAuth();

  const { data:raw, isLoading:statsLoading, error:statsError } = useQuery({
    queryKey:['dashboard-stats'],
    queryFn: ()=>dashboardApi.stats().then(r=>r.data),
    refetchInterval: 60_000,
  });
  const { data:activity, isLoading:actLoading } = useQuery({
    queryKey:['dashboard-activity'],
    queryFn: ()=>dashboardApi.recentActivity().then(r=>r.data),
    refetchInterval: 30_000,
  });
  const { data:salStats } = useQuery({
    queryKey:['sales-stats'],
    queryFn: ()=>salesApi.stats().then(r=>r.data),
  });
  const { data:vehStats } = useQuery({
    queryKey:['vehicle-stats'],
    queryFn: ()=>vehiclesApi.stats().then(r=>r.data),
  });
  const { data:partsStats } = useQuery({
    queryKey:['parts-stats'],
    queryFn: ()=>partsApi.stats().then(r=>r.data),
  });

  // nested response: raw.revenue.today, raw.vehicles.in_stock, etc.
  const rev  = raw?.revenue   || {};
  const veh  = raw?.vehicles  || {};
  const svc  = raw?.service   || {};
  const pts  = raw?.parts     || {};
  const vs   = vehStats       || {};
  const ps   = partsStats     || {};
  const sal  = salStats       || {};

  const fmt = n => n >= 1_00_000 ? '₹'+(n/1_00_000).toFixed(1)+'L' : n >= 1000 ? '₹'+(n/1000).toFixed(0)+'K' : n!=null ? '₹'+n : '—';

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const alerts = [];
  if (pts.low_stock   > 0) alerts.push({ icon:'⚠', msg:`${pts.low_stock} parts below reorder level`,      color:'#f0c040', page:'parts' });
  if (pts.out_of_stock> 0) alerts.push({ icon:'🚫', msg:`${pts.out_of_stock} parts out of stock`,          color:'#f87171', page:'parts' });
  if (svc.ready       > 0) alerts.push({ icon:'✓', msg:`${svc.ready} vehicle${svc.ready>1?'s':''} ready for pickup`, color:'#4ade80', page:'service' });

  return (
    <div>
      {/* KPI bar */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', borderBottom:'1px solid var(--border)' }}>
        {statsLoading ? (
          Array.from({length:5}).map((_,i)=>(
            <div key={i} style={{ padding:'16px 22px', borderRight:'1px solid var(--border)' }}>
              <Skeleton h={10} w={60} style={{ marginBottom:8 }} />
              <Skeleton h={28} w={80} />
            </div>
          ))
        ) : statsError ? (
          <div style={{ gridColumn:'1/-1', padding:20 }}><ApiError error={statsError} /></div>
        ) : (
          <>
            <StatCard label="Today's revenue"     value={fmt(rev.today)}          color="var(--accent)" sub={`Month: ${fmt(rev.month)}`} />
            <StatCard label="Today's sales"       value={raw?.sales_today_count??'—'} color="var(--text)"   sub={`${sal.total_count||0} total`}          onClick={()=>setActive('sales')} />
            <StatCard label="Vehicles in stock"   value={veh.in_stock??'—'}       color="var(--green)"  sub={`${vs.sold||0} sold all time`}             onClick={()=>setActive('vehicles')} />
            <StatCard label="Active service jobs" value={svc.active_total??'—'}   color="var(--blue)"   sub={`${svc.ready||0} ready for pickup`}        onClick={()=>setActive('service')} />
            <StatCard label="Parts alerts"        value={(pts.low_stock||0)+(pts.out_of_stock||0)||'—'} color={(pts.low_stock>0||pts.out_of_stock>0)?'var(--red)':'var(--dim)'} sub="low + out of stock" onClick={()=>setActive('parts')} />
          </>
        )}
      </div>

      {/* Body */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 290px', minHeight:'calc(100vh - 120px)' }}>

        {/* Left panel */}
        <div style={{ borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column' }}>

          {/* Greeting */}
          <div style={{ padding:'28px 24px 20px', borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontFamily:'Syne,sans-serif', fontSize:26, letterSpacing:'-.03em', marginBottom:6 }}>
              {greeting}, {user?.name?.split(' ')[0]}.
            </div>
            <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.7 }}>
              {new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
              {' · '}MM Motors Management System
            </div>
          </div>

          {/* Alerts */}
          {alerts.length > 0 && (
            <div style={{ padding:'16px 24px', borderBottom:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:8 }}>
              <div className="label-xs" style={{ marginBottom:4 }}>Action needed</div>
              {alerts.map((a,i)=>(
                <AlertBanner key={i} icon={a.icon} message={a.msg} color={a.color} onClick={()=>setActive(a.page)} />
              ))}
            </div>
          )}

          {/* Quick actions */}
          <div style={{ padding:'16px 24px', borderBottom:'1px solid var(--border)' }}>
            <div className="label-xs" style={{ marginBottom:12 }}>Quick actions</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <QuickAction label="New sale"       desc="4-step invoice wizard"    onClick={()=>setActive('sales')} />
              <QuickAction label="New job card"   desc="Service intake form"      onClick={()=>setActive('service')} />
              <QuickAction label="Add vehicle"    desc="Stock a new vehicle"      onClick={()=>setActive('vehicles')} />
              <QuickAction label="Parts bill"     desc="Counter sale with GST"    onClick={()=>setActive('parts')} />
              <QuickAction label="Add customer"   desc="Register new customer"    onClick={()=>setActive('customers')} />
              <QuickAction label="Reports"        desc="Revenue & analytics"      onClick={()=>setActive('reports')} />
            </div>
          </div>

          {/* At a glance */}
          <div style={{ padding:'16px 24px' }}>
            <div className="label-xs" style={{ marginBottom:12 }}>At a glance</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
              {[
                { l:'Pending service',  v:svc.pending??'—',      c:'var(--muted)' },
                { l:'In progress',      v:svc.in_progress??'—',  c:'var(--accent)' },
                { l:'Ready to deliver', v:svc.ready??'—',        c:'var(--green)' },
                { l:'New vehicles',     v:vs.new??'—',            c:'var(--text)' },
                { l:'Pre-owned',        v:vs.used??'—',           c:'var(--blue)' },
                { l:'Total customers',  v:raw?.customers??'—',   c:'var(--text)' },
              ].map(stat=>(
                <div key={stat.l} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, padding:'12px 14px' }}>
                  <div style={{ fontSize:9, color:'var(--dim)', letterSpacing:'.07em', textTransform:'uppercase' }}>{stat.l}</div>
                  <div className="display" style={{ fontSize:22, color:stat.c, marginTop:6 }}>{stat.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right — activity feed */}
        <div style={{ display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
            <span className="label-xs">Activity log</span>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div className="dot dot-green pulse" style={{ width:5, height:5 }} />
              <span style={{ fontSize:9, color:'var(--dim)' }}>live</span>
            </div>
          </div>
          <div style={{ flex:1, overflowY:'auto' }}>
            {actLoading ? (
              Array.from({length:6}).map((_,i)=>(
                <div key={i} style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)' }}>
                  <Skeleton h={10} w="80%" style={{ marginBottom:6 }} />
                  <Skeleton h={9}  w="55%" />
                </div>
              ))
            ) : activity?.length ? (
              activity.map((item,i)=>(
                <div key={i} style={{ display:'flex', gap:10, padding:'10px 16px', borderBottom:'1px solid var(--border)', alignItems:'flex-start' }}>
                  <span className="mono" style={{ fontSize:9, color:'var(--dim)', marginTop:2, minWidth:44, flexShrink:0 }}>{timeAgo(item.time)}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:11, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.text}</div>
                    {item.sub && <div style={{ fontSize:10, color:'var(--muted)', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.sub}</div>}
                  </div>
                  <span className={`pill ${ACTIVITY_PILL[item.type]||'pill-dim'}`} style={{ flexShrink:0 }}>{item.type}</span>
                </div>
              ))
            ) : (
              <div style={{ padding:'32px 16px', fontSize:11, color:'var(--dim)', textAlign:'center', lineHeight:1.8 }}>
                No activity yet.<br/>
                <span style={{ fontSize:10 }}>Create a sale or service job to see activity here.</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
