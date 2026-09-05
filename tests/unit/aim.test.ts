import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { MIN_WEAPON_CONVERGENCE, visualWeaponTarget, weaponQuaternion } from '../../src/game/aim';
import { filterPointerMovement, turnView } from '../../src/game/player';
import { CONFIG } from '../../src/game/config';
describe('自由视角与枪口瞄准', () => {
  it('水平累积转向超过一圈，俯仰限制防止翻转', () => {
    let view = { yaw: 0, pitch: 0 };
    for (let i = 0; i < 100; i++) view = turnView(view.yaw, view.pitch, 100, -100);
    expect(view.yaw).toBeLessThan(-Math.PI * 2);
    expect(view.pitch).toBe(CONFIG.camera.pitchLimit);
    expect(turnView(0, 0, 0, 1e6).pitch).toBe(-CONFIG.camera.pitchLimit);
  });
  it('鼠标移动总量一致时转向不依赖事件频率', () => {
    let view = { yaw: 0, pitch: 0 };
    for (let i = 0; i < 10; i++) view = turnView(view.yaw, view.pitch, 10, 2);
    expect(view.yaw).toBeCloseTo(turnView(0, 0, 100, 20).yaw, 10);
    expect(view.pitch).toBeCloseTo(turnView(0, 0, 100, 20).pitch, 10);
  });
  it('从左右上下角瞄准时，枪管和枪口射线穿过同一个目标', () => {
    const origin = new Vector3(0.46, -0.43, -0.62);
    for (const x of [-20, 0, 20]) for (const y of [-15, 0, 15]) {
      const target = new Vector3(x, y, -30);
      const direction = new Vector3(0, 0, -1).applyQuaternion(weaponQuaternion(origin, target));
      const muzzle = origin.clone().addScaledVector(direction, 1.49);
      const expected = target.clone().sub(muzzle).normalize();
      expect(direction.dot(expected)).toBeCloseTo(1, 12);
    }
  });
  it('低头旋转时忽略 Pointer Lock 产生的整屏回绕位移', () => {
    const normal = filterPointerMovement(-3, 2, 1440, 900);
    expect(normal).toEqual({ dx: -3, dy: 2 });
    expect(filterPointerMovement(1440, -900, 1440, 900)).toEqual({ dx: 0, dy: 0 });
    expect(filterPointerMovement(1428, 0, 3840, 2160)).toEqual({ dx: 0, dy: 0 });
    const before = turnView(0.4, -CONFIG.camera.pitchLimit, normal.dx, normal.dy);
    const wrapped = filterPointerMovement(1428, 0, 1440, 900);
    expect(turnView(before.yaw, before.pitch, wrapped.dx, wrapped.dy)).toEqual(before);
  });
  it('近处地面命中不会让第一人称枪模突然向相机收敛', () => {
    const near = new Vector3(0, 0, -1.7);
    const visual = visualWeaponTarget(near);
    expect(visual.length()).toBeCloseTo(MIN_WEAPON_CONVERGENCE, 10);
    expect(visual.clone().normalize().dot(near.clone().normalize())).toBeCloseTo(1, 12);
    const far = new Vector3(0, 0, -20);
    expect(visualWeaponTarget(far)).toBe(far);
  });
});
