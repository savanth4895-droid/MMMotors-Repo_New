import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie,
} from 'recharts';
import { reportsApi, dashboardApi, vehiclesApi, partsApi, serviceApi, salesApi } from '../api/client';
import { Skeleton, ApiError } from '../components/ui';

// ── Palette ──────────────────────────────────────────────────────────
const COLORS = ['#c8940a','#4ade80','#60a5fa','#fb923c','#a78bfa','#f9a8d4','#34d399','#f87171'];

const tooltipStyle = {
  contentStyle: { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, fontSize:11, fontFamily:'IBM Plex Sans,sans-serif' },
  labelStyle:   { color:'var(--muted)', fontSize:10 },
  itemStyle:    { color:'var(--text)' },
};

const axisStyle = { fontSize:10, fill:'var(--dim)', fontFamily:'IBM Plex Mono,monospace' };

// ── Section wrapper ──────────────────────────────────────────────────
function Section({ title, sub, children, loading, error, action }) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:6, overflow:'hidden' }}>
      <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
        <div>
          <div style={{ fontSize:13, fontWeight:600, letterSpacing:'-.01em' }}>{title}</div>
          {sub && <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{sub}</div>}
        </div>
        {action && <div>{action}</div>}
      </div>
      <div style={{ padding:'20px' }}>
        {loading ? <Skeleton h={220} /> : error ? <ApiError error={error} /> : children}
      </div>
    </div>
  );
}

// ── Stat pill ────────────────────────────────────────────────────────
function StatPill({ label, value, color = 'var(--accent)', sub }) {
  return (
    <div style={{ padding:'16px 20px', borderRight:'1px solid var(--border)' }}>
      <div className="label-xs">{label}</div>
      <div className="display" style={{ fontSize:26, color, marginTop:8, letterSpacing:'-.03em' }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:'var(--dim)', marginTop:3 }}>{sub}</div>}
    </div>
  );
}

// ── Custom tooltip for revenue chart ────────────────────────────────
function RevenueTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, padding:'10px 14px', fontSize:11 }}>
      <div style={{ color:'var(--muted)', marginBottom:6, fontSize:10 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ display:'flex', justifyContent:'space-between', gap:16, color:p.color, marginBottom:2 }}>
          <span style={{ textTransform:'capitalize' }}>{p.name}</span>
          <span className="mono">₹{Math.round(p.value).toLocaleString('en-IN')}</span>
        </div>
      ))}
      <div style={{ borderTop:'1px solid var(--border)', marginTop:6, paddingTop:6, display:'flex', justifyContent:'space-between', fontWeight:600 }}>
        <span>Total</span>
        <span className="mono">₹{Math.round(payload.reduce((s,p)=>s+p.value,0)).toLocaleString('en-IN')}</span>
      </div>
    </div>
  );
}

