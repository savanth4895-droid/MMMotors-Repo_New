import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { partsApi, errMsg } from '../api/client';
import { Btn, GhostBtn, Skeleton, Empty, ApiError, useSortable } from '../components/ui';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';
import { ViewBillModal, EditBillModal } from './parts/BillModals';
import { NewBillForm } from './parts/NewBillForm';
import { PartForm } from './parts/PartForm';
import { PartsBillModal } from './parts/PartsBillModal';
import { PartsOrderModal } from './parts/PartsOrderModal';
import { CATEGORIES, stockStyle } from './parts/shared';

const NO_CATEGORY = '__none__';   // category filter value: parts with no category yet

// ── Main page ────────────────────────────────────────────────────────
export default function PartsPage() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [tab,           setTab]           = useState('stock');
  const [view,          setView]          = useState('list');
  const [search,        setSearch]        = useState('');
  const [cat,           setCat]           = useState('');
  const [filter,        setFilter]        = useState('all');
  const [partsBillOpen, setPartsBillOpen] = useState(false);
  const [orderOpen,     setOrderOpen]     = useState(false);
  const [editPart,      setEditPart]      = useState(null);
  const [viewBill,      setViewBill]      = useState(null);
  const [editBill,      setEditBill]      = useState(null);

  const { data:statsData } = useQuery({
    queryKey:['parts-stats'],
    refetchInterval: 30_000,
    queryFn: ()=>partsApi.stats().then(r=>r.data),
  });
  const { data, isLoading, error } = useQuery({
    queryKey:['parts', search, cat, filter],
    queryFn: ()=>partsApi.list({ search:search||undefined, category:(cat && cat!==NO_CATEGORY) ? cat : undefined, limit:2000 }).then(r=>r.data),
  });
  // 1. Bills History now shows parts-bills (from service PartsBillModal)
  const { data:billsData, isLoading:billsLoading } = useQuery({
    queryKey:['parts-bills-list'],
    queryFn: ()=>partsApi.listBills({ limit:100 }).then(r=>r.data),
    enabled: tab==='bills',
  });

  const createMut = useMutation({
    mutationFn: d=>partsApi.create(d),
    onSuccess: ()=>{ qc.invalidateQueries(['parts']); qc.invalidateQueries(['parts-stats']); setView('list'); toast.success('Part added'); },
    onError:   e=>toast.error(errMsg(e, 'Failed')),
  });
  const updateMut = useMutation({
    mutationFn: ({id,data})=>partsApi.update(id,data),
    onSuccess: ()=>{ qc.invalidateQueries(['parts']); qc.invalidateQueries(['parts-stats']); setEditPart(null); toast.success('Part updated'); },
    onError:   e=>toast.error(errMsg(e, 'Update failed')),
  });
  const deleteMut = useMutation({
    mutationFn: id=>partsApi.delete(id),
    onSuccess: ()=>{ qc.invalidateQueries(['parts']); qc.invalidateQueries(['parts-stats']); toast.success('Part deleted'); },
    onError:   ()=>toast.error('Delete failed'),
  });
  const adjustMut = useMutation({
    mutationFn: ({id,qty,reason})=>partsApi.adjustStock(id,{qty,reason}),
    onSuccess: ()=>{ qc.invalidateQueries(['parts']); qc.invalidateQueries(['parts-stats']); toast.success('Stock updated'); },
    onError: ()=>toast.error('Adjust failed'),
  });
  const deleteBillMut = useMutation({
    mutationFn: id=>partsApi.deleteBill(id),
    onSuccess: ()=>{ qc.invalidateQueries(['parts-bills-list']); toast.success('Bill deleted'); },
    onError: ()=>toast.error('Delete failed'),
  });
  const categoryMut = useMutation({
    mutationFn: ({ id, category }) => partsApi.update(id, { category }),
    onSuccess: ()=>{ qc.invalidateQueries(['parts']); toast.success('Category saved', { id:'part-category' }); },
    onError: e=>toast.error(errMsg(e, 'Could not save category')),
  });
  // A part with reorder level 0 can only ever read as out of stock, so starring one
  // gives it a starting level of 5 — otherwise the star would look on but never alert.
  const priorityMut = useMutation({
    mutationFn: ({ id, priority, reorder_level }) =>
      partsApi.update(id, priority && !reorder_level ? { priority, reorder_level:5 } : { priority }),
    onSuccess: (_r, v)=>{
      qc.invalidateQueries(['parts']); qc.invalidateQueries(['parts-stats']);
      qc.invalidateQueries(['parts-low-stock-order']); qc.invalidateQueries(['parts-suggest-priority']);
      toast.success(v.priority ? 'Added to priority list' : 'Removed from priority list');
    },
    onError: e=>toast.error(errMsg(e, 'Could not change priority')),
  });

  const parts = Array.isArray(data)?data:[];
  const st    = statsData||{};

  const visibleParts = parts.filter(p => {
    if (filter==='priority') return !!p.priority;
    if (filter==='low') return p.stock>0 && p.stock<=(p.reorder_level||5);
    if (filter==='out') return p.stock===0;
    return true;
  }).filter(p => !cat || (cat===NO_CATEGORY ? !p.category : p.category===cat));

  const { sorted: sortedParts, Th: PartsTh } = useSortable(visibleParts, 'name', 'asc');


  if (view==='add') {
    return (
      <div className="page-pad">
        <div className="page-back">
          <GhostBtn onClick={()=>setView('list')} sm>Back to parts</GhostBtn>
          <h2 className="page-panel-title" style={{ margin:0 }}>Add new part</h2>
        </div>
        <PartForm onSave={d=>createMut.mutate(d)} onCancel={()=>setView('list')} saving={createMut.isPending} />
      </div>
    );
  }

  if (view==='edit' && editPart) {
    return (
      <div className="page-pad">
        <div className="page-back">
          <GhostBtn onClick={()=>{ setView('list'); setEditPart(null); }} sm>Back to parts</GhostBtn>
          <h2 className="page-panel-title" style={{ margin:0 }}>Edit part <span className="mono cell-muted">{editPart.part_number}</span></h2>
        </div>
        <PartForm
          initial={editPart}
          onSave={d=>updateMut.mutate({ id:editPart.id, data:d })}
          onCancel={()=>{ setView('list'); setEditPart(null); }}
          saving={updateMut.isPending}
        />
      </div>
    );
  }

  if (view==='new-bill') {
    return <NewBillForm parts={parts} onCancel={()=>setView('list')} onDone={()=>{ setView('list'); setTab('bills'); qc.invalidateQueries(['parts-bills-list']); qc.invalidateQueries(['parts']); qc.invalidateQueries(['parts-stats']); }} />;
  }

  return (
    <div>
      {/* stats */}
      <section className="stat-strip" aria-label="Parts figures">
        {[
          { l:'Total SKUs',    v:st.total_skus??'—' },
          { l:'Low stock',     v:st.low_stock??'—',    c: st.low_stock > 0 ? 'var(--color-warn)' : undefined },
          { l:'Out of stock',  v:st.out_of_stock??'—', c: st.out_of_stock > 0 ? 'var(--color-error)' : undefined },
          { l:'Stock value',   v:st.stock_value   ? '₹'+Math.round(st.stock_value/1000)+'K'   : '—' },
          { l:'Selling value', v:st.selling_value ? '₹'+Math.round(st.selling_value/1000)+'K' : '—' },
        ].map((s,i)=>(
          <div key={i} className="stat">
            <span className="stat-label">{s.l}</span>
            <span className="stat-value" style={s.c ? { color:s.c } : undefined}>{s.v}</span>
          </div>
        ))}
      </section>

      {/* tabs + actions */}
      <div className="tabbar">
        <div className="tabs" role="tablist" aria-label="Parts views" style={{ borderBottom:0 }}>
          {[{id:'stock',l:'Stock Inventory'},{id:'bills',l:'Bills History'}].map(t=>(
            <button key={t.id} type="button" role="tab" className="tab" aria-selected={tab===t.id} onClick={()=>setTab(t.id)}>
              {t.l}
            </button>
          ))}
        </div>
        <div className="tabbar-actions">
          <Btn onClick={()=>setPartsBillOpen(true)}>+ Parts Bill</Btn>
          {/* 2. Parts Order replaces New Bill — shows low stock list */}
          <button type="button" className="btn btn-ghost" onClick={()=>setOrderOpen(true)}>
            Parts Order
          </button>
          <GhostBtn onClick={()=>setView('add')}>+ Add part</GhostBtn>
        </div>
      </div>

      {/* stock tab */}
      {tab==='stock' && (
        <>
          <div className="page-toolbar">
            <input type="search" className="page-search" aria-label="Search parts" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search parts…" style={{ width:'min(240px, 100%)' }} />
            <select aria-label="Category" value={cat} onChange={e=>setCat(e.target.value)} style={{ width:170 }}>
              <option value="">All categories</option>
              <option value={NO_CATEGORY}>No category yet</option>
              {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <div className="chips" role="group" aria-label="Stock filter">
              {[['all','All'],['priority','Priority'],['low','Low stock'],['out','Out of stock']].map(([v,l])=>(
                <button key={v} type="button" className="chip" aria-pressed={filter===v} onClick={()=>setFilter(v)}>{l}</button>
              ))}
            </div>
            <span className="toolbar-count" role="status">{visibleParts.length} parts</span>
          </div>

          {(st.low_stock>0||st.out_of_stock>0) && (
            <div className="notice notice-warn parts-alert">
              <div>
                {st.low_stock>0&&<><strong>{st.low_stock} parts</strong> below reorder level</>}
                {st.low_stock>0&&st.out_of_stock>0&&', '}
                {st.out_of_stock>0&&<strong style={{ color:'var(--color-error)' }}>{st.out_of_stock} out of stock</strong>}
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setOrderOpen(true)}>
                View Order List
              </button>
            </div>
          )}

          {error ? <div style={{ padding:'var(--space-lg)' }}><ApiError error={error}/></div>
            : isLoading ? <div className="table-skeleton">{[1,2,3,4,5].map(i=><Skeleton key={i} h={44}/>)}</div>
            : visibleParts.length===0 ? <Empty message="No parts found" sub={search || cat || filter !== 'all' ? 'Clear a filter or the search to see more.' : 'Add the first part with Add part.'} />
            : (
              <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    {[['Priority','priority'],['Part no.','part_number'],['Name','name'],['Compatible',''],['Category','category'],['Brand','brand'],['Loc','location'],['Stock','stock'],['Reorder','reorder_level'],['Purchase','purchase_price'],['Selling','selling_price'],['GST','gst_rate'],['Margin',''],['Status',''],['','']].map(([h,f])=>(
                      <PartsTh key={h} field={f||null} className={['stock','reorder_level','purchase_price','selling_price','gst_rate'].includes(f) || h==='Margin' ? 'num' : undefined}>{h || <span className="visually-hidden">Actions</span>}</PartsTh>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedParts.map(p=>{
                    const sc     = stockStyle(p);
                    const margin = p.selling_price>0 ? Math.round((p.selling_price-p.purchase_price)/p.selling_price*100) : 0;
                    return (
                      <tr key={p.id}>
                        {/* Star = fast mover. Only these raise low-stock alerts. */}
                        <td>
                          <button
                            type="button"
                            className="star-toggle"
                            aria-pressed={!!p.priority}
                            aria-label={p.priority ? `Remove ${p.name} from the priority list` : `Add ${p.name} to the priority list`}
                            title={p.priority ? 'On the priority list — you get alerted when it runs low' : 'Add to the priority list'}
                            disabled={priorityMut.isPending}
                            onClick={()=>priorityMut.mutate({ id:p.id, priority:!p.priority, reorder_level:p.reorder_level })}
                          >{p.priority ? '★' : '☆'}</button>
                        </td>
                        <td className="mono cell-id">{p.part_number}</td>
                        <td className="cell-strong" style={{ maxWidth:200 }}>
                          <div className="cell-clip">{p.name}</div>
                        </td>
                        {/* Compatible models */}
                        <td style={{ maxWidth:200 }}>
                          {p.compatible_with?.length > 0 ? (
                            <div className="tag-row">
                              {p.compatible_with.slice(0,3).map(m => (
                                <span key={m} className="pill pill-dim">{m}</span>
                              ))}
                              {p.compatible_with.length > 3 && (
                                <span className="pill pill-dim" title={p.compatible_with.slice(3).join(', ')}>+{p.compatible_with.length - 3}</span>
                              )}
                            </div>
                          ) : (
                            <span className="cell-muted">Not set</span>
                          )}
                        </td>
                        <td>
                          <select aria-label={`Category of ${p.name}`} value={p.category || ''}
                            disabled={categoryMut.isPending && categoryMut.variables?.id === p.id}
                            onChange={e => categoryMut.mutate({ id: p.id, category: e.target.value })}
                            style={{ minWidth:140, fontSize:'var(--text-xs)', ...(p.category ? null : { color:'var(--color-muted)' }) }}>
                            <option value="">Not set</option>
                            {/* keep an older or imported name visible even if it's not in the list */}
                            {p.category && !CATEGORIES.includes(p.category) && <option value={p.category}>{p.category}</option>}
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="cell-muted">{p.brand}</td>
                        <td className="mono cell-muted">{p.location}</td>
                        <td className="num">
                          <span className="parts-stock" style={{ color:p.stock===0?'var(--color-error)':p.stock<=(p.reorder_level||5)?'var(--color-warn)':'var(--color-ink)' }}>{p.stock}</span>
                        </td>
                        <td className="num cell-muted">{p.reorder_level}</td>
                        <td className="num cell-muted">₹{p.purchase_price?.toLocaleString('en-IN')}</td>
                        <td className="num cell-amount">₹{p.selling_price?.toLocaleString('en-IN')}</td>
                        <td className="num cell-muted">{p.gst_rate}%</td>
                        <td className="num" style={{ fontWeight:600, color:margin>=30?'var(--color-success)':margin>=15?'var(--color-warn)':'var(--color-error)' }}>{margin}%</td>
                        <td>
                          <span className={`pill ${sc.cls}`}>{sc.label}</span>
                        </td>
                        {/* 3. Edit + Delete + Adj buttons */}
                        <td>
                          <div className="row-actions" style={{ flexWrap:'nowrap', minWidth:0 }}>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={()=>{ setEditPart(p); setView('edit'); }}>
                              Edit
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" aria-label={`Adjust stock for ${p.name}`} onClick={()=>{ const qty=parseInt(prompt(`Adjust stock for "${p.name}"\nCurrent: ${p.stock}\n+ for in, - for out:`)); if(!isNaN(qty)&&qty!==0) adjustMut.mutate({id:p.id,qty,reason:'Manual adjustment'}); }}>
                              ±Adj
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm btn-ghost-danger" aria-label={`Delete ${p.name}`} onClick={async () => { if (await confirm(`Delete "${p.name}"? This cannot be undone.`)) deleteMut.mutate(p.id); }}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
        </>
      )}

      {/* bills tab — parts-bills (from service PartsBillModal) */}
      {tab==='bills' && (
        billsLoading ? <div className="table-skeleton">{[1,2,3].map(i=><Skeleton key={i} h={44}/>)}</div>
        : (
          <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {['Bill #','Date','Job #','Customer','Parts Used','Amount','Payment','Actions'].map(h=>(
                  <th key={h} className={h==='Amount' ? 'num' : undefined}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(billsData)?billsData:[]).length===0 && (
                <tr><td colSpan={8}><Empty message="No parts bills yet" sub="Counter sales made with Parts Bill appear here." /></td></tr>
              )}
              {(Array.isArray(billsData)?billsData:[]).map(b=>{
                const total = b.grand_total || b.items?.reduce((s,i)=>s+i.unit_price*i.qty,0) || 0;
                return (
                  <tr key={b.id}>
                    <td className="mono cell-id">{b.bill_number}</td>
                    <td className="cell-muted cell-nowrap">{b.bill_date || b.created_at?.slice(0,10)}</td>
                    <td className="mono cell-muted">{b.job_number||'—'}</td>
                    <td className="cell-strong">{b.customer_name||'—'}</td>
                    <td className="cell-muted" style={{ maxWidth:240 }}>
                      <div className="cell-clip">
                        {b.items?.map(i=>`${i.description||i.name} ×${i.qty}`).join(', ') || '—'}
                      </div>
                    </td>
                    <td className="num cell-amount">₹{Math.round(total).toLocaleString('en-IN')}</td>
                    <td><span className="pill pill-dim">{b.payment_mode||'Cash'}</span></td>
                    <td>
                      <div className="row-actions" style={{ flexWrap:'nowrap', minWidth:0 }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setViewBill(b)}>
                          View
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditBill(b)}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm btn-ghost-danger" aria-label={`Delete bill ${b.bill_number}`} onClick={async () => { if (await confirm(`Delete bill ${b.bill_number}?`)) deleteBillMut.mutate(b.id); }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )
      )}

      {partsBillOpen && <PartsBillModal onClose={() => { setPartsBillOpen(false); qc.invalidateQueries(['parts-bills-list']); }} />}
      {orderOpen    && <PartsOrderModal onClose={() => setOrderOpen(false)} />}
      {viewBill     && (
        <ViewBillModal
          bill={viewBill}
          onClose={() => setViewBill(null)}
          onEdit={() => { setEditBill(viewBill); setViewBill(null); }}
        />
      )}
      {editBill     && (
        <EditBillModal
          bill={editBill}
          onClose={() => setEditBill(null)}
          onSaved={() => { setEditBill(null); qc.invalidateQueries(['parts-bills-list']); }}
        />
      )}
    </div>
  );
}
