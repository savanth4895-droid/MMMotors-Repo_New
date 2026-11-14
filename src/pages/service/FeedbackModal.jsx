import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { serviceApi, errMsg } from '../../api/client';
import { ModalShell } from './Modal';

// One tap saves one star rating (owner's choice): red 1, yellow 3, green 5.
// It feeds the same "Customer rating" average as the link the customer fills in.
const FACES = [
  { rating: 1, label: 'Unhappy', color: 'var(--color-error)',   mouth: 'M15 34 Q24 26 33 34' },
  { rating: 3, label: 'Okay',    color: 'var(--color-warn)',    mouth: 'M16 31 L32 31' },
  { rating: 5, label: 'Happy',   color: 'var(--color-success)', mouth: 'M15 29 Q24 38 33 29' },
];

function Face({ color, mouth }) {
  return (
    <svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill={color} />
      <circle cx="17" cy="19" r="3" fill="#fff" />
      <circle cx="31" cy="19" r="3" fill="#fff" />
      <path d={mouth} stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// Delivered job → record the customer's reaction at the counter, or WhatsApp them the link.
export default function FeedbackModal({ job, onSendLink, onClose }) {
  const qc = useQueryClient();
  const [instant, setInstant] = useState(false);
  const token = async () => job.feedback_token || (await serviceApi.feedbackLink(job._id || job.id)).data.token;

  const rateMut = useMutation({
    mutationFn: async rating => serviceApi.submitFeedback(await token(), rating),
    onSuccess: () => {
      qc.invalidateQueries(['service-jobs']);
      qc.invalidateQueries(['service-stats']);
      toast.success('Feedback saved');
      onClose();
    },
    onError: e => toast.error(errMsg(e, 'Could not save feedback')),
  });
  const linkMut = useMutation({
    mutationFn: async () => onSendLink(job, await token()),
    onSuccess: onClose,
    onError: e => toast.error(errMsg(e, 'Could not create feedback link')),
  });
  const busy = rateMut.isPending || linkMut.isPending;

  return (
    <ModalShell onClose={onClose} title="Customer feedback"
      sub={`${job.job_number || ''} · ${job.customer_name || ''}`}>
      {!instant ? (
        <div style={{ display:'grid', gap:'var(--space-sm)', padding:'var(--space-md) 0' }}>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setInstant(true)}>
            Instant feedback
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy || !job.customer_mobile}
            onClick={() => linkMut.mutate()}>
            {job.customer_mobile ? 'Send link on WhatsApp' : 'Send link (no mobile number)'}
          </button>
        </div>
      ) : (
        <div style={{ padding:'var(--space-md) 0' }}>
          <p style={{ marginBottom:'var(--space-md)' }}>How happy is the customer?</p>
          <div role="group" aria-label="Customer rating" style={{ display:'flex', gap:'var(--space-lg)', justifyContent:'center' }}>
            {FACES.map(f => (
              <button key={f.rating} type="button" disabled={busy} onClick={() => rateMut.mutate(f.rating)}
                aria-label={`${f.label}, ${f.rating} star${f.rating > 1 ? 's' : ''}`}
                style={{ background:'none', border:0, padding:'var(--space-2xs)', cursor:'pointer', textAlign:'center' }}>
                <Face color={f.color} mouth={f.mouth} />
                <div style={{ fontSize:'var(--text-xs)', color:'var(--color-muted)' }}>{f.label}</div>
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop:'var(--space-md)' }}
            disabled={busy} onClick={() => setInstant(false)}>Back</button>
        </div>
      )}
    </ModalShell>
  );
}
