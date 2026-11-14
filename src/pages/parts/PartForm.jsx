import { useState } from 'react';
import { Btn, GhostBtn, Field } from '../../components/ui';
import { CATEGORIES } from './shared';

// Same list as VehiclesPage — a part is a standard fitting for whichever of these it is ticked for.
const BRANDS = [
  'HERO', 'HONDA', 'BAJAJ', 'TVS', 'YAMAHA', 'SUZUKI', 'ROYAL ENFIELD',
  'KTM', 'PIAGGIO', 'APRILIA', 'TRIUMPH', 'KAWASAKI', 'JAWA', 'YEZDI',
  'BMW', 'ATHER', 'OLA', 'VIDA'
];

// ── Add / Edit part form ─────────────────────────────────────────────
export function PartForm({ initial = {}, onSave, onCancel, saving }) {
  const [f, setF] = useState({
    part_number:'', name:'', category:'', brand:'', hsn_code:'', location:'',
    ...initial,
    priority: !!initial.priority,
    fitting_brands: initial.fitting_brands || [],
    fitting_qty: String(initial.fitting_qty ?? 1),
    compatible_with: (initial.compatible_with || []).join(', '),   // typed as text, split on save so spaces survive typing
    stock: String(initial.stock ?? 0),
    reorder_level: String(initial.reorder_level ?? 5),
    purchase_price: String(initial.purchase_price ?? ''),
    selling_price: String(initial.selling_price ?? ''),
    gst_rate: String(initial.gst_rate ?? 18),
  });
  const s = k => e => setF(p=>({...p,[k]:e.target.value}));
  const selStyle = { width:'100%' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:680 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <Field label="Part number"><input value={f.part_number}    onChange={s('part_number')}    placeholder="Leave blank to auto-generate" className="mono" /></Field>
        <Field label="Name *">       <input value={f.name}           onChange={s('name')}           placeholder="Spark Plug (Iridium)" /></Field>
        <Field label="Category">
          <select value={f.category} onChange={s('category')} style={selStyle}>
            <option value="">Select category</option>
            {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Brand">       <input value={f.brand}          onChange={s('brand')}          placeholder="NGK, Honda, MRF…" /></Field>
        <Field label="Stock quantity"><input type="number" value={f.stock}          onChange={s('stock')}          placeholder="0" /></Field>
        <Field label="Reorder level"><input type="number" value={f.reorder_level} onChange={s('reorder_level')} placeholder="5" /></Field>
        <Field label="Purchase price (₹)"><input type="number" value={f.purchase_price} onChange={s('purchase_price')} placeholder="0" /></Field>
        <Field label="Selling price (₹) *"><input type="number" value={f.selling_price} onChange={s('selling_price')} placeholder="0" /></Field>
        <Field label="GST rate (%)">
          <select value={f.gst_rate} onChange={s('gst_rate')} style={selStyle}>
            {[0,5,12,18,28].map(r=><option key={r} value={r}>{r}%</option>)}
          </select>
        </Field>
        <Field label="HSN code"><input value={f.hsn_code}  onChange={s('hsn_code')}  placeholder="8511"  className="mono" /></Field>
        <Field label="Location">  <input value={f.location}  onChange={s('location')}  placeholder="A1-R2" className="mono" /></Field>
      </div>
      {/* Compatible models — free text */}
      <Field label="Compatible Models">
        <input
          value={f.compatible_with}
          onChange={s('compatible_with')}
          placeholder="e.g. Activa 6G, Jupiter, Splendor Plus"
        />
      </Field>
      <label style={{ display:'flex', alignItems:'flex-start', gap:8, cursor:'pointer' }}>
        <input type="checkbox" checked={f.priority} onChange={e=>setF(p=>({...p,priority:e.target.checked}))} />
        <span>
          <strong>Priority part</strong> (fast moving)
          <span style={{ display:'block', fontSize:'var(--text-xs)', color:'var(--muted)' }}>
            You get an alert the moment this one drops to its reorder level. Other parts stay on the order list quietly.
          </span>
        </span>
      </label>
      {/* Standard fitting: pre-fills the New Sale form for these brands */}
      <fieldset style={{ border:'1px solid var(--border)', borderRadius:'var(--radius-control)', padding:'10px 12px' }}>
        <legend style={{ fontSize:'var(--text-sm)', fontWeight:600, padding:'0 4px' }}>Standard fitting</legend>
        <div style={{ fontSize:'var(--text-xs)', color:'var(--muted)', marginBottom:8 }}>
          Tick the brands this is fitted to as standard. Every new sale of those bikes starts with it listed, and stock comes off when the sale is saved. Leave all unticked for a part that is not a fitting. To fit it to only some models, list them in Compatible Models above (exactly as the model is written on the vehicle).
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 12px' }}>
          {BRANDS.map(b => (
            <label key={b} style={{ display:'flex', alignItems:'center', gap:5, fontSize:'var(--text-xs)', cursor:'pointer' }}>
              <input
                type="checkbox"
                checked={f.fitting_brands.includes(b)}
                onChange={e=>setF(p=>({ ...p, fitting_brands: e.target.checked
                  ? [...p.fitting_brands, b]
                  : p.fitting_brands.filter(x=>x!==b) }))}
              />
              {b}
            </label>
          ))}
        </div>
        {f.fitting_brands.length > 0 && (
          <div style={{ marginTop:10, maxWidth:200 }}>
            <Field label="How many per bike"><input type="number" min="1" value={f.fitting_qty} onChange={s('fitting_qty')} /></Field>
          </div>
        )}
      </fieldset>
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
        <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
        <Btn disabled={!f.name||!f.selling_price||saving} onClick={()=>onSave({
          ...f,
          stock:          parseInt(f.stock)||0,
          reorder_level:  parseInt(f.reorder_level)||5,
          purchase_price: parseFloat(f.purchase_price)||0,
          selling_price:  parseFloat(f.selling_price)||0,
          gst_rate:       parseFloat(f.gst_rate)||18,
          compatible_with: f.compatible_with.split(',').map(m => m.trim()).filter(Boolean),
          priority:       !!f.priority,
          fitting_brands: f.fitting_brands || [],
          fitting_qty:    parseInt(f.fitting_qty)||1,
        })}>
          {saving?'Saving…':'Save part'}
        </Btn>
      </div>
    </div>
  );
}
