import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, errMsg} from '../api/client';
import { Btn, GhostBtn, Field, Avatar, Skeleton, Empty, ApiError } from '../components/ui';
import toast from 'react-hot-toast';
import { useConfirm } from '../components/ConfirmModal';

// All pages available in the system
const ALL_PAGES = [
  { id:'dashboard',   label:'Dashboard',      desc:'Overview, KPI stats, alerts' },
  { id:'sales',       label:'Sales',          desc:'Create & manage vehicle sales, invoices' },
  { id:'service',     label:'Service',        desc:'Job cards, billing, service board' },
  { id:'service-due', label:'Service Due',    desc:'Overdue service reminders & WhatsApp' },
  { id:'vehicles',    label:'Vehicles',       desc:'Stock inventory, inbound/outbound' },
  { id:'parts',       label:'Parts',          desc:'Spare parts inventory & parts billing' },
  { id:'customers',   label:'Customers',      desc:'Customer records, history, tags' },
  { id:'debt',        label:'Debt Ledger',    desc:'Outstanding payments from customers' },
  { id:'expenses',    label:'Expenses',       desc:'Showroom expense tracking' },
  { id:'accident-estimate', label:'Accident Estimate', desc:'Create repair estimates for accidental vehicles' },
  { id:'reports',     label:'Reports',        desc:'Revenue, P&L, brand analytics' },
  { id:'staff',       label:'Staff',          desc:'Staff management (owner only recommended)' },
  { id:'import',      label:'Import data',    desc:'Bulk import customers, vehicles, parts' },
];

// Role-based defaults (pre-selects when role changes)
const ROLE_DEFAULTS = {
  owner:           ALL_PAGES.map(p => p.id),
  sales:           ['dashboard','sales','vehicles','customers','debt'],
  service_advisor: ['dashboard','service','service-due','customers','accident-estimate'],
  parts_counter:   ['dashboard','parts'],
  technician:      ['dashboard','service'],
};

const ROLES = [
  { value:'owner',           label:'Owner'           },
  { value:'sales',           label:'Sales'           },
  { value:'service_advisor', label:'Service advisor' },
  { value:'parts_counter',   label:'Parts counter'   },
  { value:'technician',      label:'Technician'      },
];

// Role and status tags take the shared pill tints.
const ROLE_COLOR = {
  owner:          { cls:'pill-amber' },
  sales:          { cls:'pill-green' },
  service_advisor:{ cls:'pill-blue' },
  parts_counter:  { cls:'pill-dim' },
  technician:     { cls:'pill-dim' },
};
const STATUS_COLOR = {
  active:   { cls:'pill-green', label:'Active' },
  inactive: { cls:'pill-red',   label:'Inactive' },
  on_leave: { cls:'pill-amber', label:'On leave' },
};

const permGrid = { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:'var(--space-xs)' };
const permItem = isOn => ({
  display:'flex', alignItems:'flex-start', gap:'var(--space-sm)', padding:'var(--space-sm)',
  borderRadius:'var(--radius-control)', cursor:'pointer',
  border:`1px solid ${isOn ? 'var(--color-ink-2)' : 'var(--color-rule-2)'}`,
  background: isOn ? 'color-mix(in oklab, var(--color-accent) 10%, var(--color-paper))' : 'var(--color-paper)',
});
const boxStyle = { padding:'var(--space-md)', background:'var(--color-paper-2)', borderRadius:'var(--radius-card)' };
const boxTitle = { fontSize:'var(--text-sm)', fontWeight:600, marginBottom:'var(--space-sm)' };

