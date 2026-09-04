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
describe('双人权威模拟', () => {
  it('只接受队友输入，拒绝伪造位置、非法数值、重复与倒序输入', () => {
    const { host } = pair();
    expect(validCommand({ type: 'input', seq: 1, keys: ['Teleport'], yaw: 0, pitch: 0, jump: 0 })).toBe(false);
    expect(validCommand({ type: 'fire', seq: 1, yaw: Infinity, pitch: 0 })).toBe(false);
    host.receive('intruder', { type: 'input', seq: 1, keys: ['KeyW'], yaw: 0, pitch: 0, jump: 0 });
    host.receive('222', { type: 'position', seq: 1, x: 20, health: 999 });
    expect(host.keys.size).toBe(0); expect(host.remote.x).toBe(2);
    host.receive('222', { type: 'input', seq: 2, keys: ['KeyW'], yaw: 0, pitch: 0, jump: 0 });
    host.receive('222', { type: 'input', seq: 1, keys: ['KeyS'], yaw: 0, pitch: 0, jump: 0 });
    host.advanceRemote(.1, nav, () => {});
    expect(host.remote.z).toBeCloseTo(8.58); expect(host.remote.health).toBe(100);
    host.lastInputAt = performance.now() - 600;
    host.advanceRemote(.1, nav, () => {}); expect(host.remote.z).toBeCloseTo(8.58);
  });
  it('空格由房主计算跳跃，落水只杀死对应玩家', () => {
    const { host, a } = pair();
    host.receive('222', { type: 'input', seq: 1, keys: [], yaw: 0, pitch: 0, jump: 1 });
    host.advanceRemote(.1, nav, () => {}); expect(host.remote.height).toBeGreaterThan(.5);
    const velocity = host.remoteMotion.velocity;
    host.receive('222', { type: 'input', seq: 2, keys: [], yaw: 0, pitch: 0, jump: 2 });
    host.advanceRemote(.1, nav, () => {}); expect(host.remoteMotion.velocity).toBeLessThan(velocity);
    host.remoteMotion.reset(); host.remote.x = 0; host.remote.z = -17;
    a.update(.05, () => null, step => host.advanceRemote(step, nav, () => {}));
    expect(host.remote.health).toBe(0); expect(a.failed).toBe(false);
    host.local.health = 0; a.update(.05, () => null); expect(a.failed).toBe(true);
  });
  it('僵尸先挥臂再扣对应玩家血量，目标死亡后追击另一个存活玩家', () => {
    const { host, a } = pair(); host.local.health = 10;
    a.zombies.push({ id: 99, x: -2, z: 9 - SURVIVAL.contactRadius, kind: 'normal', health: 100, armorHealth: 0, maxHealth: 100, downTime: 0, bornAt: 0 });
    a.update(.1, () => null); expect(a.zombies[0].attacking).toBe(true); expect(host.local.health).toBe(10);
    a.update(ATTACK.windup - .1, () => null);
    expect(host.local.health).toBe(0); expect(host.remote.health).toBe(100); expect(a.failed).toBe(false);
    a.update(.1, () => null); expect(a.zombies[0].attackTarget).toBe('222');
    expect(a.zombies[0].x).toBeGreaterThan(-2);
    host.remote.health = 10; a.zombies[0].x = host.remote.x; a.zombies[0].z = host.remote.z - SURVIVAL.contactRadius;
    a.update(.4, () => null); expect(host.remote.health).toBe(0); expect(a.failed).toBe(true);
  });
  it('房主同步清波、升波、伤害与全员死亡，客户端拒绝过期快照', () => {
    const { host, guest, a, b, packets } = pair();
    a.update(10, () => ({ x: 18, z: -42 }));
    for (const z of a.zombies) a.hit(z.id, true, 1000);
    a.update(.05, () => null); host.broadcast(0, true);
    const first = packets[0] as WorldState; expect(validWorld(first, members)).toBe(true);
    guest.receive('111', first); expect(b.kills).toBe(9); expect(b.wavesCleared).toBe(1);
    a.update(5, () => null); host.local.health = 0; host.remote.health = 0; a.update(.05, () => null);
    host.broadcast(0, true); guest.receive('111', packets[1]); guest.receive('111', first);
    expect(b.wave).toBe(2); expect(b.failed).toBe(true); expect(guest.players.every(p => p.health === 0)).toBe(true);
    expect(validWorld({ ...first, players: [first.players[0], first.players[0]] }, members)).toBe(false);
    expect(validWorld({ ...first, intermission: -1 }, members)).toBe(false);
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
});
