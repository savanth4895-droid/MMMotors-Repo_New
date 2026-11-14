import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { partsApi, billsApi, errMsg } from '../../api/client';
import { notifyLowStock } from '../../utils/lowStockToast';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { escapeDeep } from '../../utils/escapeHtml';
import { upiQrHtml } from '../../utils/upi';
import { ModalShell, ModalFoot } from './Modal';
import { C, inp, labelSt } from './shared';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const RS   = '₹';

const fmt  = n => Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});

const fmtI = n => Number(n||0).toLocaleString('en-IN');

function numWords(n) {
  const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  if (!n||n===0) return 'Zero';
  n=Math.round(n);
  if(n<20)       return a[n];
  if(n<100)      return b[Math.floor(n/10)]+(n%10?' '+a[n%10]:'');
  if(n<1000)     return a[Math.floor(n/100)]+' Hundred'+(n%100?' '+numWords(n%100):'');
  if(n<100000)   return numWords(Math.floor(n/1000))+' Thousand'+(n%1000?' '+numWords(n%1000):'');
  if(n<10000000) return numWords(Math.floor(n/100000))+' Lakh'+(n%100000?' '+numWords(n%100000):'');
  return numWords(Math.floor(n/10000000))+' Crore'+(n%10000000?' '+numWords(n%10000000):'');
}

const emptyRow = () => ({ description:'', hsn:'9987', qty:1, unit_price:0, gst_rate:18, discount:0, discIsPct:false, complimentary:false, _key:Math.random() });

