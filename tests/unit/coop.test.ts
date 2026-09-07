import { describe, expect, it } from 'vitest';
import { CoopSession } from '../../src/multiplayer/CoopSession';
import { validCommand, validWorld, type Match, type WorldState } from '../../src/multiplayer/types';
import { Encounter } from '../../src/game/encounter';
import { Navigation } from '../../src/game/navigation';
import { ATTACK, SURVIVAL } from '../../src/game/config';

const members = [{ id: '111', name: '房主' }, { id: '222', name: '队友' }];
const match: Match = { session: 'test-session', host: '111', local: '111', members };
const nav = new Navigation([], true);
function pair() {
  const a = new Encounter(), b = new Encounter(); a.reset('survival', 'hard'); b.reset('survival', 'hard');
  const packets: unknown[] = [];
  const host = new CoopSession(match, a, nav, data => packets.push(structuredClone(data)));
  const guest = new CoopSession({ ...match, local: '222' }, b, nav, data => host.receive('222', data));
  return { host, guest, a, b, packets };
}
describe('2～4 人房主权威模拟', () => {
  it('外貌选择由房主纳入原有世界快照', () => {
    const { host, guest, packets } = pair();
    guest.local.appearance = { character: 'worker-female', primary: 4, accent: 2 };
    guest.announceAppearance();
    expect(host.remote.appearance).toEqual(guest.local.appearance);
    host.broadcast(0, true);
    const world = packets[0] as WorldState;
    expect(world.players.find(player => player.id === '222')?.appearance).toEqual(guest.local.appearance);
  });

  it('开局外貌包丢失后保留本机选择，重传直到房主快照确认', () => {
    const { host, packets } = pair(), outgoing: unknown[] = [];
    const encounter = new Encounter(); encounter.reset('survival', 'hard');
    const selected = { character: 'worker-female' as const, primary: 4, accent: 2 };
    const guest = new CoopSession({ ...match, local: '222' }, encounter, nav, data => outgoing.push(structuredClone(data)), selected);
    guest.announceAppearance(); outgoing.length = 0; // 模拟首包在房主准备完成前丢失。
    host.broadcast(0, true); guest.receive('111', packets[0]);
    expect(guest.local.appearance).toEqual(selected);
    guest.sendInput(new Set(), 0, 0, 0, .5);
    expect(outgoing.filter(data => (data as { type: string }).type === 'appearance')).toHaveLength(0);
    guest.sendInput(new Set(), 0, 0, 0, .5);
    const retry = outgoing.filter(data => (data as { type: string }).type === 'appearance');
    expect(retry).toHaveLength(1);
    host.receive('222', retry[0]); expect(host.remote.appearance).toEqual(selected);
    host.broadcast(0, true); guest.receive('111', packets[1]);
    outgoing.length = 0; guest.sendInput(new Set(), 0, 0, 0, 2);
    expect(outgoing.filter(data => (data as { type: string }).type === 'appearance')).toHaveLength(0);
  });

  it('只接受队友输入，拒绝伪造位置、非法数值、重复与倒序输入', () => {
    const { host } = pair();
    expect(validCommand({ type: 'input', seq: 1, keys: ['Teleport'], yaw: 0, pitch: 0, jump: 0 })).toBe(false);
    expect(validCommand({ type: 'fire', seq: 1, yaw: Infinity, pitch: 0 })).toBe(false);
    host.receive('intruder', { type: 'input', seq: 1, keys: ['KeyW'], yaw: 0, pitch: 0, jump: 0 });
    host.receive('222', { type: 'position', seq: 1, x: 20, health: 999 });
    expect(host.keys.size).toBe(0); expect(host.remote.x).toBe(3);
    host.receive('222', { type: 'input', seq: 2, keys: ['KeyW'], yaw: 0, pitch: 0, jump: 0 });
    host.receive('222', { type: 'input', seq: 1, keys: ['KeyS'], yaw: 0, pitch: 0, jump: 0 });
    host.advanceRemote(.1, nav, () => {});
    expect(host.remote.z).toBeCloseTo(8.58); expect(host.remote.health).toBe(100);
    host.lastInputAt = performance.now() - 600;
    host.advanceRemote(.1, nav, () => {}); expect(host.remote.z).toBeCloseTo(8.58);
  });
  it('空格由房主计算跳跃，落水只扣对应玩家10血并同步传送', () => {
    const { host, guest, a, packets } = pair();
    host.receive('222', { type: 'input', seq: 1, keys: [], yaw: 0, pitch: 0, jump: 1 });
    host.advanceRemote(.1, nav, () => {}); expect(host.remote.height).toBeGreaterThan(.5);
    const velocity = host.remoteMotion.velocity;
    host.receive('222', { type: 'input', seq: 2, keys: [], yaw: 0, pitch: 0, jump: 2 });
    host.advanceRemote(.1, nav, () => {}); expect(host.remoteMotion.velocity).toBeLessThan(velocity);
    host.remoteMotion.reset(); host.remote.x = 0; host.remote.z = -17;
    a.update(.05, () => null, step => host.advanceRemote(step, nav, () => {}));
    expect(host.remote.health).toBe(90); expect(a.failed).toBe(false);
    expect(host.remote.x).toBe(3); expect(host.remote.z).toBe(9); expect(host.remote.height).toBe(0);
    host.broadcast(.1, true); guest.receive('111', packets.at(-1));
    expect(guest.local.health).toBe(90); expect(guest.encounter.player).toEqual({ x: 3, z: 9 });
    expect(guest.consumeRevival()).toBe(true); expect(guest.consumeRevival()).toBe(false);
    host.remote.health = 0; host.local.health = 0; a.update(.05, () => null); expect(a.failed).toBe(true);
  });
  it('僵尸先挥臂再扣对应玩家血量，目标死亡后追击另一个存活玩家', () => {
    const { host, a } = pair(); host.local.health = 10;
    a.zombies.push({ id: 99, x: host.local.x, z: host.local.z - SURVIVAL.contactRadius, kind: 'normal', health: 100, armorHealth: 0, maxHealth: 100, downTime: 0, bornAt: 0 });
    a.update(.1, () => null); expect(a.zombies[0].attacking).toBe(true); expect(host.local.health).toBe(10);
    a.update(ATTACK.windup - .1, () => null);
    expect(host.local.health).toBe(0); expect(host.remote.health).toBe(100); expect(a.failed).toBe(false);
    a.update(.1, () => null); expect(a.zombies[0].attackTarget).toBe('222');
    expect(a.zombies[0].x).toBeGreaterThan(host.local.x);
    host.remote.health = 10; a.zombies[0].x = host.remote.x; a.zombies[0].z = host.remote.z - SURVIVAL.contactRadius;
    a.update(.4, () => null); expect(host.remote.health).toBe(0); expect(a.failed).toBe(true);
  });
  it('房主同步清波、升波、伤害与全员死亡，客户端拒绝过期快照', () => {
    const { host, guest, a, b, packets } = pair();
    a.update(10, () => ({ x: 18, z: -42 }));
    for (const z of a.zombies) a.hit(z.id, true, 1000);
    a.update(.05, () => null); host.broadcast(0, true);
    const first = packets[0] as WorldState; expect(validWorld(first, members)).toBe(true);
    expect(first.inputs).toEqual([{ id: '222', ack: -1, keys: [] }]);
    guest.receive('111', first); expect(b.kills).toBe(9); expect(b.wavesCleared).toBe(1);
    a.update(5, () => null); host.local.health = 0; host.remote.health = 0; a.update(.05, () => null);
    host.broadcast(0, true); guest.receive('111', packets[1]); guest.receive('111', first);
    expect(b.wave).toBe(2); expect(b.failed).toBe(true); expect(guest.players.every(p => p.health === 0)).toBe(true);
    expect(validWorld({ ...first, players: [first.players[0], first.players[0]] }, members)).toBe(false);
    expect(validWorld({ ...first, intermission: -1 }, members)).toBe(false);
    expect(validWorld({ ...first, inputs: [{ id: '222', ack: 0, keys: ['Teleport'] }] }, members)).toBe(false);
    const football = { id: 999, kind: 'football' as const, x: 0, z: -10, health: 4500, bodyHealth: 2500,
      armorHealth: 2000, maxHealth: 4500, downTime: 0, bornAt: 0 };
    expect(validWorld({ ...first, zombies: [football] }, members)).toBe(true);
    expect(validWorld({ ...first, zombies: [{ ...football, health: 4501, bodyHealth: 2501 }] }, members)).toBe(false);
    const giant = { ...football, kind: 'giant', health: 6000, bodyHealth: 6000, armorHealth: 0, maxHealth: 6000 };
    expect(validWorld({ ...first, zombies: [giant] }, members)).toBe(true);
    expect(validWorld({ ...first, zombies: [{ ...giant, health: 6001, bodyHealth: 6001 }] }, members)).toBe(false);
  });
  it('队员在快照之间连续插值僵尸位置与朝向', () => {
    const { guest, b } = pair();
    const base: WorldState = { type: 'world', seq: 1, inputs: [{ id: '222', ack: 0, keys: [] }], players: guest.players.map(p => ({ ...p })),
      zombies: [{ id: 7, kind: 'normal', x: 0, z: -10, health: 100, armorHealth: 0, maxHealth: 100, downTime: 0, bornAt: 0, heading: 3 }],
      wave: 1, wavesCleared: 0, waveSpawned: 1, totalSpawned: 1, intermission: 0, elapsed: 1, kills: 0, failed: false };
    guest.receive('111', base);
    guest.receive('111', { ...base, seq: 2, elapsed: 1.1, zombies: [{ ...base.zombies[0], x: 1, z: -11, heading: -3 }] });
    expect(b.zombies[0]).toMatchObject({ x: 0, z: -10, heading: 3 });
    guest.smoothWorld(.05);
    expect(b.zombies[0].x).toBeGreaterThan(0); expect(b.zombies[0].x).toBeLessThan(1);
    expect(Math.abs(b.zombies[0].heading! - 3)).toBeLessThan(.25);
    guest.smoothWorld(.1); expect(b.zombies[0]).toMatchObject({ x: 1, z: -11 });
  });
  it('常规尸群以十五赫兹同步并压缩坐标精度，大尸群自动降到十赫兹', () => {
    const { host, a, packets } = pair(); host.local.x = 1.23456;
    host.broadcast(.05); expect(packets).toHaveLength(0);
    host.broadcast(.017); expect(packets).toHaveLength(1);
    expect((packets[0] as WorldState).players[0].x).toBe(1.235);
    a.zombies = Array.from({ length: 97 }, (_, id) => ({ id, kind: 'normal' as const, x: id / 7, z: -id / 9,
      health: 100, armorHealth: 0, maxHealth: 100, downTime: 0, bornAt: 0 }));
    host.broadcast(.08); expect(packets).toHaveLength(1);
    host.broadcast(.02); expect(packets).toHaveLength(2);
  });
  it('死亡队友的射击指令无法造成伤害', () => {
    const { host, guest } = pair(); let fired = 0;
    guest.command({ type: 'fire', yaw: 0, pitch: 0 }); host.advanceRemote(.05, nav, () => { fired++; });
    expect(fired).toBe(1); host.remote.health = 0;
    guest.command({ type: 'fire', yaw: 0, pitch: 0 }); host.advanceRemote(.05, nav, () => { fired++; });
    expect(fired).toBe(1);
  });
  it('连发包提前到达时等待冷却，不丢枪、不突破原武器射速', () => {
    const { host, guest } = pair();
    for (let i = 0; i < 3; i++) guest.command({ type: 'fire', yaw: 0, pitch: 0 });
    const shoot = () => { host.remoteArsenal.fire(); };
    host.advanceRemote(.01, nav, shoot); expect(host.remoteArsenal.shots).toBe(1);
    host.advanceRemote(.01, nav, shoot); expect(host.remoteArsenal.shots).toBe(1);
    host.advanceRemote(.2, nav, shoot); expect(host.remoteArsenal.shots).toBe(2);
    host.advanceRemote(.2, nav, shoot); expect(host.remoteArsenal.shots).toBe(3);
  });
  it('不可靠输入越过可靠操作时分别判重，避免丢失开枪指令', () => {
    const { host } = pair(); let fired = 0;
    host.receive('222', { type: 'input', seq: 5, keys: ['KeyW'], yaw: 0, pitch: 0, jump: 0 });
    host.receive('222', { type: 'fire', seq: 4, yaw: 0, pitch: 0 });
    host.advanceRemote(.05, nav, () => { fired++; });
    expect(fired).toBe(1); expect(host.keys.has('KeyW')).toBe(true);
    host.receive('222', { type: 'fire', seq: 4, yaw: 1, pitch: 0 });
    host.advanceRemote(.2, nav, () => { fired++; }); expect(fired).toBe(1);
  });
  it('延迟射击按开枪时方向判定，但不能覆盖玩家最新的转向与移动方向', () => {
    const { host, guest } = pair(); const shotAngles: number[] = [];
    const shoot = (pawn: { yaw: number }) => { if (host.remoteArsenal.fire()) shotAngles.push(pawn.yaw); };
    guest.command({ type: 'fire', yaw: 0, pitch: 0 }); host.advanceRemote(.01, nav, shoot);
    guest.command({ type: 'fire', yaw: .1, pitch: .2 });
    guest.sendInput(new Set(['KeyW']), Math.PI / 2, 0, 0, .1);
    host.advanceRemote(.2, nav, shoot);
    expect(shotAngles).toEqual([0, .1]); expect(host.remote.yaw).toBe(Math.PI / 2); expect(host.remote.pitch).toBe(0);
    const x = host.remote.x, z = host.remote.z;
    host.advanceRemote(.1, nav, shoot);
    expect(host.remote.x).toBeLessThan(x); expect(host.remote.z).toBeCloseTo(z);
  });
  it('三名队员使用相同序号时仍分别处理输入与射击', () => {
    const squad = [{ id: '111', name: '房主' }, { id: '222', name: '队员甲' }, { id: '333', name: '队员乙' }, { id: '444', name: '队员丙' }];
    const encounter = new Encounter(); encounter.reset('survival', 'hard');
    const packets: unknown[] = [];
    const host = new CoopSession({ session: 'four', host: '111', local: '111', members: squad }, encounter, nav, packet => packets.push(packet));
    const before = new Map(host.remotes.map(player => [player.id, player.z]));
    for (const player of host.remotes) host.receive(player.id, { type: 'input', seq: 1, keys: ['KeyW'], yaw: 0, pitch: 0, jump: 0 });
    host.advanceRemotes(.1, nav, () => {});
    for (const player of host.remotes) expect(player.z).toBeLessThan(before.get(player.id)!);
    for (const player of host.remotes) host.receive(player.id, { type: 'fire', seq: 2, yaw: 0, pitch: 0 });
    const fired: string[] = [];
    host.advanceRemotes(.01, nav, (player, arsenal) => { if (arsenal.fire()) fired.push(player.id); });
    expect(fired.sort()).toEqual(['222', '333', '444']);
    host.broadcast(0, true);
    expect(validWorld(packets[0], squad)).toBe(true);
    expect((packets[0] as WorldState).inputs.map(input => input.id).sort()).toEqual(['222', '333', '444']);
  });
  it('清完一波后让阵亡玩家满血回到安全出生点并同步复活', () => {
    const { host, guest, a, packets } = pair();
    host.remote.health = 0; host.broadcast(0, true); guest.receive('111', packets.shift());
    expect(guest.local.health).toBe(0);
    a.update(10, () => ({ x: 18, z: -42 }));
    for (const zombie of a.zombies) a.hit(zombie.id, true, 1000);
    a.update(.05, () => null); expect(a.wavesCleared).toBe(1);
    host.reviveAll(); host.broadcast(0, true); guest.receive('111', packets.shift());
    expect(host.players.every(player => player.health === 100)).toBe(true);
    expect(guest.local).toMatchObject({ health: 100, x: 3, z: 9 });
    expect(guest.consumeRevival()).toBe(true);
  });
});

it('护甲命中音色随权威反馈传给射击者，拒绝伪造来源与未知材质', () => {
  const { host, guest, packets } = pair();
  host.sendHit('222', true, true, true, 'bucket');
  guest.receive('333', packets[0]); expect(guest.feedback).toHaveLength(0);
  guest.receive('111', packets[0]);
  expect(guest.feedback[0]).toEqual({ head: true, killed: true, armorBroken: true, armorKind: 'bucket' });
  guest.receive('111', { ...(packets[0] as object), armorKind: 'untrusted' });
  expect(guest.feedback[1].armorKind).toBeUndefined();
});
