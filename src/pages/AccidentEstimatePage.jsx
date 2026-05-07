import { useState } from 'react';
import toast from 'react-hot-toast';

// ─── Style tokens ──────────────────────────────────────────────────────────────
const C = {
  surface: 'var(--surface,#141414)',
  s2:      'var(--surface2,#1a1a1a)',
  border:  'var(--border,#222)',
  border2: 'var(--border2,#2a2a2a)',
  text:    'var(--text,#e8e8e8)',
  muted:   'var(--muted,#888)',
  gold:    '#B8860B',
  red:     '#f87171',
  green:   '#4ade80',
  amber:   '#fbbf24',
};

const inp = {
  background: C.s2, border: `1px solid ${C.border}`,
  borderRadius: 3, padding: '8px 10px', color: C.text,
  outline: 'none', fontSize: 12, width: '100%', boxSizing: 'border-box',
  fontFamily: 'IBM Plex Sans, sans-serif',
};

const btnPrimary = {
  background: C.gold, color: '#fff', border: 'none', borderRadius: 3,
  padding: '9px 20px', fontWeight: 700, fontSize: 12, cursor: 'pointer',
  fontFamily: 'IBM Plex Sans, sans-serif', letterSpacing: '.04em',
};

const btnGhost = {
  background: 'transparent', color: C.muted, border: `1px solid ${C.border2}`,
  borderRadius: 3, padding: '8px 14px', fontSize: 12, cursor: 'pointer',
  fontFamily: 'IBM Plex Sans, sans-serif',
};

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
function SectionHead({ label, sub }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: C.gold, textTransform: 'uppercase' }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────
function Field({ label, children, span = 1 }) {
  return (
    <div style={{ gridColumn: `span ${span}` }}>
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, letterSpacing: '.04em' }}>{label}</div>
      {children}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function Card({ children, style = {} }) {
  return (
    <div style={{
      background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4,
      padding: 20, marginBottom: 16, ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Severity badge ───────────────────────────────────────────────────────────
function SeverityBadge({ value, onClick }) {
  const colors = { Minor: '#4ade80', Moderate: '#fbbf24', Major: '#f87171', 'Total Loss': '#ef4444' };
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {SEVERITY.map(s => (
        <button key={s} onClick={() => onClick(s)} style={{
          padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
          border: `1px solid ${value === s ? colors[s] : C.border}`,
          background: value === s ? colors[s] + '22' : 'transparent',
          color: value === s ? colors[s] : C.muted,
          transition: 'all 120ms',
        }}>{s}</button>
      ))}
    </div>
  );
}

// ─── Print modal ─────────────────────────────────────────────────────────────
function printEstimate(data) {
  const { vehicle, customer, incident, parts, labour, additional, notes } = data;

  const partsTotal = parts.reduce((s, p) => s + (p.qty * p.unit_price * (1 + p.gst / 100)), 0);
  const labourTotal = labour.reduce((s, l) => s + (l.hours * l.rate), 0);
  const subTotal = partsTotal + labourTotal + Number(additional.misc || 0) + Number(additional.towing || 0) + Number(additional.inspection || 0);
  const discount = Number(additional.discount || 0);
  const grandTotal = subTotal - discount;

  const partRows = parts.map(p => {
    const amt = p.qty * p.unit_price;
    const gst = amt * p.gst / 100;
    return `<tr>
      <td>${p.part_name}</td>
      <td style="font-family:monospace;font-size:10px">${p.part_number || '—'}</td>
      <td>${p.condition}</td>
      <td style="text-align:center">${p.qty}</td>
      <td style="text-align:right">${RS}${fmt(p.unit_price)}</td>
      <td style="text-align:center">${p.gst}%</td>
      <td style="text-align:right">${RS}${fmt(amt + gst)}</td>
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AccidentEstimatePage() {
  const [vehicle, setVehicle] = useState({ brand: '', model: '', variant: '', colour: '', reg_number: '', chassis_number: '', engine_number: '', year: '', odometer: '' });
  const [customer, setCustomer] = useState({ name: '', mobile: '', address: '', insurance_company: '', policy_number: '', claim_number: '' });
  const [incident, setIncident] = useState({ date: new Date().toISOString().slice(0,10), location: '', severity: 'Moderate', nature: '', description: '', surveyor: '', surveyor_mobile: '' });
  const [parts, setParts] = useState([emptyPart()]);
  const [labour, setLabour] = useState([emptyLabour()]);
  const [additional, setAdditional] = useState({ towing: '', inspection: '', misc: '', discount: '' });
  const [notes, setNotes] = useState('This estimate is valid for 7 days from the date of issue. Final charges may vary based on actual parts availability and hidden damage found during repair.');
  const [activeTab, setActiveTab] = useState('vehicle');

  // Calculations
  const partsTotal  = parts.reduce((s, p)  => s + (Number(p.qty||0) * Number(p.unit_price||0) * (1 + Number(p.gst||0)/100)), 0);
  const labourTotal = labour.reduce((s, l) => s + (Number(l.hours||0) * Number(l.rate||0)), 0);
  const subTotal    = partsTotal + labourTotal + Number(additional.towing||0) + Number(additional.inspection||0) + Number(additional.misc||0);
  const grandTotal  = subTotal - Number(additional.discount||0);

  const setP = (setter, field) => e => setter(prev => ({ ...prev, [field]: e.target.value }));

  const updatePart = (key, field, val) => setParts(prev => prev.map(p => p._key === key ? { ...p, [field]: val } : p));
  const updateLabour = (key, field, val) => setLabour(prev => prev.map(l => l._key === key ? { ...l, [field]: val } : l));

  const TABS = [
    { id: 'vehicle',   label: 'Vehicle' },
    { id: 'customer',  label: 'Customer' },
    { id: 'incident',  label: 'Incident' },
    { id: 'parts',     label: `Parts (${parts.length})` },
    { id: 'labour',    label: `Labour (${labour.length})` },
    { id: 'summary',   label: 'Summary' },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0 }}>Accident Estimate</h1>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Create repair estimate for accidental vehicles</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Grand total pill */}
          <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, padding: '8px 16px', textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: '.06em' }}>GRAND TOTAL</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.gold }}>{RS}{fmt(grandTotal)}</div>
          </div>
          <button
            style={btnPrimary}
            onClick={() => printEstimate({ vehicle, customer, incident, parts, labour, additional, notes })}
          >
            🖨 Print Estimate
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: '9px 16px', fontSize: 12, fontFamily: 'IBM Plex Sans, sans-serif',
            color: activeTab === t.id ? C.gold : C.muted,
            borderBottom: `2px solid ${activeTab === t.id ? C.gold : 'transparent'}`,
            marginBottom: -1, fontWeight: activeTab === t.id ? 600 : 400,
            transition: 'all 100ms',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── TAB: Vehicle ─────────────────────────────────────────────────────── */}
      {activeTab === 'vehicle' && (
        <Card>
          <SectionHead label="Vehicle Details" sub="Enter the vehicle information" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <Field label="Brand *">
              <input style={inp} value={vehicle.brand} onChange={setP(setVehicle,'brand')} placeholder="e.g. TVS, Honda" />
            </Field>
            <Field label="Model *">
              <input style={inp} value={vehicle.model} onChange={setP(setVehicle,'model')} placeholder="e.g. Apache 200" />
            </Field>
            <Field label="Variant">
              <input style={inp} value={vehicle.variant} onChange={setP(setVehicle,'variant')} placeholder="e.g. RTR, FI" />
            </Field>
            <Field label="Colour">
              <input style={inp} value={vehicle.colour} onChange={setP(setVehicle,'colour')} placeholder="e.g. Black, Red" />
            </Field>
            <Field label="Registration No.">
              <input style={{ ...inp, fontFamily: 'monospace' }} value={vehicle.reg_number} onChange={setP(setVehicle,'reg_number')} placeholder="KA07 AB 1234" />
            </Field>
            <Field label="Year of Manufacture">
              <input style={inp} value={vehicle.year} onChange={setP(setVehicle,'year')} placeholder="2022" type="number" />
            </Field>
            <Field label="Chassis Number" span={2}>
              <input style={{ ...inp, fontFamily: 'monospace' }} value={vehicle.chassis_number} onChange={setP(setVehicle,'chassis_number')} placeholder="Chassis number" />
            </Field>
            <Field label="Engine Number">
              <input style={{ ...inp, fontFamily: 'monospace' }} value={vehicle.engine_number} onChange={setP(setVehicle,'engine_number')} placeholder="Engine number" />
            </Field>
            <Field label="Odometer Reading (km)">
              <input style={inp} value={vehicle.odometer} onChange={setP(setVehicle,'odometer')} placeholder="12500" type="number" />
            </Field>
          </div>
        </Card>
      )}

      {/* ── TAB: Customer ────────────────────────────────────────────────────── */}
      {activeTab === 'customer' && (
        <Card>
          <SectionHead label="Customer & Insurance Details" sub="Owner and claim information" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <Field label="Customer Name *">
              <input style={inp} value={customer.name} onChange={setP(setCustomer,'name')} placeholder="Full name" />
            </Field>
            <Field label="Mobile No. *">
              <input style={inp} value={customer.mobile} onChange={setP(setCustomer,'mobile')} placeholder="10-digit number" type="tel" />
            </Field>
            <Field label="Address">
              <input style={inp} value={customer.address} onChange={setP(setCustomer,'address')} placeholder="Street, city" />
            </Field>
            <Field label="Insurance Company">
              <input style={inp} value={customer.insurance_company} onChange={setP(setCustomer,'insurance_company')} placeholder="e.g. New India, HDFC Ergo" />
            </Field>
            <Field label="Policy Number">
              <input style={{ ...inp, fontFamily: 'monospace' }} value={customer.policy_number} onChange={setP(setCustomer,'policy_number')} placeholder="Policy number" />
            </Field>
            <Field label="Claim Number">
              <input style={{ ...inp, fontFamily: 'monospace' }} value={customer.claim_number} onChange={setP(setCustomer,'claim_number')} placeholder="Claim reference" />
            </Field>
          </div>
        </Card>
      )}

      {/* ── TAB: Incident ────────────────────────────────────────────────────── */}
      {activeTab === 'incident' && (
        <Card>
          <SectionHead label="Incident Details" sub="Accident information and severity" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <Field label="Incident Date *">
              <input style={inp} value={incident.date} onChange={setP(setIncident,'date')} type="date" />
            </Field>
            <Field label="Location">
              <input style={inp} value={incident.location} onChange={setP(setIncident,'location')} placeholder="Where did it happen" />
            </Field>
            <Field label="Nature of Accident">
              <select style={inp} value={incident.nature} onChange={setP(setIncident,'nature')}>
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
            <Field label="Severity" span={3}>
              <SeverityBadge value={incident.severity} onClick={s => setIncident(p => ({ ...p, severity: s }))} />
            </Field>
            <Field label="Description" span={3}>
              <textarea
                style={{ ...inp, resize: 'vertical', minHeight: 80 }}
                value={incident.description}
                onChange={setP(setIncident,'description')}
                placeholder="Describe damage areas, parts affected, visible damage..."
              />
            </Field>
            <Field label="Surveyor Name">
              <input style={inp} value={incident.surveyor} onChange={setP(setIncident,'surveyor')} placeholder="Insurance surveyor name" />
            </Field>
            <Field label="Surveyor Mobile">
              <input style={inp} value={incident.surveyor_mobile} onChange={setP(setIncident,'surveyor_mobile')} placeholder="Surveyor contact" />
            </Field>
          </div>
        </Card>
      )}

      {/* ── TAB: Parts ───────────────────────────────────────────────────────── */}
      {activeTab === 'parts' && (
        <Card>
          <SectionHead label="Parts & Materials" sub="List all parts to be replaced or repaired" />
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.2fr 70px 110px 80px 110px 36px', gap: 6, marginBottom: 6 }}>
            {['Part Name','Part Number','Condition','Qty','Unit Price','GST %','Amount',''].map(h => (
              <div key={h} style={{ fontSize: 9, color: C.muted, letterSpacing: '.05em', textTransform: 'uppercase', fontWeight: 600 }}>{h}</div>
            ))}
          </div>
          {parts.map(p => {
            const amt = Number(p.qty||0) * Number(p.unit_price||0) * (1 + Number(p.gst||0)/100);
            return (
              <div key={p._key} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.2fr 70px 110px 80px 110px 36px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input style={inp} value={p.part_name} onChange={e => updatePart(p._key,'part_name',e.target.value)} placeholder="Part name" />
                <input style={{ ...inp, fontFamily: 'monospace', fontSize: 11 }} value={p.part_number} onChange={e => updatePart(p._key,'part_number',e.target.value)} placeholder="PN-XXXXX" />
                <select style={inp} value={p.condition} onChange={e => updatePart(p._key,'condition',e.target.value)}>
                  {PART_CONDITION.map(c => <option key={c}>{c}</option>)}
                </select>
                <input style={{ ...inp, textAlign: 'center' }} type="number" min="1" value={p.qty} onChange={e => updatePart(p._key,'qty',e.target.value)} />
                <input style={{ ...inp, textAlign: 'right' }} type="number" min="0" value={p.unit_price} onChange={e => updatePart(p._key,'unit_price',e.target.value)} placeholder="0" />
                <select style={inp} value={p.gst} onChange={e => updatePart(p._key,'gst',e.target.value)}>
                  {[0,5,12,18,28].map(g => <option key={g} value={g}>{g}%</option>)}
                </select>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text, textAlign: 'right', padding: '8px 4px' }}>{RS}{fmt(amt)}</div>
                <button onClick={() => setParts(prev => prev.filter(x => x._key !== p._key))} style={{ background: 'transparent', border: 'none', color: C.red, cursor: 'pointer', fontSize: 16, padding: 4 }}>×</button>
              </div>
            );
          })}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
            <button style={btnGhost} onClick={() => setParts(prev => [...prev, emptyPart()])}>+ Add Part</button>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.gold }}>Parts Total: {RS}{fmt(partsTotal)}</div>
          </div>
        </Card>
      )}

      {/* ── TAB: Labour ──────────────────────────────────────────────────────── */}
      {activeTab === 'labour' && (
        <Card>
          <SectionHead label="Labour Charges" sub="Service and repair work hours" />
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 100px 120px 110px 36px', gap: 6, marginBottom: 6 }}>
            {['Description','Hours','Rate / Hour','Amount',''].map(h => (
              <div key={h} style={{ fontSize: 9, color: C.muted, letterSpacing: '.05em', textTransform: 'uppercase', fontWeight: 600 }}>{h}</div>
            ))}
          </div>
          {labour.map(l => {
            const amt = Number(l.hours||0) * Number(l.rate||0);
            return (
              <div key={l._key} style={{ display: 'grid', gridTemplateColumns: '3fr 100px 120px 110px 36px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input style={inp} value={l.description} onChange={e => updateLabour(l._key,'description',e.target.value)} placeholder="e.g. Panel beating, painting, alignment" />
                <input style={{ ...inp, textAlign: 'center' }} type="number" min="0.5" step="0.5" value={l.hours} onChange={e => updateLabour(l._key,'hours',e.target.value)} />
                <input style={{ ...inp, textAlign: 'right' }} type="number" min="0" value={l.rate} onChange={e => updateLabour(l._key,'rate',e.target.value)} placeholder="Rate" />
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text, textAlign: 'right', padding: '8px 4px' }}>{RS}{fmt(amt)}</div>
                <button onClick={() => setLabour(prev => prev.filter(x => x._key !== l._key))} style={{ background: 'transparent', border: 'none', color: C.red, cursor: 'pointer', fontSize: 16, padding: 4 }}>×</button>
              </div>
            );
          })}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
            <button style={btnGhost} onClick={() => setLabour(prev => [...prev, emptyLabour()])}>+ Add Labour</button>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.gold }}>Labour Total: {RS}{fmt(labourTotal)}</div>
          </div>
        </Card>
      )}

      {/* ── TAB: Summary ─────────────────────────────────────────────────────── */}
      {activeTab === 'summary' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Additional charges */}
          <Card>
            <SectionHead label="Additional Charges" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[['towing','Towing Charges'],['inspection','Inspection Fee'],['misc','Miscellaneous']].map(([k,l]) => (
                <Field key={k} label={l}>
                  <input style={inp} type="number" min="0" value={additional[k]} onChange={setP(setAdditional,k)} placeholder="0" />
                </Field>
              ))}
              <Field label="Discount">
                <input style={{ ...inp, color: C.green }} type="number" min="0" value={additional.discount} onChange={setP(setAdditional,'discount')} placeholder="0" />
              </Field>
            </div>
          </Card>

          {/* Totals */}
          <Card>
            <SectionHead label="Cost Breakdown" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                ['Parts & Materials', partsTotal, false],
                ['Labour Charges', labourTotal, false],
                ['Towing Charges', Number(additional.towing||0), false],
                ['Inspection Fee', Number(additional.inspection||0), false],
                ['Miscellaneous', Number(additional.misc||0), false],
              ].filter(([,v]) => v > 0).map(([l,v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                  <span style={{ color: C.muted }}>{l}</span>
                  <span style={{ fontWeight: 600 }}>{RS}{fmt(v)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13, fontWeight: 700 }}>
                <span>Subtotal</span>
                <span>{RS}{fmt(subTotal)}</span>
              </div>
              {Number(additional.discount||0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.green }}>
                  <span>Discount</span>
                  <span>− {RS}{fmt(Number(additional.discount))}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0 0', fontSize: 16, fontWeight: 800 }}>
                <span style={{ color: C.gold }}>Grand Total</span>
                <span style={{ color: C.gold }}>{RS}{fmt(grandTotal)}</span>
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 4, fontStyle: 'italic' }}>
                {numWords(grandTotal)} Rupees Only
              </div>
            </div>
          </Card>

          {/* Notes */}
          <Card style={{ gridColumn: 'span 2' }}>
            <SectionHead label="Notes / Terms & Conditions" />
            <textarea
              style={{ ...inp, resize: 'vertical', minHeight: 80 }}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes, terms, or conditions for this estimate..."
            />
          </Card>

          {/* Print */}
          <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button style={btnGhost} onClick={() => {
              setVehicle({ brand:'',model:'',variant:'',colour:'',reg_number:'',chassis_number:'',engine_number:'',year:'',odometer:'' });
              setCustomer({ name:'',mobile:'',address:'',insurance_company:'',policy_number:'',claim_number:'' });
              setIncident({ date:new Date().toISOString().slice(0,10), location:'',severity:'Moderate',nature:'',description:'',surveyor:'',surveyor_mobile:'' });
              setParts([emptyPart()]); setLabour([emptyLabour()]);
              setAdditional({ towing:'',inspection:'',misc:'',discount:'' });
              toast.success('Form cleared');
            }}>Clear Form</button>
            <button style={btnPrimary} onClick={() => {
              if (!vehicle.brand || !vehicle.model) return toast.error('Enter vehicle brand and model');
              if (!customer.name || !customer.mobile) return toast.error('Enter customer name and mobile');
              printEstimate({ vehicle, customer, incident, parts, labour, additional, notes });
            }}>🖨 Print Estimate</button>
          </div>
        </div>
      )}
    </div>
  );
}
