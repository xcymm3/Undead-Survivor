export const CONFIG = {
  camera: { fov: 61, height: 1.7, sensitivity: 0.0022, pitchLimit: 85 * Math.PI / 180 },
  weapon: { capacity: 30, interval: 0.15, reloadDuration: 0.775, range: 180 },
  target: { respawn: 3, bodyDamage: 50, headDamage: 100 },
} as const;

export type GameMode = 'practice' | 'survival';
export type Difficulty = 'easy' | 'normal' | 'hard';
export const FIXED_DIFFICULTY = 'hard' satisfies Difficulty;
export type ZombieKind = 'normal' | 'cone' | 'bucket';
export type GamePhase = 'ready' | 'playing' | 'paused' | 'breaching' | 'failed';
export const WAVES = { firstCount: 9, countGrowth: 6, firstSpeed: 1.4, speedGrowth: 0.15, spawnRate: 1, spawnGrowth: 0.2, rest: 5 } as const;
export const ZOMBIE_TYPES = {
  normal: { label: '普通僵尸', health: 100, armor: 0 },
  cone: { label: '路障僵尸', health: 200, armor: 100 },
  bucket: { label: '铁桶僵尸', health: 400, armor: 300 },
} as const;
export const ARMOR_SPAWNS = { normalPerCone: 3, conesPerBucket: 2 } as const;
export const DIFFICULTIES = {
  easy: { label: '简单', description: '仅普通僵尸，爆头 1 枪击倒' },
  normal: { label: '普通', description: '开局即按比例混入路障僵尸，爆头需 2 枪' },
  hard: { label: '困难', description: '开局即按比例加入路障与铁桶，铁桶爆头需 4 枪' },
} as const;
export const ARENA = { minX: -22, maxX: 22, minZ: -48, maxZ: 14 } as const;
export const PLAYER = { health: 100, speed: 4.2, radius: 0.95, jumpSpeed: 8.4, gravity: 18 } as const;
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
  wave: number; wavesCleared: number; waveTotal: number; waveSpawned: number; intermission: number; grounded: boolean; playerHeight: number;
  health: number; hurt: boolean; pointerLocked: boolean;
  weaponsReady: boolean; weaponIndex: number; requestedWeapon: number; switching: boolean; reloadQueued: boolean; inventory: number[];
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
  shots: number;
  hits: number;
  kills: number;
  fps: number;
  yaw: number;
  pitch: number;
  sound: boolean;
  volume: number;
  breach: { id: number; kind: ZombieKind; x: number; y: number; side: string } | null;
  pixelated: boolean;
}
