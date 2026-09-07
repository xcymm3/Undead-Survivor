import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron, expect } from '@playwright/test';

// 仅启动开发运行时，不读取、复制或改写 release 下的 EXE。
const project = fileURLToPath(new URL('..', import.meta.url));
const evidence = path.join(project, 'test-results', 'desktop-steam');
await mkdir(evidence, { recursive: true });
const env = { ...process.env, PORTABLE_EXECUTABLE_DIR: evidence, UNDEAD_SURVIVOR_SILENT: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ args: ['.', '--silent'], cwd: project, env, timeout: 30000 });
try {
  const assertHidden = async () => {
    const states = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(w => ({ visible: w.isVisible(), focused: w.isFocused(), focusable: w.isFocusable(), muted: w.webContents.isAudioMuted() })));
    assert.ok(states.length > 0);
    for (const state of states) assert.deepEqual(state, { visible: false, focused: false, focusable: false, muted: true });
  };
  const page = await app.firstWindow(), errors = [];
  await assertHidden();
  page.on('pageerror', e => errors.push(e.message));
  await expect(page.getByRole('button', { name: '多人模式' })).toBeEnabled({ timeout: 20000 });
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.equal(await page.evaluate(() => typeof window.__undeadTower), 'undefined');
  assert.equal(await page.evaluate(() => typeof window.steamCoop?.status), 'function');
  // 在桌面协议和真实 CSP 下读取角色内嵌数据，避免仅浏览器测试通过却在 EXE 中退回占位模型。
  const characters = ['Soldier_Male', 'Soldier_Female', 'Casual_Male', 'Casual_Female', 'Worker_Male', 'Worker_Female'];
  for (const character of characters) {
    const buffers = await page.evaluate(async name => {
      const response = await fetch(`/models/characters/${name}.gltf`);
      if (!response.ok) throw Error(`角色文件读取失败：${name}`);
      const asset = await response.json();
      const results = [];
      for (const buffer of asset.buffers) {
        const loaded = await fetch(buffer.uri);
        if (!loaded.ok) throw Error(`角色缓冲区读取失败：${name}`);
        results.push({ actual: (await loaded.arrayBuffer()).byteLength, expected: buffer.byteLength });
      }
      return results;
    }, character);
    assert.ok(buffers.length > 0);
    for (const buffer of buffers) { assert.ok(buffer.actual > 0); assert.equal(buffer.actual, buffer.expected); }
  }
  // 在隐藏页面中触发 DOM 操作，不发送会激活窗口的系统鼠标输入。
  await page.getByRole('button', { name: '多人模式' }).evaluate(button => button.click());
  const status = await page.evaluate(() => window.steamCoop.status());
  assert.equal(status.appId, 480);
  if (!status.available) await expect(page.getByText('Steam 未连接', { exact: false })).toBeVisible();
  const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true })).toPNG().toString('base64'));
  await writeFile(path.join(evidence, 'steam-status.png'), Buffer.from(png, 'base64'));
  await page.getByRole('button', { name: '返回首页', exact: true }).evaluate(button => button.click());
  await expect(page.getByRole('button', { name: '练习模式' })).toBeEnabled();
  assert.deepEqual(errors, []);
  await assertHidden();
  console.log(JSON.stringify({ desktop: 'passed', silent: true, appId: status.appId, steamAvailable: status.available, note: '未执行双账号实际 Steam 联网验收', evidence }, null, 2));
} finally { await app.close(); }
