import { expect, test } from '@playwright/test';
import { fire, lookAt, snapshot, start } from './controls';

test('自由瞄准下护甲仍按原伤害击落并产生反馈', async ({ page }) => {
  test.setTimeout(60000);
  await start(page, 'survival');
  await expect.poll(async () => (await snapshot(page)).targets.some(z => z.kind === 'bucket'), { timeout: 20000 }).toBe(true);
  for (const [kind, health, required] of [['cone', 200, 2], ['bucket', 400, 4]] as const) {
    const id = (await snapshot(page)).targets.find(z => z.kind === kind)!.id;
    let hits = 0;
    for (let attempt = 0; attempt < 60 && hits < required; attempt++) {
      const before = await snapshot(page), target = before.targets.find(z => z.id === id)!;
      await lookAt(page, target.x, target.kind === 'cone' ? 2.4 : target.kind === 'bucket' ? 2.21 : 1.83, target.z);
      const after = await fire(page), current = after.targets.find(z => z.id === id);
      if (after.lastShot?.hitTarget === id && after.shots > before.shots) hits++;
      if (current) expect(current.health).toBe(health - hits * 100);
      if (hits === required - 1) {
        expect(current!.kind).toBe('normal'); expect(current!.armorHealth).toBe(0);
        expect(after.armorEffects.active).toBeGreaterThan(0);
      }
      if (hits < required) await page.waitForTimeout(200);
    }
    expect(hits).toBe(required);
  }
});
