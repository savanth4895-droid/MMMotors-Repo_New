

// ═══════════════════════════════════════════════════════════════════════════════
//  SHARED PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════════

export function ModalShell({ children, onClose, title, sub }) {
  return (
    <div onClick={onClose} className="dialog-backdrop sheet-backdrop">
      <div onClick={e=>e.stopPropagation()} className="dialog sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="record-head">
          <div>
            <h2 className="record-title">{title}</h2>
            {sub && <div className="record-id">{sub}</div>}
          </div>
          <button type="button" className="record-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ModalFoot({ children }) {
  return <div className="record-foot sheet-foot">{children}</div>;
}
