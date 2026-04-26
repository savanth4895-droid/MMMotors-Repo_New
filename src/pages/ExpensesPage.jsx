import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { expensesApi, errMsg } from '../api/client';
import { useSortable } from '../components/ui';
import toast from 'react-hot-toast';

const CATEGORIES = [
  'Staff Salaries','Rent & Utilities','Vehicle Purchase',
  'Parts & Consumables','RTO & Insurance','Transport & Logistics',
  'Marketing & Advertising','Bank Charges & Loan EMI',
  'Equipment & Maintenance','Miscellaneous',
];
const CAT_COLOR = {
  'Staff Salaries':          '#f59e0b',
  'Rent & Utilities':        '#3b82f6',
  'Vehicle Purchase':        '#8b5cf6',
  'Parts & Consumables':     '#10b981',
  'RTO & Insurance':         '#06b6d4',
  'Transport & Logistics':   '#f97316',
  'Marketing & Advertising': '#ec4899',
  'Bank Charges & Loan EMI': '#ef4444',
  'Equipment & Maintenance': '#84cc16',
  'Miscellaneous':           '#6b7280',
};

const RS = '₹';
const fmt = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtK = n => {
  if (n >= 100000) return `${RS}${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `${RS}${(n / 1000).toFixed(1)}K`;
  return `${RS}${Math.round(n)}`;
};

const inp  = { padding:'8px 10px', border:'1px solid var(--border)', borderRadius:4, background:'var(--surface2)', color:'var(--text)', fontSize:12, fontFamily:'IBM Plex Sans,sans-serif', width:'100%', boxSizing:'border-box', outline:'none' };
const lb   = { fontSize:10, letterSpacing:'.07em', textTransform:'uppercase', color:'var(--muted)', fontWeight:600, marginBottom:5, display:'block' };
const btnP = { padding:'9px 20px', background:'var(--accent)', border:'none', borderRadius:4, color:'#000', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'IBM Plex Sans,sans-serif' };
const btnG = { padding:'8px 14px', background:'transparent', border:'1px solid var(--border)', borderRadius:4, color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:'IBM Plex Sans,sans-serif' };

// ── Expense Form (add / edit) ─────────────────────────────────────────────────
function ExpenseForm({ initial = {}, onSave, onCancel, saving }) {
  const today = new Date().toISOString().slice(0, 10);
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
  const sel = { ...inp };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div>
          <label style={lb}>Date *</label>
          <input type="date" value={f.date} onChange={s('date')} style={inp} />
        </div>
        <div>
          <label style={lb}>Amount (₹) *</label>
          <input type="number" value={f.amount} onChange={s('amount')} placeholder="0" style={inp} />
        </div>
        <div>
          <label style={lb}>Category *</label>
          <select value={f.category} onChange={s('category')} style={sel}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={lb}>Payment Mode</label>
          <select value={f.payment_mode} onChange={s('payment_mode')} style={sel}>
            {['Cash','UPI','Bank Transfer','Cheque','Card'].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={lb}>Description</label>
          <input value={f.description} onChange={s('description')} placeholder="What was this expense for?" style={inp} />
        </div>
        <div>
          <label style={lb}>Vendor / Paid to</label>
          <input value={f.vendor} onChange={s('vendor')} placeholder="Supplier, landlord, staff…" style={inp} />
        </div>
        <div>
          <label style={lb}>Receipt No.</label>
          <input value={f.receipt_no} onChange={s('receipt_no')} placeholder="R001" style={inp} className="mono" />
        </div>
        <div>
          <label style={lb}>Sub-category</label>
          <input value={f.sub_category} onChange={s('sub_category')} placeholder="Optional" style={inp} />
        </div>
      </div>
      <div>
        <label style={lb}>Notes</label>
        <input value={f.notes} onChange={s('notes')} placeholder="Additional notes" style={inp} />
      </div>
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:4 }}>
        <button onClick={onCancel} style={btnG}>Cancel</button>
        <button onClick={() => onSave({ ...f, amount: parseFloat(f.amount) || 0 })}
          disabled={!f.date || !f.amount || !f.category || saving}
          style={{ ...btnP, opacity: !f.date || !f.amount || !f.category || saving ? .5 : 1 }}>
          {saving ? 'Saving…' : 'Save Expense'}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ExpensesPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [monthFilter, setMonthFilter] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  const [catFilter,   setCatFilter]   = useState('');
  const [search,      setSearch]      = useState('');
  const [showForm,    setShowForm]    = useState(false);
  const [editExp,     setEditExp]     = useState(null);

  const { data: raw, isLoading } = useQuery({
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
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Stats bar */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ padding:'14px 20px', borderRight:'1px solid var(--border)' }}>
          <div style={{ fontSize:10, letterSpacing:'.07em', textTransform:'uppercase', color:'var(--muted)', fontWeight:600 }}>Total This Period</div>
          <div style={{ fontSize:22, fontWeight:800, color:'var(--red)', marginTop:6 }}>{fmtK(total)}</div>
        </div>
        <div style={{ padding:'14px 20px', borderRight:'1px solid var(--border)' }}>
          <div style={{ fontSize:10, letterSpacing:'.07em', textTransform:'uppercase', color:'var(--muted)', fontWeight:600 }}>Entries</div>
          <div style={{ fontSize:22, fontWeight:800, color:'var(--text)', marginTop:6 }}>{expenses.length}</div>
        </div>
        {topCat.slice(0, 2).map(([cat, amt], i) => (
          <div key={cat} style={{ padding:'14px 20px', borderRight: i===0 ? '1px solid var(--border)' : 0 }}>
            <div style={{ fontSize:10, letterSpacing:'.07em', textTransform:'uppercase', color:'var(--muted)', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cat}</div>
            <div style={{ fontSize:22, fontWeight:800, color:CAT_COLOR[cat]||'var(--text)', marginTop:6 }}>{fmtK(amt)}</div>
          </div>
        ))}
        {topCat.length < 2 && Array.from({ length: 2 - topCat.length }).map((_, i) => (
          <div key={i} style={{ padding:'14px 20px', borderRight: i===0&&topCat.length===0?'1px solid var(--border)':0 }}>
            <div style={{ fontSize:10, color:'var(--dim)' }}>—</div>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{ padding:20, borderBottom:'1px solid var(--border)', background:'var(--surface)' }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:16 }}>Add Expense</div>
          <ExpenseForm onSave={d => createMut.mutate(d)} onCancel={() => setShowForm(false)} saving={createMut.isPending} />
        </div>
      )}

      {/* Edit modal */}
      {editExp && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setEditExp(null)}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:28, width:560, maxWidth:'94vw' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Edit Expense</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:20 }}>{editExp.date} · {editExp.category}</div>
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
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 20px', borderBottom:'1px solid var(--border)', flexWrap:'wrap', flexShrink:0 }}>
        <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} style={{ ...inp, width:160 }}>
          <option value="">All months</option>
          {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ ...inp, width:200 }}>
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search description, vendor…" style={{ ...inp, width:220 }} />
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <span style={{ fontSize:11, color:'var(--muted)', alignSelf:'center' }}>{expenses.length} entries</span>
          {!showForm && (
            <button onClick={() => setShowForm(true)} style={btnP}>+ Add Expense</button>
          )}
        </div>
      </div>

      {/* Category pills summary */}
      {Object.keys(byCat).length > 0 && (
        <div style={{ display:'flex', gap:8, padding:'10px 20px', flexWrap:'wrap', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          {Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([cat, amt]) => (
            <button key={cat} onClick={() => setCatFilter(catFilter===cat?'':cat)}
              style={{
                padding:'4px 12px', borderRadius:20, fontSize:11, cursor:'pointer',
                fontFamily:'IBM Plex Sans,sans-serif', fontWeight:600,
                background: catFilter===cat ? (CAT_COLOR[cat]||'#888') : 'transparent',
                color: catFilter===cat ? '#fff' : (CAT_COLOR[cat]||'var(--muted)'),
                border: `1.5px solid ${CAT_COLOR[cat]||'var(--border)'}`,
              }}>
              {cat} · {fmtK(amt)}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {isLoading ? (
          <div style={{ padding:24, color:'var(--muted)', fontSize:12 }}>Loading…</div>
        ) : sorted.length === 0 ? (
          <div style={{ padding:48, textAlign:'center', color:'var(--muted)', fontSize:12 }}>
            No expenses found. Click "+ Add Expense" to start tracking.
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                {[['Date','date'],['Category','category'],['Description','description'],['Vendor','vendor'],['Amount','amount'],['Payment','payment_mode'],['Receipt','receipt_no'],['']].map(([h,f]) => (
                  <Th key={h} field={f||null} style={{ padding:'9px 16px', textAlign:'left', fontSize:9, letterSpacing:'.07em', color:'var(--dim)', fontWeight:600, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(e => (
                <tr key={e.id} style={{ borderBottom:'1px solid var(--border)' }}
                  onMouseEnter={el => el.currentTarget.style.background='var(--surface2)'}
                  onMouseLeave={el => el.currentTarget.style.background='transparent'}>
                  <td className="mono" style={{ padding:'10px 16px', fontSize:11, color:'var(--muted)' }}>{e.date}</td>
                  <td style={{ padding:'10px 16px' }}>
                    <span style={{
                      fontSize:10, padding:'3px 9px', borderRadius:3, fontWeight:600,
                      background:`${CAT_COLOR[e.category] || '#888'}18`,
                      color: CAT_COLOR[e.category] || 'var(--muted)',
                      border:`1px solid ${CAT_COLOR[e.category] || 'var(--border)'}33`,
                    }}>{e.category}</span>
                    {e.sub_category && <div style={{ fontSize:9, color:'var(--dim)', marginTop:2 }}>{e.sub_category}</div>}
                  </td>
                  <td style={{ padding:'10px 16px', fontSize:12, maxWidth:200 }}>
                    <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.description || '—'}</div>
                  </td>
                  <td style={{ padding:'10px 16px', fontSize:11, color:'var(--muted)' }}>{e.vendor || '—'}</td>
                  <td style={{ padding:'10px 16px', fontSize:13, fontWeight:700, color:'var(--red)', fontFamily:'monospace' }}>
                    {RS}{fmt(e.amount)}
                  </td>
                  <td style={{ padding:'10px 16px', fontSize:10 }}>
                    <span style={{ padding:'2px 8px', borderRadius:3, background:'var(--surface2)', border:'1px solid var(--border)', fontSize:10 }}>{e.payment_mode}</span>
                  </td>
                  <td className="mono" style={{ padding:'10px 16px', fontSize:10, color:'var(--dim)' }}>{e.receipt_no || '—'}</td>
                  <td style={{ padding:'10px 12px' }}>
                    <div style={{ display:'flex', gap:5 }}>
                      <button onClick={() => setEditExp(e)}
                        style={{ padding:'4px 9px', background:'transparent', border:'1px solid rgba(59,130,246,.35)', borderRadius:3, fontSize:10, cursor:'pointer', color:'var(--blue)', fontFamily:'IBM Plex Sans,sans-serif' }}>
                        Edit
                      </button>
                      <button onClick={() => window.confirm(`Delete this expense (${RS}${fmt(e.amount)})?`) && deleteMut.mutate(e.id)}
                        style={{ padding:'4px 8px', background:'transparent', border:'1px solid rgba(220,38,38,.3)', borderRadius:3, fontSize:10, cursor:'pointer', color:'var(--red)', fontFamily:'IBM Plex Sans,sans-serif' }}>
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop:'2px solid var(--border)', background:'var(--surface2)' }}>
                <td colSpan={4} style={{ padding:'10px 16px', fontSize:11, fontWeight:700, color:'var(--muted)' }}>
                  Total — {expenses.length} entries
                </td>
                <td style={{ padding:'10px 16px', fontSize:14, fontWeight:800, color:'var(--red)', fontFamily:'monospace' }}>
                  {RS}{fmt(total)}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
