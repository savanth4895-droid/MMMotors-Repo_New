import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { followupsApi, errMsg } from '../api/client';
import { Btn, GhostBtn, Field, Skeleton, Empty, ApiError } from '../components/ui';
import { useConfirm } from '../components/ConfirmModal';

const SHOP = 'MM Motors';

// ── Helpers ──────────────────────────────────────────────────────────────────
const mobile10 = m => String(m || '').replace(/\D/g, '').slice(-10);
function sendWA(mobile, msg) {
  const m = mobile10(mobile);
  if (m.length !== 10) { toast.error('No valid mobile number'); return false; }
  window.open(`https://wa.me/91${m}?text=${encodeURIComponent(msg)}`, '_blank');
  return true;
}
// Local calendar date as YYYY-MM-DD (toISOString would shift it to UTC)
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const niceDate = s => {
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
};
function whenLabel(days) {
  if (days === 0) return { text:'Today', tone:'var(--color-warn)' };
  if (days < 0)   return { text:`${-days} day${days === -1 ? '' : 's'} overdue`, tone:'var(--color-error)' };
  return { text:`in ${days} day${days === 1 ? '' : 's'}`, tone:'var(--color-muted)' };
}
const daysFromToday = s => {
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - t) / 86400000);
};
// Remembered per browser only — a convenience, so the page still works when storage is blocked
const loadText = (k, fallback) => { try { return localStorage.getItem(k) || fallback; } catch { return fallback; } };
const saveText = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

const TABS = [
  { id:'enquiries', label:'Enquiries' },
  { id:'insurance', label:'Insurance renewals' },
  { id:'greetings', label:'Birthdays & festivals' },
];

export default function FollowupsPage() {
  const [tab, setTab] = useState('enquiries');
  return (
    <div>
      <div className="tabs" role="tablist" aria-label="Follow-up lists" style={{ padding:'0 var(--space-md)' }}>
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'enquiries' && <EnquiriesTab />}
      {tab === 'insurance' && <InsuranceTab />}
      {tab === 'greetings' && <GreetingsTab />}
    </div>
  );
}

// ═══ Enquiries ═══════════════════════════════════════════════════════════════
const SOURCES = ['Walk-in', 'Phone call', 'WhatsApp', 'Referral', 'Online', 'Other'];
const ENQ_FILTERS = [
  { id:'due',       label:'To call today', params:{ due:true } },
  { id:'open',      label:'Open',          params:{ status:'open' } },
  { id:'converted', label:'Bought',        params:{ status:'converted' } },
  { id:'lost',      label:'Not interested', params:{ status:'lost' } },
  { id:'all',       label:'All',           params:{} },
];

