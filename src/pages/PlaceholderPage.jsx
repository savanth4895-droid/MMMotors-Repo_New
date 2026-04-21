export default function PlaceholderPage({ page }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '70vh', gap: 10,
    }}>
      <div className="display" style={{ fontSize: 64, color: 'var(--border2)', letterSpacing: '-.05em' }}>
        {page?.toUpperCase()}
      </div>
      <div className="label-xs">Coming in Phase 2</div>
      <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>
        Backend API is live — frontend wiring in next phase
      </div>
    </div>
  );
}
