import { describe, expect, it } from 'vitest';
import { resolveWeaponHits } from '../../src/game/ballistics';

describe('武器射线命中顺序', () => {
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
