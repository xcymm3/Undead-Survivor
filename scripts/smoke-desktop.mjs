import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron, expect } from '@playwright/test';

// 仅启动开发运行时，不读取、复制或改写 release 下的 EXE。
const project = fileURLToPath(new URL('..', import.meta.url));
const evidence = path.join(project, 'test-results', 'desktop-steam');
await mkdir(evidence, { recursive: true });
const env = { ...process.env, PORTABLE_EXECUTABLE_DIR: evidence };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ args: ['.'], cwd: project, env, timeout: 30000 });
try {
  const page = await app.firstWindow(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await expect(page.getByRole('button', { name: '多人模式' })).toBeEnabled({ timeout: 20000 });
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.equal(await page.evaluate(() => typeof window.__undeadTower), 'undefined');
  assert.equal(await page.evaluate(() => typeof window.steamCoop?.status), 'function');
  await page.getByRole('button', { name: '多人模式' }).click();
  const status = await page.evaluate(() => window.steamCoop.status());
  assert.equal(status.appId, 480);
  if (!status.available) await expect(page.getByText('Steam 未就绪', { exact: false })).toBeVisible();
  await page.screenshot({ path: path.join(evidence, 'steam-status.png') });
  await page.getByRole('button', { name: '返回首页', exact: true }).click();
  await expect(page.getByRole('button', { name: '进入哨站' })).toBeEnabled();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ desktop: 'passed', appId: status.appId, steamAvailable: status.available, note: '未执行双账号实际 Steam 联网验收', evidence }, null, 2));
} finally { await app.close(); }
