import { describe, expect, it } from 'vitest';
import { ENEMY_RULES, ZOMBIE_TYPES } from '../../src/game/config';
import { Encounter, waveSettings, type Zombie } from '../../src/game/encounter';
import { tierWeights, waveRoster } from '../../src/game/enemyRoster';
import { zombieMoveSpeed } from '../../src/game/movement';
import { Navigation } from '../../src/game/navigation';
import { isWater, riverCenter } from '../../src/game/terrain';
import { ZombieField } from '../../src/game/zombies';
import { Raycaster, Vector3 } from 'three';
import type { Pawn } from '../../src/multiplayer/types';

function actor(kind: Zombie['kind'], x = 0, z = -30): Zombie {
  const definition = ZOMBIE_TYPES[kind];
  return { id: 1, kind, x, z, health: definition.health, bodyHealth: definition.health - definition.armor,
    armorHealth: definition.armor, maxHealth: definition.health, bornAt: 0, downTime: 0,
    specialState: kind === 'football' ? 'ready' : undefined, specialCooldown: kind === 'football' ? 0 : undefined };
}

describe('八类僵尸数值与阶位名单', () => {
  it('冻结最终生命与防具数值', () => {
    expect(ZOMBIE_TYPES).toMatchObject({
      normal: { health: 100, armor: 0, tier: 1 }, cone: { health: 200, armor: 100, tier: 1 },
      bucket: { health: 400, armor: 300, tier: 1 }, imp: { health: 300, armor: 0, tier: 2 },
      shield: { health: 700, armor: 500, tier: 2 }, berserker: { health: 1200, armor: 0, tier: 3 },
      giant: { health: 6000, armor: 0, tier: 3 }, football: { health: 3750, armor: 2000, tier: 4 },
    });
  });

  it('每两波推进阶位，第九波提高混合精英权重', () => {
    const stages = [[1, 0, 0, 0], [.80, .20, 0, 0], [.64, .26, .10, 0], [.50, .28, .17, .05], [.38, .30, .24, .08]];
    stages.forEach((weights, index) => {
      expect(tierWeights(index * 2 + 1)).toEqual(weights);
      expect(tierWeights(index * 2 + 2)).toEqual(weights);
    });
    expect(tierWeights(11)).toEqual([.32, .30, .28, .10]);
    expect(tierWeights(100)).toEqual([.32, .30, .28, .10]);
  });

  it('前两波只有一阶，第七和第八波保底一只四阶且不增加波次总量', () => {
    for (const wave of [1, 2]) expect(waveRoster(wave, waveSettings(wave).count, 'hard', () => .99)
      .every(kind => ['normal', 'cone', 'bucket'].includes(kind))).toBe(true);
    for (const wave of [7, 8]) {
      const roster = waveRoster(wave, waveSettings(wave).count, 'hard', () => 0);
      expect(roster).toHaveLength(waveSettings(wave).count);
      expect(roster.filter(kind => kind === 'football')).toHaveLength(1);
    }
    expect(waveRoster(6, 20, 'hard', () => .999)).not.toContain('football');
    expect(waveRoster(7, 1, 'hard', () => .999)).toEqual(['football']);
    expect(waveRoster(9, 20, 'hard', () => 0)).not.toContain('football');
  });

  it('盾牌可从侧后绕过且破盾不会加速，狂暴恰在4x生命触发', () => {
    const encounter = new Encounter(() => 0); encounter.reset('survival', 'hard');
    const shield = actor('shield'); encounter.zombies = [shield];
    encounter.hit(shield.id, false, 50, false);
    expect(shield).toMatchObject({ bodyHealth: 150, armorHealth: 500, health: 650 });
    expect(zombieMoveSpeed(shield, 2)).toBeCloseTo(2.2);
    encounter.hit(shield.id, false, 500, true);
    expect(shield.armorHealth).toBe(0);
    expect(zombieMoveSpeed(shield, 2)).toBeCloseTo(2.2);
    const berserker = actor('berserker'); encounter.zombies = [berserker];
    expect(encounter.hit(1, false, 599)?.enraged).toBeUndefined();
    expect(encounter.hit(1, false, 1)?.enraged).toBe(true);
    expect(berserker.ragePause).toBe(ENEMY_RULES.berserker.ragePause);
    expect(zombieMoveSpeed(berserker, 2)).toBe(0);
    berserker.ragePause = 0;
    expect(zombieMoveSpeed(berserker, 2)).toBeCloseTo(5.2);
  });

  it('持盾者正面150度内由盾牌接弹，背面射击绕过盾牌', () => {
    const encounter = new Encounter(() => 0), shield = actor('shield', 0, 0);
    shield.heading = 0; encounter.zombies = [shield];
    const field = new ZombieField(); field.sync(encounter);
    try {
      const front = new Raycaster(new Vector3(0, 1.8, 10), new Vector3(0, 0, -1));
      expect(field.decode(front.intersectObject(field)[0])).toEqual({ id: 1, head: false, armor: true });
      const rear = new Raycaster(new Vector3(0, 1.8, -10), new Vector3(0, 0, 1));
      expect(field.decode(rear.intersectObject(field)[0])).toEqual({ id: 1, head: true, armor: false });

      shield.attacking = true; shield.attackTime = .2; field.sync(encounter);
      expect(field.decode(front.intersectObject(field)[0])).toMatchObject({ id: 1, armor: false });

      shield.attackTime = .6; field.sync(encounter);
      expect(field.decode(front.intersectObject(field)[0])).toMatchObject({ id: 1, armor: true });
    } finally { field.dispose(); (field.material as { dispose(): void }).dispose(); }
  });

  it('巨人始终保持0.75x移速，橄榄球常速为1.65x且破甲后为1.35x', () => {
    const giant = actor('giant');
    expect(zombieMoveSpeed(giant, 2)).toBe(1.5);
    giant.health = 100; giant.bodyHealth = 100;
    expect(zombieMoveSpeed(giant, 2)).toBe(1.5);
    const football = actor('football');
    expect(zombieMoveSpeed(football, 2)).toBeCloseTo(3.3);
    football.armorHealth = 0;
    expect(zombieMoveSpeed(football, 2)).toBeCloseTo(2.7);
  });
});

