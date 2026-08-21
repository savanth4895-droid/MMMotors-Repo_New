import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { badgeTypesApi, errMsg } from '../api/client';
import { Btn, GhostBtn, Field, Skeleton, Empty, ApiError } from '../components/ui';
import { useConfirm } from '../components/ConfirmModal';
import toast from 'react-hot-toast';

const PRESET_COLORS = [
  '#B8860B', '#9333EA', '#16A34A', '#0EA5E9',
  '#EF4444', '#3B82F6', '#EC4899', '#F97316',
  '#14B8A6', '#78716C', '#4F46E5', '#84CC16',
];

function BadgeForm({ initial, onSave, onCancel, saving }) {
  const [name,   setName]   = useState(initial?.name       || '');
  const [color,  setColor]  = useState(initial?.color      || PRESET_COLORS[0]);
  const [order,  setOrder]  = useState(initial?.sort_order ?? 100);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return toast.error('Name required');
    onSave({ name: trimmed, color, sort_order: Number(order) || 100 });
  };

  return (
    <div onClick={onCancel} style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.55)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000,
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'var(--card, #1a1a1c)', border:'1px solid var(--border, #333)',
        borderRadius:6, padding:24, minWidth:380, maxWidth:'90vw',
        boxShadow:'0 20px 60px rgba(0,0,0,.5)',
      }}>
        <div style={{ fontSize:11, letterSpacing:'.15em', color:'var(--dim)', textTransform:'uppercase', marginBottom:6 }}>
          {initial ? 'Edit badge type' : 'New badge type'}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14, marginTop:12 }}>
          <Field label="Name">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={40}
              placeholder="e.g. Special Offer"
              autoFocus
            />
          </Field>
          <Field label="Colour">
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:2 }}>
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  title={c}
                  style={{
                    width:26, height:26, borderRadius:4,
                    background: c,
                    border: color === c ? '3px solid #fff' : `1px solid ${c}`,
                    cursor:'pointer',
                    boxShadow: color === c ? `0 0 0 2px ${c}` : 'none',
                  }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                style={{ width:26, height:26, border:'1px solid var(--border)', borderRadius:4, background:'transparent', padding:0 }}
                title="Custom colour"
              />
            </div>
            <div style={{ marginTop:10 }}>
              <span style={{
                padding:'3px 10px', borderRadius:3, fontSize:11, fontWeight:700,
                color, background:`${color}1F`, border:`1px solid ${color}59`,
                fontFamily:'IBM Plex Sans,sans-serif', letterSpacing:'.04em',
              }}>
                {name.trim() || 'Preview'}
              </span>
            </div>
          </Field>
          <Field label="Sort order (lower = shown first)">
            <input
              type="number"
              min={0}
              value={order}
              onChange={e => setOrder(e.target.value)}
              style={{ width:120 }}
            />
          </Field>
        </div>
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:24 }}>
          <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
          <Btn onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : (initial ? 'Update' : 'Create')}
          </Btn>
        </div>
      </div>
    </div>
  );
}

export default function BadgeTypesPage() {
  const qc      = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null);   // badge object being edited, or 'new', or null
  const isCreating = editing === 'new';
  const isEditing  = editing && typeof editing === 'object';

  const { data, isLoading, error } = useQuery({
    queryKey: ['badge-types'],
    queryFn:  () => badgeTypesApi.list().then(r => r.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['badge-types'] });
    qc.invalidateQueries({ queryKey: ['customer-badges-map'] });
    qc.invalidateQueries({ queryKey: ['customers'] });
  };

  const createMut = useMutation({
    mutationFn: (data) => badgeTypesApi.create(data),
    onSuccess: () => { invalidate(); setEditing(null); toast.success('Badge created'); },
    onError:   (e)  => toast.error(errMsg(e, 'Create failed')),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => badgeTypesApi.update(id, data),
    onSuccess: () => { invalidate(); setEditing(null); toast.success('Badge updated'); },
    onError:   (e)  => toast.error(errMsg(e, 'Update failed')),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => badgeTypesApi.delete(id),
    onSuccess: (r) => {
      invalidate();
      const n = r?.data?.customers_updated ?? 0;
      toast.success(n > 0 ? `Deleted · stripped from ${n} customer${n===1?'':'s'}` : 'Deleted');
    },
    onError:   (e) => toast.error(errMsg(e, 'Delete failed')),
  });

  const onDelete = async (b) => {
    const ok = await confirm(`Delete badge "${b.name}"?`, {
      sub: `This also removes the "${b.name}" badge from every customer that has it. Cannot be undone.`,
      danger: true,
    });
    if (ok) deleteMut.mutate(b.id);
  };

  const badges = Array.isArray(data) ? data : [];

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, margin:0, letterSpacing:'-.01em' }}>Badge Types</h1>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>
            Owner-managed labels applied to customers. Delete removes the badge from everyone who has it. Rename cascades automatically.
          </div>
        </div>
        <Btn onClick={() => setEditing('new')}>+ New Badge</Btn>
      </div>

      {isLoading && <Skeleton rows={4} />}
      {error && <ApiError error={error} />}

      {!isLoading && !error && badges.length === 0 && (
        <Empty message="No badge types yet. Create one to get started." />
      )}

      {!isLoading && badges.length > 0 && (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--surface2, rgba(255,255,255,.03))', borderBottom:'1px solid var(--border)' }}>
                <th style={{ textAlign:'left', padding:'12px 16px', fontSize:10, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--muted)' }}>Preview</th>
                <th style={{ textAlign:'left', padding:'12px 16px', fontSize:10, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--muted)' }}>Name</th>
                <th style={{ textAlign:'left', padding:'12px 16px', fontSize:10, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--muted)' }}>Colour</th>
                <th style={{ textAlign:'left', padding:'12px 16px', fontSize:10, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--muted)' }}>Sort</th>
                <th style={{ padding:'12px 16px' }}></th>
              </tr>
            </thead>
            <tbody>
              {badges.map(b => (
                <tr key={b.id} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{
                      padding:'3px 10px', borderRadius:3, fontSize:11, fontWeight:700,
                      color: b.color, background:`${b.color}1F`, border:`1px solid ${b.color}59`,
                      fontFamily:'IBM Plex Sans,sans-serif', letterSpacing:'.04em',
                    }}>{b.name}</span>
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:13 }}>{b.name}</td>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'var(--muted)', fontFamily:'monospace' }}>
                    <span style={{ display:'inline-block', width:14, height:14, borderRadius:3, background:b.color, verticalAlign:'middle', marginRight:8 }}/>
                    {b.color}
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:12, color:'var(--muted)' }}>{b.sort_order ?? 100}</td>
                  <td style={{ padding:'12px 16px', textAlign:'right' }}>
                    <div style={{ display:'inline-flex', gap:6 }}>
                      <GhostBtn sm onClick={() => setEditing(b)}>Edit</GhostBtn>
                      <GhostBtn sm onClick={() => onDelete(b)} style={{ color:'#e05555', borderColor:'#e05555' }}>Delete</GhostBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isCreating && (
        <BadgeForm
          onCancel={() => setEditing(null)}
          onSave={(d) => createMut.mutate(d)}
          saving={createMut.isPending}
        />
      )}
      {isEditing && (
        <BadgeForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={(d) => updateMut.mutate({ id: editing.id, data: d })}
          saving={updateMut.isPending}
        />
      )}
    </div>
  );
}
