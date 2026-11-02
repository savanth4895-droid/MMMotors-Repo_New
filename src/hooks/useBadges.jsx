// Reusable customer-badge machinery. One hook that supplies:
//   - `types`     – the current badge_types (owner-managed)
//   - `byName`    – Map<name, {color, sort_order}>
//   - `badgesFor(mobile)` – returns [names] for a given mobile from the badges-map
//   - `<CustomerBadges names={[...]} />` – renders coloured chips
//
// The customer-badges-map endpoint is called once per page; TanStack Query
// dedupes across components. Cache TTL 60 s.

import { useQuery } from '@tanstack/react-query';
import { badgeTypesApi, customersApi } from '../api/client';

const STALE = 60_000; // 1 min

export function useBadgeTypes() {
  return useQuery({
    queryKey: ['badge-types'],
    queryFn:  () => badgeTypesApi.list().then(r => r.data),
    staleTime: STALE,
  });
}

export function useCustomerBadgesMap() {
  return useQuery({
    queryKey: ['customer-badges-map'],
    queryFn:  () => customersApi.badgesMap().then(r => r.data),
    staleTime: STALE,
  });
}

// One-stop hook. Combines types + mobile→tags map + helpers.
export function useBadges() {
  const typesQ = useBadgeTypes();
  const mapQ   = useCustomerBadgesMap();

  const types = Array.isArray(typesQ.data) ? typesQ.data : [];
  const map   = mapQ.data && typeof mapQ.data === 'object' ? mapQ.data : {};

  const byName = new Map(types.map(t => [t.name, t]));

  const normalizeMobile = (m) => (m == null ? '' : String(m).replace(/\D/g, ''));
  const mapByCleaned = new Map(Object.entries(map).map(([k, v]) => [normalizeMobile(k), v]));

  const badgesFor = (mobile) => {
    if (!mobile) return [];
    return mapByCleaned.get(normalizeMobile(mobile)) || [];
  };

  return {
    types,
    byName,
    badgesFor,
    isLoading: typesQ.isLoading || mapQ.isLoading,
  };
}

// ── Chip rendering ────────────────────────────────────────────────────────────
// `names`   – array of badge names to render
// `byName`  – Map from useBadges (needed for colour lookup)
// `compact` – true → smaller chips for dense rows
// `align`   – 'inline' (default) or 'stack' (wrap on next line)
export function CustomerBadges({ names, byName, compact = false, align = 'inline' }) {
  if (!Array.isArray(names) || names.length === 0) return null;
  const pad     = compact ? '1px 6px' : '2px 8px';
  const fs      = compact ? 9         : 10;
  const gap     = compact ? 3         : 4;
  return (
    <span style={{
      display:'inline-flex', gap, flexWrap: align === 'stack' ? 'wrap' : 'nowrap',
      verticalAlign:'middle', marginLeft: compact ? 4 : 6,
    }}>
      {names.map(name => {
        const t     = byName?.get(name);
        const color = t?.color || '#888';
        return (
          <span
            key={name}
            title={name}
            style={{
              padding: pad,
              borderRadius: 3,
              fontSize: fs,
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: '.04em',
              color,
              background: `${color}1F`,          // 12% opacity hex
              border: `1px solid ${color}59`,    // ~35% opacity hex
              fontFamily: 'IBM Plex Sans, sans-serif',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </span>
        );
      })}
    </span>
  );
}