describe('橄榄球冲锋和河道', () => {
  it('隔河时直接绕桥追击，不蓄力冲河或白白眩晕', () => {
    const encounter = new Encounter(() => 0); encounter.reset('survival', 'hard');
    encounter.setNavigation(new Navigation([], true)); encounter.wave = 10;
    encounter.waveSpawned = encounter.pressure.count; encounter.waveQueue = [];
    encounter.player = { x: 0, z: riverCenter(0) - 7 };
    const football = actor('football', 0, riverCenter(0) + 7); encounter.zombies = [football];
    const start = { x: football.x, z: football.z };
    for (let i = 0; i < 20; i++) {
      encounter.update(.05, () => null);
      expect(football.specialState).toBe('ready');
      expect(isWater(football)).toBe(false);
    }
    expect(Math.hypot(football.x - start.x, football.z - start.z)).toBeGreaterThan(.5);
  });

  for (const phase of ['windup', 'charging'] as const) it(`玩家在${phase}期间跳到对岸时取消冲锋并重新寻路`, () => {
    const encounter = new Encounter(() => 0); encounter.reset('survival', 'hard');
    encounter.setNavigation(new Navigation([], true)); encounter.wave = 10;
    encounter.waveSpawned = encounter.pressure.count; encounter.waveQueue = [];
    encounter.player = { x: 0, z: -2 };
    const football = actor('football', 0, -10); encounter.zombies = [football];
    for (let i = 0; i < 20 && football.specialState !== phase; i++) encounter.update(.05, () => null);
    expect(football.specialState).toBe(phase);
    encounter.player = { x: 0, z: -24 }; encounter.update(.05, () => null);
    expect(football.specialState).toBe('ready');
    expect(football.specialCooldown).toBeGreaterThan(0);
    expect(isWater(football)).toBe(false);
  });

  it('桥上直线路径畅通时允许冲锋，高波次速度达到8.5米每秒', () => {
    const encounter = new Encounter(() => 0); encounter.reset('survival', 'hard');
    encounter.setNavigation(new Navigation([], true)); encounter.wave = 10;
    encounter.waveSpawned = encounter.pressure.count; encounter.waveQueue = [];
    encounter.player = { x: 10, z: riverCenter(10) - 5 };
    const football = actor('football', 10, riverCenter(10) + 5); encounter.zombies = [football];
    encounter.update(.05, () => null); expect(football.specialState).toBe('windup');
    football.specialState = 'charging';
    expect(zombieMoveSpeed(football, encounter.pressure.speed)).toBe(8.5);
  });

  it('第十波橄榄球完成蓄力和冲锋，命中只造成一次10点伤害', () => {
    const encounter = new Encounter(() => 0); encounter.reset('survival', 'hard'); encounter.setNavigation(new Navigation([]));
    encounter.wave = 10; encounter.waveSpawned = waveSettings(10).count; encounter.waveQueue = [];
    encounter.player = { x: 0, z: 0 };
    const football = actor('football', 0, -8); encounter.zombies = [football];
    for (let i = 0; i < 80 && encounter.health === 100; i++) encounter.update(.05, () => null);
    expect(encounter.health).toBe(90);
    expect(football.specialState).toBe('ready');
    expect(football.specialCooldown).toBeGreaterThan(3);
  });
});

describe('类型攻击节奏', () => {
  it('小鬼按0.18秒前摇攻击，巨人砸击同时伤害范围内队员', () => {
    const impEncounter = new Encounter(() => 0); impEncounter.reset('survival', 'hard');
    impEncounter.waveQueue = []; impEncounter.waveSpawned = impEncounter.pressure.count;
    impEncounter.zombies = [actor('imp', 0, 8)];
    impEncounter.update(.17, () => null); expect(impEncounter.health).toBe(100);
    impEncounter.update(.02, () => null); expect(impEncounter.health).toBe(90);

    const giantEncounter = new Encounter(() => 0); giantEncounter.reset('survival', 'hard');
    const pawn = (id: string, x: number) => ({ id, name: id, x, z: 9, height: 0, yaw: 0, pitch: 0, health: 100,
      lastDamageAt: -Infinity, weapon: 0, shots: 0, ammo: 30, reloading: false, reloadProgress: 0, reloadEmpty: false,
      appearance: {} } as Pawn);
    const players = [pawn('a', 0), pawn('b', 1.9)];
    giantEncounter.setCombatants(players, [new Navigation([]), new Navigation([])]);
    giantEncounter.waveQueue = []; giantEncounter.waveSpawned = giantEncounter.pressure.count;
    giantEncounter.zombies = [actor('giant', 0, 9)];
    giantEncounter.update(.66, () => null);
    expect(players.map(player => player.health)).toEqual([90, 90]);
  });
});
