import { expect, test } from '@playwright/test';

test('音量即时生效，静音独立保存，刷新与重开不丢失偏好', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '练习模式' }).click();
  await expect.poll(async () => (await page.evaluate(() => window.__undeadTower!.snapshot())).audio.musicPlaying).toBe(true);
  // 在浏览器任务内同步开火和读取 0.3 秒瞬态，避免低帧率时跨进程点击返回得太晚。
  const shotAudio = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0 }));
    window.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
    return window.__undeadTower!.snapshot().audio;
  });
  expect(shotAudio.musicDucked).toBe(true);
  if ((await page.evaluate(() => window.__undeadTower!.snapshot())).phase === 'playing') await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '游戏设置' }).click();
  expect((await page.evaluate(() => window.__undeadTower!.snapshot())).audio.musicPlaying).toBe(false);
  const volume = page.getByRole('slider', { name: '总音量' });
  // 无音频输出设备时 AudioContext 时钟可能停止；设置与持久化验证不依赖硬件时钟。
  await volume.fill('37');
  await expect.poll(async () => (await page.evaluate(() => window.__undeadTower!.snapshot())).audio.volume).toBeCloseTo(0.37);
  await page.getByRole('checkbox', { name: '游戏声音' }).uncheck();
  expect((await page.evaluate(() => window.__undeadTower!.snapshot())).audio.enabled).toBe(false);
  await page.getByRole('button', { name: '返回哨站' }).click();
  expect((await page.evaluate(() => window.__undeadTower!.snapshot())).audio.musicPlaying).toBe(false);
  await page.reload();
  if ((await page.evaluate(() => window.__undeadTower!.snapshot())).phase === 'playing') await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '游戏设置' }).click();
  await expect(volume).toHaveValue('37');
  await expect(page.getByRole('checkbox', { name: '游戏声音' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: '游戏声音' }).check();
  await expect.poll(async () => (await page.evaluate(() => window.__undeadTower!.snapshot())).audio.volume).toBeCloseTo(0.37);
  await volume.fill('0');
  await expect.poll(async () => (await page.evaluate(() => window.__undeadTower!.snapshot())).audio.volume).toBe(0);
  await volume.fill('37');
  await page.screenshot({ path: 'test-results/audio-settings.png' });
  await page.getByRole('button', { name: '返回哨站' }).click();
  await page.getByRole('button', { name: '练习模式' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '重新开始训练' }).click();
  expect((await page.evaluate(() => window.__undeadTower!.snapshot())).audio.volume).toBe(0.37);
  expect((await page.evaluate(() => window.__undeadTower!.snapshot())).audio.musicPlaying).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect((await page.evaluate(() => window.__undeadTower!.snapshot())).audio.musicPlaying).toBe(false);
  await page.keyboard.press('Escape');
  expect((await page.evaluate(() => window.__undeadTower!.snapshot())).audio.musicPlaying).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '返回主菜单' }).click();
  expect((await page.evaluate(() => window.__undeadTower!.snapshot())).audio.musicPlaying).toBe(false);
});
