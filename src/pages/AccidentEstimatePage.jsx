import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';
import { escapeDeep } from '../utils/escapeHtml';
import { accidentEstimatesApi, errMsg } from '../api/client';
import { useDraft, DraftBar } from '../hooks/useDraft';
import { Skeleton, Empty, ApiError } from '../components/ui';

const RS = '₹';
const fmt = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function numWords(n) {
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  if (!n || n === 0) return 'Zero';
  n = Math.round(n);
  if (n < 20)        return a[n];
  if (n < 100)       return b[Math.floor(n/10)] + (n%10 ? ' ' + a[n%10] : '');
  if (n < 1000)      return a[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' ' + numWords(n%100) : '');
  if (n < 100000)    return numWords(Math.floor(n/1000)) + ' Thousand' + (n%1000 ? ' ' + numWords(n%1000) : '');
  if (n < 10000000)  return numWords(Math.floor(n/100000)) + ' Lakh' + (n%100000 ? ' ' + numWords(n%100000) : '');
  return numWords(Math.floor(n/10000000)) + ' Crore' + (n%10000000 ? ' ' + numWords(n%10000000) : '');
}

const SEVERITY = ['Minor', 'Moderate', 'Major', 'Total Loss'];
const PART_CONDITION = ['New OEM', 'New Aftermarket', 'Repair', 'Reuse'];
const SEVERITY_PILL = { Minor: 'pill-green', Moderate: 'pill-amber', Major: 'pill-red', 'Total Loss': 'pill-red' };

const emptyPart = () => ({
  _key: Math.random(),
  part_name: '',
  part_number: '',
  condition: 'New OEM',
  qty: 1,
  unit_price: 0,
  gst: 18,
});

const emptyLabour = () => ({
  _key: Math.random(),
  description: '',
  hours: 1,
  rate: 0,
});

