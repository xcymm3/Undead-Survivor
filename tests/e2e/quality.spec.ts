import { expect, test } from '@playwright/test';

test('4K 原生、1440p 平衡和 1080p 性能画质按设备像素比切换并保存', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.getByRole('button', { name: '进入哨站' })).toBeEnabled();
    const resolution = () => page.evaluate(() => window.__undeadTower!.snapshot().renderResolution);
    expect(await resolution()).toMatchObject({ scale: 2, quality: 'native' });
    await page.getByRole('button', { name: '游戏设置' }).click();
    const select = page.getByRole('combobox', { name: '渲染清晰度' });
    await select.selectOption('balanced');
    expect(await resolution()).toMatchObject({ scale: 1.5, quality: 'balanced' });
    await select.selectOption('performance');
    expect(await resolution()).toMatchObject({ scale: 1, quality: 'performance' });
    await select.selectOption('balanced');
    expect(await page.evaluate(() => localStorage.getItem('undead-survivor.render-quality'))).toBe('balanced');
    await page.reload();
    await expect(page.getByRole('button', { name: '进入哨站' })).toBeEnabled();
    const restored = await resolution();
    expect(restored).toMatchObject({ scale: 1.5, quality: 'balanced' });
    expect(restored.width).toBeGreaterThan(960); expect(restored.height).toBeGreaterThan(540);
    expect(restored.gpu.length).toBeGreaterThan(0);
  } finally { await context.close(); }
});