// ── NEW: Daily Closing Component ────────────────────────────────────
function DailyClosingSection() {
  const [date, setDate] = useState(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));

  const { data, isLoading, error } = useQuery({
    queryKey: ['dailyClosing', date],
    queryFn: () => reportsApi.dailyClosing(date).then(r => r.data)
  });

  const dateInput = (
    <input
      type="text"
      placeholder="DD Mon YYYY"
      defaultValue={date}
      onBlur={(e) => setDate(e.target.value)}
      style={{
        padding: '4px 8px', fontSize: 11, background: 'var(--surface2)',
        border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)',
        fontFamily: 'IBM Plex Sans,sans-serif', width: 100, textAlign: 'right'
      }}
    />
  );

  return (
    <Section
      title="Daily Closing Report"
      sub="Cash, UPI, and Bank transfer tally for the day"
      loading={isLoading}
      error={error}
      action={dateInput}
    >
      {!data?.breakdown?.length ? (
        <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 12 }}>
          No transactions recorded for {data?.date || date}.
        </div>
      ) : (
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              <th style={{ paddingBottom: 8, fontWeight: 500 }}>Payment Mode</th>
              <th style={{ paddingBottom: 8, fontWeight: 500 }}>Vehicles</th>
              <th style={{ paddingBottom: 8, fontWeight: 500 }}>Service</th>
              <th style={{ paddingBottom: 8, fontWeight: 500 }}>Parts</th>
              <th style={{ paddingBottom: 8, fontWeight: 500 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.breakdown.map((row) => (
              <tr key={row.payment_mode} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ fontWeight: 600, padding: '12px 0' }}>{row.payment_mode}</td>
                <td className="mono" style={{ color: 'var(--muted)' }}>₹{row.Vehicles.toLocaleString('en-IN')}</td>
                <td className="mono" style={{ color: 'var(--muted)' }}>₹{row.Service.toLocaleString('en-IN')}</td>
                <td className="mono" style={{ color: 'var(--muted)' }}>₹{row.Parts.toLocaleString('en-IN')}</td>
                <td className="display" style={{ color: 'var(--accent)', fontSize: 14 }}>₹{row.total.toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} style={{ textAlign: 'right', padding: '16px 16px 0 0', fontWeight: 600, color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>Grand Total</td>
              <td className="display" style={{ padding: '16px 0 0 0', fontSize: 18, color: 'var(--text)' }}>₹{data.grand_total.toLocaleString('en-IN')}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </Section>
  );
}


// ── Main page ────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [months, setMonths] = useState(6);

  // Data fetches
  const { data:revenue, isLoading:revLoading, error:revError } = useQuery({
    queryKey:['reports-revenue', months],
    queryFn: ()=>reportsApi.revenue({ months }).then(r=>r.data),
  });
  const { data:brandData, isLoading:brandLoading, error:brandError } = useQuery({
    queryKey:['reports-brand'],
    queryFn: ()=>reportsApi.brandSales().then(r=>r.data),
  });
  const { data:topParts, isLoading:partsLoading, error:partsError } = useQuery({
    queryKey:['reports-top-parts'],
    queryFn: ()=>reportsApi.topParts({ limit:10 }).then(r=>r.data),
  });
  const { data:dashStats } = useQuery({
    queryKey:['dashboard-stats'],
    queryFn: ()=>dashboardApi.stats().then(r=>r.data),
  });
  const { data:vehStats } = useQuery({
    queryKey:['vehicle-stats'],
    queryFn: ()=>vehiclesApi.stats().then(r=>r.data),
  });
  const { data:partsStats } = useQuery({
    queryKey:['parts-stats'],
    queryFn: ()=>partsApi.stats().then(r=>r.data),
  });
  const { data:svcStats } = useQuery({
    queryKey:['service-stats'],
    queryFn: ()=>serviceApi.stats().then(r=>r.data),
  });
  const { data:salesStats } = useQuery({
    queryKey:['sales-stats'],
    queryFn: ()=>salesApi.stats().then(r=>r.data),
  });

  // Build merged monthly revenue data
  const monthlyData = (() => {
    if (!revenue) return [];
    const map = {};
    (revenue.sales||[]).forEach(d => { map[d._id] = { ...map[d._id], month:d._id, sales: d.sales||0 }; });
    (revenue.service||[]).forEach(d => { map[d._id] = { ...map[d._id], month:d._id, service: d.service||0 }; });
    (revenue.parts||[]).forEach(d  => { map[d._id] = { ...map[d._id], month:d._id, parts: d.parts||0 }; });
    return Object.values(map)
      .sort((a,b)=>a.month.localeCompare(b.month))
      .map(d => ({
        month: d.month?.slice(0,7) || '',
        sales:   Math.round(d.sales   || 0),
        service: Math.round(d.service || 0),
        parts:   Math.round(d.parts   || 0),
        total:   Math.round((d.sales||0)+(d.service||0)+(d.parts||0)),
      }));
  })();

  const totalRevenue = monthlyData.reduce((s,d)=>s+d.total,0);
  const ds  = dashStats  || {};
  const vs  = vehStats   || {};
  const ps  = partsStats || {};
  const ss  = svcStats   || {};
  const sal = salesStats || {};

  const fmt = n => n >= 1_00_000 ? '₹'+(n/1_00_000).toFixed(1)+'L' : n >= 1000 ? '₹'+(n/1000).toFixed(0)+'K' : n!=null ? '₹'+n : '—';

  return (
    <div style={{ padding:24, display:'flex', flexDirection:'column', gap:20 }}>

      {/* KPI bar */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:6, display:'grid', gridTemplateColumns:'repeat(5,1fr)', overflow:'hidden' }}>
        <StatPill label="Total revenue"     value={fmt(sal.total_revenue)}     color="var(--accent)" sub={`${sal.total_count||0} invoices`} />
        <StatPill label="Vehicles in stock" value={vs.in_stock??'—'}           color="var(--green)"  sub={`${vs.sold||0} sold`} />
        <StatPill label="Active service"    value={ss.total_active??'—'}       color="var(--blue)"   sub={`${ss.delivered||0} delivered`} />
        <StatPill label="Parts SKUs"        value={ps.total_skus??'—'}         color="var(--text)"   sub={`${ps.low_stock||0} low stock`} />
        <StatPill label="Stock value"       value={fmt(ps.stock_value)}        color="var(--blue)"   sub="parts inventory" />
      </div>

      {/* NEW: Daily Closing inserted right here! */}
      <DailyClosingSection />

      {/* Revenue chart */}
      <Section
        title="Monthly revenue breakdown"
        sub="Sales + Service + Parts — combined"
        loading={revLoading}
        error={revError}
      >
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
          {[3,6,12].map(m => (
            <button key={m} onClick={()=>setMonths(m)} style={{
              padding:'5px 12px', background:months===m?'var(--surface2)':'transparent',
              border:`1px solid ${months===m?'var(--accent)':'var(--border)'}`,
              borderRadius:3, color:months===m?'var(--accent)':'var(--muted)',
              cursor:'pointer', fontSize:10, letterSpacing:'.06em', fontFamily:'IBM Plex Sans,sans-serif',
            }}>{m}M</button>
          ))}
          <span style={{ marginLeft:'auto', fontSize:11, color:'var(--muted)' }}>
            Period total: <span className="display" style={{ fontSize:16, color:'var(--accent)' }}>{fmt(totalRevenue)}</span>
          </span>
        </div>
        {monthlyData.length === 0 ? (
          <div style={{ height:220, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--dim)', fontSize:12 }}>
            No revenue data yet — create some sales, service bills, or parts bills
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData} barSize={18} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={v=>'₹'+(v/1000).toFixed(0)+'K'} width={52} />
              <Tooltip content={<RevenueTooltip />} cursor={{ fill:'rgba(200,148,10,.06)' }} />
              <Bar dataKey="sales"   fill="#c8940a" radius={[2,2,0,0]} name="sales" />
              <Bar dataKey="service" fill="#4ade80" radius={[2,2,0,0]} name="service" />
              <Bar dataKey="parts"   fill="#60a5fa" radius={[2,2,0,0]} name="parts" />
            </BarChart>
          </ResponsiveContainer>
        )}
        <div style={{ display:'flex', gap:16, marginTop:12 }}>
          {[['#c8940a','Sales'],['#4ade80','Service'],['#60a5fa','Parts']].map(([c,l])=>(
            <div key={l} style={{ display:'flex', alignItems:'center', gap:6, fontSize:10, color:'var(--muted)' }}>
              <div style={{ width:10, height:10, background:c, borderRadius:2 }} />{l}
            </div>
          ))}
        </div>
      </Section>

      {/* Brand sales + Top parts side by side */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

        {/* Brand sales */}
        <Section title="Sales by brand" sub="Units sold and revenue" loading={brandLoading} error={brandError}>
          {!brandData?.length ? (
            <div style={{ height:220, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--dim)', fontSize:12 }}>No sales data yet</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={brandData} layout="vertical" barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={v=>v+'u'} />
                  <YAxis type="category" dataKey="brand" tick={axisStyle} axisLine={false} tickLine={false} width={80} />
                  <Tooltip {...tooltipStyle} formatter={(v,n)=>n==='units'?[v+' units',n]:['₹'+v.toLocaleString('en-IN'),n]} />
                  <Bar dataKey="units" radius={[0,2,2,0]} name="units">
                    {brandData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {/* table below chart */}
              <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:4 }}>
                {brandData.slice(0,6).map((b,i)=>(
                  <div key={b.brand} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ width:8, height:8, background:COLORS[i%COLORS.length], borderRadius:2, flexShrink:0 }} />
                    <span style={{ fontSize:11, flex:1, fontWeight:500 }}>{b.brand||'Unknown'}</span>
                    <span className="mono" style={{ fontSize:10, color:'var(--muted)' }}>{b.units} units</span>
                    <span className="display" style={{ fontSize:12, color:'var(--accent)' }}>₹{Math.round(b.revenue/1000)}K</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Section>

        {/* Top parts */}
        <Section title="Top-selling parts" sub="By quantity sold" loading={partsLoading} error={partsError}>
          {!topParts?.length ? (
            <div style={{ height:220, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--dim)', fontSize:12 }}>No parts sales yet</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              {topParts.map((p,i)=>{
                const maxQty = topParts[0]?.qty_sold || 1;
                const pct    = Math.round((p.qty_sold/maxQty)*100);
                return (
                  <div key={p.name} style={{ padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span className="mono" style={{ fontSize:10, color:'var(--dim)', minWidth:18 }}>#{i+1}</span>
                        <span style={{ fontSize:11, fontWeight:500 }}>{p.name}</span>
                      </div>
                      <div style={{ display:'flex', gap:12 }}>
                        <span style={{ fontSize:10, color:'var(--muted)' }}>{p.qty_sold} units</span>
                        <span className="display" style={{ fontSize:12, color:'var(--accent)' }}>₹{Math.round(p.revenue||0).toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                    <div style={{ height:3, background:'var(--surface2)', borderRadius:2 }}>
                      <div style={{ height:3, width:`${pct}%`, background:COLORS[i%COLORS.length], borderRadius:2, transition:'width .4s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>

      {/* Service summary + Vehicle stock breakdown */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

        {/* Service jobs summary */}
        <Section title="Service jobs summary" sub="Current status distribution">
          {!ss.pending && !ss.in_progress && !ss.ready && !ss.delivered ? (
            <div style={{ height:160, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--dim)', fontSize:12 }}>No service data</div>
          ) : (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:16 }}>
                {[
                  { l:'Pending',     v:ss.pending,     c:'#6b6b78' },
                  { l:'In progress', v:ss.in_progress, c:'#f0c040' },
                  { l:'Ready',       v:ss.ready,       c:'#4ade80' },
                  { l:'Delivered',   v:ss.delivered,   c:'#3a3a44' },
                ].map(s=>(
                  <div key={s.l} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:4, padding:'12px 16px' }}>
                    <div style={{ fontSize:9, color:'var(--dim)', letterSpacing:'.07em', textTransform:'uppercase' }}>{s.l}</div>
                    <div className="display" style={{ fontSize:28, color:s.c, marginTop:6 }}>{s.v??'—'}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <div style={{ flex:1, height:6, background:'var(--surface2)', borderRadius:3, overflow:'hidden', display:'flex' }}>
                  {[
                    { v:ss.pending,     c:'#6b6b78' },
                    { v:ss.in_progress, c:'#f0c040' },
                    { v:ss.ready,       c:'#4ade80' },
                    { v:ss.delivered,   c:'#3a3a44' },
                  ].map((s,i)=>{
                    const total = (ss.pending||0)+(ss.in_progress||0)+(ss.ready||0)+(ss.delivered||0);
                    const pct   = total ? Math.round((s.v||0)/total*100) : 0;
                    return <div key={i} style={{ width:`${pct}%`, background:s.c }} />;
                  })}
                </div>
                <span style={{ fontSize:10, color:'var(--muted)' }}>
                  {(ss.pending||0)+(ss.in_progress||0)+(ss.ready||0)+(ss.delivered||0)} total jobs
                </span>
              </div>
            </>
          )}
        </Section>

        {/* Vehicle stock breakdown */}
        <Section title="Vehicle stock breakdown" sub="New vs pre-owned, status">
          {!vs.in_stock && !vs.sold ? (
            <div style={{ height:160, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--dim)', fontSize:12 }}>No vehicle data</div>
          ) : (
            <div style={{ display:'flex', gap:20, alignItems:'center' }}>
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie
                    data={[
                      { name:'In stock',   value:vs.in_stock  ||0 },
                      { name:'In service', value:vs.in_service||0 },
                      { name:'Sold',       value:vs.sold      ||0 },
                    ].filter(d=>d.value>0)}
                    cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                    paddingAngle={3} dataKey="value"
                  >
                    {['#4ade80','#f0c040','#6b6b78'].map((c,i)=><Cell key={i} fill={c} />)}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:10 }}>
                {[
                  { l:'In stock',   v:vs.in_stock,   c:'#4ade80' },
                  { l:'New',        v:vs.new,         c:'var(--accent)' },
                  { l:'Pre-owned',  v:vs.used,        c:'var(--blue)' },
                  { l:'In service', v:vs.in_service, c:'#f0c040' },
                  { l:'Sold',       v:vs.sold,        c:'#6b6b78' },
                ].map(s=>(
                  <div key={s.l} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:8, height:8, background:s.c, borderRadius:2 }} />
                      <span style={{ fontSize:11 }}>{s.l}</span>
                    </div>
                    <span className="display" style={{ fontSize:16, color:s.c }}>{s.v??'—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* Parts inventory health */}
      <Section title="Parts inventory health" sub="Stock value vs selling value, alert summary">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
          {[
            { l:'Total SKUs',    v:ps.total_skus??'—',   c:'var(--text)',   sub:'unique parts' },
            { l:'Low stock',     v:ps.low_stock??'—',    c:'#fbbf24',       sub:'below reorder level', alert:ps.low_stock>0 },
            { l:'Out of stock',  v:ps.out_of_stock??'—', c:'var(--red)',    sub:'zero units', alert:ps.out_of_stock>0 },
            { l:'Stock value',   v:fmt(ps.stock_value),  c:'var(--blue)',   sub:'at purchase price' },
          ].map(s=>(
            <div key={s.l} style={{ background:s.alert?'rgba(251,191,36,.06)':'var(--surface2)', border:`1px solid ${s.alert?'rgba(251,191,36,.2)':'var(--border)'}`, borderRadius:4, padding:'14px 16px' }}>
              <div style={{ fontSize:9, color:'var(--dim)', letterSpacing:'.07em', textTransform:'uppercase' }}>{s.l}</div>
              <div className="display" style={{ fontSize:26, color:s.c, marginTop:8 }}>{s.v}</div>
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{s.sub}</div>
            </div>
          ))}
        </div>
        {(ps.low_stock>0||ps.out_of_stock>0) && (
          <div style={{ marginTop:14, padding:'10px 14px', background:'rgba(251,191,36,.06)', border:'1px solid rgba(251,191,36,.2)', borderRadius:3, fontSize:12, display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:6, height:6, background:'#fbbf24', borderRadius:'50%', flexShrink:0 }} />
            <span>
              {ps.low_stock>0&&<><strong style={{ color:'#fbbf24' }}>{ps.low_stock} parts</strong><span style={{ color:'var(--muted)' }}> need reordering</span></>}
              {ps.out_of_stock>0&&<> · <strong style={{ color:'var(--red)' }}>{ps.out_of_stock} parts</strong><span style={{ color:'var(--muted)' }}> completely out of stock</span></>}
              <span style={{ color:'var(--muted)' }}> — go to Parts to adjust</span>
            </span>
          </div>
        )}
      </Section>

    </div>
  );
}