// ─── Section heading ──────────────────────────────────────────────────────────
function SectionHead({ id, label, sub }) {
  return (
    <div style={{ marginBottom: 'var(--space-md)' }}>
      <h2 id={id} className="page-panel-title" style={{ margin: 0 }}>{label}</h2>
      {sub && <p className="dialog-sub" style={{ marginTop: 'var(--space-3xs)' }}>{sub}</p>}
    </div>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────
// The label wraps its control, so each input is named without extra ids.
function Field({ label, children, span = 1 }) {
  return (
    <label className="field" style={span > 1 ? { gridColumn: '1 / -1' } : undefined}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function Card({ children, labelledBy, style = {} }) {
  return (
    <section className="page-panel" aria-labelledby={labelledBy} style={style}>
      {children}
    </section>
  );
}

// ─── Severity selector ────────────────────────────────────────────────────────
function SeverityBadge({ value, onClick }) {
  return (
    <div className="chips" role="group" aria-label="Severity">
      {SEVERITY.map(s => (
        <button key={s} type="button" className="chip" aria-pressed={value === s} onClick={() => onClick(s)}>{s}</button>
      ))}
    </div>
  );
}

// ─── Print modal ─────────────────────────────────────────────────────────────
function printEstimate(data) {
  const { vehicle, customer, incident, parts, labour, additional, notes } = escapeDeep(data);

  const partsTotal = parts.reduce((s, p) => s + (p.qty * p.unit_price), 0);
  const labourTotal = labour.reduce((s, l) => s + (l.hours * l.rate), 0);
  const subTotal = partsTotal + labourTotal + Number(additional.misc || 0) + Number(additional.towing || 0) + Number(additional.inspection || 0);
  const discount = Number(additional.discount || 0);
  const grandTotal = subTotal - discount;

  const partRows = parts.map(p => {
    const amt = p.qty * p.unit_price;
    return `<tr>
      <td>${p.part_name}</td>
      <td style="font-family:monospace;font-size:10px">${p.part_number || '—'}</td>
      <td>${p.condition}</td>
      <td style="text-align:center">${p.qty}</td>
      <td style="text-align:right">${RS}${fmt(p.unit_price)}</td>
      <td style="text-align:center">${p.gst}%</td>
      <td style="text-align:right">${RS}${fmt(amt)}</td>
    </tr>`;
  }).join('');

  const labourRows = labour.map(l => `<tr>
    <td colspan="4">${l.description}</td>
    <td style="text-align:center">${l.hours} hr${l.hours !== 1 ? 's' : ''}</td>
    <td style="text-align:right">${RS}${fmt(l.rate)}/hr</td>
    <td style="text-align:right">${RS}${fmt(l.hours * l.rate)}</td>
  </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>Accident Estimate</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#111;background:#FDFCF8}
    .page{max-width:210mm;margin:0 auto}
    .topbar{background:#1A1A1A;height:5px}
    .goldbar{background:#B8860B;height:2px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;padding:12px 16px 10px;border-bottom:1.5px solid #B8860B}
    .brand{font-size:18px;font-weight:900;color:#1A1A1A}
    .brand-sub{font-size:7px;color:#888;margin-top:2px;letter-spacing:.04em}
    .est-label{font-size:8px;font-weight:800;color:#B8860B;text-align:right;letter-spacing:.08em}
    .est-no{font-size:14px;font-weight:800;color:#1A1A1A;text-align:right}
    .body{padding:12px 16px}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
    .box{background:#f9f9f9;border:1px solid #e5e5e5;border-radius:3px;padding:10px 12px}
    .sec{font-size:7px;font-weight:800;color:#B8860B;letter-spacing:.1em;text-transform:uppercase;margin-bottom:5px;padding-bottom:2px;border-bottom:1px solid #e8d090;display:block}
    .row{display:flex;padding:3px 0;font-size:10px}
    .lbl{width:100px;color:#888;flex-shrink:0;font-size:9.5px}
    .val{font-weight:600;color:#111;word-break:break-word}
    .sev{display:inline-block;padding:2px 10px;border-radius:10px;font-size:9px;font-weight:700}
    table{width:100%;border-collapse:collapse;margin-bottom:8px}
    th{background:#1A1A1A;color:#fff;padding:5px 8px;font-size:8px;letter-spacing:.06em;font-weight:700;text-align:left}
    td{padding:5px 8px;font-size:10px;border-bottom:1px solid #eee}
    tr:nth-child(even) td{background:#f7f7f4}
    .tot-row td{font-weight:700;border-top:1.5px solid #B8860B;background:#f5e6c0!important}
    .grand{background:#1A1A1A;color:#fff;padding:8px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-radius:2px}
    .grand-lbl{font-size:9px;color:#ccc}
    .grand-val{font-size:15px;font-weight:900;color:#B8860B}
    .sig-row{display:flex;justify-content:space-between;margin-top:16px;padding-top:10px;border-top:1px solid #ddd}
    .sig-col{text-align:center}
    .sig-line{width:120px;border-bottom:1px solid #555;margin:0 auto 4px}
    .sig-lbl{font-size:8px;color:#888}
    .sig-name{font-size:9px;font-weight:700}
    .note-box{background:#fdf8ec;border:1px solid #e8d090;border-radius:3px;padding:8px 12px;margin-bottom:10px;font-size:10px;color:#5a4800}
    .footer-bar{background:#1A1A1A;display:flex;justify-content:space-between;padding:5px 16px;margin-top:10px}
    .footer-txt{font-size:7px;color:#777}
    @media print{body{margin:0}@page{margin:0;size:A4}}
  </style></head><body>
  <div class="page">
    <div class="topbar"></div>
    <div class="goldbar"></div>
    <div class="hdr">
      <div>
        <div class="brand">MM MOTORS</div>
        <div class="brand-sub">MULTI-BRAND DEALERSHIP &nbsp;·&nbsp; MALUR</div>
      </div>
      <div>
        <div class="est-label">ACCIDENT ESTIMATE</div>
        <div class="est-no">EST-${Date.now().toString().slice(-6)}</div>
        <div style="font-size:8px;color:#888;text-align:right;margin-top:2px">Date: ${new Date().toLocaleDateString('en-IN')}</div>
        <div style="display:inline-block;padding:2px 10px;border-radius:10px;font-size:9px;font-weight:700;margin-top:4px;
          background:${incident.severity === 'Minor' ? '#4ade8022' : incident.severity === 'Moderate' ? '#fbbf2422' : '#f8717122'};
          color:${incident.severity === 'Minor' ? '#4ade80' : incident.severity === 'Moderate' ? '#fbbf24' : '#f87171'};
          border:1px solid ${incident.severity === 'Minor' ? '#4ade80' : incident.severity === 'Moderate' ? '#fbbf24' : '#f87171'}">
          ${incident.severity || 'Unspecified'}
        </div>
      </div>
    </div>

    <div class="body">
      <div class="grid2">
        <div class="box">
          <span class="sec">Customer Details</span>
          <div class="row"><div class="lbl">Name</div><div class="val">${customer.name || '—'}</div></div>
          <div class="row"><div class="lbl">Mobile</div><div class="val">${customer.mobile || '—'}</div></div>
          <div class="row"><div class="lbl">Address</div><div class="val">${customer.address || '—'}</div></div>
          <div class="row"><div class="lbl">Insurance Co.</div><div class="val">${customer.insurance_company || '—'}</div></div>
          <div class="row"><div class="lbl">Policy No.</div><div class="val" style="font-family:monospace">${customer.policy_number || '—'}</div></div>
          <div class="row"><div class="lbl">Claim No.</div><div class="val" style="font-family:monospace">${customer.claim_number || '—'}</div></div>
        </div>
        <div class="box">
          <span class="sec">Vehicle Details</span>
          <div class="row"><div class="lbl">Brand / Model</div><div class="val">${vehicle.brand} ${vehicle.model}</div></div>
          <div class="row"><div class="lbl">Variant</div><div class="val">${vehicle.variant || '—'}</div></div>
          <div class="row"><div class="lbl">Colour</div><div class="val">${vehicle.colour || '—'}</div></div>
          <div class="row"><div class="lbl">Reg. No.</div><div class="val" style="font-family:monospace">${vehicle.reg_number || '—'}</div></div>
          <div class="row"><div class="lbl">Chassis No.</div><div class="val" style="font-family:monospace">${vehicle.chassis_number || '—'}</div></div>
          <div class="row"><div class="lbl">Engine No.</div><div class="val" style="font-family:monospace">${vehicle.engine_number || '—'}</div></div>
          <div class="row"><div class="lbl">Mfg. Year</div><div class="val">${vehicle.year || '—'}</div></div>
          <div class="row"><div class="lbl">Odometer</div><div class="val">${vehicle.odometer ? vehicle.odometer + ' km' : '—'}</div></div>
        </div>
      </div>

      <div class="box" style="margin-bottom:12px">
        <span class="sec">Incident Details</span>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0">
          <div class="row"><div class="lbl">Incident Date</div><div class="val">${incident.date || '—'}</div></div>
          <div class="row"><div class="lbl">Location</div><div class="val">${incident.location || '—'}</div></div>
          <div class="row"><div class="lbl">Severity</div><div class="val">${incident.severity || '—'}</div></div>
          <div class="row"><div class="lbl">Nature of Accident</div><div class="val">${incident.nature || '—'}</div></div>
          <div class="row"><div class="lbl">Surveyor</div><div class="val">${incident.surveyor || '—'}</div></div>
          <div class="row"><div class="lbl">Surveyor Mobile</div><div class="val">${incident.surveyor_mobile || '—'}</div></div>
        </div>
        ${incident.description ? `<div class="row" style="margin-top:4px"><div class="lbl">Description</div><div class="val">${incident.description}</div></div>` : ''}
      </div>

      <div style="font-size:8px;font-weight:800;color:#B8860B;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px">Parts &amp; Materials</div>
      <table>
        <thead>
          <tr><th>Part Name</th><th>Part No.</th><th>Condition</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:center">GST</th><th style="text-align:right">Amount</th></tr>
        </thead>
        <tbody>
          ${partRows}
          <tr class="tot-row"><td colspan="6" style="text-align:right">Parts Subtotal</td><td style="text-align:right">${RS}${fmt(partsTotal)}</td></tr>
        </tbody>
      </table>

      <div style="font-size:8px;font-weight:800;color:#B8860B;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px">Labour Charges</div>
      <table>
        <thead>
          <tr><th colspan="4">Description</th><th style="text-align:center">Hours</th><th style="text-align:right">Rate/hr</th><th style="text-align:right">Amount</th></tr>
        </thead>
        <tbody>
          ${labourRows}
          <tr class="tot-row"><td colspan="6" style="text-align:right">Labour Subtotal</td><td style="text-align:right">${RS}${fmt(labourTotal)}</td></tr>
        </tbody>
      </table>

      <table style="width:40%;margin-left:auto">
        <tbody>
          ${additional.towing ? `<tr><td>Towing Charges</td><td style="text-align:right">${RS}${fmt(additional.towing)}</td></tr>` : ''}
          ${additional.inspection ? `<tr><td>Inspection Fee</td><td style="text-align:right">${RS}${fmt(additional.inspection)}</td></tr>` : ''}
          ${additional.misc ? `<tr><td>Miscellaneous</td><td style="text-align:right">${RS}${fmt(additional.misc)}</td></tr>` : ''}
          <tr><td style="font-weight:600">Subtotal</td><td style="text-align:right;font-weight:600">${RS}${fmt(subTotal)}</td></tr>
          ${discount ? `<tr><td style="color:#4ade80">Discount</td><td style="text-align:right;color:#4ade80">− ${RS}${fmt(discount)}</td></tr>` : ''}
        </tbody>
      </table>

      <div class="grand">
        <div>
          <div class="grand-lbl">GRAND TOTAL</div>
          <div style="font-size:9px;font-style:italic;color:#aaa">${numWords(grandTotal)} Rupees Only</div>
        </div>
        <div class="grand-val">${RS}${fmt(grandTotal)}</div>
      </div>

      ${notes ? `<div class="note-box"><strong>Notes / Terms:</strong><br/>${notes}</div>` : ''}

      <div class="sig-row">
        <div class="sig-col">
          <div class="sig-line"></div>
          <div class="sig-lbl">Customer Signature</div>
          <div class="sig-name">${customer.name || ''}</div>
        </div>
        <div class="sig-col">
          <div class="sig-line"></div>
          <div class="sig-lbl">Insurance Surveyor</div>
          <div class="sig-name">${incident.surveyor || ''}</div>
        </div>
        <div class="sig-col">
          <div class="sig-line"></div>
          <div class="sig-lbl">Authorised Signatory</div>
          <div class="sig-name">MM MOTORS</div>
        </div>
      </div>
    </div>

    <div class="goldbar"></div>
    <div class="footer-bar">
      <span class="footer-txt">This is a computer-generated estimate. Subject to change after detailed inspection.</span>
      <span class="footer-txt">MM Motors &nbsp;·&nbsp; Malur &nbsp;·&nbsp; Multi-brand Dealership</span>
    </div>
  </div>
  <script>window.onload=()=>{window.print();}</script>
  </body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

// ─── Saved Estimates Modal ────────────────────────────────────────────────────
function SavedEstimatesModal({ onLoad, onClose, onDeletedCurrent }) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { data: estimates = [], isLoading, isError, error } = useQuery({
    queryKey: ['accident-estimates'],
    queryFn: () => accidentEstimatesApi.list().then(r => r.data),
    staleTime: 15_000,
  });

  const deleteMut = useMutation({
    mutationFn: (id) => accidentEstimatesApi.delete(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries(['accident-estimates']);
      toast.success('Deleted');
      if (onDeletedCurrent) onDeletedCurrent(id);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog record" role="dialog" aria-modal="true" aria-labelledby="saved-est-title"
        style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
        <div className="record-head">
          <div>
            <h2 id="saved-est-title" className="record-title">Saved estimates</h2>
            <div className="record-id">{estimates.length} estimate{estimates.length !== 1 ? 's' : ''} saved</div>
          </div>
          <button type="button" className="record-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="record-body" style={{ padding: 0 }}>
          {isLoading && (
            <div className="table-skeleton">{[1,2,3].map(i => <Skeleton key={i} h={44} />)}</div>
          )}
          {isError && (
            <div style={{ padding: 'var(--space-lg)' }}><ApiError error={error} /></div>
          )}
          {!isLoading && !isError && estimates.length === 0 && (
            <Empty message="No saved estimates yet" sub="Use Save draft or Save final on an estimate to keep it here." />
          )}
          {estimates.map(est => {
            const sev = est.incident?.severity || 'Moderate';
            return (
              <div key={est.id} style={{
                padding: 'var(--space-sm) var(--space-lg)', borderBottom: '1px solid var(--color-rule)',
                display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-sm)',
              }}>
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-xs)', marginBottom: 'var(--space-3xs)' }}>
                    <span className="mono cell-strong">{est.estimate_number}</span>
                    <span className={`pill ${SEVERITY_PILL[sev] || 'pill-dim'}`}>{sev}</span>
                    <span className={`pill ${est.status === 'final' ? 'pill-green' : 'pill-dim'}`}>{est.status === 'final' ? 'Final' : 'Draft'}</span>
                  </div>
                  <div style={{ fontSize: 'var(--text-sm)' }}>
                    {est.customer?.name || 'No customer name'}, {est.vehicle?.brand} {est.vehicle?.model}
                  </div>
                  <div className="cell-sub">
                    {est.vehicle?.reg_number && <span className="mono" style={{ marginRight: 'var(--space-xs)' }}>{est.vehicle.reg_number}</span>}
                    {new Date(est.created_at).toLocaleDateString('en-IN')}
                    {est.created_by && <span style={{ marginLeft: 'var(--space-2xs)' }}>by {est.created_by}</span>}
                  </div>
                </div>
                <div className="cell-amount" style={{ textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {RS}{fmt(est.grand_total || 0)}
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2xs)', flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => { onLoad(est); onClose(); }}
                  >Load</button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-ghost-danger"
                    onClick={async () => { if (await confirm(`Delete estimate ${est.estimate_number || ''}?`.replace(' ?', '?'), { sub: 'This cannot be undone.' })) deleteMut.mutate(est.id); }}
                  >Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AccidentEstimatePage() {
  const qc = useQueryClient();
  const [vehicle, setVehicle] = useState({ brand: '', model: '', variant: '', colour: '', reg_number: '', chassis_number: '', engine_number: '', year: '', odometer: '' });
  const [customer, setCustomer] = useState({ name: '', mobile: '', address: '', insurance_company: '', policy_number: '', claim_number: '' });
  const [incident, setIncident] = useState({ date: new Date().toISOString().slice(0,10), location: '', severity: 'Moderate', nature: '', description: '', surveyor: '', surveyor_mobile: '' });
  const [parts, setParts] = useState([emptyPart()]);
  const [labour, setLabour] = useState([emptyLabour()]);
  const [additional, setAdditional] = useState({ towing: '', inspection: '', misc: '', discount: '' });
  const [notes, setNotes] = useState('This estimate is valid for 7 days from the date of issue. Final charges may vary based on actual parts availability and hidden damage found during repair.');
  const [activeTab, setActiveTab] = useState('vehicle');
  const [showSaved, setShowSaved] = useState(false);
  const [currentEstId, setCurrentEstId] = useState(null); // id of loaded/saved estimate

  // Calculations
  const partsTotal  = parts.reduce((s, p)  => s + (Number(p.qty||0) * Number(p.unit_price||0)), 0);
  const labourTotal = labour.reduce((s, l) => s + (Number(l.hours||0) * Number(l.rate||0)), 0);
  const subTotal    = partsTotal + labourTotal + Number(additional.towing||0) + Number(additional.inspection||0) + Number(additional.misc||0);
  const grandTotal  = subTotal - Number(additional.discount||0);

  const setP = (setter, field) => e => setter(prev => ({ ...prev, [field]: e.target.value }));

  const updatePart   = (key, field, val) => setParts(prev => prev.map(p => p._key === key ? { ...p, [field]: val } : p));
  const updateLabour = (key, field, val) => setLabour(prev => prev.map(l => l._key === key ? { ...l, [field]: val } : l));

  // ── Build payload ──────────────────────────────────────────────────────────
  const buildPayload = (status = 'draft') => ({
    vehicle, customer, incident,
    parts:      parts.map(({ _key, ...p }) => p),
    labour:     labour.map(({ _key, ...l }) => l),
    additional, notes,
    grand_total: grandTotal,
    status,
  });

  // ── Save mutation ──────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: (payload) =>
      currentEstId
        ? accidentEstimatesApi.update(currentEstId, payload).then(r => r.data)
        : accidentEstimatesApi.create(payload).then(r => r.data),
    onSuccess: (saved) => {
      setCurrentEstId(saved.id);
      qc.invalidateQueries(['accident-estimates']);
      draft.clearDraft();
      toast.success(`Saved as ${saved.estimate_number}`);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  // Draft — only active for new estimates (not when editing loaded one)
  const draftState = { vehicle, customer, incident, parts, labour, additional, notes };
  const draft = useDraft({
    key: 'mm_draft_accident',
    state: draftState,
    enabled: !currentEstId,
  });

  // ── Load estimate into form ────────────────────────────────────────────────
  const loadEstimate = (est) => {
    setVehicle(est.vehicle || {});
    setCustomer(est.customer || {});
    setIncident(est.incident || {});
    setParts((est.parts || [emptyPart()]).map(p => ({ ...p, _key: Math.random() })));
    setLabour((est.labour || [emptyLabour()]).map(l => ({ ...l, _key: Math.random() })));
    setAdditional(est.additional || { towing: '', inspection: '', misc: '', discount: '' });
    setNotes(est.notes || '');
    setCurrentEstId(est.id);
    toast.success(`Loaded ${est.estimate_number}`);
  };

  const TABS = [
    { id: 'vehicle',   label: 'Vehicle' },
    { id: 'customer',  label: 'Customer' },
    { id: 'incident',  label: 'Incident' },
    { id: 'parts',     label: `Parts (${parts.length})` },
    { id: 'labour',    label: `Labour (${labour.length})` },
    { id: 'summary',   label: 'Summary' },
  ];

  return (
    <div>

      {/* Saved estimates modal */}
      {showSaved && <SavedEstimatesModal
        onLoad={loadEstimate}
        onClose={() => setShowSaved(false)}
        onDeletedCurrent={(id) => { if (id === currentEstId) setCurrentEstId(null); }}
      />}

      {/* Header */}
      <div className="page-head" style={{ flexWrap: 'wrap' }}>
        <div>
          <h2 className="page-head-title">Accident estimate</h2>
          <div className="dialog-sub" style={{ marginTop: 'var(--space-3xs)' }}>
            {currentEstId
              ? <span className="pill pill-amber">Editing saved estimate</span>
              : 'Create repair estimate for accidental vehicles'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Grand total */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginRight: 'var(--space-sm)' }}>
            <span className="stat-label">Grand total</span>
            <span className="stat-value" style={{ fontSize: 'var(--text-xl)' }}>{RS}{fmt(grandTotal)}</span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => setShowSaved(true)}>Saved estimates</button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => saveMut.mutate(buildPayload('draft'))}
            disabled={saveMut.isPending}
          >{saveMut.isPending ? 'Saving…' : 'Save draft'}</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => printEstimate({ vehicle, customer, incident, parts, labour, additional, notes })}
          >Print estimate</button>
        </div>
      </div>

      {/* Local draft bar — only for new estimates */}
      {!currentEstId && (
        <div style={{ padding: 'var(--space-sm) var(--space-lg) 0' }}>
          <DraftBar
            draft={draft}
            onRestore={(d) => {
              if (d.vehicle)    setVehicle(d.vehicle);
              if (d.customer)   setCustomer(d.customer);
              if (d.incident)   setIncident(d.incident);
              if (d.parts)      setParts(d.parts.map(p => ({ ...p, _key: Math.random() })));
              if (d.labour)     setLabour(d.labour.map(l => ({ ...l, _key: Math.random() })));
              if (d.additional) setAdditional(d.additional);
              if (d.notes)      setNotes(d.notes);
            }}
            onDiscard={() => {}}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="tabbar">
        <div className="tabs" role="tablist" aria-label="Estimate sections" style={{ borderBottom: 0 }}>
          {TABS.map(t => (
            <button key={t.id} type="button" role="tab" className="tab" aria-selected={activeTab === t.id} onClick={() => setActiveTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* ── TAB: Vehicle ─────────────────────────────────────────────────────── */}
      {activeTab === 'vehicle' && (
        <Card labelledBy="est-vehicle">
          <SectionHead id="est-vehicle" label="Vehicle details" sub="Enter the vehicle information" />
          <div className="form-grid form-grid-3">
            <Field label="Brand *">
              <input value={vehicle.brand} onChange={setP(setVehicle,'brand')} placeholder="e.g. TVS, Honda" />
            </Field>
            <Field label="Model *">
              <input value={vehicle.model} onChange={setP(setVehicle,'model')} placeholder="e.g. Apache 200" />
            </Field>
            <Field label="Variant">
              <input value={vehicle.variant} onChange={setP(setVehicle,'variant')} placeholder="e.g. RTR, FI" />
            </Field>
            <Field label="Colour">
              <input value={vehicle.colour} onChange={setP(setVehicle,'colour')} placeholder="e.g. Black, Red" />
            </Field>
            <Field label="Registration no.">
              <input className="mono" value={vehicle.reg_number} onChange={setP(setVehicle,'reg_number')} placeholder="KA07 AB 1234" />
            </Field>
            <Field label="Year of manufacture">
              <input value={vehicle.year} onChange={setP(setVehicle,'year')} placeholder="2022" type="number" />
            </Field>
            <Field label="Chassis number">
              <input className="mono" value={vehicle.chassis_number} onChange={setP(setVehicle,'chassis_number')} placeholder="Chassis number" />
            </Field>
            <Field label="Engine number">
              <input className="mono" value={vehicle.engine_number} onChange={setP(setVehicle,'engine_number')} placeholder="Engine number" />
            </Field>
            <Field label="Odometer reading (km)">
              <input value={vehicle.odometer} onChange={setP(setVehicle,'odometer')} placeholder="12500" type="number" />
            </Field>
          </div>
        </Card>
      )}

      {/* ── TAB: Customer ────────────────────────────────────────────────────── */}
      {activeTab === 'customer' && (
        <Card labelledBy="est-customer">
          <SectionHead id="est-customer" label="Customer and insurance details" sub="Owner and claim information" />
          <div className="form-grid form-grid-3">
            <Field label="Customer name *">
              <input value={customer.name} onChange={setP(setCustomer,'name')} placeholder="Full name" />
            </Field>
            <Field label="Mobile no. *">
              <input value={customer.mobile} onChange={setP(setCustomer,'mobile')} placeholder="10-digit number" type="tel" />
            </Field>
            <Field label="Address">
              <input value={customer.address} onChange={setP(setCustomer,'address')} placeholder="Street, city" />
            </Field>
            <Field label="Insurance company">
              <input value={customer.insurance_company} onChange={setP(setCustomer,'insurance_company')} placeholder="e.g. New India, HDFC Ergo" />
            </Field>
            <Field label="Policy number">
              <input className="mono" value={customer.policy_number} onChange={setP(setCustomer,'policy_number')} placeholder="Policy number" />
            </Field>
            <Field label="Claim number">
              <input className="mono" value={customer.claim_number} onChange={setP(setCustomer,'claim_number')} placeholder="Claim reference" />
            </Field>
          </div>
        </Card>
      )}

      {/* ── TAB: Incident ────────────────────────────────────────────────────── */}
      {activeTab === 'incident' && (
        <Card labelledBy="est-incident">
          <SectionHead id="est-incident" label="Incident details" sub="Accident information and severity" />
          <div className="form-grid form-grid-3">
            <Field label="Incident date *">
              <input value={incident.date} onChange={setP(setIncident,'date')} type="date" />
            </Field>
            <Field label="Location">
              <input value={incident.location} onChange={setP(setIncident,'location')} placeholder="Where did it happen" />
            </Field>
            <Field label="Nature of accident">
              <select value={incident.nature} onChange={setP(setIncident,'nature')}>
                <option value="">Select type</option>
                <option>Front Collision</option>
                <option>Rear Collision</option>
                <option>Side Impact</option>
                <option>Fall / Skid</option>
                <option>Hit & Run</option>
                <option>Pothole Damage</option>
                <option>Fire Damage</option>
                <option>Flood Damage</option>
                <option>Vandalism</option>
                <option>Other</option>
              </select>
            </Field>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <span className="field-label">Severity</span>
              <SeverityBadge value={incident.severity} onClick={s => setIncident(p => ({ ...p, severity: s }))} />
            </div>
            <Field label="Description" span={3}>
              <textarea
                style={{ minHeight: 80 }}
                value={incident.description}
                onChange={setP(setIncident,'description')}
                placeholder="Describe damage areas, parts affected, visible damage..."
              />
            </Field>
            <Field label="Surveyor name">
              <input value={incident.surveyor} onChange={setP(setIncident,'surveyor')} placeholder="Insurance surveyor name" />
            </Field>
            <Field label="Surveyor mobile">
              <input value={incident.surveyor_mobile} onChange={setP(setIncident,'surveyor_mobile')} placeholder="Surveyor contact" />
            </Field>
          </div>
        </Card>
      )}

      {/* ── TAB: Parts ───────────────────────────────────────────────────────── */}
      {activeTab === 'parts' && (
        <Card labelledBy="est-parts">
          <SectionHead id="est-parts" label="Parts and materials" sub="List all parts to be replaced or repaired" />
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {['Part name','Part number','Condition','Qty','Unit price','GST %','Amount',''].map(h => (
                    <th key={h} className={h === 'Amount' || h === 'Unit price' ? 'num' : undefined}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parts.map(p => {
                  const amt = Number(p.qty||0) * Number(p.unit_price||0);
                  return (
                    <tr key={p._key}>
                      <td><input aria-label="Part name" style={{ minWidth: 160 }} value={p.part_name} onChange={e => updatePart(p._key,'part_name',e.target.value)} placeholder="Part name" /></td>
                      <td><input aria-label="Part number" className="mono" style={{ minWidth: 120 }} value={p.part_number} onChange={e => updatePart(p._key,'part_number',e.target.value)} placeholder="PN-XXXXX" /></td>
                      <td>
                        <select aria-label="Condition" style={{ minWidth: 140 }} value={p.condition} onChange={e => updatePart(p._key,'condition',e.target.value)}>
                          {PART_CONDITION.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </td>
                      <td><input aria-label="Quantity" style={{ width: 72, textAlign: 'center' }} type="number" min="1" value={p.qty} onChange={e => updatePart(p._key,'qty',e.target.value)} /></td>
                      <td><input aria-label="Unit price" style={{ minWidth: 100, textAlign: 'right' }} type="number" min="0" value={p.unit_price} onChange={e => updatePart(p._key,'unit_price',e.target.value)} placeholder="0" /></td>
                      <td>
                        <select aria-label="GST rate" style={{ minWidth: 80 }} value={p.gst} onChange={e => updatePart(p._key,'gst',e.target.value)}>
                          {[0,5,12,18,28].map(g => <option key={g} value={g}>{g}%</option>)}
                        </select>
                      </td>
                      <td className="num cell-amount">{RS}{fmt(amt)}</td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm btn-ghost-danger" onClick={() => setParts(prev => prev.filter(x => x._key !== p._key))}>Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="form-actions" style={{ marginTop: 'var(--space-md)' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setParts(prev => [...prev, emptyPart()])}>Add part</button>
            <div className="cell-amount" style={{ fontVariantNumeric: 'tabular-nums' }}>Parts total: {RS}{fmt(partsTotal)}</div>
          </div>
        </Card>
      )}

      {/* ── TAB: Labour ──────────────────────────────────────────────────────── */}
      {activeTab === 'labour' && (
        <Card labelledBy="est-labour">
          <SectionHead id="est-labour" label="Labour charges" sub="Service and repair work hours" />
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {['Description','Hours','Rate per hour','Amount',''].map(h => (
                    <th key={h} className={h === 'Amount' || h === 'Rate per hour' ? 'num' : undefined}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {labour.map(l => {
                  const amt = Number(l.hours||0) * Number(l.rate||0);
                  return (
                    <tr key={l._key}>
                      <td><input aria-label="Description" style={{ minWidth: 220 }} value={l.description} onChange={e => updateLabour(l._key,'description',e.target.value)} placeholder="e.g. Panel beating, painting, alignment" /></td>
                      <td><input aria-label="Hours" style={{ width: 88, textAlign: 'center' }} type="number" min="0.5" step="0.5" value={l.hours} onChange={e => updateLabour(l._key,'hours',e.target.value)} /></td>
                      <td><input aria-label="Rate per hour" style={{ minWidth: 100, textAlign: 'right' }} type="number" min="0" value={l.rate} onChange={e => updateLabour(l._key,'rate',e.target.value)} placeholder="Rate" /></td>
                      <td className="num cell-amount">{RS}{fmt(amt)}</td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm btn-ghost-danger" onClick={() => setLabour(prev => prev.filter(x => x._key !== l._key))}>Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="form-actions" style={{ marginTop: 'var(--space-md)' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setLabour(prev => [...prev, emptyLabour()])}>Add labour</button>
            <div className="cell-amount" style={{ fontVariantNumeric: 'tabular-nums' }}>Labour total: {RS}{fmt(labourTotal)}</div>
          </div>
        </Card>
      )}

      {/* ── TAB: Summary ─────────────────────────────────────────────────────── */}
      {activeTab === 'summary' && (
        <div className="page-pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 'var(--space-md)' }}>
          {/* Additional charges */}
          <Card labelledBy="est-additional" style={{ margin: 0 }}>
            <SectionHead id="est-additional" label="Additional charges" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {[['towing','Towing charges'],['inspection','Inspection fee'],['misc','Miscellaneous']].map(([k,l]) => (
                <Field key={k} label={l}>
                  <input type="number" min="0" value={additional[k]} onChange={setP(setAdditional,k)} placeholder="0" />
                </Field>
              ))}
              <Field label="Discount">
                <input style={{ color: 'var(--color-success)' }} type="number" min="0" value={additional.discount} onChange={setP(setAdditional,'discount')} placeholder="0" />
              </Field>
            </div>
          </Card>

          {/* Totals */}
          <Card labelledBy="est-breakdown" style={{ margin: 0 }}>
            <SectionHead id="est-breakdown" label="Cost breakdown" />
            <div>
              {[
                ['Parts and materials', partsTotal, false],
                ['Labour charges', labourTotal, false],
                ['Towing charges', Number(additional.towing||0), false],
                ['Inspection fee', Number(additional.inspection||0), false],
                ['Miscellaneous', Number(additional.misc||0), false],
              ].filter(([,v]) => v > 0).map(([l,v]) => (
                <div key={l} className="tot-row">
                  <span>{l}</span>
                  <span style={{ color: 'var(--color-ink)' }}>{RS}{fmt(v)}</span>
                </div>
              ))}
              <div className="tot-row is-key">
                <span>Subtotal</span>
                <span>{RS}{fmt(subTotal)}</span>
              </div>
              {Number(additional.discount||0) > 0 && (
                <div className="tot-row" style={{ color: 'var(--color-success)' }}>
                  <span>Discount</span>
                  <span>− {RS}{fmt(Number(additional.discount))}</span>
                </div>
              )}
              <div className="tot-row is-bold" style={{ borderBottom: 0, paddingTop: 'var(--space-sm)' }}>
                <span>Grand total</span>
                <span>{RS}{fmt(grandTotal)}</span>
              </div>
              <div className="cell-sub" style={{ fontStyle: 'italic' }}>
                {numWords(grandTotal)} Rupees Only
              </div>
            </div>
          </Card>

          {/* Notes */}
          <Card labelledBy="est-notes" style={{ margin: 0, gridColumn: '1 / -1' }}>
            <SectionHead id="est-notes" label="Notes and terms" />
            <textarea
              aria-labelledby="est-notes"
              style={{ minHeight: 80 }}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes, terms, or conditions for this estimate..."
            />
          </Card>

          {/* Print */}
          <div className="form-actions" style={{ gridColumn: '1 / -1', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" onClick={() => {
              setVehicle({ brand:'',model:'',variant:'',colour:'',reg_number:'',chassis_number:'',engine_number:'',year:'',odometer:'' });
              setCustomer({ name:'',mobile:'',address:'',insurance_company:'',policy_number:'',claim_number:'' });
              setIncident({ date:new Date().toISOString().slice(0,10), location:'',severity:'Moderate',nature:'',description:'',surveyor:'',surveyor_mobile:'' });
              setParts([emptyPart()]); setLabour([emptyLabour()]);
              setAdditional({ towing:'',inspection:'',misc:'',discount:'' });
              setCurrentEstId(null);
              toast.success('Form cleared');
            }}>Clear form</button>
            <div className="form-actions-end" style={{ flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => saveMut.mutate(buildPayload('draft'))}
                disabled={saveMut.isPending}
              >{saveMut.isPending ? 'Saving…' : 'Save draft'}</button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => saveMut.mutate(buildPayload('final'))}
                disabled={saveMut.isPending}
              >Save final</button>
              <button type="button" className="btn btn-primary" onClick={() => {
                if (!vehicle.brand || !vehicle.model) return toast.error('Enter vehicle brand and model');
                if (!customer.name || !customer.mobile) return toast.error('Enter customer name and mobile');
                printEstimate({ vehicle, customer, incident, parts, labour, additional, notes });
              }}>Print estimate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
