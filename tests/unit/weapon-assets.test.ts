import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { prepareWeapon } from '../../src/game/weapon';
import { WEAPONS } from '../../src/game/weapons';
import { Mesh, MeshStandardMaterial } from 'three';

describe('六款 Quaternius 枪械动画', () => {
  for (const definition of WEAPONS.filter(weapon => !weapon.procedural)) it(`${definition.id} 可解析、动作可动且结束复位`, () => {
    const bytes = readFileSync(`public/models/weapons/${definition.model}.fbx`);
    const model = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const rig = prepareWeapon(model, definition);
    model.traverse(node => {
      if (node instanceof Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        expect(material).toBeInstanceOf(MeshStandardMaterial);
        expect((material as MeshStandardMaterial).color.getHex()).not.toBe(0xffffff);
      }
    });
    const idle = rig.diagnostics().bones;
    expect(rig.holder.scale.x).toBeGreaterThan(0.0001);
    expect(rig.holder.scale.x).toBeLessThan(0.01);
    rig.sample('reload', 0.45);
    expect(rig.diagnostics().bones).not.toEqual(idle);
    for (const bone of rig.diagnostics().bones) expect([...bone.position, ...bone.quaternion].every(Number.isFinite)).toBe(true);
    rig.sample('reload', 1);
    expect(rig.diagnostics().bones).toEqual(idle);
    rig.sample('idle');
    expect(rig.diagnostics().bones).toEqual(idle);
    expect(rig.clips.fire.tracks.every(track => !track.name.startsWith('Control.'))).toBe(true);
    const cycleBone = definition.id === 'shotgun' ? 'Reload' : definition.id === 'sniper' ? 'Handle' : null;
    if (cycleBone) {
      const base = idle.find(bone => bone.name === cycleBone);
      const poses = [0.25, 0.5, 0.75].map(p => { rig.sample('fire', p); return rig.diagnostics().bones.find(bone => bone.name === cycleBone); });
      expect(poses.some(pose => JSON.stringify(pose) !== JSON.stringify(base))).toBe(true);
      rig.sample('fire', 1); expect(rig.diagnostics().bones).toEqual(idle);
    }
    if (['rifle', 'revolver', 'shotgun', 'sniper'].includes(definition.id)) {
      const poses = [0.15, 0.4, 0.7].map(p => { rig.sample('fire', p); return rig.diagnostics().bones; });
      expect(poses.some(bones => bones.some((bone, i) => bone.quaternion.some((v, j) => Math.abs(v - idle[i].quaternion[j]) > 0.001)))).toBe(true);
    }
    if (definition.id === 'revolver') expect(model.getObjectByName('Bullets')?.type).toBe('Bone');
  });
});
