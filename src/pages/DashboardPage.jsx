import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi, salesApi, vehiclesApi, partsApi, serviceApi, expensesApi, backupApi } from '../api/client';
import { Skeleton, ApiError, Btn } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

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

function StatCard({ label, value, tone, sub, onClick }) {
  const body = (
    <>
      <span className="dash-stat-label">{label}</span>
      <span className="dash-stat-value" style={tone ? { color: tone } : undefined}>{value}</span>
      {sub && <span className="dash-stat-sub">{sub}</span>}
    </>
  );
  return onClick
    ? <button type="button" className="dash-stat dash-stat-link" onClick={onClick}>{body}</button>
    : <div className="dash-stat">{body}</div>;
}

function QuickAction({ label, desc, onClick }) {
  return (
    <button type="button" className="dash-action" onClick={onClick}>
      <span className="dash-action-label">{label}</span>
      <span className="dash-action-desc">{desc}</span>
    </button>
  );
}

const PAGE_NAMES = { parts: 'Parts', service: 'Service', reports: 'Reports' };

function AlertRow({ tag, tagClass, message, page, onClick }) {
  return (
    <li>
      <button type="button" className="dash-alert" onClick={onClick}>
        <span className={`pill ${tagClass}`}>{tag}</span>
        <span className="dash-alert-msg">{message}</span>
        <span className="dash-alert-go">Open {PAGE_NAMES[page] || page}</span>
      </button>
    </li>
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
  // Current month P&L
  const { data:pnlData } = useQuery({
    queryKey:['pnl-dashboard'],
    queryFn: ()=>expensesApi.pnl(1).then(r=>r.data),
    refetchInterval: 60_000,
  });
  const thisMonthPnl = Array.isArray(pnlData) ? pnlData[0] : null;

  // nested response: raw.revenue.today, raw.vehicles.in_stock, etc.
  const rev  = raw?.revenue   || {};
  const veh  = raw?.vehicles  || {};
  const svc  = raw?.service   || {};
  const pts  = raw?.parts     || {};
  const vs   = vehStats       || {};
  const ps   = partsStats     || {};
  const sal  = salStats       || {};

  const fmt = n => {
    if (n < 0)            return '−' + fmt(-n);   // a loss reads −₹50K, not ₹-50000
    if (n >= 1_00_00_000) return '₹'+(n/1_00_00_000).toFixed(1)+'Cr';
    if (n >= 1_00_000)    return '₹'+(n/1_00_000).toFixed(1)+'L';
    if (n >= 1000)        return '₹'+(n/1000).toFixed(0)+'K';
    return n != null ? '₹'+n : '—';
  };

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const alerts = [];
  if (pts.low_stock   > 0) alerts.push({ tag:'Low stock',    cls:'pill-amber', msg:`${pts.low_stock} parts below reorder level`,      page:'parts' });
  if (pts.out_of_stock> 0) alerts.push({ tag:'Out of stock', cls:'pill-red',   msg:`${pts.out_of_stock} parts out of stock`,          page:'parts' });
  if (svc.ready       > 0) alerts.push({ tag:'Ready',        cls:'pill-green', msg:`${svc.ready} vehicle${svc.ready>1?'s':''} ready for pickup`, page:'service' });
  if (thisMonthPnl && thisMonthPnl.profit < 0) alerts.push({ tag:'Loss', cls:'pill-red', msg:`This month is at a loss: expenses exceed revenue by ${fmt(Math.abs(thisMonthPnl.profit))}`, page:'reports' });

  const partsAlerts = (pts.low_stock||0)+(pts.out_of_stock||0);
  const isOwner = user?.role === 'owner' || user?.role === 'admin';

  return (
    <div className="dash">
      {/* Figures strip */}
      <section className="kpi-grid dash-stats" aria-label="Today's figures">
        {statsLoading ? (
          Array.from({length:6}).map((_,i)=>(
            <div key={i} className="dash-stat">
              <Skeleton h={12} w={72} />
              <Skeleton h={28} w={88} style={{ marginTop:8 }} />
            </div>
          ))
        ) : statsError ? (
          <div className="dash-stats-error"><ApiError error={statsError} /></div>
        ) : (
          <>
            <StatCard label="Today's revenue"     value={fmt(rev.today)}          sub={`Month: ${fmt(rev.month)}`} />
            <StatCard label="Today's sales"       value={raw?.sales_today_count??'—'} sub={`${sal.total_count||0} total`}          onClick={()=>setActive('sales')} />
            <StatCard label="Vehicles in stock"   value={veh.in_stock??'—'}       sub={`${vs.sold||0} sold all time`}             onClick={()=>setActive('vehicles')} />
            <StatCard label="Active service jobs" value={svc.active_total??'—'}   sub={`${svc.ready||0} ready for pickup`}        onClick={()=>setActive('service')} />
            <StatCard label="Parts alerts"        value={partsAlerts||'—'} tone={partsAlerts>0?'var(--color-error)':undefined} sub="low + out of stock" onClick={()=>setActive('parts')} />
            {/* Net Profit this month */}
            <StatCard
              label="Net profit (month)"
              value={thisMonthPnl ? fmt(thisMonthPnl.profit) : '—'}
              tone={thisMonthPnl ? (thisMonthPnl.profit >= 0 ? 'var(--color-success)' : 'var(--color-error)') : undefined}
              sub={thisMonthPnl ? `${thisMonthPnl.margin}% margin, ${fmt(thisMonthPnl.expenses)} exp` : 'Add expenses to track'}
              onClick={()=>setActive('reports')}
            />
          </>
        )}
      </section>

      {/* Body */}
      <div className="dashboard-body-grid dash-body">

        {/* Main column */}
        <div className="dash-main">
          <h2 className="dash-greeting">{greeting}, {user?.name?.split(' ')[0]}.</h2>

          {/* Alerts */}
          {alerts.length > 0 && (
            <section className="dash-block" aria-labelledby="dash-alerts-h">
              <h3 id="dash-alerts-h" className="dash-block-head">Action needed</h3>
              <ul className="dash-alerts">
                {alerts.map((a,i)=>(
                  <AlertRow key={i} tag={a.tag} tagClass={a.cls} message={a.msg} page={a.page} onClick={()=>setActive(a.page)} />
                ))}
              </ul>
            </section>
          )}

          {/* Quick actions */}
          <section className="dash-block" aria-labelledby="dash-actions-h">
            <h3 id="dash-actions-h" className="dash-block-head">Quick actions</h3>
            <div className="dash-actions">
              <QuickAction label="New sale"       desc="4-step invoice wizard"    onClick={()=>setActive('sales')} />
              <QuickAction label="New job card"   desc="Service intake form"      onClick={()=>setActive('service')} />
              <QuickAction label="Add vehicle"    desc="Stock a new vehicle"      onClick={()=>setActive('vehicles')} />
              <QuickAction label="Parts bill"     desc="Counter sale with GST"    onClick={()=>setActive('parts')} />
              <QuickAction label="Add customer"   desc="Register new customer"    onClick={()=>setActive('customers')} />
              <QuickAction label="Reports"        desc="Revenue & analytics"      onClick={()=>setActive('reports')} />
            </div>
          </section>

          {/* At a glance */}
          <section className="dash-block" aria-labelledby="dash-glance-h">
            <h3 id="dash-glance-h" className="dash-block-head">At a glance</h3>
            <dl className="dash-glance">
              {[
                { l:'Pending service',  v:svc.pending??'—' },
                { l:'In progress',      v:svc.in_progress??'—' },
                { l:'Ready to deliver', v:svc.ready??'—', c: svc.ready > 0 ? 'var(--color-success)' : undefined },
                { l:'New vehicles',     v:vs.new??'—' },
                { l:'Pre-owned',        v:vs.used??'—' },
                { l:'Total customers',  v:raw?.customers??'—' },
              ].map(stat=>(
                <div key={stat.l} className="dash-glance-item">
                  <dt>{stat.l}</dt>
                  <dd style={stat.c ? { color: stat.c } : undefined}>{stat.v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        {/* Right: activity feed */}
        <section className="dash-feed" aria-labelledby="dash-feed-h">
          <div className="dash-feed-head">
            <h3 id="dash-feed-h" className="dash-block-head">Activity log</h3>
            <span className="dash-feed-live"><span className="dot dot-green" aria-hidden="true" />live</span>
          </div>
          <div className="dash-feed-list">
            {actLoading ? (
              Array.from({length:6}).map((_,i)=>(
                <div key={i} className="dash-feed-row">
                  <Skeleton h={12} w="80%" />
                  <Skeleton h={10} w="55%" style={{ marginTop:6 }} />
                </div>
              ))
            ) : activity?.length ? (
              activity.map((item,i)=>(
                <div key={i} className="dash-feed-row dash-feed-item">
                  <span className="mono dash-feed-time">{timeAgo(item.time)}</span>
                  <div className="dash-feed-text">
                    <div className="dash-feed-title">{item.text}</div>
                    {item.sub && <div className="dash-feed-sub">{item.sub}</div>}
                  </div>
                  <span className={`pill ${ACTIVITY_PILL[item.type]||'pill-dim'}`} style={{ flexShrink:0 }}>{item.type}</span>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <div className="empty-state-title">No activity yet.</div>
                <div className="empty-state-sub">Create a sale or service job to see activity here.</div>
              </div>
            )}
          </div>
        </section>
      </div>

      {isOwner && (
        <div className="dash-owner">
          <ManualBackupSection />
        </div>
      )}
    </div>
  );
}

// ── Manual Data Backup Section ───────────────────────────────────────────────
function ManualBackupSection() {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const res  = await backupApi.export();
      const url  = URL.createObjectURL(res.data);
      const a    = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `MMMotors_Backup_${today}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded');
    } catch (e) {
      toast.error(`Backup failed: ${e?.response?.data?.detail || e.message}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="dash-owner-item" aria-labelledby="dash-backup-h">
      <div>
        <h3 id="dash-backup-h" className="dash-owner-head">Data backup</h3>
        <p className="dash-owner-desc">
          Download full data as ZIP (Excel per collection). Store locally. Run weekly minimum.
        </p>
      </div>
      <div className="dash-owner-act">
        <Btn onClick={download} disabled={busy}>
          {busy ? 'Building…' : 'Download Backup'}
        </Btn>
      </div>
    </section>
  );
}
