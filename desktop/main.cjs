const { app, BrowserWindow, dialog, Menu, protocol, session, ipcMain } = require('electron');
const { mkdirSync, readFileSync } = require('node:fs');
const path = require('node:path');

const GAME_URL = 'undead://game/';
protocol.registerSchemesAsPrivileged([{ scheme: 'undead', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

// NSIS 便携启动器会解压到临时目录；成绩必须保存在原 EXE 旁，不能跟随临时目录消失。
const portableRoot = process.env.PORTABLE_EXECUTABLE_DIR || (app.isPackaged ? path.dirname(process.execPath) : app.getAppPath());
const dataDir = path.join(portableRoot, 'Undead Survivor Data');
try {
  for (const folder of ['', 'Browser', 'CrashDumps', 'Logs']) mkdirSync(path.join(dataDir, folder), { recursive: true });
  app.setPath('userData', dataDir);
  app.setPath('sessionData', path.join(dataDir, 'Browser'));
  app.setPath('crashDumps', path.join(dataDir, 'CrashDumps'));
  app.setAppLogsPath(path.join(dataDir, 'Logs'));
} catch (error) {
  dialog.showErrorBox('Undead Survivor 无法保存数据', `请把游戏放在可以写入的文件夹后重试。\n\n${dataDir}\n${error.message}`);
  app.exit(1);
}

let window;
let steam;
const steamEvent = event => { if (window && !window.isDestroyed()) window.webContents.send('coop:event', event); };
function getSteam() { return steam ??= require('./steam.cjs').initialize(steamEvent); }
const checkSender = event => { if (!window || event.sender !== window.webContents || !event.senderFrame?.url.startsWith(GAME_URL)) throw Error('无效的联机请求来源'); };
ipcMain.handle('coop:status', event => {
  checkSender(event);
  try { return getSteam().status(); } catch (error) {
    return { available: false, id: '', name: '', appId: 480, room: null, message: `Steam 未就绪，请登录 Steam 后重试。${error.message}` };
  }
});
for (const method of ['create', 'search', 'join', 'leave', 'start']) ipcMain.handle(`coop:${method}`, (event, value) => {
  checkSender(event); return getSteam()[method](value);
});
ipcMain.on('coop:send', (event, value) => {
  try { checkSender(event); if (JSON.stringify(value).length <= 128 * 1024) steam?.sendData(value); } catch { /* 丢弃非法或过大的消息。 */ }
});
app.on('before-quit', () => { steam?.dispose(); steam = null; });
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(async () => {
    app.setAppUserModelId('com.undeadsurvivor.game');
    Menu.setApplicationMenu(null);
    const root = path.join(app.getAppPath(), 'dist');
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2' };
    const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
    // 仅提供包内静态资源，不启动 HTTP 服务，也不向页面暴露 Node 或文件系统接口。
    protocol.handle('undead', request => {
      try {
        const url = new URL(request.url);
        if (url.host !== 'game' || !['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 403 });
        const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
        const file = path.resolve(root, `.${name}`);
        const relative = path.relative(root, file);
        if (relative.startsWith('..') || path.isAbsolute(relative) || /[\0:]/.test(name)) return new Response(null, { status: 403 });
        const body = readFileSync(file);
        return new Response(request.method === 'HEAD' ? null : body, { headers: { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' } });
      } catch { return new Response(null, { status: 404 }); }
    });
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback((permission === 'fullscreen' || permission === 'pointerLock')));
    session.defaultSession.setPermissionCheckHandler((_contents, permission) => (permission === 'fullscreen' || permission === 'pointerLock'));
    window = new BrowserWindow({
      title: 'Undead Survivor', width: 1440, height: 900, minWidth: 960, minHeight: 640,
      backgroundColor: '#1d2624', show: false, autoHideMenuBar: true,
      icon: path.join(__dirname, 'icon.ico'),
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(GAME_URL)) event.preventDefault(); });
    window.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'F11') { event.preventDefault(); window.setFullScreen(!window.isFullScreen()); }
    });
    window.once('ready-to-show', () => window.show());
    window.on('closed', () => { window = null; });
    await window.loadURL(GAME_URL);
  }).catch(error => { dialog.showErrorBox('Undead Survivor 启动失败', error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
}
