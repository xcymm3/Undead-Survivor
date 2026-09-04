import { describe, expect, it, vi } from 'vitest';
import { Navigation, NAV_RADIUS } from '../../src/game/navigation';
import { CrowdMovement } from '../../src/game/movement';
import { type Zombie } from '../../src/game/encounter';
import { BreachSequence } from '../../src/game/breach';
import { PerspectiveCamera, Scene } from 'three';
import { createWorld } from '../../src/game/world';
import { SPAWN_ZONES } from '../../src/game/spawn';
import { SURVIVAL } from '../../src/game/config';

const obstacles = [
  { id: 'barrier', minX: -2, maxX: 2, minZ: -16, maxZ: -12 },
  { id: 'building', minX: -13, maxX: -7, minZ: -32, maxZ: -23 },
  { id: 'fence', minX: 8, maxX: 8.1, minZ: -35, maxZ: -8 },
];
const navigation = new Navigation(obstacles);
const zombie = (id: number, x: number, z: number): Zombie => ({ id, x, z, kind: 'normal', health: 100, armorHealth: 0, maxHealth: 100, downTime: 0, bornAt: 0 });

describe('静态障碍寻路与连续碰撞', () => {
  it('身体半径参与判定，长线段也不能穿过薄围栏', () => {
    expect(navigation.clear({ x: -10, z: -10 }, { x: 15, z: -10 })).toBe(false);
    expect(navigation.clear({ x: 2 + NAV_RADIUS - 0.01, z: -14 }, { x: 2 + NAV_RADIUS - 0.01, z: -14 })).toBe(false);
    expect(navigation.clear({ x: 0, z: -10 }, { x: 0, z: 9 })).toBe(true);
  });
  it('出生在实体内会选附近可达位置，完全封闭区域不接受原点', () => {
    const spawn = navigation.spawn({ x: -10, z: -27, spawnZone: 'yard' });
    expect(spawn).not.toBeNull(); expect(spawn!.spawnZone).toBe('yard');
    expect(navigation.clear(spawn!, spawn!)).toBe(true);
    expect(navigation.spawn({ x: 0, z: 9 })).toBeNull();
  });
  it('遇到路障、建筑、围栏绕行，整个身体和拥挤避让均不穿模且最终可达', () => {
    for (const start of [{ x: 0, z: -25 }, { x: -10, z: -38 }, { x: 12, z: -30 }]) {
      const crowd = [zombie(0, start.x, start.z), zombie(1, start.x, start.z)];
      const movement = new CrowdMovement(navigation);
      let failed = false, deviated = false;
      for (let i = 0; i < 2500 && !failed; i++) {
        const before = crowd.map(z => ({ ...z }));
        movement.advance(crowd, 0.05, 2); failed = crowd.some(z => Math.hypot(z.x, z.z - 9) <= SURVIVAL.contactRadius + 1e-6);
        for (let j = 0; j < crowd.length; j++) {
          const z = crowd[j];
          expect(navigation.clear(before[j], z)).toBe(true);
          if (Math.hypot(z.x - before[j].x, z.z - before[j].z) > 1e-8) expect(z.heading).toBeCloseTo(Math.atan2(z.x - before[j].x, z.z - before[j].z), 8);
          if (Math.abs(z.x - start.x) > 2) deviated = true;
        }
      }
      expect(failed).toBe(true); expect(deviated).toBe(true);
      expect(Math.min(...crowd.map(z => Math.hypot(z.x, z.z - 9)))).toBeCloseTo(SURVIVAL.contactRadius, 7);
    }
  });
  it('无障碍时仍走玩家方向的直线，高速绕障不跨越实体', () => {
    const z = zombie(0, 0, -7), movement = new CrowdMovement(navigation);
    movement.advance([z], 0.1, 2); expect(z.x).toBe(0); expect(z.z).toBeCloseTo(-6.8);
    const fast = zombie(1, 0, -25), before = { ...fast };
    movement.advance([fast], 1, 100); expect(navigation.clear(before, fast)).toBe(true);
  });
});

it('实际场景六个入口可通行，并能绕障追到移动后的玩家', () => {
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }) }) });
  try {
    const world = createWorld(new Scene()), nav = new Navigation(world.obstacles);
    for (const goal of [{ x: 0, z: 9 }, { x: -19, z: -15 }, { x: 18, z: -40 }]) {
      for (const zone of SPAWN_ZONES) {
        const z = zombie(0, zone.center.x, zone.center.z), movement = new CrowdMovement(nav);
        expect(nav.clear(z, z), zone.id).toBe(true);
        for (let j = 0; j < 2000 && Math.hypot(z.x - goal.x, z.z - goal.z) > SURVIVAL.contactRadius + 1e-6; j++) {
          const before = { ...z }; movement.advance([z], 0.05, 4, goal);
          expect(nav.clear(before, z)).toBe(true);
        }
        expect(Math.hypot(z.x - goal.x, z.z - goal.z), zone.id).toBeCloseTo(SURVIVAL.contactRadius, 5);
      }
    }
  } finally { vi.unstubAllGlobals(); }
}, 20000);

it('失败镜头在两秒结束、零时间不推进，镜头聚焦但不改变敌人状态', () => {
  const camera = new PerspectiveCamera(61, 1.6, 0.025, 220); camera.position.set(0, 4.8, 9);
  const z = zombie(7, 4, 9 - Math.sqrt(48)), before = { ...z }, sequence = new BreachSequence();
  sequence.begin(camera, z); expect(sequence.update(camera, 0.7)).toBe(false);
  expect(camera.position.z).toBeLessThan(9); expect(camera.fov).toBeLessThan(61);
  sequence.update(camera, 0); expect(sequence.elapsed).toBe(0.7);
  expect(sequence.update(camera, 1.29)).toBe(false); expect(sequence.update(camera, 0.01)).toBe(true);
  expect(sequence.elapsed).toBe(2); expect(z).toEqual(before);
  sequence.reset(); expect(sequence.progress).toBe(0); expect(sequence.light.intensity).toBe(0);
});
