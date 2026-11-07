import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie,
} from 'recharts';
import { reportsApi, vehiclesApi, partsApi, serviceApi, salesApi, expensesApi } from '../api/client';
import { Skeleton, ApiError, Empty } from '../components/ui';

// ── Chart tokens ─────────────────────────────────────────────────────
// Accent for the series a chart argues from; ink and muted for the rest.
const SERIES = {
  sales:   'var(--color-accent)',
  service: 'var(--color-ink)',
  parts:   'var(--color-muted)',
};

const tooltipStyle = {
  contentStyle: { background:'var(--color-paper)', border:'1px solid var(--color-rule-2)', borderRadius:'var(--radius-control)', fontSize:12 },
  labelStyle:   { color:'var(--color-muted)', fontSize:11 },
  itemStyle:    { color:'var(--color-ink)' },
};

const axisStyle = { fontSize:11, fill:'var(--color-muted)' };
const cursorStyle = { fill:'var(--color-paper-2)' };

const swatch = c => ({ width:10, height:10, background:c, borderRadius:2, flexShrink:0 });
const grid2 = { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap:1, background:'var(--color-rule)', borderBottom:'1px solid var(--color-rule)' };
const tile = { padding:'var(--space-sm) var(--space-md)', background:'var(--color-paper-2)', borderRadius:'var(--radius-control)', minWidth:0 };
const tileValue = { fontSize:'var(--text-xl)', fontWeight:600, fontVariantNumeric:'tabular-nums', marginTop:'var(--space-3xs)' };

// ── Section wrapper ──────────────────────────────────────────────────
function Section({ title, sub, children, loading, error, action, inGrid }) {
  return (
    <section style={{ background:'var(--color-paper)', minWidth:0, ...(inGrid ? {} : { borderBottom:'1px solid var(--color-rule)' }) }}>
      <div className="page-head" style={{ alignItems:'flex-start', flexWrap:'wrap' }}>
        <div>
          <h2 className="page-head-title" style={{ fontSize:'var(--text-lg)' }}>{title}</h2>
          {sub && <div className="label-xs" style={{ marginTop:'var(--space-3xs)' }}>{sub}</div>}
        </div>
        {action && <div>{action}</div>}
      </div>
      <div className="page-pad">
        {loading ? <Skeleton h={220} /> : error ? <ApiError error={error} /> : children}
      </div>
    </section>
  );
}

// ── Stat ─────────────────────────────────────────────────────────────
function StatPill({ label, value, sub }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="label-xs">{sub}</span>}
    </div>
  );
}

// ── Chart legend ─────────────────────────────────────────────────────
function Legend({ items }) {
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:'var(--space-md)' }}>
      {items.map(([c,l])=>(
        <div key={l} className="label-xs" style={{ display:'flex', alignItems:'center', gap:'var(--space-2xs)' }}>
          <span style={swatch(c)} aria-hidden="true" />{l}
        </div>
      ))}
    </div>
  );
}

// ── Chart tooltip body ───────────────────────────────────────────────
function TooltipBox({ label, payload, value, total }) {
  return (
    <div style={{ background:'var(--color-paper)', border:'1px solid var(--color-rule-2)', borderRadius:'var(--radius-control)', padding:'var(--space-xs) var(--space-sm)', fontSize:12, color:'var(--color-ink)' }}>
      <div style={{ color:'var(--color-muted)', marginBottom:'var(--space-2xs)', fontSize:11 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'var(--space-md)', marginBottom:2 }}>
          <span style={{ display:'flex', alignItems:'center', gap:'var(--space-2xs)', textTransform:'capitalize' }}>
            <span style={swatch(p.color)} aria-hidden="true" />{p.name}
          </span>
          <span className="mono">{value(p.value)}</span>
        </div>
      ))}
      <div style={{ borderTop:'1px solid var(--color-rule)', marginTop:'var(--space-2xs)', paddingTop:'var(--space-2xs)', display:'flex', justifyContent:'space-between', fontWeight:600 }}>
        <span>Total</span>
        <span className="mono">{total}</span>
      </div>
    </div>
  );
}

// ── Custom tooltip for revenue chart ────────────────────────────────
function RevenueTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <TooltipBox
      label={label}
      payload={payload}
      value={v => `₹${Math.round(v).toLocaleString('en-IN')}`}
      total={`₹${Math.round(payload.reduce((s,p)=>s+p.value,0)).toLocaleString('en-IN')}`}
    />
  );
}

