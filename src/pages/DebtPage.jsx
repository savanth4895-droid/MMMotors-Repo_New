import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { debtApi, customersApi, errMsg} from '../api/client';
import { Btn, Field, Skeleton, Empty, ApiError } from '../components/ui';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';
import { todayYmd } from '../utils/date';

const RS = '₹';
const fmt = n => Number(n || 0).toLocaleString('en-IN');

const STATUS_CFG = {
  pending: { label: 'Pending', cls: 'pill-amber' },
  partial: { label: 'Partial', cls: 'pill-blue' },
  paid:    { label: 'Paid',    cls: 'pill-green' },
};

function StatusPill({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending;
  return <span className={`pill ${cfg.cls}`}>{cfg.label}</span>;
}

// ── Add Debt Modal ────────────────────────────────────────────────────────────
function AddDebtModal({ onClose }) {
  const qc = useQueryClient();
  const [custSearch, setCustSearch] = useState('');
  const [selCust, setSelCust] = useState(null);
  const [form, setForm] = useState({ amount: '', description: '', due_date: '' });
  const upd = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const { data: custData } = useQuery({
    queryKey: ['cust-search-debt', custSearch],
    queryFn: () => customersApi.list({ search: custSearch, limit: 8 }).then(r => r.data),
    enabled: custSearch.length > 1,
  });
  const custs = Array.isArray(custData) ? custData : (custData?.items || []);

  const mut = useMutation({
    mutationFn: () => debtApi.create({
      customer_id:  selCust.id,
      amount:       parseFloat(form.amount),
      description:  form.description,
      due_date:     form.due_date,
    }),
    onSuccess: () => {
      toast.success('Debt recorded');
      qc.invalidateQueries(['debts']);
      qc.invalidateQueries(['debt-summary']);
      onClose();
    },
    onError: e => toast.error(errMsg(e, 'Failed')),
  });

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog record" role="dialog" aria-modal="true" aria-labelledby="add-debt-title" style={{ maxWidth: 440 }}
        onClick={e => e.stopPropagation()}>
        <div className="record-head">
          <h2 id="add-debt-title" className="record-title">Record debt</h2>
          <button type="button" className="record-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="record-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', paddingTop: 'var(--space-lg)' }}>
          {/* Customer search */}
          <div style={{ position: 'relative' }}>
            <Field label="Customer *">
              {selCust ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-sm)', padding: 'var(--space-xs) var(--space-sm)', background: 'color-mix(in oklab, var(--color-accent) 12%, var(--color-paper))', borderRadius: 'var(--radius-control)' }}>
                  <div>
                    <div className="cell-strong">{selCust.name}</div>
                    <div className="cell-sub mono">{selCust.mobile}</div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelCust(null)}>Change</button>
                </div>
              ) : (
                <input aria-label="Search customer" value={custSearch} onChange={e => setCustSearch(e.target.value)}
                  placeholder="Search customer name or mobile…" autoFocus />
              )}
            </Field>
            {!selCust && custs.length > 0 && (
              <div role="listbox" aria-label="Matching customers" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: 'var(--space-3xs)', background: 'var(--color-paper)', border: '1px solid var(--color-rule-2)', borderRadius: 'var(--radius-control)', boxShadow: '0 8px 20px -8px color-mix(in oklab, var(--color-ink) 24%, transparent)', overflow: 'hidden' }}>
                {custs.map(c => (
                  <button type="button" role="option" aria-selected="false" key={c.id} onClick={() => { setSelCust(c); setCustSearch(''); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: 'var(--space-xs) var(--space-sm)', background: 'transparent', border: 0, borderBottom: '1px solid var(--color-rule)', color: 'var(--color-ink)', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-paper-2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div className="cell-strong">{c.name}</div>
                    <div className="cell-sub mono">{c.mobile}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="form-grid">
            <Field label="Amount (₹) *">
              <input type="number" value={form.amount} onChange={upd('amount')} placeholder="0" />
            </Field>
            <Field label="Due date">
              <input type="date" value={form.due_date} onChange={upd('due_date')} />
            </Field>
          </div>
          <Field label="Description or reason">
            <textarea value={form.description} onChange={upd('description')} rows={2}
              placeholder="e.g. Vehicle sale balance, service bill pending…" />
          </Field>
        </div>
        <div className="record-foot sheet-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => mut.mutate()} disabled={mut.isPending || !selCust || !form.amount}>
            {mut.isPending ? 'Saving…' : 'Record debt'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Record Payment Modal ──────────────────────────────────────────────────────
function PaymentModal({ debt, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    amount: '', notes: '', paid_date: todayYmd(),
  });
  const upd = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const mut = useMutation({
    mutationFn: () => debtApi.addPayment(debt.id, {
      amount:    parseFloat(form.amount),
      notes:     form.notes,
      paid_date: form.paid_date,
    }),
    onSuccess: () => {
      toast.success('Payment recorded');
      qc.invalidateQueries(['debts']);
      qc.invalidateQueries(['debt-summary']);
      onClose();
    },
    onError: e => toast.error(errMsg(e, 'Failed')),
  });

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog record" role="dialog" aria-modal="true" aria-labelledby="pay-debt-title" style={{ maxWidth: 420 }}
        onClick={e => e.stopPropagation()}>
        <div className="record-head">
          <div>
            <h2 id="pay-debt-title" className="record-title">Record payment</h2>
            <div className="record-id">{debt.customer_name}, balance {RS}{fmt(debt.balance)}</div>
          </div>
          <button type="button" className="record-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="record-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', paddingTop: 'var(--space-lg)' }}>
          <div className="form-grid">
            <Field label="Payment amount (₹) *">
              <input type="number" value={form.amount} onChange={upd('amount')}
                placeholder={`Max ${fmt(debt.balance)}`} autoFocus />
            </Field>
            <Field label="Date">
              <input type="date" value={form.paid_date} onChange={upd('paid_date')} />
            </Field>
          </div>
          <Field label="Notes">
            <input value={form.notes} onChange={upd('notes')} placeholder="Cash / UPI / Cheque…" />
          </Field>
          {form.amount && (
            <div className="notice" role="status" style={{ marginTop: 0 }}>
              Remaining after payment: <strong style={{ color: 'var(--color-success)' }}>
                {RS}{fmt(Math.max(debt.balance - parseFloat(form.amount || 0), 0))}
              </strong>
            </div>
          )}
        </div>
        <div className="record-foot sheet-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => mut.mutate()} disabled={mut.isPending || !form.amount}>
            {mut.isPending ? 'Saving…' : 'Record payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Debt Detail Panel ─────────────────────────────────────────────────────────
function DebtDetail({ debt, onClose, onPayment }) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog record" role="dialog" aria-modal="true" aria-labelledby="debt-detail-title"
        onClick={e => e.stopPropagation()}>
        <div className="record-head">
          <div>
            <h2 id="debt-detail-title" className="record-title">{debt.customer_name}</h2>
            <div className="record-id"><span className="mono">{debt.customer_mobile}</span>, recorded {debt.created_at?.slice(0, 10)}</div>
          </div>
          <button type="button" className="record-close" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <div className="record-body">
          {/* Amounts */}
          <section className="stat-strip" aria-label="Debt amounts" style={{ margin: '0 calc(var(--space-lg) * -1) var(--space-sm)' }}>
            {[
              ['Total debt',  fmt(debt.amount),  undefined],
              ['Paid',        fmt(debt.paid),    undefined],
              ['Balance due', fmt(debt.balance), debt.balance > 0 ? 'var(--color-error)' : 'var(--color-success)'],
            ].map(([l, v, c]) => (
              <div key={l} className="stat">
                <span className="stat-label">{l}</span>
                <span className="stat-value" style={c ? { color: c } : undefined}>{RS}{v}</span>
              </div>
            ))}
          </section>

          {/* Details */}
          <dl className="record-list">
            {[
              ['Description', debt.description || 'None'],
              ['Due date',    debt.due_date    || 'Not set'],
              ['Status',      <StatusPill status={debt.status} />],
              ['Source',      debt.source      || 'manual'],
            ].map(([l, v]) => (
              <div key={l} className="record-row">
                <dt>{l}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>

          {/* Payment history */}
          {debt.payments?.length > 0 && (
            <div style={{ marginTop: 'var(--space-lg)' }}>
              <h3 className="sheet-sec">Payment history</h3>
              {debt.payments.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-md)', padding: 'var(--space-xs) var(--space-sm)', background: 'color-mix(in oklab, var(--color-success) 7%, var(--color-paper))', borderRadius: 'var(--radius-control)', marginBottom: 'var(--space-2xs)' }}>
                  <div>
                    <div className="cell-amount" style={{ color: 'var(--color-success)' }}>{RS}{fmt(p.amount)}</div>
                    <div className="cell-sub">{p.notes || 'No notes'}</div>
                  </div>
                  <div className="cell-sub" style={{ marginTop: 0, textAlign: 'right' }}>
                    <div>{p.paid_date}</div>
                    <div>{p.recorded_by}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {debt.balance > 0 && (
          <div className="record-foot sheet-foot">
            <button type="button" className="btn btn-primary" onClick={() => { onClose(); onPayment(debt); }}>
              Collect payment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DebtPage() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [showAdd,      setShowAdd]      = useState(false);
  const [payDebt,      setPayDebt]      = useState(null);
  const [viewDebt,     setViewDebt]     = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [search,       setSearch]       = useState('');

  const { data: debtsRaw, isLoading, error } = useQuery({
    queryKey: ['debts', filterStatus],
    queryFn: () => debtApi.list({
      status: filterStatus !== 'all' ? filterStatus : undefined,
      limit:  500,
    }).then(r => r.data),
  });
  const allDebts = Array.isArray(debtsRaw) ? debtsRaw : [];

  const debts = allDebts.filter(d =>
    !search ||
    d.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.customer_mobile?.includes(search) ||
    d.description?.toLowerCase().includes(search.toLowerCase())
  );

  const deleteMut = useMutation({
    mutationFn: id => debtApi.delete(id),
    onSuccess: () => { qc.invalidateQueries(['debts']); qc.invalidateQueries(['debt-summary']); toast.success('Deleted'); },
    onError: () => toast.error('Delete failed'),
  });

  // Summary stats cover the whole ledger, whatever the status filter shows.
  // /debts/summary groups by status: [{ _id: status, total_amount, total_balance, count }].
  const { data: summaryRaw } = useQuery({
    queryKey: ['debt-summary'],
    queryFn: () => debtApi.summary().then(r => r.data),
  });
  const summaryRows = Array.isArray(summaryRaw) ? summaryRaw : null;
  const totalDebt    = summaryRows
    ? summaryRows.reduce((s, r) => s + (r.total_amount  || 0), 0)
    : allDebts.reduce((s, d) => s + (d.amount  || 0), 0);
  const totalBalance = summaryRows
    ? summaryRows.reduce((s, r) => s + (r.total_balance || 0), 0)
    : allDebts.reduce((s, d) => s + (d.balance || 0), 0);
  const totalPaid    = summaryRows
    ? totalDebt - totalBalance
    : allDebts.reduce((s, d) => s + (d.paid    || 0), 0);
  const pendingCount = summaryRows
    ? summaryRows.filter(r => r._id !== 'paid').reduce((s, r) => s + (r.count || 0), 0)
    : allDebts.filter(d => d.status !== 'paid').length;

  const FILTER_LABEL = { all: 'All', pending: 'Pending', partial: 'Partial', paid: 'Paid' };

  return (
    <div>
      {/* Stats bar */}
      <section className="stat-strip" aria-label="Debt totals">
        {[
          { l: 'Total debt',      v: `${RS}${fmt(totalDebt)}` },
          { l: 'Collected',       v: `${RS}${fmt(totalPaid)}` },
          { l: 'Balance due',     v: `${RS}${fmt(totalBalance)}`, c: totalBalance > 0 ? 'var(--color-error)' : undefined },
          { l: 'Pending entries', v: pendingCount },
        ].map((s, i) => (
          <div key={i} className="stat">
            <span className="stat-label">{s.l}</span>
            <span className="stat-value" style={s.c ? { color: s.c } : undefined}>{s.v}</span>
          </div>
        ))}
      </section>

      {/* Toolbar */}
      <div className="page-toolbar">
        <input type="search" className="page-search" aria-label="Search debts" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search customer, mobile, description…" />
        <div className="chips" role="group" aria-label="Status">
          {['all', 'pending', 'partial', 'paid'].map(s => (
            <button key={s} type="button" className="chip" aria-pressed={filterStatus === s} onClick={() => setFilterStatus(s)}>
              {FILTER_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="toolbar-end">
          <Btn onClick={() => setShowAdd(true)}>+ Record debt</Btn>
        </div>
      </div>

      {/* Table */}
      {error ? (
        <div style={{ padding: 'var(--space-lg)' }}><ApiError error={error} /></div>
      ) : isLoading ? (
        <div className="table-skeleton">{[1, 2, 3].map(i => <Skeleton key={i} h={44} />)}</div>
      ) : debts.length === 0 ? (
        search || filterStatus !== 'all'
          ? <Empty message="No matching records" sub="Clear the search or pick All to see more." />
          : <Empty message="No debts recorded yet" sub="Add one with Record debt." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {['Customer', 'Description', 'Total debt', 'Paid', 'Balance', 'Due date', 'Status', ''].map(h => (
                  <th key={h} className={['Total debt', 'Paid', 'Balance'].includes(h) ? 'num' : undefined}>
                    {h || <span className="visually-hidden">Actions</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {debts.map(d => (
                <tr key={d.id} style={{ cursor: 'pointer' }}
                  onClick={() => setViewDebt(d)}>
                  <td>
                    <div className="cell-strong">{d.customer_name}</div>
                    <div className="cell-sub mono">{d.customer_mobile}</div>
                  </td>
                  <td className="cell-muted" style={{ maxWidth: 200 }}>
                    <div className="cell-clip">{d.description || 'None'}</div>
                  </td>
                  <td className="num cell-amount">
                    {RS}{fmt(d.amount)}
                  </td>
                  <td className="num cell-muted">
                    {RS}{fmt(d.paid)}
                  </td>
                  <td className="num cell-amount" style={d.balance > 0 ? { color: 'var(--color-error)' } : undefined}>
                    {RS}{fmt(d.balance)}
                  </td>
                  <td className="cell-nowrap" style={{ color: d.due_date && new Date(d.due_date) < new Date() && d.status !== 'paid' ? 'var(--color-error)' : 'var(--color-muted)' }}>
                    {d.due_date || 'Not set'}
                  </td>
                  <td>
                    <StatusPill status={d.status} />
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="row-actions" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
                      {d.balance > 0 && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPayDebt(d)}>
                          Collect
                        </button>
                      )}
                      <button type="button" className="btn btn-ghost btn-sm btn-ghost-danger" aria-label={`Delete debt for ${d.customer_name}`}
                        onClick={async () => { if (await confirm(`Delete debt for ${d.customer_name}?`)) deleteMut.mutate(d.id); }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showAdd  && <AddDebtModal    onClose={() => setShowAdd(false)} />}
      {payDebt  && <PaymentModal    debt={payDebt}  onClose={() => setPayDebt(null)} />}
      {viewDebt && <DebtDetail      debt={viewDebt} onClose={() => setViewDebt(null)} onPayment={d => setPayDebt(d)} />}
    </div>
  );
}
