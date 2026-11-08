import { useState, useEffect } from 'react';
import { bookingApi, errMsg } from '../api/client';
import Monogram from '../components/Monogram';

// Public page — customers book a service visit without logging in. Share /book.
const dayLabel = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short' });
};

export default function BookingPage() {
  const [opts, setOpts]     = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [f, setF] = useState({ name:'', mobile:'', vehicle_number:'', brand:'', model:'', service_type:'', complaint:'', date:'', website:'' });
  const [error, setError]   = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone]     = useState(null);

  useEffect(() => {
    document.title = 'Book a service · MM Motors';
    bookingApi.availability()
      .then(r => setOpts(r.data))
      .catch(e => setLoadErr(errMsg(e, 'Booking is not available right now. Please call the shop.')));
  }, []);

  const s = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  const ready = f.name.trim() && f.mobile.replace(/\D/g, '').length >= 10 && f.vehicle_number.trim().length >= 4
    && f.brand && f.model.trim() && f.service_type && f.date;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      const r = await bookingApi.book({ ...f, vehicle_number: f.vehicle_number.trim().toUpperCase() });
      setDone(r.data);
    } catch (err) {
      setError(errMsg(err, 'Could not book. Please try again.'));
      // A day may have filled up meanwhile — refresh the dates
      bookingApi.availability().then(r => setOpts(r.data)).catch(() => {});
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="login-form-col" style={{ minHeight:'100vh', alignItems:'flex-start' }}>
      <div className="login-form-wrap" style={{ maxWidth:440 }}>
        <div className="login-wordmark">
          <Monogram size={36} className="login-wordmark-mark" />
          <div>
            <div className="login-wordmark-name">MM Motors</div>
            <div className="login-wordmark-sub">Multi-brand service, Malur</div>
          </div>
        </div>

        {done ? (
          <>
            <h1 className="login-title">You're booked!</h1>
            <p className="login-sub">
              Please bring your bike on <strong>{dayLabel(done.date)}</strong>.
              {done.job_number && <> Your booking number is <strong className="mono">{done.job_number}</strong>.</>}
            </p>
            <p className="login-sub">We're closed on Sundays. If you can't make it, please let us know.</p>
          </>
        ) : !opts ? (
          loadErr ? <div className="api-error" role="alert">{loadErr}</div> : <p className="login-sub" role="status">Loading…</p>
        ) : opts.paused ? (
          <>
            <h1 className="login-title">Book a service</h1>
            <p className="login-sub">Online booking is paused right now. Please call or visit the shop to book your service.</p>
          </>
        ) : (
          <>
            <h1 className="login-title">Book a service</h1>
            <p className="login-sub">Pick a day and bring your bike in. No payment needed now.</p>

            <form onSubmit={submit} className="login-form">
              <div className="field">
                <label className="field-label" htmlFor="bk-name">Your name</label>
                <input id="bk-name" value={f.name} onChange={s('name')} autoComplete="name" />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="bk-mobile">Mobile number</label>
                <input id="bk-mobile" value={f.mobile} onChange={s('mobile')} inputMode="tel" autoComplete="tel" placeholder="10-digit mobile" />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="bk-vn">Vehicle number</label>
                <input id="bk-vn" value={f.vehicle_number} onChange={s('vehicle_number')} placeholder="KA 07 U 3915" autoCapitalize="characters" />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-sm)' }}>
                <div className="field">
                  <label className="field-label" htmlFor="bk-brand">Brand</label>
                  <select id="bk-brand" value={f.brand} onChange={s('brand')}>
                    <option value="">Choose…</option>
                    {opts.brands.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="bk-model">Model</label>
                  <input id="bk-model" value={f.model} onChange={s('model')} placeholder="e.g. Activa 6G" />
                </div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="bk-type">Service needed</label>
                <select id="bk-type" value={f.service_type} onChange={s('service_type')}>
                  <option value="">Choose…</option>
                  {opts.service_types.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="bk-date">Day</label>
                <select id="bk-date" value={f.date} onChange={s('date')}>
                  <option value="">Choose a day…</option>
                  {opts.days.map(d => (
                    <option key={d.date} value={d.date} disabled={d.left === 0}>
                      {dayLabel(d.date)}{d.left === 0 ? ' (full)' : ''}
                    </option>
                  ))}
                </select>
                <span className="label-xs">Closed on Sundays.</span>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="bk-notes">Anything we should know? (optional)</label>
                <textarea id="bk-notes" rows={3} maxLength={500} value={f.complaint} onChange={s('complaint')} placeholder="Noise from engine, brakes weak…" />
              </div>
              {/* Spam trap: hidden from people, filled in by bots */}
              <input type="text" name="website" value={f.website} onChange={s('website')} tabIndex={-1} autoComplete="off" aria-hidden="true"
                style={{ position:'absolute', left:'-9999px', width:1, height:1 }} />

              {error && <div className="api-error" role="alert">{error}</div>}
              <button type="submit" className="btn btn-primary login-submit" disabled={!ready || sending} aria-busy={sending || undefined}>
                {sending ? 'Booking…' : 'Book service'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
