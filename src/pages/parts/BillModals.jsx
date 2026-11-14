import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { partsApi, errMsg } from '../../api/client';
import { Btn, GhostBtn, Field } from '../../components/ui';
import toast from 'react-hot-toast';
import { printPartsBill } from './printPartsBill';

// ── View Bill Modal ──────────────────────────────────────────────────
export function ViewBillModal({ bill, onClose, onEdit }) {
  const items    = bill.items    || [];
  const grand    = bill.grand_total || 0;
  const subtotal = bill.subtotal    || 0;
  const gstTotal = bill.gst_total   || 0;
  const cgst     = Math.round(gstTotal / 2 * 100) / 100;
  const sgst     = Math.round((gstTotal - cgst) * 100) / 100;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={onClose}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, width:740, maxWidth:'96vw', maxHeight:'90vh', display:'flex', flexDirection:'column' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="record-head" style={{ alignItems:'center', borderRadius:'var(--radius-card) var(--radius-card) 0 0' }}>
          <div>
            <div className="record-id" style={{ marginTop:0 }}>Parts Invoice</div>
            <h2 className="record-title mono">{bill.bill_number}</h2>
            <div className="record-id">{bill.bill_date || bill.created_at?.slice(0,10)}</div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button onClick={() => printPartsBill(bill)}
              style={{ padding:'7px 14px', background:'rgba(184,134,11,.15)', border:'1px solid rgba(184,134,11,.4)', borderRadius:4, color:'var(--color-accent-text)', fontSize:11, cursor:'pointer', fontWeight:600 }}>
              Print
            </button>
            {onEdit && (
              <button onClick={onEdit}
                style={{ padding:'7px 14px', background:'rgba(59,130,246,.1)', border:'1px solid rgba(59,130,246,.35)', borderRadius:4, color:'var(--blue)', fontSize:11, cursor:'pointer', fontWeight:600 }}>
                Edit
              </button>
            )}
            <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--color-muted)', fontSize:22, cursor:'pointer', padding:'0 4px', lineHeight:1 }}>×</button>
          </div>
        </div>

        <div style={{ overflowY:'auto', flex:1, padding:20 }}>
          {/* Customer + Payment */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:18 }}>
            <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:4, padding:'12px 16px' }}>
              <div style={{ fontSize:9, color:'var(--color-accent-text)', fontWeight:700, marginBottom:8 }}>Customer</div>
              {[['Name', bill.customer_name], ['Mobile', bill.customer_mobile], ['Vehicle', bill.customer_vehicle]].map(([k, v]) =>
                v ? (
                  <div key={k} style={{ display:'flex', gap:8, fontSize:11, marginBottom:4 }}>
                    <span style={{ color:'var(--muted)', width:60, flexShrink:0 }}>{k}</span>
                    <span style={{ fontWeight:600 }}>{v}</span>
                  </div>
                ) : null
              )}
            </div>
            <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:4, padding:'12px 16px' }}>
              <div style={{ fontSize:9, color:'var(--color-accent-text)', fontWeight:700, marginBottom:8 }}>Payment</div>
              <div style={{ fontSize:16, fontWeight:800 }}>{bill.payment_mode || 'Cash'}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>Sold by: {bill.sold_by || 'MM Motors'}</div>
            </div>
          </div>

          {/* Items table */}
          <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:16 }}>
            <thead>
              <tr style={{ background:'var(--surface2)', borderBottom:'1px solid var(--border)' }}>
                {[['Description','left'],['Part No.','left'],['HSN','center'],['Qty','center'],['Unit Price','center'],['GST%','center'],['Amount','right']].map(([h,a]) => (
                  <th key={h} style={{ padding:'8px 10px', fontSize:9, fontWeight:600, color:'var(--muted)', textAlign:a }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} style={{ borderBottom:'1px solid var(--border)', background: i%2===0?'transparent':'var(--surface2)' }}>
                  <td style={{ padding:'9px 10px', fontSize:11, fontWeight:500 }}>{item.description || item.name}</td>
                  <td className="mono" style={{ padding:'9px 10px', fontSize:10, color:'var(--blue)' }}>{item.part_number || '—'}</td>
                  <td className="mono" style={{ padding:'9px 10px', fontSize:10, color:'var(--muted)', textAlign:'center' }}>{item.hsn_code || '—'}</td>
                  <td style={{ padding:'9px 10px', textAlign:'center', fontSize:13, fontWeight:700 }}>{item.qty}</td>
                  <td style={{ padding:'9px 10px', textAlign:'center', fontSize:11 }}>₹{(item.unit_price || 0).toLocaleString('en-IN')}</td>
                  <td style={{ padding:'9px 10px', textAlign:'center', fontSize:11, color:'var(--muted)' }}>{item.gst_rate || 18}%</td>
                  <td style={{ padding:'9px 10px', textAlign:'right', fontSize:12, fontWeight:700, color:'var(--accent)' }}>₹{Math.round(item.total || (item.unit_price || 0) * item.qty).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            <div style={{ width:250 }}>
              {[['Taxable', Math.round(subtotal)], ['CGST', Math.round(cgst)], ['SGST', Math.round(sgst)]].map(([k,v]) => (
                <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border)', fontSize:11 }}>
                  <span style={{ color:'var(--muted)' }}>{k}</span>
                  <span className="mono" style={{ fontWeight:600 }}>₹{v.toLocaleString('en-IN')}</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:4, marginTop:8 }}>
                <span style={{ fontSize:11, fontWeight:700, color:'var(--muted)' }}>Total</span>
                <span className="display" style={{ fontSize:20, color:'var(--accent)' }}>₹{Math.round(grand).toLocaleString('en-IN')}</span>
              </div>
              {bill.amount_in_words && (
                <div style={{ fontSize:10, color:'var(--muted)', fontStyle:'italic', marginTop:6, textAlign:'right' }}>{bill.amount_in_words}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Edit Bill Modal ──────────────────────────────────────────────────
export function EditBillModal({ bill, onClose, onSaved }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    customer_name:    bill.customer_name    || '',
    customer_mobile:  bill.customer_mobile  || '',
    customer_vehicle: bill.customer_vehicle || '',
    payment_mode:     bill.payment_mode     || 'Cash',
  });
  const [saving, setSaving] = useState(false);

  const s = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await partsApi.updateBill(bill.id, form);
      qc.invalidateQueries(['parts-bills-list']);
      toast.success('Bill updated');
      onSaved();
    } catch (e) {
      toast.error(errMsg(e, 'Update failed'));
    } finally {
      setSaving(false);
    }
  };

  const inp = { width:'100%' };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={onClose}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, width:480, maxWidth:'96vw' }}
        onClick={e => e.stopPropagation()}>

        <div className="record-head" style={{ alignItems:'center', borderRadius:'var(--radius-card) var(--radius-card) 0 0' }}>
          <div>
            <h2 className="record-title">Edit Bill</h2>
            <div className="record-id mono">{bill.bill_number}</div>
          </div>
          <button type="button" className="record-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:12 }}>
          <Field label="Customer Name"><input value={form.customer_name}    onChange={s('customer_name')}    placeholder="Customer name"   style={inp} /></Field>
          <Field label="Mobile">       <input value={form.customer_mobile}  onChange={s('customer_mobile')}  placeholder="Mobile number"   style={inp} /></Field>
          <Field label="Vehicle">      <input value={form.customer_vehicle} onChange={s('customer_vehicle')} placeholder="KA 01 AB 1234"  style={inp} /></Field>
          <Field label="Payment Mode">
            <select value={form.payment_mode} onChange={s('payment_mode')} style={inp}>
              {['Cash','UPI','Card','Bank Transfer','Credit'].map(m => <option key={m}>{m}</option>)}
            </select>
          </Field>
        </div>

        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'12px 20px', borderTop:'1px solid var(--border)' }}>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <Btn disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save changes'}</Btn>
        </div>
      </div>
    </div>
  );
}
