import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { debtApi, customersApi, errMsg} from '../api/client';
import toast from 'react-hot-toast';

// ── Style tokens ──────────────────────────────────────────────────────────────
const C = {
  accent: 'var(--accent)', red: 'var(--red)', green: 'var(--green)',
  muted: 'var(--muted)', dim: 'var(--dim)', border: 'var(--border)',
  surface: 'var(--surface)', surface2: 'var(--surface2)', text: 'var(--text)',
  blue: 'var(--blue)',
};
const inp = {
  padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 4,
  background: C.surface2, color: C.text, fontSize: 12,
  fontFamily: 'IBM Plex Sans, sans-serif', width: '100%', boxSizing: 'border-box',
};
const lb = {
  fontSize: 10, letterSpacing: '.07em', textTransform: 'uppercase',
  color: C.muted, fontWeight: 600, marginBottom: 5, display: 'block',
};
const btnPrimary = {
  padding: '9px 20px', background: C.accent, border: 'none', borderRadius: 4,
  color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'IBM Plex Sans, sans-serif',
};
const btnGhost = {
  padding: '8px 14px', background: 'transparent', border: `1px solid ${C.border}`,
  borderRadius: 4, color: C.muted, fontSize: 12, cursor: 'pointer',
  fontFamily: 'IBM Plex Sans, sans-serif',
};
const btnDanger = {
  padding: '5px 10px', background: 'transparent',
  border: '1px solid rgba(220,38,38,.35)', borderRadius: 3,
  color: C.red, fontSize: 10, cursor: 'pointer', fontFamily: 'IBM Plex Sans, sans-serif',
};

const RS = '₹';
const fmt = n => Number(n || 0).toLocaleString('en-IN');

const STATUS_CFG = {
  pending: { label: 'Pending', color: '#f59e0b', bg: 'rgba(245,158,11,.12)' },
  partial: { label: 'Partial',  color: C.blue,   bg: 'rgba(59,130,246,.12)' },
  paid:    { label: 'Paid',     color: '#22c55e', bg: 'rgba(34,197,94,.12)' },
};

