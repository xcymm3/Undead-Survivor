import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';
import path from 'node:path';

/** 只在 Node 中执行主进程代码，Electron 完全替身化，不启动游戏或真实窗口。 */
async function launch(silent: boolean, rejectReady = false) {
  const app = Object.assign(new EventEmitter(), {
    commandLine: { hasSwitch: () => silent }, isPackaged: false, getAppPath: () => process.cwd(),
    setPath: vi.fn(), setAppLogsPath: vi.fn(), setAppUserModelId: vi.fn(), exit: vi.fn(), quit: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => true), whenReady: () => rejectReady ? Promise.reject(Error('模拟启动失败')) : Promise.resolve(),
  });
  const windows: FakeWindow[] = [];
  class FakeWindow extends EventEmitter {
    webContents = Object.assign(new EventEmitter(), { setWindowOpenHandler: vi.fn(), setAudioMuted: vi.fn(), send: vi.fn() });
    show = vi.fn(); focus = vi.fn(); restore = vi.fn(); setFullScreen = vi.fn(); isMinimized = () => false;
    loadURL = async () => { this.emit('ready-to-show'); };
    constructor(readonly options: any) { super(); windows.push(this); }
  }
  const dialog = { showErrorBox: vi.fn() }, error = vi.fn();
  const electron = { app, BrowserWindow: FakeWindow, dialog, Menu: { setApplicationMenu: vi.fn() },
    protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
    session: { defaultSession: { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() } },
    ipcMain: { handle: vi.fn(), on: vi.fn() } };
  runInNewContext(readFileSync('desktop/main.cjs', 'utf8'), {
    require: (name: string) => {
      if (name === 'electron') return electron;
      if (name === 'node:path') return path;
      if (name === 'node:fs') return { mkdirSync: vi.fn(), readFileSync: vi.fn() };
      throw Error(`未预期的依赖 ${name}`);
    },
    process: { env: {}, execPath: process.execPath }, __dirname: path.resolve('desktop'), console: { error },
  });
  await new Promise(resolve => setImmediate(resolve));
  return { app, windows, dialog, error, electron };
}

describe('静默桌面启动（无真实窗口）', () => {
  it('隐藏、不可聚焦、不占任务栏且静音，ready 和二次启动都不显窗', async () => {
    const { app, windows } = await launch(true); const w = windows[0];
    expect(w.options).toMatchObject({ show: false, focusable: false, skipTaskbar: true });
    expect(w.webContents.setAudioMuted).toHaveBeenCalledWith(true);
    app.emit('second-instance', {}, ['.'], '.', { silent: false });
    expect(w.show).not.toHaveBeenCalled(); expect(w.focus).not.toHaveBeenCalled(); expect(w.restore).not.toHaveBeenCalled();
    const event = { preventDefault: vi.fn() };
    w.webContents.emit('before-input-event', event, { type: 'keyDown', key: 'F11' });
    expect(w.setFullScreen).not.toHaveBeenCalled();
  });
  it('静默请求不会唤起用户已有的前台游戏', async () => {
    const { app, windows } = await launch(false); const w = windows[0];
    expect(w.show).toHaveBeenCalledTimes(1); w.show.mockClear();
    app.emit('second-instance', {}, ['.', '--silent'], '.', { silent: true });
    expect(w.show).not.toHaveBeenCalled(); expect(w.focus).not.toHaveBeenCalled();
  });
  it('静默启动失败只记录错误，不弹出系统对话框', async () => {
    const { app, dialog, error } = await launch(true, true);
    expect(dialog.showErrorBox).not.toHaveBeenCalled(); expect(error).toHaveBeenCalled(); expect(app.quit).toHaveBeenCalled();
  });
});
