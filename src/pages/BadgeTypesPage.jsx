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

// The badge's own colour is stored data (a hex the owner picked); the tint is mixed from it.
const badgeStyle = c => ({
  color: c,
  background: `color-mix(in oklab, ${c} 12%, var(--color-paper))`,
  borderColor: `color-mix(in oklab, ${c} 35%, var(--color-paper))`,
});

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
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="badge-form-title" onClick={e=>e.stopPropagation()}>
        <div className="dialog-body">
          <h2 id="badge-form-title" className="dialog-title">
            {initial ? 'Edit badge type' : 'New badge type'}
          </h2>
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
            <div role="group" aria-label="Badge colour" style={{ display:'flex', flexWrap:'wrap', gap:'var(--space-xs)', marginTop:'var(--space-3xs)' }}>
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  title={c}
                  aria-label={`Colour ${c}`}
                  aria-pressed={color === c}
                  style={{
                    width:28, height:28, padding:0, borderRadius:'var(--radius-control)',
                    background: c,
                    border: color === c ? '2px solid var(--color-paper)' : '1px solid var(--color-rule-2)',
                    cursor:'pointer',
                    boxShadow: color === c ? '0 0 0 2px var(--color-ink)' : 'none',
                  }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                style={{ width:28, height:28, minHeight:0, padding:0, borderRadius:'var(--radius-control)', cursor:'pointer' }}
                title="Custom colour"
                aria-label="Custom colour"
              />
            </div>
            <div style={{ marginTop:'var(--space-sm)' }}>
              <span className="pill" style={badgeStyle(color)}>
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
        <div className="dialog-actions">
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
      toast.success(n > 0 ? `Deleted, removed from ${n} customer${n===1?'':'s'}` : 'Deleted');
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
      <div className="page-head">
        <div>
          <h2 className="page-head-title">Badge types</h2>
          <p className="cell-sub" style={{ maxWidth:'70ch' }}>
            Owner-managed labels applied to customers. Delete removes the badge from everyone who has it. Rename cascades automatically.
          </p>
        </div>
        <Btn onClick={() => setEditing('new')}>+ New badge</Btn>
      </div>

      {isLoading && <div className="table-skeleton">{[1,2,3,4].map(i => <Skeleton key={i} h={44}/>)}</div>}
      {error && <div style={{ padding:'var(--space-lg)' }}><ApiError error={error} /></div>}

      {!isLoading && !error && badges.length === 0 && (
        <Empty message="No badge types yet" sub="Create one with New badge to get started." />
      )}

      {!isLoading && badges.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Preview</th>
                <th>Name</th>
                <th>Colour</th>
                <th className="num">Sort</th>
                <th><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {badges.map(b => (
                <tr key={b.id}>
                  <td>
                    <span className="pill" style={badgeStyle(b.color)}>{b.name}</span>
                  </td>
                  <td className="cell-strong">{b.name}</td>
                  <td className="mono cell-muted cell-nowrap">
                    <span aria-hidden="true" style={{ display:'inline-block', width:14, height:14, borderRadius:'var(--radius-control)', background:b.color, verticalAlign:'middle', marginRight:'var(--space-xs)' }}/>
                    {b.color}
                  </td>
                  <td className="num cell-muted">{b.sort_order ?? 100}</td>
                  <td>
                    <div className="row-actions" style={{ justifyContent:'flex-end' }}>
                      <GhostBtn sm onClick={() => setEditing(b)}>Edit</GhostBtn>
                      <button type="button" className="btn btn-ghost btn-sm btn-ghost-danger" onClick={() => onDelete(b)}>Delete</button>
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
