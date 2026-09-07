export interface WeaponDefinition {
  tier: 'A' | 'B' | 'C';
  id: string; label: string; short: string; model: string; capacity: number; interval: number;
  reloadDuration: number; automatic: boolean; damage: number; pellets: number; spread: number;
  /** 横向扇面弹幕的纵向半宽；未配置时保持原有圆形分布。 */
  spreadVertical?: number;
  length: number; rotationY: number; fireDuration: number; shellReload?: boolean; recoil: number;
  kind?: 'gun' | 'melee' | 'flame'; range?: number; piercing?: boolean; infiniteAmmo?: boolean;
  headshotMultiplier?: number; procedural?: boolean; ads: readonly [number, number, number];
}
export const WEAPONS: readonly WeaponDefinition[] = [
  // 步枪精准点头，P90 容错扫射；单发武器靠击杀阈值和更快复位区分用途。
  { id: 'rifle', label: '步枪', short: 'RIFLE', model: 'Rifle', capacity: 30, interval: .12, reloadDuration: 1.60, automatic: true, damage: 60, pellets: 1, spread: 0, length: 0.90, rotationY: 0, fireDuration: .12, recoil: 0.7, ads: [0, -.075, -.46], tier: 'A' },
  { id: 'p90', label: 'P90 冲锋枪', short: 'P90', model: 'P90', capacity: 45, interval: 0.09, reloadDuration: 1.50, automatic: true, damage: 30, pellets: 1, spread: 0, length: 0.65, rotationY: 0, fireDuration: 0.09, recoil: 0.45, ads: [0, -.08, -.44], tier: 'B' },
  { id: 'pistol', label: '半自动手枪', short: 'PISTOL', model: 'Pistol', capacity: 12, interval: .30, reloadDuration: 1.20, automatic: false, damage: 50, pellets: 1, spread: 0, length: 0.48, rotationY: Math.PI / 2, fireDuration: 0.20, recoil: 0.75, ads: [0, -.095, -.40], tier: 'C' },
  { id: 'revolver', label: '左轮手枪', short: 'REVOLVER', model: 'Revolver', capacity: 6, interval: .45, reloadDuration: 1.60, automatic: false, damage: 150, pellets: 1, spread: 0, length: 0.55, rotationY: 0, fireDuration: 0.36, recoil: 1, ads: [0, -.09, -.41], tier: 'B' },
  { id: 'shotgun', label: '泵动霰弹枪', short: 'SHOTGUN', model: 'Shotgun', capacity: 6, interval: .80, reloadDuration: .45, shellReload: true, automatic: false, damage: 280 / 15, pellets: 15, spread: .28, spreadVertical: .075, length: 0.90, rotationY: 0, fireDuration: .74, recoil: 1.2, ads: [0, -.07, -.48], tier: 'B' },
  { id: 'sniper', label: '栓动狙击枪', short: 'SNIPER', model: 'SniperRifle', capacity: 5, interval: .85, reloadDuration: 1.80, automatic: false, damage: 280, pellets: 1, spread: 0, length: 1.02, rotationY: 0, fireDuration: .78, recoil: 1, ads: [0, -.06, -.52], tier: 'B', headshotMultiplier: 3 },
  { id: 'axe', label: '消防斧', short: 'AXE', model: 'Axe', capacity: 1, interval: .60, reloadDuration: 0, automatic: false, damage: 300, pellets: 3, spread: .13, length: .78, rotationY: 0, fireDuration: .56, recoil: .55, kind: 'melee', range: 2.5, infiniteAmmo: true, headshotMultiplier: 1.5, procedural: true, ads: [.12, -.07, -.34], tier: 'A' },
  { id: 'flamethrower', label: '喷火枪', short: 'FLAME', model: 'Flamethrower', capacity: 100, interval: .08, reloadDuration: 2.40, automatic: true, damage: 36, pellets: 1, spread: 0, length: .86, rotationY: 0, fireDuration: .08, recoil: .12, kind: 'flame', range: 12, piercing: true, headshotMultiplier: 1, procedural: true, ads: [0, -.065, -.48], tier: 'A' },
  { id: 'auto-shotgun', label: '自动霰弹枪', short: 'AUTO SG', model: 'AutoShotgun', capacity: 12, interval: .36, reloadDuration: 2.20, automatic: true, damage: 192 / 17, pellets: 17, spread: .34, spreadVertical: .095, length: .92, rotationY: 0, fireDuration: .25, recoil: 1.05, procedural: true, ads: [0, -.07, -.49], tier: 'A' },
  { id: 'heavy-machine-gun', label: '重机枪', short: 'HMG', model: 'HeavyMachineGun', capacity: 100, interval: .09, reloadDuration: 3.60, automatic: true, damage: 45, pellets: 1, spread: .014, length: 1.06, rotationY: 0, fireDuration: .09, recoil: .62, procedural: true, ads: [0, -.055, -.54], tier: 'A' },
];
export const SWITCH_DURATION = 0.4;
