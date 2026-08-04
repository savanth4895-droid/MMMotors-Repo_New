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
    <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:640 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <Field label="Vendor Name *"><input value={f.name} onChange={e=>set('name', e.target.value)} placeholder="Shree Auto Tronics" /></Field>
        <Field label="GSTIN"><input value={f.gstin} onChange={e=>set('gstin', e.target.value.toUpperCase())} placeholder="29ADKFS7251C1ZV" /></Field>
      </div>
      <Field label="Address"><textarea rows={2} value={f.address} onChange={e=>set('address', e.target.value)} /></Field>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <Field label="Phone"><input value={f.phone} onChange={e=>set('phone', e.target.value)} /></Field>
        <Field label="Email"><input value={f.email} onChange={e=>set('email', e.target.value)} /></Field>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
        <Field label="Bank Name"><input value={f.bank_name} onChange={e=>set('bank_name', e.target.value)} /></Field>
        <Field label="A/C Number"><input value={f.bank_account} onChange={e=>set('bank_account', e.target.value)} /></Field>
        <Field label="IFSC"><input value={f.bank_ifsc} onChange={e=>set('bank_ifsc', e.target.value.toUpperCase())} /></Field>
      </div>
      <Field label="Notes"><textarea rows={2} value={f.notes} onChange={e=>set('notes', e.target.value)} /></Field>
      <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
        <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
        <Btn onClick={()=>onSave(f)} disabled={saving || !f.name.trim()}>{saving ? 'Saving…' : 'Save'}</Btn>
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
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
        <input
          placeholder="Search vendors, GSTIN, phone…"
          value={search} onChange={e=>setSearch(e.target.value)}
          style={{ flex:'0 1 320px', padding:'10px 14px', background:'var(--surface2)',
                   border:'1px solid var(--border)', borderRadius:6, fontSize:12 }}
        />
        <Btn onClick={()=>setShowAdd(true)}>+ New Vendor</Btn>
      </div>

      {/* Add modal */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:100,
                       display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:24, minWidth:640, maxWidth:720 }}>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:14 }}>Add New Vendor</div>
            <VendorForm onSave={d=>createMut.mutate(d)} onCancel={()=>setShowAdd(false)} saving={createMut.isPending} />
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editVendor && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:100,
                       display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:24, minWidth:640, maxWidth:720 }}>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:14 }}>Edit Vendor</div>
            <VendorForm initial={editVendor} onSave={d=>updateMut.mutate({id: editVendor.id, d})} onCancel={()=>setEdit(null)} saving={updateMut.isPending} />
          </div>
        </div>
      )}

      {/* Vendor list */}
      {isLoading ? <Skeleton /> :
       error     ? <ApiError err={error} /> :
       vendors.length === 0 ? <Empty text="No vendors yet. Add your first spare-parts supplier." /> :
       <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:6, overflow:'hidden' }}>
         <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
           <thead>
             <tr style={{ borderBottom:'1px solid var(--border)', background:'var(--surface2)',
                          color:'var(--muted)', fontSize:10, textTransform:'uppercase', letterSpacing:'.06em' }}>
               <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:500 }}>Name</th>
               <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:500 }}>GSTIN</th>
               <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:500 }}>Phone</th>
               <th style={{ padding:'10px 16px', textAlign:'left', fontWeight:500 }}>Address</th>
               <th style={{ padding:'10px 16px', textAlign:'right', fontWeight:500 }}></th>
             </tr>
           </thead>
           <tbody>
             {vendors.map(v => (
               <tr key={v.id} style={{ borderBottom:'1px solid var(--border)' }}>
                 <td style={{ padding:'10px 16px', fontWeight:600 }}>{v.name}</td>
                 <td style={{ padding:'10px 16px', color:'var(--muted)' }} className="mono">{v.gstin || '—'}</td>
                 <td style={{ padding:'10px 16px', color:'var(--muted)' }}>{v.phone || '—'}</td>
                 <td style={{ padding:'10px 16px', color:'var(--muted)', maxWidth:300, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{v.address || '—'}</td>
                 <td style={{ padding:'10px 16px', textAlign:'right' }}>
                   <div style={{ display:'inline-flex', gap:6 }}>
                     <GhostBtn small onClick={()=>setEdit(v)}>Edit</GhostBtn>
                     <GhostBtn small onClick={async ()=>{
                       const ok = await confirm({ title:'Delete vendor?', message:`Delete ${v.name}? This can only be done if no purchase bills reference this vendor.`, confirmText:'Delete', danger:true });
                       if (ok) deleteMut.mutate(v.id);
                     }}>Delete</GhostBtn>
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
