import { expect, it } from 'vitest';
import { ARENA, PLAYER } from '../../src/game/config';
import { Navigation } from '../../src/game/navigation';
import { movePlayer } from '../../src/game/player';

it('WASD 相对朝向移动，斜向速度与正向一致', () => {
  const nav = new Navigation([]), straight = { x: 0, z: 0 }, diagonal = { x: 0, z: 0 }, east = { x: 0, z: 0 };
  movePlayer(straight, 0, new Set(['KeyW']), 1, nav, []);
  movePlayer(diagonal, 0, new Set(['KeyW', 'KeyD']), 1, nav, []);
  movePlayer(east, -Math.PI / 2, new Set(['KeyW']), 1, nav, []);
  expect(straight.z).toBeCloseTo(-PLAYER.speed);
  expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(PLAYER.speed);
  expect(east.x).toBeCloseTo(PLAYER.speed);
  expect(east.z).toBeCloseTo(0);
});
it('实体不可穿越、可沿障碍滑动，四边限制在场内', () => {
  const nav = new Navigation([{ id: 'wall', minX: -2, maxX: 2, minZ: -6, maxZ: -5 }]);
  const p = { x: 0, z: 0 };
  movePlayer(p, 0, new Set(['KeyW']), 2, nav, []);
  expect(p.z).toBeGreaterThanOrEqual(-5 + PLAYER.radius);
  movePlayer(p, 0, new Set(['KeyW', 'KeyD']), 0.5, nav, []);
  expect(p.x).toBeGreaterThan(1);
  for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
    const point = { x: 10, z: 0 };
    movePlayer(point, 0, new Set([key]), 30, nav, []);
    expect(point.x).toBeGreaterThanOrEqual(ARENA.minX + PLAYER.radius);
    expect(point.x).toBeLessThanOrEqual(ARENA.maxX - PLAYER.radius);
    expect(point.z).toBeGreaterThanOrEqual(ARENA.minZ + PLAYER.radius);
    expect(point.z).toBeLessThanOrEqual(ARENA.maxZ - PLAYER.radius);
  }
});
it('活僵尸阻挡穿身但允许后退，尸体不阻挡移动', () => {
  const nav = new Navigation([]), p = { x: 0, z: 0 };
  const zombie = { id: 0, x: 0, z: -2, kind: 'normal' as const, health: 100, maxHealth: 100, armorHealth: 0, downTime: 0, bornAt: 0 };
  movePlayer(p, 0, new Set(['KeyW']), 1, nav, [zombie]);
  expect(p.z).toBeGreaterThanOrEqual(-0.75);
  movePlayer(p, 0, new Set(['KeyS']), 0.5, nav, [zombie]);
  expect(p.z).toBeGreaterThan(1);
  zombie.health = 0;
  movePlayer(p, 0, new Set(['KeyW']), 1, nav, [zombie]);
  expect(p.z).toBeLessThan(-2);
});
