import { expect, it } from 'vitest';
import { Navigation } from '../../src/game/navigation';
import { BRIDGES, RIVER, inRiver, isWater, onBridge, riverCenter } from '../../src/game/terrain';
import { PlayerMotion } from '../../src/game/player';
import { CrowdMovement } from '../../src/game/movement';
import type { Zombie } from '../../src/game/encounter';

const nav = new Navigation([], true);
const forward = new Set(['KeyW']);
it('河道连续贯穿场地，只在两座桥下开放通行', () => {
  expect(BRIDGES).toHaveLength(2);
  for (let x = -21; x <= 21; x += 0.1) {
    const p = { x, z: riverCenter(x) };
    expect(inRiver(p)).toBe(true);
    expect(isWater(p)).toBe(!onBridge(p));
  }
  expect(nav.clear({ x: 0, z: -22 }, { x: 0, z: -12 })).toBe(false);
  for (const b of BRIDGES) expect(nav.clear({ x: b.x, z: b.z - 5 }, { x: b.x, z: b.z + 5 })).toBe(true);
});
it('助跑跳过河流正常落岸，各帧率下轨迹一致且不能二段跳', () => {
  for (const fps of [20, 60, 144]) {
    const p = { x: 0, z: riverCenter(0) + RIVER.halfWidth + 0.35 }, motion = new PlayerMotion();
    motion.jump(); let peak = 0;
    for (let frame = 0; frame < fps; frame++) {
      if (frame === Math.floor(fps / 3)) motion.jump();
      expect(motion.update(p, 0, forward, 1 / fps, nav, [])).toBe(false);
      peak = Math.max(peak, motion.height);
    }
    expect(p.z).toBeCloseTo(-19.6, 6);
    expect(motion.grounded).toBe(true); expect(motion.height).toBe(0);
    expect(peak).toBeGreaterThan(1.9); expect(peak).toBeLessThanOrEqual(1.961);
  }
});
it('步行入水与落在水面判负，水中不能补跳自救，桥面可以步行', () => {
  const p = { x: 0, z: riverCenter(0) + RIVER.halfWidth + 0.1 };
  expect(new PlayerMotion().update(p, 0, forward, 0.1, nav, [])).toBe(true);
  const wet = new PlayerMotion(); wet.jump();
  expect(wet.update({ x: 0, z: riverCenter(0) }, 0, forward, 0.1, nav, [])).toBe(true);
  const short = new PlayerMotion(), landing = { x: 0, z: riverCenter(0) + RIVER.halfWidth + 0.1 };
  short.jump(); expect(short.update(landing, 0, forward, 0.35, nav, [])).toBe(false);
  expect(short.update(landing, 0, new Set(), 0.7, nav, [])).toBe(true);
  for (const b of BRIDGES) {
    const walker = { x: b.x, z: b.z + 4.5 };
    expect(new PlayerMotion().update(walker, 0, forward, 2.2, nav, [])).toBe(false);
    expect(walker.z).toBeLessThan(b.z - 4);
  }
});
it('暂停冻结空中轨迹，恢复后正常落地', () => {
  const motion = new PlayerMotion(), p = { x: 0, z: 5 };
  motion.jump(); motion.update(p, 0, forward, 0.2, nav, []);
  const before = { y: motion.height, v: motion.velocity, ...p };
  motion.clearInput(); motion.update(p, 0, forward, 0, nav, []);
  expect({ y: motion.height, v: motion.velocity, ...p }).toEqual(before);
  motion.update(p, 0, new Set(), 1, nav, []); expect(motion.grounded).toBe(true);
});
it('僵尸从两岸分别绕行对应桥梁，不穿水、不跳跃，玩家在河上方时仍有路径', () => {
  for (const b of BRIDGES) for (const side of [-1, 1]) {
    const goal = { x: b.x, z: b.z + side * 8 };
    const z: Zombie = { id: 1, x: b.x + 5, z: b.z - side * 8, kind: 'normal', health: 100, maxHealth: 100, armorHealth: 0, bornAt: 0, downTime: 0 };
    const movement = new CrowdMovement(nav); let crossed = false;
    for (let frame = 0; frame < 1000 && Math.hypot(z.x - goal.x, z.z - goal.z) > 1.251; frame++) {
      movement.advance([z], 0.05, 3, goal);
      expect(isWater(z)).toBe(false);
      if (inRiver(z)) { expect(onBridge(z)).toBe(true); crossed = true; }
    }
    expect(crossed).toBe(true); expect(Math.hypot(z.x - goal.x, z.z - goal.z)).toBeCloseTo(1.25, 5);
  }
  nav.setGoal({ x: 0, z: riverCenter(0) });
  expect(nav.waypoint({ x: 0, z: -25 })).not.toBeNull();
});
