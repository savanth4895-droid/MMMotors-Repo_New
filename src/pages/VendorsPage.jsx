import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vendorsApi, errMsg } from '../api/client';
import { Btn, GhostBtn, Field, Skeleton, Empty, ApiError } from '../components/ui';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';

// ─── Vendor form (add or edit) ─────────────────────────────────────
function VendorForm({ initial = {}, onSave, onCancel, saving }) {
  const [f, setF] = useState({
    name:         initial.name         || '',
    gstin:        initial.gstin        || '',
    address:      initial.address      || '',
    phone:        initial.phone        || '',
    email:        initial.email        || '',
    bank_name:    initial.bank_name    || '',
    bank_account: initial.bank_account || '',
    bank_ifsc:    initial.bank_ifsc    || '',
    notes:        initial.notes        || '',
  });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <div className="sale-form" style={{ marginTop: 'var(--space-md)' }}>
      <div className="form-grid">
        <Field label="Vendor name *"><input value={f.name} onChange={e=>set('name', e.target.value)} placeholder="Shree Auto Tronics" /></Field>
        <Field label="GSTIN"><input className="mono" value={f.gstin} onChange={e=>set('gstin', e.target.value.toUpperCase())} placeholder="29ADKFS7251C1ZV" /></Field>
      </div>
      <Field label="Address"><textarea rows={2} value={f.address} onChange={e=>set('address', e.target.value)} /></Field>
      <div className="form-grid">
        <Field label="Phone"><input value={f.phone} onChange={e=>set('phone', e.target.value)} /></Field>
        <Field label="Email"><input value={f.email} onChange={e=>set('email', e.target.value)} /></Field>
      </div>
      <div className="form-grid form-grid-3">
        <Field label="Bank name"><input value={f.bank_name} onChange={e=>set('bank_name', e.target.value)} /></Field>
        <Field label="Account number"><input className="mono" value={f.bank_account} onChange={e=>set('bank_account', e.target.value)} /></Field>
        <Field label="IFSC"><input className="mono" value={f.bank_ifsc} onChange={e=>set('bank_ifsc', e.target.value.toUpperCase())} /></Field>
      </div>
      <Field label="Notes"><textarea rows={2} value={f.notes} onChange={e=>set('notes', e.target.value)} /></Field>
      <div className="form-actions" style={{ justifyContent:'flex-end' }}>
        <div className="form-actions-end">
          <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
          <Btn onClick={()=>onSave(f)} disabled={saving || !f.name.trim()}>{saving ? 'Saving…' : 'Save'}</Btn>
        </div>
      </div>
    </div>
  );
}

export default function VendorsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [search, setSearch]     = useState('');
  const [showAdd, setShowAdd]   = useState(false);
  const [editVendor, setEdit]   = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey:['vendors', search],
    queryFn: () => vendorsApi.list({ search: search || undefined }).then(r=>r.data),
  });

  const createMut = useMutation({
    mutationFn: (d) => vendorsApi.create(d),
    onSuccess: () => { qc.invalidateQueries(['vendors']); setShowAdd(false); toast.success('Vendor added'); },
    onError: e => toast.error(errMsg(e, 'Create failed')),
  });
  const updateMut = useMutation({
    mutationFn: ({id, d}) => vendorsApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries(['vendors']); setEdit(null); toast.success('Updated'); },
    onError: e => toast.error(errMsg(e, 'Update failed')),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => vendorsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries(['vendors']); toast.success('Deleted'); },
    onError: e => toast.error(errMsg(e, 'Delete failed')),
  });

  const vendors = data || [];

  return (
    <div>
      {/* Toolbar */}
      <div className="page-toolbar">
        <input
          type="search"
          className="page-search"
          aria-label="Search vendors"
          placeholder="Search vendors, GSTIN, phone…"
          value={search} onChange={e=>setSearch(e.target.value)}
        />
        <div className="toolbar-end">
          {!isLoading && !error && (
            <span className="toolbar-count" role="status">{vendors.length} vendor{vendors.length === 1 ? '' : 's'}</span>
          )}
          <Btn onClick={()=>setShowAdd(true)}>+ New vendor</Btn>
        </div>
      </div>

      {/* Add modal */}
      {showAdd && (
        <div className="dialog-backdrop" onClick={()=>setShowAdd(false)}>
          <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="add-vendor-title" style={{ maxWidth: 720 }}
            onClick={e=>e.stopPropagation()}>
            <h2 id="add-vendor-title" className="dialog-title">Add new vendor</h2>
            <VendorForm onSave={d=>createMut.mutate(d)} onCancel={()=>setShowAdd(false)} saving={createMut.isPending} />
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editVendor && (
        <div className="dialog-backdrop" onClick={()=>setEdit(null)}>
          <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="edit-vendor-title" style={{ maxWidth: 720 }}
            onClick={e=>e.stopPropagation()}>
            <h2 id="edit-vendor-title" className="dialog-title">Edit vendor</h2>
            <VendorForm initial={editVendor} onSave={d=>updateMut.mutate({id: editVendor.id, d})} onCancel={()=>setEdit(null)} saving={updateMut.isPending} />
          </div>
        </div>
      )}

      {/* Vendor list */}
      {isLoading ? <div className="table-skeleton">{[1,2,3].map(i=><Skeleton key={i} h={44}/>)}</div> :
       error     ? <div className="page-pad"><ApiError error={error} /></div> :
       vendors.length === 0 ? (
         search
           ? <Empty message="No vendors match this search" sub="Try a name, GSTIN or phone number." />
           : <Empty message="No vendors yet" sub="Add your first spare-parts supplier with New vendor." />
       ) :
       <div className="table-wrap">
         <table className="data-table">
           <thead>
             <tr>
               <th>Name</th>
               <th>GSTIN</th>
               <th>Phone</th>
               <th>Address</th>
               <th><span className="visually-hidden">Actions</span></th>
             </tr>
           </thead>
           <tbody>
             {vendors.map(v => (
               <tr key={v.id}>
                 <td className="cell-strong">{v.name}</td>
                 <td className="mono cell-id">{v.gstin || <span className="cell-muted">Not set</span>}</td>
                 <td className="cell-muted cell-nowrap">{v.phone || 'Not set'}</td>
                 <td className="cell-muted cell-clip" style={{ maxWidth:300 }}>{v.address || 'Not set'}</td>
                 <td>
                   <div className="row-actions" style={{ justifyContent:'flex-end' }}>
                     <button type="button" className="btn btn-ghost btn-sm" aria-label={`Edit ${v.name}`} onClick={()=>setEdit(v)}>Edit</button>
                     <button type="button" className="btn btn-ghost btn-sm btn-ghost-danger" aria-label={`Delete ${v.name}`} onClick={async ()=>{
                       const ok = await confirm(`Delete ${v.name}?`, { sub:'This can only be done if no purchase bills reference this vendor.' });
                       if (ok) deleteMut.mutate(v.id);
                     }}>Delete</button>
                   </div>
                 </td>
               </tr>
             ))}
           </tbody>
         </table>
       </div>
      }
    </div>
  );
}
