import { useEffect, useState } from 'react';
import type { Room, SteamStatus } from '../multiplayer/types';

export function MultiplayerPanel({ close, notice = '' }: { close: () => void; notice?: string }) {
  const [status, setStatus] = useState<SteamStatus | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [name, setName] = useState('一起守住哨站');
  const [roomId, setRoomId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const bridge = window.steamCoop;
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return; setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!bridge) return;
    let active = true;
    void bridge.status().then(s => { if (active) setStatus(s); }).catch(e => { if (active) setError(String(e)); });
    const off = bridge.onEvent(event => { if (event.type === 'status') setStatus(event.status); if (event.type === 'error' || event.type === 'left') setError(event.message); });
    return () => { active = false; off(); };
  }, [bridge]);
  const room = status?.room;
  return <section className="multiplayer-screen" role="dialog" aria-modal="true" aria-labelledby="multiplayer-title">
    <div className="multiplayer-panel">
      <span className="label">TWO SURVIVORS / STEAM P2P</span><h2 id="multiplayer-title">多人模式</h2>
      <p>两人协力守波。一人死亡后观战，两人都死亡才结束。</p>
      {!bridge ? <div className="network-note">请在桌面版中使用 Steam 联机，并先登录 Steam。浏览器支持单人模式。</div>
        : !status?.available ? <div className="network-note"><p>{status?.message || '正在连接 Steam…'}</p><button className="text-button" disabled={busy} onClick={() => run(async () => setStatus(await bridge.status()))}>重新连接 Steam</button></div>
        : <><p className="network-identity">{status.name} · Spacewar 测试（App ID 480）</p>
          {room ? <div className="room-current"><span className="label">{room.owner === status.id ? '你是房主' : '等待房主'}</span><h3>{room.name}</h3><p>房间号 <code>{room.id}</code> · {room.members.length} / 2 人</p>
            <ul>{room.members.map(m => <li key={m.id}><span>{m.name}{m.id === status.id ? '（你）' : ''}</span><b>{m.id === room.owner ? '房主' : '队友'}</b></li>)}</ul>
            <p>{room.playing ? '正在连接双方，准备进入战斗…' : room.members.length === 2 ? '两人已到齐，可以开始。' : '等待队友搜索或输入房间号加入。'}</p>
            {room.owner === status.id && <button className="start-button" disabled={busy || room.members.length !== 2 || room.playing} onClick={() => run(() => bridge.start())}>开始双人游戏 <span>→</span></button>}
            <button className="text-button" disabled={busy} onClick={() => run(() => bridge.leave())}>离开房间</button>
          </div> : <>
            <div className="room-create"><label htmlFor="room-name">房间名称</label><input id="room-name" maxLength={40} value={name} onChange={e => setName(e.target.value)} /><button disabled={busy} className="start-button" onClick={() => run(async () => { const room = await bridge.create(name); setStatus({ ...status, room }); })}>创建房间 <span>＋</span></button></div>
            <div className="room-search"><h3>可加入的房间</h3><button className="text-button" disabled={busy} onClick={() => run(async () => { setRooms(await bridge.search()); setSearched(true); })}>搜索房间</button></div>
            <div className="room-list">{rooms.map(r => <div key={r.id}><span>{r.name}<small>{r.memberCount ?? r.members.length} / 2 人</small></span><button disabled={busy} onClick={() => run(async () => { const room = await bridge.join(r.id); setStatus({ ...status, room }); })}>加入房间</button></div>)}{!rooms.length && <p>{searched ? '暂时没有可加入的房间，可重新搜索或输入房间号。' : '点击搜索，查找相同版本的双人房间。'}</p>}</div>
            <div className="room-direct"><label htmlFor="room-id">房间号</label><input id="room-id" inputMode="numeric" maxLength={20} value={roomId} onChange={e => setRoomId(e.target.value.replace(/\D/g, ''))} /><button disabled={busy || !roomId} onClick={() => run(async () => { const room = await bridge.join(roomId); setStatus({ ...status, room }); })}>按房间号加入</button></div>
          </>}
        </>}
      {(error || notice) && <p role="alert" className="network-error">{error || notice}</p>}
      {busy && <p role="status">正在处理，请稍候…</p>}
      <button className="text-button" disabled={busy} onClick={() => run(async () => { if (room) await bridge?.leave(); close(); })}>{room ? '离开并返回首页' : '返回首页'}</button>
    </div>
  </section>;
}
