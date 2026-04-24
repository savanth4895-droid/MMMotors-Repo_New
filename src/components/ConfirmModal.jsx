import { createContext, useContext, useState, useCallback } from 'react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  // state = { message, subMessage, danger, resolve }

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setState({ message, subMessage: options.sub, danger: options.danger ?? true, resolve });
    });
  }, []);

  const handleResponse = (result) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => handleResponse(false)}
        >
          <div
            style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:6, width:'100%', maxWidth:380, overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* header */}
            <div style={{ padding:'20px 22px 16px', borderBottom:'1px solid var(--border)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                {state.danger && (
                  <div style={{ width:28, height:28, background:'rgba(220,38,38,.1)', border:'1px solid rgba(220,38,38,.2)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <span style={{ fontSize:13, color:'var(--red)' }}>!</span>
                  </div>
                )}
                <div style={{ fontSize:13, fontWeight:600, letterSpacing:'-.01em' }}>{state.message}</div>
              </div>
              {state.subMessage && (
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:8, lineHeight:1.6, paddingLeft: state.danger ? 38 : 0 }}>{state.subMessage}</div>
              )}
            </div>
            {/* actions */}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'14px 22px' }}>
              <button
                onClick={() => handleResponse(false)}
                style={{ padding:'8px 16px', background:'transparent', border:'1px solid var(--border2)', borderRadius:3, color:'var(--muted)', cursor:'pointer', fontSize:12, fontFamily:'IBM Plex Sans,sans-serif' }}
              >Cancel</button>
              <button
                onClick={() => handleResponse(true)}
                style={{ padding:'8px 18px', background: state.danger ? 'var(--red)' : 'var(--accent)', color:'#fff', border:'none', borderRadius:3, cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'IBM Plex Sans,sans-serif', letterSpacing:'.03em' }}
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