function StatusPill({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending;
  return (
    <span style={{
      padding: '3px 9px', borderRadius: 3, fontSize: 10, fontWeight: 700,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33`,
      letterSpacing: '.05em', textTransform: 'uppercase', fontFamily: 'IBM Plex Sans, sans-serif',
    }}>{cfg.label}</span>
  );
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, width: 440, maxWidth: '94vw' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ background: '#141414', padding: '16px 20px', borderRadius: '8px 8px 0 0', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Record Debt</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Customer search */}
          <div style={{ position: 'relative' }}>
            <label style={lb}>Customer *</label>
            {selCust ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: 'rgba(184,134,11,.08)', border: `1px solid rgba(184,134,11,.3)`, borderRadius: 4 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{selCust.name}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{selCust.mobile}</div>
                </div>
                <button onClick={() => setSelCust(null)} style={{ ...btnGhost, padding: '3px 8px', fontSize: 10 }}>Change</button>
              </div>
            ) : (
              <>
                <input value={custSearch} onChange={e => setCustSearch(e.target.value)}
                  placeholder="Search customer name or mobile…" style={inp} autoFocus />
                {custs.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, boxShadow: '0 8px 24px rgba(0,0,0,.3)' }}>
                    {custs.map(c => (
                      <div key={c.id} onClick={() => { setSelCust(c); setCustSearch(''); }}
                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: `1px solid ${C.border}` }}
                        onMouseEnter={e => e.currentTarget.style.background = C.surface2}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: 10, color: C.muted }}>{c.mobile}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lb}>Amount (₹) *</label>
              <input type="number" value={form.amount} onChange={upd('amount')} placeholder="0" style={inp} />
            </div>
            <div>
              <label style={lb}>Due Date</label>
              <input type="date" value={form.due_date} onChange={upd('due_date')} style={inp} />
            </div>
          </div>
          <div>
            <label style={lb}>Description / Reason</label>
            <textarea value={form.description} onChange={upd('description')} rows={2}
              placeholder="e.g. Vehicle sale balance, service bill pending…"
              style={{ ...inp, resize: 'vertical', fontFamily: 'IBM Plex Sans, sans-serif' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button onClick={onClose} style={btnGhost}>Cancel</button>
            <button onClick={() => mut.mutate()} disabled={mut.isPending || !selCust || !form.amount}
              style={{ ...btnPrimary, opacity: mut.isPending || !selCust || !form.amount ? .5 : 1 }}>
              {mut.isPending ? 'Saving…' : 'Record Debt'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Record Payment Modal ──────────────────────────────────────────────────────
function PaymentModal({ debt, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    amount: '', notes: '', paid_date: new Date().toISOString().slice(0, 10),
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, width: 380, maxWidth: '94vw' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ background: '#141414', padding: '16px 20px', borderRadius: '8px 8px 0 0', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Record Payment</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{debt.customer_name} — Balance: {RS}{fmt(debt.balance)}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lb}>Payment Amount (₹) *</label>
              <input type="number" value={form.amount} onChange={upd('amount')}
                placeholder={`Max ${fmt(debt.balance)}`} style={inp} autoFocus />
            </div>
            <div>
              <label style={lb}>Date</label>
              <input type="date" value={form.paid_date} onChange={upd('paid_date')} style={inp} />
            </div>
          </div>
          <div>
            <label style={lb}>Notes</label>
            <input value={form.notes} onChange={upd('notes')} placeholder="Cash / UPI / Cheque…" style={inp} />
          </div>
          {form.amount && (
            <div style={{ padding: '10px 12px', background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.25)', borderRadius: 4, fontSize: 12 }}>
              Remaining after payment: <strong style={{ color: '#22c55e' }}>
                {RS}{fmt(Math.max(debt.balance - parseFloat(form.amount || 0), 0))}
              </strong>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onClose} style={btnGhost}>Cancel</button>
            <button onClick={() => mut.mutate()} disabled={mut.isPending || !form.amount}
              style={{ ...btnPrimary, opacity: mut.isPending || !form.amount ? .5 : 1 }}>
              {mut.isPending ? 'Saving…' : 'Record Payment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Debt Detail Panel ─────────────────────────────────────────────────────────
function DebtDetail({ debt, onClose, onPayment }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, width: 480, maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ background: '#141414', padding: '16px 20px', borderRadius: '8px 8px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{debt.customer_name}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{debt.customer_mobile} · {debt.created_at?.slice(0, 10)}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: 20 }}>
          {/* Amounts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[
              ['Total Debt',    fmt(debt.amount),   C.accent],
              ['Paid',          fmt(debt.paid),     '#22c55e'],
              ['Balance Due',   fmt(debt.balance),  debt.balance > 0 ? C.red : '#22c55e'],
            ].map(([l, v, c]) => (
              <div key={l} style={{ padding: '12px 14px', background: C.surface2, borderRadius: 6, border: `1px solid ${C.border}`, textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: C.muted, letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 6 }}>{l}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{RS}{v}</div>
              </div>
            ))}
          </div>

          {/* Details */}
          {[
            ['Description', debt.description || '—'],
            ['Due Date',    debt.due_date    || '—'],
            ['Status',      <StatusPill status={debt.status} />],
            ['Source',      debt.source      || 'manual'],
          ].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ width: 130, fontSize: 11, color: C.muted, flexShrink: 0 }}>{l}</div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{v}</div>
            </div>
          ))}

          {/* Payment history */}
          {debt.payments?.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 10, letterSpacing: '.07em', textTransform: 'uppercase', color: C.muted, fontWeight: 700, marginBottom: 10 }}>Payment History</div>
              {debt.payments.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 4, marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#22c55e' }}>{RS}{fmt(p.amount)}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{p.notes || '—'}</div>
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, textAlign: 'right' }}>
                    <div>{p.paid_date}</div>
                    <div>{p.recorded_by}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {debt.balance > 0 && (
            <div style={{ marginTop: 20 }}>
              <button onClick={() => { onClose(); onPayment(debt); }} style={{ ...btnPrimary, width: '100%', textAlign: 'center' }}>
                + Collect Payment
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DebtPage() {
  const qc = useQueryClient();
  const [showAdd,      setShowAdd]      = useState(false);
  const [payDebt,      setPayDebt]      = useState(null);
  const [viewDebt,     setViewDebt]     = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [search,       setSearch]       = useState('');

  const { data: debtsRaw, isLoading } = useQuery({
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

  // Summary stats
  const totalDebt    = allDebts.reduce((s, d) => s + (d.amount  || 0), 0);
  const totalPaid    = allDebts.reduce((s, d) => s + (d.paid    || 0), 0);
  const totalBalance = allDebts.reduce((s, d) => s + (d.balance || 0), 0);
  const pendingCount = allDebts.filter(d => d.status !== 'paid').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {[
          { l: 'Total Debt',     v: `${RS}${fmt(totalDebt)}`,    c: C.accent },
          { l: 'Collected',      v: `${RS}${fmt(totalPaid)}`,    c: '#22c55e' },
          { l: 'Balance Due',    v: `${RS}${fmt(totalBalance)}`, c: C.red },
          { l: 'Pending Entries',v: pendingCount,                c: C.text },
        ].map((s, i) => (
          <div key={i} style={{ padding: '14px 20px', borderRight: i < 3 ? `1px solid ${C.border}` : 0 }}>
            <div style={{ fontSize: 10, letterSpacing: '.07em', textTransform: 'uppercase', color: C.muted, fontWeight: 600 }}>{s.l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.c, marginTop: 6, fontFamily: 'display' }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search customer, mobile, description…"
          style={{ ...inp, width: 260 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'pending', 'partial', 'paid'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              style={{
                padding: '6px 12px', borderRadius: 3, fontSize: 10, cursor: 'pointer',
                fontFamily: 'IBM Plex Sans, sans-serif', letterSpacing: '.05em',
                background: filterStatus === s ? C.surface2 : 'transparent',
                border: `1px solid ${filterStatus === s ? C.accent : C.border}`,
                color: filterStatus === s ? C.accent : C.muted,
                textTransform: 'uppercase',
              }}>{s}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ Record Debt</button>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <div style={{ padding: 24, color: C.muted, fontSize: 12 }}>Loading…</div>
        ) : debts.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontSize: 12 }}>
            {search || filterStatus !== 'all' ? 'No matching records' : 'No debts recorded yet'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Customer', 'Description', 'Total Debt', 'Paid', 'Balance', 'Due Date', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 10, letterSpacing: '.07em', color: C.dim, fontWeight: 600, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {debts.map(d => (
                <tr key={d.id} style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = C.surface2}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => setViewDebt(d)}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{d.customer_name}</div>
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: 'monospace' }}>{d.customer_mobile}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 11, color: C.muted, maxWidth: 200 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.description || '—'}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: 'monospace' }}>
                    {RS}{fmt(d.amount)}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#22c55e', fontFamily: 'monospace' }}>
                    {RS}{fmt(d.paid)}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 800, color: d.balance > 0 ? C.red : '#22c55e', fontFamily: 'monospace' }}>
                    {RS}{fmt(d.balance)}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 11, color: d.due_date && new Date(d.due_date) < new Date() && d.status !== 'paid' ? C.red : C.muted }}>
                    {d.due_date || '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <StatusPill status={d.status} />
                  </td>
                  <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {d.balance > 0 && (
                        <button onClick={() => setPayDebt(d)}
                          style={{ padding: '5px 10px', background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 3, color: '#22c55e', fontSize: 10, cursor: 'pointer', fontWeight: 700, fontFamily: 'IBM Plex Sans, sans-serif' }}>
                          Collect
                        </button>
                      )}
                      <button onClick={() => window.confirm(`Delete debt for ${d.customer_name}?`) && deleteMut.mutate(d.id)}
                        style={btnDanger}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showAdd  && <AddDebtModal    onClose={() => setShowAdd(false)} />}
      {payDebt  && <PaymentModal    debt={payDebt}  onClose={() => setPayDebt(null)} />}
      {viewDebt && <DebtDetail      debt={viewDebt} onClose={() => setViewDebt(null)} onPayment={d => setPayDebt(d)} />}
    </div>
  );
}
