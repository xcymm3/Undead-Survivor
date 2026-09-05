import { ZOMBIE_TYPES } from './config';
import type { Difficulty, ZombieKind } from './config';

type Tier = 1 | 2 | 3 | 4;

const TIER_WEIGHTS: { through: number; weights: readonly [number, number, number, number] }[] = [
  { through: 3, weights: [1, 0, 0, 0] },
  { through: 6, weights: [.92, .08, 0, 0] },
  { through: 7, weights: [.86, .12, .02, 0] },
  { through: 8, weights: [.81, .15, .04, 0] },
  { through: 9, weights: [.76, .18, .06, 0] },
  { through: 10, weights: [.70, .22, .07, .01] },
  { through: 11, weights: [.65, .25, .08, .02] },
  { through: Infinity, weights: [.60, .28, .10, .03] },
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
  return Array.from({ length: size }, () => difficulty === 'normal'
    ? weighted(POOLS[1], random).kind : randomZombieKind(wave, random));
}

export function simultaneousCap(kind: ZombieKind, wave: number, players: number) {
  const coop = players >= 3;
  if (kind === 'shield' || kind === 'berserker') return coop ? 6 : 4;
  if (kind === 'giant') return coop ? 2 : 1;
  if (kind === 'football') {
    if (wave <= 12) return 1;
    if (wave <= 18) return coop ? 3 : 2;
    return coop ? 4 : 3;
  }
  return Infinity;
}

export function bodyHealth(kind: ZombieKind) {
  return ZOMBIE_TYPES[kind].health - ZOMBIE_TYPES[kind].armor;
}
