import type { WeaponDefinition } from './weapons';

/** 单机和房主共用确定性弹幕，避免客户端表现与权威命中使用不同的随机散布。 */
export function pelletOffset(weapon: WeaponDefinition, pellet: number) {
  if (pellet === 0) return { x: 0, y: 0 };
  if (weapon.spreadVertical !== undefined) {
    // 首颗保留准星中心，其余按左右对称的横向列、上下两层填满扇面。
    // 两把霰弹枪均为奇数弹丸，保证中心之外的弹丸可以完整成对。
    const columns = Math.ceil((weapon.pellets - 1) / 2);
    const column = Math.floor((pellet - 1) / 2);
    const horizontal = columns > 1 ? column / (columns - 1) * 2 - 1 : 0;
    const vertical = ((pellet - 1) % 2 === 0 ? -1 : 1) * (1 - .3 * Math.abs(horizontal));
    return { x: horizontal * weapon.spread, y: vertical * weapon.spreadVertical };
  }
  const angle = pellet * 2.399963229728653;
  const radius = weapon.spread * Math.sqrt(pellet / Math.max(1, weapon.pellets - 1));
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

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
