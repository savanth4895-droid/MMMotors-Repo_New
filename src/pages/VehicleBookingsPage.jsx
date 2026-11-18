import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vehicleBookingsApi, errMsg } from '../api/client';
import { useSortable, Btn, GhostBtn, Field, Skeleton, Empty, ApiError } from '../components/ui';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';
import { escapeDeep } from '../utils/escapeHtml';
import { openWA } from './service/shared';
import { todayYmd } from '../utils/date';

// Advance paid for a new bike that isn't in stock yet. The list flags when a matching bike
// (same brand + model, and colour if asked) is in stock, so staff can call the customer.

const RS  = '₹';
const fmt = n => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const STATUS = {
  waiting:   { label: 'Waiting',   cls: 'pill-amber' },
  arrived:   { label: 'Customer told', cls: 'pill-blue' },
  delivered: { label: 'Delivered', cls: 'pill-green' },
  cancelled: { label: 'Cancelled', cls: 'pill-dim' },
};
const MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card'];
const bike  = b => [b.brand, b.model, b.variant, b.color].filter(Boolean).join(' ');

function printReceipt(raw) {
  const b = escapeDeep(raw);
  const w = window.open('', '_blank');
  if (!w) return toast.error('Allow pop-ups to print the receipt');
  w.document.write(`<!doctype html><html><head><title>${b.booking_number}</title>
  <style>body{font-family:Arial,sans-serif;max-width:640px;margin:24px auto;color:#111}
  h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin:16px 0}
  td{padding:8px;border-bottom:1px solid #ddd;font-size:14px}td:first-child{color:#555;width:40%}
  .amt{font-size:22px;font-weight:700}.sig{display:flex;justify-content:space-between;margin-top:64px;font-size:13px}
  .note{font-size:12px;color:#555}</style></head><body>
  <h1>MM MOTORS</h1><div class="note">Bengaluru Main Road, Beside Ruchi Bakery, Malur 563130 · Ph 7026263123</div>
  <h2 style="font-size:16px;margin:20px 0 0">Booking advance receipt</h2>
  <table>
    <tr><td>Receipt / booking no.</td><td><b>${b.booking_number}</b></td></tr>
    <tr><td>Date</td><td>${b.booking_date}</td></tr>
    <tr><td>Customer</td><td>${b.customer_name} · ${b.customer_mobile}</td></tr>
    <tr><td>Vehicle booked</td><td>${bike(b)}</td></tr>
    ${b.expected_date ? `<tr><td>Expected delivery</td><td>${b.expected_date}</td></tr>` : ''}
    <tr><td>Advance received</td><td class="amt">${RS}${fmt(raw.advance_amount)}</td></tr>
    <tr><td>Paid by</td><td>${b.payment_mode}</td></tr>
  </table>
  <p class="note">This advance will be adjusted against the final vehicle invoice.</p>
  <div class="sig"><span>Customer signature</span><span>For MM Motors</span></div>
  <script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

function BookingForm({ initial = {}, onSave, onCancel, saving }) {
  const [f, setF] = useState({
    customer_name: '', customer_mobile: '', brand: '', model: '', variant: '', color: '',
    advance_amount: '', payment_mode: 'Cash', booking_date: todayYmd(), expected_date: '', notes: '', ...initial,
  });
  const s = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  const mobileOk = /^\d{10}$/.test(f.customer_mobile);
  return (
    <div className="sale-form">
      <div className="form-grid form-grid-2col">
        <Field label="Customer name *"><input value={f.customer_name} onChange={s('customer_name')} /></Field>
        <Field label="Mobile *"><input value={f.customer_mobile} inputMode="numeric" maxLength={10}
          onChange={e => setF(p => ({ ...p, customer_mobile: e.target.value.replace(/\D/g, '') }))} placeholder="10 digits" /></Field>
        <Field label="Brand *"><input value={f.brand} onChange={s('brand')} placeholder="e.g. HONDA" /></Field>
        <Field label="Model *"><input value={f.model} onChange={s('model')} placeholder="e.g. Shine 100" /></Field>
        <Field label="Variant"><input value={f.variant} onChange={s('variant')} placeholder="Optional" /></Field>
        <Field label="Colour"><input value={f.color} onChange={s('color')} placeholder="Leave blank if any colour is fine" /></Field>
        <Field label="Advance paid (₹) *"><input type="number" min="0" value={f.advance_amount} onChange={s('advance_amount')} /></Field>
        <Field label="Paid by">
          <select value={f.payment_mode} onChange={s('payment_mode')}>{MODES.map(m => <option key={m}>{m}</option>)}</select>
        </Field>
        <Field label="Booking date *"><input type="date" value={f.booking_date || ''} onChange={s('booking_date')} /></Field>
        <Field label="Expected delivery"><input type="date" value={f.expected_date || ''} onChange={s('expected_date')} /></Field>
        <Field label="Notes"><input value={f.notes || ''} onChange={s('notes')} /></Field>
      </div>
      <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
        <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
        <Btn disabled={saving || !f.customer_name.trim() || !mobileOk || !f.brand.trim() || !f.model.trim() || f.advance_amount === '' || !f.booking_date}
          onClick={() => onSave({ ...f, advance_amount: parseFloat(f.advance_amount) || 0 })}>
          {saving ? 'Saving…' : 'Save booking'}
        </Btn>
      </div>
    </div>
  );
}

// Delivered → needs the sale invoice; Cancelled → refund amount + reason.
function CloseDialog({ booking, to, onSave, onCancel, saving }) {
  const [invoice, setInvoice] = useState('');
  const [refund, setRefund]   = useState(String(booking.advance_amount || 0));
  const [reason, setReason]   = useState('');
  const deliver = to === 'delivered';
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="bk-close-t" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <h2 id="bk-close-t" className="dialog-title">{deliver ? 'Mark delivered' : 'Cancel booking'}</h2>
        <p className="dialog-sub">{booking.booking_number} · {booking.customer_name} · {bike(booking)}</p>
        {deliver ? (
          <Field label="Sale invoice number *"><input className="mono" value={invoice} onChange={e => setInvoice(e.target.value)} placeholder="INV-000123" /></Field>
        ) : (<>
          <Field label={`Refund given (₹) — advance was ${RS}${fmt(booking.advance_amount)}`}>
            <input type="number" min="0" value={refund} onChange={e => setRefund(e.target.value)} />
          </Field>
          <Field label="Reason"><input value={reason} onChange={e => setReason(e.target.value)} placeholder="Optional" /></Field>
        </>)}
        <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
          <GhostBtn onClick={onCancel}>Back</GhostBtn>
          <Btn disabled={saving || (deliver && !invoice.trim())} onClick={() => onSave(deliver
            ? { status: 'delivered', invoice_number: invoice.trim() }
            : { status: 'cancelled', refund_amount: parseFloat(refund) || 0, cancel_reason: reason })}>
            {saving ? 'Saving…' : 'Confirm'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

export default function VehicleBookingsPage() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const [filter, setFilter]   = useState('open');
  const [search, setSearch]   = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [closing, setClosing] = useState(null);   // { booking, to }

  const { data: raw, isLoading, error } = useQuery({
    queryKey: ['vehicle-bookings'],
    queryFn: () => vehicleBookingsApi.list().then(r => r.data),
    refetchInterval: 60_000,
  });
  const all = Array.isArray(raw) ? raw : [];
  const open = all.filter(b => b.status === 'waiting' || b.status === 'arrived');
  const q = search.trim().toLowerCase();
  const shown = all
    .filter(b => filter === 'all' ? true : filter === 'open' ? open.includes(b) : filter === 'ready'
      ? b.status === 'waiting' && b.in_stock_matches > 0 : b.status === filter)
    .filter(b => !q || [b.booking_number, b.customer_name, b.customer_mobile, bike(b)].join(' ').toLowerCase().includes(q));
  const { sorted, Th } = useSortable(shown, 'booking_number', 'desc');

  const done = msg => () => { qc.invalidateQueries(['vehicle-bookings']); qc.invalidateQueries(['dashboard-stats']); toast.success(msg); };
  const createMut = useMutation({
    mutationFn: d => vehicleBookingsApi.create(d),
    onSuccess: r => { done('Booking saved')(); setShowForm(false); printReceipt(r.data); },
    onError: e => toast.error(errMsg(e, 'Could not save booking')),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }) => vehicleBookingsApi.update(id, d),
    onSuccess: () => { done('Booking updated')(); setEditing(null); setClosing(null); },
    onError: e => toast.error(errMsg(e, 'Could not update booking')),
  });
  const deleteMut = useMutation({
    mutationFn: id => vehicleBookingsApi.delete(id),
    onSuccess: done('Booking deleted'),
    onError: e => toast.error(errMsg(e, 'Could not delete')),
  });

  const tellCustomer = b => {
    openWA(b.customer_mobile, `Hello ${b.customer_name}, good news! Your ${bike(b)} (booking ${b.booking_number}) has arrived at MM Motors, Malur. Please visit us to complete the purchase.`);
    if (b.status === 'waiting') updateMut.mutate({ id: b.id, d: { status: 'arrived' } });
  };

  const ready    = all.filter(b => b.status === 'waiting' && b.in_stock_matches > 0).length;
  const advances = open.reduce((s, b) => s + (b.advance_amount || 0), 0);
  const CHIPS = [['open', 'Open', open.length], ['ready', 'Bike in stock', ready], ['waiting', 'Waiting'], ['arrived', 'Customer told'],
                 ['delivered', 'Delivered'], ['cancelled', 'Cancelled'], ['all', 'All', all.length]];

  return (
    <div>
      <section className="stat-strip" aria-label="Booking summary">
        <div className="stat"><span className="stat-label">Open bookings</span><span className="stat-value">{open.length}</span></div>
        <div className="stat"><span className="stat-label">Bike now in stock</span>
          <span className="stat-value" style={{ color: ready ? 'var(--color-success)' : undefined }}>{ready}</span></div>
        <div className="stat"><span className="stat-label">Advance held</span><span className="stat-value">{RS}{fmt(advances)}</span></div>
      </section>

      {showForm && (
        <section className="page-panel" aria-labelledby="bk-new-t">
          <h2 id="bk-new-t" className="page-panel-title">New bike booking</h2>
          <BookingForm onSave={d => createMut.mutate(d)} onCancel={() => setShowForm(false)} saving={createMut.isPending} />
        </section>
      )}
      {editing && (
        <div className="dialog-backdrop" onClick={() => setEditing(null)}>
          <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="bk-edit-t" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <h2 id="bk-edit-t" className="dialog-title">Edit {editing.booking_number}</h2>
            <BookingForm initial={editing} saving={updateMut.isPending} onCancel={() => setEditing(null)}
              onSave={({ customer_name, customer_mobile, brand, model, variant, color, advance_amount, payment_mode, booking_date, expected_date, notes }) =>
                updateMut.mutate({ id: editing.id, d: { customer_name, customer_mobile, brand, model, variant, color, advance_amount, payment_mode, booking_date, expected_date, notes } })} />
          </div>
        </div>
      )}
      {closing && <CloseDialog booking={closing.booking} to={closing.to} saving={updateMut.isPending}
        onCancel={() => setClosing(null)} onSave={d => updateMut.mutate({ id: closing.booking.id, d })} />}

      <div className="page-toolbar">
        <div className="chips" role="group" aria-label="Filter bookings">
          {CHIPS.map(([k, label, n]) => (
            <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {label}{n != null && <span className="chip-count">{n}</span>}
            </button>
          ))}
        </div>
        <input type="search" className="page-search" aria-label="Search bookings" value={search}
          onChange={e => setSearch(e.target.value)} placeholder="Name, mobile, model, BKG no…" style={{ width: 'min(240px, 100%)' }} />
        {!showForm && <Btn onClick={() => setShowForm(true)}>+ New booking</Btn>}
      </div>

      {error ? <div style={{ padding: 'var(--space-lg)' }}><ApiError error={error} /></div>
      : isLoading ? <div className="table-skeleton">{[1, 2, 3].map(i => <Skeleton key={i} h={44} />)}</div>
      : sorted.length === 0 ? <Empty message="No bookings here" sub="Take a booking with + New booking when a customer pays an advance." />
      : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>
              {[['Booking', 'booking_number'], ['Customer', 'customer_name'], ['Bike', 'model'], ['Advance', 'advance_amount'],
                ['Status', 'status'], ['']].map(([h, f]) => (
                <Th key={h} field={f || null} className={f === 'advance_amount' ? 'num' : undefined}>{h || <span className="visually-hidden">Actions</span>}</Th>
              ))}
            </tr></thead>
            <tbody>
              {sorted.map(b => (
                <tr key={b.id}>
                  <td><span className="mono cell-id">{b.booking_number}</span><div className="cell-sub">{b.booking_date}</div></td>
                  <td>{b.customer_name}<div className="cell-sub mono">{b.customer_mobile}</div></td>
                  <td>{bike(b)}
                    {b.expected_date && <div className="cell-sub">Expected {b.expected_date}</div>}
                    {b.in_stock_matches > 0 && <div><span className="pill pill-green">In stock: {b.in_stock_matches}</span></div>}
                  </td>
                  <td className="num cell-amount">{RS}{fmt(b.advance_amount)}
                    {b.status === 'cancelled' && b.refund_amount != null && <div className="cell-sub">Refunded {RS}{fmt(b.refund_amount)}</div>}
                  </td>
                  <td><span className={`pill ${STATUS[b.status]?.cls || 'pill-dim'}`}>{STATUS[b.status]?.label || b.status}</span>
                    {b.invoice_number && <div className="cell-sub mono">{b.invoice_number}</div>}
                  </td>
                  <td>
                    <div className="row-actions">
                      {(b.status === 'waiting' || b.status === 'arrived') && <>
                        <GhostBtn sm onClick={() => tellCustomer(b)}>{b.status === 'arrived' ? 'WhatsApp again' : 'Bike arrived'}</GhostBtn>
                        <GhostBtn sm onClick={() => setClosing({ booking: b, to: 'delivered' })}>Delivered</GhostBtn>
                        <GhostBtn sm onClick={() => setClosing({ booking: b, to: 'cancelled' })}>Cancel</GhostBtn>
                        <GhostBtn sm onClick={() => setEditing(b)}>Edit</GhostBtn>
                      </>}
                      <GhostBtn sm onClick={() => printReceipt(b)}>Receipt</GhostBtn>
                      {isOwner && (
                        <button type="button" className="btn btn-ghost btn-sm btn-ghost-danger"
                          onClick={async () => { if (await confirm(`Delete booking ${b.booking_number}? Use Cancel instead if the advance was refunded.`)) deleteMut.mutate(b.id); }}>
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
