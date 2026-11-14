import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { serviceApi, errMsg } from '../../api/client';
import { ModalShell } from './Modal';

// One tap saves one star rating (owner's choice): red 1, yellow 3, green 5.
// It feeds the same "Customer rating" average as the link the customer fills in.
// Yellow is a fixed colour: the theme's warning token renders brown, and customers read the face colour.
const FACES = [
  { rating: 1, label: 'Unhappy', color: 'var(--color-error)',   ink: '#fff',    mouth: 'M15 34 Q24 26 33 34' },
  { rating: 3, label: 'Okay',    color: '#F5C400',              ink: '#3D2E00', mouth: 'M16 31 L32 31' },
  { rating: 5, label: 'Happy',   color: 'var(--color-success)', ink: '#fff',    mouth: 'M15 29 Q24 38 33 29' },
];

function Face({ color, ink, mouth }) {
  return (
    <svg viewBox="0 0 48 48" width="100%" aria-hidden="true" style={{ display:'block' }}>
      <circle cx="24" cy="24" r="22" fill={color} />
      <circle cx="17" cy="19" r="3" fill={ink} />
      <circle cx="31" cy="19" r="3" fill={ink} />
      <path d={mouth} stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
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

  // Instant feedback takes the whole screen so the customer can tap a face at the counter.
  if (instant) return (
    <div role="dialog" aria-modal="true" aria-label="Customer feedback"
      style={{ position:'fixed', inset:0, zIndex:10000, background:'var(--color-paper)',
               display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
               gap:'var(--space-xl)', padding:'var(--space-lg)' }}>
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setInstant(false)}
        style={{ position:'absolute', top:'var(--space-md)', left:'var(--space-md)' }}>← Back</button>
      <h2 style={{ fontSize:'clamp(1.75rem, 5vw, 3rem)', textAlign:'center', maxWidth:'none' }}>
        How was your service today{job.customer_name ? `, ${job.customer_name.split(' ')[0]}` : ''}?
      </h2>
      <div role="group" aria-label="Customer rating"
        style={{ display:'flex', gap:'clamp(1rem, 5vw, 4rem)', justifyContent:'center', width:'100%' }}>
        {FACES.map(f => (
          <button key={f.rating} type="button" disabled={busy} onClick={() => rateMut.mutate(f.rating)}
            aria-label={`${f.label}, ${f.rating} star${f.rating > 1 ? 's' : ''}`}
            style={{ background:'none', border:0, padding:0, cursor:'pointer', textAlign:'center',
                     width:'min(26vw, 45vh)' }}>
            <Face color={f.color} ink={f.ink} mouth={f.mouth} />
            <div style={{ fontSize:'clamp(1rem, 3vw, 1.75rem)', fontWeight:600, marginTop:'var(--space-sm)' }}>{f.label}</div>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <ModalShell onClose={onClose} title="Customer feedback"
      sub={`${job.job_number || ''} · ${job.customer_name || ''}`}>
      <div style={{ display:'grid', gap:'var(--space-sm)', padding:'var(--space-lg)' }}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setInstant(true)}>
          Instant feedback
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy || !job.customer_mobile}
          onClick={() => linkMut.mutate()}>
          {job.customer_mobile ? 'Send link on WhatsApp' : 'Send link (no mobile number)'}
        </button>
      </div>
    </ModalShell>
  );
}
