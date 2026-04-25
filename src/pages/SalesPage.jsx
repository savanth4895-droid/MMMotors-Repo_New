import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { salesApi, customersApi, vehiclesApi, errMsg} from '../api/client';
import { Btn, GhostBtn, Field, Skeleton, Empty, ApiError } from '../components/ui';
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
                {['Invoice #','Date','Customer','Vehicle','Amount','Payment','Status',''].map(h=>(
                  <th key={h} style={{ padding:'9px 16px', textAlign:'left', fontSize:9, letterSpacing:'.07em', color:'var(--dim)', fontWeight:500, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sales.map(s => (
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
                        const base = import.meta.env.VITE_API_URL || 'http://localhost:8000';
                        window.open(`${base}/api/sales/${s.id}/pdf`, '_blank');
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
