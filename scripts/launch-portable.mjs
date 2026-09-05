import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { chromium } from '@playwright/test';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function reservePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, port: server.address().port };
}

// NSIS 不转发子进程的 stderr，不能用 Playwright Electron 的日志端口发现机制。
// 只在验收时使用本机 inspector 与 CDP；正常 EXE 启动不开放调试端口。
export async function launchPortable(executable, cwd, env) {
  const ports = await Promise.all([reservePort(), reservePort()]);
  await Promise.all(ports.map(({ server }) => new Promise(resolve => server.close(resolve))));
  const [mainPort, pagePort] = ports.map(p => p.port);
  // GitHub 的 Windows runner 没有可供 Electron 使用的实体 GPU，验收时显式启用 SwiftShader。
  // 本机验收继续使用真实 GPU，避免软件渲染掩盖驱动或资源问题。
  const graphicsArgs = env.CI === 'true' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [];
  const child = spawn(executable, ['--silent', ...graphicsArgs, `--inspect=127.0.0.1:${mainPort}`, `--remote-debugging-port=${pagePort}`, '--remote-debugging-address=127.0.0.1'], {
    cwd, env: { ...env, UNDEAD_SURVIVOR_SILENT: '1' }, windowsHide: true, stdio: 'ignore',
  });
  let launchError, socket, browser, sequence = 0;
  const pending = new Map();
  child.on('error', error => { launchError = error; });
  async function endpoint(port, pathname) {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (launchError) throw launchError;
      if (child.exitCode !== null) throw Error(`便携启动器提前退出：${child.exitCode}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) return await response.json();
      } catch { /* 等待实际 EXE 解压并初始化调试接口。 */ }
      await delay(200);
    }
    throw Error(`便携版调试接口启动超时：${port}`);
  }
  function rpc(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(Error(`Inspector 超时：${method}`)); }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(fn) {
    const reply = await rpc('Runtime.evaluate', { expression: `(${fn.toString()})(require('electron'))`, includeCommandLineAPI: true, awaitPromise: true, returnByValue: true });
    if (reply.exceptionDetails) throw Error(reply.exceptionDetails.exception?.description || reply.exceptionDetails.text);
    return reply.result.value;
  }
  async function close() {
    try {
      if (socket?.readyState === WebSocket.OPEN) await evaluate(({ app }) => { setImmediate(() => app.quit()); return true; });
    } catch { /* 失败启动或窗口关闭时可能已断开。 */ }
    socket?.close();
    try { await browser?.close(); } catch { /* Electron 可能先断开 CDP。 */ }
    for (let i = 0; i < 100 && child.exitCode === null && !launchError; i++) await delay(100);
    if (child.exitCode === null && child.pid) {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      await once(killer, 'exit');
      throw Error('便携版未正常退出，已仅清理本次测试进程树');
    }
    if (child.exitCode !== 0 && !launchError) throw Error(`便携版退出码：${child.exitCode}`);
  }
  try {
    const targets = await endpoint(mainPort, '/json/list');
    socket = new WebSocket(targets[0].webSocketDebuggerUrl);
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data), item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id); clearTimeout(item.timer);
      if (message.error) item.reject(Error(message.error.message)); else item.resolve(message.result);
    });
    socket.addEventListener('close', () => {
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error('Inspector 已关闭')); }
      pending.clear();
    });
    await once(socket, 'open', { signal: AbortSignal.timeout(10000) });
    await endpoint(pagePort, '/json/version');
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${pagePort}`, { timeout: 10000 });
    const context = browser.contexts()[0];
    return { evaluate, close, context: () => context, firstWindow: async () => context.pages()[0] || context.waitForEvent('page', { timeout: 15000 }) };
  } catch (error) {
    try { await close(); } catch (cleanup) { error.cause = cleanup; }
    throw error;
  }
}
