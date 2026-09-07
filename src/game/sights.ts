import type { WeaponDefinition } from './weapons';

export type SightKind = 'hold' | 'iron' | 'red-dot' | 'holographic' | 'reflex' | 'prism' | 'sniper';
export interface SightDefinition { kind: SightKind; label: string; magnification: number }
const IRON: SightDefinition = { kind: 'iron', label: '机械瞄具', magnification: 1.25 };
const HOLD: SightDefinition = { kind: 'hold', label: '稳定持握', magnification: 1 };
const SIGHTS: Record<string, SightDefinition> = {
  rifle: { kind: 'red-dot', label: '红点瞄准镜', magnification: 1.5 },
  p90: { kind: 'holographic', label: '全息瞄准镜', magnification: 1.35 },
  'auto-shotgun': { kind: 'reflex', label: '环形反射镜', magnification: 1.25 },
  'heavy-machine-gun': { kind: 'prism', label: '刻度低倍镜', magnification: 2 },
  sniper: { kind: 'sniper', label: '全屏狙击镜', magnification: 6 },
};
export function weaponSight(weapon: WeaponDefinition): SightDefinition {
  return weapon.kind === 'melee' || weapon.kind === 'flame' ? HOLD : SIGHTS[weapon.id] ?? IRON;
}
export function isOpticalSight(sight: SightDefinition) { return sight.kind !== 'iron' && sight.kind !== 'hold'; }
/** 用视角正切计算倍率，保证 6× 对应真实投影放大而非简单除以 FOV。 */
export function sightFov(baseFov: number, magnification: number) {
  return 2 * Math.atan(Math.tan(baseFov * Math.PI / 360) / magnification) * 180 / Math.PI;
}
