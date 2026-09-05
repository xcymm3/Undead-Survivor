import { describe, expect, it } from 'vitest';
import { Raycaster, Vector3 } from 'three';
import { Encounter } from '../../src/game/encounter';
import { ZombieField } from '../../src/game/zombies';
import { ArmorEffects } from '../../src/game/armorEffects';

describe('护甲脱落', () => {
  it('打掉护甲后本体存活、原护具碰撞消失，脱落模型飞起并回收', () => {
    const encounter = new Encounter(() => .7); encounter.reset('survival', 'hard');
    encounter.update(6, () => ({ x: 0, z: -100 }));
    const target = encounter.zombies.find(z => z.kind === 'cone')!;
    encounter.zombies = [target]; target.x = 0; target.z = 0;
    const field = new ZombieField(); const debris = new ArmorEffects();
    try {
      field.sync(encounter);
      const ray = new Raycaster(new Vector3(0, 2.5, 10), new Vector3(0, 0, -1));
      expect(field.decode(ray.intersectObject(field)[0])?.id).toBe(target.id);
      expect(encounter.hit(target.id, true)).toEqual({ killed: false, armorHit: 'cone', armorBroken: true });
      expect(target.health).toBe(100); expect(target.kind).toBe('normal'); expect(encounter.kills).toBe(0);
      debris.release(field.captureArmor(target.id, 'cone'), new Vector3(0, 0, -1));
      field.sync(encounter);
      expect(ray.intersectObject(field)).toHaveLength(0);
      expect(debris.count).toBe(5);
      const before = debris.diagnostics().positions[0]; debris.update(0.1);
      expect(debris.diagnostics().positions[0][1]).toBeGreaterThan(before[1]);
      expect(encounter.hit(target.id, true)?.killed).toBe(true); expect(encounter.kills).toBe(1);
      for (let i = 0; i < 130; i++) debris.update(1 / 60);
      expect(debris.count).toBe(0); debris.reset(); expect(debris.diagnostics().released).toBe(0);
    } finally { field.dispose(); debris.dispose(); (field.material as { dispose(): void }).dispose(); (debris.material as { dispose(): void }).dispose(); }
  });
});
