import { expect, test } from '@playwright/test';
import { capture, fire, lookAt, snapshot, start } from './controls';
import { LEADERBOARD_KEY } from '../../src/game/leaderboard';

test('空格跳跃可过河、空中暂停冻结、落岸后正常射击', async ({ page }) => {
  test.setTimeout(90000);
  await start(page);
  await lookAt(page, 0, 1.7, -40);
  await page.evaluate(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    const deadline = performance.now() + 15000;
    while (window.__undeadTower!.snapshot().player.z > -15.1 && performance.now() < deadline) await new Promise(requestAnimationFrame);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  });
  const shore = await snapshot(page);
  expect(shore.overWater).toBe(false); expect(shore.player.z).toBeLessThan(-15.1);
  // 沿岸完成暂停验收，避免新的自动前跳提前跨过河流。
  await lookAt(page, -20, 1.7, shore.player.z);
  await page.evaluate(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    const deadline = performance.now() + 3000;
    while (window.__undeadTower!.snapshot().jump.height < 0.5 && performance.now() < deadline) await new Promise(requestAnimationFrame);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
  });
  const paused = await snapshot(page); await page.waitForTimeout(250);
  expect((await snapshot(page)).jump).toEqual(paused.jump);
  await page.getByRole('button', { name: '继续游戏' }).click(); await capture(page);
  // 第一次沿岸跳用于暂停验收；落地后重新面向对岸。
  await expect.poll(async () => (await snapshot(page)).jump.grounded).toBe(true);
  const beforeCrossing = await snapshot(page);
  await lookAt(page, beforeCrossing.player.x, 1.7, -40);
  const crossing = await page.evaluate(async () => {
    // 故意按住反方向键，验证腾空后 WASD 不会改变视角决定的前跳方向。
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    let airborne = false, overWater = false;
    const deadline = performance.now() + 3000;
    while (performance.now() < deadline) {
      await new Promise(requestAnimationFrame);
      const s = window.__undeadTower!.snapshot();
      airborne ||= !s.jump.grounded; overWater ||= s.overWater && s.jump.height > 0;
      if (s.phase !== 'playing' || (airborne && s.jump.grounded)) break;
    }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyS' }));
    return { airborne, overWater, state: window.__undeadTower!.snapshot() };
  });
  expect(crossing.airborne).toBe(true); expect(crossing.overWater).toBe(true);
  expect(crossing.state.phase).toBe('playing'); expect(crossing.state.overWater).toBe(false);
  expect(crossing.state.player.z).toBeLessThan(-18.25);
  const target = crossing.state.targets[1];
  await lookAt(page, target.x, 1.83, target.z); expect((await fire(page)).lastShot!.hitTarget).toBe(target.id);
  await lookAt(page, 1, 0, -15);
  await page.screenshot({ path: 'test-results/river-crossing.png' });
});

test('玩家直接走入河流立即判负，练习不写榜，重开复位', async ({ page }) => {
  test.setTimeout(30000);
  await start(page);
  await lookAt(page, 0, 1.7, -40);
  await page.keyboard.down('w');
  await expect(page.getByRole('heading', { name: '落水失败' })).toBeVisible({ timeout: 15000 });
  await page.keyboard.up('w');
  const end = await snapshot(page);
  expect(end.result!.cause).toBe('water'); expect(end.breach).toBeNull(); expect(end.pointerLocked).toBe(false);
  expect(await page.evaluate(key => localStorage.getItem(key), LEADERBOARD_KEY)).toBeNull();
  await expect(page.getByText('练习模式，不计入排行榜。')).toBeVisible();
  await page.screenshot({ path: 'test-results/river-failure.png' });
  await page.getByRole('button', { name: '再守一次' }).click(); await capture(page);
  const reset = await snapshot(page);
  expect(reset.health).toBe(100); expect(reset.jump).toEqual({ height: 0, velocity: 0, grounded: true });
});

test('完整清波后休整、升波增加配额与移速，落水按守住波数记榜', async ({ page }) => {
  test.setTimeout(150000);
  await start(page, 'survival');
  await expect.poll(async () => (await snapshot(page)).waveSpawned, { timeout: 15000 }).toBe(9);
  const cleared = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas')!, blocked = new Map<number, number>();
    const deadline = performance.now() + 100000;
    while (performance.now() < deadline) {
      const s = window.__undeadTower!.snapshot();
      if (s.wavesCleared === 1 || s.phase !== 'playing') return s;
      if (s.ammo === 0) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
      const target = s.targets.filter(z => z.health > 0 && (blocked.get(z.id) ?? 0) < performance.now())
        .sort((a, b) => Math.hypot(a.x - s.player.x, a.z - s.player.z) - Math.hypot(b.x - s.player.x, b.z - s.player.z))[0];
      if (target && !s.reloading && s.ammo > 0) {
        const dx = target.x - s.player.x, dz = target.z - s.player.z;
        const height = target.kind === 'bucket' ? 2.21 : target.kind === 'cone' ? 2.4 : 1.83;
        const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(height - s.cameraPosition[1], Math.hypot(dx, dz));
        canvas.dispatchEvent(new PointerEvent('pointermove', { movementX: (s.yaw - yaw) / 0.0022, movementY: (s.pitch - pitch) / 0.0022 }));
        canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0 }));
        window.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
        const after = window.__undeadTower!.snapshot();
        if (after.shots > s.shots && after.lastShot?.hitTarget !== target.id) blocked.set(target.id, performance.now() + 1000);
      }
      await new Promise(resolve => setTimeout(resolve, 165));
    }
    return window.__undeadTower!.snapshot();
  });
  expect(cleared.phase).toBe('playing'); expect(cleared.wavesCleared).toBe(1);
  expect(cleared.kills).toBe(9); expect(cleared.waterZombies).toEqual([]);
  await page.keyboard.press('Escape');
  const paused = await snapshot(page); await page.waitForTimeout(300);
  expect((await snapshot(page)).intermission).toBe(paused.intermission);
  await page.getByRole('button', { name: '继续游戏' }).click(); await capture(page);
  await expect.poll(async () => (await snapshot(page)).wave, { timeout: 8000 }).toBe(2);
  const next = await snapshot(page); expect(next.waveTotal).toBe(15); expect(next.pressure.speed).toBeCloseTo(1.55);
  await lookAt(page, 0, 1.7, -40); await page.keyboard.down('w');
  await expect(page.getByRole('heading', { name: '落水失败' })).toBeVisible({ timeout: 15000 });
  await page.keyboard.up('w');
  await expect(page.getByTestId('survival-result')).toHaveText('1 波');
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), LEADERBOARD_KEY);
  expect(saved[0].waves).toBe(1); expect(saved[0].wave).toBe(2); expect(saved[0].cause).toBe('water');
  await page.screenshot({ path: 'test-results/waves-result.png' });
  await page.reload(); await page.getByRole('button', { name: '查看排行榜' }).click();
  await expect(page.getByRole('columnheader', { name: '守住波数' })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('1 波');
});
