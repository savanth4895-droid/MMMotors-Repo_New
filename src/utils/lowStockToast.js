import toast from 'react-hot-toast';

// The backend returns `low_stock_alerts` on every bill save: the PRIORITY parts that
// just crossed their reorder level with this bill. It stays on screen until dismissed,
// because whoever used the part is the one who has to get it reordered.
export function notifyLowStock(alerts) {
  if (!Array.isArray(alerts) || alerts.length === 0) return;
  const lines = alerts.map(a => `${a.name}${a.part_number ? ` (${a.part_number})` : ''} — ${a.stock} left`);
  toast(
    `Order now: ${alerts.length} priority part${alerts.length > 1 ? 's' : ''} ran low\n${lines.join('\n')}`,
    { duration: Infinity, icon: '★', id: 'low-stock', style: { whiteSpace: 'pre-line', maxWidth: 420 } },
  );
}
