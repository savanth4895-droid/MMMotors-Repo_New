import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceApi, partsApi } from '../api/client';
import toast from 'react-hot-toast';

// ─── Helpers ────────────────────────────────────────────────────────────────
const RS = '₹';
const fmt = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = n => Number(n || 0).toLocaleString('en-IN');

function numWords(n) {
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  if (!n || n === 0) return 'Zero';
  n = Math.round(n);
  if (n < 20)      return a[n];
  if (n < 100)     return b[Math.floor(n/10)] + (n%10 ? ' '+a[n%10] : '');
  if (n < 1000)    return a[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' '+numWords(n%100) : '');
  if (n < 100000)  return numWords(Math.floor(n/1000)) + ' Thousand' + (n%1000 ? ' '+numWords(n%1000) : '');
  if (n < 10000000)return numWords(Math.floor(n/100000)) + ' Lakh' + (n%100000 ? ' '+numWords(n%100000) : '');
  return numWords(Math.floor(n/10000000)) + ' Crore' + (n%10000000 ? ' '+numWords(n%10000000) : '');
}

const emptyRow = () => ({ description: '', hsn: '9987', qty: 1, unit_price: 0, gst_rate: 18, _key: Math.random() });

// ─── Shared Styles ───────────────────────────────────────────────────────────
const inputStyle = {
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  borderRadius: 3,
  padding: '7px 9px',
  color: 'var(--text)',
  outline: 'none',
  fontSize: 12,
  fontFamily: 'IBM Plex Sans, sans-serif',
  width: '100%',
  boxSizing: 'border-box',
};

const btnPrimary = {
  background: '#B8860B',
  color: '#fff',
  border: 'none',
  borderRadius: 3,
  padding: '9px 22px',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'IBM Plex Sans, sans-serif',
  letterSpacing: '.04em',
};

const btnGhost = {
  background: 'transparent',
  color: 'var(--muted)',
  border: '1px solid var(--border2)',
  borderRadius: 3,
  padding: '8px 16px',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'IBM Plex Sans, sans-serif',
};

