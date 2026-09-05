import { expect, test, type Page } from '@playwright/test';
import type { Room, SteamEvent, SteamStatus, WorldState } from '../../src/multiplayer/types';
import { capture, lookAt, snapshot } from './controls';
import { LEADERBOARD_KEY } from '../../src/game/leaderboard';
import { WEAPONS } from '../../src/game/weapons';
import { defaultAppearance } from '../../src/multiplayer/appearance';

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
        if (method === 'search') return room && !room.playing && room.members.length < 4 ? [room] : [];
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
        // 双端共用一块无界面 GPU，使用测试画质避免后处理争抢资源干扰网络时序。
        localStorage.setItem('undead-survivor.graphics', JSON.stringify({ resolutionScale: 0.5, antiAliasing: 'off', shadows: 'off', effects: 'low', viewDistance: 'near', frameLimit: 60, pixelated: false }));
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
    await expect(host.getByRole('button', { name: '开始多人游戏' })).toBeDisabled();
    await guest.getByRole('button', { name: '搜索房间' }).click();
    await guest.getByRole('button', { name: '加入房间', exact: true }).click();
    await expect(host.getByText('已有 2 人，可以开始或继续等待。')).toBeVisible();
    await host.screenshot({ path: 'test-results/coop-room.png' });
    // 联机协议用例固定首波为普通僵尸，避免怪物耐久随机性掩盖网络与观战断言。
    for (const page of pages) await page.evaluate(() => {
      const values = Array<number>(18).fill(.1);
      let index = 0, seed = 31;
      Math.random = () => index < values.length ? values[index++] : ((seed = seed * 48271 % 2147483647) - 1) / 2147483646;
    });
    await host.getByRole('button', { name: '开始多人游戏' }).click();
    await expect.poll(async () => (await snapshot(guest)).coop?.players.length, { timeout: 30000 }).toBe(2);
    async function control(page: Page) {
      // 两个测试客户端共用一个无界面浏览器，先释放另一页的鼠标锁，避免同时争抢。
      for (const other of pages) if (other !== page) {
        await other.evaluate(() => { document.exitPointerLock(); window.dispatchEvent(new Event('blur')); });
        await expect.poll(async () => (await snapshot(other)).pointerLocked).toBe(false);
      }
      await page.bringToFront();
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      if ((await snapshot(page)).phase === 'paused') await page.getByRole('button', { name: /返回(?:战斗|观战)/ }).click();
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
    // 队员至少发出一枪，房主收到并权威处理；清波则由房主完成，避免网络插值让高血量装甲怪的连续瞄准失真。
    await guest.evaluate(() => {
      const canvas = document.querySelector('canvas')!;
      canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0 }));
      window.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
    });
    await expect.poll(async () => (await snapshot(host)).coop!.players[1].shots).toBeGreaterThan(0);
    // Headless Chrome 的独立 context 不一定互相失焦，显式重现窗口切出的浏览器事件。
    await guest.evaluate(() => window.dispatchEvent(new Event('blur')));
    const backgroundGuest = await snapshot(guest);
    const cleared = await fight(host, 9);
    expect(cleared.kills).toBe(9); expect(cleared.health).toBeGreaterThan(0);
    await expect.poll(async () => (await snapshot(host)).wavesCleared).toBe(1);
    await expect.poll(async () => (await snapshot(guest)).wavesCleared).toBe(1);
    expect((await snapshot(host)).coop!.players[1].shots).toBeGreaterThan(0);
    // 队员在另一个标签页失焦时仍接收权威快照，但不继续绘图、也不堆积弹道特效。
    expect((await snapshot(guest)).renderCount).toBeLessThanOrEqual(backgroundGuest.renderCount + 1);
    expect((await snapshot(guest)).effects).toBeLessThanOrEqual(backgroundGuest.effects);
    expect(cleared.waterZombies).toEqual([]);
    await guest.screenshot({ path: 'test-results/coop-combat.png' });
    await control(guest); await guest.keyboard.press('r');
    await guest.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect.poll(async () => (await snapshot(guest)).ammo).toBe(30);
    await control(guest); await guest.keyboard.press('3');
    await guest.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect.poll(async () => (await snapshot(guest)).weaponIndex).toBe(2);
    expect((await snapshot(guest)).weaponAnimation.model).toBe(WEAPONS[2].model);
    await control(guest); await lookAt(guest, 2, 1.7, -40); await guest.keyboard.down('w');
    await expect.poll(async () => (await snapshot(guest)).health, { timeout: 15000 }).toBe(0); await guest.keyboard.up('w');
    await expect(guest.getByText(/你已阵亡 · 正在观战/)).toBeVisible();
    expect((await snapshot(host)).health).toBeGreaterThan(0);
    expect((await snapshot(guest)).phase).toBe('playing');
    await control(host); await host.keyboard.press('2');
    await expect.poll(async () => (await snapshot(host)).weaponIndex).toBe(1);
    await lookAt(host, 7, 2.4, -31);
    await expect.poll(async () => (await snapshot(guest)).coop?.players.find(player => player.id === '111')?.weapon).toBe(1);
    await control(guest);
    const watchedHost = await snapshot(host), spectator = await snapshot(guest);
    expect(spectator.weaponVisible).toBe(true);
    expect(spectator.weaponAnimation.model).toBe(WEAPONS[1].model);
    await expect(guest.getByTestId('weapon-name')).toContainText(WEAPONS[1].label);
    await expect(guest.getByTestId('ammo')).toHaveText(String(WEAPONS[1].capacity));
    expect(spectator.cameraPosition[0]).toBeCloseTo(watchedHost.player.x, 1);
    expect(spectator.cameraPosition[2]).toBeCloseTo(watchedHost.player.z, 1);
    expect(spectator.cameraYaw).toBeCloseTo(watchedHost.yaw, 2);
    expect(spectator.cameraPitch).toBeCloseTo(watchedHost.pitch, 2);
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

