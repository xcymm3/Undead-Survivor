import { describe, expect, it } from 'vitest';
import { pelletOffset, resolveWeaponHits } from '../../src/game/ballistics';
import { WEAPONS } from '../../src/game/weapons';

describe('武器射线命中顺序', () => {
  it('重机枪连续射击有可复现的散布，精准步枪仍沿准星发射', () => {
    const hmg = WEAPONS.find(weapon => weapon.id === 'heavy-machine-gun')!;
    const offsets = Array.from({ length: 8 }, (_, shot) => pelletOffset(hmg, 0, shot));
    expect(new Set(offsets.map(offset => `${offset.x},${offset.y}`)).size).toBe(8);
    offsets.forEach((offset, shot) => {
      expect(offset).toEqual(pelletOffset(hmg, 0, shot));
      expect(Math.hypot(offset.x, offset.y)).toBeGreaterThan(0);
      expect(Math.hypot(offset.x, offset.y)).toBeLessThanOrEqual(hmg.spread);
      expect(pelletOffset(WEAPONS[0], 0, shot)).toEqual({ x: 0, y: 0 });
    });
  });

  const zombie = (distance: number, id: number) => ({ distance, kind: 'zombie', id });
  const wall = (distance: number) => ({ distance, kind: 'wall', id: -1 });
  const isZombie = (hit: ReturnType<typeof zombie>) => hit.kind === 'zombie';

  it('普通武器只命中最前方物体', () => {
    const hits = [zombie(2, 1), zombie(4, 2), wall(6)];
    const result = resolveWeaponHits(hits, isZombie, false);
    expect(result.targets.map(hit => hit.id)).toEqual([1]);
    expect(result.impact?.id).toBe(1);
  });

  it('喷火枪穿过多个僵尸，并在场景遮挡处停止', () => {
    const hits = [zombie(2, 1), zombie(4, 2), wall(6), zombie(8, 3)];
    const result = resolveWeaponHits(hits, isZombie, true);
    expect(result.targets.map(hit => hit.id)).toEqual([1, 2]);
    expect(result.impact?.kind).toBe('wall');
  });
});
