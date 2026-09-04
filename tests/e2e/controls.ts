import { expect, type Page } from '@playwright/test';
import { CONFIG } from '../../src/game/config';

export const snapshot = (page: Page) => page.evaluate(() => window.__undeadTower!.snapshot());
export async function capture(page: Page) {
  if (!(await snapshot(page)).pointerLocked) {
    await page.waitForTimeout(1100);
    await page.getByTestId('game-canvas').click({ position: { x: 720, y: 450 } });
  }
  await expect.poll(async () => (await snapshot(page)).pointerLocked).toBe(true);
}
export async function start(page: Page, mode: 'practice' | 'survival' = 'practice') {
  await page.goto('/');
  if (mode === 'survival') await page.getByRole('button', { name: '正式模式' }).click();
  await page.getByRole('button', { name: mode === 'practice' ? '进入哨站' : '开始坚守' }).click();
  await capture(page);
}
export async function lookAt(page: Page, x: number, y: number, z: number) {
  await page.evaluate(({ x, y, z, sensitivity }) => {
    const s = window.__undeadTower!.snapshot();
    const dx = x - s.cameraPosition[0], dy = y - s.cameraPosition[1], dz = z - s.cameraPosition[2];
    const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
    document.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointermove', {
      movementX: (s.yaw - yaw) / sensitivity, movementY: (s.pitch - pitch) / sensitivity,
    }));
  }, { x, y, z, sensitivity: CONFIG.camera.sensitivity });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
export async function fire(page: Page) {
  // 同一浏览器任务内完成按下/抬起，避免自动武器因测试进程调度延迟多射一发。
  return page.evaluate(() => {
    document.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointerdown', { button: 0 }));
    window.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
    return window.__undeadTower!.snapshot();
  });
}
