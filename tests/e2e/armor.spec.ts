import { expect, test } from '@playwright/test';
import { capture, fire, lookAt, snapshot } from './controls';
import { WEAPONS } from '../../src/game/weapons';

test('自由瞄准下护甲按当前武器伤害脱落并产生反馈', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/');
  // 名单生成每只怪物消耗两次随机数：先锁定一阶，再固定生成路障。
  await page.evaluate(() => {
    const values = Array.from({ length: 18 }, (_, index) => index % 2 === 0 ? .1 : .7);
    let index = 0, seed = 17;
    Math.random = () => index < values.length ? values[index++] : ((seed = seed * 48271 % 2147483647) - 1) / 2147483646;
  });
  await page.getByRole('button', { name: '单人模式' }).click();
  await capture(page);
  await expect.poll(async () => (await snapshot(page)).targets.some(z => z.kind === 'cone'), { timeout: 20000 }).toBe(true);
  const releasedBefore = (await snapshot(page)).armorEffects.released;
  let broken = false;
  for (let attempt = 0; attempt < 30 && !broken; attempt++) {
    const before = await snapshot(page);
    const target = before.targets.filter(z => z.kind === 'cone')
      .sort((a, b) => Math.hypot(a.x - before.player.x, a.z - before.player.z) - Math.hypot(b.x - before.player.x, b.z - before.player.z))[0];
    if (!target) break;
    await lookAt(page, target.x, 2.4, target.z);
    const after = await fire(page), hitId = after.lastShot?.hitTarget;
    const hitBefore = before.targets.find(z => z.id === hitId);
    const current = after.targets.find(z => z.id === hitId);
    if (hitBefore?.kind === 'cone' && current?.armorHealth === 0) {
      expect(current.kind).toBe('normal'); expect(current.armorHealth).toBe(0);
      expect(current.health).toBe(Math.max(0, hitBefore.health - WEAPONS[0].damage * (WEAPONS[0].headshotMultiplier ?? 2)));
      expect(after.armorEffects.released).toBe(releasedBefore + 1);
      broken = true;
    }
    if (!broken) await page.waitForTimeout(200);
  }
  expect(broken).toBe(true);
});