// ═══════════════════════════════════════════════════════════════════════════════
//  SERVICE BILL MODAL  (named export — also used from other pages)
// ═══════════════════════════════════════════════════════════════════════════════
// ─── Print Bill ───────────────────────────────────────────────────────────────
function printBill(rawJob, rawBill, rawRows, total, taxable, cgst, sgst, discount = 0, preDiscount = null) {
  const job = escapeDeep(rawJob), bill = escapeDeep(rawBill), rows = escapeDeep(rawRows);
  const RS = '₹';
  const fmt2 = n => Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtI = n => Number(n||0).toLocaleString('en-IN');
  const subtotalVal = preDiscount != null ? preDiscount : total;
  const disc = Number(discount || 0);

  const rows_html = rows.map(r => {
    const isFree = !!r.complimentary;
    const mrp    = isFree ? Number(r.unit_price) : Number(r.unit_price);
    const amt    = isFree ? 0 : Math.round(r.unit_price*r.qty);
    return `
    <tr${isFree?' style="background:#fdf6e3"':''}>
      <td>${r.description}${isFree?' <span style="font-size:9px;font-weight:700;color:#B8860B;background:#fff3cd;padding:1px 5px;border-radius:2px;margin-left:4px;">FREE</span>':''}</td>
      <td style="text-align:center">${r.hsn||'9987'}</td>
      <td style="text-align:center">${r.qty}</td>
      <td style="text-align:right">${isFree?`<s>${RS}${fmt2(mrp)}</s>`:`${RS}${fmt2(r.unit_price)}`}</td>
      <td style="text-align:center">${isFree?'—':r.gst_rate+'%'}</td>
      <td style="text-align:right">${RS}${fmtI(amt)}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>Bill — ${bill.bill_number||''}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#111;padding:24px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #B8860B}
    .brand{font-size:22px;font-weight:800;color:#B8860B;letter-spacing:-.5px}
    .brand-sub{font-size:10px;color:#666;margin-top:2px}
    .bill-meta{text-align:right}
    .bill-meta .bill-no{font-size:16px;font-weight:700}
    .bill-meta .bill-date{font-size:10px;color:#666;margin-top:4px}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
    .info-box{background:#f9f9f9;border:1px solid #e0e0e0;border-radius:4px;padding:12px}
    .info-box h4{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#888;margin-bottom:8px}
    .info-box p{font-size:12px;margin-bottom:3px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    thead tr{background:#B8860B;color:#fff}
    th{padding:8px 10px;font-size:10px;letter-spacing:.05em;text-transform:uppercase;text-align:left}
    td{padding:7px 10px;border-bottom:1px solid #eee}
    tbody tr:nth-child(even){background:#f9f9f9}
    .totals{display:flex;justify-content:flex-end;margin-bottom:16px}
    .totals-box{min-width:260px}
    .tot-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #eee;font-size:12px}
    .tot-row.grand{font-size:15px;font-weight:800;color:#B8860B;border-top:2px solid #B8860B;border-bottom:none;padding-top:8px}
    .words{text-align:right;font-size:10px;color:#888;font-style:italic;margin-bottom:20px}
    .payment{font-size:11px;color:#444;margin-bottom:24px}
    .footer{border-top:1px solid #ddd;padding-top:12px;font-size:10px;color:#888;display:flex;justify-content:space-between}
    @media print{body{padding:10px}.no-print{display:none}}
  </style></head><body>
  <div style="max-width:720px;margin:0 auto">
    <div class="header">
      <div>
        <div class="brand">MM MOTORS</div>
        <div class="brand-sub">Authorised Multi-Brand Service Centre</div>
      </div>
      <div class="bill-meta">
        <div class="bill-no">TAX INVOICE</div>
        <div class="bill-no" style="font-size:13px;color:#B8860B">${bill.bill_number||''}</div>
        <div class="bill-date">Date: ${bill.created_at?.slice(0,10) || new Date().toLocaleDateString('en-IN')}</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <h4>Customer</h4>
        <p><strong>${job.customer_name||''}</strong></p>
        <p>${job.customer_mobile||''}</p>
        ${job.customer_address ? `<p>${job.customer_address}</p>` : ''}
      </div>
      <div class="info-box">
        <h4>Vehicle</h4>
        <p><strong>${job.vehicle_number||''}</strong></p>
        <p>${job.brand||''} ${job.model||''}</p>
        <p style="font-size:10px;color:#888">Job: ${job.job_number||''} &nbsp;|&nbsp; ${job.check_in_date||''}</p>
        ${job.chassis_number ? `<p style="font-size:10px;color:#888">Chassis: ${job.chassis_number}</p>` : ''}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:center">HSN</th>
          <th style="text-align:center">Qty</th>
          <th style="text-align:right">Unit Price</th>
          <th style="text-align:center">GST%</th>
          <th style="text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>${rows_html}</tbody>
    </table>

    <div class="totals">
      <div class="totals-box">
        <div class="tot-row"><span>Taxable Amount</span><span>${RS}${fmt2(taxable)}</span></div>
        <div class="tot-row"><span>CGST</span><span>${RS}${fmt2(cgst)}</span></div>
        <div class="tot-row"><span>SGST</span><span>${RS}${fmt2(sgst)}</span></div>
        ${disc > 0 ? `<div class="tot-row"><span>Subtotal</span><span>${RS}${fmtI(subtotalVal)}</span></div>
        <div class="tot-row"><span>Discount</span><span>- ${RS}${fmtI(disc)}</span></div>` : ''}
        <div class="tot-row grand"><span>Total</span><span>${RS}${fmtI(total)}</span></div>
      </div>
    </div>
    <div class="words">${bill.amount_in_words || ''}</div>
    <div class="payment">Payment Mode: <strong>${bill.payment_mode||'Cash'}</strong></div>
    ${upiQrHtml({ amount: total, note: `Bill ${bill.bill_number || job.job_number || ''}`.trim() })}

    <div class="footer">
      <span>Thank you for choosing MM Motors!</span>
      <span>Authorised Signature</span>
    </div>
  </div>
  <script>window.onload=()=>{window.print();}</script>
  </body></html>`;

  const w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
}

export function ServiceBillModal({ job, onClose }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const [shortages, setShortages] = useState(null);   // null | [{part_number,name,have,need}]
  const [adjusting, setAdjusting] = useState(false);

  const jobId = job._id || job.id;

  // FIX #1: getBillByJobId → billsApi.list({ job_id })
  const { data:billData, isLoading:loadingBill } = useQuery({
    queryKey: ['service-bill', jobId],
    queryFn: () => billsApi.list({ job_id: jobId }),
    retry: false,
  });

  // billsApi.list returns array — grab first item
  const rawBill = billData?.data;
  const existingBill = Array.isArray(rawBill) ? rawBill[0] : rawBill || null;

  const [rows, setRows]         = useState([emptyRow()]);
  const [payMode, setPayMode]   = useState('Cash');
  const [discount, setDiscount] = useState(0);
  const [inited, setInited]     = useState(false);
  const [barcodeVal, setBarcodeVal] = useState('');
  const [scanning, setScanning]     = useState(false);
  const [camError, setCamError]     = useState('');
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const scanLoopRef = useRef(null);

  // Barcode scanner input — physical scanner sends barcode + Enter
  const handleBarcodeKey = e => {
    if (e.key === 'Enter' && barcodeVal.trim()) {
      addPartByBarcode(barcodeVal.trim());
      setBarcodeVal('');
    }
  };

  const addPartByBarcode = (code) => {
    const part = allParts.find(p =>
      p.part_number?.toLowerCase() === code.toLowerCase() ||
      p.barcode === code
    );
    if (part) {
      fillFromPart(part);
      toast.success(`Added: ${part.name}`);
    } else {
      // No part found — add as manual line with the scanned code
      addRow();
      toast(`Part "${code}" not found — added as manual line`);
    }
    setBarcodeVal('');
  };

  // Camera barcode scanning via BarcodeDetector API
  const startCamera = async () => {
    setCamError('');
    if (!('BarcodeDetector' in window)) {
      setCamError('Barcode scanning not supported in this browser. Use Chrome on Android or desktop.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'environment' } });
      streamRef.current = stream;
      setScanning(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 100);
      detectorRef.current = new window.BarcodeDetector({ formats:['qr_code','ean_13','ean_8','code_128','code_39','upc_a','upc_e','itf'] });
      const scan = async () => {
        if (!videoRef.current || !detectorRef.current) return;
        try {
          const barcodes = await detectorRef.current.detect(videoRef.current);
          if (barcodes.length > 0) {
            stopCamera();
            addPartByBarcode(barcodes[0].rawValue);
            return;
          }
        } catch { /* a frame that fails to decode is skipped; the next one is tried */ }
        scanLoopRef.current = requestAnimationFrame(scan);
      };
      scanLoopRef.current = requestAnimationFrame(scan);
    } catch {
      setCamError('Camera access denied. Allow camera permission and try again.');
    }
  };

  const stopCamera = () => {
    setScanning(false);
    if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  };

  if (!loadingBill && !inited) {
    if (existingBill?.items?.length > 0) {
      setRows(existingBill.items.map((it, i) => ({
        _key:          `saved-${i}`,
        description:   it.description  || '',
        hsn:           it.hsn_code     || '9987',
        qty:           it.qty          || 1,
        unit_price:    it.complimentary ? (Number(it.mrp) || 0) : (Number(it.unit_price) || 0),
        gst_rate:      it.complimentary ? 18 : (it.gst_rate || 18),
        discount:      Number(it.discount) || 0,
        discIsPct:     false,
        complimentary: !!it.complimentary,
        _savedQty:     it.qty          || 0,
        _partNumber:   it.part_number  || null,
      })));
      setPayMode(existingBill.payment_mode || 'Cash');
      setDiscount(Number(existingBill.discount || 0));
    }
    setInited(true);
  }

  const { data:partsData } = useQuery({
    queryKey: ['parts-list'],
    queryFn: () => partsApi.list({ limit:2000 }),
  });
  const allParts = partsData?.data?.items || partsData?.data || [];

  const updateRow   = (key, field, val) => setRows(p => p.map(r => r._key===key ? { ...r, [field]:val } : r));
  const addRow      = () => setRows(p => [...p, emptyRow()]);
  const removeRow   = key => {
    setRows(p => {
      // Backend now owns stock on save; no client-side adjust here.
      return p.filter(r => r._key!==key);
    });
  };
  const fillFromPart = (key, part) => setRows(p => p.map(r => r._key===key ? {
    ...r, description:part.name, hsn:part.hsn_code||'9987',
    unit_price:part.selling_price||0, gst_rate:part.gst_rate||18, _partNumber:part.part_number||null,
  } : r));

  // Per-line discount → rupees
  const lineDiscRs = (r) => {
    if (r.complimentary) return 0;
    const gross = r.unit_price * r.qty;
    const raw = r.discIsPct ? gross * (Number(r.discount) || 0) / 100 : (Number(r.discount) || 0);
    return Math.max(0, Math.min(gross, raw));
  };
  const validRows      = rows.filter(r => r.description && (r.unit_price > 0 || r.complimentary));
  const paidRows       = validRows.filter(r => !r.complimentary);
  const freeRows       = validRows.filter(r => r.complimentary);
  const grossTotal     = paidRows.reduce((s,r) => s + r.unit_price*r.qty, 0);
  const lineDiscTotal  = paidRows.reduce((s,r) => s + lineDiscRs(r), 0);
  const netTotal       = grossTotal - lineDiscTotal;
  const taxable        = paidRows.reduce((s,r) => {
    const net = r.unit_price*r.qty - lineDiscRs(r);
    return s + net / (1 + (r.gst_rate||0)/100);
  }, 0);
  const gstTotal       = netTotal - taxable;
  const cgst           = Math.round(gstTotal / 2 * 100) / 100;
  const sgst           = Math.round((gstTotal - cgst) * 100) / 100;   // CGST+SGST == GST total
  const preDiscount    = Math.round(netTotal);
  const discountVal    = Math.max(0, Math.min(Number(discount)||0, preDiscount));
  const grandTotal     = preDiscount - discountVal;
  const freeItemsValue = freeRows.reduce((s,r) => s + r.unit_price*r.qty, 0);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        job_id: jobId, payment_mode: payMode,
        discount: discountVal,
        items: validRows.map(r => ({
          description: r.description, hsn_code: r.hsn||'9987',
          qty: Number(r.qty), unit_price: Number(r.unit_price),
          gst_rate: Number(r.gst_rate), part_number: r._partNumber||'',
          discount: Math.round(lineDiscRs(r) * 100) / 100,
          complimentary: !!r.complimentary,
        })),
      };
      // Stock is now deducted transactionally on the backend (create/update).
      // On 409 insufficient_stock, saveMut.onError surfaces the shortage modal.
      // createBill/updateBill → billsApi
      const billId = existingBill?.id || existingBill?._id;
      return billId
        ? billsApi.update(billId, payload)
        : billsApi.create(payload);
    },
    onSuccess: (res) => {
      toast.success('Bill saved!');
      notifyLowStock(res?.data?.low_stock_alerts);
      qc.invalidateQueries(['service-bill', jobId]);
      qc.invalidateQueries(['service-jobs']);
      qc.invalidateQueries(['service-stats']);
      qc.invalidateQueries(['parts-list']);
      qc.invalidateQueries(['parts-stats']);
      onClose();
    },
    onError: e => {
      const d = e?.response?.data?.detail;
      if (d && typeof d === 'object' && d.error === 'insufficient_stock' && Array.isArray(d.shortages)) {
        setShortages(d.shortages);
        return;
      }
      toast.error(errMsg(e, 'Failed to save bill'));
    },
  });

  // Owner-only: bump stock by shortfall for each listed part, then re-save.
  const handleAdjustAndRetry = async () => {
    if (!isOwner || !shortages?.length) return;
    setAdjusting(true);
    try {
      await Promise.all(shortages.map(s =>
        partsApi.adjustStockByNumber(s.part_number, {
          qty: (s.need - s.have),
          action: 'add',
          reason: 'service_bill_reconcile',
        })
      ));
      qc.invalidateQueries(['parts-list']);
      setShortages(null);
      saveMut.mutate();
    } catch (err) {
      toast.error(errMsg(err, 'Adjust failed'));
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <ModalShell onClose={onClose}
      title={`${job.job_number||(jobId||'').slice(-6)}, ${job.customer_name}`}
      sub={`${job.vehicle_number||''} · ${job.brand||''} ${job.model||''}`}>
      {loadingBill ? (
        <div style={{ padding:32, textAlign:'center', color:C.muted, fontSize:13 }}>Loading bill…</div>
      ) : (
        <div style={{ padding:'16px 20px 0' }}>
          {existingBill && (
            <div style={{ marginBottom:12, padding:'8px 14px', borderRadius:4, fontSize:11,
              fontWeight:600, color:C.gold, background:'rgba(184,134,11,.08)',
              border:'1px solid rgba(184,134,11,.25)' }}>
              Editing saved bill: {existingBill.bill_number}
            </div>
          )}
          <div style={{ overflowX:'auto', marginBottom:8 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr className="bill-head">
                  {['Description / Part','HSN','Qty','Unit Price (₹)','Discount','Free','GST%','CGST%','SGST%','Amount',''].map((h,i) => (
                    <th key={i} style={{ textAlign:i>=2 && i!==5?'right':(i===5?'center':'left') }}>{h || <span className="visually-hidden">Remove</span>}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <BillRow key={row._key} row={row} idx={idx} allParts={allParts}
                    onChange={updateRow} onRemove={removeRow} onSelectPart={fillFromPart} />
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, flexWrap:'wrap' }}>
            <button onClick={addRow} className="btn btn-ghost btn-sm" >
              + Add line item
            </button>
            {/* Physical barcode scanner input */}
            <input
              value={barcodeVal}
              onChange={e => setBarcodeVal(e.target.value)}
              onKeyDown={handleBarcodeKey}
              placeholder="Scan barcode or type part no. + Enter"
              style={{ background:C.s2, border:`1px solid ${C.border}`, borderRadius:3, padding:'5px 10px',
                color:C.text, fontSize:11, fontFamily:'var(--font-outlier)', width:240, outline:'none' }}
            />
            {/* Camera scan button */}
            <button onClick={scanning ? stopCamera : startCamera}
              className="btn btn-ghost btn-sm" style={{ border: scanning ? '1px solid rgba(239,68,68,.5)' : undefined,
                color: scanning ? 'var(--red)' : undefined }}>
              {scanning ? 'Stop Camera' : 'Scan Barcode'}
            </button>
          </div>
          {camError && (
            <div style={{ fontSize:11, color:'var(--red)', marginBottom:8, padding:'6px 10px',
              background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.2)', borderRadius:3 }}>
              {camError}
            </div>
          )}
          {/* Camera viewfinder */}
          {scanning && (
            <div style={{ marginBottom:12, position:'relative', display:'inline-block' }}>
              <video ref={videoRef} autoPlay playsInline muted
                style={{ width:300, height:200, objectFit:'cover', borderRadius:4,
                  border:'2px solid var(--accent)', display:'block' }} />
              <div style={{ position:'absolute', inset:0, border:'2px solid rgba(184,134,11,.6)',
                borderRadius:4, pointerEvents:'none', boxShadow:'inset 0 0 0 40px rgba(0,0,0,.25)' }} />
              <div style={{ position:'absolute', bottom:8, left:0, right:0, textAlign:'center',
                fontSize:10, color:'var(--color-ink)', textShadow:'0 1px 2px rgba(0,0,0,.8)' }}>
                Point camera at barcode
              </div>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
            <div style={{ minWidth:260 }}>
              {lineDiscTotal > 0 && (
                <>
                  <TotRow label="Gross"          val={`${RS}${fmtI(Math.round(grossTotal))}`} />
                  <TotRow label="Line Discount"  val={`− ${RS}${fmtI(Math.round(lineDiscTotal))}`} />
                </>
              )}
              <TotRow label="Taxable Amount" val={`${RS}${fmt(taxable)}`} />
              <TotRow label="CGST"           val={`${RS}${fmt(cgst)}`} />
              <TotRow label="SGST"           val={`${RS}${fmt(sgst)}`} />
              <TotRow label="Subtotal"       val={`${RS}${fmtI(preDiscount)}`} />
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:`1px solid ${C.border}`, fontSize:12 }}>
                <span style={{ color:C.muted }}>Discount</span>
                <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ color:C.muted }}>{RS}</span>
                  <input
                    type="number" min="0" step="1"
                    value={discount}
                    onChange={e => setDiscount(e.target.value)}
                    onFocus={e => e.target.select()}
                    style={{ ...inp, width:80, padding:'4px 8px', textAlign:'right', fontSize:12 }}
                  />
                </div>
              </div>
              <TotRow label="Total"          val={`${RS}${fmtI(grandTotal)}`} bold gold />
              <div style={{ fontSize:10, color:C.muted, fontStyle:'italic', textAlign:'right', marginTop:4 }}>
                {numWords(grandTotal)} Rupees Only
              </div>
              {freeRows.length > 0 && (
                <div style={{ marginTop:8, padding:'6px 10px', background:'rgba(184,134,11,.08)', border:'1px solid rgba(184,134,11,.25)', borderRadius:3, fontSize:11, color:C.gold, textAlign:'right' }}>
                  {freeRows.length} free item{freeRows.length>1?'s':''} · MRP {RS}{fmtI(Math.round(freeItemsValue))}
                </div>
              )}
            </div>
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={labelSt}>Payment mode</label>
            <select value={payMode} onChange={e => setPayMode(e.target.value)} style={{ ...inp, maxWidth:200 }}>
              {['Cash','UPI','Card','Bank Transfer','Credit'].map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
      )}
      <ModalFoot>
        <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        {existingBill && (
          <button onClick={() => printBill(job, existingBill, validRows, grandTotal, taxable, cgst, sgst, discountVal, preDiscount)}
            className="btn btn-ghost" style={{ color:C.gold, borderColor:'rgba(184,134,11,.4)' }}>
            🖨 Print Bill
          </button>
        )}
        <button onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending || validRows.length===0}
          className="btn btn-primary" style={{ opacity:saveMut.isPending||validRows.length===0 ? .5 : 1 }}>
          {saveMut.isPending ? 'Saving…' : existingBill ? 'Update Bill' : 'Generate Bill'}
        </button>
      </ModalFoot>
      {shortages && (
        <StockShortageModal
          shortages={shortages}
          isOwner={isOwner}
          adjusting={adjusting}
          onAdjustAndRetry={handleAdjustAndRetry}
          onCancel={() => setShortages(null)}
        />
      )}
    </ModalShell>
  );
}

// ─── Stock Shortage Modal (surfaces 409 insufficient_stock from service bill save) ──
function StockShortageModal({ shortages, isOwner, adjusting, onAdjustAndRetry, onCancel }) {
  return (
    <div className="dialog-backdrop" style={{ zIndex:'calc(var(--z-modal) + 20)' }}>
      <div className="dialog dialog-wide shortage" role="alertdialog" aria-modal="true" aria-labelledby="shortage-title">
        <h2 id="shortage-title" className="dialog-title shortage-title">Insufficient stock: bill not saved</h2>
        <p className="dialog-sub">
          The following parts don’t have enough stock recorded to fulfil this bill.
          No changes have been made. Fix stock first, then save.
        </p>
        <div className="table-wrap">
        <table className="data-table shortage-table">
          <thead>
            <tr>
              {['Part', 'Have', 'Need', 'Short by'].map((h,i) => (
                <th key={i} className={i===0 ? undefined : 'num'}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shortages.map((s, i) => (
              <tr key={i}>
                <td>
                  <div>{s.name || s.part_number}</div>
                  {s.name && s.part_number && (
                    <div className="mono cell-sub">{s.part_number}</div>
                  )}
                </td>
                <td className="num">{s.have}</td>
                <td className="num">{s.need}</td>
                <td className="num" style={{ color:'var(--color-error)', fontWeight:600 }}>
                  {s.need - s.have}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {isOwner && (
          <div className="notice notice-warn">
            Only click <b>Adjust & Retry</b> if these parts are <b>physically in stock</b>.
            This bumps on-record stock without a purchase bill. Audit trail: <code>service_bill_reconcile</code>.
          </div>
        )}
        {!isOwner && (
          <div className="notice">
            Ask the owner to adjust stock, or open Parts and record the incoming stock properly.
          </div>
        )}
        <div className="dialog-actions" style={{ padding:0, marginTop:'var(--space-md)' }}>
          <button type="button" onClick={onCancel} disabled={adjusting} className="btn btn-ghost">
            Cancel
          </button>
          {isOwner && (
            <button type="button" onClick={onAdjustAndRetry} disabled={adjusting} className="btn btn-primary" aria-busy={adjusting || undefined}>
              {adjusting ? 'Adjusting…' : 'Adjust & Retry'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Bill Row ─────────────────────────────────────────────────────────────────
function BillRow({ row, idx, allParts, onChange, onRemove, onSelectPart }) {
  const [search, setSearch]     = useState('');
  const [showDrop, setShowDrop] = useState(false);
  const inputRef                = useRef(null);
  const [dropPos, setDropPos]   = useState(null);

  const filtered = search.length > 1
    ? allParts.filter(p =>
        p.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.part_number?.toLowerCase().includes(search.toLowerCase())
      ).slice(0,8)
    : [];

  // Position dropdown via fixed coords so it escapes td/modal overflow clipping
  useEffect(() => {
    if (!showDrop || filtered.length === 0 || !inputRef.current) return;
    const update = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (!r) return;
      const minWidth = Math.max(r.width, 320);
      const maxWidth = Math.min(minWidth, window.innerWidth - r.left - 12);
      const spaceBelow = window.innerHeight - r.bottom;
      const openUp = spaceBelow < 220 && r.top > spaceBelow;
      setDropPos({
        left: r.left,
        top:  openUp ? undefined : r.bottom + 2,
        bottom: openUp ? window.innerHeight - r.top + 2 : undefined,
        width: maxWidth,
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [showDrop, filtered.length]);

  const gross    = row.unit_price * row.qty;
  const rawDisc  = row.complimentary ? 0 : (row.discIsPct ? gross * (Number(row.discount)||0) / 100 : (Number(row.discount)||0));
  const dRs      = Math.max(0, Math.min(gross, rawDisc));
  const amount   = row.complimentary ? 0 : gross - dRs;

  return (
    <tr style={{ background: row.complimentary ? 'rgba(184,134,11,.06)' : (idx%2===0?'transparent':C.s2) }}>
      <td style={{ padding:'6px 8px', minWidth:190, position:'relative' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <input ref={inputRef} value={row.description}
            onChange={e => { onChange(row._key,'description',e.target.value); setSearch(e.target.value); setShowDrop(true); }}
            onFocus={() => { if (row.description) setSearch(row.description); setShowDrop(true); }}
            onBlur={() => setTimeout(()=>setShowDrop(false),160)}
            placeholder="Labour / part name" style={{ ...inp, flex:1 }} />
          {row.complimentary && (
            <span className="pill pill-amber">Free</span>
          )}
        </div>
        {showDrop && filtered.length > 0 && dropPos && createPortal(
          <div style={{ position:'fixed', left:dropPos.left, top:dropPos.top, bottom:dropPos.bottom,
            width:dropPos.width, background:C.surface,
            border:`1px solid ${C.border}`, borderRadius:4, zIndex:10000,
            boxShadow:'0 8px 24px rgba(0,0,0,.5)', maxHeight:360, overflowY:'auto' }}>
            {filtered.map(p => (
              <div key={p._id}
                onMouseDown={() => { onSelectPart(row._key,p); setSearch(''); setShowDrop(false); }}
                style={{ padding:'9px 12px', cursor:'pointer', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}
                onMouseEnter={e=>e.currentTarget.style.background=C.s2}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}
              >
                <div style={{ minWidth:0, flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:600 }}>{p.name}</div>
                  <div style={{ fontSize:10, color:C.muted }}>{p.part_number}{p.category ? ` · ${p.category}` : ''}</div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.gold }}>{RS}{p.selling_price}</div>
                  <div style={{ fontSize:10, color: p.stock <= 5 ? C.amber : C.green }}>Stock: {p.stock}</div>
                </div>
              </div>
            ))}
          </div>,
          document.body
        )}
      </td>
      <td style={{ padding:'6px 6px', width:76 }}>
        <input value={row.hsn} onChange={e=>onChange(row._key,'hsn',e.target.value)} placeholder="9987" style={inp}/>
      </td>
      <td style={{ padding:'6px 6px', width:60 }}>
        <input type="number" min="1" value={row.qty}
          onChange={e=>onChange(row._key,'qty',Math.max(1,Number(e.target.value)))}
          style={{ ...inp, textAlign:'right' }}/>
      </td>
      <td style={{ padding:'6px 6px', width:100 }}>
        <input type="number" min="0" value={row.unit_price}
          onChange={e=>onChange(row._key,'unit_price',Number(e.target.value))}
          disabled={row.complimentary}
          style={{ ...inp, textAlign:'right', textDecoration: row.complimentary ? 'line-through' : 'none', opacity: row.complimentary ? .5 : 1 }}/>
      </td>
      <td style={{ padding:'6px 4px', width:110 }}>
        <div style={{ display:'flex', gap:2, alignItems:'center' }}>
          <input type="number" min="0" value={row.discount || 0}
            disabled={row.complimentary}
            onChange={e => onChange(row._key,'discount',Math.max(0, Number(e.target.value)))}
            style={{ ...inp, textAlign:'right', width:64, opacity: row.complimentary ? .5 : 1 }} />
          <button type="button" disabled={row.complimentary}
            onClick={() => { onChange(row._key,'discIsPct', !row.discIsPct); onChange(row._key,'discount',0); }}
            aria-pressed={row.discIsPct} aria-label="Discount in percent"
            className="unit-toggle">
            {row.discIsPct ? '%' : '₹'}
          </button>
        </div>
      </td>
      <td style={{ padding:'6px 6px', width:56, textAlign:'center' }} title="Free / complimentary">
        <input type="checkbox" checked={!!row.complimentary}
          onChange={e => onChange(row._key,'complimentary', e.target.checked)}
          style={{ cursor:'pointer', accentColor: C.gold }} />
      </td>
      <td style={{ padding:'6px 6px', width:72 }}>
        <select value={row.gst_rate} onChange={e=>onChange(row._key,'gst_rate',Number(e.target.value))} disabled={row.complimentary} style={{ ...inp, opacity: row.complimentary ? .5 : 1 }}>
          {[0,5,12,18,28].map(r=><option key={r} value={r}>{r}%</option>)}
        </select>
      </td>
      <td style={{ padding:'6px 10px', textAlign:'center', fontSize:11, color:'var(--muted)' }}>
        {(row.gst_rate/2).toFixed(1).replace('.0','')}%
      </td>
      <td style={{ padding:'6px 10px', textAlign:'center', fontSize:11, color:'var(--muted)' }}>
        {(row.gst_rate/2).toFixed(1).replace('.0','')}%
      </td>
      <td style={{ padding:'6px 10px', textAlign:'right', fontWeight:600, fontSize:12, whiteSpace:'nowrap' }}>
        {RS}{fmtI(Math.round(amount))}
      </td>
      <td style={{ padding:'6px 6px', width:26 }}>
        <button onClick={()=>onRemove(row._key)}
          style={{ background:'transparent', border:'none', color:C.red, cursor:'pointer', fontSize:16, padding:0 }}>×</button>
      </td>
    </tr>
  );
}

function TotRow({ label, val, bold, gold }) {
  return (
    <div className={`tot-row${bold ? ' is-bold' : ''}${gold ? ' is-key' : ''}`}>
      <span>{label}</span><span>{val}</span>
    </div>
  );
}
