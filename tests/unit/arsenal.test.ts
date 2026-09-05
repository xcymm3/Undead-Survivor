import { describe, expect, it } from 'vitest';
import { Arsenal } from '../../src/game/arsenal';
import { WEAPONS } from '../../src/game/weapons';
import { Firearm } from '../../src/game/firearm';

describe('独立弹匣与协调切枪', () => {
  it('中点才替换模型对应的武器，切枪不补弹且不能开火', () => {
    const a = new Arsenal(); a.fire(); a.update(0.2); a.request(1);
    expect(a.active).toBe(0); expect(a.fire()).toBe(false);
    a.update(0.19); expect(a.active).toBe(0);
    a.update(0.02); expect(a.active).toBe(1); expect(a.fire()).toBe(false);
    a.update(0.2); expect(a.fire()).toBe(true); expect(a.gun.ammo).toBe(49);
    a.update(0.2); a.request(0); a.update(0.4);
    expect(a.gun.ammo).toBe(29); expect(a.shots).toBe(2);
  });
  it('装填不被切枪截断，完成后收枪；新请求覆盖排队目标', () => {
    const a = new Arsenal(); a.fire(); a.reload();
    expect(a.reloadQueued).toBe(true); a.update(WEAPONS[0].fireDuration); expect(a.gun.reloading).toBe(true);
    a.request(3); a.request(5); a.update(0.4);
    expect(a.active).toBe(0); expect(a.switching).toBe(false); expect(a.fire()).toBe(false);
    a.update(WEAPONS[0].reloadDuration); expect(a.gun.ammo).toBe(30); expect(a.switching).toBe(true);
    a.update(0.4); expect(a.active).toBe(5);
  });
  it('拔枪时的新请求排队，暂停零时间不推进，重开清空所有状态', () => {
    const a = new Arsenal(); a.request(2); a.update(0.25); expect(a.active).toBe(2);
    a.request(4); const progress = a.switchProgress; a.update(0); expect(a.switchProgress).toBe(progress);
    a.update(0.15); a.update(0.4); expect(a.active).toBe(4);
    a.reset(); expect(a.active).toBe(0); expect(a.pending).toBe(false); expect(a.switching).toBe(false);
    expect(a.guns.map(gun => gun.ammo)).toEqual(WEAPONS.map(gun => gun.capacity));
  });
  it('霰弹枪每完成一轮装填只补一发，中途不会整匣补满', () => {
    const gun = new Firearm(WEAPONS[4]); gun.ammo = 2; gun.reload();
    gun.update(gun.definition.reloadDuration - 0.001); expect(gun.ammo).toBe(2);
    gun.update(0.001); expect(gun.ammo).toBe(3); expect(gun.reloading).toBe(true);
    gun.update(gun.definition.reloadDuration * 3 + .001); expect(gun.ammo).toBe(6); expect(gun.reloading).toBe(false);
  });
});
