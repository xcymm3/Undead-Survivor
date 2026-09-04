import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const project = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const { version } = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'));
const source = path.resolve(process.argv[2] || path.join(project, 'release', `Undead Survivor-${version}.exe`));
const evidence = path.join(project, 'test-results', `portable-${Date.now()}`);
let portableDir = path.join(evidence, '初次运行');
await mkdir(portableDir, { recursive: true });
const filename = path.basename(source);
await copyFile(source, path.join(portableDir, filename));
const errors = [];
const requests = new Set();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function captureMouse(page) {
  await page.bringToFront();
  if (!await page.evaluate(() => Boolean(document.pointerLockElement))) {
    await delay(1200);
    await page.getByTestId('game-canvas').click({ position: { x: 640, y: 360 } });
  }
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
}

async function start() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(path.join(portableDir, filename), [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { cwd: portableDir, env, windowsHide: true, stdio: 'ignore' });
  let launchError;
  child.on('error', error => { launchError = error; });
  let browser;
  try {
    const endpoint = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (launchError) throw launchError;
      if (child.exitCode !== null) throw new Error(`Portable exited before launch: ${child.exitCode}`);
      try { if ((await fetch(`${endpoint}/json/version`)).ok) break; } catch { /* 等待实际 EXE 解压并启动。 */ }
      await delay(250);
    }
    browser = await chromium.connectOverCDP(endpoint, { timeout: 10000 });
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.waitForEvent('page');
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.add(request.url()));
    await page.waitForURL('undead://game/');
    await context.setOffline(true);
    await page.reload();
    await expect(page).toHaveTitle('Undead Survivor');
    await expect(page.getByRole('button', { name: '进入哨站' })).toBeEnabled({ timeout: 20000 });
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    assert.equal(await page.evaluate(() => typeof window.__undeadTower), 'undefined');
    assert.equal(await page.evaluate(() => window.isSecureContext), true);
    return { child, browser, page };
  } catch (error) {
    await stop({ child, browser });
    throw error;
  }
}

async function stop({ child, browser, page }) {
  try { if (page && !page.isClosed()) await page.close(); } catch { /* 关闭期间 CDP 可能先断开。 */ }
  try { await browser?.close(); } catch { /* 进程可能已经退出。 */ }
  for (let i = 0; i < 30 && child.exitCode === null; i++) await delay(100);
  if (child.exitCode === null && child.pid) {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    await once(killer, 'exit');
    throw new Error('Portable did not exit cleanly; stopped only the test process tree');
  }
}

