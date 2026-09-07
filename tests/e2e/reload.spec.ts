import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { capture, fire } from './controls';
import { WEAPONS } from '../../src/game/weapons';
import { CONFIG } from '../../src/game/config';
import { isOpticalSight, sightFov, weaponSight } from '../../src/game/sights';
const snapshot = (page: Page) => page.evaluate(() => window.__undeadTower!.snapshot());
async function freezeAt(page: Page, progress: number, initiate = false) {
  await page.evaluate(async ({ threshold, initiate }) => {
    if (initiate) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
    const deadline = performance.now() + 4000;
    while (performance.now() < deadline) {
      const state = window.__undeadTower!.snapshot();
      if (state.reloading && state.reload.progress >= threshold) { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })); return; }
      await new Promise(requestAnimationFrame);
    }
    throw new Error('未捕获换弹阶段');
  }, { threshold: progress, initiate });
}

test('十种武器数字键切换、右键抬枪、独立弹量、换弹动画与暂停协调', async ({ page }) => {
  test.setTimeout(150000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.getByRole('button', { name: '练习模式' }).click();
  await page.mouse.move(720, 450); await page.waitForTimeout(250);
  await page.addStyleTag({ content: '.pause-screen { visibility: hidden; }' });
  for (let i = 0; i < WEAPONS.length; i++) {
    await page.keyboard.press(i === 9 ? 'Digit0' : `Digit${i + 1}`);
    await expect.poll(async () => { const s = await snapshot(page); return s.weaponIndex === i && !s.switching; }).toBe(true);
    const idle = await snapshot(page);
    expect(idle.weaponAnimation.loaded).toBe(true); expect(idle.weaponAnimation.attachedModels).toBe(WEAPONS.length); expect(idle.weaponAnimation.visibleModels).toBe(1);
    await expect(page.getByTestId('weapon-name')).toContainText(WEAPONS[i].label);
    // 每把枪在待机时枪口和中心瞄准射线保持一致。
    const ray = idle.aimPoint.map((v, index) => v - idle.muzzle[index]), length = Math.hypot(...ray);
    expect(ray.reduce((sum, v, index) => sum + v / length * idle.barrelDirection[index], 0)).toBeCloseTo(1, 7);
    await page.mouse.down({ button: 'right' });
    await expect.poll(async () => (await snapshot(page)).aimBlend).toBeGreaterThan(.8);
    const aimed = await snapshot(page);
    expect(aimed.aiming).toBe(true);
    const sight = weaponSight(WEAPONS[i]);
    expect(aimed.cameraFov).toBeCloseTo(sightFov(CONFIG.camera.fov, 1 + (sight.magnification - 1) * aimed.aimBlend), 5);
    expect(aimed.weaponAnimation.visibleModels).toBe(isOpticalSight(sight) ? 0 : 1);
    if (isOpticalSight(sight)) {
      await expect(page.locator(`.sight-${sight.kind}`)).toBeVisible();
      const lens = (await page.locator('.sight-lens').boundingBox())!;
      expect(lens.x + lens.width / 2).toBeCloseTo(720, 0);
      expect(lens.y + lens.height / 2).toBeCloseTo(450, 0);
    } else await expect(page.locator('.sight-overlay')).toHaveCount(0);
    expect(Math.hypot(...aimed.muzzle.map((v, index) => v - idle.muzzle[index]))).toBeGreaterThan(.015);
    aimed.ballisticMuzzle.forEach((value, index) => expect(value).toBeCloseTo(idle.ballisticMuzzle[index], 5));
    const fired = await fire(page);
    expect(fired.lastShot).not.toBeNull();
    fired.lastShot!.muzzle.forEach((value, index) => expect(value).toBeCloseTo(aimed.ballisticMuzzle[index], 5));
    await page.mouse.up({ button: 'right' });
    await expect(page.locator('.sight-overlay')).toHaveCount(0);
    expect(fired.ammo).toBe(WEAPONS[i].infiniteAmmo ? WEAPONS[i].capacity : WEAPONS[i].capacity - 1);
    if (WEAPONS[i].infiniteAmmo) {
      await page.keyboard.press('r');
      expect((await snapshot(page)).reloading).toBe(false);
      continue;
    }
    await freezeAt(page, 0.4, true);
    const during = await snapshot(page);
    expect(during.weaponAnimation.kind).toBe('reload');
    expect(during.weaponAnimation.bones).not.toEqual(idle.weaponAnimation.bones);
    await page.waitForTimeout(150); expect((await snapshot(page)).weaponAnimation).toEqual(during.weaponAnimation);
    await page.keyboard.press('Escape'); await capture(page);
    await expect.poll(async () => (await snapshot(page)).reloading).toBe(false);
    expect((await snapshot(page)).ammo).toBe(WEAPONS[i].capacity);
    expect((await snapshot(page)).weaponAnimation.kind).toBe('idle');
  }
  await page.mouse.wheel(0, 300);
  await expect.poll(async () => (await snapshot(page)).weaponIndex).toBe(0);
  await expect.poll(async () => (await snapshot(page)).switching).toBe(false);
  await page.mouse.click(720, 450);
  await page.keyboard.press('Digit2');
  await expect.poll(async () => (await snapshot(page)).weaponIndex).toBe(1);
  await expect.poll(async () => (await snapshot(page)).switching).toBe(false);
  await page.keyboard.press('Digit1');
  await expect.poll(async () => (await snapshot(page)).weaponIndex).toBe(0);
  expect((await snapshot(page)).ammo).toBe(29);
  expect(errors).toEqual([]);
});

test('半自动不连发，换弹排队切枪、快速改选与切枪暂停不丢失状态', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '练习模式' }).click();
  await page.keyboard.press('Digit3');
  await expect.poll(async () => { const s = await snapshot(page); return s.weaponIndex === 2 && !s.switching; }).toBe(true);
  await page.mouse.move(720, 450); await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
  expect((await snapshot(page)).ammo).toBe(11); expect((await snapshot(page)).shots).toBe(1);
  await page.keyboard.press('r');
  await page.evaluate(async () => {
    while (!window.__undeadTower!.snapshot().reloading) await new Promise(requestAnimationFrame);
    for (const code of ['Digit2', 'Digit4', 'Digit6']) window.dispatchEvent(new KeyboardEvent('keydown', { code }));
  });
  await freezeAt(page, 0.4);
  const queued = await snapshot(page);
  expect(queued.weaponIndex).toBe(2); expect(queued.requestedWeapon).toBe(5); expect(queued.switching).toBe(false);
  await page.keyboard.press('Escape'); await capture(page);
  await expect.poll(async () => { const s = await snapshot(page); return s.weaponIndex === 5 && !s.switching; }).toBe(true);
  expect((await snapshot(page)).inventory[2]).toBe(12);
  await page.mouse.wheel(0, -300);
  await page.evaluate(async () => {
    while (!window.__undeadTower!.snapshot().switching) await new Promise(requestAnimationFrame);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
  });
  const paused = await snapshot(page); await page.waitForTimeout(200);
  expect((await snapshot(page)).switchProgress).toBe(paused.switchProgress);
  await page.keyboard.press('Escape'); await capture(page);
  await expect.poll(async () => { const s = await snapshot(page); return s.weaponIndex === 4 && !s.switching; }).toBe(true);
});
