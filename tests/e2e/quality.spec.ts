import { expect, test } from '@playwright/test';

test('五档预设、自定义画质和本机保存均实际生效', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.getByRole('button', { name: '进入哨站' })).toBeEnabled();
    const diagnostics = () => page.evaluate(() => window.__undeadTower!.snapshot());
    expect((await diagnostics()).renderResolution.scale).toBe(2);
    await page.getByRole('button', { name: '游戏设置' }).click();
    await page.getByRole('button', { name: '极致性能', exact: true }).click();
    expect(await diagnostics()).toMatchObject({ graphicsPreset: 'ultra-performance', graphics: { resolutionScale: 0.5, antiAliasing: 'off', shadows: 'off', effects: 'low', viewDistance: 'near', frameLimit: 60, pixelated: true } });
    expect((await diagnostics()).renderResolution.scale).toBeCloseTo(0.68, 2);
    await page.getByRole('button', { name: '平衡', exact: true }).click();
    expect(await diagnostics()).toMatchObject({ graphicsPreset: 'balanced', graphics: { resolutionScale: 0.75, antiAliasing: 'fxaa', shadows: 'medium' } });
    expect((await diagnostics()).renderResolution.scale).toBe(1.5);
    await page.getByRole('combobox', { name: '抗锯齿' }).selectOption('smaa');
    await page.getByRole('combobox', { name: '帧率上限' }).selectOption('120');
    await expect(page.getByText('当前：自定义')).toBeVisible();
    expect(await diagnostics()).toMatchObject({ graphicsPreset: 'custom', graphics: { antiAliasing: 'smaa', frameLimit: 120 } });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('undead-survivor.graphics')!))).toMatchObject({ antiAliasing: 'smaa', frameLimit: 120 });
    await page.reload();
    await expect(page.getByRole('button', { name: '进入哨站' })).toBeEnabled();
    const restored = await diagnostics();
    expect(restored).toMatchObject({ graphicsPreset: 'custom', graphics: { antiAliasing: 'smaa', frameLimit: 120 } });
    expect(restored.renderResolution.width).toBeGreaterThan(960); expect(restored.renderResolution.height).toBeGreaterThan(540);
    expect(restored.renderResolution.gpu.length).toBeGreaterThan(0);
  } finally { await context.close(); }
});
