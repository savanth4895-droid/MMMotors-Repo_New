import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vehiclesApi } from '../api/client';
import { Btn, GhostBtn, Field, Skeleton, Empty, ApiError } from '../components/ui';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';

const BRANDS = [
  'HERO', 'HONDA', 'BAJAJ', 'TVS', 'YAMAHA', 'SUZUKI', 'ROYAL ENFIELD', 
  'KTM', 'PIAGGIO', 'APRILIA', 'TRIUMPH', 'KAWASAKI', 'JAWA', 'YEZDI', 
  'BMW', 'ATHER', 'OLA', 'VIDA'
];

const MODELS = {
  HERO: [
    'Splendor Plus', 'Splendor Plus Xtec', 'Super Splendor', 'HF Deluxe', 
    'Passion Plus', 'Passion Xtec', 'Glamour', 'Glamour Xtec', 
    'Xtreme 125R', 'Xtreme 160R', 'Xtreme 160R 4V', 'Xpulse 200 4V', 
    'Xpulse 200T 4V', 'Karizma XMR', 'Destini 125 Xtec', 'Pleasure Plus', 'Xoom 110'
  ],
  HONDA: [
    'Activa 6G', 'Activa 125', 'Shine 100', 'Shine 125', 'SP 125', 'SP 160', 
    'Unicorn', 'Livo', 'Hornet 2.0', 'CB200X', 'CB300F', 'CB300R', 
    'Hness CB350', 'CB350RS', 'CB350', 'Dio', 'Dio 125'
  ],
  BAJAJ: [
    'Pulsar 125', 'Pulsar 150', 'Pulsar N150', 'Pulsar N160', 'Pulsar NS160', 
    'Pulsar NS200', 'Pulsar N250', 'Pulsar NS400Z', 'Platina 100', 'Platina 110', 
    'CT 110X', 'Avenger Street 160', 'Avenger Cruise 220', 'Dominar 250', 
    'Dominar 400', 'Chetak'
  ],
  TVS: [
    'Jupiter 110', 'Jupiter 125', 'Ntorq 125', 'Apache RTR 160', 'Apache RTR 160 4V', 
    'Apache RTR 180', 'Apache RTR 200 4V', 'Apache RR 310', 'Apache RTR 310', 
    'Raider 125', 'XL100', 'Sport', 'Radeon', 'Ronin', 'iQube', 'Zest 110'
  ],
  YAMAHA: [
    'FZ FI V3', 'FZ-S FI V3', 'FZ-S FI V4', 'FZ-X', 'MT-15 V2', 
    'R15 V4', 'R15S', 'Fascino 125', 'Ray ZR 125', 'Aerox 155'
  ],
  SUZUKI: [
    'Access 125', 'Burgman Street', 'Avenis 125', 'Gixxer 155', 'Gixxer SF 155', 
    'Gixxer 250', 'Gixxer SF 250', 'V-Strom SX', 'Hayabusa'
  ],
  'ROYAL ENFIELD': [
    'Classic 350', 'Bullet 350', 'Hunter 350', 'Meteor 350', 'Himalayan 450', 
    'Scram 411', 'Interceptor 650', 'Continental GT 650', 'Super Meteor 650', 
    'Shotgun 650', 'Guerrilla 450'
  ],
  KTM: [
    '125 Duke', '200 Duke', '250 Duke', '390 Duke', 
    'RC 125', 'RC 200', 'RC 390', 
    '250 Adventure', '390 Adventure'
  ],
  PIAGGIO: [
    'Vespa ZX 125', 'Vespa VXL 125', 'Vespa SXL 125', 
    'Vespa VXL 150', 'Vespa SXL 150', 'Vespa Dual'
  ],
  APRILIA: ['SR 125', 'SR 160', 'SXR 125', 'SXR 160', 'RS 457'],
  TRIUMPH: ['Speed 400', 'Scrambler 400 X', 'Trident 660', 'Street Triple 765', 'Tiger Sport 660', 'Tiger 900', 'Bonneville T100', 'Bonneville T120'],
  KAWASAKI: ['Ninja 300', 'Ninja ZX-10R', 'Z900', 'Vulcan S'],
  JAWA: ['Jawa 42', 'Jawa 42 Bobber', 'Perak'],
  YEZDI: ['Scrambler', 'Roadster', 'Adventure'],
  BMW: ['G310 R', 'G310 RR', 'G310 GS'],
  ATHER: ['450X', '450S', 'Rizta'],
  OLA: ['S1 Pro', 'S1 Air', 'S1 X', 'Roadster'],
  VIDA: ['V1 Pro', 'V1 Plus', 'VX2']
};

