import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../api/client';
import { Btn, GhostBtn, Field, Avatar, Skeleton, Empty, ApiError } from '../components/ui';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';

const ROLES = [
  { value:'owner',           label:'Owner',           desc:'Full access — all modules, delete, settings.' },
  { value:'sales',           label:'Sales',           desc:'Dashboard, sales, vehicles, customers.' },
  { value:'service_advisor', label:'Service Advisor', desc:'Dashboard, service jobs, customers.' },
  { value:'parts_counter',   label:'Parts Counter',   desc:'Dashboard, parts inventory and billing.' },
  { value:'technician',      label:'Technician',      desc:'Service view only.' },
];
const ROLE_COLOR = {
  owner:          { color:'#f0c040', bg:'rgba(240,192,64,.12)',  border:'rgba(240,192,64,.3)' },
  sales:          { color:'#4ade80', bg:'rgba(74,222,128,.12)',  border:'rgba(74,222,128,.3)' },
  service_advisor:{ color:'#60a5fa', bg:'rgba(96,165,250,.12)',  border:'rgba(96,165,250,.3)' },
  parts_counter:  { color:'#fb923c', bg:'rgba(251,146,60,.12)',  border:'rgba(251,146,60,.3)' },
  technician:     { color:'#a78bfa', bg:'rgba(167,139,250,.12)', border:'rgba(167,139,250,.3)' },
};
const STATUS_COLOR = {
  active:   { color:'#4ade80', bg:'rgba(74,222,128,.12)',  border:'rgba(74,222,128,.3)',  label:'Active' },
  inactive: { color:'#f87171', bg:'rgba(248,113,113,.12)', border:'rgba(248,113,113,.3)', label:'Inactive' },
  on_leave: { color:'#fbbf24', bg:'rgba(251,191,36,.12)',  border:'rgba(251,191,36,.3)',  label:'On leave' },
};

const selStyle = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3, padding:'8px 10px', color:'var(--text)', outline:'none', fontSize:13, fontFamily:'IBM Plex Sans,sans-serif', width:'100%' };