// ─── SERVICE BILL MODAL ──────────────────────────────────────────────────────
// FIX: On open, loads existing bill via GET /service-bills?job_id=...
// FIX: Saves via POST (new) or PUT (update existing)
// FIX: Deducts parts from inventory on save, restores on item deletion
export function ServiceBillModal({ job, onClose }) {
  const qc = useQueryClient();

  // ── Fetch existing bill for this job ──────────────────────────────────────
  const { data: existingBillData, isLoading: loadingBill } = useQuery({
    queryKey: ['service-bill', job._id],
    queryFn: () => serviceApi.getBillByJobId(job._id),
    retry: false,
  });

  const existingBill = existingBillData?.data?.[0] || existingBillData?.data || null;

  // ── Row state ─────────────────────────────────────────────────────────────
  const [rows, setRows] = useState([emptyRow()]);
  const [payMode, setPayMode] = useState('Cash');
  const [initialized, setInitialized] = useState(false);

  // ── Populate rows from existing bill when loaded ──────────────────────────
  useEffect(() => {
    if (!loadingBill && existingBill && !initialized) {
      const billItems = existingBill.items || [];
      if (billItems.length > 0) {
        setRows(billItems.map(it => ({
          _key: Math.random(),
          description: it.description || '',
          hsn: it.hsn_code || '9987',
          qty: it.qty || 1,
          unit_price: it.unit_price || 0,
          gst_rate: it.gst_rate || 18,
          // track original qty so we can restore on delete
          _savedQty: it.qty || 0,
          _partNumber: it.part_number || null,
        })));
      }
      setPayMode(existingBill.payment_mode || 'Cash');
      setInitialized(true);
    } else if (!loadingBill && !existingBill && !initialized) {
      setRows([emptyRow()]);
      setInitialized(true);
    }
  }, [loadingBill, existingBill, initialized]);

  // ── Parts search for autocomplete ─────────────────────────────────────────
  const { data: partsData } = useQuery({
    queryKey: ['parts-list'],
    queryFn: () => partsApi.list({ limit: 500 }),
  });
  const allParts = partsData?.data?.items || partsData?.data || [];

  // ── Row helpers ───────────────────────────────────────────────────────────
  const updateRow = (key, field, value) => {
    setRows(prev => prev.map(r => r._key === key ? { ...r, [field]: value } : r));
  };

  const addRow = () => setRows(prev => [...prev, emptyRow()]);

  const removeRow = (key) => {
    setRows(prev => {
      const row = prev.find(r => r._key === key);
      // Restore parts stock if this row came from a saved bill
      if (row?._partNumber && row?._savedQty) {
        partsApi.adjustStock(row._partNumber, row._savedQty, 'add').catch(() => {});
      }
      return prev.filter(r => r._key !== key);
    });
  };

  const fillFromPart = (key, part) => {
    setRows(prev => prev.map(r => r._key === key ? {
      ...r,
      description: part.name,
      hsn: part.hsn_code || '9987',
      unit_price: part.selling_price || part.sellingPrice || 0,
      gst_rate: part.gst_rate || part.gstRate || 18,
      _partNumber: part.part_number || part.partNo,
    } : r));
  };

  // ── Totals ────────────────────────────────────────────────────────────────
  const validRows = rows.filter(r => r.description && r.unit_price > 0);
  const subtotal  = validRows.reduce((s, r) => s + r.unit_price * r.qty, 0);
  const gstTotal  = validRows.reduce((s, r) => s + r.unit_price * r.qty * r.gst_rate / 100, 0);
  const total     = Math.round(subtotal + gstTotal);

  // ── Save mutation ─────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        job_id: job._id,
        payment_mode: payMode,
        items: validRows.map(r => ({
          description: r.description,
          hsn_code: r.hsn || '9987',
          qty: Number(r.qty),
          unit_price: Number(r.unit_price),
          gst_rate: Number(r.gst_rate),
          part_number: r._partNumber || '',
        })),
      };

      // Deduct parts stock for items that have a part_number
      // Only deduct the DIFFERENCE from previously saved qty
      for (const row of validRows) {
        if (row._partNumber) {
          const prevQty = row._savedQty || 0;
          const newQty  = Number(row.qty);
          const diff    = newQty - prevQty;
          if (diff > 0) {
            await partsApi.adjustStock(row._partNumber, diff, 'subtract').catch(() => {});
          } else if (diff < 0) {
            await partsApi.adjustStock(row._partNumber, Math.abs(diff), 'add').catch(() => {});
          }
        }
      }

      if (existingBill?._id) {
        return serviceApi.updateBill(existingBill._id, payload);
      } else {
        return serviceApi.createBill(payload);
      }
    },
    onSuccess: () => {
      toast.success('Service bill saved!');
      qc.invalidateQueries(['service-bill', job._id]);
      qc.invalidateQueries(['service-jobs']);
      qc.invalidateQueries(['parts-list']);
      onClose();
    },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Failed to save bill'),
  });

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        zIndex: 2000, padding: '24px 16px', overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', width: '100%', maxWidth: 780,
          borderRadius: 6, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.6)',
          fontFamily: 'IBM Plex Sans, sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ background: '#1A1A1A', borderTop: '3px solid #B8860B', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: '.12em', color: '#B8860B', fontWeight: 700, marginBottom: 4 }}>SERVICE BILL</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-.01em' }}>
              {job.job_number || job._id?.slice(-6)} — {job.customer_name || job.customer}
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>
              {job.vehicle_number || job.vehicle} &nbsp;·&nbsp; {job.model || ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: 20, cursor: 'pointer', padding: 4 }}>×</button>
        </div>

        {loadingBill ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading bill…</div>
        ) : (
          <div style={{ padding: '20px 20px 0' }}>
            {/* Existing bill badge */}
            {existingBill && (
              <div style={{ marginBottom: 12, padding: '8px 14px', background: 'rgba(184,134,11,.10)', border: '1px solid rgba(184,134,11,.3)', borderRadius: 4, fontSize: 11, color: '#B8860B', fontWeight: 600 }}>
                ✏️  Editing saved bill — {existingBill.bill_number || 'SRV-B'}
              </div>
            )}

            {/* Line items table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#1A1A1A' }}>
                    {['Description / Part', 'HSN', 'Qty', 'Unit Price (₹)', 'GST %', 'Amount', ''].map((h, i) => (
                      <th key={i} style={{ padding: '9px 10px', color: '#B8860B', fontWeight: 700, fontSize: 10, letterSpacing: '.06em', textAlign: i >= 2 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <BillRow
                      key={row._key}
                      row={row}
                      idx={idx}
                      allParts={allParts}
                      onChange={updateRow}
                      onRemove={removeRow}
                      onSelectPart={fillFromPart}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add row */}
            <button onClick={addRow} style={{ ...btnGhost, marginTop: 8, fontSize: 11, padding: '6px 14px' }}>
              + Add line item
            </button>

            {/* Totals */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <div style={{ minWidth: 240 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                  <span>Subtotal</span><span>{RS}{fmt(subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                  <span>GST</span><span>{RS}{fmt(gstTotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 15, fontWeight: 800, color: '#B8860B' }}>
                  <span>Total</span><span>{RS}{fmtInt(total)}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic', textAlign: 'right', marginBottom: 8 }}>
                  {numWords(total)} Rupees Only
                </div>
              </div>
            </div>

            {/* Payment mode */}
            <div style={{ marginTop: 4, marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 5, letterSpacing: '.06em', fontWeight: 600 }}>PAYMENT MODE</label>
              <select
                value={payMode}
                onChange={e => setPayMode(e.target.value)}
                style={{ ...inputStyle, maxWidth: 220 }}
              >
                {['Cash', 'UPI', 'Card', 'Bank Transfer', 'Credit'].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', background: 'var(--surface2)', borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || validRows.length === 0}
            style={{ ...btnPrimary, opacity: saveMut.isPending || validRows.length === 0 ? .5 : 1 }}
          >
            {saveMut.isPending ? 'Saving…' : existingBill ? 'Update Bill' : 'Generate Bill'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bill Row with parts autocomplete ────────────────────────────────────────
function BillRow({ row, idx, allParts, onChange, onRemove, onSelectPart }) {
  const [search, setSearch] = useState('');
  const [showDrop, setShowDrop] = useState(false);

  const filtered = search.length > 1
    ? allParts.filter(p =>
        p.name?.toLowerCase().includes(search.toLowerCase()) ||
        (p.part_number || p.partNo)?.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 8)
    : [];

  const amount = row.unit_price * row.qty * (1 + row.gst_rate / 100);
  const stripe = idx % 2 === 0 ? 'var(--surface)' : 'var(--surface2)';

  return (
    <tr style={{ background: stripe }}>
      {/* Description with parts search */}
      <td style={{ padding: '7px 8px', minWidth: 200, position: 'relative' }}>
        <input
          value={row.description}
          onChange={e => {
            onChange(row._key, 'description', e.target.value);
            setSearch(e.target.value);
            setShowDrop(true);
          }}
          onBlur={() => setTimeout(() => setShowDrop(false), 180)}
          placeholder="Labour / part name"
          style={{ ...inputStyle }}
        />
        {showDrop && filtered.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 4, zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,.3)', maxHeight: 200, overflowY: 'auto' }}>
            {filtered.map(p => (
              <div
                key={p._id || p.part_number}
                onMouseDown={() => {
                  onSelectPart(row._key, p);
                  setSearch('');
                  setShowDrop(false);
                }}
                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 12 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{p.part_number || p.partNo} &nbsp;·&nbsp; {RS}{p.selling_price || p.sellingPrice} &nbsp;·&nbsp; Stock: {p.stock}</div>
              </div>
            ))}
          </div>
        )}
      </td>
      {/* HSN */}
      <td style={{ padding: '7px 6px', width: 80 }}>
        <input value={row.hsn} onChange={e => onChange(row._key, 'hsn', e.target.value)} placeholder="9987" style={{ ...inputStyle }} />
      </td>
      {/* Qty */}
      <td style={{ padding: '7px 6px', width: 64 }}>
        <input type="number" min="1" value={row.qty} onChange={e => onChange(row._key, 'qty', Math.max(1, Number(e.target.value)))} style={{ ...inputStyle, textAlign: 'right' }} />
      </td>
      {/* Unit price */}
      <td style={{ padding: '7px 6px', width: 110 }}>
        <input type="number" min="0" value={row.unit_price} onChange={e => onChange(row._key, 'unit_price', Number(e.target.value))} style={{ ...inputStyle, textAlign: 'right' }} />
      </td>
      {/* GST */}
      <td style={{ padding: '7px 6px', width: 80 }}>
        <select value={row.gst_rate} onChange={e => onChange(row._key, 'gst_rate', Number(e.target.value))} style={{ ...inputStyle }}>
          {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
        </select>
      </td>
      {/* Amount */}
      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', fontSize: 12 }}>
        {RS}{fmtInt(Math.round(amount))}
      </td>
      {/* Remove */}
      <td style={{ padding: '7px 6px', width: 28 }}>
        <button onClick={() => onRemove(row._key)} style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 16, padding: 0 }}>×</button>
      </td>
    </tr>
  );
}

// ─── PARTS BILL MODAL ────────────────────────────────────────────────────────
// Standalone billing for walk-in parts customers — no job card needed
export function PartsBillModal({ onClose }) {
  const qc = useQueryClient();

  // Customer info
  const [customer, setCustomer] = useState({ name: '', mobile: '', vehicle: '' });
  const upd = k => e => setCustomer(p => ({ ...p, [k]: e.target.value }));

  // Cart
  const [cart, setCart] = useState([]);
  const [partSearch, setPartSearch] = useState('');
  const [payMode, setPayMode] = useState('Cash');
  const [done, setDone] = useState(false);
  const [billNumber, setBillNumber] = useState('');

  // Load parts
  const { data: partsData } = useQuery({
    queryKey: ['parts-list'],
    queryFn: () => partsApi.list({ limit: 500 }),
  });
  const allParts = partsData?.data?.items || partsData?.data || [];

  const searchResults = partSearch.length > 1
    ? allParts.filter(p =>
        (p.name?.toLowerCase().includes(partSearch.toLowerCase()) ||
         (p.part_number || p.partNo)?.toLowerCase().includes(partSearch.toLowerCase())) &&
        p.stock > 0
      ).slice(0, 10)
    : [];

  // Cart helpers
  const addToCart = (part) => {
    setCart(prev => {
      const ex = prev.find(c => c._id === part._id);
      if (ex) {
        if (ex.qty >= part.stock) { toast.error('Not enough stock'); return prev; }
        return prev.map(c => c._id === part._id ? { ...c, qty: c.qty + 1 } : c);
      }
      return [...prev, { ...part, qty: 1 }];
    });
    setPartSearch('');
  };

  const updateCartQty = (id, qty) => {
    const part = allParts.find(p => p._id === id);
    if (qty > (part?.stock || 0)) { toast.error('Not enough stock'); return; }
    setCart(prev => qty <= 0 ? prev.filter(c => c._id !== id) : prev.map(c => c._id === id ? { ...c, qty } : c));
  };

  const removeFromCart = (id) => setCart(prev => prev.filter(c => c._id !== id));

  // Totals
  const subtotal = cart.reduce((s, c) => s + (c.selling_price || c.sellingPrice || 0) * c.qty, 0);
  const gstTotal = cart.reduce((s, c) => s + (c.selling_price || c.sellingPrice || 0) * c.qty * (c.gst_rate || c.gstRate || 18) / 100, 0);
  const total    = Math.round(subtotal + gstTotal);

  // Generate bill
  const genMut = useMutation({
    mutationFn: async () => {
      // Check stock for all items
      for (const item of cart) {
        if (item.qty > item.stock) throw new Error(`${item.name}: only ${item.stock} in stock`);
      }
      const payload = {
        customer_name: customer.name,
        customer_mobile: customer.mobile,
        customer_vehicle: customer.vehicle,
        payment_mode: payMode,
        items: cart.map(c => ({
          part_id: c._id,
          part_number: c.part_number || c.partNo,
          name: c.name,
          hsn_code: c.hsn_code || c.hsnCode || '8714',
          qty: c.qty,
          unit_price: c.selling_price || c.sellingPrice,
          gst_rate: c.gst_rate || c.gstRate || 18,
        })),
      };
      return partsApi.createBill(payload);
    },
    onSuccess: (res) => {
      const num = res?.data?.bill_number || `PRT-${Date.now().toString().slice(-6)}`;
      setBillNumber(num);
      setDone(true);
      qc.invalidateQueries(['parts-list']);
      toast.success('Parts bill generated!');
    },
    onError: (e) => toast.error(e?.message || e?.response?.data?.detail || 'Failed to generate bill'),
  });

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 2000, padding: '24px 16px', overflowY: 'auto' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface)', width: '100%', maxWidth: 820, borderRadius: 6, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.6)', fontFamily: 'IBM Plex Sans, sans-serif' }}
      >
        {/* Header */}
        <div style={{ background: '#1A1A1A', borderTop: '3px solid #B8860B', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: '.12em', color: '#B8860B', fontWeight: 700, marginBottom: 4 }}>PARTS BILL</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>New Parts Sale</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        {done ? (
          /* ── Success state ── */
          <div style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>Bill Generated!</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>{billNumber}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#B8860B', marginBottom: 24 }}>{RS}{fmtInt(total)} — {payMode}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => window.print()} style={{ ...btnPrimary }}>Print Bill</button>
              <button onClick={onClose} style={{ ...btnGhost }}>Close</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 20 }}>
            {/* Customer info */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, letterSpacing: '.08em', fontWeight: 700, color: 'var(--muted)', marginBottom: 10 }}>CUSTOMER DETAILS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Name</label>
                  <input value={customer.name} onChange={upd('name')} placeholder="Customer name" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Mobile</label>
                  <input value={customer.mobile} onChange={upd('mobile')} placeholder="10-digit mobile" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Vehicle (optional)</label>
                  <input value={customer.vehicle} onChange={upd('vehicle')} placeholder="KA 07 U 3915" style={inputStyle} />
                </div>
              </div>
            </div>

            {/* Parts search */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, letterSpacing: '.08em', fontWeight: 700, color: 'var(--muted)', marginBottom: 10 }}>ADD PARTS TO CART</div>
              <div style={{ position: 'relative', maxWidth: 400 }}>
                <input
                  value={partSearch}
                  onChange={e => setPartSearch(e.target.value)}
                  placeholder="Search by part name or number…"
                  style={{ ...inputStyle }}
                />
                {searchResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 4, zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,.3)', maxHeight: 240, overflowY: 'auto' }}>
                    {searchResults.map(p => (
                      <div
                        key={p._id}
                        onClick={() => addToCart(p)}
                        style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>{p.part_number || p.partNo} &nbsp;·&nbsp; {p.category}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#B8860B' }}>{RS}{p.selling_price || p.sellingPrice}</div>
                          <div style={{ fontSize: 10, color: p.stock <= (p.reorder_level || 5) ? '#fbbf24' : '#4ade80' }}>Stock: {p.stock}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Cart */}
            {cart.length === 0 ? (
              <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13, borderTop: '1px solid var(--border)' }}>
                No parts added yet. Search above to add items.
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#1A1A1A' }}>
                      {['Part Name', 'Part No', 'HSN', 'Qty', 'Price', 'GST %', 'Amount', ''].map((h, i) => (
                        <th key={i} style={{ padding: '8px 10px', color: '#B8860B', fontWeight: 700, fontSize: 10, letterSpacing: '.06em', textAlign: i >= 3 ? 'right' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item, idx) => {
                      const price  = item.selling_price || item.sellingPrice || 0;
                      const gstR   = item.gst_rate || item.gstRate || 18;
                      const amount = price * item.qty * (1 + gstR / 100);
                      return (
                        <tr key={item._id} style={{ background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface2)' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 600 }}>{item.name}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{item.part_number || item.partNo}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--muted)', fontSize: 11 }}>{item.hsn_code || item.hsnCode || '8714'}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                            <input
                              type="number" min="1" max={item.stock} value={item.qty}
                              onChange={e => updateCartQty(item._id, Number(e.target.value))}
                              style={{ ...inputStyle, width: 54, textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>{RS}{price}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--muted)' }}>{gstR}%</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#B8860B' }}>{RS}{fmtInt(Math.round(amount))}</td>
                          <td style={{ padding: '8px 6px' }}>
                            <button onClick={() => removeFromCart(item._id)} style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 16, padding: 0 }}>×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Totals */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  <div style={{ minWidth: 240 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                      <span>Subtotal</span><span>{RS}{fmt(subtotal)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                      <span>GST</span><span>{RS}{fmt(gstTotal)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 15, fontWeight: 800, color: '#B8860B' }}>
                      <span>Total</span><span>{RS}{fmtInt(total)}</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic', textAlign: 'right' }}>
                      {numWords(total)} Rupees Only
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Payment mode */}
            <div style={{ marginBottom: 20, marginTop: 8 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 5, letterSpacing: '.06em', fontWeight: 600 }}>PAYMENT MODE</label>
              <select value={payMode} onChange={e => setPayMode(e.target.value)} style={{ ...inputStyle, maxWidth: 220 }}>
                {['Cash', 'UPI', 'Card', 'Bank Transfer', 'Credit'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Footer */}
        {!done && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', background: 'var(--surface2)', borderTop: '1px solid var(--border)' }}>
            <button onClick={onClose} style={btnGhost}>Cancel</button>
            <button
              onClick={() => genMut.mutate()}
              disabled={genMut.isPending || cart.length === 0}
              style={{ ...btnPrimary, opacity: genMut.isPending || cart.length === 0 ? .5 : 1 }}
            >
              {genMut.isPending ? 'Generating…' : `Generate Bill — ${RS}${fmtInt(total)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
