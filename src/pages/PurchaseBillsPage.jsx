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
        aria-label="Part"
        style={{
          width:'100%',
          ...(row.part_id ? {
            background: 'color-mix(in oklab, var(--color-success) 8%, var(--color-paper))',
            borderColor: 'var(--color-success)',
          } : null),
        }}
      />
      {open && (items.length > 0 || q.length >= 2) && (
        <div style={{
          position:'absolute', top:'100%', left:0, right:0, marginTop:'var(--space-3xs)', zIndex:'var(--z-dropdown)',
          minWidth:280, background:'var(--color-paper)', border:'1px solid var(--color-rule-2)', borderRadius:'var(--radius-control)',
          maxHeight:260, overflowY:'auto', boxShadow:'0 8px 20px -8px color-mix(in oklab, var(--color-ink) 24%, transparent)',
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
                style={{ padding:'var(--space-xs) var(--space-sm)', cursor:'pointer', borderBottom:'1px solid var(--color-rule)', fontSize:'var(--text-sm)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'var(--space-xs)' }}>
                  <div style={{ fontWeight:600, color:'var(--color-ink)' }}>{p.name}</div>
                  <div className="cell-sub" style={{ marginTop:0, whiteSpace:'nowrap' }}>Stock: {p.stock ?? 0}</div>
                </div>
                <div className="cell-sub" style={{ display:'flex', flexWrap:'wrap', gap:'var(--space-sm)' }}>
                  <span className="mono">{p.part_number}</span>
                  {aliasHit && <span style={{ color:'var(--color-success)' }}>Vendor name: {aliasHit.part_name || aliasHit.part_number}</span>}
                  {p.last_purchase_rate && <span>Last: ₹{p.last_purchase_rate}</span>}
                </div>
              </div>
            );
          })}
          {q.length >= 2 && (
            <div
              onClick={() => { onCreateNew(q); setOpen(false); }}
              style={{ padding:'var(--space-xs) var(--space-sm)', cursor:'pointer', background:'var(--color-paper-2)', fontSize:'var(--text-sm)', color:'var(--color-ink)', fontWeight:600 }}
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
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="rate-change-title" style={{ maxWidth:800 }}
        onClick={e => e.stopPropagation()}>
        <h2 id="rate-change-title" className="dialog-title" style={{ marginBottom:0 }}>Rate change detected</h2>
        <p className="dialog-sub" style={{ marginBottom:'var(--space-md)' }}>
          {changes.length} part{changes.length>1?'s':''} came in at a different rate. Update sale prices too?
        </p>

        <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Apply</th>
              <th>Part</th>
              <th className="num">Old cost</th>
              <th className="num">New cost</th>
              <th className="num">Old sale</th>
              <th className="num">New sale</th>
              <th className="num">Margin</th>
            </tr>
          </thead>
          <tbody>
            {changes.map(c => {
              const newSale = parseFloat(prices[c.rowKey]) || 0;
              const marginPct = c.new_cost > 0 ? ((newSale - c.new_cost) / c.new_cost * 100).toFixed(1) : 'None';
              const delta = c.new_cost - c.old_cost;
              const deltaPct = c.old_cost > 0 ? (delta / c.old_cost * 100).toFixed(1) : '';
              return (
                <tr key={c.rowKey}>
                  <td>
                    <input type="checkbox" checked={!!applyFlags[c.rowKey]} aria-label={`Update sale price for ${c.part_name}`}
                      onChange={e => setApplyFlags(p => ({...p, [c.rowKey]: e.target.checked}))} />
                  </td>
                  <td className="cell-strong">{c.part_name}</td>
                  <td className="num mono">₹{c.old_cost.toFixed(2)}</td>
                  <td className="num mono cell-amount" style={{ color: delta > 0 ? 'var(--color-error)' : 'var(--color-success)' }}>
                    ₹{c.new_cost.toFixed(2)}
                    <div className="cell-sub" style={{ color:'inherit', fontWeight:400 }}>({delta > 0 ? '+' : ''}{deltaPct}%)</div>
                  </td>
                  <td className="num mono cell-muted">₹{c.old_sale_price.toFixed(2)}</td>
                  <td className="num">
                    <input
                      type="number" step="0.01" min="0"
                      disabled={!applyFlags[c.rowKey]}
                      value={prices[c.rowKey]}
                      onChange={e => setPrices(p => ({...p, [c.rowKey]: e.target.value}))}
                      aria-label={`New sale price for ${c.part_name}`}
                      style={{ width:104, textAlign:'right' }}
                    />
                  </td>
                  <td className="num mono" style={{ color: marginPct < 10 ? 'var(--color-error)' : 'var(--color-success)' }}>
                    {c.new_cost > 0 ? `${marginPct}%` : marginPct}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        <div className="dialog-actions" style={{ padding:'var(--space-lg) 0 0', flexWrap:'wrap' }}>
          <GhostBtn onClick={() => onConfirm({})}>Skip, don’t update sale prices</GhostBtn>
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
    <section className="page-panel" aria-labelledby="bill-form-title" style={{ display:'flex', flexDirection:'column', gap:'var(--space-lg)' }}>
      <h2 id="bill-form-title" className="page-panel-title" style={{ marginBottom:0 }}>{initial ? `Edit bill ${initial.bill_number}` : 'New purchase bill'}</h2>
      {/* Header row */}
      <div className="form-grid" style={{ gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Field label="Vendor *">
          <select value={vendorId} onChange={e=>setVendorId(e.target.value)} disabled={!!initial}>
            <option value="">Select vendor…</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </Field>
        <Field label="Bill number *"><input value={billNumber} onChange={e=>setBillNumber(e.target.value)} placeholder="GST-1855/2025-26" /></Field>
        <Field label="Bill date *"><input value={billDate} onChange={e=>setBillDate(e.target.value)} placeholder="09 Jul 2025" /></Field>
        <Field label="Place of supply"><input value={placeOfSupply} onChange={e=>setPlace(e.target.value)} /></Field>
      </div>

      {/* Line items grid */}
      <div>
        <h3 className="sheet-sec">Line items</h3>
        <div style={{ background:'var(--color-paper)', border:'1px solid var(--color-rule)', borderRadius:'var(--radius-control)', overflow:'visible' }}>
          <table style={{ width:'100%', fontSize:'var(--text-sm)', borderCollapse:'separate', borderSpacing:0 }}>
            <thead>
              <tr className="bill-head">
                <th style={{ width:'26%' }}>Part *</th>
                <th style={{ width:'10%' }}>Vendor SKU</th>
                <th style={{ width:'8%' }}>HSN</th>
                <th style={{ textAlign:'right', width:'7%' }}>Qty *</th>
                <th style={{ width:'6%' }}>Unit</th>
                <th style={{ textAlign:'right', width:'9%' }}>Rate *</th>
                <th style={{ textAlign:'right', width:'7%' }}>Disc %</th>
                <th style={{ textAlign:'right', width:'7%' }}>GST %</th>
                <th style={{ textAlign:'right', width:'10%' }}>Amount</th>
                <th style={{ width:'40px' }}><span className="visually-hidden">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const c = computeLine(row);
                return (
                  <tr key={row._key}>
                    <td style={{ padding:'var(--space-2xs)', borderTop:'1px solid var(--color-rule)' }}>
                      <PartAutocomplete
                        row={row} vendorId={vendorId}
                        onPick={patch => updateRow(row._key, patch)}
                        onCreateNew={name => updateRow(row._key, { part_id: null, part_name: name })}
                      />
                    </td>
                    <td style={{ padding:'var(--space-2xs)', borderTop:'1px solid var(--color-rule)' }}><input aria-label="Vendor SKU" value={row.part_number || ''} onChange={e=>updateRow(row._key, {part_number:e.target.value})} style={{ width:'100%' }} /></td>
                    <td style={{ padding:'var(--space-2xs)', borderTop:'1px solid var(--color-rule)' }}><input aria-label="HSN" value={row.hsn || ''} onChange={e=>updateRow(row._key, {hsn:e.target.value})} style={{ width:'100%' }} /></td>
                    <td style={{ padding:'var(--space-2xs)', borderTop:'1px solid var(--color-rule)' }}><input aria-label="Qty" type="number" step="1" min="0" value={row.qty} onChange={e=>updateRow(row._key, {qty:e.target.value})} style={{ width:'100%', textAlign:'right' }} /></td>
                    <td style={{ padding:'var(--space-2xs)', borderTop:'1px solid var(--color-rule)' }}>
                      <select aria-label="Unit" value={row.unit || 'PCS'} onChange={e=>updateRow(row._key, {unit:e.target.value})} style={{ width:'100%' }}>
                        {['PCS', 'PC', 'SET', 'NOS', 'EACH', 'KG', 'LTR'].map(u => <option key={u}>{u}</option>)}
                      </select>
                    </td>
                    <td style={{ padding:'var(--space-2xs)', borderTop:'1px solid var(--color-rule)' }}><input aria-label="Rate" type="number" step="0.01" min="0" value={row.rate} onChange={e=>updateRow(row._key, {rate:e.target.value})} style={{ width:'100%', textAlign:'right' }} /></td>
                    <td style={{ padding:'var(--space-2xs)', borderTop:'1px solid var(--color-rule)' }}><input aria-label="Discount %" type="number" step="0.01" min="0" max="100" value={row.discount_pct} onChange={e=>updateRow(row._key, {discount_pct:e.target.value})} style={{ width:'100%', textAlign:'right' }} /></td>
                    <td style={{ padding:'var(--space-2xs)', borderTop:'1px solid var(--color-rule)' }}>
                      <select aria-label="GST %" value={row.gst_pct} onChange={e=>updateRow(row._key, {gst_pct:parseFloat(e.target.value)})} style={{ width:'100%', textAlign:'right' }}>
                        {[0, 5, 12, 18, 28].map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </td>
                    <td style={{ padding:'var(--space-2xs) var(--space-xs)', borderTop:'1px solid var(--color-rule)', textAlign:'right', fontWeight:600, whiteSpace:'nowrap' }} className="mono">₹{c.line_total.toLocaleString('en-IN')}</td>
                    <td style={{ padding:'var(--space-2xs)', borderTop:'1px solid var(--color-rule)', textAlign:'center' }}>
                      <button type="button" className="btn btn-ghost btn-sm" aria-label="Remove line" onClick={()=>removeRow(row._key)} disabled={rows.length===1}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={addRow} style={{ marginTop:'var(--space-xs)', width:'100%', borderStyle:'dashed' }}>+ New line</button>
      </div>

      {/* Notes + totals */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))', gap:'var(--space-lg)', alignItems:'start' }}>
        <Field label="Notes"><textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Vendor invoice notes, delivery info…" /></Field>
        <div style={{ background:'var(--color-paper)', border:'1px solid var(--color-rule)', borderRadius:'var(--radius-control)', padding:'var(--space-sm) var(--space-md)' }}>
          <div className="tot-row"><span>Subtotal (taxable)</span><span className="mono">₹{totals.subtotal.toLocaleString('en-IN')}</span></div>
          <div className="tot-row"><span>CGST</span><span className="mono">₹{totals.cgst.toLocaleString('en-IN')}</span></div>
          <div className="tot-row"><span>SGST</span><span className="mono">₹{totals.sgst.toLocaleString('en-IN')}</span></div>
          <div className="tot-row" style={{ alignItems:'center' }}>
            <label htmlFor="pb-round-off">Round off</label>
            <input id="pb-round-off" type="number" step="0.01" value={roundOff} onChange={e=>setRoundOff(e.target.value)} style={{ width:96, textAlign:'right' }} />
          </div>
          <div className="tot-row is-bold" style={{ borderBottom:0, paddingTop:'var(--space-xs)' }}>
            <span>Grand total</span>
            <span className="mono">₹{totals.grand.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="form-actions" style={{ justifyContent:'flex-end' }}>
        <div className="form-actions-end">
          <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
          <Btn onClick={handleSaveClick} disabled={saving || !canEdit}>{saving ? 'Saving…' : (initial ? 'Update bill' : 'Save bill')}</Btn>
        </div>
      </div>

      {/* Rate change confirmation modal */}
      {pendingChanges && (
        <RateChangeModal
          changes={pendingChanges}
          onCancel={() => setPendingChanges(null)}
          onConfirm={(salePrices) => { setPendingChanges(null); doSubmit(salePrices); }}
        />
      )}
    </section>
  );
}

// ── View modal for read-only bill display ─────────────────────────
function ViewBillModal({ bill, onClose }) {
  return (
    <div className="dialog-backdrop sheet-backdrop" onClick={onClose}>
      <div className="dialog sheet" role="dialog" aria-modal="true" aria-labelledby="view-bill-title" style={{ maxWidth:1000 }}
        onClick={e => e.stopPropagation()}>
        <div className="record-head">
          <div>
            <h2 id="view-bill-title" className="record-title">Bill #{bill.bill_number}</h2>
            <div className="record-id">{bill.vendor_name}, {bill.bill_date}</div>
            {bill.vendor_gstin && <div className="record-id mono">GSTIN: {bill.vendor_gstin}</div>}
          </div>
          <button type="button" className="record-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="record-body">
        <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Part</th>
              <th>SKU</th>
              <th className="num">Qty</th>
              <th className="num">Rate</th>
              <th className="num">Disc %</th>
              <th className="num">GST %</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {(bill.items||[]).map((it, i) => (
              <tr key={i}>
                <td className="cell-strong">{it.part_name}</td>
                <td className="mono cell-id">{it.part_number || <span className="cell-muted">None</span>}</td>
                <td className="num mono">{it.qty} {it.unit}</td>
                <td className="num mono">₹{it.rate}</td>
                <td className="num mono cell-muted">{it.discount_pct || 0}%</td>
                <td className="num mono cell-muted">{it.gst_pct || 0}%</td>
                <td className="num mono cell-amount">₹{(it.line_total||0).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={6} className="num cell-muted" style={{ borderBottom:0 }}>Subtotal</td><td className="num mono" style={{ borderBottom:0 }}>₹{(bill.subtotal||0).toLocaleString('en-IN')}</td></tr>
            <tr><td colSpan={6} className="num cell-muted" style={{ borderBottom:0 }}>CGST + SGST</td><td className="num mono" style={{ borderBottom:0 }}>₹{((bill.total_cgst||0)+(bill.total_sgst||0)).toLocaleString('en-IN')}</td></tr>
            {bill.round_off ? <tr><td colSpan={6} className="num cell-muted" style={{ borderBottom:0 }}>Round off</td><td className="num mono" style={{ borderBottom:0 }}>₹{bill.round_off}</td></tr> : null}
            <tr><td colSpan={6} className="num" style={{ fontWeight:600, fontSize:'var(--text-lg)', borderBottom:0 }}>Grand total</td><td className="num mono" style={{ fontWeight:600, fontSize:'var(--text-lg)', borderBottom:0 }}>₹{(bill.grand_total||0).toLocaleString('en-IN')}</td></tr>
          </tfoot>
        </table>
        </div>
        {bill.notes && (
          <div className="notice">
            <h3 className="sheet-sec" style={{ marginBottom:'var(--space-2xs)' }}>Notes</h3>
            {bill.notes}
          </div>
        )}
        </div>
        <div className="record-foot sheet-foot">
          <GhostBtn onClick={onClose}>Close</GhostBtn>
        </div>
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
    onSuccess: () => { qc.invalidateQueries(['purchase-bills']); qc.invalidateQueries(['parts']); setShowForm(false); toast.success('Bill saved, stock updated'); },
    onError: e => toast.error(errMsg(e, 'Create failed')),
  });
  const updateMut = useMutation({
    mutationFn: ({id, d}) => purchaseBillsApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries(['purchase-bills']); qc.invalidateQueries(['parts']); setEditBill(null); toast.success('Bill updated, stock recalculated'); },
    onError: e => toast.error(errMsg(e, 'Update failed')),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => purchaseBillsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries(['purchase-bills']); qc.invalidateQueries(['parts']); toast.success('Bill deleted, stock reversed'); },
    onError: e => toast.error(errMsg(e, 'Delete failed')),
  });

  const vendors = vendorsData || [];
  const bills   = billsData || [];

  return (
    <div>
      {/* Toolbar */}
      {!showForm && !editBill && (
        <div className="page-toolbar">
          <input type="search" className="page-search" aria-label="Search purchase bills" placeholder="Search bill number, vendor…" value={search} onChange={e=>setSearch(e.target.value)} />
          <select aria-label="Filter by vendor" value={vendorFilter} onChange={e=>setVFilter(e.target.value)} style={{ width:'auto', maxWidth:'100%' }}>
            <option value="">All vendors</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <div className="toolbar-end">
            {!isLoading && !error && (
              <span className="toolbar-count" role="status">{bills.length} bill{bills.length === 1 ? '' : 's'}</span>
            )}
            <Btn onClick={()=>setShowForm(true)}>+ New purchase bill</Btn>
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
        isLoading ? <div className="table-skeleton">{[1,2,3].map(i=><Skeleton key={i} h={44}/>)}</div> :
        error     ? <div className="page-pad"><ApiError error={error} /></div> :
        bills.length === 0 ? (
          search || vendorFilter
            ? <Empty message="No purchase bills match" sub="Clear the search or the vendor filter to see more." />
            : <Empty message="No purchase bills yet" sub="Add the first vendor invoice with New purchase bill." />
        ) :
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Date</th>
                <th>Vendor</th>
                <th className="num">Items</th>
                <th className="num">Total</th>
                <th><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {bills.map(b => (
                <tr key={b.id}>
                  <td className="mono cell-id cell-strong">{b.bill_number}</td>
                  <td className="cell-muted cell-nowrap">{b.bill_date}</td>
                  <td>{b.vendor_name}</td>
                  <td className="num mono cell-muted">{(b.items||[]).length}</td>
                  <td className="num mono cell-amount">₹{(b.grand_total||0).toLocaleString('en-IN')}</td>
                  <td>
                    <div className="row-actions" style={{ justifyContent:'flex-end' }}>
                      <button type="button" className="btn btn-ghost btn-sm" aria-label={`View bill ${b.bill_number}`} onClick={()=>setViewBill(b)}>View</button>
                      {isOwner && <button type="button" className="btn btn-ghost btn-sm" aria-label={`Edit bill ${b.bill_number}`} onClick={()=>setEditBill(b)}>Edit</button>}
                      {isOwner && <button type="button" className="btn btn-ghost btn-sm btn-ghost-danger" aria-label={`Delete bill ${b.bill_number}`} onClick={async()=>{
                        const ok = await confirm(`Delete bill ${b.bill_number}?`, { sub:'Stock for all items will be reversed.' });
                        if (ok) deleteMut.mutate(b.id);
                      }}>Delete</button>}
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
