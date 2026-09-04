import { describe, expect, it } from 'vitest';
import { ATTACK, DIFFICULTIES, SURVIVAL } from '../../src/game/config';
import type { Difficulty } from '../../src/game/config';
import { Encounter, pressureAt, spawnIntegral } from '../../src/game/encounter';
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

  it('三档难度共享刷新曲线和固定移速', () => {
    for (const time of [0, 30, 60, 120, 1000]) {
      expect(pressureAt('easy', time)).toEqual(pressureAt('normal', time));
      expect(pressureAt('normal', time)).toEqual(pressureAt('hard', time));
    }
    expect(pressureAt('easy', 0)).toEqual({ spawnRate: 0.65, speed: 1.4 });
    expect(pressureAt('hard', 60)).toEqual({ spawnRate: 2.75, speed: 1.4 });
  });

  for (const difficulty of Object.keys(DIFFICULTIES) as Difficulty[]) {
    it(`${difficulty} 刷新逐渐增多并封顶每秒 10 只，移速始终为 1.4 米每秒`, () => {
      expect(pressureAt(difficulty, 60).spawnRate).toBeGreaterThan(pressureAt(difficulty, 0).spawnRate);
      expect(pressureAt(difficulty, 1000).spawnRate).toBe(10);
      for (const time of [0, 60, 180, 1000, 2000]) expect(pressureAt(difficulty, time).speed).toBe(1.4);
      for (const start of [0, 50, 100, 150, 260, 480, 1000]) expect(spawnIntegral(difficulty, start, start + 1)).toBeLessThanOrEqual(10 + 1e-9);
      const encounter = new Encounter();
      encounter.reset('survival', difficulty);
      encounter.elapsed = 1000;
      for (let i = 0; i < 60; i++) encounter.update(1 / 60, farSpawn);
      expect(encounter.totalSpawned).toBe(10);
      encounter.update(1, farSpawn);
      expect(encounter.totalSpawned).toBe(20);
    });
  }

  it('帧率变化不改变刷新总数', () => {
    const counts = [20, 60, 144].map(fps => {
      const encounter = new Encounter(); encounter.reset('survival', 'normal');
      for (let frame = 0; frame < fps * 30; frame++) encounter.update(1 / fps, farSpawn);
      return encounter.totalSpawned;
    });
    expect(new Set(counts).size).toBe(1);
    expect(counts[0]).toBe(Math.floor(spawnIntegral('normal', 0, 30)));
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

  it('存活与倒地实例数量始终有内存边界', () => {
    const encounter = new Encounter(); encounter.reset('survival', 'hard'); encounter.elapsed = 1000;
    encounter.update(40, () => ({ x: 10000, z: -10000 }));
    expect(encounter.zombies.length).toBe(SURVIVAL.maxZombies);
  });
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
