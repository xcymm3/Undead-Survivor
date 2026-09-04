import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const { SteamRooms } = createRequire(import.meta.url)('../../desktop/steam.cjs');

// 真实 SteamRooms 协议运行于可控 SDK 替身；不声称连接了 Steam 服务。
function network() {
  const members = [111n];
  const data: Record<string, string> = {};
  const lobby = { id: 999n, getData: (key: string) => data[key], setData: (key: string, value: string) => { data[key] = value; return true; },
    mergeFullData: (next: Record<string, string>) => { Object.assign(data, next); return true; },
    getMembers: () => members.map(steamId64 => ({ steamId64 })), getMemberCount: () => BigInt(members.length),
    getOwner: () => ({ steamId64: members[0] }), setJoinable: vi.fn(() => true), leave: vi.fn() };
  const queues = new Map<string, { data: Buffer; steamId: { steamId64: bigint } }[]>([['111', []], ['222', []]]);
  const events: Record<string, any[]> = { '111': [], '222': [] };
  const services = ['111', '222'].map(id => {
    const queue = queues.get(id)!;
    const client = { localplayer: { getSteamId: () => ({ steamId64: BigInt(id) }), getName: () => id },
      callback: { register: vi.fn(() => ({ disconnect: vi.fn() })) },
      matchmaking: { createLobby: vi.fn(async () => lobby), getLobbies: vi.fn(async () => [lobby]), joinLobby: vi.fn(async () => { members.push(BigInt(id)); return lobby; }) },
      networking: { acceptP2PSession: vi.fn(), sendP2PPacket: vi.fn((peer: bigint, _mode: number, data: Buffer) => { queues.get(String(peer))!.push({ data, steamId: { steamId64: BigInt(id) } }); return true; }),
        isP2PPacketAvailable: () => queue[0]?.data.length ?? 0, readP2PPacket: () => queue.shift()! } };
    const native = { filter: vi.fn(), close: vi.fn() };
    return new SteamRooms(client, native, (event: unknown) => events[id].push(event));
  });
  return { host: services[0], guest: services[1], events, members, lobby, queues };
}
const dispose: (() => void)[] = [];
afterEach(() => { dispose.splice(0).forEach(fn => fn()); vi.useRealTimers(); });
async function setup(join = true) {
  vi.useFakeTimers(); const n = network(); dispose.push(() => { n.host.dispose(); n.guest.dispose(); });
  await n.host.create('合作哨站'); if (join) await n.guest.join('999'); return n;
}
describe('Steam 房间与 P2P 协议', () => {
  it('创建两人公开房间、过滤共享 Spacewar 大厅、排除已满和不兼容房间', async () => {
    const { host, guest, lobby } = await setup(false);
    expect(host.client.matchmaking.createLobby).toHaveBeenCalledWith(2, 2);
    expect((await guest.search())[0].name).toBe('合作哨站');
    expect(guest.native.filter).toHaveBeenCalledWith('xcymm3.undead-survivor', 'coop-v1');
    await guest.join('999'); expect(await guest.search()).toEqual([]);
    guest.leave(); lobby.setData('protocol', 'old');
    await expect(guest.join('999')).rejects.toThrow('不兼容');
  });
  it('必须两人到齐且由房主发起，通过双向握手同时开局', async () => {
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
      queues.get('111')!.push({ steamId: { steamId64: BigInt(from) }, data: Buffer.from(JSON.stringify({ game, version: 'coop-v1', room: '999', type: 'data', session, payload: { health: 0 } })) });
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
