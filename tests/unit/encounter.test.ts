import { describe, expect, it } from 'vitest';
import { ATTACK, WAVES, SURVIVAL } from '../../src/game/config';
import { Encounter, waveSettings } from '../../src/game/encounter';
import { PerspectiveCamera, Vector3 } from 'three';
import { SPAWN_ZONES, SpawnDirector } from '../../src/game/spawn';
import { seededRandom } from '../../src/game/geometry';

const farSpawn = () => ({ x: 80, z: -100 });
describe('练习与正式模式', () => {
  it('练习僵尸保持静止，不刷新、不失败、不累计正式时长', () => {
    const encounter = new Encounter();
    const positions = encounter.zombies.map(z => [z.x, z.z]);
    encounter.update(120, farSpawn);
    expect(encounter.zombies.map(z => [z.x, z.z])).toEqual(positions);
    expect(encounter.failed).toBe(false);
    expect(encounter.elapsed).toBe(0);
    expect(encounter.totalSpawned).toBe(0);
    encounter.hit(1, true);
    expect(encounter.zombies[1].health).toBe(0);
    encounter.update(3.1, farSpawn);
    expect(encounter.zombies[1].health).toBe(100);
  });

  it('波次数量分段增长，基础移速和刷新率封顶', () => {
    expect(waveSettings(1)).toEqual({ count: 9, speed: 1.4, spawnRate: 1 });
    expect(Array.from({ length: 15 }, (_, index) => waveSettings(index + 1).count))
      .toEqual([9, 15, 21, 27, 33, 39, 44, 49, 53, 57, 61, 64, 67, 70, 73]);
    expect(waveSettings(8)).toMatchObject({ count: 49 });
    expect(waveSettings(8).speed).toBeCloseTo(2.66);
    expect(waveSettings(8).spawnRate).toBeCloseTo(2.26);
    expect(waveSettings(9).speed).toBe(2.8);
    expect(waveSettings(11).spawnRate).toBeCloseTo(2.8);
    expect(waveSettings(100)).toEqual({ count: 328, speed: 2.8, spawnRate: 2.8 });
    const e = new Encounter(); e.reset('survival', 'hard');
    e.update(60, farSpawn); expect(e.waveSpawned).toBe(9); expect(e.totalSpawned).toBe(9);
    expect(e.wave).toBe(1); expect(e.wavesCleared).toBe(0);
  });
  it('清完全部配额才记一波，休整结束后进入下一波，暂停不推进', () => {
    const e = new Encounter(); e.reset('survival', 'hard');
    e.update(4, farSpawn);
    for (const z of e.zombies) e.hit(z.id, true, 1000);
    e.update(0.1, farSpawn); expect(e.wavesCleared).toBe(0);
    e.update(6, farSpawn);
    for (const z of e.zombies) if (z.health > 0) e.hit(z.id, true, 1000);
    e.update(0.05, farSpawn);
    expect(e.waveSpawned).toBe(9); expect(e.wavesCleared).toBe(1); expect(e.intermission).toBe(WAVES.rest);
    e.update(0, farSpawn); expect(e.intermission).toBe(WAVES.rest);
    e.update(WAVES.rest - .05, farSpawn); expect(e.wave).toBe(1);
    e.update(0.05, farSpawn); expect(e.wave).toBe(2); expect(e.waveSpawned).toBe(0);
    e.update(20, farSpawn); expect(e.waveSpawned).toBe(15); expect(e.totalSpawned).toBe(24);
    expect(e.pressure.speed).toBeCloseTo(WAVES.firstSpeed + WAVES.speedGrowth);
  });
  it('入口暂不可用不丢配额，恢复后不会突发补刷', () => {
    const e = new Encounter(); e.reset('survival', 'hard');
    e.update(30, () => null); expect(e.waveSpawned).toBe(0); expect(e.wave).toBe(1);
    e.update(0.05, farSpawn); expect(e.waveSpawned).toBe(1);
    e.update(15, farSpawn); expect(e.waveSpawned).toBe(9); expect(e.totalSpawned).toBe(9);
  });
  it('常见帧率下每波配额一致', () => {
    for (const fps of [20, 60, 144]) {
      const e = new Encounter(); e.reset('survival', 'hard');
      for (let frame = 0; frame < fps * 15; frame++) e.update(1 / fps, farSpawn);
      expect(e.waveSpawned).toBe(9);
    }
  });
  it('落水扣10血回出生点，血量耗尽才失败；练习同样处理', () => {
    for (const mode of ['practice', 'survival'] as const) {
      const e = new Encounter(); e.reset(mode, 'hard'); e.player = { x: 0, z: -17 }; e.playerHeight = 1;
      e.drown();
      expect(e.health).toBe(90); expect(e.failed).toBe(false); expect(e.failureCause).toBeNull();
      expect(e.player).toEqual({ x: SURVIVAL.playerX, z: SURVIVAL.playerZ }); expect(e.playerHeight).toBe(0);
      for (let i = 0; i < 9; i++) e.drown();
      expect(e.failureCause).toBe('water'); expect(e.health).toBe(0);
      e.update(100, farSpawn); expect(e.waveSpawned).toBe(0);
      e.reset(mode, 'hard'); expect(e.failed).toBe(false); expect(e.health).toBe(100);
    }
  });

  it('近身先挥臂，命中扣血，持续攻击至零血才失败，重开恢复满血', () => {
    const encounter = new Encounter(); encounter.reset('survival', 'hard');
    encounter.zombies.push({ id: 99, x: 0, z: 9 - SURVIVAL.contactRadius, kind: 'normal', health: 100, armorHealth: 0, maxHealth: 100, downTime: 0, bornAt: 0 });
    encounter.update(0.1, () => null);
    expect(encounter.zombies[0].attacking).toBe(true); expect(encounter.health).toBe(100);
    encounter.update(ATTACK.windup - 0.1, () => null);
    expect(encounter.health).toBe(90); expect(encounter.failed).toBe(false);
    encounter.update(20, () => null);
    expect(encounter.health).toBe(0); expect(encounter.failed).toBe(true); expect(encounter.breachedId).toBe(99);
    const end = encounter.elapsed; encounter.update(10, () => null); expect(encounter.elapsed).toBe(end);
    encounter.reset('survival', 'hard'); expect(encounter.health).toBe(100); expect(encounter.breachedId).toBeNull();
  });
  it('挥臂期间退开或击杀可以避免伤害，零时间暂停不推进攻击', () => {
    const encounter = new Encounter(); encounter.reset('survival', 'easy');
    encounter.zombies.push({ id: 99, x: 0, z: 9 - SURVIVAL.contactRadius, kind: 'normal', health: 100, armorHealth: 0, maxHealth: 100, downTime: 0, bornAt: 0 });
    encounter.update(0.2, () => null);
    const time = encounter.zombies[0].attackTime; encounter.update(0, () => null);
    expect(encounter.zombies[0].attackTime).toBe(time);
    encounter.player.x = 5; encounter.update(0.2, () => null);
    expect(encounter.health).toBe(100); expect(encounter.zombies[0].attacking).toBe(false);
    encounter.player = { x: encounter.zombies[0].x, z: encounter.zombies[0].z + SURVIVAL.contactRadius };
    encounter.update(0.2, () => null); encounter.hit(99, true); encounter.update(1, () => null);
    expect(encounter.health).toBe(100);
  });
  it('不同帧率下连续近身攻击的伤害一致', () => {
    const values = [20, 60, 144].map(fps => {
      const e = new Encounter(); e.reset('survival', 'easy');
      e.zombies.push({ id: 99, x: 0, z: 7.75, kind: 'normal', health: 100, armorHealth: 0, maxHealth: 100, downTime: 0, bornAt: 0 });
      for (let i = 0; i < fps * 4; i++) e.update(1 / fps, () => null);
      return e.health;
    });
    expect(values).toEqual([60, 60, 60]);
  });

  it('玩家受伤后获得0.3秒保护且清波时恢复满血', () => {
    const encounter = new Encounter(); encounter.reset('survival', 'easy');
    encounter.waveQueue = []; encounter.waveSpawned = encounter.pressure.count;
    encounter.zombies = [
      { id: 98, x: 0, z: 7.75, kind: 'normal', health: 100, armorHealth: 0, maxHealth: 100, downTime: 0, bornAt: 0 },
      { id: 99, x: .1, z: 7.75, kind: 'normal', health: 100, armorHealth: 0, maxHealth: 100, downTime: 0, bornAt: 0 },
    ];
    encounter.update(ATTACK.windup, () => null);
    expect(encounter.health).toBe(90);
    expect(encounter.lastDamageAt).toBeCloseTo(ATTACK.windup);
    encounter.update(ATTACK.damageProtection - .01, () => null);
    expect(encounter.health).toBe(90);
    for (const zombie of encounter.zombies) encounter.hit(zombie.id, true, 1000);
    encounter.update(.9, () => null);
    expect(encounter).toMatchObject({ health: 100, wavesCleared: 1 });
    expect(encounter.intermission).toBeGreaterThan(WAVES.rest - 1);
  });

  it('击杀的僵尸不会造成失败，尸体被回收，重开清空全部状态', () => {
    const encounter = new Encounter(); encounter.reset('survival', 'hard');
    encounter.zombies.push({ id: 99, x: 0, z: 0, kind: 'normal', health: 100, armorHealth: 0, maxHealth: 100, downTime: 0, bornAt: 0 });
    expect(encounter.hit(99, false)?.killed).toBe(false);
    expect(encounter.hit(99, false)?.killed).toBe(true);
    expect(encounter.hit(99, true)).toBeNull();
    encounter.update(0.9, farSpawn);
    expect(encounter.zombies.some(z => z.id === 99)).toBe(false);
    expect(encounter.failed).toBe(false);
    expect(encounter.kills).toBe(1);
    encounter.reset('survival', 'easy');
    expect(encounter.zombies).toHaveLength(0);
    expect(encounter.elapsed).toBe(0);
    expect(encounter.kills).toBe(0);
    expect(encounter.totalSpawned).toBe(0);
  });

  it('存活与倒地实例受总容量约束，仅橄榄球保留单类上限', () => {
    const encounter = new Encounter(); encounter.reset('survival', 'hard'); encounter.wave = 100;
    encounter.update(40, () => ({ x: 10000, z: -10000 }));
    expect(encounter.zombies.length).toBeLessThanOrEqual(SURVIVAL.maxZombies);
    expect(encounter.zombies.length).toBeGreaterThanOrEqual(79);
    expect(encounter.zombieCounts.football).toBeLessThanOrEqual(3);
  }, 15000);
});

