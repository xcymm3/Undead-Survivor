import { expect, test, type Page } from '@playwright/test';
import type { Room, SteamEvent, SteamStatus } from '../../src/multiplayer/types';
import { capture, lookAt, snapshot } from './controls';
import { LEADERBOARD_KEY } from '../../src/game/leaderboard';
import { WEAPONS } from '../../src/game/weapons';

test('双端房间开局、双方射击清波、一人观战与全员死亡结算', async ({ browser }) => {
  test.setTimeout(150000);
  const contexts = [await browser.newContext({ viewport: { width: 1440, height: 900 } }), await browser.newContext({ viewport: { width: 1440, height: 900 } })];
  const pages = [await contexts[0].newPage(), await contexts[1].newPage()];
  const errors: string[] = [];
  const ids = ['111', '222'];
  let room: Room | null = null;
  let closing = false;
  const deliver = (i: number, event: SteamEvent) => pages[i].evaluate(e => (window as any).__testSteamEvent(e), event);
  const status = (i: number): SteamStatus => ({ available: true, id: ids[i], name: i ? '队友' : '房主', appId: 480, message: '本地测试通道', room: room?.members.some(m => m.id === ids[i]) ? room : null });
  const publish = () => Promise.all(pages.map((_, i) => deliver(i, { type: 'status', status: status(i) })));
  try {
    for (let i = 0; i < 2; i++) {
      pages[i].on('pageerror', e => errors.push(e.message));
      await pages[i].exposeFunction('__testSteamCall', async (method: string, value: unknown) => {
        if (closing) return;
        if (method === 'status') return status(i);
        if (method === 'create') { room = { id: '999', name: String(value), owner: ids[i], members: [{ id: ids[i], name: status(i).name }], playing: false }; await publish(); return room; }
        if (method === 'search') return room && !room.playing && room.members.length < 2 ? [room] : [];
        if (method === 'join') { room!.members.push({ id: ids[i], name: status(i).name }); await publish(); return room; }
        if (method === 'start') {
          room!.playing = true;
          await Promise.all(pages.map((_, index) => deliver(index, { type: 'start', match: { session: 'local-test', host: '111', local: ids[index], members: room!.members } })));
        }
        if (method === 'send') {
          const packet = value as { type?: string; seq?: number };
          // 模拟公网往返延迟和快照抖动，验证队员不会因迟到的权威坐标被反复拉回。
          const latency = packet.type === 'world' ? 120 + ((packet.seq ?? 0) % 3) * 35 : packet.type === 'input' ? 80 : 30;
          setTimeout(() => { if (!closing) void deliver(1 - i, { type: 'packet', from: ids[i], data: value }).catch(() => {}); }, latency);
        }
        if (method === 'leave') { room = null; await publish(); }
      });
      await pages[i].addInitScript(() => {
        const listeners = new Set<(e: SteamEvent) => void>();
        const call = (method: string, value?: unknown) => (window as any).__testSteamCall(method, value);
        (window as any).__testSteamEvent = (event: SteamEvent) => listeners.forEach(fn => fn(event));
        window.steamCoop = { status: () => call('status'), create: name => call('create', name), search: () => call('search'), join: id => call('join', id),
          leave: () => call('leave'), start: () => call('start'), send: data => { void call('send', data); }, onEvent: fn => { listeners.add(fn); return () => { listeners.delete(fn); }; } };
      });
      await pages[i].goto('/');
      await expect(pages[i].getByRole('button', { name: '进入哨站' })).toBeEnabled();
      await pages[i].getByRole('button', { name: '多人模式' }).click();
    }
    const [host, guest] = pages;
    await host.getByRole('button', { name: '创建房间' }).click();
    await expect(host.getByRole('button', { name: '开始双人游戏' })).toBeDisabled();
    await guest.getByRole('button', { name: '搜索房间' }).click();
    await guest.getByRole('button', { name: '加入房间', exact: true }).click();
    await expect(host.getByText('两人已到齐，可以开始。')).toBeVisible();
    await host.screenshot({ path: 'test-results/coop-room.png' });
    await host.getByRole('button', { name: '开始双人游戏' }).click();
    await expect.poll(async () => (await snapshot(guest)).coop?.players.length).toBe(2);
    async function control(page: Page) {
      // 两个测试客户端共用一个无界面浏览器，先释放另一页的鼠标锁，避免同时争抢。
      for (const other of pages) if (other !== page) {
        await other.evaluate(() => { document.exitPointerLock(); window.dispatchEvent(new Event('blur')); });
        await expect.poll(async () => (await snapshot(other)).pointerLocked).toBe(false);
      }
      await page.bringToFront();
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      if ((await snapshot(page)).phase === 'paused') await page.getByRole('button', { name: '返回战斗' }).click();
      await capture(page);
    }
    await control(guest);
    await guest.keyboard.down('w');
    const movement = await guest.evaluate(async () => {
      const positions: number[] = [], deadline = performance.now() + 900;
      while (performance.now() < deadline) { positions.push(window.__undeadTower!.snapshot().player.z); await new Promise(requestAnimationFrame); }
      return positions;
    });
    await guest.keyboard.up('w');
    expect(movement.at(-1)!).toBeLessThan(movement[0] - 2.5);
    expect(Math.max(...movement.slice(1).map((z, i) => z - movement[i]))).toBeLessThan(.12);
    async function fight(page: Page, killGoal: number) {
      await control(page);
      return page.evaluate(async goal => {
        const canvas = document.querySelector('canvas')!, blocked = new Map<number, number>();
        const deadline = performance.now() + 60000;
        while (performance.now() < deadline) {
          const s = window.__undeadTower!.snapshot();
          if (s.kills >= goal || s.health === 0 || s.phase !== 'playing') return s;
          if (!s.ammo) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
          const target = s.targets.filter(z => z.health > 0 && (blocked.get(z.id) ?? 0) < performance.now())
            .sort((a, b) => Math.hypot(a.x - s.player.x, a.z - s.player.z) - Math.hypot(b.x - s.player.x, b.z - s.player.z))[0];
          if (target && !s.reloading && s.ammo > 0) {
            const dx = target.x - s.cameraPosition[0], dz = target.z - s.cameraPosition[2];
            const height = target.kind === 'bucket' ? 2.21 : target.kind === 'cone' ? 2.4 : 1.83;
            const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(height - s.cameraPosition[1], Math.hypot(dx, dz));
            canvas.dispatchEvent(new PointerEvent('pointermove', { movementX: (s.yaw - yaw) / .0022, movementY: (s.pitch - pitch) / .0022 }));
            canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0 })); window.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
            const after = window.__undeadTower!.snapshot();
            if (after.shots > s.shots && after.lastShot?.hitTarget !== target.id) blocked.set(target.id, performance.now() + 500);
          }
          await new Promise(resolve => setTimeout(resolve, 220));
        }
        return window.__undeadTower!.snapshot();
      }, killGoal);
    }
    expect((await fight(host, 1)).kills).toBeGreaterThanOrEqual(1);
    await control(guest); await lookAt(guest, -2, 1.7, 9);
    await guest.screenshot({ path: 'test-results/coop-partner.png' });
    // Headless Chrome 的独立 context 不一定互相失焦，显式重现窗口切出的浏览器事件。
    await host.evaluate(() => window.dispatchEvent(new Event('blur')));
    const backgroundHost = await snapshot(host);
    const cleared = await fight(guest, 9);
    expect(cleared.kills).toBe(9); expect(cleared.health).toBeGreaterThan(0);
    await expect.poll(async () => (await snapshot(host)).wavesCleared).toBe(1);
    await expect.poll(async () => (await snapshot(guest)).wavesCleared).toBe(1);
    expect((await snapshot(host)).coop!.players[1].shots).toBeGreaterThan(0);
    // 房主在另一个标签页失焦时继续权威模拟，但不继续绘图、也不堆积弹道特效。
    expect((await snapshot(host)).renderCount).toBeLessThanOrEqual(backgroundHost.renderCount + 1);
    expect((await snapshot(host)).effects).toBeLessThanOrEqual(backgroundHost.effects);
    expect(cleared.waterZombies).toEqual([]);
    await guest.screenshot({ path: 'test-results/coop-combat.png' });
    await guest.keyboard.press('r');
    await guest.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect.poll(async () => (await snapshot(guest)).ammo).toBe(30);
    await control(guest); await guest.keyboard.press('3');
    await guest.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect.poll(async () => (await snapshot(guest)).weaponIndex).toBe(2);
    expect((await snapshot(guest)).weaponAnimation.model).toBe(WEAPONS[2].model);
    await control(guest); await lookAt(guest, 2, 1.7, -40); await guest.keyboard.down('w');
    await expect.poll(async () => (await snapshot(guest)).health, { timeout: 15000 }).toBe(0); await guest.keyboard.up('w');
    await expect(guest.getByText('你已阵亡 · 正在观战队友')).toBeVisible();
    expect((await snapshot(host)).health).toBeGreaterThan(0);
    expect((await snapshot(guest)).phase).toBe('playing');
    await guest.screenshot({ path: 'test-results/coop-spectating.png' });
    await guest.evaluate(() => window.dispatchEvent(new Event('blur')));
    await control(host); await lookAt(host, -2, 1.7, -40); await host.keyboard.down('w');
    await expect(host.getByRole('heading', { name: '小队全员阵亡' })).toBeVisible({ timeout: 15000 }); await host.keyboard.up('w');
    // 队员保持在后台，也必须收到结算而非二十秒后误报断线。
    await expect.poll(async () => (await snapshot(guest)).phase).toBe('failed');
    await expect(guest.getByRole('heading', { name: '小队全员阵亡' })).toBeVisible();
    expect((await snapshot(host)).result?.waves).toBe((await snapshot(guest)).result?.waves);
    for (const page of pages) expect(await page.evaluate(key => localStorage.getItem(key), LEADERBOARD_KEY)).toBeNull();
    expect(errors).toEqual([]);
    await guest.screenshot({ path: 'test-results/coop-result.png' });
  } finally { closing = true; for (const context of contexts) await context.close(); }
});

test('浏览器多人入口说明桌面版要求，并可返回单人首页', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '多人模式' }).click();
  await expect(page.getByText('请在桌面版中使用 Steam 联机', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '返回首页', exact: true }).click();
  await expect(page.getByRole('button', { name: '进入哨站' })).toBeEnabled();
});