const STATUS_STYLE = {
  in_stock:   { color: '#4ade80', bg: 'rgba(74,222,128,.1)',   border: 'rgba(74,222,128,.25)',   label: 'In stock' },
  in_service: { color: '#f0c040', bg: 'rgba(240,192,64,.1)',   border: 'rgba(240,192,64,.25)',   label: 'In service' },
  sold:       { color: '#6b6478', bg: 'rgba(107,100,120,.1)',  border: 'rgba(107,100,120,.25)',  label: 'Sold' },
};

// ── Vehicle form (add / edit) ────────────────────────────────────────
function VehicleForm({ initial = {}, onSave, onCancel, saving }) {
  const [f, setF] = useState({
    type: 'new', brand: '', model: '', variant: '', color: '',
    chassis_number: '', engine_number: '', vehicle_number: '', key_number: '',
    purchase_price: '', status: 'Instock',
    inbound_date: '', location: '', outbound_date: '', outbound_location: '',
    ...initial
  });

  const handleChange = (key, value) => setF(prev => ({ ...prev, [key]: value }));

  const selStyle = { 
    background: 'var(--surface2)', 
    border: '1px solid var(--border)', 
    borderRadius: 3, 
    padding: '8px 10px', 
    color: 'var(--text)', 
    outline: 'none', 
    fontSize: 13, 
    fontFamily: 'IBM Plex Sans,sans-serif', 
    width: '100%' 
  };

  const selStyleInline = { 
    ...selStyle, 
    width: '100%', 
    padding: '7px 10px' 
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <Field label="Type *">
          <select value={f.type} onChange={e => handleChange('type', e.target.value)} style={selStyle}>
            <option value="new">New</option>
            <option value="used">Pre-owned</option>
          </select>
        </Field>
        <Field label="Brand *">
          <select value={f.brand} onChange={e => { handleChange('brand', e.target.value); handleChange('model', ''); }} style={selStyle}>
            <option value="">Select brand</option>
            {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
        <Field label="Model *">
          <select value={f.model} onChange={e => handleChange('model', e.target.value)} style={selStyle}>
            <option value="">{f.brand ? 'Select model' : 'Brand first'}</option>
            {(MODELS[f.brand] || []).map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Variant"><input value={f.variant} onChange={e => handleChange('variant', e.target.value)} placeholder="STD / DLX…" /></Field>
        <Field label="Color"><input value={f.color} onChange={e => handleChange('color', e.target.value)} placeholder="Pearl Black" /></Field>
        <Field label="Chassis number *"><input value={f.chassis_number} onChange={e => handleChange('chassis_number', e.target.value)} placeholder="ME4JF502…" className="mono" /></Field>
        <Field label="Engine number"><input value={f.engine_number} onChange={e => handleChange('engine_number', e.target.value)} placeholder="JF50E7…" className="mono" /></Field>
        <Field label="Reg number"><input value={f.vehicle_number} onChange={e => handleChange('vehicle_number', e.target.value)} placeholder="KA01HH1234" className="mono" /></Field>
        <Field label="Key number"><input value={f.key_number} onChange={e => handleChange('key_number', e.target.value)} placeholder="KY001" /></Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
        <Field label="Purchase price (₹)"><input type="number" value={f.purchase_price} onChange={e => handleChange('purchase_price', e.target.value)} placeholder="0" /></Field>
        <Field label="Status *">
          <select value={f.status} onChange={e => handleChange('status', e.target.value)} style={selStyle}>
            <option value="Instock">In Stock</option>
            <option value="Sold">Sold</option>
            <option value="Returned">Returned</option>
          </select>
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Inbound Date"><input type="date" value={f.inbound_date} onChange={e => handleChange('inbound_date', e.target.value)} style={selStyleInline} /></Field>
        <Field label="Location"><input value={f.location} onChange={e => handleChange('location', e.target.value)} placeholder="Warehouse / Showroom..." /></Field>
      </div>

      {f.status === 'Returned' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '12px', background: 'rgba(220,38,38,.05)', border: '1px dashed rgba(220,38,38,.3)', borderRadius: 4 }}>
          <Field label="Return Date"><input type="date" value={f.outbound_date} onChange={e => handleChange('outbound_date', e.target.value)} style={selStyleInline} /></Field>
          <Field label="Return Location / Vendor"><input value={f.outbound_location} onChange={e => handleChange('outbound_location', e.target.value)} placeholder="Returned to vendor..." /></Field>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
        <Btn disabled={!f.brand || !f.chassis_number || saving} onClick={() => onSave({ ...f, purchase_price: parseFloat(f.purchase_price) || 0 })}>
          {saving ? 'Saving…' : 'Save vehicle'}
        </Btn>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────
export default function VehiclesPage() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [showAdd, setShowAdd]   = useState(false);
  const [editVeh, setEditVeh]   = useState(null);
  const [search, setSearch]     = useState('');
  const [brand,  setBrand]      = useState('');
  const [typeF,  setTypeF]      = useState('all');

  const { data: stats } = useQuery({
    queryKey: ['vehicle-stats'],
    queryFn: () => vehiclesApi.stats().then(r => r.data),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['vehicles', search, brand, typeF],
    queryFn: () => vehiclesApi.list({ search: search || undefined, brand: brand || undefined, type: typeF !== 'all' ? typeF : undefined, limit: 300 }).then(r => r.data),
  });

  const createMut = useMutation({
    mutationFn: d => vehiclesApi.create(d),
    onSuccess: () => { qc.invalidateQueries(['vehicles']); qc.invalidateQueries(['vehicle-stats']); setShowAdd(false); toast.success('Vehicle added'); },
    onError:   e => toast.error(e?.response?.data?.detail || 'Failed'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }) => vehiclesApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries(['vehicles']); qc.invalidateQueries(['vehicle-stats']); setEditVeh(null); toast.success('Updated'); },
    onError:   e => toast.error(e?.response?.data?.detail || 'Failed'),
  });
  const deleteMut = useMutation({
    mutationFn: id => vehiclesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries(['vehicles']); qc.invalidateQueries(['vehicle-stats']); toast.success('Deleted'); },
    onError:   e => toast.error(e?.response?.data?.detail || 'Cannot delete'),
  });

  const vehicles = Array.isArray(data) ? data : [];
  const st = stats || {};

  return (
    <div>
      {editVeh && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setEditVeh(null)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: 24, width: '100%', maxWidth: 660, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 18 }}>Edit vehicle</div>
            <VehicleForm initial={editVeh} onSave={d => updateMut.mutate({ id: editVeh.id, d: d })} onCancel={() => setEditVeh(null)} saving={updateMut.isPending} />
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', borderBottom: '1px solid var(--border)' }}>
        {[
          { l: 'In stock',   v: st.in_stock ?? '—',  c: 'var(--accent)' },
          { l: 'New',        v: st.new ?? '—',       c: 'var(--green)' },
          { l: 'Pre-owned',  v: st.used ?? '—',      c: 'var(--blue)' },
          { l: 'In service', v: st.in_service ?? '—', c: 'var(--accent)' },
          { l: 'Sold',       v: st.sold ?? '—',      c: 'var(--dim)' },
        ].map((s, i) => (
          <div key={i} style={{ padding: '14px 20px', borderRight: i < 4 ? '1px solid var(--border)' : 0 }}>
            <div className="label-xs">{s.l}</div>
            <div className="display" style={{ fontSize: 24, color: s.c, marginTop: 6 }}>{s.v}</div>
          </div>
        ))}
      </div>

      {showAdd && (
        <div style={{ margin: 20, padding: 20, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 16 }}>Add new vehicle</div>
          <VehicleForm onSave={d => createMut.mutate(d)} onCancel={() => setShowAdd(false)} saving={createMut.isPending} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search chassis, model…" style={{ width: 200 }} />
        <select value={brand} onChange={e => setBrand(e.target.value)} style={{ width: 150, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 3, padding: '8px 10px', color: 'var(--text)', outline: 'none', fontSize: 13, fontFamily: 'IBM Plex Sans,sans-serif' }}>
          <option value="">All brands</option>
          {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        {['all', 'new', 'used'].map(t => (
          <button key={t} onClick={() => setTypeF(t)} style={{
            padding: '6px 12px', background: typeF === t ? 'var(--surface2)' : 'transparent',
            border: `1px solid ${typeF === t ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 3, color: typeF === t ? 'var(--accent)' : 'var(--muted)',
            cursor: 'pointer', fontSize: 10, letterSpacing: '.06em', fontFamily: 'IBM Plex Sans,sans-serif'
          }}>{t === 'all' ? 'ALL' : t === 'new' ? 'NEW' : 'PRE-OWNED'}</button>
        ))}
        <span className="label-xs" style={{ marginLeft: 'auto' }}>{vehicles.length} vehicles</span>
        <Btn onClick={() => setShowAdd(v => !v)}>+ Add vehicle</Btn>
      </div>

      {error ? <div style={{ padding: 20 }}><ApiError error={error}/></div>
        : isLoading ? <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} h={44}/>)}</div>
        : vehicles.length === 0 ? <Empty message="No vehicles found" />
        : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Brand', 'Model / Type', 'Chassis / Engine', 'Color / Key', 'Purchase (₹)', 'Logistics', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 9, letterSpacing: '.07em', color: 'var(--dim)', fontWeight: 500, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vehicles.map(v => {
                let sColor = '#4ade80', sBg = 'rgba(74,222,128,.1)', sBorder = 'rgba(74,222,128,.25)', sLabel = v.status || 'Instock';
                
                if (v.status === 'Sold' || v.status === 'sold') { 
                  sColor = 'var(--dim)'; sBg = 'rgba(107,100,120,.1)'; sBorder = 'rgba(107,100,120,.25)'; sLabel = 'Sold'; 
                } else if (v.status === 'Returned') { 
                  sColor = 'var(--red)'; sBg = 'rgba(220,38,38,.1)'; sBorder = 'rgba(220,38,38,.25)'; sLabel = 'Returned'; 
                } else if (v.status === 'in_service') { 
                  sColor = '#f0c040'; sBg = 'rgba(240,192,64,.1)'; sBorder = 'rgba(240,192,64,.25)'; sLabel = 'In service'; 
                }

                return (
                  <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 16px', fontSize: 11, color: 'var(--muted)', letterSpacing: '.04em' }}>{v.brand}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{v.model}</div>
                        <span style={{ 
                          fontSize: 9, padding: '2px 5px', borderRadius: 2, textTransform: 'uppercase', fontWeight: 600,
                          background: v.type === 'used' ? 'var(--surface2)' : 'rgba(74,222,128,.1)',
                          color: v.type === 'used' ? 'var(--text)' : 'var(--green)'
                        }}>
                          {v.type === 'used' ? 'Used' : 'New'}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--dim)' }}>{v.variant || '—'}</div>
                    </td>
                    <td className="mono" style={{ padding: '10px 16px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text)' }}>{v.chassis_number?.slice(-12) || '—'}</div>
                      <div style={{ fontSize: 9, color: 'var(--dim)', marginTop: 2 }}>{v.engine_number || '—'}</div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{v.color || '—'}</div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--dim)', marginTop: 2 }}>Key: {v.key_number || '—'}</div>
                    </td>
                    <td className="mono" style={{ padding: '10px 16px', fontSize: 11, color: 'var(--muted)' }}>
                      ₹{v.purchase_price?.toLocaleString('en-IN') || '0'}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ fontSize: 11, color: 'var(--text)' }}>{v.inbound_date || '—'}</div>
                      <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 2 }}>{v.location || '—'}</div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 9, padding: '3px 8px', borderRadius: 2, fontWeight: 500, color: sColor, background: sBg, border: `1px solid ${sBorder}` }}>
                        {sLabel}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <GhostBtn sm onClick={() => setEditVeh(v)}>Edit</GhostBtn>
                        <button onClick={async () => { if (await confirm(`Delete ${v.brand} ${v.model}?`)) { deleteMut.mutate(v.id); } }}
                          style={{ padding: '5px 8px', background: 'transparent', border: '1px solid rgba(220,38,38,.3)', borderRadius: 3, color: 'var(--red)', cursor: 'pointer', fontSize: 10, fontFamily: 'IBM Plex Sans,sans-serif' }}>✕</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
    </div>
  );
}
