import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  // state = { message, subMessage, danger, resolve }

  const dialogRef = useRef(null);
  const returnFocusRef = useRef(null);

  const confirm = useCallback((message, options = {}) => {
    returnFocusRef.current = document.activeElement;
    return new Promise((resolve) => {
      setState({ message, subMessage: options.sub, danger: options.danger ?? true, resolve });
    });
  }, []);

  const handleResponse = (result) => {
    state?.resolve(result);
    setState(null);
  };

  // While open: Escape cancels from anywhere, Tab stays inside the dialog,
  // and focus goes back to whatever opened it on close.
  useEffect(() => {
    if (!state) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); state.resolve(false); setState(null); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const els = dialogRef.current.querySelectorAll('button:not([disabled])');
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (!dialogRef.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const el = returnFocusRef.current;
      if (el && typeof el.focus === 'function' && document.contains(el)) el.focus();
    };
  }, [state]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="dialog-backdrop" onClick={() => handleResponse(false)}>
          <div
            ref={dialogRef}
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby={state.subMessage ? 'confirm-sub' : undefined}
            onClick={e => e.stopPropagation()}
          >
            <div className="dialog-body">
              <h2 id="confirm-title" className="dialog-title">{state.message}</h2>
              {state.subMessage && (
                <p id="confirm-sub" className="dialog-sub">{state.subMessage}</p>
              )}
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                autoFocus
                className="btn btn-ghost"
                onClick={() => handleResponse(false)}
              >Cancel</button>
              <button
                type="button"
                className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => handleResponse(true)}
              >{state.danger ? 'Delete' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be inside ConfirmProvider');
  return ctx;
}
