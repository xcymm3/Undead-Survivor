import { ZOMBIE_TYPES } from './config';
import type { Difficulty, ZombieKind } from './config';

type Tier = 1 | 2 | 3 | 4;

const TIER_WEIGHTS: { through: number; weights: readonly [number, number, number, number] }[] = [
  { through: 2, weights: [1, 0, 0, 0] },
  { through: 4, weights: [.80, .20, 0, 0] },
  { through: 6, weights: [.64, .26, .10, 0] },
  { through: 8, weights: [.50, .28, .17, .05] },
  { through: 10, weights: [.38, .30, .24, .08] },
  { through: Infinity, weights: [.32, .30, .28, .10] },
];

const POOLS: Record<Tier, readonly { kind: ZombieKind; weight: number }[]> = {
  1: [{ kind: 'normal', weight: .60 }, { kind: 'cone', weight: .27 }, { kind: 'bucket', weight: .13 }],
  2: [{ kind: 'imp', weight: .60 }, { kind: 'shield', weight: .40 }],
  3: [{ kind: 'berserker', weight: .75 }, { kind: 'giant', weight: .25 }],
  4: [{ kind: 'football', weight: 1 }],
};

function roll(random: () => number) {
  const value = random();
  return Number.isFinite(value) ? Math.max(0, Math.min(1 - Number.EPSILON, value)) : 0;
}

function weighted<T extends { weight: number }>(entries: readonly T[], random: () => number) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const value = roll(random) * total;
  let cumulative = 0;
  for (const entry of entries) {
    cumulative += entry.weight;
    if (value < cumulative) return entry;
  }
  return entries.at(-1)!;
}

export function tierWeights(wave: number) {
  const normalized = Math.max(1, Math.floor(wave));
  return TIER_WEIGHTS.find(stage => normalized <= stage.through)!.weights;
}

export function randomZombieKind(wave: number, random: () => number = Math.random): ZombieKind {
  const weights = tierWeights(wave);
  const tier = weighted(weights.map((weight, index) => ({ tier: index + 1 as Tier, weight })), random).tier;
  return weighted(POOLS[tier], random).kind;
}

export function waveRoster(wave: number, count: number, difficulty: Difficulty = 'hard', random: () => number = Math.random) {
  const size = Math.max(0, Math.floor(count));
  if (difficulty === 'easy') return Array<ZombieKind>(size).fill('normal');
  const roster = Array.from({ length: size }, () => difficulty === 'normal'
    ? weighted(POOLS[1], random).kind : randomZombieKind(wave, random));
  const normalizedWave = Math.max(1, Math.floor(wave));
  // 第 7～8 波引入四阶，整波未抽中时补一只，让两波一次的阶位推进可感知。
  if (difficulty === 'hard' && size > 0 && normalizedWave >= 7 && normalizedWave <= 8 && !roster.includes('football')) {
    roster[size - 1] = 'football';
  }
  return roster;
}

export function simultaneousCap(kind: ZombieKind, wave: number, players: number) {
  const coop = players >= 3;
  if (kind === 'football') {
    if (wave <= 8) return 1;
    if (wave <= 10) return coop ? 3 : 2;
    return coop ? 4 : 3;
  }
  return Infinity;
}

export function bodyHealth(kind: ZombieKind) {
  return ZOMBIE_TYPES[kind].health - ZOMBIE_TYPES[kind].armor;
}
