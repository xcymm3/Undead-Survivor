import { expect, test } from '@playwright/test';
import { capture, fire, lookAt, snapshot, start } from './controls';
import { CONFIG } from '../../src/game/config';

test('自由转向、WASD移动并开火，枪口与准星一致，暂停清空按键', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await start(page);
  await expect(page.getByTestId('player-health')).toHaveText('100');
  const initial = await snapshot(page);
  await page.keyboard.down('w'); await page.waitForTimeout(500);
  await fire(page); await page.keyboard.up('w');
  const moved = await snapshot(page);
  expect(moved.player.z).toBeLessThan(initial.player.z - 1);
  expect(moved.shots).toBeGreaterThan(0); expect(moved.ammo).toBeLessThan(30);
  const turnOrigin = await snapshot(page);
  await lookAt(page, 20, 1.7, turnOrigin.cameraPosition[2]);
  expect((await snapshot(page)).yaw).toBeCloseTo(-Math.PI / 2, 2);
  await page.keyboard.down('w'); await page.waitForTimeout(400); await page.keyboard.up('w');
  expect((await snapshot(page)).player.x).toBeGreaterThan(0.8);
  for (const point of [[-20, 5, 9], [0, 1.7, 20], [20, 1.7, -30]]) {
    await lookAt(page, point[0], point[1], point[2]);
    const s = await snapshot(page), direction = s.aimPoint.map((v, i) => v - s.muzzle[i]), length = Math.hypot(...direction);
    expect(direction.reduce((sum, v, i) => sum + v / length * s.barrelDirection[i], 0)).toBeCloseTo(1, 7);
    expect(s.aim).toEqual([0, 0]);
  }
  await page.keyboard.down('w'); await page.keyboard.press('Escape');
  await expect.poll(async () => (await snapshot(page)).phase).toBe('paused');
  await page.keyboard.up('w');
  const paused = await snapshot(page); await page.waitForTimeout(250);
  expect((await snapshot(page)).player).toEqual(paused.player);
  await page.getByRole('button', { name: '继续游戏' }).click(); await capture(page);
  const resumed = await snapshot(page); await page.waitForTimeout(200);
  expect((await snapshot(page)).player).toEqual(resumed.player);
  await page.keyboard.press('r');
  await expect(page.getByTestId('ammo')).toHaveText('30');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect((await snapshot(page)).phase).toBe('paused'); expect(errors).toEqual([]);
});

test('自由视角对准练习靶爆头，击倒复位与受伤隔离', async ({ page }) => {
  await start(page);
  const target = (await snapshot(page)).targets[1];
  await lookAt(page, target.x, 1.83, target.z); await fire(page);
  await expect.poll(async () => (await snapshot(page)).kills).toBe(1);
  expect((await snapshot(page)).blood.bursts).toBe(1);
  expect((await snapshot(page)).audio.deathCues).toBe(1);
  await expect.poll(async () => (await snapshot(page)).targets[1].health, { timeout: 5000 }).toBe(100);
  expect((await snapshot(page)).health).toBe(100);
});

test('低头缓慢旋转时忽略整屏鼠标回绕，不会突转 180 度', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    for (let index = 0; index < 200; index++) canvas.dispatchEvent(new PointerEvent('pointermove', { movementY: 4 }));
    for (let index = 0; index < 20; index++) canvas.dispatchEvent(new PointerEvent('pointermove', { movementX: -3 }));
  });
  const before = await snapshot(page);
  expect(before.pitch).toBeCloseTo(-CONFIG.camera.pitchLimit, 10);
  await page.evaluate(() => document.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointermove', { movementX: 1428 })));
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const after = await snapshot(page);
  expect(after.yaw).toBeCloseTo(before.yaw, 10);
  await page.evaluate(() => document.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointermove', { movementX: -3 })));
  expect((await snapshot(page)).yaw).toBeGreaterThan(after.yaw);
});

for (const width of [320, 375, 414, 768]) {
  test(`小屏布局与设置可用 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: '练习模式' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: '游戏设置' }).click();
    await expect(page.getByRole('button', { name: '返回哨站' })).toBeVisible();
    await page.getByRole('checkbox', { name: '粗颗粒像素' }).check();
    await expect(page.getByRole('checkbox', { name: '粗颗粒像素' })).toBeChecked();
    await page.screenshot({ path: `test-results/settings-${width}.png` });
    await page.getByRole('button', { name: '返回哨站' }).click();
    await page.screenshot({ path: `test-results/intro-${width}.png` });
  });
}

test('标题与暂停静止时停止绘制，游戏恢复后重新绘制', async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => (await snapshot(page)).renderCount).toBeGreaterThan(0);
  await page.waitForTimeout(200);
  const ready = (await snapshot(page)).renderCount;
  await page.waitForTimeout(250);
  expect((await snapshot(page)).renderCount).toBe(ready);
  await page.getByRole('button', { name: '练习模式' }).click();
  await expect.poll(async () => (await snapshot(page)).renderCount).toBeGreaterThan(ready + 3);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const paused = (await snapshot(page)).renderCount;
  await page.waitForTimeout(250);
  expect((await snapshot(page)).renderCount).toBe(paused);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await snapshot(page)).renderCount).toBeGreaterThan(paused + 3);
});
