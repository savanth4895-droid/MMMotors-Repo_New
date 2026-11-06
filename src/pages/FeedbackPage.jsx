import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import Monogram from '../components/Monogram';

// Public page — customers open it from the WhatsApp link, no login.
export default function FeedbackPage() {
  const { token } = useParams();
  const [info, setInfo]       = useState(null);
  const [error, setError]     = useState('');
  const [rating, setRating]   = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone]       = useState(false);

  useEffect(() => {
    document.title = 'Feedback · MM Motors';
    api.get(`/feedback/${encodeURIComponent(token)}`)
      .then(r => { setInfo(r.data); setDone(r.data.submitted); })
      .catch(e => setError(errMsg(e, 'This feedback link is not valid')));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      await api.post(`/feedback/${encodeURIComponent(token)}`, { rating, comment });
      setDone(true);
    } catch (err) {
      setError(errMsg(err, 'Could not send feedback'));
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="login-form-col" style={{ minHeight: '100vh' }}>
      <div className="login-form-wrap">
        <div className="login-wordmark">
          <Monogram size={36} className="login-wordmark-mark" />
          <div className="login-wordmark-name">MM Motors</div>
        </div>

        {done ? (
          <>
            <h1 className="login-title">Thank you!</h1>
            <p className="login-sub">Your feedback helps us serve you better.</p>
          </>
        ) : !info ? (
          error ? <div className="api-error" role="alert">{error}</div>
                : <p className="login-sub" role="status">Loading…</p>
        ) : (
          <>
            <h1 className="login-title">How was your service{info.customer_name ? `, ${info.customer_name}` : ''}?</h1>
            <p className="login-sub">{info.vehicle} · {info.vehicle_number}</p>

            <form onSubmit={submit} className="login-form">
              <div className="field">
                <span className="field-label" id="fb-rating">Rating</span>
                <div role="group" aria-labelledby="fb-rating" style={{ display: 'flex', gap: 'var(--space-2xs)' }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => setRating(n)}
                      aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={rating === n}
                      style={{ fontSize: 34, lineHeight: 1, minWidth: 44, minHeight: 44, background: 'none', border: 0, cursor: 'pointer',
                               color: n <= rating ? 'var(--color-accent)' : 'var(--color-rule-2)' }}>
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="fb-comment">Comments (optional)</label>
                <textarea id="fb-comment" rows={4} maxLength={1000} value={comment}
                  onChange={e => setComment(e.target.value)} placeholder="Tell us what went well or what we can improve" />
              </div>

              {error && <div className="api-error" role="alert">{error}</div>}

              <button type="submit" className="btn btn-primary login-submit" disabled={!rating || sending} aria-busy={sending || undefined}>
                {sending ? 'Sending…' : 'Send feedback'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
