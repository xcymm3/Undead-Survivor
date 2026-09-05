import { describe, expect, it } from 'vitest';
import { Mesh } from 'three';
import { prepareProceduralWeapon } from '../../src/game/weapon';
import { WEAPONS } from '../../src/game/weapons';

describe('四款自制低多边形武器', () => {
  const definitions = WEAPONS.filter(weapon => weapon.procedural);

  it('包含斧子、喷火枪、连喷和重机枪，并为每款提供独立模型', () => {
    expect(definitions.map(weapon => weapon.id)).toEqual(['axe', 'flamethrower', 'auto-shotgun', 'heavy-machine-gun']);
    for (const definition of definitions) {
      const rig = prepareProceduralWeapon(definition);
      let meshes = 0;
      rig.model.traverse(node => { if (node instanceof Mesh) meshes++; });
      expect(meshes).toBeGreaterThanOrEqual(3);
      expect(rig.muzzleZ).toBeLessThan(-.5);
      rig.dispose();
    }
  });

  for (const definition of definitions) it(`${definition.label} 的攻击和装填部件动作可复位`, () => {
    const rig = prepareProceduralWeapon(definition);
    const idle = rig.diagnostics().bones;
    rig.sample('fire', .5);
    expect(rig.diagnostics().bones).not.toEqual(idle);
    rig.sample('fire', 1);
    expect(rig.diagnostics().bones).toEqual(idle);
    if (!definition.infiniteAmmo) {
      rig.sample('reload', .45);
      expect(rig.diagnostics().bones).not.toEqual(idle);
      rig.sample('reload', 1);
      expect(rig.diagnostics().bones).toEqual(idle);
    }
    rig.dispose();
  });

  it('消防斧具有单侧斧刃和背部尖镐，自动霰弹枪使用鼓式弹匣', () => {
    const axe = prepareProceduralWeapon(WEAPONS.find(weapon => weapon.id === 'axe')!);
    expect(axe.model.getObjectByName('FireAxeBlade')).toBeTruthy();
    expect(axe.model.getObjectByName('FireAxePick')).toBeTruthy();
    const shotgun = prepareProceduralWeapon(WEAPONS.find(weapon => weapon.id === 'auto-shotgun')!);
    expect(shotgun.model.getObjectByName('DrumMagazine')).toBeTruthy();
    expect(shotgun.model.getObjectByName('BoxMagazine')).toBeFalsy();
    axe.dispose(); shotgun.dispose();
  });
});