// 防止实例化后的命中测试退化为只有旧靶子能命中。
import { ZombieField } from '../../src/game/zombies';
import { Raycaster } from 'three';
describe('僵尸批量模型', () => {
  it('固定六个入口只在北、东两侧，依次使用符合朝向的入口', () => {
    const director = new SpawnDirector(seededRandom(42));
    const spawns = Array.from({ length: 6 }, () => director.next({ x: 0, z: 9 }, 0)!);
    expect(new Set(spawns.map(s => s.spawnZone))).toEqual(new Set(SPAWN_ZONES.map(z => z.id)));
    for (const s of spawns) expect(s.z === -45 || s.x === 19).toBe(true);
  });
  it('任意朝向与位置均不在背后或八米内刷新，无可用点返回空', () => {
    const director = new SpawnDirector(seededRandom(7));
    for (const player of [{ x: 0, z: 9 }, { x: 19, z: -4 }, { x: -10, z: -40 }]) {
      for (let yaw = -Math.PI * 2; yaw <= Math.PI * 2; yaw += 0.2) {
        const spawn = director.next(player, yaw); if (!spawn) continue;
        const dx = spawn.x - player.x, dz = spawn.z - player.z;
        expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(8);
        expect(-dx * Math.sin(yaw) - dz * Math.cos(yaw)).toBeGreaterThanOrEqual(0);
      }
    }
    expect(director.next({ x: 0, z: 9 }, Math.PI)).toBeNull();
    expect(director.next({ x: 0, z: 9 }, 0, () => false)).toBeNull();
  });
  it('一份实例模型渲染多只僵尸，并正确区分头部、身体和空白', () => {
    const field = new ZombieField();
    const encounter = new Encounter(); field.sync(encounter);
    const zombie = encounter.zombies[1];
    const ray = new Raycaster(new Vector3(zombie.x, 1.83, 10), new Vector3(0, 0, -1));
    expect(field.decode(ray.intersectObject(field)[0])).toEqual({ id: 1, head: true });
    ray.ray.origin.y = 1.15;
    expect(field.decode(ray.intersectObject(field)[0])).toEqual({ id: 1, head: false });
    ray.ray.origin.x = 40;
    expect(ray.intersectObject(field)).toHaveLength(0);
    encounter.hit(1, true); field.sync(encounter);
    ray.ray.origin.set(zombie.x, 1.83, 10);
    expect(field.decode(ray.intersectObject(field)[0])).toBeNull();
    field.dispose();
  });

  it('头部投影仍在原来的练习靶瞄准区域', () => {
    const camera = new PerspectiveCamera(61, 1440 / 900, 0.025, 220);
    camera.position.set(0, 4.8, 9); camera.rotation.x = -0.105; camera.updateMatrixWorld();
    const head = new Vector3(0.15, 1.83, -16.76).project(camera);
    expect(Math.abs(head.x)).toBeLessThan(0.1);
    expect(Math.abs(head.y)).toBeLessThan(0.1);
  });
});