// ── Revenue by payment mode (daily closing side panel) ──────────────
function ModeList({ title, byMode, total, totalLabel, emptyText }) {
  return (
    <div>
      <h3 className="sheet-sec">{title}</h3>
      {total === 0 ? (
        <div className="label-xs">{emptyText}</div>
      ) : (
        <>
          {Object.entries(byMode).map(([mode, amt]) => (
            <div key={mode} className="tot-row">
              <span>{mode}</span>
              <span className="mono" style={{ color:'var(--color-ink)' }}>₹{amt.toLocaleString('en-IN')}</span>
            </div>
          ))}
          <div className="tot-row is-key" style={{ borderBottom:0 }}>
            <span>{totalLabel}</span>
            <span className="mono">₹{total.toLocaleString('en-IN')}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ── NEW: Daily Closing Component ────────────────────────────────────
function DailyClosingSection() {
  const todayIso = new Date().toISOString().split('T')[0];
  const [isoDate, setIsoDate] = useState(todayIso);

  const toApiDate = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  };
  const apiDate = toApiDate(isoDate);

  const { data, isLoading, error } = useQuery({
    queryKey: ['dailyClosing', isoDate],
    queryFn: () => reportsApi.dailyClosing(isoDate).then(r => r.data)
  });

  // Service revenue broken down by payment mode
  const svcByMode = {};
  (data?.breakdown || []).forEach(row => {
    if (row.Service) svcByMode[row.payment_mode] = row.Service;
  });
  const totalSvcRevenue = Object.values(svcByMode).reduce((s, v) => s + v, 0);

  // Sales revenue broken down by payment mode
  const salesByMode = {};
  (data?.breakdown || []).forEach(row => {
    if (row.Sales) salesByMode[row.payment_mode] = row.Sales;
  });
  const totalSalesRevenue = Object.values(salesByMode).reduce((s, v) => s + v, 0);

  const calendarAction = (
    <div style={{ display:'flex', alignItems:'center', gap:'var(--space-xs)' }}>
      <span className="label-xs">{apiDate}</span>
      <input
        type="date"
        aria-label="Closing date"
        value={isoDate}
        max={todayIso}
        onChange={e => setIsoDate(e.target.value)}
        style={{ width:'auto' }}
      />
    </div>
  );

  return (
    <Section
      title="Daily closing report"
      sub="Cash, UPI and bank transfer tally for the day"
      loading={isLoading}
      error={error}
      action={calendarAction}
    >
      <div style={{ display:'flex', flexWrap:'wrap', gap:'var(--space-lg)', alignItems:'flex-start' }}>

        {/* Left: full breakdown table */}
        <div style={{ flex:'1 1 420px', minWidth:0 }}>
          {!data?.breakdown?.length ? (
            <Empty message={`No transactions recorded for ${apiDate}.`} sub="Pick another date to see its tally." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Payment mode</th>
                    <th className="num">Sales</th>
                    <th className="num">Service</th>
                    <th className="num">Parts</th>
                    <th className="num">Expenses</th>
                    <th className="num">Net total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.breakdown.map((row) => (
                    <tr key={row.payment_mode}>
                      <td className="cell-strong">{row.payment_mode}</td>
                      <td className="num cell-muted">₹{(row.Sales||0).toLocaleString('en-IN')}</td>
                      <td className="num cell-muted">₹{(row.Service||0).toLocaleString('en-IN')}</td>
                      <td className="num cell-muted">₹{(row.Parts||0).toLocaleString('en-IN')}</td>
                      <td className="num" style={row.Expenses ? { color:'var(--color-error)' } : { color:'var(--color-muted)' }}>
                        {row.Expenses ? `−₹${(row.Expenses||0).toLocaleString('en-IN')}` : 'None'}
                      </td>
                      <td className="num cell-amount" style={row.total<0 ? { color:'var(--color-error)' } : undefined}>
                        ₹{Math.abs(row.total).toLocaleString('en-IN')}{row.total<0?' (−)':''}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} className="num cell-strong">Grand total</td>
                    <td className="num cell-amount" style={{ fontSize:'var(--text-lg)' }}>₹{data.grand_total.toLocaleString('en-IN')}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Right: Sales + Service revenue by payment mode */}
        <div style={{ flex:'1 1 240px', maxWidth:360, ...tile, padding:'var(--space-md)', display:'flex', flexDirection:'column', gap:'var(--space-lg)' }}>
          <ModeList
            title="Sales revenue"
            byMode={salesByMode}
            total={totalSalesRevenue}
            totalLabel="Total sales"
            emptyText={`No vehicle sales for ${apiDate}.`}
          />
          <ModeList
            title="Service revenue"
            byMode={svcByMode}
            total={totalSvcRevenue}
            totalLabel="Total service"
            emptyText={`No service bills for ${apiDate}.`}
          />
        </div>

      </div>
    </Section>
  );
}

// ── Month range chips ────────────────────────────────────────────────
function MonthChips({ value, onPick, label }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {[3,6,12].map(m => (
        <button key={m} type="button" className="chip" aria-pressed={value===m} onClick={()=>onPick(m)}>{m}M</button>
      ))}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [months, setMonths] = useState(6);
  const [countMonths, setCountMonths] = useState(6);

  // Data fetches
  const { data:revenue, isLoading:revLoading, error:revError } = useQuery({
    queryKey:['reports-revenue', months],
    queryFn: ()=>reportsApi.revenue({ months }).then(r=>r.data),
  });
  const { data:countData, isLoading:countLoading, error:countError } = useQuery({
    queryKey:['reports-monthly-counts', countMonths],
    queryFn: ()=>reportsApi.monthlyCounts({ months: countMonths }).then(r=>r.data),
  });
  const { data:brandData, isLoading:brandLoading, error:brandError } = useQuery({
    queryKey:['reports-brand'],
    queryFn: ()=>reportsApi.brandSales().then(r=>r.data),
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
    (revenue.sales||[]).forEach(d => { map[d.id] = { ...map[d.id], month:d.id, sales: d.sales||0, sales_count: d.count||0 }; });
    (revenue.service||[]).forEach(d => { map[d.id] = { ...map[d.id], month:d.id, service: d.service||0, svc_count: d.svc_count||0 }; });
    (revenue.parts||[]).forEach(d  => { map[d.id] = { ...map[d.id], month:d.id, parts: d.parts||0, parts_count: d.parts_count||0 }; });
    return Object.values(map)
      .sort((a,b)=>a.month.localeCompare(b.month))
      .map(d => ({
        month:        d.month?.slice(0,7) || '',
        sales:        Math.round(d.sales       || 0),
        service:      Math.round(d.service     || 0),
        parts:        Math.round(d.parts       || 0),
        total:        Math.round((d.sales||0)+(d.service||0)+(d.parts||0)),
        sales_count:  d.sales_count  || 0,
        svc_count:    d.svc_count    || 0,
        parts_count:  d.parts_count  || 0,
      }));
  })();

  const totalRevenue = monthlyData.reduce((s,d)=>s+d.total,0);
  const vs  = vehStats   || {};
  const ps  = partsStats || {};
  const ss  = svcStats   || {};
  const sal = salesStats || {};

  const fmt = n => {
    if (n >= 1_00_00_000) return '₹'+(n/1_00_00_000).toFixed(1)+'Cr';
    if (n >= 1_00_000)    return '₹'+(n/1_00_000).toFixed(1)+'L';
    if (n >= 1000)        return '₹'+(n/1000).toFixed(0)+'K';
    return n != null ? '₹'+n : '—';
  };

  const revLegend = [[SERIES.sales,'Sales'],[SERIES.service,'Service'],[SERIES.parts,'Parts']];

  return (
    <div>

      {/* KPI bar */}
      <section className="stat-strip" aria-label="Business figures">
        <StatPill label="Total revenue"     value={fmt(sal.total_revenue)}     sub={`${sal.total_count||0} invoices`} />
        <StatPill label="Vehicles in stock" value={vs.in_stock??'—'}           sub={`${vs.sold||0} sold`} />
        <StatPill label="Active service"    value={ss.total_active??'—'}       sub={`${ss.delivered||0} delivered`} />
        <StatPill label="Parts SKUs"        value={ps.total_skus??'—'}         sub={`${ps.low_stock||0} low stock`} />
        <StatPill label="Stock value"       value={fmt(ps.stock_value)}        sub="Parts inventory" />
      </section>

      {/* NEW: Daily Closing inserted right here! */}
      <DailyClosingSection />

      {/* Revenue chart */}
      <Section
        title="Monthly revenue breakdown"
        sub="Sales, service and parts combined"
        loading={revLoading}
        error={revError}
      >
        <div className="page-toolbar" style={{ padding:0, border:0, marginBottom:'var(--space-md)' }}>
          <MonthChips value={months} onPick={setMonths} label="Revenue period" />
          <span className="toolbar-count" role="status">
            Period total: <span className="cell-amount" style={{ fontSize:'var(--text-md)' }}>{fmt(totalRevenue)}</span>
          </span>
        </div>
        {monthlyData.length === 0 ? (
          <Empty message="No revenue data yet" sub="Create a sale, service bill or parts bill to see it here." />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData} barSize={18} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-rule)" vertical={false} />
              <XAxis dataKey="month" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={v=>{
                if(v>=1_00_00_000) return '₹'+(v/1_00_00_000).toFixed(1)+'Cr';
                if(v>=1_00_000)    return '₹'+(v/1_00_000).toFixed(1)+'L';
                if(v>=1000)        return '₹'+(v/1000).toFixed(0)+'K';
                return '₹'+v;
              }} width={68} />
              <Tooltip content={<RevenueTooltip />} cursor={cursorStyle} />
              <Bar dataKey="sales"   fill={SERIES.sales}   radius={[2,2,0,0]} name="sales" />
              <Bar dataKey="service" fill={SERIES.service} radius={[2,2,0,0]} name="service" />
              <Bar dataKey="parts"   fill={SERIES.parts}   radius={[2,2,0,0]} name="parts" />
            </BarChart>
          </ResponsiveContainer>
        )}
        <div style={{ marginTop:'var(--space-sm)' }}>
          <Legend items={revLegend} />
        </div>
      </Section>

      {/* Brand sales + Top parts side by side */}
      <div style={grid2}>

        {/* Brand sales */}
        <Section inGrid title="Sales by brand" sub="Units sold and revenue" loading={brandLoading} error={brandError}>
          {!brandData?.length ? (
            <Empty message="No sales data yet" sub="Brand totals appear once vehicles are sold." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={brandData} layout="vertical" barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-rule)" horizontal={false} />
                  <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={v=>v+'u'} />
                  <YAxis type="category" dataKey="brand" tick={axisStyle} axisLine={false} tickLine={false} width={80} />
                  <Tooltip {...tooltipStyle} cursor={cursorStyle} formatter={(v,n)=>n==='units'?[v+' units',n]:['₹'+v.toLocaleString('en-IN'),n]} />
                  <Bar dataKey="units" radius={[0,2,2,0]} name="units" fill="var(--color-accent)" />
                </BarChart>
              </ResponsiveContainer>
              {/* table below chart */}
              <div className="table-wrap" style={{ marginTop:'var(--space-sm)' }}>
                <table className="data-table">
                  <thead>
                    <tr><th>Brand</th><th className="num">Units</th><th className="num">Revenue</th></tr>
                  </thead>
                  <tbody>
                    {brandData.slice(0,6).map((b)=>(
                      <tr key={b.brand}>
                        <td className="cell-strong">{b.brand||'Unknown'}</td>
                        <td className="num cell-muted">{b.units} units</td>
                        <td className="num cell-amount">{fmt(b.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Section>

        {/* Monthly transaction volume */}
        <Section
          inGrid
          title="Monthly transaction volume"
          sub="Number of sales, services and parts bills"
          loading={countLoading}
          error={countError}
          action={<MonthChips value={countMonths} onPick={setCountMonths} label="Volume period" />}
        >
          {(() => {
            // Build chart data from dedicated monthly-counts endpoint
            const countMap = {};
            (countData?.sales   || []).forEach(d => { countMap[d.month] = { ...countMap[d.month], month:d.month, sales_count: d.count||0 }; });
            (countData?.service || []).forEach(d => { countMap[d.month] = { ...countMap[d.month], month:d.month, svc_count:   d.count||0 }; });
            (countData?.parts   || []).forEach(d => { countMap[d.month] = { ...countMap[d.month], month:d.month, parts_count: d.count||0 }; });
            const chartData = Object.values(countMap)
              .sort((a,b) => a.month.localeCompare(b.month))
              .map(d => ({
                month:       d.month || '',
                sales_count: d.sales_count  || 0,
                svc_count:   d.svc_count    || 0,
                parts_count: d.parts_count  || 0,
              }));
            const grandTotal = chartData.reduce((s,d)=>s+d.sales_count+d.svc_count+d.parts_count, 0);
            const moFmt = m => { const [y,mo]=m.split('-'); return new Date(y,+mo-1).toLocaleDateString('en-IN',{month:'short',year:'2-digit'}); };

            if (!chartData.length) return (
              <Empty message="No data yet" sub="Monthly counts appear once bills are created." />
            );

            return (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} barSize={14} barGap={3}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-rule)" vertical={false} />
                    <XAxis dataKey="month" tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={moFmt} />
                    <YAxis tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const total = payload.reduce((s,p)=>s+p.value,0);
                        const [y,mo] = (label||'').split('-');
                        const moLabel = y ? new Date(y,+mo-1).toLocaleDateString('en-IN',{month:'long',year:'numeric'}) : label;
                        return <TooltipBox label={moLabel} payload={payload} value={v => v} total={total} />;
                      }}
                      cursor={cursorStyle}
                    />
                    <Bar dataKey="sales_count" fill={SERIES.sales}   radius={[2,2,0,0]} name="sales" />
                    <Bar dataKey="svc_count"   fill={SERIES.service} radius={[2,2,0,0]} name="service" />
                    <Bar dataKey="parts_count" fill={SERIES.parts}   radius={[2,2,0,0]} name="parts" />
                  </BarChart>
                </ResponsiveContainer>

                {/* Legend + total */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:'var(--space-md)', alignItems:'center', margin:'var(--space-sm) 0' }}>
                  <Legend items={revLegend} />
                  <div className="label-xs" style={{ marginLeft:'auto' }}>
                    Total: <span className="cell-amount">{grandTotal} transactions</span>
                  </div>
                </div>
                {/* Per-month rows (most recent first) */}
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th className="num">Sales</th>
                        <th className="num">Service</th>
                        <th className="num">Parts</th>
                        <th className="num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...chartData].reverse().slice(0,6).map(d => {
                        const rowTotal = d.sales_count + d.svc_count + d.parts_count;
                        return (
                          <tr key={d.month}>
                            <td className="cell-strong cell-nowrap">{moFmt(d.month)}</td>
                            {[d.sales_count, d.svc_count, d.parts_count].map((val, i) => (
                              <td key={i} className={`num${val > 0 ? '' : ' cell-muted'}`}>{val}</td>
                            ))}
                            <td className="num cell-amount">{rowTotal}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </Section>
      </div>

      {/* Service summary + Vehicle stock breakdown */}
      <div style={grid2}>

        {/* Service jobs summary */}
        <Section inGrid title="Service jobs summary" sub="Current status distribution">
          {!ss.pending && !ss.in_progress && !ss.ready && !ss.delivered ? (
            <Empty message="No service data" sub="Job counts appear once service jobs are opened." />
          ) : (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:'var(--space-xs)', marginBottom:'var(--space-md)' }}>
                {[
                  { l:'Pending',     v:ss.pending,     c:'var(--color-ink)' },
                  { l:'In progress', v:ss.in_progress, c:'var(--color-warn)' },
                  { l:'Ready',       v:ss.ready,       c:'var(--color-success)' },
                  { l:'Delivered',   v:ss.delivered,   c:'var(--color-muted)' },
                ].map(s=>(
                  <div key={s.l} style={tile}>
                    <div className="label-xs">{s.l}</div>
                    <div style={{ ...tileValue, color:s.c }}>{s.v??'—'}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:'var(--space-xs)', alignItems:'center' }}>
                <div style={{ flex:1, height:6, background:'var(--color-paper-3)', borderRadius:3, overflow:'hidden', display:'flex' }}>
                  {[
                    { v:ss.pending,     c:'var(--color-ink)' },
                    { v:ss.in_progress, c:'var(--color-warn)' },
                    { v:ss.ready,       c:'var(--color-success)' },
                    { v:ss.delivered,   c:'var(--color-rule-2)' },
                  ].map((s,i)=>{
                    const total = (ss.pending||0)+(ss.in_progress||0)+(ss.ready||0)+(ss.delivered||0);
                    const pct   = total ? Math.round((s.v||0)/total*100) : 0;
                    return <div key={i} style={{ width:`${pct}%`, background:s.c }} />;
                  })}
                </div>
                <span className="label-xs">
                  {(ss.pending||0)+(ss.in_progress||0)+(ss.ready||0)+(ss.delivered||0)} total jobs
                </span>
              </div>
            </>
          )}
        </Section>

        {/* Vehicle stock breakdown */}
        <Section inGrid title="Vehicle stock breakdown" sub="New vs pre-owned, status">
          {!vs.in_stock && !vs.sold ? (
            <Empty message="No vehicle data" sub="Stock counts appear once vehicles are added." />
          ) : (
            <div style={{ display:'flex', flexWrap:'wrap', gap:'var(--space-lg)', alignItems:'center' }}>
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie
                    data={[
                      { name:'In stock',   value:vs.in_stock  ||0, fill:'var(--color-accent)' },
                      { name:'In service', value:vs.in_service||0, fill:'var(--color-ink)' },
                      { name:'Sold',       value:vs.sold      ||0, fill:'var(--color-muted)' },
                    ].filter(d=>d.value>0)}
                    cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                    paddingAngle={3} dataKey="value"
                    stroke="var(--color-paper)"
                  >
                    {/* Colour follows the category, not its position after zero slices drop out */}
                    {[
                      { name:'In stock',   value:vs.in_stock  ||0, fill:'var(--color-accent)' },
                      { name:'In service', value:vs.in_service||0, fill:'var(--color-ink)' },
                      { name:'Sold',       value:vs.sold      ||0, fill:'var(--color-muted)' },
                    ].filter(d=>d.value>0).map(d=><Cell key={d.name} fill={d.fill} />)}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex:'1 1 200px', display:'flex', flexDirection:'column' }}>
                {[
                  { l:'In stock',   v:vs.in_stock,   c:'var(--color-accent)' },
                  { l:'New',        v:vs.new,        c:null },
                  { l:'Pre-owned',  v:vs.used,       c:null },
                  { l:'In service', v:vs.in_service, c:'var(--color-ink)' },
                  { l:'Sold',       v:vs.sold,       c:'var(--color-muted)' },
                ].map(s=>(
                  <div key={s.l} className="tot-row" style={{ color:'var(--color-ink)', alignItems:'center' }}>
                    <span style={{ display:'flex', alignItems:'center', gap:'var(--space-xs)', paddingLeft: s.c ? 0 : 18 }}>
                      {s.c && <span style={swatch(s.c)} aria-hidden="true" />}
                      {s.l}
                    </span>
                    <span className="mono" style={{ fontWeight:600 }}>{s.v??'—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* Parts inventory health */}
      <Section title="Parts inventory health" sub="Stock value vs selling value, alert summary">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'var(--space-xs)' }}>
          {[
            { l:'Total SKUs',    v:ps.total_skus??'—',   c:'var(--color-ink)',   sub:'Unique parts' },
            { l:'Low stock',     v:ps.low_stock??'—',    c:ps.low_stock>0 ? 'var(--color-warn)' : 'var(--color-ink)', sub:'Below reorder level', alert:ps.low_stock>0 },
            { l:'Out of stock',  v:ps.out_of_stock??'—', c:ps.out_of_stock>0 ? 'var(--color-error)' : 'var(--color-ink)', sub:'Zero units', alert:ps.out_of_stock>0 },
            { l:'Stock value',   v:fmt(ps.stock_value),  c:'var(--color-ink)',   sub:'At purchase price' },
          ].map(s=>(
            <div key={s.l} style={{ ...tile, background: s.alert ? 'color-mix(in oklab, var(--color-warn) 10%, var(--color-paper))' : 'var(--color-paper-2)' }}>
              <div className="label-xs">{s.l}</div>
              <div style={{ ...tileValue, color:s.c }}>{s.v}</div>
              <div className="label-xs" style={{ marginTop:'var(--space-3xs)' }}>{s.sub}</div>
            </div>
          ))}
        </div>
        {(ps.low_stock>0||ps.out_of_stock>0) && (
          <div className="notice notice-warn" role="status">
            {ps.low_stock>0&&<><strong>{ps.low_stock} parts</strong> need reordering. </>}
            {ps.out_of_stock>0&&<><strong style={{ color:'var(--color-error)' }}>{ps.out_of_stock} parts</strong> completely out of stock. </>}
            Go to Parts to adjust.
          </div>
        )}
      </Section>

      <TopSellersSection />

      <PnLSection />

    </div>
  );
}

// ── Top sellers ──────────────────────────────────────────────────────────────
// Local calendar dates as YYYY-MM-DD (toISOString would shift them to UTC)
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function topSellerPeriods() {
  const t = new Date(), y = t.getFullYear(), m = t.getMonth();
  const fy = m >= 3 ? y : y - 1;   // Indian financial year starts 1 April
  return [
    ['month',     'This month',            new Date(y, m, 1),     t],
    ['lastmonth', 'Last month',            new Date(y, m - 1, 1), new Date(y, m, 0)],
    ['year',      `This year (${y})`,      new Date(y, 0, 1),     t],
    ['fy',        `This financial year (${fy}–${String(fy + 1).slice(2)})`, new Date(fy, 3, 1), t],
    ['lastfy',    `Last financial year (${fy - 1}–${String(fy).slice(2)})`, new Date(fy - 1, 3, 1), new Date(fy, 2, 31)],
  ].map(([id, label, start, end]) => ({ id, label, start: ymd(start), end: ymd(end) }));
}
const rupees = n => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');

function TopSellersSection() {
  const periods = topSellerPeriods();
  const [periodId, setPeriodId] = useState('month');
  const period = periods.find(p => p.id === periodId);

  const { data, isLoading, error } = useQuery({
    queryKey: ['top-sellers', period.start, period.end],
    queryFn: () => reportsApi.topSellers({ start: period.start, end: period.end }).then(r => r.data),
  });
  const d = data || {};
  const models = d.models || [], items = d.items || [];

  return (
    <Section title="Top sellers" sub="Best-selling bike models and the most-billed service items"
      loading={isLoading} error={error}
      action={
        <select aria-label="Top sellers period" value={periodId} onChange={e => setPeriodId(e.target.value)} style={{ width:'auto' }}>
          {periods.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      }>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap:'var(--space-lg)' }}>
        <div style={{ minWidth:0 }}>
          <h3 className="sheet-sec">Bike models sold</h3>
          {models.length === 0 ? <Empty message="No bikes sold in this period" /> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>#</th><th>Model</th><th className="num">Units</th><th className="num">Share</th><th className="num">Revenue</th></tr></thead>
                <tbody>
                  {models.map((m, i) => (
                    <tr key={m.brand + m.model}>
                      <td className="cell-muted">{i + 1}</td>
                      <td><div className="cell-strong">{m.model}</div><div className="cell-sub">{m.brand}</div></td>
                      <td className="num mono cell-strong">{m.units}</td>
                      <td className="num mono cell-muted">{d.sales_count ? Math.round(m.units / d.sales_count * 100) : 0}%</td>
                      <td className="num mono">{rupees(m.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="label-xs" style={{ marginTop:'var(--space-xs)' }}>{d.sales_count || 0} bikes sold in total</div>
        </div>

        <div style={{ minWidth:0 }}>
          <h3 className="sheet-sec">Service bill items</h3>
          {items.length === 0 ? <Empty message="No service bills in this period" /> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>#</th><th>Item</th><th className="num">Qty</th><th className="num">Bills</th><th className="num">Revenue</th></tr></thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={it.part_number || it.name}>
                      <td className="cell-muted">{i + 1}</td>
                      <td><div className="cell-strong">{it.name}</div>{it.part_number && <div className="cell-sub mono">{it.part_number}</div>}</td>
                      <td className="num mono cell-strong">{it.qty}{it.free_qty > 0 && <div className="cell-sub">{it.free_qty} free</div>}</td>
                      <td className="num mono cell-muted">{it.bills}</td>
                      <td className="num mono">{rupees(it.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="label-xs" style={{ marginTop:'var(--space-xs)' }}>
            {d.service_bills || 0} service bills · labour {rupees(d.labour?.revenue)} on {d.labour?.bills || 0} bills
          </div>
        </div>
      </div>
    </Section>
  );
}

// ── P&L Section ────────────────────────────────────────────────────────────────
function PnLSection() {
  const [pnlMonths, setPnlMonths] = useState(10);
  const [drill,     setDrill]     = useState(null); // month key for drill-down

  const { data: pnlRaw, isLoading: pnlLoading, error: pnlError } = useQuery({
    queryKey: ['pnl', pnlMonths],
    queryFn: () => expensesApi.pnl(pnlMonths).then(r => r.data),
    refetchInterval: 60_000,
  });
  const pnl = Array.isArray(pnlRaw) ? pnlRaw : [];

  const RS   = '₹';
  const fmtK = n => {
    const v = Number(n || 0);
    if (Math.abs(v) >= 1_00_00_000) return `${RS}${(v/1_00_00_000).toFixed(1)}Cr`;
    if (Math.abs(v) >= 1_00_000)    return `${RS}${(v/1_00_000).toFixed(1)}L`;
    if (Math.abs(v) >= 1000)        return `${RS}${(v/1000).toFixed(1)}K`;
    return `${RS}${Math.round(v)}`;
  };
  const fmtFull = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const monthLabel = m => {
    const [y, mo] = (m || '').split('-');
    return new Date(y, parseInt(mo)-1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  };

  const profitColor = v => ({ color: v >= 0 ? 'var(--color-success)' : 'var(--color-error)' });

  return (
    <Section title="Profit and loss" sub="Revenue vs expenses, monthly breakdown">
      <div className="page-toolbar" style={{ padding:0, border:0, marginBottom:'var(--space-md)' }}>
        <select value={pnlMonths} onChange={e => setPnlMonths(Number(e.target.value))}
          aria-label="P&L period" style={{ width:'auto' }}>
          {[[3,'Last 3 months'],[6,'Last 6 months'],[10,'Last 10 months'],[12,'Last 12 months']].map(([v,l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        {drill && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDrill(null)}>
            Back to summary
          </button>
        )}
      </div>

      {pnlLoading ? (
        <div className="table-skeleton" style={{ padding:0 }}>{[1,2,3].map(i=><Skeleton key={i} h={44}/>)}</div>
      ) : pnlError ? (
        <ApiError error={pnlError} />
      ) : pnl.length === 0 ? (
        <Empty message="No data yet" sub="Add expenses to see P&L." />
      ) : drill ? (
        /* ── Drill-down: expense breakdown for selected month ── */
        (() => {
          const row = pnl.find(r => r.month === drill);
          if (!row) return null;
          const cats = Object.entries(row.expense_by_category || {}).sort((a,b) => b[1]-a[1]);
          return (
            <div>
              <h3 className="sheet-sec">
                {monthLabel(drill)}: expense breakdown
              </h3>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'var(--space-xs)', marginBottom:'var(--space-lg)' }}>
                {[
                  ['Revenue',  row.revenue,  { color:'var(--color-ink)' }],
                  ['Expenses', row.expenses, { color:'var(--color-ink)' }],
                  ['Profit',   row.profit,   profitColor(row.profit)],
                ].map(([l,v,c]) => (
                  <div key={l} style={tile}>
                    <div className="label-xs">{l}</div>
                    <div style={{ ...tileValue, ...c }}>{fmtK(v)}</div>
                  </div>
                ))}
              </div>
              {cats.length > 0 ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        {['Category','Amount','% of expenses'].map(h => (
                          <th key={h} className={h === 'Category' ? undefined : 'num'}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cats.map(([cat, amt]) => (
                        <tr key={cat}>
                          <td>{cat}</td>
                          <td className="num cell-amount">
                            {RS}{fmtFull(amt)}
                          </td>
                          <td className="num cell-muted">
                            {row.expenses > 0 ? Math.round(amt / row.expenses * 100) : 0}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty message="No expense entries for this month." />
              )}
            </div>
          );
        })()
      ) : (
        /* ── Summary table ── */
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {['Month','Sales rev','Service rev','Parts rev','Total revenue','Expenses','Profit / loss','Margin',''].map(h => (
                  <th key={h} className={h === 'Month' || h === '' ? 'cell-nowrap' : 'num'}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pnl.map(r => {
                const profit  = r.profit || 0;
                const margin  = r.margin || 0;
                return (
                  <tr key={r.month} style={{ cursor:'pointer' }}
                    onClick={() => setDrill(r.month)}>
                    <td className="cell-strong cell-nowrap">{monthLabel(r.month)}</td>
                    <td className="num">{fmtK(r.sales_rev)}</td>
                    <td className="num">{fmtK(r.service_rev)}</td>
                    <td className="num">{fmtK(r.parts_rev)}</td>
                    <td className="num cell-amount">{fmtK(r.revenue)}</td>
                    <td className="num cell-muted">{fmtK(r.expenses)}</td>
                    <td className="num cell-amount" style={profitColor(profit)}>
                      {profit >= 0 ? '+' : ''}{fmtK(profit)}
                    </td>
                    <td className="num">
                      <span className={`pill ${margin >= 20 ? 'pill-green' : margin >= 0 ? 'pill-amber' : 'pill-red'}`}>{margin}%</span>
                    </td>
                    <td className="cell-nowrap">
                      <button type="button" className="btn btn-ghost btn-sm" aria-label={`Details for ${monthLabel(r.month)}`}
                        onClick={(e) => { e.stopPropagation(); setDrill(r.month); }}>Details</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background:'var(--color-paper-2)', fontWeight:600 }}>
                <td>Total</td>
                <td className="num">
                  {fmtK(pnl.reduce((s,r)=>s+r.sales_rev,0))}
                </td>
                <td className="num">
                  {fmtK(pnl.reduce((s,r)=>s+r.service_rev,0))}
                </td>
                <td className="num">
                  {fmtK(pnl.reduce((s,r)=>s+r.parts_rev,0))}
                </td>
                <td className="num">
                  {fmtK(pnl.reduce((s,r)=>s+r.revenue,0))}
                </td>
                <td className="num">
                  {fmtK(pnl.reduce((s,r)=>s+r.expenses,0))}
                </td>
                <td className="num" style={profitColor(pnl.reduce((s,r)=>s+r.profit,0))}>
                  {fmtK(pnl.reduce((s,r)=>s+r.profit,0))}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Section>
  );
}
