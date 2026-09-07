import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// 只采集界面截图，不运行测试。联机房间是本地展示数据，不连接 Steam。
const output = path.resolve('test-results/bloom');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const notes = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  const local = { id: '76561198000000001', name: '灰松' };
  const teammates = [{ id: '76561198000000002', name: '夜航员' }, { id: '76561198000000003', name: '渡鸦' }];
  let room = null;
  const handlers = new Set();
  const status = () => ({ available: true, ...local, appId: 480, message: '', room });
  const publish = () => handlers.forEach(fn => fn({ type: 'status', status: status() }));
  window.steamCoop = {
    status: async () => status(),
    onEvent: fn => { handlers.add(fn); return () => handlers.delete(fn); },
    create: async name => { room = { id: '109775241903862017', name, owner: local.id, members: [local, ...teammates], playing: false }; publish(); return room; },
    search: async () => [{ id: '109775241903862018', name: '河岸集合', owner: '', members: [], memberCount: 2, playing: false }, { id: '109775241903862019', name: '再守十波', owner: '', members: [], memberCount: 3, playing: false }],
    join: async id => { room = { id, name: '河岸集合', owner: local.id, members: [local, ...teammates], playing: false }; publish(); return room; },
    leave: async () => { room = null; publish(); }, start: async () => {}, send: () => {},
  };
});
const shot = async (name) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  notes.push({ name, ...await page.evaluate(() => ({ width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth, dialogs: [...document.querySelectorAll('dialog[open], .multiplayer-panel')].map(el => ({ width: el.getBoundingClientRect().width, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })) })) });
  await page.screenshot({ path: path.join(output, `${name}.png`) });
};
try {
  await page.goto('http://127.0.0.1:5178/');
  await page.waitForFunction(() => window.__undeadTower?.snapshot().weaponAnimation.loaded === true);
  await shot('main');
  await page.setViewportSize({ width: 1280, height: 800 }); await shot('main-1280');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '游戏设置', exact: true }).click(); await shot('settings');
  await page.getByRole('button', { name: '关闭设置' }).click();
  await page.getByRole('button', { name: '多人模式', exact: false }).click();
  await page.getByRole('button', { name: '搜索房间', exact: false }).click(); await shot('lobby');
  await page.getByRole('button', { name: '创建房间', exact: false }).click(); await shot('room');
  await page.getByRole('button', { name: '离开并返回首页' }).click();
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 }); await shot(`main-${width}`);
    await page.getByRole('button', { name: '游戏设置', exact: true }).click(); await shot(`settings-${width}`);
    await page.getByRole('button', { name: '关闭设置' }).click();
    await page.getByRole('button', { name: '多人模式', exact: false }).click();
    await page.getByRole('button', { name: '创建房间', exact: false }).click(); await shot(`room-${width}`);
    await page.getByRole('button', { name: '离开并返回首页' }).click();
  }
  await writeFile(path.join(output, 'capture-notes.json'), JSON.stringify({ notes, errors, roomData: 'local demonstration fixture; not a Steam connectivity test' }, null, 2));
  console.log(JSON.stringify({ output, notes, errors }, null, 2));
} finally { await browser.close(); }
