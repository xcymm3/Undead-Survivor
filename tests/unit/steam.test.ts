import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const { SteamRooms } = createRequire(import.meta.url)('../../desktop/steam.cjs');

// 真实 SteamRooms 协议运行于可控 SDK 替身；不声称连接了 Steam 服务。
function network(count = 2) {
  const members = [111n];
  const data: Record<string, string> = {};
  const lobby = { id: 999n, getData: (key: string) => data[key], setData: (key: string, value: string) => { data[key] = value; return true; },
    mergeFullData: (next: Record<string, string>) => { Object.assign(data, next); return true; },
    getMembers: () => members.map(steamId64 => ({ steamId64 })), getMemberCount: () => BigInt(members.length),
    getOwner: () => ({ steamId64: members[0] }), setJoinable: vi.fn(() => true), leave: vi.fn() };
  const ids = ['111', '222', '333', '444'].slice(0, count);
  const queues = new Map<string, { data: Buffer; steamId: { steamId64: bigint }; mode?: number }[]>(ids.map(id => [id, []]));
  const events: Record<string, any[]> = Object.fromEntries(ids.map(id => [id, []]));
  const services = ids.map(id => {
    const queue = queues.get(id)!;
    const client = { localplayer: { getSteamId: () => ({ steamId64: BigInt(id) }), getName: () => id },
      callback: { register: vi.fn(() => ({ disconnect: vi.fn() })) },
      matchmaking: { createLobby: vi.fn(async () => lobby), getLobbies: vi.fn(async () => [lobby]), joinLobby: vi.fn(async () => { members.push(BigInt(id)); return lobby; }) },
      networking: { acceptP2PSession: vi.fn(), sendP2PPacket: vi.fn((peer: bigint, mode: number, data: Buffer) => { queues.get(String(peer))!.push({ data, mode, steamId: { steamId64: BigInt(id) } }); return true; }),
        isP2PPacketAvailable: () => queue[0]?.data.length ?? 0, readP2PPacket: () => queue.shift()! } };
    const native = { filter: vi.fn(), close: vi.fn() };
    return new SteamRooms(client, native, (event: unknown) => events[id].push(event));
  });
  return { host: services[0], guest: services[1], services, events, members, lobby, queues };
}
const dispose: (() => void)[] = [];
afterEach(() => { dispose.splice(0).forEach(fn => fn()); vi.useRealTimers(); });
async function setup(join = true, count = 2) {
  vi.useFakeTimers(); const n = network(count); dispose.push(() => { n.services.forEach(service => service.dispose()); });
  await n.host.create('合作哨站'); if (join) for (const service of n.services.slice(1)) await service.join('999'); return n;
}
describe('Steam 房间与 P2P 协议', () => {
  it('将 Steam 昵称绑定到真实发送者并传入房间和开局名单', async () => {
    const { host, guest, services, events } = await setup(true, 4);
    services.forEach((service, index) => { service.name = ['灰松', '夜航员', '渡鸦', '林间风'][index]; service.sendControl('hello'); });
    services.forEach(service => service.poll());
    expect(host.room().members.map((member: { name: string }) => member.name)).toEqual(['灰松', '夜航员', '渡鸦', '林间风']);
    expect(guest.room().members.map((member: { name: string }) => member.name)).toEqual(['灰松', '夜航员', '渡鸦', '林间风']);
    // 消息体不能伪造协议层昵称；发送端只从自己的 Steam 名称字段写入。
    guest.send({ type: 'hello', playerName: '冒用房主', id: host.id }); host.poll();
    expect(host.room().members[0].name).toBe('灰松'); expect(host.room().members[1].name).toBe('夜航员');
    host.start(); services.slice(1).forEach(service => service.poll()); host.poll(); services.slice(1).forEach(service => service.poll());
    const started = events['111'].find(event => event.type === 'start');
    expect(started.match.members.map((member: { name: string }) => member.name)).toEqual(['灰松', '夜航员', '渡鸦', '林间风']);
  });
  it('创建最多四人的公开房间、过滤共享 Spacewar 大厅、排除已满和不兼容房间', async () => {
    const { host, guest, lobby, members } = await setup(false);
    expect(host.client.matchmaking.createLobby).toHaveBeenCalledWith(2, 4);
    expect((await guest.search())[0].name).toBe('合作哨站');
    expect(guest.native.filter).toHaveBeenCalledWith('xcymm3.undead-survivor', 'coop-v7');
    await guest.join('999'); expect(await guest.search()).toHaveLength(1);
    members.push(333n, 444n); expect(await guest.search()).toEqual([]);
    members.splice(2);
    guest.leave(); lobby.setData('protocol', 'old');
    await expect(guest.join('999')).rejects.toThrow('不兼容');
  });
  it('至少两人且由房主发起，通过双向握手同时开局', async () => {
    const { host, guest, events, lobby } = await setup(false);
    expect(() => host.start()).toThrow(); await guest.join('999'); expect(() => guest.start()).toThrow();
    host.start(); expect(events['111'].some(e => e.type === 'start')).toBe(false);
    guest.poll(); host.poll(); guest.poll();
    const a = events['111'].find(e => e.type === 'start').match, b = events['222'].find(e => e.type === 'start').match;
    expect(a.session).toBe(b.session); expect(a.local).toBe('111'); expect(b.local).toBe('222');
    expect(lobby.setJoinable).toHaveBeenCalledWith(false);
    guest.sendData({ type: 'fire', seq: 1 }); host.poll();
    expect(events['111'].at(-1)).toEqual({ type: 'packet', from: '222', data: { type: 'fire', seq: 1 } });
  });
  it('四名玩家全部完成握手后同时开局', async () => {
    const { host, services, events } = await setup(true, 4);
    host.start();
    services.slice(1).forEach(service => service.poll());
    host.poll();
    expect(events['111'].some(event => event.type === 'start')).toBe(true);
    services.slice(1).forEach(service => service.poll());
    for (const id of ['111', '222', '333', '444']) {
      const started = events[id].find(event => event.type === 'start');
      expect(started.match.members).toHaveLength(4);
      expect(started.match.local).toBe(id);
    }
  });
  it('输入和压缩世界快照不进入可靠积压队列，关键操作保持可靠', async () => {
    const { host, guest, events, queues } = await setup(); host.start(); guest.poll(); host.poll(); guest.poll();
    guest.sendData({ type: 'input', seq: 2, keys: ['KeyW'], yaw: 0, pitch: 0, jump: 0 });
    expect(queues.get('111')!.at(-1)?.mode).toBe(0); host.poll();
    guest.sendData({ type: 'reload', seq: 3, index: 0 });
    expect(queues.get('111')!.at(-1)?.mode).toBe(2); host.poll();
    const world = { type: 'world', seq: 9, inputs: [{ id: '222', ack: 2, keys: ['KeyW'] }], players: [],
      zombies: Array.from({ length: 80 }, (_, id) => ({ id, x: id % 20, z: -id / 3, health: 100, armorHealth: 0 })),
      wave: 8, wavesCleared: 7, waveSpawned: 51, totalSpawned: 180, intermission: 0, elapsed: 90, kills: 129, failed: false };
    guest.sendData(world);
    expect(queues.get('111')!.length).toBeGreaterThan(0);
    expect(queues.get('111')!.every(packet => packet.mode === 0 && packet.data.length <= 1150)).toBe(true);
    host.poll();
    expect(events['111'].at(-1)).toEqual({ type: 'packet', from: '222', data: JSON.parse(JSON.stringify(world)) });
  });
  it('搜索尚未加入的大厅时不读取受限的成员 ID 或房主信息', async () => {
    const { guest, lobby } = await setup(false);
    vi.spyOn(lobby, 'getMembers').mockImplementation(() => { throw Error('尚未加入大厅'); });
    vi.spyOn(lobby, 'getOwner').mockImplementation(() => { throw Error('尚未加入大厅'); });
    expect(await guest.search()).toMatchObject([{ id: '999', name: '合作哨站', memberCount: 1, members: [] }]);
  });
  it('拒绝非成员、旧对局和其他游戏数据包', async () => {
    const { host, guest, events, queues } = await setup(); host.start(); guest.poll(); host.poll(); guest.poll();
    const baseline = events['111'].length;
    for (const [from, game, session] of [['333', 'xcymm3.undead-survivor', host.match.session], ['222', 'another-game', host.match.session], ['222', 'xcymm3.undead-survivor', 'old-session']]) {
      queues.get('111')!.push({ steamId: { steamId64: BigInt(from) }, data: Buffer.from(JSON.stringify({ game, version: 'coop-v6', room: '999', type: 'data', session, payload: { health: 0 } })) });
    }
    host.poll(); expect(events['111']).toHaveLength(baseline);
  });
  it('对局中退出或连接超时终止房间，清理 P2P 会话', async () => {
    const { host, guest, events } = await setup(); host.start(); guest.poll(); host.poll(); guest.poll();
    guest.leave(); host.poll(); expect(host.lobby).toBeNull();
    expect(events['111'].at(-1).type).toBe('left'); expect(host.native.close).toHaveBeenCalledWith(222n);
  });
  it('握手等待超时返回大厅，不留下假开局', async () => {
    const { host, events } = await setup(); host.start();
    vi.setSystemTime(Date.now() + 16000); host.refresh();
    expect(host.pending).toBeNull(); expect(host.match).toBeNull(); expect(events['111'].at(-1).message).toContain('超时');
  });
  it('Steam 突然不可用也能清空本地状态', async () => {
    const { host } = await setup(); host.lobby.leave = () => { throw Error('Steam exited'); };
    expect(() => host.abort('连接中断')).not.toThrow(); expect(host.lobby).toBeNull();
  });
});
