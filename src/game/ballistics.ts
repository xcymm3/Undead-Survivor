export interface OrderedHit { distance: number; }

/** 射线结果已按距离排序；穿透武器能经过目标，但仍会被第一个场景表面挡住。 */
export function resolveWeaponHits<T extends OrderedHit>(hits: readonly T[], isTarget: (hit: T) => boolean, piercing: boolean) {
  if (!piercing) {
    const impact = hits[0];
    return { impact, targets: impact && isTarget(impact) ? [impact] : [] };
  }
  const impact = hits.find(hit => !isTarget(hit));
  return { impact, targets: hits.filter(hit => isTarget(hit) && (!impact || hit.distance < impact.distance)) };
}