let session;
let record;
try {
  session = await start();
  const { page } = session;
  await page.getByRole('button', { name: '游戏设置' }).click();
  await expect(page.getByRole('slider')).toHaveCount(1);
  await page.getByRole('slider', { name: '总音量' }).fill('37');
  await page.getByRole('button', { name: '返回哨站' }).click();
  console.log('实际 portable EXE 已离线启动；验证练习、开火、装填、暂停与全屏');
  await page.getByRole('button', { name: '进入哨站' }).click();
  await captureMouse(page);
  await expect(page.getByRole('heading', { name: '僵尸练习靶场' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.locator('.terrain-hint')).toContainText('腾空中');
  await expect(page.locator('.terrain-hint')).toContainText('跳跃过河');
  await expect(page.getByTestId('ammo')).toHaveText('30');
  const bounds = await page.locator('canvas').boundingBox();
  await page.mouse.click(bounds.x + bounds.width * 0.55, bounds.y + bounds.height * 0.45);
  await expect(page.getByTestId('ammo')).toHaveText('29');
  const reloadStarted = Date.now();
  await page.keyboard.press('r');
  await expect(page.getByText('正在更换弹匣…')).toBeVisible();
  await expect(page.getByTestId('ammo')).toHaveText('30', { timeout: 4000 });
  const reloadMs = Date.now() - reloadStarted;
  assert.ok(reloadMs < 1400, `Expected fast reload, observed ${reloadMs} ms`);
  const guns = [
    { label: '步枪', capacity: 30 }, { label: 'P90 冲锋枪', capacity: 50 },
    { label: '半自动手枪', capacity: 12 }, { label: '左轮手枪', capacity: 6 },
    { label: '泵动霰弹枪', capacity: 6 }, { label: '栓动狙击枪', capacity: 5 },
  ];
  for (const [index, gun] of guns.entries()) {
    await page.keyboard.press(String(index + 1));
    await expect(page.getByTestId('weapon-name')).toContainText(gun.label);
    await expect(page.locator('.reload-hint')).toHaveText(/R\s*换弹/);
    await expect(page.getByTestId('ammo')).toHaveText(String(gun.capacity).padStart(2, '0'));
    await page.mouse.click(bounds.x + bounds.width * 0.55, bounds.y + bounds.height * 0.45);
    await expect(page.getByTestId('ammo')).toHaveText(String(gun.capacity - 1).padStart(2, '0'));
    await page.keyboard.press('r');
    await expect(page.getByTestId('ammo')).toHaveText(String(gun.capacity).padStart(2, '0'), { timeout: 5000 });
    await expect(page.locator('.reload-hint')).toHaveText(/R\s*换弹/);
    await page.screenshot({ path: path.join(evidence, `portable-weapon-${index + 1}.png`) });
  }
  await page.mouse.wheel(0, 150);
  await expect(page.getByTestId('weapon-name')).toContainText('步枪');
  await expect(page.locator('.reload-hint')).toHaveText(/R\s*换弹/);
  await page.mouse.wheel(0, -150);
  await expect(page.getByTestId('weapon-name')).toContainText('栓动狙击枪');
  await expect(page.locator('.reload-hint')).toHaveText(/R\s*换弹/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '哨站已暂停' })).toBeVisible();
  await page.getByRole('button', { name: '返回主菜单', exact: true }).click();
  await page.getByRole('button', { name: '进入全屏' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.getByRole('button', { name: '退出全屏' }).click();
  await page.getByRole('button', { name: '正式模式' }).click();
  await expect(page.getByRole('group', { name: '选择难度' })).toHaveCount(0);
  await expect(page.locator('.practice-note')).toContainText('困难难度');
  // 在开局前安装观察器，避免截图或 CDP 往返错过特写开头。
  await page.evaluate(() => { window.__portableCinematic = new Promise(resolve => {
    const deadline = performance.now() + 60000;
    let started = null, culprit = null;
    const observe = () => {
      const now = performance.now();
      if (document.querySelector('.breach-review')) {
        started ??= now;
        culprit ??= document.querySelector('[data-testid="breached-zombie"]')?.textContent;
      }
      if (document.querySelector('.result-screen')) {
        resolve({ durationMs: started === null ? 0 : now - started, culprit });
      } else if (now > deadline) resolve({ error: '未在时限内自然失败' });
      else requestAnimationFrame(observe);
    };
    observe();
  }); });
  await page.getByRole('button', { name: '开始坚守' }).click();
  await captureMouse(page);
  await expect(page.getByTestId('wave-number')).toHaveText('第 1 波');
  await expect(page.getByTestId('wave-progress')).toContainText('本波 9 只');
  await expect(page.locator('.horde-status')).toContainText('移速 1.40 m/s');
  await expect(page.locator('.horde-status')).toContainText('铁桶 1', { timeout: 16000 });
  await expect(page.locator('.horde-status')).toContainText('移速 1.40 m/s');
  await page.screenshot({ path: path.join(evidence, 'portable-game.png') });
  console.log('六枪开火、装填、数字键与滚轮切换通过；等待自然失败与两秒特写');
  const cinematic = await page.evaluate(() => window.__portableCinematic);
  assert.equal(cinematic.error, undefined);
  assert.ok(cinematic.durationMs >= 1800 && cinematic.durationMs < 3000, `Unexpected cinematic: ${cinematic.durationMs} ms`);
  assert.ok(cinematic.culprit?.includes('突破者'));
  await expect(page.getByRole('region', { name: '游戏结束' })).toBeVisible();
  await expect(page.locator('.record-notice')).toContainText('已保存');
  await expect(page.getByTestId('personal-record')).toContainText('个人纪录已建立');
  record = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(key => key.startsWith('undead-survivor.leaderboard.waves-') && localStorage.getItem(key) !== '[]');
    return { key, entries: JSON.parse(localStorage.getItem(key)) };
  });
  assert.equal(record.entries.length, 1);
  assert.equal(record.entries[0].difficulty, 'hard');
  assert.equal(record.entries[0].mode, 'survival');
  assert.equal(record.entries[0].waves, 0);
  assert.equal(record.entries[0].wave, 1);
  assert.equal(record.entries[0].cause, 'zombie');
  await expect(page.getByTestId('survival-result')).toHaveText('0 波');
  assert.ok(record.entries[0].duration > 10);
  await page.screenshot({ path: path.join(evidence, 'portable-result.png') });
  await stop(session); session = null;
  assert.ok((await stat(path.join(portableDir, 'Undead Survivor Data', 'Browser', 'Local Storage'))).isDirectory());

  // 移动的目录由本脚本新建，且源和目标都限定在本次测试证据目录内。
  const movedDir = path.join(evidence, '搬迁后');
  assert.ok(path.resolve(portableDir).startsWith(`${evidence}${path.sep}`));
  assert.ok(path.resolve(movedDir).startsWith(`${evidence}${path.sep}`));
  await rename(portableDir, movedDir);
  portableDir = movedDir;
  console.log('首次正常退出；将 EXE 连同数据文件夹搬迁，再次离线启动验证成绩');
  session = await start();
  await session.page.getByRole('button', { name: '游戏设置' }).click();
  await expect(session.page.getByRole('slider', { name: '总音量' })).toHaveValue('37');
  await session.page.getByRole('button', { name: '返回哨站' }).click();
  await session.page.getByRole('button', { name: '查看排行榜' }).click();
  await expect(session.page.getByRole('group', { name: '排行榜难度' })).toHaveCount(0);
  await expect(session.page.getByRole('table')).toBeVisible();
  assert.deepEqual(await session.page.evaluate(key => JSON.parse(localStorage.getItem(key)), record.key), record.entries);
  await session.page.screenshot({ path: path.join(evidence, 'portable-persisted.png') });
  await stop(session); session = null;
  assert.deepEqual(errors, []);
  assert.deepEqual([...requests].filter(url => !url.startsWith('undead://game/')), []);
  await writeFile(path.join(evidence, 'result.json'), JSON.stringify({ version, source, bytes: (await stat(source)).size, offline: true, errors, requests: [...requests], record, reloadMs, cinematic, movedDataPersists: true, checks: ['production WebGL startup', 'no renderer Node API or dev diagnostics', 'six weapons fire and reload', 'digit and wheel switching', 'pause', 'fullscreen', 'hard difficulty, fixed wave quota and first-wave speed', 'early armored zombies', 'natural defeat and two-second culprit cinematic', 'personal record feedback', 'leaderboard saved', 'volume setting persists after relocation', 'portable relocation and relaunch', 'clean exit'] }, null, 2));
  console.log(`Portable 验证通过，证据：${evidence}`);
} catch (error) {
  if (session?.page && !session.page.isClosed()) await session.page.screenshot({ path: path.join(evidence, 'failed.png') }).catch(() => {});
  throw error;
} finally { if (session) await stop(session); }
