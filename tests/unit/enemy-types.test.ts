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
      shield: { health: 600, armor: 400, tier: 2 }, berserker: { health: 800, armor: 0, tier: 3 },
      giant: { health: 2000, armor: 0, tier: 3 }, football: { health: 2500, armor: 2000, tier: 4 },
    });
  });

  it('每三个波次按设计提高阶位概率', () => {
    expect(tierWeights(1)).toEqual([1, 0, 0, 0]);
    expect(tierWeights(4)).toEqual([.92, .08, 0, 0]);
    expect(tierWeights(7)).toEqual([.75, .20, .05, 0]);
    expect(tierWeights(10)).toEqual([.47, .35, .15, .03]);
    expect(tierWeights(13)).toEqual([.32, .35, .25, .08]);
    expect(tierWeights(16)).toEqual([.20, .30, .35, .15]);
    expect(tierWeights(19)).toEqual([.10, .25, .40, .25]);
  });

  it('前三波只有一阶；第十波起缺少橄榄球时等量替换一只', () => {
    for (const wave of [1, 2, 3]) expect(waveRoster(wave, waveSettings(wave).count, 'hard', () => .2)
      .every(kind => ['normal', 'cone', 'bucket'].includes(kind))).toBe(true);
    const guaranteed = waveRoster(10, waveSettings(10).count, 'hard', () => 0);
    expect(guaranteed).toHaveLength(63);
    expect(guaranteed.filter(kind => kind === 'football')).toHaveLength(1);
    expect(waveRoster(9, waveSettings(9).count, 'hard', () => 0)).not.toContain('football');
  });

  it('盾牌可从侧后绕过且破盾不会加速，狂暴恰在4x生命触发', () => {
    const encounter = new Encounter(() => 0); encounter.reset('survival', 'hard');
    const shield = actor('shield'); encounter.zombies = [shield];
    encounter.hit(shield.id, false, 50, false);
    expect(shield).toMatchObject({ bodyHealth: 150, armorHealth: 400, health: 550 });
    expect(zombieMoveSpeed(shield, 2)).toBeCloseTo(2.2);
    encounter.hit(shield.id, false, 400, true);
    expect(shield.armorHealth).toBe(0);
    expect(zombieMoveSpeed(shield, 2)).toBeCloseTo(2.2);
    const berserker = actor('berserker'); encounter.zombies = [berserker];
    expect(encounter.hit(1, false, 399)?.enraged).toBeUndefined();
    expect(encounter.hit(1, false, 1)?.enraged).toBe(true);
    expect(berserker.ragePause).toBe(ENEMY_RULES.berserker.ragePause);
    expect(zombieMoveSpeed(berserker, 2)).toBe(0);
    berserker.ragePause = 0;
    expect(zombieMoveSpeed(berserker, 2)).toBe(4);
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

  it('巨人始终保持0.75x移速，橄榄球常速为1.5x且破甲后为1.25x', () => {
    const giant = actor('giant');
    expect(zombieMoveSpeed(giant, 2)).toBe(1.5);
    giant.health = 100; giant.bodyHealth = 100;
    expect(zombieMoveSpeed(giant, 2)).toBe(1.5);
    const football = actor('football');
    expect(zombieMoveSpeed(football, 2)).toBe(3);
    football.armorHealth = 0;
    expect(zombieMoveSpeed(football, 2)).toBe(2.5);
  });
});

describe('橄榄球冲锋和河道', () => {
  it('朝河道冲锋时停在水外并眩晕1.5秒，随后改走桥梁', () => {
    const navigation = new Navigation([], true), encounter = new Encounter(() => 0);
    encounter.reset('survival', 'hard'); encounter.setNavigation(navigation);
    encounter.player = { x: 0, z: riverCenter(0) - 7 };
    const football = actor('football', 0, riverCenter(0) + 7);
    encounter.zombies = [football]; encounter.waveQueue = []; encounter.waveSpawned = encounter.pressure.count;
    for (let i = 0; i < 80 && football.specialState !== 'stunned'; i++) encounter.update(.05, () => null);
    expect(football.specialState).toBe('stunned');
    expect(football.specialRemaining).toBeGreaterThan(1.4);
    expect(football.chargeAvoidRiver).toBe(true);
    expect(isWater(football)).toBe(false);
    const stopped = { x: football.x, z: football.z };
    encounter.update(1, () => null);
    expect(football.x).toBeCloseTo(stopped.x); expect(football.z).toBeCloseTo(stopped.z);
    encounter.update(.6, () => null);
    expect(football.specialState).toBe('ready');
    encounter.update(.2, () => null);
    expect(football.specialState).toBe('ready');
  });

  it('第十波橄榄球完成蓄力和冲锋，命中只造成一次10点伤害', () => {
    const encounter = new Encounter(() => 0); encounter.reset('survival', 'hard'); encounter.setNavigation(new Navigation([]));
    encounter.wave = 10; encounter.waveSpawned = waveSettings(10).count; encounter.waveQueue = [];
    encounter.player = { x: 0, z: 0 };
    const football = actor('football', 0, -8); encounter.zombies = [football];
    for (let i = 0; i < 80 && encounter.health === 100; i++) encounter.update(.05, () => null);
    expect(encounter.health).toBe(90);
    expect(football.specialState).toBe('ready');
    expect(football.specialCooldown).toBeGreaterThan(4);
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
