import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceApi, bookingApi, errMsg } from '../api/client';
import { useSortable, Skeleton, Empty } from '../components/ui';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';
import { useBadges, CustomerBadges } from '../hooks/useBadges';
import { useAuth } from '../context/AuthContext';
import { EditJobModal, NewJobModal } from './service/JobModals';
import { ServiceBillModal } from './service/ServiceBillModal';
import FeedbackModal from './service/FeedbackModal';
import { openWA, bikeOf, PROGRESS_MSG } from './service/shared';

// Opens WhatsApp with the customer's one-time feedback link
const sendFeedbackWA = (job, token) => {
  const link = `${window.location.origin}/feedback/${token}`;
  openWA(job.customer_mobile, `Hello ${job.customer_name}, thank you for servicing your ${bikeOf(job)} at MM Motors! Please rate your experience: ${link}`);
};

const STATUS_CFG = {
  pending:     { label:'Pending',     color:'var(--color-muted)',   bg:'var(--color-paper-2)', cls:'pill-dim'   },
  in_progress: { label:'In Progress', color:'var(--color-warn)',    bg:'color-mix(in oklab, var(--color-accent) 16%, var(--color-paper))', cls:'pill-amber' },
  ready:       { label:'Ready',       color:'var(--color-success)', bg:'color-mix(in oklab, var(--color-success) 10%, var(--color-paper))', cls:'pill-green' },
  delivered:   { label:'Delivered',   color:'var(--color-muted)',   bg:'var(--color-paper-3)', cls:'pill-dim'   },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  SERVICE PAGE  — default export (required by router)
// ═══════════════════════════════════════════════════════════════════════════════
// Owner sets how many online bookings (the public /book page) to take per day, or pauses them
const BOOKING_LIMITS = [0, 5, 10, 15, 20, 25, 30, 40, 50];

function BookingLimitSelect() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['booking-settings'], queryFn: () => bookingApi.settings().then(r => r.data) });
  const save = useMutation({
    mutationFn: n => bookingApi.saveSettings({ daily_limit: n }),
    onSuccess: (_r, n) => {
      qc.invalidateQueries(['booking-settings']);
      toast.success(n ? `Online bookings: up to ${n} a day` : 'Online booking paused');
    },
    onError: e => toast.error(errMsg(e, 'Could not save')),
  });
  if (!data) return null;
  const options = BOOKING_LIMITS.includes(data.daily_limit) ? BOOKING_LIMITS : [...BOOKING_LIMITS, data.daily_limit].sort((a, b) => a - b);
  return (
    <label style={{ display:'flex', alignItems:'center', gap:'var(--space-2xs)', fontSize:'var(--text-sm)', whiteSpace:'nowrap' }}>
      Online bookings
      <select value={data.daily_limit} disabled={save.isPending} onChange={e => save.mutate(Number(e.target.value))} style={{ width:'auto' }}>
        {options.map(n => <option key={n} value={n}>{n === 0 ? 'Off (paused)' : `${n} per day`}</option>)}
      </select>
    </label>
  );
}

