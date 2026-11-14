

// A–Z so staff can scan for one; existing names unchanged so saved parts keep their category
export const CATEGORIES = [
  'Accessories', 'Battery', 'Bearings', 'Body Parts', 'Brakes', 'Cables', 'Chain & Sprocket',
  'Clutch', 'Consumables', 'Electrical', 'Engine', 'Engine Oil & Lubricants', 'Exhaust & Silencer',
  'Filters', 'Fuel System', 'Gaskets & Seals', 'Handlebar & Controls', 'Helmets & Riding Gear',
  'Lights & Indicators', 'Mirrors', 'Nuts, Bolts & Fasteners', 'Rubber Parts', 'Seats & Covers',
  'Suspension', 'Tools', 'Transmission', 'Tyres & Tubes', 'Wheels & Rims',
  'Other',
];

export function stockStyle(p) {
  if (p.stock === 0)                   return { color:'var(--color-error)',   bg:'color-mix(in oklab, var(--color-error) 9%, var(--color-paper))',    border:'transparent', label:'Out of stock', cls:'pill-red' };
  if (p.stock <= (p.reorder_level||5)) return { color:'var(--color-warn)',    bg:'color-mix(in oklab, var(--color-accent) 16%, var(--color-paper))',  border:'transparent', label:'Low stock',    cls:'pill-amber' };
  return                                      { color:'var(--color-success)', bg:'color-mix(in oklab, var(--color-success) 10%, var(--color-paper))', border:'transparent', label:'OK',           cls:'pill-green' };
}
