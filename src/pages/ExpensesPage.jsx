import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { expensesApi, errMsg } from '../api/client';
import { useSortable, Btn, GhostBtn, Field, Skeleton, Empty, ApiError } from '../components/ui';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';
import { todayYmd } from '../utils/date';

const CATEGORIES = [
  'Staff Salaries','Rent & Utilities','Vehicle Purchase',
  'Parts & Consumables','RTO & Insurance','Transport & Logistics',
  'Marketing & Advertising','Bank Charges & Loan EMI',
  'Equipment & Maintenance','Miscellaneous',
];

const RS = '₹';
const fmt = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtK = n => {
  if (n >= 100000) return `${RS}${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `${RS}${(n / 1000).toFixed(1)}K`;
  return `${RS}${Math.round(n)}`;
};

// ── Expense Form (add / edit) ─────────────────────────────────────────────────
function ExpenseForm({ initial = {}, onSave, onCancel, saving }) {
  const today = todayYmd();
  const [f, setF] = useState({
    date:         initial.date         || today,
    category:     initial.category     || CATEGORIES[0],
    sub_category: initial.sub_category || '',
    amount:       initial.amount       || '',
    description:  initial.description  || '',
    vendor:       initial.vendor       || '',
    payment_mode: initial.payment_mode || 'Cash',
    receipt_no:   initial.receipt_no   || '',
    notes:        initial.notes        || '',
  });
  const s = k => e => setF(p => ({ ...p, [k]: e.target.value }));

  return (
    <div className="sale-form">
      <div className="form-grid form-grid-2col">
        <Field label="Date *">
          <input type="date" value={f.date} onChange={s('date')} />
        </Field>
        <Field label="Amount (₹) *">
          <input type="number" value={f.amount} onChange={s('amount')} placeholder="0" />
        </Field>
        <Field label="Category *">
          <select value={f.category} onChange={s('category')}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Payment mode">
          <select value={f.payment_mode} onChange={s('payment_mode')}>
            {['Cash','UPI','Bank Transfer','Cheque','Card'].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Description">
          <input value={f.description} onChange={s('description')} placeholder="What was this expense for?" />
        </Field>
        <Field label="Vendor or paid to">
          <input value={f.vendor} onChange={s('vendor')} placeholder="Supplier, landlord, staff…" />
        </Field>
        <Field label="Receipt no.">
          <input value={f.receipt_no} onChange={s('receipt_no')} placeholder="R001" className="mono" />
        </Field>
        <Field label="Sub-category">
          <input value={f.sub_category} onChange={s('sub_category')} placeholder="Optional" />
        </Field>
      </div>
      <Field label="Notes">
        <input value={f.notes} onChange={s('notes')} placeholder="Additional notes" />
      </Field>
      <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
        <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
        <Btn onClick={() => onSave({ ...f, amount: parseFloat(f.amount) || 0 })}
          disabled={!f.date || !f.amount || !f.category || saving}>
          {saving ? 'Saving…' : 'Save expense'}
        </Btn>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ExpensesPage() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const now = new Date();
  const [monthFilter, setMonthFilter] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  const [catFilter,   setCatFilter]   = useState('');
  const [search,      setSearch]      = useState('');
  const [showForm,    setShowForm]    = useState(false);
  const [editExp,     setEditExp]     = useState(null);

  const { data: raw, isLoading, error } = useQuery({
    queryKey: ['expenses', monthFilter, catFilter, search],
    queryFn: () => expensesApi.list({
      month:    monthFilter || undefined,
      category: catFilter   || undefined,
      search:   search      || undefined,
      limit: 500,
    }).then(r => r.data),
    refetchInterval: 30_000,
  });
  const expenses = Array.isArray(raw) ? raw : [];
  const { sorted, Th } = useSortable(expenses, 'date', 'desc');

  const createMut = useMutation({
    mutationFn: d => expensesApi.create(d),
    onSuccess: () => { qc.invalidateQueries(['expenses']); setShowForm(false); toast.success('Expense added'); },
    onError: e => toast.error(errMsg(e, 'Failed to add')),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => expensesApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries(['expenses']); setEditExp(null); toast.success('Updated'); },
    onError: e => toast.error(errMsg(e, 'Update failed')),
  });
  const deleteMut = useMutation({
    mutationFn: id => expensesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries(['expenses']); toast.success('Deleted'); },
    onError: e => toast.error(errMsg(e, 'Delete failed')),
  });

  // Monthly totals
  const total    = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const byCat    = expenses.reduce((m, e) => {
    m[e.category] = (m[e.category] || 0) + e.amount;
    return m;
  }, {});
  const topCat   = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // Build last 12 months for selector
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const label = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    return { key, label };
  });

  return (
    <div>
      {/* Stats bar */}
      <section className="stat-strip" aria-label="Expense summary">
        <div className="stat">
          <span className="stat-label">Total this period</span>
          <span className="stat-value">{fmtK(total)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Entries</span>
          <span className="stat-value">{expenses.length}</span>
        </div>
        {topCat.slice(0, 2).map(([cat, amt]) => (
          <div key={cat} className="stat">
            <span className="stat-label cell-clip">{cat}</span>
            <span className="stat-value">{fmtK(amt)}</span>
          </div>
        ))}
      </section>

      {/* Add form */}
      {showForm && (
        <section className="page-panel" aria-labelledby="add-exp-title">
          <h2 id="add-exp-title" className="page-panel-title">Add expense</h2>
          <ExpenseForm onSave={d => createMut.mutate(d)} onCancel={() => setShowForm(false)} saving={createMut.isPending} />
        </section>
      )}

      {/* Edit modal */}
      {editExp && (
        <div className="dialog-backdrop" onClick={() => setEditExp(null)}>
          <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="edit-exp-title" style={{ maxWidth: 600 }}
            onClick={e => e.stopPropagation()}>
            <h2 id="edit-exp-title" className="dialog-title" style={{ marginBottom: 0 }}>Edit expense</h2>
            <p className="dialog-sub" style={{ marginBottom: 'var(--space-md)' }}>{editExp.date}, {editExp.category}</p>
            <ExpenseForm
              initial={editExp}
              onSave={d => updateMut.mutate({ id: editExp.id, data: d })}
              onCancel={() => setEditExp(null)}
              saving={updateMut.isPending}
            />
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="page-toolbar">
        <select aria-label="Month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} style={{ width: 160 }}>
          <option value="">All months</option>
          {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <select aria-label="Category" value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ width: 200 }}>
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="search" className="page-search" aria-label="Search expenses" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search description, vendor…" style={{ width: 'min(240px, 100%)' }} />
        <span className="toolbar-count" role="status">{expenses.length} entries</span>
        {!showForm && (
          <Btn onClick={() => setShowForm(true)}>+ Add expense</Btn>
        )}
      </div>

      {/* Category pills summary */}
      {Object.keys(byCat).length > 0 && (
        <div className="page-toolbar">
          <div className="chips" role="group" aria-label="Spend by category">
            {Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([cat, amt]) => (
              <button key={cat} type="button" className="chip" aria-pressed={catFilter===cat} onClick={() => setCatFilter(catFilter===cat?'':cat)}>
                {cat} <span className="chip-count">{fmtK(amt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      {error ? (
        <div style={{ padding: 'var(--space-lg)' }}><ApiError error={error} /></div>
      ) : isLoading ? (
        <div className="table-skeleton">{[1, 2, 3].map(i => <Skeleton key={i} h={44} />)}</div>
      ) : sorted.length === 0 ? (
        <Empty message="No expenses found" sub="Pick another month or category, or add one with Add expense." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {[['Date','date'],['Category','category'],['Description','description'],['Vendor','vendor'],['Amount','amount'],['Payment','payment_mode'],['Receipt','receipt_no'],['']].map(([h,f]) => (
                  <Th key={h} field={f||null} className={f === 'amount' ? 'num' : undefined}>{h || <span className="visually-hidden">Actions</span>}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(e => (
                <tr key={e.id}>
                  <td className="mono cell-muted cell-nowrap">{e.date}</td>
                  <td>
                    <span className="pill pill-dim">{e.category}</span>
                    {e.sub_category && <div className="cell-sub">{e.sub_category}</div>}
                  </td>
                  <td style={{ maxWidth: 200 }}>
                    <div className="cell-clip">{e.description || 'None'}</div>
                  </td>
                  <td className="cell-muted">{e.vendor || 'None'}</td>
                  <td className="num cell-amount">
                    {RS}{fmt(e.amount)}
                  </td>
                  <td>
                    <span className="pill pill-dim">{e.payment_mode}</span>
                  </td>
                  <td className="mono cell-id">{e.receipt_no || 'None'}</td>
                  <td>
                    <div className="row-actions" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
                      <GhostBtn sm onClick={() => setEditExp(e)}>Edit</GhostBtn>
                      <button type="button" className="btn btn-ghost btn-sm btn-ghost-danger" aria-label={`Delete expense of ${RS}${fmt(e.amount)}`}
                        onClick={async () => { if (await confirm(`Delete this expense (${RS}${fmt(e.amount)})?`)) deleteMut.mutate(e.id); }}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--color-paper-2)' }}>
                <td colSpan={4} className="cell-strong" style={{ borderTop: '1px solid var(--color-rule-2)' }}>
                  Total: {expenses.length} entries
                </td>
                <td className="num cell-amount" style={{ borderTop: '1px solid var(--color-rule-2)', fontSize: 'var(--text-md)' }}>
                  {RS}{fmt(total)}
                </td>
                <td colSpan={3} style={{ borderTop: '1px solid var(--color-rule-2)' }} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
