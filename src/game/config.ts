import type { ActiveGraphicsPreset, GraphicsSettings } from './graphics';
import type { ReloadStage } from './reloadAnimation';

export const CONFIG = {
  camera: { fov: 61, height: 1.7, sensitivity: 0.0022, pitchLimit: 85 * Math.PI / 180 },
  weapon: { capacity: 30, interval: 0.15, reloadDuration: 1.25, range: 180 },
  target: { respawn: 3, bodyDamage: 50, headDamage: 100 },
} as const;

export type GameMode = 'practice' | 'survival';
export type Difficulty = 'easy' | 'normal' | 'hard';
export const FIXED_DIFFICULTY = 'hard' satisfies Difficulty;
export type ZombieKind = 'normal' | 'cone' | 'bucket' | 'imp' | 'shield' | 'berserker' | 'giant' | 'football';
export type GamePhase = 'ready' | 'playing' | 'paused' | 'breaching' | 'failed';
export const WAVES = { firstCount: 9, countGrowth: 6, firstSpeed: 1.4, speedGrowth: 0.15, spawnRate: 1, spawnGrowth: 0.2, rest: 5 } as const;
export const ZOMBIE_TYPES = {
  normal: { label: '普通僵尸', health: 100, armor: 0, tier: 1 },
  cone: { label: '路障僵尸', health: 200, armor: 100, tier: 1 },
  bucket: { label: '铁桶僵尸', health: 400, armor: 300, tier: 1 },
  imp: { label: '小鬼僵尸', health: 300, armor: 0, tier: 2 },
  shield: { label: '持盾僵尸', health: 600, armor: 400, tier: 2 },
  berserker: { label: '狂暴僵尸', health: 800, armor: 0, tier: 3 },
  giant: { label: '巨人僵尸', health: 2000, armor: 0, tier: 3 },
  football: { label: '橄榄球僵尸', health: 2500, armor: 2000, tier: 4 },
} as const;
export const ZOMBIE_KINDS = Object.keys(ZOMBIE_TYPES) as ZombieKind[];
export const emptyZombieCounts = () => Object.fromEntries(ZOMBIE_KINDS.map(kind => [kind, 0])) as Record<ZombieKind, number>;
export const ENEMY_RULES = {
  imp: { speed: 1.75, speedCap: 4, scale: .65, contactRadius: 1, separationRadius: .85, windup: .18, duration: .7 },
  shield: { speed: 1.1, speedCap: 3.6, scale: 1.05, contactRadius: 1.3, windup: .3, duration: 1, exposeDuration: .45 },
  berserker: { health: 800, speed: 1.35, rageAt: 400, ragePause: .35, rageSpeed: 2, speedCap: 4.3,
    windup: .25, duration: .85, rageWindup: .15, rageDuration: .55 },
  giant: { speed: .75, scale: 1.8, contactRadius: 1.8, separationRadius: 2.1, windup: .65, duration: 1.5, slamRadius: 2.4 },
  football: { speed: 1.5, brokenSpeed: 1.25, speedCap: 4, scale: 1.1, contactRadius: 1.35, windup: .2, duration: .7,
    chargeMin: 7, chargeMax: 16, chargeWindup: .45, chargeSpeed: 2.4, chargeSpeedCap: 5, chargeDuration: 1.4,
    chargeCooldown: 5, obstacleStun: 1.2, missStun: .8, riverStun: 1.5 },
} as const;
export const zombieScale = (kind: ZombieKind) => kind === 'imp' ? ENEMY_RULES.imp.scale
  : kind === 'shield' ? ENEMY_RULES.shield.scale : kind === 'giant' ? ENEMY_RULES.giant.scale
    : kind === 'football' ? ENEMY_RULES.football.scale : 1;
export const zombieContactRadius = (kind: ZombieKind) => kind === 'imp' ? ENEMY_RULES.imp.contactRadius
  : kind === 'shield' ? ENEMY_RULES.shield.contactRadius : kind === 'giant' ? ENEMY_RULES.giant.contactRadius
    : kind === 'football' ? ENEMY_RULES.football.contactRadius : SURVIVAL.contactRadius;
export const zombieAttack = (kind: ZombieKind, enraged = false) => kind === 'imp' ? ENEMY_RULES.imp
  : kind === 'shield' ? ENEMY_RULES.shield
    : kind === 'berserker' ? { windup: enraged ? ENEMY_RULES.berserker.rageWindup : ENEMY_RULES.berserker.windup,
      duration: enraged ? ENEMY_RULES.berserker.rageDuration : ENEMY_RULES.berserker.duration }
      : kind === 'giant' ? ENEMY_RULES.giant : kind === 'football' ? ENEMY_RULES.football : ATTACK;
export const ARMOR_SPAWNS = { normalPerCone: 3, conesPerBucket: 2 } as const;
export const DIFFICULTIES = {
  easy: { label: '简单', description: '仅普通僵尸，爆头 1 枪击倒' },
  normal: { label: '普通', description: '开局即按比例混入路障僵尸，爆头需 2 枪' },
  hard: { label: '困难', description: '阶位随波次提升，第 10 波起固定保底四阶橄榄球僵尸' },
} as const;
export const ARENA = { minX: -22, maxX: 22, minZ: -48, maxZ: 14 } as const;
export const PLAYER = { health: 100, speed: 4.2, radius: 0.95, jumpSpeed: 8.4, gravity: 18, zombieClearanceHeight: 1.1 } as const;
export const ATTACK = { damage: 10, windup: 0.35, duration: 1.1 } as const;
export const SURVIVAL = { maxSpawnRate: 10, maxZombies: 256, contactRadius: 1.25, spawnSafeRadius: 8, playerX: 0, playerZ: 9 } as const;
export const CROWD = { separationRadius: 1.35, maxLateralSpeed: 0.32, lateralFraction: 0.2, steeringDamping: 5, arrivalFade: 2 } as const;
export interface RunResult {
  mode: GameMode; waves: number; wave: number; cause: 'zombie' | 'water';
  id: string;
  difficulty: Difficulty;
  duration: number;
  kills: number;
  shots: number;
  hits: number;
  endedAt: string;
}
export interface GameSnapshot {
  coop?: { host: boolean; localId: string; players: { id: string; name: string; health: number }[]; spectating: boolean; spectatingId?: string };
  wave: number; wavesCleared: number; waveTotal: number; waveSpawned: number; intermission: number; grounded: boolean; playerHeight: number;
  health: number; hurt: boolean; pointerLocked: boolean;
  weaponsReady: boolean; weaponIndex: number; requestedWeapon: number; switching: boolean; reloadQueued: boolean; aiming: boolean; inventory: number[];
  phase: GamePhase;
  mode: GameMode;
  difficulty: Difficulty;
  survived: number;
  alive: number;
  zombieCounts: Record<ZombieKind, number>;
  nearest: number | null;
  spawnRate: number;
  speed: number;
  result: RunResult | null;
  ammo: number;
  reloading: boolean;
  reloadStage: ReloadStage | null;
  shots: number;
  hits: number;
  kills: number;
  fps: number;
  yaw: number;
  pitch: number;
  sound: boolean;
  volume: number;
  sensitivity: number;
  breach: { id: number; kind: ZombieKind; x: number; y: number; side: string } | null;
  pixelated: boolean;
  graphicsPreset: ActiveGraphicsPreset;
  graphics: GraphicsSettings;
  renderResolution: { width: number; height: number; scale: number; gpu: string };
}
