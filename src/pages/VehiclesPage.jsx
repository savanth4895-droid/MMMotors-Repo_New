import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vehiclesApi, errMsg} from '../api/client';
import { Btn, GhostBtn, Field, Skeleton, Empty, ApiError, useSortable } from '../components/ui';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';

const BRANDS = [
  'HERO', 'HONDA', 'BAJAJ', 'TVS', 'YAMAHA', 'SUZUKI', 'ROYAL ENFIELD',
  'KTM', 'PIAGGIO', 'APRILIA', 'TRIUMPH', 'KAWASAKI', 'JAWA', 'YEZDI',
  'BMW', 'ATHER', 'OLA', 'VIDA'
];

const MODELS = {
  HERO: [
    'Splendor Plus', 'Splendor Plus Xtec', 'Super Splendor', 'HF 100', 'HF Deluxe',
    'Passion Plus', 'Glamour', 'Destini 110', 'Xpulse 200 4V', 'Xoom 125', 'Xpulse 210',
    'Xtreme 125R', 'Xtreme 160R', 'Xtreme 160R 4V',
    'Xpulse 200T 4V', 'Karizma XMR', 'Destini 125', 'Pleasure Plus', 'Xoom 110'
  ],
  HONDA: [
    'Activa 6G', 'Activa 125', 'Shine 100', 'Shine 125', 'SP 125', 'SP 160',
    'Unicorn', 'Livo', 'Hornet 2.0', 'CB200X', 'CB300F', 'CB300R',
    'Hness CB350', 'CB350RS', 'CB350', 'Dio', 'Dio 125', 'NX200'
  ],
  BAJAJ: [
    'Pulsar 125', 'Pulsar 150', 'Pulsar N150', 'Pulsar 220F', 'Pulsar N160', 'Pulsar NS160', 'Pulsar NS125',
    'Pulsar NS200', 'Pulsar N250', 'Pulsar NS400Z', 'Platina 100', 'Platina 110',
    'CT 110X', 'Avenger Street 160', 'Avenger Cruise 220', 'Dominar 250',
    'Dominar 400', 'Chetak'
  ],
  TVS: [
    'Jupiter 110', 'Jupiter 125', 'Ntorq 125', 'Ntorq 150', 'Apache RTR 160', 'Apache RTR 160 4V',
    'Apache RTR 180', 'Apache RTR 200 4V', 'Apache RR 310', 'Apache RTR 310',
    'Raider 125', 'XL100', 'Sport', 'Radeon', 'Ronin', 'iQube', 'Zest 110', 'Orbiter'
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
  PIAGGIO: ['Vespa ZX 125', 'Vespa VXL 125', 'Vespa SXL 125', 'Vespa VXL 150', 'Vespa SXL 150', 'Vespa Dual'],
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

// ── Vehicle form (add / edit) ────────────────────────────────────────
function VehicleForm({ initial = {}, onSave, onCancel, saving }) {
  const [f, setF] = useState({
    type: 'new', brand: '', model: '', variant: '', color: '',
    chassis_number: '', engine_number: '', vehicle_number: '', key_number: '',
    purchase_price: '', status: 'in_stock',
    inbound_date: '', location: '', outbound_date: '', outbound_location: '',
    ...initial
  });

  // Reverted back to your original, flawless state handlers
  const s  = k => v  => setF(p => ({ ...p, [k]: v }));
  const se = k => e  => setF(p => ({ ...p, [k]: e.target.value }));

  // Fields take the global field style; kept as a per-field override hook.
  const selStyle = {};

  return (
    <div className="sale-form" style={{ maxWidth: 680 }}>

      <div className="form-grid form-grid-3">
        <Field label="Type *">
          <select value={f.type} onChange={se('type')} style={selStyle}>
            <option value="new">New</option>
            <option value="used">Pre-owned</option>
          </select>
        </Field>
        <Field label="Brand *">
          <select value={f.brand} onChange={e => { se('brand')(e); s('model')(''); }} style={selStyle}>
            <option value="">Select brand</option>
            {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
        <Field label="Model *">
          <select value={f.model} onChange={se('model')} style={selStyle}>
            <option value="">{f.brand ? 'Select model' : 'Brand first'}</option>
            {(MODELS[f.brand] || []).map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
      </div>

      <div className="form-grid-2col form-grid">
        <Field label="Variant"><input value={f.variant} onChange={se('variant')} placeholder="STD / DLX…" /></Field>
        <Field label="Color"><input value={f.color} onChange={se('color')} placeholder="Pearl Black" /></Field>
        <Field label="Chassis number *"><input value={f.chassis_number} onChange={se('chassis_number')} placeholder="ME4JF502…" className="mono" /></Field>
        <Field label="Engine number"><input value={f.engine_number} onChange={se('engine_number')} placeholder="JF50E7…" className="mono" /></Field>
        <Field label="Reg number"><input value={f.vehicle_number} onChange={se('vehicle_number')} placeholder="KA01HH1234" className="mono" /></Field>
        <Field label="Key number"><input value={f.key_number} onChange={se('key_number')} placeholder="KY001" /></Field>
      </div>

      <div className="form-grid-2col form-grid">
        <Field label="Purchase price (₹)"><input type="number" value={f.purchase_price} onChange={se('purchase_price')} placeholder="0" /></Field>
        <Field label="Status *">
          <select value={f.status} onChange={se('status')} style={selStyle}>
            <option value="in_stock">In Stock</option>
            <option value="sold">Sold</option>
            <option value="returned">Returned</option>
          </select>
        </Field>
      </div>

      <div className="form-grid-2col form-grid">
        <Field label="Inbound Date"><input type="date" value={f.inbound_date} onChange={se('inbound_date')} /></Field>
        <Field label="Location"><input value={f.location} onChange={se('location')} placeholder="Warehouse / Showroom..." /></Field>
      </div>

      {f.status === 'returned' && (
        <div className="form-grid-2col form-grid return-box">
          <Field label="Return Date"><input type="date" value={f.outbound_date} onChange={se('outbound_date')} /></Field>
          <Field label="Return Location / Vendor"><input value={f.outbound_location} onChange={se('outbound_location')} placeholder="Returned to vendor..." /></Field>
        </div>
      )}

      <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
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
  const [statusF, setStatusF]   = useState('all');

  const { data: stats } = useQuery({
    queryKey: ['vehicle-stats', brand],
    refetchInterval: 30_000,
    queryFn: () => vehiclesApi.stats({ brand: brand || undefined }).then(r => r.data),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['vehicles', search, brand, typeF, statusF],
    queryFn: () => vehiclesApi.list({ search: search || undefined, brand: brand || undefined, type: typeF !== 'all' ? typeF : undefined, status: statusF !== 'all' ? statusF : undefined, limit: 5000 }).then(r => r.data),
    refetchInterval: 30_000,
  });

  const createMut = useMutation({
    mutationFn: d => vehiclesApi.create(d),
    onSuccess: () => { qc.invalidateQueries(['vehicles']); qc.invalidateQueries(['vehicle-stats']); setShowAdd(false); toast.success('Vehicle added'); },
    onError:   e => toast.error(errMsg(e, 'Failed')),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d, data }) => vehiclesApi.update(id, d || data),
    onSuccess: () => { qc.invalidateQueries(['vehicles']); qc.invalidateQueries(['vehicle-stats']); setEditVeh(null); toast.success('Updated'); },
    onError:   e => toast.error(errMsg(e, 'Failed')),
  });

  const deleteMut = useMutation({
    mutationFn: id => vehiclesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries(['vehicles']); qc.invalidateQueries(['vehicle-stats']); toast.success('Deleted'); },
    onError:   e => toast.error(errMsg(e, 'Cannot delete')),
  });

  const vehicles = Array.isArray(data) ? data : [];
  const { sorted: sortedVehicles, Th: VehTh } = useSortable(vehicles, 'brand', 'asc');
  const st = stats || {};

  const STATUS_CLASS = { in_stock:'status-ready', sold:'status-delivered', returned:'status-returned', in_service:'status-in_progress' };
  const TYPE_LABEL = { all:'All', new:'New', used:'Pre-owned' };

  return (
    <div>
      {editVeh && (
        <div className="dialog-backdrop" onClick={() => setEditVeh(null)}>
          <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="edit-veh-title" style={{ maxWidth: 720 }}
            onClick={e => e.stopPropagation()}>
            <h2 id="edit-veh-title" className="dialog-title">Edit vehicle</h2>
            <VehicleForm initial={editVeh} onSave={d => updateMut.mutate({ id: editVeh.id, d: d })} onCancel={() => setEditVeh(null)} saving={updateMut.isPending} />
          </div>
        </div>
      )}

      <section className="stat-strip" aria-label="Vehicles by status">
        {[
          { l: brand ? `${brand} in stock` : 'In stock', v: st.in_stock ?? '—', f: 'in_stock' },
          { l: 'In service', v: st.in_service ?? '—', c: st.in_service > 0 ? 'var(--color-warn)' : undefined, f: 'in_service' },
          { l: 'Sold',       v: st.sold ?? '—',       c: 'var(--color-muted)', f: 'sold' },
          { l: 'Returned',   v: st.returned ?? '—',   c: st.returned > 0 ? 'var(--color-error)' : undefined, f: 'returned' },
          { l: 'Total',      v: st.total ?? '—',      f: 'all',
            sub: st.total != null ? `${st.new || 0} new, ${st.used || 0} pre-owned` : null },
        ].map((k, i) => (
          <button key={i} type="button" className="stat stat-link" aria-pressed={statusF === k.f} onClick={() => setStatusF(k.f)}>
            <span className="stat-label">{k.l}</span>
            <span className="stat-value" style={k.c ? { color: k.c } : undefined}>{k.v}</span>
            {k.sub && <span className="stat-label">{k.sub}</span>}
          </button>
        ))}
      </section>

      {st.other > 0 && (
        <div className="notice notice-error page-notice" role="alert">
          {st.other} vehicle{st.other > 1 ? 's have' : ' has'} an unrecognised status ({Object.keys(st.unknown_statuses || {}).join(', ')}), not counted above. Set the correct status from the row dropdown.
        </div>
      )}

      {!brand && Array.isArray(st.by_brand) && st.by_brand.length > 0 && (
        <div className="brand-strip">
          <span className="brand-strip-label">In stock by brand</span>
          <div className="chips brand-strip-chips">
            {st.by_brand.filter(b => b.in_stock > 0).map(b => (
              <button key={b.brand} type="button" className="chip" onClick={() => { setBrand(b.brand); setStatusF('in_stock'); }}>
                {b.brand} <span className="chip-count chip-count-strong">{b.in_stock}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showAdd && (
        <section className="page-panel" aria-labelledby="add-veh-title">
          <h2 id="add-veh-title" className="page-panel-title">Add new vehicle</h2>
          <VehicleForm onSave={d => createMut.mutate(d)} onCancel={() => setShowAdd(false)} saving={createMut.isPending} />
        </section>
      )}

      <div className="page-toolbar">
        <input type="search" className="page-search" aria-label="Search vehicles" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search chassis, model…" style={{ width: 'min(240px, 100%)' }} />
        <select aria-label="Brand" value={brand} onChange={e => setBrand(e.target.value)} style={{ width: 160 }}>
          <option value="">All brands</option>
          {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <div className="chips" role="group" aria-label="Type">
          {['all', 'new', 'used'].map(t => (
            <button key={t} type="button" className="chip" aria-pressed={typeF === t} onClick={() => setTypeF(t)}>{TYPE_LABEL[t]}</button>
          ))}
        </div>
        <select aria-label="Status" value={statusF} onChange={e => setStatusF(e.target.value)} style={{ width: 140 }}>
          <option value="all">All status</option>
          <option value="in_stock">In stock</option>
          <option value="in_service">In service</option>
          <option value="sold">Sold</option>
          <option value="returned">Returned</option>
        </select>
        <span className="toolbar-count" role="status">
          {vehicles.length} {statusF === 'all' ? '' : (statusF.replace('_', ' ') + ' ')}vehicles{brand ? `, ${brand}` : ''}
        </span>
        <Btn onClick={() => setShowAdd(v => !v)}>+ Add vehicle</Btn>
      </div>

      {error ? <div style={{ padding: 'var(--space-lg)' }}><ApiError error={error}/></div>
        : isLoading ? <div className="table-skeleton">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} h={44}/>)}</div>
        : vehicles.length === 0 ? <Empty message="No vehicles found" sub={search || brand || typeF !== 'all' || statusF !== 'all' ? 'Clear a filter or the search to see more.' : 'Add the first vehicle with Add vehicle.'} />
        : (
          <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {[['Brand','brand'],['Model / Type','model'],['Chassis / Engine','chassis_number'],['Color / Key','color'],['Purchase (₹)','purchase_price'],['Logistics','inbound_date'],['Status','status'],['','']].map(([h,f]) => (
                  <VehTh key={h} field={f||null} className={f === 'purchase_price' ? 'num' : undefined}>{h || <span className="visually-hidden">Actions</span>}</VehTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedVehicles.map(v => {
                // Fix 1: compute days in stock from inbound_date
                let daysInStock = null;
                if (v.inbound_date) {
                  const inbound = new Date(v.inbound_date);
                  if (!isNaN(inbound)) {
                    daysInStock = Math.floor((Date.now() - inbound.getTime()) / 86400000);
                  }
                }
                const overdueStock = daysInStock !== null && daysInStock > 100;

                // Status labels (the select is tinted by STATUS_CLASS)
                const STATUS_CFG = {
                  in_stock:   { label:'In stock' },
                  sold:       { label:'Sold' },
                  returned:   { label:'Returned' },
                  in_service: { label:'In service' },
                };
                const normalizedStatus = String(v.status ?? 'in_stock').trim().toLowerCase().replace(/[\s-]+/g,'_');

                return (
                  <tr key={v.id}>
                    <td className="cell-muted cell-nowrap">{v.brand}</td>
                    <td>
                      <div className="veh-model">
                        <span className="cell-strong">{v.model}</span>
                        <span className={`pill ${v.type === 'used' ? 'pill-dim' : 'pill-green'}`}>
                          {v.type === 'used' ? 'Used' : 'New'}
                        </span>
                      </div>
                      <div className="cell-sub">{v.variant || '—'}</div>
                    </td>
                    <td className="mono">
                      <div className="cell-id" style={{ wordBreak: 'break-all', whiteSpace: 'normal' }}>{v.chassis_number || '—'}</div>
                      <div className="cell-sub" style={{ wordBreak: 'break-all' }}>{v.engine_number || '—'}</div>
                    </td>
                    <td>
                      <div className="cell-muted">{v.color || '—'}</div>
                      <div className="cell-sub">Key: <span className="mono">{v.key_number || '—'}</span></div>
                    </td>
                    <td className="num cell-muted">
                      ₹{v.purchase_price?.toLocaleString('en-IN') || '0'}
                    </td>
                    <td>
                      {/* Inbound date + days in stock — only for in_stock vehicles */}
                      <div className="cell-nowrap" style={overdueStock ? { color: 'var(--color-error)', fontWeight: 600 } : undefined}>
                        {v.inbound_date || '—'}
                      </div>
                      {daysInStock !== null && normalizedStatus === 'in_stock' && (
                        <div className="cell-sub" style={{ fontWeight: 600,
                          color: overdueStock ? 'var(--color-error)' : daysInStock > 60 ? 'var(--color-warn)' : undefined }}>
                          {daysInStock}d in stock{overdueStock ? ', over 100' : ''}
                        </div>
                      )}
                      <div className="cell-sub">{v.location || v.inbound_location || '—'}</div>
                    </td>
                    {/* Fix 2: inline status dropdown */}
                    <td onClick={e => e.stopPropagation()}>
                      <select
                        aria-label={`Status of ${v.brand} ${v.model}`}
                        className={`status-select ${STATUS_CLASS[normalizedStatus] || 'status-returned'}`}
                        value={normalizedStatus}
                        onChange={e => updateMut.mutate({ id: v.id, data: { status: e.target.value } })}
                      >
                        <option value="in_stock">In stock</option>
                        <option value="sold">Sold</option>
                        <option value="returned">Returned</option>
                        <option value="in_service">In service</option>
                        {!STATUS_CFG[normalizedStatus] && <option value={normalizedStatus} disabled>? {v.status}</option>}
                      </select>
                    </td>
                    <td>
                      <div className="row-actions" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
                        <GhostBtn sm onClick={() => setEditVeh(v)}>Edit</GhostBtn>
                        <button type="button" className="btn btn-ghost btn-sm btn-ghost-danger" aria-label={`Delete ${v.brand} ${v.model}`}
                          onClick={async () => { if (await confirm(`Delete ${v.brand} ${v.model}?`)) { deleteMut.mutate(v.id); } }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
    </div>
  );
}
