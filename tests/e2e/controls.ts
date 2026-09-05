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
    // 大角度转向会拆成多个事件；第二遍用残差修正极少数被回绕过滤器丢弃的边界事件。
    for (let attempt = 0; attempt < 2; attempt++) {
      const s = window.__undeadTower!.snapshot();
      const dx = x - s.cameraPosition[0], dy = y - s.cameraPosition[1], dz = z - s.cameraPosition[2];
      const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
      const movementX = (s.yaw - yaw) / sensitivity, movementY = (s.pitch - pitch) / sensitivity;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(movementX), Math.abs(movementY)) / 120));
      for (let step = 0; step < steps; step++) document.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointermove', {
        movementX: movementX / steps, movementY: movementY / steps,
      }));
    }
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
