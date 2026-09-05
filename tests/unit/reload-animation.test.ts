import { describe, expect, it } from 'vitest';
import { crossedReloadStage, reloadPose, reloadStage } from '../../src/game/reloadAnimation';
import { WEAPONS } from '../../src/game/weapons';

describe('十款武器的分阶段动作轨迹', () => {
  it('每把枪依次经过五阶段并在首尾回到瞄准位姿', () => {
    const focusPoses = new Set<string>();
    for (const weapon of WEAPONS) {
      expect([.01, .2, .5, .8, .96].map(progress => reloadStage(weapon, progress))).toEqual(['prepare', 'eject', 'insert', 'action', 'return']);
      expect(reloadPose(weapon, 0, false)).toMatchObject({ x: 0, y: 0, z: 0 });
      expect(reloadPose(weapon, .2, false).y).toBeGreaterThan(.09);
      expect(reloadPose(weapon, 1, true)).toMatchObject({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
      const pose = reloadPose(weapon, .2, false);
      focusPoses.add([pose.x, pose.y, pose.z, pose.rx, pose.ry, pose.rz].join(':'));
    }
    expect(focusPoses.size).toBe(WEAPONS.length);
  });

  it('空仓枪机阶段比战术换弹更明显且阶段音效只跨线一次', () => {
    const rifle = WEAPONS[0];
    expect(Math.abs(reloadPose(rifle, .78, true).ry)).toBeLessThan(Math.abs(reloadPose(rifle, .78, false).ry));
    expect(crossedReloadStage(rifle, .1, .13, 'eject')).toBe(true);
    expect(crossedReloadStage(rifle, .13, .2, 'eject')).toBe(false);
  });
});