test('四人快照支持左键循环观战并在清波后全员复活', async ({ page }) => {
  const members = [{ id: '111', name: '房主' }, { id: '222', name: '本机' }, { id: '333', name: '队员乙' }, { id: '444', name: '队员丙' }];
  await page.addInitScript(({ members }) => {
    localStorage.setItem('undead-survivor.graphics', JSON.stringify({ resolutionScale: 0.5, antiAliasing: 'off', shadows: 'off', effects: 'low', viewDistance: 'near', frameLimit: 60, pixelated: false }));
    const listeners = new Set<(event: SteamEvent) => void>();
    (window as any).__testSteamEvent = (event: SteamEvent) => listeners.forEach(listener => listener(event));
    const room = { id: 'four', name: '四人小队', owner: '111', members, playing: true };
    window.steamCoop = { status: async () => ({ available: true, id: '222', name: '本机', appId: 480, message: '测试', room }), create: async () => room,
      search: async () => [], join: async () => room, leave: async () => {}, start: async () => {}, send: () => {},
      onEvent: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; } };
  }, { members });
  await page.goto('/'); await expect(page.getByRole('button', { name: '进入哨站' })).toBeEnabled();
  await page.evaluate(members => (window as any).__testSteamEvent({ type: 'start', match: { session: 'four-player', host: '111', local: '222', members } }), members);
  await capture(page);
  const players = [
    { ...members[0], x: -8, z: 2, height: 0, yaw: .1, pitch: .05, health: 100, lastDamageAt: -1e6, weapon: 0, shots: 2, ammo: 28, reloading: false, reloadProgress: 1 },
    { ...members[1], x: 3, z: 9, height: 0, yaw: 0, pitch: 0, health: 0, lastDamageAt: 1, weapon: 2, shots: 0, ammo: 12, reloading: false, reloadProgress: 1 },
    { ...members[2], x: 5, z: -3, height: 0, yaw: 1.1, pitch: -.1, health: 70, lastDamageAt: .5, weapon: 1, shots: 4, ammo: 46, reloading: false, reloadProgress: 1 },
    { ...members[3], x: 10, z: -12, height: 0, yaw: -1.2, pitch: .2, health: 40, lastDamageAt: .7, weapon: 4, shots: 1, ammo: 5, reloading: false, reloadProgress: 1 },
  ].map((player, index) => ({ ...player, reloadEmpty: false, appearance: defaultAppearance(index) }));
  const world: WorldState = { type: 'world', seq: 1, inputs: members.slice(1).map(member => ({ id: member.id, ack: 0, keys: [] })), players,
    zombies: [], wave: 1, wavesCleared: 0, waveSpawned: 0, totalSpawned: 0, intermission: 0, elapsed: 1, kills: 0, failed: false };
  await page.evaluate(world => (window as any).__testSteamEvent({ type: 'packet', from: '111', data: world }), world);
  await expect.poll(async () => (await snapshot(page)).partners.every(partner => partner.loaded), { timeout: 15000 }).toBe(true);
  expect((await snapshot(page)).partners.map(partner => partner.appearance).sort()).toEqual(['casual-female:3:0', 'casual-male:2:5', 'soldier-male:0:3']);
  await expect.poll(async () => (await snapshot(page)).health).toBe(0);
  await expect.poll(async () => (await snapshot(page)).coop?.spectating).toBe('111');
  await page.getByTestId('game-canvas').dispatchEvent('pointerdown', { button: 0 });
  await expect.poll(async () => (await snapshot(page)).coop?.spectating).toBe('333');
  expect((await snapshot(page)).cameraPosition[0]).toBeCloseTo(5, 1);
  expect((await snapshot(page)).cameraPosition[2]).toBeCloseTo(-3, 1);
  await page.getByTestId('game-canvas').dispatchEvent('pointerdown', { button: 0 });
  await expect.poll(async () => (await snapshot(page)).coop?.spectating).toBe('444');
  const revivedPlayers = players.map((player, index) => ({ ...player, x: index % 2 ? 3 : -3, z: index < 2 ? 9 : 6.5, height: 0, health: 100, lastDamageAt: -1e6 }));
  const revived: WorldState = { ...world, seq: 2, players: revivedPlayers, waveSpawned: 9, totalSpawned: 9, wavesCleared: 1, intermission: 5, elapsed: 10, kills: 9 };
  await page.evaluate(world => (window as any).__testSteamEvent({ type: 'packet', from: '111', data: world }), revived);
  await expect.poll(async () => (await snapshot(page)).health).toBe(100);
  await expect.poll(async () => (await snapshot(page)).coop?.spectating).toBeNull();
  expect((await snapshot(page)).player).toMatchObject({ x: 3, z: 9 });
  expect((await snapshot(page)).weaponVisible).toBe(true);
});
