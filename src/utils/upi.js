// Scan-to-pay UPI QR for printed bills. The shop's UPI account lives here only.
import { BASE_URL } from '../api/client';

export const UPI_ID   = 'mmmotors3123@okhdfcbank';
export const UPI_NAME = 'MM Motors';

// HTML block for a bill. With an amount, the customer's UPI app opens with it filled in;
// without one (vehicle sales, often financed or part-paid) they type the amount.
export function upiQrHtml({ amount, note } = {}) {
  let link = `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(UPI_NAME)}&cu=INR`;
  if (amount > 0) link += `&am=${Number(amount).toFixed(2)}`;
  if (note)       link += `&tn=${encodeURIComponent(note)}`;
  const src = `${BASE_URL}/api/qr.svg?data=${encodeURIComponent(link)}`;
  const amt = amount > 0 ? `<div style="font-size:12px;font-weight:700;margin-top:2px">₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 })}</div>` : '';
  // If the QR can't load (server waking up), the bill still prints, just without it
  return `<div style="display:flex;align-items:center;gap:12px;margin:12px 0;break-inside:avoid">
    <img src="${src}" width="96" height="96" alt="UPI payment QR code" style="display:block" onerror="this.parentNode.style.display='none'" />
    <div style="font-size:11px;line-height:1.4;color:#333">
      <div style="font-weight:700;font-size:12px">Scan to pay with any UPI app</div>${amt}
      <div style="font-family:monospace;color:#555">${UPI_ID}</div>
      <div style="color:#888">GPay · PhonePe · Paytm · BHIM</div>
    </div>
  </div>`;
}
