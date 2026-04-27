import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { salesApi, customersApi, vehiclesApi, errMsg} from '../api/client';
import { Btn, GhostBtn, Field, Skeleton, Empty, ApiError, useSortable } from '../components/ui';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';
import FileUpload from '../components/FileUpload';

// ── Helpers ──────────────────────────────────────────────────────────
function sendWA(mobile, msg) {
  if (!mobile) return toast.error('No mobile number saved');
  const cleanMobile = String(mobile).replace(/\D/g, '');
  window.open(`https://wa.me/91${cleanMobile}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ── Invoice modal ────────────────────────────────────────────────────
function InvoiceModal({ sale, onClose }) {
  const [notes, setNotes] = useState(sale.notes || '');

  const print = () => {
    const RS = '₹';
    const fmt = n => Number(n||0).toLocaleString('en-IN');

    // build amount breakdown rows
    const exShowroom  = sale.ex_showroom_price || sale.total_amount || 0;
    const rto         = sale.rto               || 0;
    const insurance   = sale.insurance         || 0;
    const accessories = sale.accessories       || 0;
    const discount    = sale.discount          || 0;
    const totalAmount = sale.total_amount      || 0;

    const amountRows = [
      ['Ex-Showroom Price', exShowroom],
      rto         ? ['RTO',           rto]         : null,
      insurance   ? ['Insurance',     insurance]   : null,
      accessories ? ['Accessories',   accessories] : null,
      discount    ? ['Discount',      -discount]   : null,
    ].filter(Boolean).map(([l,v]) =>
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;font-size:12px">${l}</td>
       <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-size:12px">${v<0?'− ':''}${RS}${fmt(Math.abs(v))}</td></tr>`
    ).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <title>Invoice — ${sale.invoice_number}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#111;padding:24px;background:#fff}
      .wrap{max-width:680px;margin:0 auto}
      .hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;border-bottom:2.5px solid #B8860B;margin-bottom:20px}
      .brand{font-size:22px;font-weight:800;color:#B8860B;letter-spacing:-.5px}
      .brand-sub{font-size:10px;color:#888;margin-top:3px}
      .inv-meta{text-align:right}
      .inv-meta .inv-no{font-size:16px;font-weight:700;color:#B8860B}
      .inv-meta .inv-date{font-size:10px;color:#666;margin-top:4px}
      .section-title{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#888;margin-bottom:10px;font-weight:700}
      .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
      .box{background:#f9f9f9;border:1px solid #e5e5e5;border-radius:5px;padding:14px}
      .row{display:flex;padding:7px 0;border-bottom:1px solid #eee}
      .row:last-child{border-bottom:none}
      .row .lbl{width:150px;color:#666;font-size:11px;flex-shrink:0}
      .row .val{font-size:12px;font-weight:500;word-break:break-word}
      .amt-table{width:100%;border-collapse:collapse;margin-bottom:16px}
      .total-row td{font-size:14px;font-weight:800;color:#B8860B;padding:10px 12px;border-top:2px solid #B8860B}
      .notes-box{background:#f9f9f9;border:1px solid #e5e5e5;border-radius:5px;padding:12px;font-size:12px;color:#444;min-height:40px;margin-bottom:20px}
      .footer{display:flex;justify-content:space-between;border-top:1px solid #ddd;padding-top:12px;font-size:10px;color:#888}
      @media print{body{padding:10px}}
    </style></head><body>
    <div class="wrap">
      <div class="hdr">
        <div>
          <div class="brand">MM MOTORS</div>
          <div class="brand-sub">Authorised Multi-Brand Dealership</div>
        </div>
        <div class="inv-meta">
          <div style="font-size:11px;color:#888;font-weight:600;letter-spacing:.07em;text-transform:uppercase">Tax Invoice</div>
          <div class="inv-no">${sale.invoice_number}</div>
          <div class="inv-date">Date: ${sale.sale_date || new Date().toLocaleDateString('en-IN')}</div>
        </div>
      </div>

      <div class="grid2">
        <div class="box">
          <div class="section-title">Customer Details</div>
          <div class="row"><div class="lbl">Name</div><div class="val">${sale.customer_name||'—'}</div></div>
          <div class="row"><div class="lbl">C/O</div><div class="val">${sale.care_of||sale.customer_care_of||'—'}</div></div>
          <div class="row"><div class="lbl">Mobile</div><div class="val">${sale.customer_mobile||'—'}</div></div>
          <div class="row"><div class="lbl">Address</div><div class="val">${sale.customer_address||'—'}</div></div>
        </div>
        <div class="box">
          <div class="section-title">Vehicle Details</div>
          <div class="row"><div class="lbl">Brand / Model</div><div class="val">${sale.vehicle_brand||''} ${sale.vehicle_model||''}</div></div>
          <div class="row"><div class="lbl">Variant</div><div class="val">${sale.vehicle_variant||'—'}</div></div>
          <div class="row"><div class="lbl">Colour</div><div class="val">${sale.vehicle_color||'—'}</div></div>
          <div class="row"><div class="lbl">Vehicle No.</div><div class="val">${sale.vehicle_number||'—'}</div></div>
          <div class="row"><div class="lbl">Chassis No.</div><div class="val">${sale.chassis_number||'—'}</div></div>
          <div class="row"><div class="lbl">Engine No.</div><div class="val">${sale.engine_number||'—'}</div></div>
          <div class="row"><div class="lbl">HP (Financier)</div><div class="val">${sale.financier||'—'}</div></div>
        </div>
      </div>

      <div class="section-title">Nominee Details</div>
      <div class="box" style="margin-bottom:20px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:0">
        <div class="row" style="flex-direction:column;border-right:1px solid #eee;padding:10px"><div class="lbl" style="width:auto;margin-bottom:4px">Name</div><div class="val">${sale.nominee?.name||'—'}</div></div>
        <div class="row" style="flex-direction:column;border-right:1px solid #eee;padding:10px"><div class="lbl" style="width:auto;margin-bottom:4px">Relation</div><div class="val">${sale.nominee?.relation||'—'}</div></div>
        <div class="row" style="flex-direction:column;border-right:1px solid #eee;padding:10px"><div class="lbl" style="width:auto;margin-bottom:4px">Age</div><div class="val">${sale.nominee?.age||'—'}</div></div>
        <div class="row" style="flex-direction:column;padding:10px"><div class="lbl" style="width:auto;margin-bottom:4px">Number</div><div class="val">${sale.nominee?.number||'—'}</div></div>
      </div>

      <div class="section-title">Amount Breakdown</div>
      <table class="amt-table">
        <tbody>
          ${amountRows}
        </tbody>
        <tfoot>
          <tr class="total-row"><td>Total Amount</td><td style="text-align:right">${RS}${fmt(totalAmount)}</td></tr>
        </tfoot>
      </table>
      <div style="text-align:right;font-size:10px;color:#888;font-style:italic;margin-bottom:20px">
        Payment Mode: ${sale.payment_mode||'Cash'}
      </div>

      ${notes ? `<div class="section-title">Notes</div><div class="notes-box">${notes}</div>` : ''}

      <div class="footer">
        <span>Thank you for choosing MM Motors!</span>
        <span>Authorised Signatory</span>
      </div>
    </div>
    <script>window.onload=()=>{window.print();}</script>
    </body></html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={onClose}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, width:'100%', maxWidth:520, display:'flex', flexDirection:'column', maxHeight:'90vh' }}
        onClick={e=>e.stopPropagation()}>
        <div style={{ background:'#1c1c20', padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div className="display" style={{ fontSize:13, color:'var(--accent)', fontWeight:700 }}>Sale Record</div>
            <div className="mono" style={{ fontSize:11, color:'#6b6460', marginTop:2 }}>{sale.invoice_number}</div>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#6b6460', cursor:'pointer', fontSize:20 }}>×</button>
        </div>

        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:0, overflowY:'auto' }}>
          {[
            ['Sales Date',     sale.sale_date || '—'],
            ['Name',           sale.customer_name || '—'],
            ['C/O',            sale.care_of || sale.customer_care_of || '—'],
            ['Mobile Number',  sale.customer_mobile || '—'],
            ['Address',        sale.customer_address || '—'],
            ['Brand',          sale.vehicle_brand || '—'],
            ['Model',          sale.vehicle_model || '—'],
            ['Variant',        sale.vehicle_variant || '—'],
            ['Colour',         sale.vehicle_color || '—'],
            ['Vehicle No',     sale.vehicle_number || '—'],
            ['Chassis No',     sale.chassis_number || '—'],
            ['Engine No',      sale.engine_number || '—'],
            ['RTO',            sale.rto ? `₹${sale.rto.toLocaleString('en-IN')}` : '—'],
            ['HP (Financier)', sale.financier || '—'],
            ['Nominee Name',   sale.nominee?.name || '—'],
            ['Relation',       sale.nominee?.relation || '—'],
            ['Age',            sale.nominee?.age || '—'],
            ['Number',         sale.nominee?.number || '—'],
            ['Total Amount',   sale.total_amount ? `₹${sale.total_amount.toLocaleString('en-IN')}` : '—'],
            ['Payment Mode',   sale.payment_mode || '—'],
          ].map(([l,v]) => (
            <div key={l} style={{ display:'flex', fontSize:12, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
              <div style={{ width:140, color:'var(--muted)', flexShrink:0, fontWeight:500 }}>{l}</div>
              <div style={{ color:'var(--text)', wordBreak:'break-word' }}>{v}</div>
            </div>
          ))}
          {/* Notes field */}
          <div style={{ marginTop:14 }}>
            <div style={{ fontSize:10, letterSpacing:'.07em', textTransform:'uppercase', color:'var(--muted)', fontWeight:600, marginBottom:6 }}>Notes</div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Additional notes for this sale…"
              style={{ width:'100%', padding:'8px 10px', border:'1px solid var(--border)', borderRadius:4, background:'var(--surface2)', color:'var(--text)', fontSize:12, fontFamily:'IBM Plex Sans, sans-serif', resize:'vertical', boxSizing:'border-box' }}
            />
          </div>
        </div>

        <div style={{ padding:'16px 20px', background:'var(--surface2)', borderTop:'1px solid var(--border)', display:'flex', gap:8, flexShrink:0 }}>
          <Btn onClick={print}>Print →</Btn>
          <GhostBtn onClick={()=>sendWA(sale.customer_mobile,`Dear ${sale.customer_name}, your vehicle documentation is ready. Thank you for choosing MM Motors!`)}>WhatsApp</GhostBtn>
          <GhostBtn onClick={() => {
            const lines = [
              `Invoice    : ${sale.invoice_number || '—'}`,
              `Date       : ${sale.sale_date || '—'}`,
              `Name       : ${sale.customer_name || '—'}`,
              `C/O        : ${sale.care_of || sale.customer_care_of || '—'}`,
              `Mobile     : ${sale.customer_mobile || '—'}`,
              `Address    : ${sale.customer_address || '—'}`,
              `Brand      : ${sale.vehicle_brand || '—'}`,
              `Model      : ${sale.vehicle_model || '—'}`,
              `Variant    : ${sale.vehicle_variant || '—'}`,
              `Colour     : ${sale.vehicle_color || '—'}`,
              `Vehicle No : ${sale.vehicle_number || '—'}`,
              `Chassis No : ${sale.chassis_number || '—'}`,
              `Engine No  : ${sale.engine_number || '—'}`,
              `RTO        : ${sale.rto ? `₹${sale.rto.toLocaleString('en-IN')}` : '—'}`,
              `Financier  : ${sale.financier || '—'}`,
              `Nominee    : ${sale.nominee?.name || '—'} (${sale.nominee?.relation || '—'}, ${sale.nominee?.age || '—'})`,
              `Amount     : ${sale.total_amount ? `₹${sale.total_amount.toLocaleString('en-IN')}` : '—'}`,
              `Payment    : ${sale.payment_mode || '—'}`,
            ].join("\n");
            navigator.clipboard.writeText(lines).then(() => {
              const btn = document.activeElement;
              const orig = btn.textContent;
              btn.textContent = 'Copied!';
              setTimeout(() => { btn.textContent = orig; }, 1800);
            });
          }}>Copy</GhostBtn>
        </div>
      </div>
    </div>
  );
}

// ── Sale Wizard Form ────────────────────────────────────────────────
function SaleForm({ initial = {}, onSave, onCancel, saving }) {
  const [step, setStep] = useState(1);

  // ── Search state for customer ──────────────────────────────────────────────
  const [custSearch, setCustSearch] = useState('');
  const [custFocus, setCustFocus]   = useState(false);
  const { data: custData } = useQuery({
    queryKey: ['customers-search', custSearch],
    queryFn: () => customersApi.list({ search: custSearch || undefined, limit: 20 }).then(r => r.data),
    enabled: custSearch.length >= 1,
  });
  const custResults = Array.isArray(custData) ? custData : [];

  // ── Search state for vehicle ───────────────────────────────────────────────
  const [vehSearch, setVehSearch] = useState('');
  const [vehFocus, setVehFocus]   = useState(false);
  const { data: vehData } = useQuery({
    queryKey: ['vehicles-search', vehSearch],
    queryFn: () => vehiclesApi.list({
      search: vehSearch || undefined,
      status: 'in_stock',
      limit: 20,
    }).then(r => r.data),
    enabled: vehSearch.length >= 1,
  });
  const vehResults = Array.isArray(vehData)
    ? vehData.filter(v => v.status === 'Instock' || v.status === 'in_stock' || v.id === initial.vehicle_id)
    : [];

  const [f, setF] = useState({
    customer_id: '', customer_name: '', care_of: '', customer_mobile: '', customer_address: '',
    vehicle_id: '', vehicle_brand: '', vehicle_model: '', vehicle_variant: '', vehicle_color: '', chassis_number: '', engine_number: '',
    nominee_name: initial?.nominee?.name || '', nominee_relation: initial?.nominee?.relation || '', nominee_age: initial?.nominee?.age || '', nominee_number: initial?.nominee?.number || '',
    sale_date: new Date().toISOString().split('T')[0], sale_price: '', payment_mode: 'Cash', financier: '', sold_by: '', notes: '',
    vehicle_number: '', hsrp_front: '', hsrp_back: '', hsrp_front_id: null, hsrp_back_id: null, hsrp_date: '', hsrp_notes: '',
    ...initial
  });

  const s = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  const inpStyle = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3, padding:'8px 10px', color:'var(--text)', outline:'none', fontSize:13, width:'100%' };
  const dropStyle = { position:'absolute', top:'100%', left:0, right:0, zIndex:100, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:3, boxShadow:'0 4px 16px rgba(0,0,0,.12)', maxHeight:200, overflowY:'auto' };
  const dropItemStyle = (hover) => ({ padding:'8px 12px', fontSize:12, cursor:'pointer', background: hover ? 'var(--surface2)' : 'transparent', borderBottom:'1px solid var(--border)' });

  const handleSave = () => {
    if (!f.customer_name || !f.customer_mobile) return toast.error('Please provide Customer Name and Mobile in Step 1');
    // In edit mode, vehicle details (brand/model/chassis) are already on the record — no need to re-select
    const hasVehicleDetails = f.vehicle_brand && f.vehicle_model;
    if (!f.vehicle_id && !hasVehicleDetails) return toast.error('Please select a vehicle in Step 2');

    const payload = {
      ...f,
      nominee: {
        name: f.nominee_name,
        relation: f.nominee_relation,
        age: f.nominee_age,
        number: f.nominee_number
      },
      sale_price: parseFloat(f.sale_price) || 0,
      total_amount: parseFloat(f.sale_price) || 0 
    };
    onSave(payload);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:700 }}>
      
      {/* ── Tabs ── */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:10, overflowX: 'auto' }}>
        {['CUSTOMER', 'VEHICLE', 'NOMINEE', 'PRICING', 'HSRP'].map((t, i) => (
          <div key={t} onClick={() => setStep(i+1)} 
            style={{ 
              padding:'10px 20px', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace: 'nowrap',
              color: step === i+1 ? 'var(--accent)' : 'var(--muted)', 
              borderBottom: step === i+1 ? '2px solid var(--accent)' : '2px solid transparent' 
            }}>
            {t}
          </div>
        ))}
      </div>

      {/* ── Step 1: Customer ── */}
      {step === 1 && (
        <div style={{ display:'flex', flexDirection:'column', gap: 12 }}>
          <Field label="Search Existing Customer (Optional)">
            <div style={{ position:'relative' }}>
              <input
                value={custSearch}
                onChange={e => {
                  setCustSearch(e.target.value);
                  // Clear linked customer if user changes search
                  if (f.customer_id) setF(p => ({ ...p, customer_id: '' }));
                }}
                onFocus={() => setCustFocus(true)}
                onBlur={() => setTimeout(() => setCustFocus(false), 180)}
                placeholder="Type name or mobile to search..."
                style={inpStyle}
              />
              {custFocus && custResults.length > 0 && (
                <div style={dropStyle}>
                  {custResults.map(cust => (
                    <div key={cust.id}
                      onMouseDown={() => {
                        setF(p => ({ ...p,
                          customer_id:      cust.id,
                          customer_name:    cust.name,
                          customer_mobile:  cust.mobile,
                          customer_address: cust.address || '',
                        }));
                        setCustSearch(`${cust.name} (${cust.mobile})`);
                        setCustFocus(false);
                      }}
                      style={dropItemStyle(false)}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ fontWeight:600, fontSize:12 }}>{cust.name}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{cust.mobile}{cust.address ? ` · ${cust.address}` : ''}</div>
                    </div>
                  ))}
                </div>
              )}
              {f.customer_id && (
                <div style={{ marginTop:6, fontSize:11, color:'var(--accent)' }}>
                  ✓ Linked to existing customer
                  <button onClick={() => { setF(p => ({ ...p, customer_id:'', customer_name:'', customer_mobile:'', customer_address:'' })); setCustSearch(''); }}
                    style={{ marginLeft:8, background:'transparent', border:'none', color:'var(--red)', cursor:'pointer', fontSize:10 }}>clear</button>
                </div>
              )}
            </div>
          </Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop: 4 }}>
            <Field label="Full Name *"><input value={f.customer_name} onChange={s('customer_name')} placeholder="Customer Name" style={inpStyle} /></Field>
            <Field label="C/O (Care Of)"><input value={f.care_of} onChange={s('care_of')} placeholder="Father/Husband Name" style={inpStyle} /></Field>
            <Field label="Mobile Number *"><input value={f.customer_mobile} onChange={s('customer_mobile')} placeholder="10-digit mobile" style={inpStyle} /></Field>
            <Field label="Address"><textarea value={f.customer_address} onChange={s('customer_address')} rows={2} placeholder="Full address" style={{...inpStyle, gridColumn: 'span 2' }} /></Field>
          </div>
        </div>
      )}
      
      {/* ── Step 2: Vehicle ── */}
      {step === 2 && (
        <div style={{ display:'flex', flexDirection:'column', gap: 12 }}>
          <Field label="Search Vehicle by Chassis No, Brand or Model *">
            <div style={{ position:'relative' }}>
              <input
                value={vehSearch}
                onChange={e => {
                  setVehSearch(e.target.value);
                  if (f.vehicle_id) setF(p => ({ ...p, vehicle_id:'', vehicle_brand:'', vehicle_model:'', vehicle_variant:'', vehicle_color:'', chassis_number:'', engine_number:'' }));
                }}
                onFocus={() => setVehFocus(true)}
                onBlur={() => setTimeout(() => setVehFocus(false), 180)}
                placeholder="Type chassis number, brand or model..."
                style={inpStyle}
              />
              {vehFocus && vehResults.length > 0 && (
                <div style={dropStyle}>
                  {vehResults.map(v => (
                    <div key={v.id}
                      onMouseDown={() => {
                        setF(p => ({ ...p,
                          vehicle_id:      v.id,
                          vehicle_brand:   v.brand,
                          vehicle_model:   v.model,
                          vehicle_variant: v.variant || '',
                          vehicle_color:   v.color || '',
                          chassis_number:  v.chassis_number || '',
                          engine_number:   v.engine_number || '',
                        }));
                        setVehSearch(v.chassis_number || `${v.brand} ${v.model}`);
                        setVehFocus(false);
                      }}
                      style={dropItemStyle(false)}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ fontWeight:600, fontSize:12 }}>{v.brand} {v.model} {v.variant ? `· ${v.variant}` : ''}</div>
                      <div style={{ fontSize:11, color:'var(--muted)', fontFamily:'IBM Plex Mono, monospace' }}>{v.chassis_number} {v.color ? `· ${v.color}` : ''}</div>
                    </div>
                  ))}
                </div>
              )}
              {vehSearch.length > 0 && vehResults.length === 0 && (
                <div style={{ marginTop:6, fontSize:11, color:'var(--muted)' }}>No in-stock vehicles found</div>
              )}
              {f.vehicle_id && (
                <div style={{ marginTop:6, fontSize:11, color:'var(--accent)' }}>
                  ✓ Vehicle selected
                  <button onClick={() => { setF(p => ({ ...p, vehicle_id:'', vehicle_brand:'', vehicle_model:'', vehicle_variant:'', vehicle_color:'', chassis_number:'', engine_number:'' })); setVehSearch(''); }}
                    style={{ marginLeft:8, background:'transparent', border:'none', color:'var(--red)', cursor:'pointer', fontSize:10 }}>clear</button>
                </div>
              )}
            </div>
          </Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop: 4 }}>
            <Field label="Brand"><input value={f.vehicle_brand} disabled style={{...inpStyle, opacity:0.6}} /></Field>
            <Field label="Model"><input value={f.vehicle_model} disabled style={{...inpStyle, opacity:0.6}} /></Field>
            <Field label="Variant"><input value={f.vehicle_variant} disabled style={{...inpStyle, opacity:0.6}} /></Field>
            <Field label="Colour"><input value={f.vehicle_color} disabled style={{...inpStyle, opacity:0.6}} /></Field>
            <Field label="Chassis No"><input value={f.chassis_number} disabled className="mono" style={{...inpStyle, opacity:0.6}} /></Field>
            <Field label="Engine No"><input value={f.engine_number} disabled className="mono" style={{...inpStyle, opacity:0.6}} /></Field>
          </div>
        </div>
      )}

      {/* ── Step 3: Insurance Nominee ── */}
      {step === 3 && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <Field label="Nominee Name"><input value={f.nominee_name} onChange={s('nominee_name')} placeholder="Full Name" style={inpStyle} /></Field>
          <Field label="Relation"><input value={f.nominee_relation} onChange={s('nominee_relation')} placeholder="Spouse, Son, Mother..." style={inpStyle} /></Field>
          <Field label="Age"><input type="number" value={f.nominee_age} onChange={s('nominee_age')} placeholder="e.g. 35" style={inpStyle} /></Field>
          <Field label="Number"><input value={f.nominee_number} onChange={s('nominee_number')} placeholder="Mobile Number" style={inpStyle} /></Field>
        </div>
      )}

      {/* ── Step 4: Pricing ── */}
      {step === 4 && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <Field label="Sale Date"><input type="date" value={f.sale_date} onChange={s('sale_date')} style={inpStyle} /></Field>
          <Field label="Sale Price (₹)"><input type="number" value={f.sale_price} onChange={s('sale_price')} placeholder="0" style={inpStyle} /></Field>
          <Field label="Payment Mode">
            <select value={f.payment_mode} onChange={s('payment_mode')} style={inpStyle}>
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="UPI">UPI</option>
              <option value="Finance">Finance</option>
              <option value="Cheque">Cheque</option>
            </select>
          </Field>
          <Field label="Financier / Bank"><input value={f.financier} onChange={s('financier')} placeholder="HDFC, Bajaj Finance..." style={inpStyle} /></Field>
          <Field label="Sold By"><input value={f.sold_by} onChange={s('sold_by')} placeholder="Salesperson Name" style={inpStyle} /></Field>
          <Field label="Notes"><textarea value={f.notes} onChange={s('notes')} rows={2} placeholder="Any additional details..." style={{...inpStyle, gridColumn: 'span 2' }} /></Field>
        </div>
      )}

      {/* ── Step 5: HSRP ── */}
      {step === 5 && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="Reg Number"><input value={f.vehicle_number} onChange={s('vehicle_number')} className="mono" placeholder="KA01HH1234" style={inpStyle} /></Field>
            <Field label="Number Plate Issued Date"><input type="date" value={f.hsrp_date} onChange={s('hsrp_date')} style={inpStyle} /></Field>
          </div>
          
          {/* NEW: HSRP Text Fields */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="HSRP Front (Code)"><input value={f.hsrp_front} onChange={s('hsrp_front')} placeholder="Front Laser Code" style={inpStyle} /></Field>
            <Field label="HSRP Back (Code)"><input value={f.hsrp_back} onChange={s('hsrp_back')} placeholder="Back Laser Code" style={inpStyle} /></Field>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop: '8px' }}>
            <FileUpload label="Upload HSRP Front Photo" onUploadSuccess={(fileId) => setF(p => ({ ...p, hsrp_front_id: fileId }))} />
            <FileUpload label="Upload HSRP Back Photo" onUploadSuccess={(fileId) => setF(p => ({ ...p, hsrp_back_id: fileId }))} />
          </div>

          {/* NEW: HSRP Notes */}
          <div style={{ marginTop: '8px' }}>
            <Field label="HSRP Notes"><textarea value={f.hsrp_notes} onChange={s('hsrp_notes')} rows={2} placeholder="Courier delays, missing rivets, specific customer requests..." style={{...inpStyle, width: '100%'}} /></Field>
          </div>
        </div>
      )}

      {/* ── Navigation Buttons ── */}
      <div style={{ display:'flex', justifyContent:'space-between', gap:8, marginTop: 16 }}>
        <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
        <div style={{ display:'flex', gap:8 }}>
          {step > 1 && <GhostBtn onClick={() => setStep(s => s - 1)}>← Back</GhostBtn>}
          {step < 5 
            ? <Btn onClick={() => setStep(s => s + 1)}>Next →</Btn>
            : <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Sale'}</Btn>
          }
        </div>
      </div>

    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────