// ── Staff profile ────────────────────────────────────────────────────
function StaffProfile({ staff, onBack }) {
  const qc = useQueryClient();
  const [tab,    setTab]  = useState('info');
  const [form,   setForm] = useState({ ...staff });
  const [pw,     setPw]   = useState({ new_password:'', confirm:'' });
  const [saved,  setSaved] = useState(false);

  const s = k => e => setForm(p=>({...p,[k]:e.target.value}));

  const updateMut = useMutation({
    mutationFn: d => usersApi.update(staff.id, d),
    onSuccess: () => { qc.invalidateQueries(['staff']); setSaved(true); setTimeout(()=>setSaved(false),2000); toast.success('Saved'); },
    onError:   e => toast.error(e?.response?.data?.detail||'Failed'),
  });
  const pwMut = useMutation({
    mutationFn: d => usersApi.changePassword(staff.id, d),
    onSuccess: () => { setPw({new_password:'',confirm:''}); toast.success('Password updated'); },
    onError:   e => toast.error(e?.response?.data?.detail||'Failed'),
  });

  const rc = ROLE_COLOR[form.role]||ROLE_COLOR.sales;
  const sc = STATUS_COLOR[form.status]||STATUS_COLOR.active;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 20px', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0 }}>
        <GhostBtn onClick={onBack} sm>← Staff</GhostBtn>
        <div style={{ width:1, height:16, background:'var(--border)' }} />
        <Avatar name={form.name} size={34} />
        <span style={{ fontSize:14, fontWeight:600 }}>{form.name}</span>
        <span style={{ fontSize:10, color:'var(--muted)' }}>{form.username}</span>
        <span style={{ fontSize:9, padding:'3px 9px', borderRadius:2, fontWeight:500, color:rc.color, background:rc.bg, border:`1px solid ${rc.border}` }}>{ROLES.find(r=>r.value===form.role)?.label}</span>
        <span style={{ fontSize:9, padding:'3px 9px', borderRadius:2, fontWeight:500, color:sc.color, background:sc.bg, border:`1px solid ${sc.border}` }}>{sc.label}</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          {saved && <span style={{ fontSize:11, color:'#4ade80' }}>✓ Saved</span>}
          <Btn onClick={()=>updateMut.mutate({ name:form.name, mobile:form.mobile, email:form.email, role:form.role, status:form.status, salary:parseFloat(form.salary)||0, join_date:form.join_date })}>Save changes</Btn>
        </div>
      </div>

      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', flexShrink:0, background:'var(--surface)' }}>
        {[{id:'info',l:'Profile info'},{id:'security',l:'Security'}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ padding:'10px 20px', background:'transparent', border:'none', borderBottom:tab===t.id?'2px solid var(--accent)':'2px solid transparent', color:tab===t.id?'var(--accent)':'var(--muted)', cursor:'pointer', fontSize:10, letterSpacing:'.07em', textTransform:'uppercase', fontFamily:'IBM Plex Sans,sans-serif' }}>{t.l.toUpperCase()}</button>
        ))}
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
        {tab==='info' && (
          <div style={{ maxWidth:620, display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <Field label="Full name"><input value={form.name}       onChange={s('name')}     /></Field>
              <Field label="Mobile">   <input value={form.mobile||''} onChange={s('mobile')}   /></Field>
              <Field label="Email">    <input value={form.email||''}  onChange={s('email')}    /></Field>
              <Field label="Username"> <input value={form.username}   readOnly style={{ opacity:.6 }} /></Field>
              <Field label="Role">
                <select value={form.role} onChange={s('role')} style={selStyle}>
                  {ROLES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select value={form.status||'active'} onChange={s('status')} style={selStyle}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="on_leave">On leave</option>
                </select>
              </Field>
              <Field label="Monthly salary (₹)"><input type="number" value={form.salary||0}    onChange={s('salary')}    /></Field>
              <Field label="Join date">          <input              value={form.join_date||''} onChange={s('join_date')} placeholder="01 Jan 2024" /></Field>
            </div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, padding:'12px 16px' }}>
              <div className="label-xs" style={{ marginBottom:6 }}>Access level — {ROLES.find(r=>r.value===form.role)?.label}</div>
              <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.6 }}>{ROLES.find(r=>r.value===form.role)?.desc}</div>
            </div>
          </div>
        )}

        {tab==='security' && (
          <div style={{ maxWidth:460, display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, padding:16 }}>
              <div style={{ fontSize:12, fontWeight:600, marginBottom:12 }}>Change password</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <Field label="New password"><input type="password" value={pw.new_password} onChange={e=>setPw(p=>({...p,new_password:e.target.value}))} placeholder="Min 8 characters" /></Field>
                <Field label="Confirm">    <input type="password" value={pw.confirm}       onChange={e=>setPw(p=>({...p,confirm:e.target.value}))}       placeholder="Repeat password" /></Field>
                {pw.new_password&&pw.confirm&&pw.new_password!==pw.confirm&&<div style={{ fontSize:11, color:'var(--red)' }}>Passwords don't match</div>}
                <Btn disabled={!pw.new_password||pw.new_password!==pw.confirm||pw.new_password.length<8} onClick={()=>pwMut.mutate({new_password:pw.new_password})}>Update password</Btn>
              </div>
            </div>
            <div style={{ background:'rgba(220,38,38,.04)', border:'1px solid rgba(220,38,38,.2)', borderRadius:4, padding:16 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--red)', marginBottom:8 }}>Danger zone</div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:500 }}>Deactivate account</div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>Staff member won't be able to sign in</div>
                </div>
                <Btn color="#dc2626" onClick={()=>{ updateMut.mutate({status:'inactive'}); setForm(p=>({...p,status:'inactive'})); }}>Deactivate</Btn>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add staff form ───────────────────────────────────────────────────
function AddStaffForm({ onSave, onCancel, saving }) {
  const [f, setF] = useState({ name:'', mobile:'', email:'', username:'', role:'sales', salary:'' });
  const s = k => e => setF(p=>({...p,[k]:e.target.value}));
  return (
    <div style={{ maxWidth:560, display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <Field label="Full name *"><input value={f.name}     onChange={s('name')}     placeholder="Full name" /></Field>
        <Field label="Mobile *">   <input value={f.mobile}   onChange={s('mobile')}   placeholder="10-digit mobile" /></Field>
        <Field label="Email">      <input value={f.email}    onChange={s('email')}    placeholder="Optional" /></Field>
        <Field label="Username *"> <input value={f.username} onChange={s('username')} placeholder="Login username" className="mono" /></Field>
        <Field label="Role *">
          <select value={f.role} onChange={s('role')} style={selStyle}>
            {ROLES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>
        <Field label="Monthly salary (₹)"><input type="number" value={f.salary} onChange={s('salary')} placeholder="0" /></Field>
      </div>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, padding:'12px 14px' }}>
        <div className="label-xs" style={{ marginBottom:4 }}>Access — {ROLES.find(r=>r.value===f.role)?.label}</div>
        <div style={{ fontSize:11, color:'var(--text)', lineHeight:1.6 }}>{ROLES.find(r=>r.value===f.role)?.desc}</div>
      </div>
      <div style={{ fontSize:10, color:'var(--dim)', fontStyle:'italic' }}>Default password: <span className="mono">mm@123456</span></div>
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
        <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
        <Btn disabled={!f.name||!f.mobile||!f.username||saving} onClick={()=>onSave({...f,salary:parseFloat(f.salary)||0, password:'mm@123456'})}>
          {saving?'Adding…':'Add staff member'}
        </Btn>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────
export default function StaffPage() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [view,      setView]      = useState('list');
  const [selected,  setSelected]  = useState(null);
  const [roleFilter,setRoleFilter] = useState('all');
  const [search,    setSearch]    = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey:['staff'],
    queryFn: ()=>usersApi.list({ limit:100 }).then(r=>r.data),
  });
  const createMut = useMutation({
    mutationFn: d=>usersApi.create(d),
    onSuccess: ()=>{ qc.invalidateQueries(['staff']); setView('list'); toast.success('Staff member added'); },
    onError:   e=>toast.error(e?.response?.data?.detail||'Failed'),
  });
  const deleteMut = useMutation({
    mutationFn: id=>usersApi.delete(id),
    onSuccess: ()=>{ qc.invalidateQueries(['staff']); toast.success('Deleted'); },
    onError:   e=>toast.error(e?.response?.data?.detail||'Cannot delete'),
  });

  const staff = Array.isArray(data)?data:[];
  const filtered = staff.filter(s=>{
    const mr = roleFilter==='all'||s.role===roleFilter;
    const ms = !search||s.name.toLowerCase().includes(search.toLowerCase())||s.username.includes(search)||(s.mobile||'').includes(search);
    return mr&&ms;
  });

  const payroll = staff.reduce((s,u)=>s+(u.salary||0),0);

  if (view==='profile'&&selected) {
    return <StaffProfile staff={selected} onBack={()=>{ setView('list'); setSelected(null); }} />;
  }
  if (view==='add') {
    return (
      <div style={{ padding:24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
          <GhostBtn onClick={()=>setView('list')} sm>← Staff</GhostBtn>
          <span style={{ fontSize:13, fontWeight:500 }}>Add staff member</span>
        </div>
        <AddStaffForm onSave={d=>createMut.mutate(d)} onCancel={()=>setView('list')} saving={createMut.isPending} />
      </div>
    );
  }

  return (
    <div>
      {/* stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', borderBottom:'1px solid var(--border)' }}>
        {[
          { l:'Total staff',     v:staff.length, c:'var(--accent)' },
          { l:'Active',          v:staff.filter(s=>s.status==='active').length, c:'#4ade80' },
          { l:'On leave',        v:staff.filter(s=>s.status==='on_leave').length, c:'#fbbf24' },
          { l:'Monthly payroll', v:'₹'+payroll.toLocaleString('en-IN'), c:'var(--blue)' },
        ].map((s,i)=>(
          <div key={i} style={{ padding:'14px 20px', borderRight:i<3?'1px solid var(--border)':0 }}>
            <div className="label-xs">{s.l}</div>
            <div className="display" style={{ fontSize:24, color:s.c, marginTop:6 }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 20px', borderBottom:'1px solid var(--border)', flexWrap:'wrap' }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, username, mobile…" style={{ width:260 }} />
        <div style={{ display:'flex', gap:6 }}>
          {[{v:'all',l:'All'},...ROLES.map(r=>({v:r.value,l:r.label}))].map(({v,l})=>(
            <button key={v} onClick={()=>setRoleFilter(v)} style={{ padding:'6px 12px', background:roleFilter===v?'var(--surface2)':'transparent', border:`1px solid ${roleFilter===v?'var(--accent)':'var(--border)'}`, borderRadius:3, color:roleFilter===v?'var(--accent)':'var(--muted)', cursor:'pointer', fontSize:10, letterSpacing:'.05em', fontFamily:'IBM Plex Sans,sans-serif' }}>{l.toUpperCase()}</button>
          ))}
        </div>
        <Btn onClick={()=>setView('add')} style={{ marginLeft:'auto' }}>+ Add staff</Btn>
      </div>

      {/* table */}
      {error ? <div style={{ padding:20 }}><ApiError error={error}/></div>
        : isLoading ? <div style={{ padding:20, display:'flex', flexDirection:'column', gap:8 }}>{[1,2,3].map(i=><Skeleton key={i} h={56}/>)}</div>
        : filtered.length===0 ? <Empty message="No staff found" />
        : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                {['Staff member','Role','Mobile','Username','Join date','Salary','Status',''].map(h=>(
                  <th key={h} style={{ padding:'9px 20px', textAlign:'left', fontSize:9, letterSpacing:'.07em', color:'var(--dim)', fontWeight:500, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s=>{
                const rc = ROLE_COLOR[s.role]||ROLE_COLOR.sales;
                const sc = STATUS_COLOR[s.status]||STATUS_COLOR.active;
                return (
                  <tr key={s.id} style={{ borderBottom:'1px solid var(--border)', cursor:'pointer' }} onClick={()=>{ setSelected(s); setView('profile'); }}>
                    <td style={{ padding:'12px 20px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <Avatar name={s.name} size={30} />
                        <div>
                          <div style={{ fontSize:12, fontWeight:600 }}>{s.name}</div>
                          <div style={{ fontSize:10, color:'var(--dim)', marginTop:1 }}>{s.email||'No email'}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding:'12px 20px' }}>
                      <span style={{ fontSize:9, padding:'3px 9px', borderRadius:2, fontWeight:500, color:rc.color, background:rc.bg, border:`1px solid ${rc.border}` }}>{ROLES.find(r=>r.value===s.role)?.label}</span>
                    </td>
                    <td className="mono" style={{ padding:'12px 20px', fontSize:11 }}>{s.mobile||'—'}</td>
                    <td className="mono" style={{ padding:'12px 20px', fontSize:11, color:'var(--muted)' }}>{s.username}</td>
                    <td style={{ padding:'12px 20px', fontSize:11, color:'var(--dim)' }}>{s.join_date||'—'}</td>
                    <td className="mono" style={{ padding:'12px 20px', fontSize:12, color:s.salary?'var(--text)':'var(--dim)' }}>{s.salary?'₹'+s.salary.toLocaleString('en-IN'):'—'}</td>
                    <td style={{ padding:'12px 20px' }}>
                      <span style={{ fontSize:9, padding:'3px 9px', borderRadius:2, fontWeight:500, color:sc.color, background:sc.bg, border:`1px solid ${sc.border}` }}>{sc.label}</span>
                    </td>
                    <td style={{ padding:'12px 20px' }} onClick={e=>e.stopPropagation()}>
                      <div style={{ display:'flex', gap:6 }}>
                        <GhostBtn sm onClick={()=>{ setSelected(s); setView('profile'); }}>Manage →</GhostBtn>
                        <button onClick={async () => { if (await confirm(`Delete ${s.name}?`)) { deleteMut.mutate(s.id); } }}
                          style={{ padding:'5px 8px', background:'transparent', border:'1px solid rgba(220,38,38,.3)', borderRadius:3, color:'var(--red)', cursor:'pointer', fontSize:10, fontFamily:'IBM Plex Sans,sans-serif' }}>✕</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
    </div>
  );
}