// ── Page Permission Checklist ──────────────────────────────────────────────────
function PagePermissions({ selectedPages, onChange, role }) {
  const handleToggle = (id) => {
    onChange(selectedPages.includes(id)
      ? selectedPages.filter(p => p !== id)
      : [...selectedPages, id]);
  };
  const selectAll   = () => onChange(ALL_PAGES.map(p => p.id));
  const selectNone  = () => onChange([]);
  const useDefaults = () => onChange(ROLE_DEFAULTS[role] || []);

  return (
    <div role="group" aria-label="Page access">
      <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap:'var(--space-xs)', marginBottom:'var(--space-sm)' }}>
        <span className="field-label">
          Page access: {selectedPages.length} of {ALL_PAGES.length} pages
        </span>
        <div style={{ marginLeft:'auto', display:'flex', gap:'var(--space-2xs)' }}>

          <button type="button" className="btn btn-ghost btn-sm" onClick={selectAll}>
            Select all
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={selectNone}>
            Select none
          </button>
        </div>
      </div>
      <div style={permGrid}>
        {ALL_PAGES.map(page => {
          const isOn = selectedPages.includes(page.id);
          return (
            <label key={page.id} style={permItem(isOn)}>
              <input type="checkbox" checked={isOn} onChange={() => handleToggle(page.id)} style={{ marginTop:'var(--space-3xs)' }} />
              <span>
                <span style={{ display:'block', fontSize:'var(--text-sm)', fontWeight:500, color:'var(--color-ink)' }}>{page.label}</span>
                <span className="cell-sub" style={{ display:'block' }}>{page.desc}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── Staff profile ────────────────────────────────────────────────────
function StaffProfile({ staff, onBack }) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [tab,    setTab]  = useState('info');
  const [form,   setForm] = useState({
    ...staff,
    allowed_pages: staff.allowed_pages || [],
  });
  const [pw,     setPw]   = useState({ new_password:'', confirm:'' });
  const [saved,  setSaved] = useState(false);

  const s = k => e => setForm(p=>({...p,[k]:e.target.value}));

  const updateMut = useMutation({
    mutationFn: d => usersApi.update(staff.id, d),
    onSuccess: () => { qc.invalidateQueries(['staff']); setSaved(true); setTimeout(()=>setSaved(false),2000); toast.success('Saved'); },
    onError:   e => toast.error(errMsg(e, 'Failed')),
  });
  const pwMut = useMutation({
    mutationFn: d => usersApi.changePassword(staff.id, d),
    onSuccess: () => { setPw({new_password:'',confirm:''}); toast.success('Password updated'); },
    onError:   e => toast.error(errMsg(e, 'Failed')),
  });

  const rc = ROLE_COLOR[form.role]||ROLE_COLOR.sales;
  const sc = STATUS_COLOR[form.status]||STATUS_COLOR.active;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div className="page-head" style={{ flexWrap:'wrap', justifyContent:'flex-start', flexShrink:0 }}>
        <GhostBtn onClick={onBack} sm>Back to staff</GhostBtn>
        <Avatar name={form.name} size={34} />
        <div style={{ minWidth:0 }}>
          <h2 className="page-head-title">{form.name}</h2>
          <div className="cell-sub mono">{form.username}</div>
        </div>
        <span className={`pill ${rc.cls}`}>{ROLES.find(r=>r.value===form.role)?.label}</span>
        <span className={`pill ${sc.cls}`}>{sc.label}</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:'var(--space-xs)', alignItems:'center' }}>
          <span role="status" className="field-note is-ok" style={{ marginTop:0 }}>{saved ? 'Saved' : ''}</span>
          <Btn onClick={()=>updateMut.mutate({
            name:form.name, mobile:form.mobile, email:form.email, role:form.role,
            status:form.status, salary:parseFloat(form.salary)||0, join_date:form.join_date,
            allowed_pages: form.role === 'owner' ? null : form.allowed_pages,
          })}>Save changes</Btn>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Staff profile" style={{ flexShrink:0, padding:'0 var(--space-lg)' }}>
        {[{id:'info',l:'Profile info'},{id:'access',l:'Page access'},{id:'security',l:'Security'}].map(t=>(
          <button key={t.id} type="button" role="tab" className="tab" aria-selected={tab===t.id} onClick={()=>setTab(t.id)}>{t.l}</button>
        ))}
      </div>

      <div className="page-pad" style={{ flex:1, overflowY:'auto' }}>
        {tab==='info' && (
          <div className="sale-form" style={{ maxWidth:620 }}>
            <div className="form-grid form-grid-2col">
              <Field label="Full name"><input value={form.name}       onChange={s('name')}     /></Field>
              <Field label="Mobile">   <input value={form.mobile||''} onChange={s('mobile')}   /></Field>
              <Field label="Email">    <input value={form.email||''}  onChange={s('email')}    /></Field>
              <Field label="Username"> <input value={form.username}   readOnly className="mono" style={{ opacity:.6 }} /></Field>
              <Field label="Role">
                <select value={form.role} onChange={e => {
                  const newRole = e.target.value;
                  setForm(p => ({ ...p, role: newRole }));
                }}>
                  {ROLES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select value={form.status||'active'} onChange={s('status')}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="on_leave">On leave</option>
                </select>
              </Field>
              <Field label="Monthly salary (₹)"><input type="number" value={form.salary||0}    onChange={s('salary')}    /></Field>
              <Field label="Join date">          <input              value={form.join_date||''} onChange={s('join_date')} placeholder="01 Jan 2024" /></Field>
            </div>
          </div>
        )}

        {tab==='access' && (
          <div style={{ maxWidth:720 }}>
            {form.role === 'owner' ? (
              <div className="notice notice-warn" style={{ marginTop:0 }}>
                Owner has access to all pages by default and cannot be restricted.
              </div>
            ) : (
              <PagePermissions
                selectedPages={form.allowed_pages || []}
                onChange={pages => setForm(p => ({ ...p, allowed_pages: pages }))}
                role={form.role}
              />
            )}
          </div>
        )}

        {tab==='security' && (
          <div style={{ maxWidth:460, display:'flex', flexDirection:'column', gap:'var(--space-md)' }}>
            <section style={boxStyle} aria-labelledby="pw-title">
              <h3 id="pw-title" style={boxTitle}>Change password</h3>
              <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-sm)' }}>
                <Field label="New password"><input type="password" value={pw.new_password} onChange={e=>setPw(p=>({...p,new_password:e.target.value}))} placeholder="Min 8 characters" /></Field>
                <Field label="Confirm">    <input type="password" value={pw.confirm}       onChange={e=>setPw(p=>({...p,confirm:e.target.value}))}       placeholder="Repeat password" /></Field>
                {pw.new_password&&pw.confirm&&pw.new_password!==pw.confirm&&<div className="field-note" role="alert" style={{ color:'var(--color-error)' }}>Passwords don’t match</div>}
                <Btn disabled={!pw.new_password||pw.new_password!==pw.confirm||pw.new_password.length<8} onClick={()=>pwMut.mutate({new_password:pw.new_password})}>Update password</Btn>
              </div>
            </section>
            <section style={{ ...boxStyle, background:'color-mix(in oklab, var(--color-error) 5%, var(--color-paper))', border:'1px solid color-mix(in oklab, var(--color-error) 25%, var(--color-paper))' }} aria-labelledby="danger-title">
              <h3 id="danger-title" style={{ ...boxTitle, color:'var(--color-error)' }}>Danger zone</h3>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'var(--space-sm)' }}>
                <div>
                  <div style={{ fontSize:'var(--text-sm)', fontWeight:500 }}>Deactivate account</div>
                  <div className="cell-sub">Staff member won’t be able to sign in</div>
                </div>
                <button type="button" className="btn btn-ghost btn-ghost-danger" onClick={async ()=>{ if (!(await confirm(`Deactivate ${staff.name || 'this account'}?`, { danger:false, sub:'They will be signed out and cannot sign in until reactivated.' }))) return; updateMut.mutate({status:'inactive'}); setForm(p=>({...p,status:'inactive'})); }}>Deactivate</button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add staff form ───────────────────────────────────────────────────
function AddStaffForm({ onSave, onCancel, saving }) {
  const [f, setF] = useState({
    name:'', mobile:'', email:'', username:'', role:'sales', salary:'',
    allowed_pages: [],
  });
  const s = k => e => setF(p=>({...p,[k]:e.target.value}));

  return (
    <div className="sale-form" style={{ maxWidth:720 }}>
      <div className="form-grid form-grid-2col">
        <Field label="Full name *"><input value={f.name}     onChange={s('name')}     placeholder="Full name" /></Field>
        <Field label="Mobile *">   <input value={f.mobile}   onChange={s('mobile')}   placeholder="10-digit mobile" /></Field>
        <Field label="Email">      <input value={f.email}    onChange={s('email')}    placeholder="Optional" /></Field>
        <Field label="Username *"> <input value={f.username} onChange={s('username')} placeholder="Login username" className="mono" /></Field>
        <Field label="Role *">
          <select value={f.role} onChange={e => {
            const role = e.target.value;
            setF(p => ({ ...p, role }));
          }}>
            {ROLES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>
        <Field label="Monthly salary (₹)"><input type="number" value={f.salary} onChange={s('salary')} placeholder="0" /></Field>
      </div>

      {/* Page access */}
      <div style={boxStyle}>
        <PagePermissions
          selectedPages={f.allowed_pages}
          onChange={pages => setF(p => ({ ...p, allowed_pages: pages }))}
          role={f.role}
        />
      </div>

      <div className="form-actions">
        <div className="field-note" style={{ marginTop:0 }}>A one-time password is created for the account and shown once after you add it.</div>
        <div className="form-actions-end">
          <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
          <Btn disabled={!f.name||!f.mobile||!f.username||saving}
            onClick={()=>onSave({ ...f, salary:parseFloat(f.salary)||0 })}>
            {saving?'Adding…':'Add staff member'}
          </Btn>
        </div>
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
  const [newLogin,  setNewLogin]  = useState(null); // { username, password } shown once after create

  const { data, isLoading, error } = useQuery({
    queryKey:['staff'],
    queryFn: ()=>usersApi.list({ limit:100 }).then(r=>r.data),
  });
  const createMut = useMutation({
    mutationFn: d=>usersApi.create(d),
    onSuccess: res=>{
      qc.invalidateQueries(['staff']); setView('list'); toast.success('Staff member added');
      if (res?.data?.temp_password) setNewLogin({ username: res.data.username, password: res.data.temp_password });
    },
    onError:   e=>toast.error(errMsg(e, 'Failed')),
  });
  const deleteMut = useMutation({
    mutationFn: id=>usersApi.delete(id),
    onSuccess: ()=>{ qc.invalidateQueries(['staff']); toast.success('Deleted'); },
    onError:   e=>toast.error(errMsg(e, 'Cannot delete')),
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
      <div>
        <div className="page-head" style={{ justifyContent:'flex-start' }}>
          <GhostBtn onClick={()=>setView('list')} sm>Back to staff</GhostBtn>
          <h2 className="page-head-title">Add staff member</h2>
        </div>
        <div className="page-pad">
          <AddStaffForm onSave={d=>createMut.mutate(d)} onCancel={()=>setView('list')} saving={createMut.isPending} />
        </div>
      </div>
    );
  }

  const onLeave = staff.filter(s=>s.status==='on_leave').length;

  return (
    <div>
      {newLogin && (
        <div className="notice notice-warn page-notice" role="status" style={{ display:'flex', alignItems:'center', gap:'var(--space-sm)', flexWrap:'wrap' }}>
          <span>One-time password for <strong>{newLogin.username}</strong>: <span className="mono">{newLogin.password}</span>. Share it with them now; it is not shown again.</span>
          <GhostBtn sm onClick={()=>setNewLogin(null)}>Done</GhostBtn>
        </div>
      )}
      <section className="stat-strip" aria-label="Staff figures">
        {[
          { l:'Total staff',     v:staff.length },
          { l:'Active',          v:staff.filter(s=>s.status==='active').length },
          { l:'On leave',        v:onLeave, c: onLeave > 0 ? 'var(--color-warn)' : undefined },
          { l:'Monthly payroll', v:'₹'+payroll.toLocaleString('en-IN') },
        ].map((s,i)=>(
          <div key={i} className="stat">
            <span className="stat-label">{s.l}</span>
            <span className="stat-value" style={s.c ? { color:s.c } : undefined}>{s.v}</span>
          </div>
        ))}
      </section>

      <div className="page-toolbar">
        <input type="search" className="page-search" aria-label="Search staff" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, username, mobile…" />
        <div className="chips" role="group" aria-label="Role">
          {[{v:'all',l:'All'},...ROLES.map(r=>({v:r.value,l:r.label}))].map(({v,l})=>(
            <button key={v} type="button" className="chip" aria-pressed={roleFilter===v} onClick={()=>setRoleFilter(v)}>{l}</button>
          ))}
        </div>
        <span className="toolbar-count" role="status">{filtered.length} of {staff.length} staff</span>
        <Btn onClick={()=>setView('add')}>+ Add staff</Btn>
      </div>

      {error ? <div style={{ padding:'var(--space-lg)' }}><ApiError error={error}/></div>
        : isLoading ? <div className="table-skeleton">{[1,2,3].map(i=><Skeleton key={i} h={44}/>)}</div>
        : filtered.length===0 ? <Empty message="No staff found" sub={search||roleFilter!=='all' ? 'Clear the search or the role filter to see more.' : 'Add the first staff member with Add staff.'} />
        : (
          <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {['Staff member','Role','Mobile','Username','Join date','Salary','Status',''].map(h=>(
                  <th key={h} className={h==='Salary' ? 'num' : undefined}>{h || <span className="visually-hidden">Actions</span>}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s=>{
                const rc = ROLE_COLOR[s.role]||ROLE_COLOR.sales;
                const sc = STATUS_COLOR[s.status]||STATUS_COLOR.active;
                return (
                  <tr key={s.id} style={{ cursor:'pointer' }} onClick={()=>{ setSelected(s); setView('profile'); }}>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:'var(--space-sm)' }}>
                        <Avatar name={s.name} size={30} />
                        <div>
                          <div className="cell-strong">{s.name}</div>
                          <div className="cell-sub">{s.email||'No email'}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`pill ${rc.cls}`}>{ROLES.find(r=>r.value===s.role)?.label}</span>
                    </td>
                    <td className="mono cell-nowrap">{s.mobile||<span className="cell-muted">None</span>}</td>
                    <td className="mono cell-id">{s.username}</td>
                    <td className="cell-muted cell-nowrap">{s.join_date||'Not set'}</td>
                    <td className={`num${s.salary ? '' : ' cell-muted'}`}>{s.salary?'₹'+s.salary.toLocaleString('en-IN'):'Not set'}</td>
                    <td>
                      <span className={`pill ${sc.cls}`}>{sc.label}</span>
                    </td>
                    <td onClick={e=>e.stopPropagation()}>
                      <div className="row-actions">
                        <GhostBtn sm onClick={()=>{ setSelected(s); setView('profile'); }}>Manage</GhostBtn>
                        <button type="button" className="btn btn-ghost btn-sm btn-ghost-danger" aria-label={`Delete ${s.name}`} onClick={async () => { if (await confirm(`Delete ${s.name}?`)) { deleteMut.mutate(s.id); } }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
    </div>
  );
}