export default function SalesPage() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editSale, setEditSale] = useState(null);
  const [selSale, setSelSale] = useState(null);
  const [search, setSearch]   = useState('');

  const { data:stats } = useQuery({
    queryKey:['sales-stats'],
    refetchInterval: 30_000,
    queryFn: () => salesApi.stats().then(r=>r.data),
  });

  const { data, isLoading, error } = useQuery({
    queryKey:['sales', search],
    queryFn: () => salesApi.list({ search: search||undefined, limit:1000 }).then(r=>r.data),
  });

const createMut = useMutation({
    mutationFn: async (d) => {
      let payload = { ...d };
      
      // Find existing customer by mobile, or create new one — prevents duplicates
      if (!payload.customer_id) {
        const existing = await customersApi.list({ search: payload.customer_mobile, limit: 1 }).then(r => r.data);
        const match = Array.isArray(existing) ? existing.find(c => c.mobile === payload.customer_mobile) : null;
        if (match) {
          payload.customer_id = match.id;
        } else {
          const custRes = await customersApi.create({
            name: payload.customer_name,
            mobile: payload.customer_mobile,
            address: payload.customer_address,
          });
          payload.customer_id = custRes.data.id;
        }
      }
      
      return salesApi.create(payload);
    },
    onSuccess: () => { 
      qc.invalidateQueries(['sales']); 
      qc.invalidateQueries(['sales-stats']); 
      qc.invalidateQueries(['customers']); // Instantly refresh the customer dropdown
      setShowAdd(false); 
      toast.success('Sale recorded'); 
    },
    onError: e => {
      // Unmasks the real error from the backend instead of just saying "Failed"
      const errorMsg = typeof e?.response?.data?.detail === 'string' 
        ? e.response.data.detail 
        : JSON.stringify(e?.response?.data) || e.message || 'Failed';
      toast.error(errorMsg);
    }
  });

  const updateMut = useMutation({
    mutationFn: ({id,d}) => salesApi.update(id,d),
    onSuccess: () => { 
      qc.invalidateQueries(['sales']); 
      qc.invalidateQueries(['sales-stats']); 
      setEditSale(null); 
      toast.success('Updated'); 
    },
    onError: e => {
      const errorMsg = typeof e?.response?.data?.detail === 'string' 
        ? e.response.data.detail 
        : JSON.stringify(e?.response?.data) || e.message || 'Failed';
      toast.error(errorMsg);
    }
  });

  const deleteMut = useMutation({
    mutationFn: id => salesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries(['sales']); qc.invalidateQueries(['sales-stats']); toast.success('Deleted'); },
    onError:   e => toast.error(errMsg(e, 'Cannot delete')),
  });

  const sales = Array.isArray(data) ? data : [];
  const { sorted: sortedSales, Th: SalesTh } = useSortable(sales, 'sale_date', 'desc');
  const st = stats || {};

  return (
    <div>
      {selSale && <InvoiceModal sale={selSale} onClose={()=>setSelSale(null)} />}

      {/* Edit Sale Modal */}
      {editSale && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setEditSale(null)}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:6, padding:24, width:'100%', maxWidth:800, maxHeight:'90vh', overflowY:'auto' }}
            onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:18 }}>Edit Sale Record</div>
            <SaleForm initial={editSale} onSave={d => updateMut.mutate({ id: editSale.id, d })} onCancel={() => setEditSale(null)} saving={updateMut.isPending} />
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ padding:'14px 20px', borderRight:'1px solid var(--border)' }}>
          <div className="label-xs">Total Revenue</div>
          <div className="display" style={{ fontSize:24, color:'var(--accent)', marginTop:6 }}>₹{st.total_revenue > 1000 ? (st.total_revenue/1000).toFixed(0)+'K' : (st.total_revenue||0)}</div>
        </div>
        <div style={{ padding:'14px 20px', borderRight:'1px solid var(--border)' }}>
          <div className="label-xs">Total Invoices</div>
          <div className="display" style={{ fontSize:24, color:'var(--text)', marginTop:6 }}>{st.total_count||0}</div>
        </div>
        <div style={{ padding:'14px 20px' }}>
          <div className="label-xs">Pending Delivery</div>
          <div className="display" style={{ fontSize:24, color:'var(--accent)', marginTop:6 }}>{st.pending_delivery||0}</div>
        </div>
      </div>

      {/* Add New Sale Form */}
      {showAdd && (
        <div style={{ margin:20, padding:20, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:4 }}>
          <div style={{ fontSize:12, fontWeight:600, marginBottom:16 }}>New Sale</div>
          <SaleForm onSave={d=>createMut.mutate(d)} onCancel={()=>setShowAdd(false)} saving={createMut.isPending} />
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 20px', borderBottom:'1px solid var(--border)' }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search invoices, customer, vehicle..." style={{ width:260 }} />
        <Btn style={{ marginLeft:'auto' }} onClick={()=>setShowAdd(v=>!v)}>+ New Sale</Btn>
      </div>

      {/* Data Table */}
      {error ? <div style={{ padding:20 }}><ApiError error={error}/></div>
        : isLoading ? <div style={{ padding:20, display:'flex', flexDirection:'column', gap:8 }}>{[1,2,3].map(i=><Skeleton key={i} h={44}/>)}</div>
        : sales.length===0 ? <Empty message="No sales found" />
        : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                {[['Invoice #','invoice_number'],['Date','sale_date'],['Customer','customer_name'],['Vehicle','vehicle_model'],['Amount','total_amount'],['Payment','payment_mode'],['Status','status'],['','']].map(([h,f])=>(
                  <SalesTh key={h} field={f||null} style={{ padding:'9px 16px', textAlign:'left', fontSize:9, letterSpacing:'.07em', color:'var(--dim)', fontWeight:500, textTransform:'uppercase' }}>{h}</SalesTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedSales.map(s => (
                <tr key={s.id} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td className="mono" style={{ padding:'12px 16px', fontSize:11, color:'var(--blue)' }}>{s.invoice_number}</td>
                  <td style={{ padding:'12px 16px', fontSize:11, color:'var(--muted)' }}>{s.sale_date?.slice(0,11)}</td>
                  <td style={{ padding:'12px 16px', fontSize:12, fontWeight:500 }}>{s.customer_name}</td>
                  <td style={{ padding:'12px 16px', fontSize:11, color:'var(--muted)' }}>{s.vehicle_brand} {s.vehicle_model}</td>
                  <td className="mono" style={{ padding:'12px 16px', fontSize:12, fontWeight:600, color:'var(--accent)' }}>₹{s.total_amount?.toLocaleString('en-IN')||0}</td>
                  <td style={{ padding:'12px 16px', fontSize:11 }}>{s.payment_mode}</td>
                  
                  {/* Status Badge */}
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ 
                      fontSize:9, padding:'3px 8px', borderRadius:2, fontWeight:500, 
                      color: s.status==='completed' || s.status==='delivered' ? '#4ade80' : '#f0c040', 
                      background: s.status==='completed' || s.status==='delivered' ? 'rgba(74,222,128,.1)' : 'rgba(240,192,64,.1)', 
                      border: s.status==='completed' || s.status==='delivered' ? '1px solid rgba(74,222,128,.25)' : '1px solid rgba(240,192,64,.25)' 
                    }}>
                      {s.status==='completed' || s.status==='delivered' ? 'Delivered' : 'Pending'}
                    </span>
                  </td>

                  <td style={{ padding:'10px 16px' }}>
                    <div style={{ display:'flex', gap:6, alignItems: 'center' }}>
                      <GhostBtn sm onClick={()=>setSelSale(s)}>View</GhostBtn>
                      <button onClick={() => {
                        const RS = 'Rs.';
                        const fmt = n => Number(n||0).toLocaleString('en-IN');
                        const total = s.total_amount || 0;

                        // Amount in words
                        const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
                        const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
                        function numToWords(n) {
                          n = Math.round(n);
                          if (n === 0) return 'Zero';
                          let w = '';
                          if (n >= 10000000) { w += numToWords(Math.floor(n/10000000)) + ' Crore '; n %= 10000000; }
                          if (n >= 100000)   { w += numToWords(Math.floor(n/100000))   + ' Lakh ';  n %= 100000; }
                          if (n >= 1000)     { w += numToWords(Math.floor(n/1000))     + ' Thousand '; n %= 1000; }
                          if (n >= 100)      { w += ones[Math.floor(n/100)] + ' Hundred '; n %= 100; }
                          if (n >= 20)       { w += tens[Math.floor(n/10)] + ' '; n %= 10; }
                          if (n > 0)         { w += ones[n] + ' '; }
                          return w.trim();
                        }
                        const amtWords = numToWords(total) + ' Rupees Only';

                        const exShowroom  = s.ex_showroom_price || total;
                        const rto         = s.rto         || 0;
                        const insurance   = s.insurance   || 0;
                        const accessories = s.accessories || 0;
                        const discount    = s.discount    || 0;

                        const descRow = `
                          <tr>
                            <td style="padding:10px 12px;border-bottom:1px solid #e8e0d0">
                              <div style="font-weight:700;font-size:12px">${s.vehicle_brand||''} ${s.vehicle_model||''}</div>
                              ${s.vehicle_color ? `<div style="font-size:10px;color:#888;margin-top:2px">· ${s.vehicle_color}</div>` : ''}
                            </td>
                            <td style="padding:10px 12px;border-bottom:1px solid #e8e0d0;font-size:11px;font-family:monospace">${s.chassis_number||'—'}</td>
                            <td style="padding:10px 12px;border-bottom:1px solid #e8e0d0;font-size:11px">${s.payment_mode||'Cash'}</td>
                            <td style="padding:10px 12px;border-bottom:1px solid #e8e0d0;font-size:11px">${s.payment_type||'Full Payment'}</td>
                            <td style="padding:10px 12px;border-bottom:1px solid #e8e0d0;text-align:right;font-weight:700;color:#B8860B;font-size:13px">${RS}${fmt(exShowroom)}</td>
                          </tr>`;

                        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Invoice — ${s.invoice_number}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1a1a1a;background:#fff}
  .page{max-width:794px;margin:0 auto;padding:28px 32px}
  /* Header */
  .hdr{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #B8860B;padding-bottom:14px;margin-bottom:18px}
  .hdr-left{display:flex;align-items:center;gap:14px}
  .logo-box{width:56px;height:56px;border:2px solid #B8860B;border-radius:4px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:#fff;overflow:hidden;padding:4px}
  .co-name{font-size:24px;font-weight:900;color:#1a1a1a;letter-spacing:-.3px;line-height:1}
  .co-sub{font-size:9px;color:#888;letter-spacing:.12em;text-transform:uppercase;margin-top:4px}
  .hdr-right{text-align:right}
  .inv-label{font-size:9px;font-weight:700;letter-spacing:.15em;color:#B8860B;text-transform:uppercase}
  .inv-num{font-size:26px;font-weight:900;color:#1a1a1a;letter-spacing:-.5px;margin-top:2px}
  .inv-date{font-size:10px;color:#888;margin-top:3px}
  /* Section label */
  .sec-label{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#B8860B;border-bottom:1.5px solid #B8860B;padding-bottom:4px;margin-bottom:10px}
  /* Grid */
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:18px}
  .info-row{display:flex;padding:4px 0;font-size:11px}
  .info-key{color:#888;width:80px;flex-shrink:0;font-size:10px}
  .info-val{font-weight:600;color:#1a1a1a}
  /* Items table */
  .tbl{width:100%;border-collapse:collapse;margin-bottom:0}
  .tbl thead tr{background:#1a1a1a}
  .tbl thead th{padding:8px 12px;font-size:9px;font-weight:700;color:#fff;text-align:left;letter-spacing:.08em;text-transform:uppercase}
  .tbl tfoot tr{background:#f5f0e8}
  .tbl tfoot td{padding:10px 12px;font-size:13px;font-weight:800}
  .words-row td{padding:6px 12px;font-size:10px;font-style:italic;color:#888;border-bottom:1px solid #e8e0d0}
  /* Signatures */
  .sig-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin:20px 0 16px;padding-top:16px;border-top:1px solid #e0d8cc}
  .sig-line{border-top:1px solid #555;padding-top:6px;font-size:10px;color:#555}
  .sig-name{font-size:12px;font-weight:800;margin-top:4px;text-transform:uppercase}
  /* Service schedule */
  .svc-box{background:#f5f0e8;border:1px solid #e0d4b8;border-radius:4px;margin-top:18px;overflow:hidden}
  .svc-hdr{background:#2a2a2a;color:#fff;padding:10px 16px;font-size:11px;font-weight:700;letter-spacing:.05em}
  .svc-intro{padding:10px 16px;font-size:10px;color:#555;border-bottom:1px solid #e0d4b8}
  .svc-tbl{width:100%;border-collapse:collapse}
  .svc-tbl thead tr{background:#3a3a3a}
  .svc-tbl thead th{padding:8px 16px;font-size:9px;font-weight:700;color:#B8860B;text-transform:uppercase;letter-spacing:.08em;text-align:left}
  .svc-tbl tbody tr{border-bottom:1px solid #e8e0d0}
  .svc-tbl tbody td{padding:9px 16px;font-size:11px}
  .svc-date{color:#888;font-family:monospace}
  .svc-type{font-weight:700;color:#B8860B}
  /* Trust footer */
  .trust-bar{display:flex;justify-content:space-around;padding:8px 16px;background:#f9f6f0;border-top:1px solid #e0d4b8;font-size:9px;color:#888;letter-spacing:.04em}
  .thank-box{text-align:center;padding:14px 16px 16px;border-top:1px solid #e0d4b8}
  .thank-title{font-size:16px;font-weight:800;color:#1a1a1a;margin-bottom:4px}
  .thank-sub{font-size:10px;color:#888;font-style:italic;margin-bottom:6px}
  .thank-tags{font-size:9px;color:#aaa;letter-spacing:.04em}
  /* Page footer */
  .page-footer{margin-top:18px;padding-top:10px;border-top:1px solid #e0d8cc;display:flex;justify-content:space-between;font-size:9px;color:#bbb}
  @media print{body{background:#fff}.page{padding:16px}}
</style></head><body>
<div class="page">

  <!-- HEADER -->
  <div class="hdr">
    <div class="hdr-left">
      <div class="logo-box"><img src="data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAa4CRADASIAAhEBAxEB/8QAHAABAAIDAQEBAAAAAAAAAAAAAAEGAgUHBAMI/8QASRABAAEDAwEFBAcGAwYGAQQDAAECAwQFBhEhBxIxUWETNUFzIjI0NrGy0RQVQkRxciMmUiQ3Q2KBkSUzU2N0oqGSweHwFheC/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAEC/8QAGhEBAQEBAQEBAAAAAAAAAAAAAAExEUEhUf/aAAwDAQACEQMRAD8A/GQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/9k=" style="width:100%;height:100%;object-fit:contain;filter:invert(1) sepia(1) saturate(3) hue-rotate(5deg) brightness(0.7)" /></div>
      <div>
        <div class="co-name">MM MOTORS</div>
        <div class="co-sub">Multi-Brand Dealership &middot; Malur</div>
      </div>
    </div>
    <div class="hdr-right">
      <div class="inv-label">Sale &nbsp; Invoice</div>
      <div class="inv-num">${s.invoice_number}</div>
      <div class="inv-date">Date: ${s.sale_date || new Date().toLocaleDateString('en-IN')}</div>
    </div>
  </div>

  <!-- CUSTOMER + VEHICLE -->
  <div class="grid2">
    <div>
      <div class="sec-label">Customer Details</div>
      <div class="info-row"><span class="info-key">Name</span><span class="info-val">${s.customer_name||'—'}</span></div>
      ${s.customer_care_of||s.care_of ? `<div class="info-row"><span class="info-key">C/O</span><span class="info-val">${s.customer_care_of||s.care_of}</span></div>` : ''}
      <div class="info-row"><span class="info-key">Mobile</span><span class="info-val">${s.customer_mobile||'—'}</span></div>
      <div class="info-row"><span class="info-key">Address</span><span class="info-val" style="line-height:1.5">${s.customer_address||'—'}</span></div>
      <div class="info-row"><span class="info-key">Payment</span><span class="info-val">${s.payment_mode||'Cash'}</span></div>
    </div>
    <div>
      <div class="sec-label">Vehicle Details</div>
      <div class="info-row"><span class="info-key">Brand</span><span class="info-val">${s.vehicle_brand||'—'}</span></div>
      <div class="info-row"><span class="info-key">Model</span><span class="info-val">${s.vehicle_model||'—'}</span></div>
      <div class="info-row"><span class="info-key">Variant</span><span class="info-val">${s.vehicle_variant||'—'}</span></div>
      <div class="info-row"><span class="info-key">Colour</span><span class="info-val">${s.vehicle_color||'—'}</span></div>
      <div class="info-row"><span class="info-key">Financier</span><span class="info-val">${s.financier||'—'}</span></div>
    </div>
  </div>

  <!-- CHASSIS + NOMINEE -->
  <div class="grid2">
    <div>
      <div class="sec-label">Registration / Chassis</div>
      <div class="info-row"><span class="info-key">Vehicle No.</span><span class="info-val" style="font-family:monospace">${s.vehicle_number||'—'}</span></div>
      <div class="info-row"><span class="info-key">RTO</span><span class="info-val">${s.rto ? 'Rs.'+fmt(s.rto) : '—'}</span></div>
      <div class="info-row"><span class="info-key">Chassis No.</span><span class="info-val" style="font-family:monospace;font-size:10px">${s.chassis_number||'—'}</span></div>
      <div class="info-row"><span class="info-key">Engine No.</span><span class="info-val" style="font-family:monospace;font-size:10px">${s.engine_number||'—'}</span></div>
    </div>
    <div>
      <div class="sec-label">Nominee (Insurance)</div>
      <div class="info-row"><span class="info-key">Name</span><span class="info-val">${s.nominee?.name||'—'}</span></div>
      <div class="info-row"><span class="info-key">Relation</span><span class="info-val">${s.nominee?.relation||'—'}</span></div>
      <div class="info-row"><span class="info-key">Age</span><span class="info-val">${s.nominee?.age||'—'}</span></div>
      <div class="info-row"><span class="info-key">Mobile</span><span class="info-val">${s.nominee?.number||'—'}</span></div>
    </div>
  </div>

  <!-- ITEMS TABLE -->
  <table class="tbl">
    <thead>
      <tr>
        <th>Description</th>
        <th>Chassis / Details</th>
        <th>Payment</th>
        <th>Mode</th>
        <th style="text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>${descRow}</tbody>
    <tbody>
      <tr class="words-row"><td colspan="5"><em>${amtWords}</em></td></tr>
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3" style="font-style:italic;font-size:10px;color:#888;font-weight:400"></td>
        <td style="color:#888;font-size:11px;font-weight:600">TOTAL AMOUNT</td>
        <td style="text-align:right;color:#B8860B;font-size:16px">${RS}${fmt(total)}</td>
      </tr>
    </tfoot>
  </table>

  <!-- SIGNATURES -->
  <div class="sig-row">
    <div>
      <div class="sig-line">Customer's Signature</div>
      <div class="sig-name">${s.customer_name||''}</div>
    </div>
    <div style="text-align:center">
      <div class="sig-line" style="border-top-color:transparent"></div>
      <div style="font-size:10px;color:#888;margin-top:4px">Sold by:</div>
    </div>
    <div style="text-align:right">
      <div class="sig-line" style="border-top-color:#555">Authorised Signatory</div>
      <div class="sig-name">MM MOTORS</div>
    </div>
  </div>

  <!-- SERVICE SCHEDULE -->
  <div class="svc-box">
    <div class="svc-hdr">SERVICE SCHEDULE</div>
    <div class="svc-intro">
      <strong>DEAR VALUED CUSTOMER,</strong><br/>
      We thank you for choosing our world-class vehicle. To ensure optimal performance and longevity,
      please follow the service schedule below for a pleasant riding experience at all times.
    </div>
    <table class="svc-tbl">
      <thead>
        <tr><th>Service Date</th><th>Service Type</th><th>Recommended Schedule</th></tr>
      </thead>
      <tbody>
        <tr><td class="svc-date">__/__/____</td><td class="svc-type">FIRST SERVICE</td><td>500–700 kms or 15–30 days</td></tr>
        <tr><td class="svc-date">__/__/____</td><td class="svc-type">SECOND SERVICE</td><td>3000–3500 kms or 30–90 days</td></tr>
        <tr><td class="svc-date">__/__/____</td><td class="svc-type">THIRD SERVICE</td><td>6000–6500 kms or 90–180 days</td></tr>
        <tr><td class="svc-date">__/__/____</td><td class="svc-type">FOURTH SERVICE</td><td>9000–9500 kms or 180–270 days</td></tr>
      </tbody>
    </table>
    <div class="trust-bar">
      <span>* Trusted Dealer</span><span>* 24/7 Service Support</span><span>* Quality Guaranteed</span>
    </div>
    <div class="thank-box">
      <div class="thank-title">Thank You for Choosing M M Motors!</div>
      <div class="thank-sub">Your trust drives our excellence in two-wheeler sales and service.</div>
      <div class="thank-tags">* Premium Quality &nbsp;&nbsp; * Expert Service &nbsp;&nbsp; * Customer First</div>
    </div>
  </div>

  <!-- PAGE FOOTER -->
  <div class="page-footer">
    <span>This is a computer-generated document. No signature required if digitally authenticated.</span>
    <span>MM Motors &middot; Malur &middot; Multi-brand Dealership</span>
  </div>

</div>
<script>window.onload=()=>window.print()</script>
</body></html>`;
                        const w = window.open('', '_blank');
                        w.document.write(html);
                        w.document.close();
                      }} style={{ padding:'5px 10px', background:'rgba(184,134,11,.1)', border:'1px solid rgba(184,134,11,.3)', borderRadius:3, color:'#7A5800', cursor:'pointer', fontSize:10, fontFamily:'IBM Plex Sans,sans-serif' }}>PDF</button>
                      <GhostBtn sm onClick={()=>setEditSale(s)}>Edit</GhostBtn>
                      
                      {s.status !== 'completed' && s.status !== 'delivered' && (
                        <button 
                          onClick={async () => {
                            if (await confirm("Mark this invoice as delivered?")) {
                              updateMut.mutate({ id: s.id, d: { status: 'delivered' } });
                            }
                          }}
                          style={{ padding:'5px 10px', background:'rgba(59,130,246,.1)', border:'1px solid rgba(59,130,246,.3)', borderRadius:3, color:'#3b82f6', cursor:'pointer', fontSize:10, fontFamily:'IBM Plex Sans,sans-serif' }}
                        >
                          ✓ Deliver
                        </button>
                      )}
                      
                      <button onClick={()=>sendWA(s.customer_mobile, `Dear ${s.customer_name}, congratulations on your new ${s.vehicle_brand} ${s.vehicle_model}! Your total invoice amount is ₹${s.total_amount?.toLocaleString('en-IN')}. Thank you for choosing MM Motors!`)} style={{ padding:'5px 10px', background:'rgba(37,211,102,.1)', border:'1px solid rgba(37,211,102,.3)', borderRadius:3, color:'#16a34a', cursor:'pointer', fontSize:10, fontFamily:'IBM Plex Sans,sans-serif' }}>WhatsApp</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </div>
  );
}
