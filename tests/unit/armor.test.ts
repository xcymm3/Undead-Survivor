import { describe, expect, it } from 'vitest';
import { Raycaster, Vector3 } from 'three';
import { ZOMBIE_TYPES } from '../../src/game/config';
import type { Difficulty, ZombieKind } from '../../src/game/config';
import { Encounter } from '../../src/game/encounter';
import { ZombieField } from '../../src/game/zombies';

const farSpawn = () => ({ x: 0, z: -10000 });
describe('护甲僵尸规则', () => {
  for (const difficulty of ['easy', 'normal', 'hard'] as Difficulty[]) {
    it(`${difficulty} 的第一波只使用允许的一阶怪物池`, () => {
      const values = [.1, .1, .1, .7, .1, .95]; let index = 0;
      const encounter = new Encounter(() => values[index++ % values.length]); encounter.reset('survival', difficulty);
      encounter.update(15, farSpawn);
      const kinds = encounter.zombies.map(z => z.kind);
      expect(kinds).toHaveLength(9);
      if (difficulty === 'easy') expect(new Set(kinds)).toEqual(new Set(['normal']));
      else expect(kinds.every(kind => ['normal', 'cone', 'bucket'].includes(kind))).toBe(true);
    });
  }

  for (const kind of ['normal', 'cone', 'bucket'] as ZombieKind[]) {
    it(`${kind} 的头部、护具和身体射线命中使用实际生命值`, () => {
      const encounter = new Encounter();
      const field = new ZombieField();
      try {
        for (const [height, damage] of [[1.83, 100], [1.18, 50], ...(kind === 'normal' ? [] : [[kind === 'cone' ? 2.54 : 2.21, 100]])]) {
          const health = ZOMBIE_TYPES[kind].health;
          encounter.zombies = [{ id: 0, kind, health, armorHealth: ZOMBIE_TYPES[kind].armor, maxHealth: health, x: 0, z: 0, bornAt: 0, downTime: 0 }];
          field.sync(encounter);
          for (let shot = 1; shot <= health / damage; shot++) {
            field.sync(encounter);
            const currentHeight = height > 2 && encounter.zombies[0].kind === 'normal' ? 1.83 : height;
            const ray = new Raycaster(new Vector3(0, currentHeight, 10), new Vector3(0, 0, -1));
            const hit = field.decode(ray.intersectObject(field)[0]);
            expect(hit).toEqual({ id: 0, head: damage === 100 });
            const result = encounter.hit(hit!.id, hit!.head);
            expect(result!.killed).toBe(shot === health / damage);
            expect(encounter.zombies[0].health).toBe(health - shot * damage);
            expect(encounter.zombies[0].armorHealth).toBe(Math.max(0, ZOMBIE_TYPES[kind].armor - shot * damage));
            if (encounter.zombies[0].armorHealth === 0) expect(encounter.zombies[0].kind).toBe('normal');
          }
        }
      } finally { field.dispose(); (field.material as { dispose(): void }).dispose(); }
    });
  }

  it('普通僵尸没有不可见的护具碰撞，练习始终只生成普通僵尸', () => {
    const encounter = new Encounter(); encounter.reset('practice', 'hard');
    encounter.update(120, farSpawn);
    expect(encounter.zombies.every(z => z.kind === 'normal' && z.maxHealth === 100)).toBe(true);
    const field = new ZombieField(); field.sync(encounter);
    const zombie = encounter.zombies[0];
    const ray = new Raycaster(new Vector3(zombie.x, 2.5, 10), new Vector3(0, 0, -1));
    expect(ray.intersectObject(field)).toHaveLength(0);
    field.dispose(); (field.material as { dispose(): void }).dispose();
  });
});
