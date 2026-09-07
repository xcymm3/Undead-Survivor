import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../../src/game/weapons';

const metric = (id: string) => {
  const weapon = WEAPONS.find(item => item.id === id)!;
  // 斧子三条射线用于形成挥砍扇面，同一目标每次只受一次伤害。
  const damagePerAttack = weapon.kind === 'melee' ? weapon.damage : weapon.damage * weapon.pellets;
  const burstDps = damagePerAttack / weapon.interval;
  const reload = weapon.shellReload ? weapon.reloadDuration * weapon.capacity : weapon.reloadDuration;
  const sustainedDps = weapon.infiniteAmmo ? burstDps : damagePerAttack * weapon.capacity / (weapon.interval * weapon.capacity + reload);
  return { weapon, damagePerAttack, burstDps, sustainedDps };
};

describe('十款武器分级平衡', () => {
  it('编号、名称和右键瞄准位姿完整且互不重复', () => {
    expect(WEAPONS).toHaveLength(10);
    expect(new Set(WEAPONS.map(weapon => weapon.id)).size).toBe(10);
    for (const weapon of WEAPONS) expect([...weapon.ads, weapon.damage, weapon.interval].every(Number.isFinite)).toBe(true);
  });

  it('四款新武器各自保留明确的强项与代价', () => {
    const axe = metric('axe'), flame = metric('flamethrower'), shotgun = metric('auto-shotgun'), hmg = metric('heavy-machine-gun');
    expect(axe.weapon.infiniteAmmo).toBe(true);
    expect(axe.weapon.range).toBeLessThanOrEqual(2.5);
    expect(axe.sustainedDps).toBeGreaterThan(220);
    expect(flame.weapon.piercing).toBe(true);
    expect(flame.weapon.range).toBe(12);
    expect(flame.burstDps).toBe(450);
    expect(shotgun.damagePerAttack).toBeCloseTo(192);
    expect(shotgun.weapon.spread).toBeGreaterThan(.04);
    expect(hmg.weapon.capacity).toBe(100);
    expect(hmg.weapon.reloadDuration).toBeGreaterThan(3.5);
  });

  it('同级常规武器持续输出接近，斧子以近身风险换取免装填', () => {
    expect(metric('pistol').sustainedDps).toBeCloseTo(125);
    for (const weapon of WEAPONS.filter(weapon => weapon.tier === 'B')) {
      expect(metric(weapon.id).sustainedDps).toBeGreaterThan(205);
      expect(metric(weapon.id).sustainedDps).toBeLessThan(245);
    }
    for (const weapon of WEAPONS.filter(weapon => weapon.tier === 'A' && weapon.kind !== 'melee')) {
      expect(metric(weapon.id).sustainedDps).toBeGreaterThan(340);
      expect(metric(weapon.id).sustainedDps).toBeLessThan(360);
    }
    expect(metric('axe').sustainedDps).toBe(500);
    expect(metric('sniper').weapon.headshotMultiplier).toBe(3);
    expect(metric('shotgun').damagePerAttack).toBeCloseTo(280);
    expect(metric('shotgun').weapon.pellets).toBe(15);
    expect(metric('auto-shotgun').weapon.pellets).toBe(17);
  });

});
