import { expect, test } from '@playwright/test';
import { fire, lookAt, snapshot, start } from './controls';

test('贴近僵尸时枪口仍在目标外，可以正常爆头开火', async ({ page }) => {
  await start(page);
  const target = (await snapshot(page)).targets[0];
  await lookAt(page, target.x, 1.7, target.z);
  await page.keyboard.down('w');
  await expect.poll(async () => {
    const state = await snapshot(page);
    return Math.hypot(state.player.x - target.x, state.player.z - target.z);
  }, { timeout: 15000 }).toBeLessThan(1.36);
  await page.keyboard.up('w');
  await lookAt(page, target.x, 1.83, target.z);
  const shot = await fire(page);
  expect(shot.lastShot!.hitTarget).toBe(target.id);
  expect(shot.targets.find(z => z.id === target.id)!.health).toBe(0);
  expect(shot.health).toBe(100);
});

test('浏览器拒绝捕获时冻结战斗，点击场景后可重新捕获', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLElement.prototype.requestPointerLock;
    let attempts = 0;
    HTMLElement.prototype.requestPointerLock = function (options) {
      if (++attempts === 1) return Promise.reject(new DOMException('Test pointer lock rejection', 'NotAllowedError'));
      return original.call(this, options);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '单人模式' }).click();
  await expect(page.locator('.pointer-hint')).toBeVisible();
  await page.keyboard.down('w'); await page.waitForTimeout(500); await page.keyboard.up('w');
  const frozen = await snapshot(page);
  expect(frozen.survived).toBe(0); expect(frozen.player).toEqual({ x: 0, z: 9 });
  expect(frozen.totalSpawned).toBe(0);
  await page.getByTestId('game-canvas').click({ position: { x: 720, y: 450 } });
  await expect.poll(async () => (await snapshot(page)).pointerLocked).toBe(true);
  await expect.poll(async () => (await snapshot(page)).survived).toBeGreaterThan(0.3);
});
