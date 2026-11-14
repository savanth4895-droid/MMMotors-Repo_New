import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { partsApi, errMsg } from '../../api/client';
import toast from 'react-hot-toast';
import { useConfirm } from '../../components/ConfirmModal';
import { escapeDeep } from '../../utils/escapeHtml';

// ── Parts Order Modal (low stock) ────────────────────────────────────
export function PartsOrderModal({ onClose }) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['parts-low-stock-order'],
    // include_out: a part at zero stock is the most urgent thing to order, and the
    // plain low-stock query leaves those out.
    queryFn: () => partsApi.lowStock({ include_out: true }).then(r => r.data),
  });
  const lowParts = Array.isArray(data) ? data : [];
  const byUrgency = (a, b) => (a.stock - b.stock) || String(a.name).localeCompare(String(b.name));
  const priorityParts = lowParts.filter(p => p.priority).sort(byUrgency);
  const otherParts    = lowParts.filter(p => !p.priority).sort(byUrgency);

  const [showSuggest, setShowSuggest] = useState(false);
  const { data: suggestData, isLoading: suggestLoading } = useQuery({
    queryKey: ['parts-suggest-priority'],
    queryFn: () => partsApi.suggestPriority({ days: 60, limit: 15 }).then(r => r.data),
    enabled: showSuggest,
  });
  const suggestions = suggestData?.parts || [];

  const starMut = useMutation({
    mutationFn: ({ id, reorder_level }) =>
      partsApi.update(id, reorder_level ? { priority: true } : { priority: true, reorder_level: 5 }),
    onSuccess: () => {
      qc.invalidateQueries(['parts-suggest-priority']); qc.invalidateQueries(['parts-low-stock-order']);
      qc.invalidateQueries(['parts']); qc.invalidateQueries(['parts-stats']);
      toast.success('Added to priority list');
    },
    onError: e => toast.error(errMsg(e, 'Could not add')),
  });

  // inline edit state: { [partId]: { reorder_level: number } }
  const [editing, setEditing] = useState({});
  const [saving, setSaving]   = useState({});
  const [adding, setAdding]   = useState(false);
  const [newPart, setNewPart] = useState({ part_number:'', name:'', brand:'', category:'', stock:0, reorder_level:5, purchase_price:0, selling_price:0, gst_rate:18, hsn_code:'' });

  // ── Bulk selection ────────────────────────────────────────────────
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const toggleOne = (id) => setSelected(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const allSelected = lowParts.length > 0 && lowParts.every(p => selected.has(p.id));
  const toggleAll   = () => setSelected(allSelected ? new Set() : new Set(lowParts.map(p => p.id)));

  // Marks the selected parts as ordered from the vendor. The old version of this
  // button set reorder_level to 0, which hid the part from every future low-stock
  // check — it never warned again. Now the part stays listed, stamped with the date,
  // and the stamp clears itself when the stock arrives.
  const bulkMarkOrdered = async () => {
    if (selected.size === 0) return;
    if (!(await confirm(`Mark ${selected.size} part${selected.size > 1 ? 's' : ''} as ordered from the vendor?`, { danger:false }))) return;
    setBulkDeleting(true);
    try {
      await Promise.all([...selected].map(id => partsApi.markOrdered(id, true)));
      qc.invalidateQueries(['parts-low-stock-order']);
      qc.invalidateQueries(['parts']);
      qc.invalidateQueries(['parts-stats']);
      toast.success(`${selected.size} part${selected.size > 1 ? 's' : ''} marked as ordered`);
      setSelected(new Set());
    } catch { toast.error('Some updates failed'); }
    finally { setBulkDeleting(false); }
  };

  const startEdit = (p) => setEditing(prev => ({ ...prev, [p.id]: { reorder_level: p.reorder_level } }));
  const cancelEdit = (id) => setEditing(prev => { const n={...prev}; delete n[id]; return n; });

  const saveEdit = async (p) => {
    setSaving(prev => ({ ...prev, [p.id]: true }));
    try {
      await partsApi.update(p.id, { reorder_level: Number(editing[p.id].reorder_level) });
      qc.invalidateQueries(['parts-low-stock-order']);
      qc.invalidateQueries(['parts']);
      toast.success('Reorder level updated');
      cancelEdit(p.id);
    } catch { toast.error('Failed to update'); }
    finally { setSaving(prev => ({ ...prev, [p.id]: false })); }
  };

  const toggleOrdered = async (p) => {
    try {
      await partsApi.markOrdered(p.id, !p.ordered_at);
      qc.invalidateQueries(['parts-low-stock-order']);
      qc.invalidateQueries(['parts']);
      qc.invalidateQueries(['parts-stats']);
      setSelected(prev => { const n = new Set(prev); n.delete(p.id); return n; });
      toast.success(p.ordered_at ? 'Order mark cleared' : 'Marked as ordered');
    } catch(e) { toast.error(errMsg(e, 'Failed to update')); }
  };

  const addPart = async () => {
    if (!newPart.part_number || !newPart.name) return toast.error('Part number and name required');
    try {
      await partsApi.create(newPart);
      qc.invalidateQueries(['parts-low-stock-order']);
      qc.invalidateQueries(['parts']);
      qc.invalidateQueries(['parts-stats']);
      toast.success('Part added');
      setAdding(false);
      setNewPart({ part_number:'', name:'', brand:'', category:'', stock:0, reorder_level:5, purchase_price:0, selling_price:0, gst_rate:18, hsn_code:'' });
    } catch(e) { toast.error(errMsg(e,'Failed to add')); }
  };

  const inp = { width:'100%', minHeight:30, padding:'var(--space-3xs) var(--space-xs)', fontSize:'var(--text-sm)' };

  const handlePrint = () => {
    // Priority parts first — that is the order the counter should work through them.
    const rows = escapeDeep([...priorityParts, ...otherParts]).map(p => `
      <tr>
        <td>${p.priority ? '★' : ''}</td>
        <td>${p.part_number}</td>
        <td>${p.name}${p.ordered_at ? ' <span style="color:#16a34a;font-size:10px">(ordered)</span>' : ''}</td>
        <td>${p.brand||'—'}</td>
        <td>${p.category||'—'}</td>
        <td style="color:#dc2626;font-weight:700">${p.stock}</td>
        <td>${p.reorder_level}</td>
        <td>${p.reorder_level - p.stock + 10}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><title>Parts Reorder List</title>
    <style>body{font-family:Arial,sans-serif;padding:24px}h2{margin-bottom:4px}p{color:#666;font-size:12px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse}th{background:#B8860B;color:#fff;padding:8px 10px;font-size:11px;text-align:left;letter-spacing:.05em;text-transform:uppercase}
    td{padding:8px 10px;border-bottom:1px solid #eee;font-size:12px}tr:nth-child(even){background:#f9f9f9}
    @media print{body{padding:10px}}</style></head><body>
    <h2>MM Motors — Parts Reorder List</h2>
    <p>Generated: ${new Date().toLocaleDateString('en-IN')} | ${lowParts.length} items at or below reorder level, ${priorityParts.length} priority</p>
    <table><thead><tr><th>★</th><th>Part No.</th><th>Name</th><th>Brand</th><th>Category</th><th>Current Stock</th><th>Reorder Level</th><th>Suggested Order</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <script>window.onload=()=>{window.print();}</script></body></html>`;
    const w = window.open('','_blank');
    w.document.write(html);
    w.document.close();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={onClose}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, width:860, maxWidth:'96vw', maxHeight:'90vh', display:'flex', flexDirection:'column' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ background:'var(--color-paper-2)', padding:'16px 20px', borderRadius:'8px 8px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:700 }}>Parts Reorder List</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
              {priorityParts.length > 0
                ? `${priorityParts.length} priority part${priorityParts.length > 1 ? 's' : ''} to order now`
                : 'Parts at or below reorder level'}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {selected.size > 0 && (
              <button onClick={bulkMarkOrdered} disabled={bulkDeleting}
                style={{ padding:'7px 14px', background:'rgba(34,197,94,.12)', border:'1px solid rgba(34,197,94,.4)', borderRadius:4, color:'var(--color-success)', fontSize:11, cursor:'pointer', fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
                {bulkDeleting ? 'Saving…' : `Mark ${selected.size} as ordered`}
              </button>
            )}
            <button onClick={() => setShowSuggest(v => !v)}
              style={{ padding:'7px 14px', background:'transparent', border:'1px solid var(--border)', borderRadius:4, color:'var(--muted)', fontSize:11, cursor:'pointer', fontWeight:600 }}>
              {showSuggest ? 'Hide suggestions' : 'Suggest priority parts'}
            </button>
            <button onClick={() => setAdding(v => !v)}
              style={{ padding:'7px 14px', background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.35)', borderRadius:4, color:'var(--color-success)', fontSize:11, cursor:'pointer', fontWeight:600 }}>
              + Add Part
            </button>
            {lowParts.length > 0 && (
              <button onClick={handlePrint}
                style={{ padding:'7px 14px', background:'rgba(184,134,11,.15)', border:'1px solid rgba(184,134,11,.4)', borderRadius:4, color:'var(--accent)', fontSize:11, cursor:'pointer', fontWeight:600 }}>
                Print Order List
              </button>
            )}
            <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--muted)', fontSize:20, cursor:'pointer' }}>×</button>
          </div>
        </div>

        {/* Suggested priority parts — most used in the last 60 days, from the stock log */}
        {showSuggest && (
          <div style={{ padding:'14px 20px', background:'var(--color-paper-2)', borderBottom:'1px solid var(--border)', flexShrink:0, maxHeight:220, overflowY:'auto' }}>
            <div style={{ fontSize:11, fontWeight:700, marginBottom:2 }}>Your fastest-moving parts, last 60 days</div>
            <div style={{ fontSize:10, color:'var(--muted)', marginBottom:10 }}>
              Counted from bills already in the system. Starring one means you get an alert the moment it runs low.
            </div>
            {suggestLoading ? (
              <div style={{ fontSize:11, color:'var(--muted)' }}>Working it out…</div>
            ) : suggestions.length === 0 ? (
              <div style={{ fontSize:11, color:'var(--muted)' }}>
                Nothing to suggest — either every fast mover is already starred, or there are no parts on bills from the last 60 days.
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {suggestions.map(s => (
                  <div key={s.id} style={{ display:'flex', alignItems:'center', gap:10, fontSize:11 }}>
                    <button onClick={() => starMut.mutate({ id:s.id, reorder_level:s.reorder_level })} disabled={starMut.isPending}
                      title={`Add ${s.name} to the priority list`}
                      style={{ padding:'2px 9px', background:'rgba(184,134,11,.15)', border:'1px solid rgba(184,134,11,.4)', borderRadius:3, color:'var(--accent)', fontSize:10, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
                      ☆ Add
                    </button>
                    <span style={{ fontWeight:600, flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.name}</span>
                    <span className="mono" style={{ fontSize:10, color:'var(--muted)', flexShrink:0 }}>{s.part_number}</span>
                    <span style={{ fontSize:10, color:'var(--muted)', flexShrink:0, width:120, textAlign:'right' }}>
                      {s.used} used · {s.times} bill{s.times === 1 ? '' : 's'}
                    </span>
                    <span style={{ fontSize:10, color:'var(--muted)', flexShrink:0, width:70, textAlign:'right' }}>stock {s.stock}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Add Part Form */}
        {adding && (
          <div style={{ padding:'14px 20px', background:'rgba(34,197,94,.05)', borderBottom:'1px solid var(--border)', display:'grid', gridTemplateColumns:'repeat(5,1fr) auto', gap:8, alignItems:'end', flexShrink:0 }}>
            {[['Part No.','part_number','text'],['Name','name','text'],['Brand','brand','text'],['Stock','stock','number'],['Reorder Lvl','reorder_level','number']].map(([label,key,type])=>(
              <div key={key}>
                <div style={{ fontSize:9, color:'var(--muted)', marginBottom:3 }}>{label}</div>
                <input type={type} value={newPart[key]} onChange={e=>setNewPart(p=>({...p,[key]:type==='number'?Number(e.target.value):e.target.value}))} style={inp} />
              </div>
            ))}
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={addPart} style={{ padding:'5px 12px', background:'var(--color-success)', border:'none', borderRadius:3, color:'var(--color-ink)', fontSize:11, fontWeight:700, cursor:'pointer' }}>Add</button>
              <button onClick={()=>setAdding(false)} style={{ padding:'5px 10px', background:'transparent', border:'1px solid var(--border)', borderRadius:3, color:'var(--muted)', fontSize:11, cursor:'pointer' }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Table */}
        <div style={{ overflowY:'auto', flex:1 }}>
          {isLoading ? (
            <div style={{ padding:24, color:'var(--muted)', fontSize:12 }}>Loading…</div>
          ) : lowParts.length === 0 ? (
            <div style={{ padding:48, textAlign:'center', color:'var(--muted)', fontSize:12 }}>
              All parts are well stocked!
            </div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--border)' }}>
                  {/* Select-all checkbox */}
                  <th style={{ padding:'9px 10px 9px 16px', width:36 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      title={allSelected ? 'Deselect all' : 'Select all'}
                      style={{ cursor:'pointer', accentColor:'var(--accent)', width:14, height:14 }}
                    />
                  </th>
                  {['Part No.','Name','Brand','Category','Stock','Reorder','Suggested Order','Actions'].map(h => (
                    <th key={h} style={{ padding:'9px 16px', textAlign:'left', fontSize:9, color:'var(--dim)', fontWeight:600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[['Order now — priority parts', priorityParts], ['Can wait', otherParts]].map(([heading, group]) => group.length === 0 ? null : [
                  <tr key={heading}>
                    <th colSpan={9} scope="colgroup"
                      style={{ padding:'8px 16px', textAlign:'left', fontSize:10, fontWeight:700, letterSpacing:'.04em', textTransform:'uppercase',
                               color: group === priorityParts ? 'var(--color-warn)' : 'var(--muted)', background:'var(--color-paper-2)' }}>
                      {heading} ({group.length})
                    </th>
                  </tr>,
                  ...group.map(p => {
                  const isEditing  = !!editing[p.id];
                  const isSelected = selected.has(p.id);
                  return (
                    <tr key={p.id} style={{ borderBottom:'1px solid var(--border)', background: isSelected ? 'rgba(239,68,68,.05)' : isEditing ? 'rgba(184,134,11,.05)' : 'transparent', transition:'background .1s' }}>
                      {/* Row checkbox */}
                      <td style={{ padding:'10px 10px 10px 16px' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(p.id)}
                          style={{ cursor:'pointer', accentColor:'var(--color-error)', width:14, height:14 }}
                        />
                      </td>
                      <td className="mono" style={{ padding:'10px 16px', fontSize:10, color:'var(--blue)' }}>{p.part_number}</td>
                      <td style={{ padding:'10px 16px', fontSize:11, fontWeight:600 }}>
                        {p.name}
                        {p.ordered_at && (
                          <span style={{ display:'block', fontSize:9, fontWeight:600, color:'var(--color-success)' }}>
                            Ordered {new Date(p.ordered_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}
                            {p.ordered_by ? ` · ${p.ordered_by}` : ''}
                          </span>
                        )}
                      </td>
                      <td style={{ padding:'10px 16px', fontSize:10, color:'var(--muted)' }}>{p.brand||'—'}</td>
                      <td style={{ padding:'10px 16px', fontSize:10, color:'var(--muted)' }}>{p.category||'—'}</td>
                      <td style={{ padding:'10px 16px' }}>
                        <span style={{ fontSize:14, fontWeight:800, color:p.stock===0?'var(--color-error)':'var(--color-warn)' }}>{p.stock}</span>
                      </td>
                      <td style={{ padding:'10px 16px', fontSize:11, color:'var(--muted)' }}>
                        {isEditing ? (
                          <input type="number" min="1" value={editing[p.id].reorder_level}
                            onChange={e => setEditing(prev => ({ ...prev, [p.id]: { ...prev[p.id], reorder_level: e.target.value } }))}
                            style={{ ...inp, width:60 }} autoFocus />
                        ) : p.reorder_level}
                      </td>
                      <td style={{ padding:'10px 16px' }}>
                        <span style={{ fontSize:12, fontWeight:700, color:'var(--accent)' }}>
                          {Math.max((p.reorder_level||5) - p.stock + 10, 10)} units
                        </span>
                      </td>
                      <td style={{ padding:'10px 12px', whiteSpace:'nowrap' }}>
                        {isEditing ? (
                          <div style={{ display:'flex', gap:5 }}>
                            <button onClick={() => saveEdit(p)} disabled={saving[p.id]}
                              style={{ padding:'3px 10px', background:'var(--color-accent)', border:'none', borderRadius:3, color:'var(--color-ink)', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                              {saving[p.id] ? '…' : 'Save'}
                            </button>
                            <button onClick={() => cancelEdit(p.id)}
                              style={{ padding:'3px 8px', background:'transparent', border:'1px solid var(--border)', borderRadius:3, color:'var(--muted)', fontSize:10, cursor:'pointer' }}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div style={{ display:'flex', gap:5 }}>
                            <button onClick={() => startEdit(p)}
                              style={{ padding:'3px 10px', background:'rgba(184,134,11,.12)', border:'1px solid rgba(184,134,11,.3)', borderRadius:3, color:'var(--accent)', fontSize:10, cursor:'pointer' }}>
                              Edit
                            </button>
                            <button onClick={() => toggleOrdered(p)}
                              title={p.ordered_at ? 'Clear the order mark' : 'Record that you have ordered this from the vendor'}
                              style={{ padding:'3px 8px', background: p.ordered_at ? 'transparent' : 'rgba(34,197,94,.1)', border:`1px solid ${p.ordered_at ? 'var(--border)' : 'rgba(34,197,94,.35)'}`, borderRadius:3, color: p.ordered_at ? 'var(--muted)' : 'var(--color-success)', fontSize:10, cursor:'pointer' }}>
                              {p.ordered_at ? 'Not ordered' : 'Mark ordered'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })])}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
