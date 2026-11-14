import toast from 'react-hot-toast';

// Opens WhatsApp with a message ready for staff to send. A save that took a while can make
// the browser block the pop-up, so then a toast offers the same message on one tap.
export function openWA(mobile, msg) {
  const m = String(mobile || '').replace(/\D/g, '').slice(-10);
  if (m.length !== 10) return;
  const url = `https://wa.me/91${m}?text=${encodeURIComponent(msg)}`;
  if (!window.open(url, '_blank')) {
    toast(t => (
      <span>WhatsApp didn't open.{' '}
        <button type="button" className="link-btn" onClick={() => { window.open(url, '_blank'); toast.dismiss(t.id); }}>Send the update</button>
      </span>
    ), { duration: 10000 });
  }
}

// Job progress messages, sent as the job card moves along
export const bikeOf = j => `${j.brand} ${j.model}${j.vehicle_number ? ` (${j.vehicle_number})` : ''}`;

export const PROGRESS_MSG = {
  received:    j => `Hello ${j.customer_name}, we have received your ${bikeOf(j)} at MM Motors. Job card ${j.job_number}. We'll message you when work starts.`,
  in_progress: j => `Hello ${j.customer_name}, work has started on your ${bikeOf(j)}. We'll message you as soon as it's ready.`,
  ready:       j => `Hello ${j.customer_name}, your ${bikeOf(j)} service is complete.${j.grand_total ? ` Bill amount: ₹${Number(j.grand_total).toLocaleString('en-IN')}.` : ''} Ready for pickup at MM Motors!`,
};

// ─── Style tokens ─────────────────────────────────────────────────────────────
export const C = {
  surface: 'var(--color-paper)',
  s2:      'var(--color-paper-2)',
  border:  'var(--color-rule)',
  border2: 'var(--color-rule-2)',
  text:    'var(--color-ink)',
  muted:   'var(--color-muted)',
  gold:    'var(--color-accent-text)',
  green:   'var(--color-success)',
  amber:   'var(--color-warn)',
  red:     'var(--color-error)',
};

// Fields and buttons take the global styles; these stay as per-use override hooks.
export const inp = { width:'100%' };

export const labelSt = { display:'block', fontSize:'var(--text-xs)', fontWeight:500,
  color:'var(--color-ink-2)', marginBottom:'var(--space-2xs)' };
