import { useEffect, useRef, useState, useCallback } from 'react';

// ── useDraft ───────────────────────────────────────────────────────────
// Generic form-draft hook backed by localStorage.
//
// key      : unique localStorage key (e.g. 'mm_draft_sale')
// state    : current form state object (any shape)
// enabled  : if false, skip auto-save (e.g. when editing existing record)
// autosaveMs : throttle for auto-save (default 3000ms)
//
// Returns:
//   { saveDraft, clearDraft, loadDraft, hasDraft, lastSaved, isDirty }
//
// Callers wire loadDraft() into their setState on user action.
// Callers must call clearDraft() after successful submit.
export function useDraft({ key, state, enabled = true, autosaveMs = 3000 }) {
  const [lastSaved, setLastSaved] = useState(null); // Date or null
  const [isDirty, setIsDirty]     = useState(false);
  const stateRef                  = useRef(state);
  const timerRef                  = useRef(null);

  // Track latest state without re-triggering effect
  useEffect(() => { stateRef.current = state; }, [state]);

  const saveDraft = useCallback(() => {
    try {
      const payload = { data: stateRef.current, ts: Date.now() };
      localStorage.setItem(key, JSON.stringify(payload));
      setLastSaved(new Date());
      setIsDirty(false);
      return true;
    } catch {
      return false;
    }
  }, [key]);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(key); } catch {}
    setLastSaved(null);
    setIsDirty(false);
  }, [key]);

  const loadDraft = useCallback(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.data ?? null;
    } catch { return null; }
  }, [key]);

  const hasDraft = useCallback(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.ts ? new Date(parsed.ts) : null;
    } catch { return null; }
  }, [key]);

  // Mark dirty when state changes
  useEffect(() => {
    if (!enabled) return;
    setIsDirty(true);
  }, [state, enabled]);

  // Auto-save throttle
  useEffect(() => {
    if (!enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { saveDraft(); }, autosaveMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [state, enabled, autosaveMs, saveDraft]);

  return { saveDraft, clearDraft, loadDraft, hasDraft, lastSaved, isDirty };
}

// ── DraftBar ────────────────────────────────────────────────────────────
// Reusable UI: shows Save Draft button, timestamp, Restore prompt.
//
// Props:
//   draft       : object returned by useDraft
//   onRestore   : (data) => void  — called when user clicks Restore
//   onDiscard   : ()     => void  — called when user clicks Discard
export function DraftBar({ draft, onRestore, onDiscard }) {
  const [available, setAvailable] = useState(() => draft.hasDraft());

  // Refresh availability on every render tick
  useEffect(() => {
    const t = setInterval(() => setAvailable(draft.hasDraft()), 5000);
    return () => clearInterval(t);
  }, [draft]);

  const barStyle = {
    display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
    padding:'8px 12px', margin:'0 0 12px 0',
    background:'rgba(184,134,11,.06)', border:'1px solid rgba(184,134,11,.25)',
    borderRadius:4, fontSize:12,
  };
  const btnStyle = {
    padding:'4px 10px', fontSize:11, borderRadius:3, cursor:'pointer',
    background:'var(--surface2)', border:'1px solid var(--border)', color:'var(--text)',
  };
  const primaryBtn = { ...btnStyle, background:'var(--accent,#b8860b)', color:'#000', borderColor:'transparent' };

  const fmt = (d) => {
    if (!d) return '';
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 5)    return 'just now';
    if (s < 60)   return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    return d.toLocaleTimeString();
  };

  return (
    <div style={barStyle}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        {available ? (
          <>
            <span style={{ color:'var(--muted)' }}>
              Draft saved {fmt(available)}
            </span>
            {onRestore && (
              <button type="button" style={btnStyle} onClick={() => {
                const data = draft.loadDraft();
                if (data) onRestore(data);
              }}>Restore</button>
            )}
            {onDiscard && (
              <button type="button" style={btnStyle} onClick={() => {
                draft.clearDraft();
                setAvailable(null);
                if (onDiscard) onDiscard();
              }}>Discard</button>
            )}
          </>
        ) : (
          <span style={{ color:'var(--muted)' }}>
            {draft.lastSaved
              ? `Auto-saved ${fmt(draft.lastSaved)}`
              : draft.isDirty ? 'Unsaved changes…' : 'No draft'}
          </span>
        )}
      </div>
      <button type="button" style={primaryBtn} onClick={() => {
        const ok = draft.saveDraft();
        if (ok) setAvailable(draft.hasDraft());
      }}>Save Draft</button>
    </div>
  );
}
