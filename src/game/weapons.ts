export interface WeaponDefinition {
  id: string; label: string; short: string; model: string; capacity: number; interval: number;
  reloadDuration: number; automatic: boolean; damage: number; pellets: number; spread: number;
  length: number; rotationY: number; fireDuration: number; shellReload?: boolean; recoil: number;
}
export const WEAPONS: readonly WeaponDefinition[] = [
  // 步枪精准点头，P90 容错扫射；单发武器靠击杀阈值和更快复位区分用途。
  { id: 'rifle', label: '步枪', short: 'RIFLE', model: 'Rifle', capacity: 30, interval: 0.15, reloadDuration: 1.25, automatic: true, damage: 50, pellets: 1, spread: 0, length: 0.90, rotationY: 0, fireDuration: 0.15, recoil: 0.7 },
  { id: 'p90', label: 'P90 冲锋枪', short: 'P90', model: 'P90', capacity: 50, interval: 0.09, reloadDuration: 1.45, automatic: true, damage: 40, pellets: 1, spread: 0, length: 0.65, rotationY: 0, fireDuration: 0.09, recoil: 0.45 },
  { id: 'pistol', label: '半自动手枪', short: 'PISTOL', model: 'Pistol', capacity: 12, interval: 0.22, reloadDuration: 1.10, automatic: false, damage: 75, pellets: 1, spread: 0, length: 0.48, rotationY: Math.PI / 2, fireDuration: 0.20, recoil: 0.75 },
  { id: 'revolver', label: '左轮手枪', short: 'REVOLVER', model: 'Revolver', capacity: 6, interval: 0.40, reloadDuration: 1.90, automatic: false, damage: 100, pellets: 1, spread: 0, length: 0.55, rotationY: 0, fireDuration: 0.36, recoil: 1 },
  { id: 'shotgun', label: '泵动霰弹枪', short: 'SHOTGUN', model: 'Shotgun', capacity: 6, interval: 0.64, reloadDuration: 0.55, shellReload: true, automatic: false, damage: 32, pellets: 7, spread: 0.036, length: 0.90, rotationY: 0, fireDuration: 0.60, recoil: 1.2 },
  { id: 'sniper', label: '栓动狙击枪', short: 'SNIPER', model: 'SniperRifle', capacity: 5, interval: 0.80, reloadDuration: 1.65, automatic: false, damage: 200, pellets: 1, spread: 0, length: 1.02, rotationY: 0, fireDuration: 0.74, recoil: 1 },
];
export const SWITCH_DURATION = 0.4;
