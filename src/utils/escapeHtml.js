// Print windows are built as HTML strings, so every stored value must be escaped
// before it is interpolated. escapeDeep returns a copy with every string escaped
// (numbers, booleans and null are kept as they are).
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"'`]/g, c => ENTITIES[c]);

export function escapeDeep(value) {
  if (typeof value === 'string') return escapeHtml(value);
  if (Array.isArray(value)) return value.map(escapeDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = escapeDeep(v);
    return out;
  }
  return value;
}
