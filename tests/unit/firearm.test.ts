import { describe, expect, it } from 'vitest';
import { Firearm } from '../../src/game/firearm';
import { CONFIG } from '../../src/game/config';
import { WEAPONS } from '../../src/game/weapons';

describe('射击与装填', () => {
  it('每次有效开火消耗一发，冷却中拒绝重复射击', () => {
    const gun = new Firearm();
    expect(gun.fire()).toBe(true);
    expect(gun.fire()).toBe(false);
    expect(gun.ammo).toBe(29);
    expect(gun.shots).toBe(1);
    gun.update(CONFIG.weapon.interval);
    expect(gun.fire()).toBe(true);
  });
  it('空弹匣不会产生额外射击，换弹期间禁止开火', () => {
    const gun = new Firearm();
    for (let i = 0; i < 30; i++) { expect(gun.fire()).toBe(true); gun.update(CONFIG.weapon.interval); }
    expect(gun.fire()).toBe(false);
    expect(gun.ammo).toBe(0);
    expect(gun.reload()).toBe(true);
    expect(gun.reload()).toBe(false);
    expect(gun.reloadEmpty).toBe(true);
    gun.update(gun.definition.reloadDuration - .001);
    expect(gun.fire()).toBe(false);
    expect(gun.ammo).toBe(0);
    gun.update(0.0011);
    expect(gun.ammo).toBe(30);
    expect(gun.fire()).toBe(true);
  });
  it('战术换弹按武器时长完成，重复换弹不重置进度', () => {
    const gun = new Firearm(); gun.fire(); gun.reload();
    expect(gun.reloadRemaining).toBe(gun.definition.reloadDuration); expect(gun.reloadEmpty).toBe(false);
    gun.update(0.4); const remaining = gun.reloadRemaining;
    expect(gun.reload()).toBe(false); expect(gun.reloadRemaining).toBe(remaining);
    expect(gun.ammo).toBe(29); expect(gun.fire()).toBe(false);
    gun.update(gun.definition.reloadDuration - 0.4); expect(gun.ammo).toBe(30); expect(gun.reloading).toBe(false);
  });
  it('满弹匣不换弹，重置清除冷却与装填状态', () => {
    const gun = new Firearm();
    expect(gun.reload()).toBe(false);
    gun.fire(); gun.reload(); gun.reset();
    expect(gun.ammo).toBe(30);
    expect(gun.reloading).toBe(false);
    expect(gun.shots).toBe(0);
    expect(gun.fire()).toBe(true);
  });
  it('消防斧攻击不消耗弹药且不能换弹', () => {
    const axe = new Firearm(WEAPONS[6]);
    for (let i = 0; i < 4; i++) { expect(axe.fire()).toBe(true); axe.update(WEAPONS[6].interval); }
    expect(axe.ammo).toBe(1);
    expect(axe.reload()).toBe(false);
  });
});
