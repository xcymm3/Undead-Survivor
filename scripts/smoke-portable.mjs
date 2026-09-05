import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { launchPortable } from './launch-portable.mjs';

const project = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const { version } = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'));
// 0.5.0 及更早的成品没有静默能力，禁止通过本脚本启动。
assert.ok(/^\d+\.\d+\.\d+$/.test(version) && Number(version.split('.')[0]) * 1000 + Number(version.split('.')[1]) >= 6, '成品验证要求 0.6.0 或更新版本');
assert.equal(process.argv.length, 2, '仅验证当前版本成品，不接受旧 EXE 路径');
const filename = `Undead Survivor-${version}.exe`;
const source = path.join(project, 'release', filename);
const evidence = path.join(project, 'test-results', `portable-${Date.now()}`);
let portableDir = path.join(evidence, '初次运行');
await mkdir(portableDir, { recursive: true });
await copyFile(source, path.join(portableDir, filename));
const errors = [], requests = new Set();
const click = (page, name) => page.getByRole('button', { name }).evaluate(button => button.click());
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let app;

async function renameAfterUnlock(source, destination) {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { await rename(source, destination); return; }
    catch (error) {
      if (!['EPERM', 'EBUSY'].includes(error.code) || Date.now() >= deadline) throw error;
      await delay(250);
    }
  }
}

async function assertHidden() {
  const states = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(w => ({
    visible: w.isVisible(), focused: w.isFocused(), focusable: w.isFocusable(), muted: w.webContents.isAudioMuted(),
  })));
  assert.ok(states.length > 0);
  for (const state of states) assert.deepEqual(state, { visible: false, focused: false, focusable: false, muted: true });
}

async function start() {
  const env = { ...process.env, UNDEAD_SURVIVOR_SILENT: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.PORTABLE_EXECUTABLE_DIR;
  // NSIS portable 无 splashImage 时默认 SetSilent silent；内层 Electron 同时使用参数和环境变量。
  app = await launchPortable(path.join(portableDir, filename), portableDir, env);
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.add(request.url()));
  await page.waitForURL('undead://game/');
  // GitHub 的全新 Windows runner 首次解压便携包并解析六套枪械模型明显慢于开发机。
  // 先用单人入口确认共享资源已经就绪，再验收多人入口，避免把冷启动误判成 Steam 故障。
  await expect(page.getByRole('button', { name: '进入哨站' })).toBeEnabled({ timeout: 90000 });
  await expect(page.getByRole('button', { name: '多人模式' })).toBeEnabled();
  await assertHidden();
  assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
  assert.equal(await app.evaluate(({ app }) => app.getVersion()), version);
  assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), path.join(portableDir, 'Undead Survivor Data'));
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.equal(await page.evaluate(() => typeof window.__undeadTower), 'undefined');
  assert.equal(await page.evaluate(() => window.isSecureContext), true);
  return page;
}

async function stop() {
  if (!app) return;
  const closing = app;
  try { await assertHidden(); }
  finally { app = undefined; await closing.close(); }
}

try {
  let page = await start();
  // 从实际解压后的 app.asar 解析模块，确保交付 EXE 含可加载的原生依赖，不能借用开发目录。
  const native = await app.evaluate(({ app }) => {
    const path = require('node:path');
    const req = require('node:module').createRequire(path.join(app.getAppPath(), 'package.json'));
    const steam = req('steamworks.js'), koffi = req('koffi');
    const nativeRoot = path.dirname(req.resolve('steamworks.js')).replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
    const dll = koffi.load(path.join(nativeRoot, 'dist/win64/steam_api64.dll'));
    const signatures = [
      'void* SteamAPI_SteamMatchmaking_v009()', 'void* SteamAPI_SteamNetworking_v006()',
      'void SteamAPI_ISteamMatchmaking_AddRequestLobbyListStringFilter(void*, const char*, const char*, int)',
      'void SteamAPI_ISteamMatchmaking_AddRequestLobbyListDistanceFilter(void*, int)',
      'bool SteamAPI_ISteamNetworking_CloseP2PSessionWithUser(void*, uint64_t)',
    ];
    for (const signature of signatures) dll.func(signature);
    dll.unload();
    return { steamInit: typeof steam.init, koffi: koffi.version, exports: signatures.length, packagedPath: nativeRoot };
  });
  assert.equal(native.steamInit, 'function');
  assert.equal(native.exports, 5);
  assert.ok(native.packagedPath.includes('app.asar.unpacked'));
  await click(page, '多人模式');
  const status = await page.evaluate(() => window.steamCoop.status());
  assert.equal(status.appId, 480);
  if (!status.available) await expect(page.getByText('Steam 未就绪', { exact: false })).toBeVisible();
  const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true })).toPNG().toString('base64'));
  await writeFile(path.join(evidence, 'steam-status.png'), Buffer.from(png, 'base64'));
  await click(page, '返回首页');
  await click(page, '游戏设置');
  await page.getByRole('slider', { name: '总音量' }).evaluate(input => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '37');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('.volume-control b')).toContainText('37%');
  await click(page, '返回哨站');
  await app.context().setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: '进入哨站' })).toBeEnabled();
  await stop();
  assert.ok((await stat(path.join(portableDir, 'Undead Survivor Data', 'Browser', 'Local Storage'))).isDirectory());

  const movedDir = path.join(evidence, '搬迁后');
  for (const dir of [portableDir, movedDir]) assert.ok(path.resolve(dir).startsWith(`${evidence}${path.sep}`));
  await renameAfterUnlock(portableDir, movedDir);
  portableDir = movedDir;
  page = await start();
  await click(page, '游戏设置');
  await expect(page.getByRole('slider', { name: '总音量' })).toHaveValue('37');
  await stop();
  assert.deepEqual(errors, []);
  assert.deepEqual([...requests].filter(url => !url.startsWith('undead://game/')), []);
  const result = { version, source, bytes: (await stat(source)).size,
    sha256: createHash('sha256').update(await readFile(source)).digest('hex'), silent: true,
    native, appId: status.appId, steamAvailable: status.available, movedDataPersists: true, errors,
    checks: ['actual portable startup and clean exit twice', 'hidden, unfocused, non-focusable and muted',
      'packaged Steam addon and Koffi native DLL bindings', 'multiplayer bridge and Steam status',
      'offline resource loading', 'isolated renderer', 'Chinese paths and settings after relocation'],
    note: '未执行两台电脑、两个 Steam 账号之间的实际联网验收；战斗使用独立的无界面端到端测试。' };
  await writeFile(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, evidence }, null, 2));
} catch (error) {
  try { await stop(); } catch (cleanup) { error.cause = cleanup; }
  throw error;
} finally { if (app) await stop(); }
