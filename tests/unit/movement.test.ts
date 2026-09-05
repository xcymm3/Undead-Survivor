import { describe, expect, it } from 'vitest';
import { Matrix4, Raycaster, Vector3 } from 'three';
import { CROWD, SURVIVAL } from '../../src/game/config';
import { Encounter } from '../../src/game/encounter';
import type { Zombie } from '../../src/game/encounter';
import { CrowdMovement } from '../../src/game/movement';
import { ZombieField } from '../../src/game/zombies';
const zombie = (id: number, x: number, z: number): Zombie => ({ id, x, z, kind: 'normal', health: 100, armorHealth: 0, maxHealth: 100, downTime: 0, bornAt: 0 });
describe('移动目标追击与拥挤避让', () => {
  it('高速接近在身体接触处停止，每只僵尸独立移动', () => {
    const a = zombie(0, 0, 7), b = zombie(1, 10, -10);
    new CrowdMovement().advance([a, b], 1, 8);
    expect(Math.hypot(a.x, a.z - 9)).toBeCloseTo(SURVIVAL.contactRadius, 8);
    expect(Math.hypot(b.x - 10, b.z + 10)).toBeCloseTo(8, 8);
  });
  it('玩家换位后追击方向立即改变，接触不冻结整个尸群', () => {
    const z = zombie(0, 0, -5), movement = new CrowdMovement();
    movement.advance([z], 1, 1.4, { x: 0, z: 9 });
    expect(z.z).toBeCloseTo(-3.6);
    const before = { ...z };
    movement.advance([z], 1, 1.4, { x: 10, z: -10 });
    expect(z.x).toBeGreaterThan(before.x); expect(z.z).toBeLessThan(before.z);
  });
  it('扑击伸出的手臂仍参与枪口射线命中', () => {
    const encounter = new Encounter(); encounter.reset('survival', 'easy');
    encounter.zombies = [{ ...zombie(0, 0, 0), attacking: true, attackTime: 0.35 }];
    const field = new ZombieField(); field.sync(encounter);
    const ray = new Raycaster(new Vector3(-5, 1.1, 1.2), new Vector3(1, 0, 0));
    expect(field.decode(ray.intersectObject(field)[0])).toEqual({ id: 0, head: false });
    field.dispose();
  });
  it('密集队列缓慢分开，每步总速度及横向速度受限，始终向目标推进', () => {
    const crowd = [zombie(0, 0, -6), zombie(1, 0, -6)];
    const movement = new CrowdMovement();
    for (let i = 0; i < 120; i++) {
      const before = crowd.map(z => ({ x: z.x, z: z.z }));
      movement.advance(crowd, 1 / 60, 1.5);
      crowd.forEach((z, index) => {
        const p = before[index], dx = z.x - p.x, dz = z.z - p.z;
        const gx = -p.x, gz = 9 - p.z, length = Math.hypot(gx, gz);
        expect(Math.hypot(dx, dz)).toBeCloseTo(1.5 / 60, 10);
        expect(Math.abs(dx * gz / length - dz * gx / length)).toBeLessThanOrEqual(CROWD.maxLateralSpeed / 60 + 1e-9);
        expect(dx * gx + dz * gz).toBeGreaterThan(0);
        expect(Math.abs(z.avoidance!)).toBeLessThanOrEqual(1);
      });
    }
    expect(Math.abs(crowd[0].x - crowd[1].x)).toBeGreaterThan(0.35);
  });

  it('仅活僵尸产生避让，孤立僵尸不摇摆，更新顺序不决定推挤方向', () => {
    const first = [zombie(0, -0.1, -7), zombie(1, 0.1, -7), zombie(2, 0, -7.3)];
    const second = structuredClone(first).reverse();
    const a = new CrowdMovement(), b = new CrowdMovement();
    for (let i = 0; i < 30; i++) { a.advance(first, 1 / 60, 1.5); b.advance(second, 1 / 60, 1.5); }
    first.forEach(z => {
      const other = second.find(other => other.id === z.id)!;
      expect(z.x).toBeCloseTo(other.x, 10); expect(z.z).toBeCloseTo(other.z, 10);
    });
    const isolated = zombie(0, 0, -7), corpse = { ...zombie(1, 0, -7), health: 0 };
    a.advance([isolated, corpse], 1, 1.5);
    expect(isolated.x).toBe(0); expect(isolated.avoidance).toBe(0);
    expect(corpse.z).toBe(-7);
  });

  it('离开拥挤范围后立刻恢复直线，不保留横向漂移', () => {
    const a = zombie(0, -0.1, -10), b = zombie(1, 0.1, -10), movement = new CrowdMovement();
    movement.advance([a, b], 0.5, 1.5);
    expect(Math.abs(a.avoidance!)).toBeGreaterThan(0);
    const before = { x: a.x, z: a.z };
    b.health = 0;
    movement.advance([a, b], 0.1, 1.5);
    expect(a.avoidance).toBe(0);
    expect((a.x - before.x) * (9 - before.z) + (a.z - before.z) * before.x).toBeCloseTo(0, 10);
  });

  it('实例模型正面始终对齐实际移动方向，拥挤时也不横着滑行', () => {
    const encounter = new Encounter(); encounter.reset('survival', 'hard');
    encounter.zombies = [zombie(0, -5, -15), zombie(1, -5.1, -15)];
    const field = new ZombieField(), matrix = new Matrix4();
    const before = { ...encounter.zombies[0] };
    new CrowdMovement().advance(encounter.zombies, 0.1, 1.5);
    field.sync(encounter);
    field.getMatrixAt(0, matrix);
    const forward = new Vector3(0, 0, 1).transformDirection(matrix);
    forward.y = 0; forward.normalize();
    const current = encounter.zombies[0];
    const displacement = new Vector3(current.x - before.x, 0, current.z - before.z).normalize();
    expect(forward.dot(displacement)).toBeCloseTo(1, 7);
    field.dispose();
  });

});
