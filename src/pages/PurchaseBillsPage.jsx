import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchaseBillsApi, vendorsApi, partsApi, errMsg } from '../api/client';
import { Btn, GhostBtn, Field, Skeleton, Empty, ApiError } from '../components/ui';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';

// Rate change threshold — deltas below this % are not flagged
const RATE_CHANGE_THRESHOLD_PCT = 1;   // >1% change triggers sale-price prompt

// ── Line calc helper (mirrors backend _pb_compute_line) ─────────────
function computeLine(row) {
  const qty  = parseFloat(row.qty) || 0;
  const rate = parseFloat(row.rate) || 0;
  const disc = parseFloat(row.discount_pct) || 0;
  const gst  = parseFloat(row.gst_pct) || 0;
  const gross = qty * rate;
  const discount = gross * (disc / 100);
  const taxable  = Math.round((gross - discount) * 100) / 100;
  const gstTot   = Math.round(taxable * (gst / 100) * 100) / 100;
  const cgst     = Math.round((gstTot / 2) * 100) / 100;
  const sgst     = Math.round((gstTot - cgst) * 100) / 100;
  const total    = Math.round((taxable + cgst + sgst) * 100) / 100;
  return { taxable_amt: taxable, cgst, sgst, line_total: total };
}

// ── Part autocomplete cell ─────────────────────────────────────────
function PartAutocomplete({ row, vendorId, onPick, onCreateNew }) {
  const [q, setQ]         = useState(row.part_name || '');
  const [open, setOpen]   = useState(false);
  const [items, setItems] = useState([]);
  const boxRef            = useRef(null);

  useEffect(() => { setQ(row.part_name || ''); }, [row.part_name]);

  // Debounced search
  useEffect(() => {
    if (!q || q.length < 2 || row.part_id) { setItems([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await partsApi.searchAlias({ q, vendor_id: vendorId || undefined, limit: 8 });
        setItems(r.data || []);
        setOpen(true);
      } catch { setItems([]); }
    }, 200);
    return () => clearTimeout(t);
  }, [q, vendorId, row.part_id]);

  // Click-outside handling
  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={boxRef} style={{ position:'relative' }}>
      <input
        value={q}
        onChange={e => { setQ(e.target.value); onPick({ ...row, part_id: null, part_name: e.target.value }); }}
        onFocus={() => q.length >= 2 && setOpen(true)}
        placeholder="Type to search..."
        style={{
          width:'100%', padding:'6px 8px', fontSize:11,
          background: row.part_id ? 'rgba(74,222,128,.08)' : 'var(--surface2)',
          border: `1px solid ${row.part_id ? '#4ade80' : 'var(--border)'}`,
          borderRadius:3, color:'var(--text)',
        }}
      />
      {open && (items.length > 0 || q.length >= 2) && (
        <div style={{
          position:'absolute', top:'100%', left:0, right:0, marginTop:2, zIndex:20,
          background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4,
          maxHeight:260, overflowY:'auto', boxShadow:'0 4px 16px rgba(0,0,0,.3)',
        }}>
          {items.map(p => {
            // Was this a vendor-alias hit?
            const aliasHit = (p.aliases || []).find(a =>
              a.vendor_id === vendorId &&
              (a.part_number?.toLowerCase().includes(q.toLowerCase()) ||
               a.part_name?.toLowerCase().includes(q.toLowerCase()))
            );
            return (
              <div key={p.id}
                onClick={() => {
                  onPick({
                    ...row,
                    part_id:      p.id,
                    part_name:    p.name,
                    part_number:  aliasHit?.part_number || p.part_number || '',
                    hsn:          p.hsn_code || row.hsn,
                    gst_pct:      p.gst_rate ?? row.gst_pct,
                    unit:         row.unit || 'PCS',
                    _existing_rate:    p.last_purchase_rate || p.purchase_price,
                    _existing_selling: p.selling_price,
                    _stock:            p.stock,
                  });
                  setQ(p.name); setOpen(false);
                }}
                style={{ padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid var(--border)', fontSize:11 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontWeight:600, color:'var(--text)' }}>{p.name}</div>
                  <div style={{ fontSize:9, color:'var(--dim)' }}>Stock: {p.stock ?? 0}</div>
                </div>
                <div style={{ display:'flex', gap:10, fontSize:10, color:'var(--muted)', marginTop:2 }}>
                  <span className="mono">{p.part_number}</span>
                  {aliasHit && <span style={{ color:'#4ade80' }}>↳ {aliasHit.part_name || aliasHit.part_number}</span>}
                  {p.last_purchase_rate && <span>Last: ₹{p.last_purchase_rate}</span>}
                </div>
              </div>
            );
          })}
          {q.length >= 2 && (
            <div
              onClick={() => { onCreateNew(q); setOpen(false); }}
              style={{ padding:'10px 12px', cursor:'pointer', background:'var(--surface2)', fontSize:11, color:'var(--accent)', fontWeight:600 }}
            >
              + Create new part "{q}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Rate-change confirm modal ─────────────────────────────────────
function RateChangeModal({ changes, onCancel, onConfirm }) {
  const [prices, setPrices] = useState(() =>
    changes.reduce((acc, c) => ({ ...acc, [c.rowKey]: c.suggested_sale_price }), {})
  );
  const [applyFlags, setApplyFlags] = useState(() =>
    changes.reduce((acc, c) => ({ ...acc, [c.rowKey]: true }), {})
  );

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:24, minWidth:640, maxWidth:800, maxHeight:'85vh', overflowY:'auto' }}>
        <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>Rate change detected</div>
        <div style={{ fontSize:11, color:'var(--muted)', marginBottom:16 }}>
          {changes.length} part{changes.length>1?'s':''} came in at a different rate. Update sale prices too?
        </div>

        <table style={{ width:'100%', fontSize:11, borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ color:'var(--muted)', fontSize:10, textTransform:'uppercase', letterSpacing:'.05em', borderBottom:'1px solid var(--border)' }}>
              <th style={{ padding:'8px 6px', textAlign:'left', fontWeight:500 }}>Apply</th>
              <th style={{ padding:'8px 6px', textAlign:'left', fontWeight:500 }}>Part</th>
              <th style={{ padding:'8px 6px', textAlign:'right', fontWeight:500 }}>Old cost</th>
              <th style={{ padding:'8px 6px', textAlign:'right', fontWeight:500 }}>New cost</th>
              <th style={{ padding:'8px 6px', textAlign:'right', fontWeight:500 }}>Old sale</th>
              <th style={{ padding:'8px 6px', textAlign:'right', fontWeight:500 }}>New sale</th>
              <th style={{ padding:'8px 6px', textAlign:'right', fontWeight:500 }}>Margin</th>
            </tr>
          </thead>
          <tbody>
            {changes.map(c => {
              const newSale = parseFloat(prices[c.rowKey]) || 0;
              const marginPct = c.new_cost > 0 ? ((newSale - c.new_cost) / c.new_cost * 100).toFixed(1) : '—';
              const delta = c.new_cost - c.old_cost;
              const deltaPct = c.old_cost > 0 ? (delta / c.old_cost * 100).toFixed(1) : '';
              return (
                <tr key={c.rowKey} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={{ padding:'8px 6px' }}>
                    <input type="checkbox" checked={!!applyFlags[c.rowKey]}
                      onChange={e => setApplyFlags(p => ({...p, [c.rowKey]: e.target.checked}))} />
                  </td>
                  <td style={{ padding:'8px 6px', fontWeight:600 }}>{c.part_name}</td>
                  <td style={{ padding:'8px 6px', textAlign:'right' }} className="mono">₹{c.old_cost.toFixed(2)}</td>
                  <td style={{ padding:'8px 6px', textAlign:'right', color: delta > 0 ? '#ef4444' : '#4ade80', fontWeight:600 }} className="mono">
                    ₹{c.new_cost.toFixed(2)}
                    <div style={{ fontSize:9, fontWeight:400 }}>({delta > 0 ? '+' : ''}{deltaPct}%)</div>
                  </td>
                  <td style={{ padding:'8px 6px', textAlign:'right', color:'var(--muted)' }} className="mono">₹{c.old_sale_price.toFixed(2)}</td>
                  <td style={{ padding:'8px 6px', textAlign:'right' }}>
                    <input
                      type="number" step="0.01" min="0"
                      disabled={!applyFlags[c.rowKey]}
                      value={prices[c.rowKey]}
                      onChange={e => setPrices(p => ({...p, [c.rowKey]: e.target.value}))}
                      style={{ width:80, padding:'4px 6px', textAlign:'right', fontSize:11,
                               background: applyFlags[c.rowKey] ? 'var(--surface2)' : 'transparent',
                               border:'1px solid var(--border)', borderRadius:3 }}
                    />
                  </td>
                  <td style={{ padding:'8px 6px', textAlign:'right', color: marginPct < 10 ? '#ef4444' : '#4ade80' }} className="mono">
                    {marginPct}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:20 }}>
          <GhostBtn onClick={() => onConfirm({})}>Skip — don't update sale prices</GhostBtn>
          <Btn onClick={() => {
            const out = {};
            changes.forEach(c => {
              if (applyFlags[c.rowKey]) out[c.rowKey] = parseFloat(prices[c.rowKey]) || 0;
            });
            onConfirm(out);
          }}>Save bill with these sale prices</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Blank row helper ────────────────────────────────────────────────
const makeBlankRow = () => ({
  _key: Math.random().toString(36).slice(2),
  part_id: null,
  part_name: '',
  part_number: '',
  hsn: '',
  qty: '',
  unit: 'PCS',
  rate: '',
  discount_pct: 0,
  gst_pct: 18,
});

// ── Create/edit bill form ───────────────────────────────────────────
function BillForm({ initial, vendors, onSave, onCancel, saving, canEdit }) {
  const [vendorId, setVendorId] = useState(initial?.vendor_id || '');
  const [billNumber, setBillNumber] = useState(initial?.bill_number || '');
  const [billDate, setBillDate]     = useState(initial?.bill_date || new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }).replace(/ /g, ' '));
  const [placeOfSupply, setPlace]   = useState(initial?.place_of_supply || 'Karnataka');
  const [roundOff, setRoundOff]     = useState(initial?.round_off ?? 0);
  const [notes, setNotes]           = useState(initial?.notes || '');
  const [rows, setRows] = useState(() => {
    if (initial?.items?.length) return initial.items.map(it => ({ ...it, _key: Math.random().toString(36).slice(2) }));
    return [makeBlankRow()];
  });
  const [pendingChanges, setPendingChanges] = useState(null);

  const updateRow = (key, patch) => setRows(rs => rs.map(r => r._key === key ? { ...r, ...patch } : r));
  const removeRow = (key) => setRows(rs => rs.length === 1 ? rs : rs.filter(r => r._key !== key));
  const addRow = () => setRows(rs => [...rs, makeBlankRow()]);

  // Recompute totals live
  const totals = useMemo(() => {
    let sub = 0, cg = 0, sg = 0;
    rows.forEach(r => {
      const c = computeLine(r);
      sub += c.taxable_amt; cg += c.cgst; sg += c.sgst;
    });
    const roundOffN = parseFloat(roundOff) || 0;
    return {
      subtotal: Math.round(sub * 100) / 100,
      cgst:     Math.round(cg * 100) / 100,
      sgst:     Math.round(sg * 100) / 100,
      grand:    Math.round((sub + cg + sg + roundOffN) * 100) / 100,
    };
  }, [rows, roundOff]);

  // Auto-add blank row when last row's part is picked
  useEffect(() => {
    const last = rows[rows.length - 1];
    if (last && (last.part_id || last.part_name) && last.qty && rows.every(r => r._key !== 'ph')) {
      // No auto-add — user hits + New line button. Keeps intent explicit.
    }
  }, [rows]);

  // ── Submit flow: detect rate changes → maybe show modal → final POST ──
  const doSubmit = (salePrices = {}) => {
    const payload = {
      vendor_id: vendorId,
      bill_number: billNumber.trim(),
      bill_date: billDate,
      place_of_supply: placeOfSupply,
      round_off: parseFloat(roundOff) || 0,
      notes,
      items: rows.map(r => {
        const isChangedRow = salePrices[r._key] !== undefined;
        return {
          part_id:      r.part_id,
          part_name:    r.part_name,
          part_number:  r.part_number,
          hsn:          r.hsn,
          qty:          parseFloat(r.qty) || 0,
          unit:         r.unit,
          rate:         parseFloat(r.rate) || 0,
          discount_pct: parseFloat(r.discount_pct) || 0,
          gst_pct:      parseFloat(r.gst_pct) || 0,
          ...(isChangedRow ? { new_sale_price: salePrices[r._key] } : {}),
        };
      }),
    };
    onSave(payload);
  };

  const handleSaveClick = () => {
    // Validate
    if (!vendorId) { toast.error('Pick a vendor'); return; }
    if (!billNumber.trim()) { toast.error('Bill number required'); return; }
    if (!billDate) { toast.error('Bill date required'); return; }
    const valid = rows.filter(r => (r.part_name || r.part_id) && parseFloat(r.qty) > 0 && parseFloat(r.rate) > 0);
    if (valid.length === 0) { toast.error('Add at least one line with qty + rate'); return; }

    // Detect rate changes vs existing purchase price
    const changes = [];
    valid.forEach(r => {
      if (!r.part_id || !r._existing_rate) return;
      const computed = computeLine(r);
      const newUnitCost = r.qty > 0 ? Math.round((computed.line_total / parseFloat(r.qty)) * 100) / 100 : 0;
      const oldCost = parseFloat(r._existing_rate);
      if (!oldCost) return;
      const deltaPct = Math.abs((newUnitCost - oldCost) / oldCost * 100);
      if (deltaPct >= RATE_CHANGE_THRESHOLD_PCT) {
        // Suggest new sale price preserving margin ratio
        const oldSale   = parseFloat(r._existing_selling) || newUnitCost * 1.25;
        const oldMargin = oldCost > 0 ? (oldSale - oldCost) / oldCost : 0.25;
        const suggested = Math.round(newUnitCost * (1 + oldMargin) * 100) / 100;
        changes.push({
          rowKey: r._key,
          part_name: r.part_name,
          old_cost: oldCost,
          new_cost: newUnitCost,
          old_sale_price: oldSale,
          suggested_sale_price: suggested,
        });
      }
    });

    if (changes.length > 0) {
      setPendingChanges(changes);
    } else {
      doSubmit();
    }
  };

  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:6, padding:20, display:'flex', flexDirection:'column', gap:16 }}>
      {/* Header row */}
      <div style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr 1fr 1fr', gap:12 }}>
        <Field label="Vendor *">
          <select value={vendorId} onChange={e=>setVendorId(e.target.value)} disabled={!!initial}>
            <option value="">Select vendor…</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </Field>
        <Field label="Bill Number *"><input value={billNumber} onChange={e=>setBillNumber(e.target.value)} placeholder="GST-1855/2025-26" /></Field>
        <Field label="Bill Date *"><input value={billDate} onChange={e=>setBillDate(e.target.value)} placeholder="09 Jul 2025" /></Field>
        <Field label="Place of Supply"><input value={placeOfSupply} onChange={e=>setPlace(e.target.value)} /></Field>
      </div>

      {/* Line items grid */}
      <div>
        <div style={{ fontSize:11, fontWeight:600, color:'var(--muted)', marginBottom:8, textTransform:'uppercase', letterSpacing:'.05em' }}>Line Items</div>
        <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:4, overflow:'visible' }}>
          <table style={{ width:'100%', fontSize:11, borderCollapse:'separate', borderSpacing:0 }}>
            <thead>
              <tr style={{ background:'var(--surface)', color:'var(--muted)', fontSize:9, textTransform:'uppercase', letterSpacing:'.06em' }}>
                <th style={{ padding:'8px 6px', textAlign:'left', fontWeight:500, width:'26%' }}>Part *</th>
                <th style={{ padding:'8px 6px', textAlign:'left', fontWeight:500, width:'10%' }}>Vendor SKU</th>
                <th style={{ padding:'8px 6px', textAlign:'left', fontWeight:500, width:'8%' }}>HSN</th>
                <th style={{ padding:'8px 6px', textAlign:'right', fontWeight:500, width:'7%' }}>Qty *</th>
                <th style={{ padding:'8px 6px', textAlign:'left', fontWeight:500, width:'6%' }}>Unit</th>
                <th style={{ padding:'8px 6px', textAlign:'right', fontWeight:500, width:'9%' }}>Rate *</th>
                <th style={{ padding:'8px 6px', textAlign:'right', fontWeight:500, width:'7%' }}>Disc %</th>
                <th style={{ padding:'8px 6px', textAlign:'right', fontWeight:500, width:'7%' }}>GST %</th>
                <th style={{ padding:'8px 6px', textAlign:'right', fontWeight:500, width:'10%' }}>Amount</th>
                <th style={{ padding:'8px 6px', textAlign:'center', fontWeight:500, width:'40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const c = computeLine(row);
                return (
                  <tr key={row._key} style={{ borderTop:'1px solid var(--border)' }}>
                    <td style={{ padding:4 }}>
                      <PartAutocomplete
                        row={row} vendorId={vendorId}
                        onPick={patch => updateRow(row._key, patch)}
                        onCreateNew={name => updateRow(row._key, { part_id: null, part_name: name })}
                      />
                    </td>
                    <td style={{ padding:4 }}><input value={row.part_number || ''} onChange={e=>updateRow(row._key, {part_number:e.target.value})} style={{ width:'100%', padding:'6px 8px', fontSize:11, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3 }} /></td>
                    <td style={{ padding:4 }}><input value={row.hsn || ''} onChange={e=>updateRow(row._key, {hsn:e.target.value})} style={{ width:'100%', padding:'6px 8px', fontSize:11, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3 }} /></td>
                    <td style={{ padding:4 }}><input type="number" step="1" min="0" value={row.qty} onChange={e=>updateRow(row._key, {qty:e.target.value})} style={{ width:'100%', padding:'6px 8px', fontSize:11, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3, textAlign:'right' }} /></td>
                    <td style={{ padding:4 }}>
                      <select value={row.unit || 'PCS'} onChange={e=>updateRow(row._key, {unit:e.target.value})} style={{ width:'100%', padding:'6px 4px', fontSize:11, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3 }}>
                        {['PCS', 'PC', 'SET', 'NOS', 'EACH', 'KG', 'LTR'].map(u => <option key={u}>{u}</option>)}
                      </select>
                    </td>
                    <td style={{ padding:4 }}><input type="number" step="0.01" min="0" value={row.rate} onChange={e=>updateRow(row._key, {rate:e.target.value})} style={{ width:'100%', padding:'6px 8px', fontSize:11, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3, textAlign:'right' }} /></td>
                    <td style={{ padding:4 }}><input type="number" step="0.01" min="0" max="100" value={row.discount_pct} onChange={e=>updateRow(row._key, {discount_pct:e.target.value})} style={{ width:'100%', padding:'6px 8px', fontSize:11, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3, textAlign:'right' }} /></td>
                    <td style={{ padding:4 }}>
                      <select value={row.gst_pct} onChange={e=>updateRow(row._key, {gst_pct:parseFloat(e.target.value)})} style={{ width:'100%', padding:'6px 4px', fontSize:11, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3, textAlign:'right' }}>
                        {[0, 5, 12, 18, 28].map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </td>
                    <td style={{ padding:'4px 8px', textAlign:'right', fontWeight:600 }} className="mono">₹{c.line_total.toLocaleString('en-IN')}</td>
                    <td style={{ padding:4, textAlign:'center' }}>
                      <button onClick={()=>removeRow(row._key)} disabled={rows.length===1}
                        style={{ background:'transparent', border:'none', color:'var(--dim)', cursor:'pointer', fontSize:16, padding:0 }}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button onClick={addRow} style={{ marginTop:8, padding:'6px 12px', fontSize:11, background:'transparent', border:'1px dashed var(--border)', borderRadius:3, color:'var(--muted)', cursor:'pointer', width:'100%' }}>+ New line</button>
      </div>

      {/* Notes + totals */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 260px', gap:20 }}>
        <Field label="Notes"><textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Vendor invoice notes, delivery info…" /></Field>
        <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:4, padding:14, fontSize:11 }}>
          <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0' }}><span style={{ color:'var(--muted)' }}>Subtotal (taxable)</span><span className="mono">₹{totals.subtotal.toLocaleString('en-IN')}</span></div>
          <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0' }}><span style={{ color:'var(--muted)' }}>CGST</span><span className="mono">₹{totals.cgst.toLocaleString('en-IN')}</span></div>
          <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0' }}><span style={{ color:'var(--muted)' }}>SGST</span><span className="mono">₹{totals.sgst.toLocaleString('en-IN')}</span></div>
          <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', alignItems:'center' }}>
            <span style={{ color:'var(--muted)' }}>Round off</span>
            <input type="number" step="0.01" value={roundOff} onChange={e=>setRoundOff(e.target.value)} style={{ width:70, padding:'3px 6px', fontSize:11, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:3, textAlign:'right' }} />
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', borderTop:'1px solid var(--border)', paddingTop:10, marginTop:6, fontSize:14, fontWeight:700 }}>
            <span>Grand Total</span>
            <span className="mono" style={{ color:'var(--accent)' }}>₹{totals.grand.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
        <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
        <Btn onClick={handleSaveClick} disabled={saving || !canEdit}>{saving ? 'Saving…' : (initial ? 'Update Bill' : 'Save Bill')}</Btn>
      </div>

      {/* Rate change confirmation modal */}
      {pendingChanges && (
        <RateChangeModal
          changes={pendingChanges}
          onCancel={() => setPendingChanges(null)}
          onConfirm={(salePrices) => { setPendingChanges(null); doSubmit(salePrices); }}
        />
      )}
    </div>
  );
}

// ── View modal for read-only bill display ─────────────────────────
function ViewBillModal({ bill, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:150, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:24, minWidth:800, maxWidth:1000, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700 }}>Bill #{bill.bill_number}</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{bill.vendor_name} · {bill.bill_date}</div>
            {bill.vendor_gstin && <div style={{ fontSize:10, color:'var(--dim)', marginTop:2 }} className="mono">GSTIN: {bill.vendor_gstin}</div>}
          </div>
          <GhostBtn onClick={onClose}>Close</GhostBtn>
        </div>
        <table style={{ width:'100%', fontSize:11, borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--border)', color:'var(--muted)', fontSize:10, textTransform:'uppercase', letterSpacing:'.05em' }}>
              <th style={{ padding:'8px 6px', textAlign:'left', fontWeight:500 }}>Part</th>
              <th style={{ padding:'8px 6px', textAlign:'left', fontWeight:500 }}>SKU</th>
              <th style={{ padding:'8px 6px', textAlign:'right', fontWeight:500 }}>Qty</th>
              <th style={{ padding:'8px 6px', textAlign:'right', fontWeight:500 }}>Rate</th>
              <th style={{ padding:'8px 6px', textAlign:'right', fontWeight:500 }}>Disc %</th>
              <th style={{ padding:'8px 6px', textAlign:'right', fontWeight:500 }}>GST %</th>
              <th style={{ padding:'8px 6px', textAlign:'right', fontWeight:500 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {(bill.items||[]).map((it, i) => (
              <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                <td style={{ padding:'8px 6px', fontWeight:600 }}>{it.part_name}</td>
                <td style={{ padding:'8px 6px', color:'var(--muted)' }} className="mono">{it.part_number || '—'}</td>
                <td style={{ padding:'8px 6px', textAlign:'right' }} className="mono">{it.qty} {it.unit}</td>
                <td style={{ padding:'8px 6px', textAlign:'right' }} className="mono">₹{it.rate}</td>
                <td style={{ padding:'8px 6px', textAlign:'right', color:'var(--muted)' }} className="mono">{it.discount_pct || 0}%</td>
                <td style={{ padding:'8px 6px', textAlign:'right', color:'var(--muted)' }} className="mono">{it.gst_pct || 0}%</td>
                <td style={{ padding:'8px 6px', textAlign:'right', fontWeight:600 }} className="mono">₹{(it.line_total||0).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={6} style={{ padding:'12px 6px 4px', textAlign:'right', color:'var(--muted)' }}>Subtotal</td><td style={{ padding:'12px 6px 4px', textAlign:'right' }} className="mono">₹{(bill.subtotal||0).toLocaleString('en-IN')}</td></tr>
            <tr><td colSpan={6} style={{ padding:'2px 6px', textAlign:'right', color:'var(--muted)' }}>CGST + SGST</td><td style={{ padding:'2px 6px', textAlign:'right' }} className="mono">₹{((bill.total_cgst||0)+(bill.total_sgst||0)).toLocaleString('en-IN')}</td></tr>
            {bill.round_off ? <tr><td colSpan={6} style={{ padding:'2px 6px', textAlign:'right', color:'var(--muted)' }}>Round off</td><td style={{ padding:'2px 6px', textAlign:'right' }} className="mono">₹{bill.round_off}</td></tr> : null}
            <tr><td colSpan={6} style={{ padding:'8px 6px', textAlign:'right', fontWeight:700, fontSize:13 }}>Grand Total</td><td style={{ padding:'8px 6px', textAlign:'right', fontWeight:700, fontSize:13, color:'var(--accent)' }} className="mono">₹{(bill.grand_total||0).toLocaleString('en-IN')}</td></tr>
          </tfoot>
        </table>
        {bill.notes && (
          <div style={{ marginTop:12, padding:10, background:'var(--surface2)', borderRadius:4, fontSize:11, color:'var(--muted)' }}>
            <div style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Notes</div>
            {bill.notes}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────
export default function PurchaseBillsPage() {
  const qc      = useQueryClient();
  const confirm = useConfirm();
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';

  const [search, setSearch]         = useState('');
  const [vendorFilter, setVFilter]  = useState('');
  const [showForm, setShowForm]     = useState(false);
  const [editBill, setEditBill]     = useState(null);
  const [viewBill, setViewBill]     = useState(null);

  const { data: vendorsData }   = useQuery({
    queryKey: ['vendors', ''], queryFn: () => vendorsApi.list().then(r=>r.data),
  });
  const { data: billsData, isLoading, error } = useQuery({
    queryKey: ['purchase-bills', search, vendorFilter],
    queryFn: () => purchaseBillsApi.list({ search: search||undefined, vendor_id: vendorFilter||undefined }).then(r=>r.data),
  });

  const createMut = useMutation({
    mutationFn: (d) => purchaseBillsApi.create(d),
    onSuccess: () => { qc.invalidateQueries(['purchase-bills']); qc.invalidateQueries(['parts']); setShowForm(false); toast.success('Bill saved · stock updated'); },
    onError: e => toast.error(errMsg(e, 'Create failed')),
  });
  const updateMut = useMutation({
    mutationFn: ({id, d}) => purchaseBillsApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries(['purchase-bills']); qc.invalidateQueries(['parts']); setEditBill(null); toast.success('Bill updated · stock recalculated'); },
    onError: e => toast.error(errMsg(e, 'Update failed')),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => purchaseBillsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries(['purchase-bills']); qc.invalidateQueries(['parts']); toast.success('Bill deleted · stock reversed'); },
    onError: e => toast.error(errMsg(e, 'Delete failed')),
  });

  const vendors = vendorsData || [];
  const bills   = billsData || [];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Toolbar */}
      {!showForm && !editBill && (
        <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
          <input placeholder="Search bill number, vendor…" value={search} onChange={e=>setSearch(e.target.value)}
                 style={{ flex:'0 1 260px', padding:'10px 14px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, fontSize:12 }} />
          <select value={vendorFilter} onChange={e=>setVFilter(e.target.value)}
                  style={{ padding:'10px 14px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, fontSize:12, color:'var(--text)' }}>
            <option value="">All vendors</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            <Btn onClick={()=>setShowForm(true)}>+ New Purchase Bill</Btn>
          </div>
        </div>
      )}

      {/* Create form */}
      {showForm && <BillForm vendors={vendors} onSave={d=>createMut.mutate(d)} onCancel={()=>setShowForm(false)} saving={createMut.isPending} canEdit={true} />}

      {/* Edit form (owner only) */}
      {editBill && <BillForm initial={editBill} vendors={vendors} onSave={d=>updateMut.mutate({id: editBill.id, d})} onCancel={()=>setEditBill(null)} saving={updateMut.isPending} canEdit={isOwner} />}

      {/* View modal */}
      {viewBill && <ViewBillModal bill={viewBill} onClose={()=>setViewBill(null)} />}

      {/* List */}
      {!showForm && !editBill && (
        isLoading ? <Skeleton /> :
        error     ? <ApiError err={error} /> :
        bills.length === 0 ? <Empty text="No purchase bills yet." /> :
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:6, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)', background:'var(--surface2)', color:'var(--muted)', fontSize:10, textTransform:'uppercase', letterSpacing:'.06em' }}>
                <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:500 }}>Bill #</th>
                <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:500 }}>Date</th>
                <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:500 }}>Vendor</th>
                <th style={{ padding:'10px 16px', textAlign:'right', fontWeight:500 }}>Items</th>
                <th style={{ padding:'10px 16px', textAlign:'right', fontWeight:500 }}>Total</th>
                <th style={{ padding:'10px 16px', textAlign:'right', fontWeight:500 }}></th>
              </tr>
            </thead>
            <tbody>
              {bills.map(b => (
                <tr key={b.id} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={{ padding:'10px 16px', fontWeight:600 }} className="mono">{b.bill_number}</td>
                  <td style={{ padding:'10px 16px', color:'var(--muted)' }}>{b.bill_date}</td>
                  <td style={{ padding:'10px 16px' }}>{b.vendor_name}</td>
                  <td style={{ padding:'10px 16px', textAlign:'right', color:'var(--muted)' }} className="mono">{(b.items||[]).length}</td>
                  <td style={{ padding:'10px 16px', textAlign:'right', fontWeight:700 }} className="mono">₹{(b.grand_total||0).toLocaleString('en-IN')}</td>
                  <td style={{ padding:'10px 16px', textAlign:'right' }}>
                    <div style={{ display:'inline-flex', gap:6 }}>
                      <GhostBtn small onClick={()=>setViewBill(b)}>View</GhostBtn>
                      {isOwner && <GhostBtn small onClick={()=>setEditBill(b)}>Edit</GhostBtn>}
                      {isOwner && <GhostBtn small onClick={async()=>{
                        const ok = await confirm({ title:'Delete purchase bill?', message:`Delete bill ${b.bill_number}? Stock for all items will be reversed.`, confirmText:'Delete', danger:true });
                        if (ok) deleteMut.mutate(b.id);
                      }}>Delete</GhostBtn>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