export default function ServicePage() {
  const isOwner = useAuth().user?.role === 'owner';
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { byName, badgesFor } = useBadges();
  const [filter, setFilter]         = useState('all');
  const [search, setSearch]         = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [newJobOpen, setNewJobOpen]  = useState(false);
  const [billJob, setBillJob]       = useState(null);
  const [fbJob, setFbJob]           = useState(null);   // delivered job awaiting feedback choice
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
  const { sorted: sortedJobs, Th: JobTh } = useSortable(jobs, 'check_in_date', 'desc');

  // ── Client-side date filter ────────────────────────────────────────────────
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const toCheckInFormat = (yyyy_mm_dd) => {
    const [y, m, d] = yyyy_mm_dd.split('-');
    return `${parseInt(d)} ${MONTHS[parseInt(m)-1]} ${y}`;
  };
  const displayedJobs = dateFilter
    ? sortedJobs.filter(j => j.check_in_date === toCheckInFormat(dateFilter))
    : sortedJobs;

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
    onSuccess: (res) => {
      const j = res.data || {};
      // Work started / ready → progress message; delivered → ask: instant feedback or send link
      if (PROGRESS_MSG[j.status]) openWA(j.customer_mobile, PROGRESS_MSG[j.status](j));
      if (j.status === 'delivered' && j.feedback_rating == null) setFbJob(j);
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

  const STAT_TILES = [
    { key:'pending',     label:'Pending',     value:stats.pending     ||0 },
    { key:'in_progress', label:'In progress', value:stats.in_progress ||0, tone:'var(--color-warn)' },
    { key:'ready',       label:'Ready',       value:stats.ready       ||0, tone:'var(--color-success)' },
    { key:'delivered',   label:'Delivered',   value:stats.delivered   ||0 },
  ];

  return (
    <div className="svc">

      {/* ── Header ── */}
      <div className="page-head">
        <h2 className="page-head-title">Job Board</h2>
        {/* FIX #3: removed + Parts Bill button — moved to PartsPage */}
        <div className="row-actions">
          {isOwner && <BookingLimitSelect />}
          <button type="button" className="btn btn-ghost" onClick={async () => {
            const link = `${window.location.origin}/book`;
            try { await navigator.clipboard.writeText(link); toast.success(`Booking link copied: ${link}`); }
            catch { window.prompt('Copy the booking link', link); }
          }}>Copy booking link</button>
          <button type="button" onClick={() => setNewJobOpen(true)} className="btn btn-primary">
            + New Job Card
          </button>
        </div>
      </div>

      {/* ── Stat strip ── */}
      <section className="stat-strip" aria-label="Jobs by status">
        {STAT_TILES.map(s => (
          <button key={s.key} type="button"
            className="stat stat-link"
            aria-pressed={filter === s.key}
            onClick={() => setFilter(s.key)}
          >
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={s.value > 0 && s.tone ? { color:s.tone } : undefined}>{s.value}</span>
          </button>
        ))}
        <div className="stat">
          <span className="stat-label">Customer rating</span>
          <span className="stat-value">{stats.feedback_avg != null ? `★ ${stats.feedback_avg}` : '—'}</span>
          <span className="cell-sub">{stats.feedback_count || 0} responses</span>
        </div>
      </section>

      {/* ── Filter tabs + search ── */}
      <div className="page-toolbar">
        <div className="chips" role="group" aria-label="Filter by status">
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setFilter(t.key)}
              className="chip" aria-pressed={filter===t.key}>
              {t.label}
              {t.count>0 && <span className="chip-count">{t.count}</span>}
            </button>
          ))}
        </div>

        {/* ── Calendar date filter ── */}
        <div className="toolbar-end">
          {dateFilter && (
            <span className="chip chip-static" aria-pressed="true">
              {toCheckInFormat(dateFilter)}
              <button type="button" className="chip-clear" onClick={() => setDateFilter('')} aria-label="Clear date filter">×</button>
            </span>
          )}
          <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
            <button
              type="button"
              title="Filter by date"
              className="btn btn-ghost btn-sm"
              aria-pressed={!!dateFilter}
              onClick={() => document.getElementById('svc-date-pick').showPicker?.() || document.getElementById('svc-date-pick').focus()}
            >
              Date
            </button>
            <input
              id="svc-date-pick"
              type="date"
              aria-label="Filter by check-in date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              style={{
                position:'absolute', opacity:0, pointerEvents:'none',
                width:1, height:1, minHeight:0, padding:0, top:0, left:0,
              }}
            />
          </div>
          <input type="search" className="page-search" aria-label="Search jobs" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search job#, customer, vehicle…" />
        </div>
      </div>

      {/* ── Job table ── */}
      <div>
        {isLoading ? (
          <div className="table-skeleton">{[1,2,3].map(i=><Skeleton key={i} h={48}/>)}</div>
        ) : jobs.length === 0 ? (
          <Empty message={`No jobs found${filter!=='all' ? ` with status "${filter}"` : ''}.`} sub="Open a job card with New Job Card." />
        ) : displayedJobs.length === 0 ? (
          <Empty message={`No jobs on ${toCheckInFormat(dateFilter)}.`} sub="Clear the date to see every job." />
        ) : (
          <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {[['Job #','job_number'],['Customer','customer_name'],['Vehicle','vehicle_number'],['Complaint','complaint'],['Tech','technician'],['Status','status'],['Actions','']].map(([h,f],i) => (
                  <JobTh key={i} field={f||null}>{h}</JobTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedJobs.map((job) => (
                <tr key={job._id||job.id}>
                  <td>
                    <span className="mono cell-id">
                      {job.job_number || (job._id||'').slice(-6)}
                    </span>
                    {job.source === 'online' && <div><span className="pill pill-amber" title="Booked by the customer on the website">Online</span></div>}
                  </td>
                  <td>
                    <div className="cell-strong">
                      <span style={{ verticalAlign:'middle' }}>{job.customer_name}</span>
                      <CustomerBadges names={badgesFor(job.customer_mobile)} byName={byName} compact />
                    </div>
                    <div className="cell-sub">{job.customer_mobile}</div>
                  </td>
                  <td>
                    <div className="cell-strong cell-nowrap">{job.vehicle_number}</div>
                    <div className="cell-sub">{job.brand} {job.model}</div>
                  </td>
                  <td style={{ maxWidth:220 }}>
                    <div className="cell-muted cell-clip">
                      {job.complaint}
                    </div>
                    <div className="cell-sub">{job.check_in_date}</div>
                  </td>
                  <td className={job.technician ? undefined : 'cell-muted'}>
                    {job.technician || '—'}
                  </td>
                  <td>
                    <select
                      aria-label={`Status of ${job.job_number || 'job'}`}
                      className={`status-select status-${job.status || 'pending'}`}
                      value={job.status}
                      onChange={e => updateMut.mutate({ jobId: job._id||job.id, status: e.target.value })}
                    >
                      {Object.entries(STATUS_CFG).map(([k,v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                    {job.feedback_rating != null && (
                      <div className="cell-sub cell-clip" style={{ maxWidth:180, color: job.feedback_rating <= 2 ? 'var(--color-error)' : undefined }}
                        title={job.feedback_comment || undefined}>
                        ★ {job.feedback_rating}/5{job.feedback_comment ? ` · ${job.feedback_comment}` : ''}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      {job.status === 'ready' && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openWA(job.customer_mobile, PROGRESS_MSG.ready(job))}>
                          Notify
                        </button>
                      )}
                      {job.status === 'delivered' && job.feedback_rating == null && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFbJob(job)}>
                          Feedback
                        </button>
                      )}
                      <button type="button" onClick={() => setBillJob(job)}
                        className={`btn btn-ghost btn-sm${job.bill_number ? ' is-on' : ''}`}>
                        {job.bill_number ? 'View Bill' : 'Bill'}
                      </button>
                      {/* FIX #2: Edit button */}
                      <button type="button" onClick={() => setEditJob(job)} className="btn btn-ghost btn-sm">
                        Edit
                      </button>
                      {/* FIX #2: Delete button */}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-ghost-danger"
                        onClick={async () => {
                          if (await confirm(`Delete job ${job.job_number || job._id}?`, { sub: 'This cannot be undone.' }))
                            deleteMut.mutate(job._id || job.id);
                        }}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {newJobOpen && <NewJobModal   onClose={() => setNewJobOpen(false)} />}
      {billJob    && <ServiceBillModal job={billJob} onClose={() => setBillJob(null)} />}
      {fbJob      && <FeedbackModal job={fbJob} onSendLink={sendFeedbackWA} onClose={() => setFbJob(null)} />}
      {editJob    && <EditJobModal job={editJob} onClose={() => setEditJob(null)} />}
      {/* FIX #3: PartsBillModal removed — moved to PartsPage */}
    </div>
  );
}