function EnquiryForm({ initial, onSave, onCancel, saving }) {
  const [f, setF] = useState({
    name:'', mobile:'', model:'', budget:'', finance:false, source:'Walk-in', notes:'',
    follow_up_date: addDays(1), ...initial,
  });
  const s = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  return (
    <section className="page-panel" aria-labelledby="enq-form-title" style={{ display:'flex', flexDirection:'column', gap:'var(--space-md)' }}>
      <h2 id="enq-form-title" className="page-panel-title" style={{ marginBottom:0 }}>{initial?.id ? `Edit enquiry: ${initial.name}` : 'New enquiry'}</h2>
      <div className="form-grid" style={{ gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Field label="Name *"><input value={f.name} onChange={s('name')} placeholder="Customer name" /></Field>
        <Field label="Mobile *"><input value={f.mobile} onChange={s('mobile')} placeholder="10-digit mobile" inputMode="tel" /></Field>
        <Field label="Interested in"><input value={f.model} onChange={s('model')} placeholder="e.g. Activa 6G" /></Field>
        <Field label="Budget (₹)"><input type="number" min="0" value={f.budget ?? ''} onChange={s('budget')} placeholder="e.g. 85000" /></Field>
        <Field label="How they came">
          <select value={f.source} onChange={s('source')}>{SOURCES.map(x => <option key={x}>{x}</option>)}</select>
        </Field>
        <Field label="Call back on *"><input type="date" value={f.follow_up_date} onChange={s('follow_up_date')} /></Field>
      </div>
      <label style={{ display:'flex', alignItems:'center', gap:'var(--space-xs)', fontSize:'var(--text-sm)' }}>
        <input type="checkbox" checked={!!f.finance} onChange={e => setF(p => ({ ...p, finance: e.target.checked }))} />
        Wants finance / loan
      </label>
      <Field label="Notes"><textarea rows={2} value={f.notes} onChange={s('notes')} placeholder="Colour, exchange bike, what they asked about…" /></Field>
      <div className="form-actions" style={{ justifyContent:'flex-end' }}>
        <div className="form-actions-end">
          <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
          <Btn disabled={saving || !f.name.trim() || mobile10(f.mobile).length !== 10 || !f.follow_up_date}
            onClick={() => onSave({
              name: f.name.trim(), mobile: f.mobile, model: f.model.trim(), source: f.source, notes: f.notes,
              finance: !!f.finance, follow_up_date: f.follow_up_date,
              budget: f.budget === '' || f.budget == null ? null : Number(f.budget),
            })}>
            {saving ? 'Saving…' : 'Save enquiry'}
          </Btn>
        </div>
      </div>
    </section>
  );
}

function EnquiriesTab() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('due');
  const [search, setSearch] = useState('');
  const [form, setForm]     = useState(null);   // null | {} (new) | enquiry (edit)

  const fp = ENQ_FILTERS.find(x => x.id === filter).params;
  const { data, isLoading, error } = useQuery({
    queryKey: ['enquiries', filter, search],
    queryFn: () => followupsApi.enquiries({ ...fp, search: search || undefined }).then(r => r.data),
  });
  const rows = data || [];
  const refresh = () => qc.invalidateQueries(['enquiries']);

  const saveMut = useMutation({
    mutationFn: d => form?.id ? followupsApi.updateEnquiry(form.id, d) : followupsApi.createEnquiry(d),
    onSuccess: () => { refresh(); setForm(null); toast.success('Enquiry saved'); },
    onError: e => toast.error(errMsg(e, 'Could not save')),
  });
  const updMut = useMutation({
    mutationFn: ({ id, d }) => followupsApi.updateEnquiry(id, d),
    onSuccess: (r, v) => {
      refresh();
      if (v.d.status === 'converted') {
        toast(t => (
          <span>
            {r.data.name} is now a customer.{' '}
            <button type="button" className="link-btn" onClick={() => { toast.dismiss(t.id); navigate('/sales'); }}>Make the sale</button>
          </span>
        ), { duration: 8000 });
      } else if (v.d.status) toast.success('Marked not interested');
      else toast.success('Saved', { id:'enq-saved' });
    },
    onError: e => toast.error(errMsg(e, 'Could not save')),
  });
  const delMut = useMutation({
    mutationFn: id => followupsApi.deleteEnquiry(id),
    onSuccess: () => { refresh(); toast.success('Enquiry deleted'); },
    onError: e => toast.error(errMsg(e, 'Delete failed')),
  });

  if (form) return <div className="page-pad"><EnquiryForm initial={form} saving={saveMut.isPending} onCancel={() => setForm(null)} onSave={d => saveMut.mutate(d)} /></div>;

  return (
    <div>
      <div className="page-toolbar">
        <div className="chips" role="group" aria-label="Enquiry filter">
          {ENQ_FILTERS.map(x => <button key={x.id} type="button" className="chip" aria-pressed={filter === x.id} onClick={() => setFilter(x.id)}>{x.label}</button>)}
        </div>
        <div className="toolbar-end">
          <input type="search" className="page-search" aria-label="Search enquiries" placeholder="Search name, mobile, model…" value={search} onChange={e => setSearch(e.target.value)} />
          <Btn onClick={() => setForm({})}>+ New enquiry</Btn>
        </div>
      </div>
      {isLoading ? <div className="table-skeleton">{[1,2,3].map(i => <Skeleton key={i} h={44} />)}</div>
        : error ? <div className="page-pad"><ApiError error={error} /></div>
        : rows.length === 0 ? (
          filter === 'due'
            ? <Empty message="No one to call today" sub="Add walk-in and phone enquiries with New enquiry, and they show up here on their call-back date." />
            : <Empty message="No enquiries here" />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Customer</th><th>Interested in</th><th>Source</th><th>Call back</th><th>Notes</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
              <tbody>
                {rows.map(e => {
                  const open = e.status === 'open';
                  const w = open && e.follow_up_date ? whenLabel(daysFromToday(e.follow_up_date)) : null;
                  const msg = `Hello ${e.name}, this is ${SHOP}. Thank you for your interest${e.model ? ` in the ${e.model}` : ''}. Shall we arrange a test ride or share the on-road price?`;
                  return (
                    <tr key={e.id}>
                      <td><div className="cell-strong">{e.name}</div><div className="cell-sub mono">{e.mobile}</div></td>
                      <td>
                        <div>{e.model || <span className="cell-muted">Not said</span>}</div>
                        <div className="cell-sub">{[e.budget ? `₹${Number(e.budget).toLocaleString('en-IN')}` : '', e.finance ? 'Finance' : ''].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="cell-muted">{e.source}</td>
                      <td>
                        {open ? (
                          <>
                            <input type="date" aria-label={`Call back date for ${e.name}`} value={e.follow_up_date || ''}
                              onChange={ev => ev.target.value && updMut.mutate({ id: e.id, d: { follow_up_date: ev.target.value } })}
                              style={{ fontSize:'var(--text-xs)', width:'auto' }} />
                            {w && <div className="cell-sub" style={{ color:w.tone }}>{w.text}</div>}
                          </>
                        ) : (
                          <span className="pill pill-dim">{e.status === 'converted' ? 'Bought' : 'Not interested'}</span>
                        )}
                      </td>
                      <td style={{ maxWidth:220 }}><div className="cell-muted cell-clip" title={e.notes}>{e.notes}</div></td>
                      <td>
                        <div className="row-actions" style={{ justifyContent:'flex-end' }}>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => sendWA(e.mobile, msg)}>WhatsApp</button>
                          <a className="btn btn-ghost btn-sm" href={`tel:${e.mobile}`}>Call</a>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm(e)}>Edit</button>
                          {open && <button type="button" className="btn btn-ghost btn-sm" onClick={() => updMut.mutate({ id: e.id, d: { status:'converted' } })}>Bought</button>}
                          {open && <button type="button" className="btn btn-ghost btn-sm" onClick={async () => {
                            if (await confirm(`Mark ${e.name} as not interested?`, { sub:'It moves to the Not interested list.', danger:false }))
                              updMut.mutate({ id: e.id, d: { status:'lost' } });
                          }}>Not interested</button>}
                          {!open && <button type="button" className="btn btn-ghost btn-sm" onClick={() => updMut.mutate({ id: e.id, d: { status:'open', follow_up_date: addDays(0) } })}>Reopen</button>}
                          <button type="button" className="btn btn-ghost btn-sm btn-ghost-danger" onClick={async () => {
                            if (await confirm(`Delete the enquiry from ${e.name}?`, { sub:'This cannot be undone.' })) delMut.mutate(e.id);
                          }}>Delete</button>
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
  );
}

// ═══ Insurance renewals ══════════════════════════════════════════════════════
function InsuranceTab() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [days, setDays]       = useState(30);
  const [editing, setEditing] = useState(null);   // sale_id whose expiry date is being corrected

  const { data, isLoading, error } = useQuery({
    queryKey: ['insurance-due', days],
    queryFn: () => followupsApi.insurance(days).then(r => r.data),
  });
  const rows = data || [];
  const actMut = useMutation({
    mutationFn: ({ id, d }) => followupsApi.insuranceAction(id, d),
    onSuccess: (_r, v) => {
      qc.invalidateQueries(['insurance-due']);
      setEditing(null);
      if (v.d.action === 'renewed') toast.success('Marked renewed');
      if (v.d.action === 'set_expiry') toast.success('Expiry date saved');
    },
    onError: e => toast.error(errMsg(e, 'Could not save')),
  });

  return (
    <div>
      <div className="page-toolbar">
        <select aria-label="Show renewals due within" value={days} onChange={e => setDays(Number(e.target.value))} style={{ width:'auto' }}>
          {[15, 30, 60, 90].map(n => <option key={n} value={n}>Due in the next {n} days</option>)}
        </select>
        <div className="toolbar-end"><span className="toolbar-count" role="status">{rows.length} bike{rows.length === 1 ? '' : 's'}</span></div>
      </div>
      <div className="label-xs" style={{ padding:'0 var(--space-md) var(--space-xs)' }}>
        Renewal dates are one year from the insurance date on the sale (or the sale date). If a date is wrong, use Change date. Lapsed policies stay listed for 30 days.
      </div>
      {isLoading ? <div className="table-skeleton">{[1,2,3].map(i => <Skeleton key={i} h={44} />)}</div>
        : error ? <div className="page-pad"><ApiError error={error} /></div>
        : rows.length === 0 ? <Empty message={`No renewals due in the next ${days} days`} />
        : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Customer</th><th>Vehicle</th><th>Renewal due</th><th>Reminder</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
              <tbody>
                {rows.map(r => {
                  const w = whenLabel(r.days_left);
                  const msg = `Hello ${r.customer_name}, the insurance for your ${r.vehicle}${r.vehicle_number ? ` (${r.vehicle_number})` : ''} is due for renewal on ${niceDate(r.due)}. Renew it with ${SHOP} for quick, hassle-free service. Reply here or visit us.`;
                  return (
                    <tr key={r.sale_id}>
                      <td><div className="cell-strong">{r.customer_name}</div><div className="cell-sub mono">{r.customer_mobile}</div></td>
                      <td><div>{r.vehicle}</div><div className="cell-sub mono">{r.vehicle_number}</div></td>
                      <td>
                        {editing === r.sale_id ? (
                          <input type="date" aria-label={`Policy expiry date for ${r.customer_name}`} defaultValue={r.due} autoFocus
                            onChange={e => e.target.value && actMut.mutate({ id: r.sale_id, d: { action:'set_expiry', expiry: e.target.value } })}
                            onBlur={() => setEditing(null)} style={{ fontSize:'var(--text-xs)', width:'auto' }} />
                        ) : (
                          <>
                            <div className="mono">{niceDate(r.due)}</div>
                            <div className="cell-sub" style={{ color:w.tone }}>{w.text}</div>
                          </>
                        )}
                      </td>
                      <td>{r.notified ? <span className="pill pill-dim">Reminded</span> : <span className="cell-muted">Not yet</span>}</td>
                      <td>
                        <div className="row-actions" style={{ justifyContent:'flex-end' }}>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                            if (sendWA(r.customer_mobile, msg) && !r.notified) actMut.mutate({ id: r.sale_id, d: { action:'notified', due: r.due } });
                          }}>WhatsApp</button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(r.sale_id)}>Change date</button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={async () => {
                            if (await confirm(`Mark ${r.customer_name}'s insurance as renewed?`, { sub:'It leaves this list until next year\'s renewal.', danger:false }))
                              actMut.mutate({ id: r.sale_id, d: { action:'renewed', due: r.due } });
                          }}>Renewed</button>
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
  );
}

// ═══ Birthdays & festivals ═══════════════════════════════════════════════════
const FESTIVALS = ['Sankranti', 'Ugadi', 'Ramzan', 'Independence Day', 'Ganesh Chaturthi', 'Dasara', 'Diwali', 'Christmas', 'New Year'];
const BDAY_KEY = 'mm_bday_msg', FEST_KEY = 'mm_festival_msg';
const DEFAULT_BDAY = `Happy birthday {name}! Wishing you a wonderful year ahead, from all of us at ${SHOP}.`;
const DEFAULT_FEST = `Dear {name}, wishing you and your family a very happy {festival}! — ${SHOP}`;
const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);

function GreetingsTab() {
  const qc = useQueryClient();
  const [bdayMsg, setBdayMsg] = useState(() => loadText(BDAY_KEY, DEFAULT_BDAY));
  const [festMsg, setFestMsg] = useState(() => loadText(FEST_KEY, DEFAULT_FEST));
  const [festival, setFestival] = useState('Diwali');
  const [search, setSearch]     = useState('');
  const [onlyUnsent, setOnlyUnsent] = useState(true);
  const campaign = `${festival} ${new Date().getFullYear()}`;

  const bdays = useQuery({ queryKey: ['birthdays'], queryFn: () => followupsApi.birthdays(7).then(r => r.data) });
  const people = useQuery({ queryKey: ['greetings', campaign], queryFn: () => followupsApi.greetings(campaign).then(r => r.data) });
  const sentMut = useMutation({
    mutationFn: id => followupsApi.markGreetingSent({ campaign, customer_id: id }),
    onSuccess: () => qc.invalidateQueries(['greetings', campaign]),
    onError: e => toast.error(errMsg(e, 'Could not mark as sent')),
  });

  const all = people.data || [];
  const sentCount = all.filter(p => p.sent).length;
  const q = search.trim().toLowerCase();
  const shown = all.filter(p => (!onlyUnsent || !p.sent) && (!q || p.name.toLowerCase().includes(q) || p.mobile.includes(q)));

  return (
    <div className="page-pad" style={{ display:'flex', flexDirection:'column', gap:'var(--space-xl)' }}>
      {/* Birthdays */}
      <section aria-labelledby="bday-title">
        <h2 id="bday-title" className="page-panel-title">Birthdays in the next 7 days</h2>
        <Field label="Birthday message ({name} is replaced with the customer's name)">
          <textarea rows={2} value={bdayMsg} onChange={e => { setBdayMsg(e.target.value); saveText(BDAY_KEY, e.target.value); }} />
        </Field>
        {bdays.isLoading ? <Skeleton h={80} /> : bdays.error ? <ApiError error={bdays.error} />
          : (bdays.data || []).length === 0
            ? <Empty message="No birthdays in the next 7 days" sub="Add a customer's birthday under Customers → Edit." />
            : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Customer</th><th>Birthday</th><th className="num">Turns</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
                  <tbody>
                    {bdays.data.map(b => {
                      const w = b.days_left === 0 ? { text:'Today', tone:'var(--color-success)' } : whenLabel(b.days_left);
                      return (
                        <tr key={b.id}>
                          <td><div className="cell-strong">{b.name}</div><div className="cell-sub mono">{b.mobile}</div></td>
                          <td><div className="mono">{niceDate(b.date)}</div><div className="cell-sub" style={{ color:w.tone }}>{w.text}</div></td>
                          <td className="num mono">{b.age}</td>
                          <td><div className="row-actions" style={{ justifyContent:'flex-end' }}>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => sendWA(b.mobile, fill(bdayMsg, { name: b.name }))}>WhatsApp</button>
                          </div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
      </section>

      {/* Festival greetings */}
      <section aria-labelledby="fest-title">
        <h2 id="fest-title" className="page-panel-title">Festival greetings</h2>
        <div className="form-grid" style={{ gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <Field label="Festival">
            <select value={festival} onChange={e => setFestival(e.target.value)}>{FESTIVALS.map(x => <option key={x}>{x}</option>)}</select>
          </Field>
        </div>
        <Field label="Message ({name} and {festival} are filled in for each customer)">
          <textarea rows={3} value={festMsg} onChange={e => { setFestMsg(e.target.value); saveText(FEST_KEY, e.target.value); }} />
        </Field>
        <div className="page-toolbar" style={{ padding:'var(--space-sm) 0', border:0 }}>
          <input type="search" className="page-search" aria-label="Search customers" placeholder="Search name or mobile…" value={search} onChange={e => setSearch(e.target.value)} />
          <label style={{ display:'flex', alignItems:'center', gap:'var(--space-2xs)', fontSize:'var(--text-sm)' }}>
            <input type="checkbox" checked={onlyUnsent} onChange={e => setOnlyUnsent(e.target.checked)} /> Only not sent yet
          </label>
          <div className="toolbar-end"><span className="toolbar-count" role="status">{campaign}: sent to {sentCount} of {all.length}</span></div>
        </div>
        {people.isLoading ? <Skeleton h={120} /> : people.error ? <ApiError error={people.error} />
          : shown.length === 0 ? <Empty message={all.length && onlyUnsent ? `Everyone has been sent the ${festival} message` : 'No customers found'} />
          : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Customer</th><th>Mobile</th><th>Status</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
                <tbody>
                  {shown.slice(0, 300).map(p => (
                    <tr key={p.id}>
                      <td className="cell-strong">{p.name}</td>
                      <td className="mono cell-muted">{p.mobile}</td>
                      <td>{p.sent ? <span className="pill pill-dim">Sent</span> : <span className="cell-muted">Not sent</span>}</td>
                      <td><div className="row-actions" style={{ justifyContent:'flex-end' }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                          if (sendWA(p.mobile, fill(festMsg, { name: p.name, festival })) && !p.sent) sentMut.mutate(p.id);
                        }}>{p.sent ? 'Send again' : 'Send'}</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        {shown.length > 300 && <div className="label-xs" style={{ marginTop:'var(--space-xs)' }}>Showing the first 300. Send these, or search, to see the rest.</div>}
      </section>
    </div>
  );
}
