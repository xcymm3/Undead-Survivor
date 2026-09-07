import { chromium } from '@playwright/test';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installAudioCapture, startVideoCapture, muxCapture } from './playthrough-capture.mjs';

// 用真实键鼠输入操作正式模式。诊断接口仅用于读取目标投影和核对演示覆盖，不修改对局。
const url = process.env.GAME_URL ?? 'http://127.0.0.1:5176/';
const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d+Z$/, 'Z');
const directory = path.resolve('recordings', stamp);
await mkdir(directory, { recursive: true });
const videoPath = path.join(directory, 'Undead-Tower-six-weapons.mp4');
const silentPath = path.join(directory, 'picture.mp4'), audioPath = path.join(directory, 'game-audio.webm');
const ffmpeg = process.env.FFMPEG_PATH ?? path.resolve('recordings/tools/node_modules/ffmpeg-static/ffmpeg.exe');
if (!(await stat(ffmpeg)).size) throw Error('缺少完整 FFmpeg，请设置 FFMPEG_PATH');
const events = [], demonstrations = [];
const names = ['步枪', 'P90 冲锋枪', '半自动手枪', '左轮手枪', '泵动霰弹枪', '栓动狙击枪'];
const quotas = [6, 10, 4, 3, 3, 2];
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let recordingStart = 0;
function log(type, state, extra = {}) {
  const event = { type, videoSeconds: (Date.now() - recordingStart) / 1000, gameSeconds: state?.survived ?? 0, ...extra };
  events.push(event); console.log(JSON.stringify(event));
}
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
let result, captureInfo, capture;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', error => log('page-error', null, { message: error.message }));
  await installAudioCapture(page, audioPath);
  await page.goto(url);
  await page.waitForFunction(() => window.__undeadTower?.snapshot().weaponAnimation.loaded);
  await page.mouse.move(640, 360);
  capture = await startVideoCapture(page, silentPath, ffmpeg);
  captureInfo = { width: 1280, height: 720, fps: 30, video: 'H.264', audio: 'AAC', source: 'Chrome screencast + game master audio' };
  recordingStart = capture.startedAt;
  log('recording-start', null, captureInfo);
  await pause(1600);
  await page.getByRole('button', { name: '单人模式' }).click();
  const snapshot = () => page.evaluate(() => window.__undeadTower.snapshot());
  let state = await snapshot(); log('run-start', state);
  let stage = 0, stageStart = state.survived, stageShots = state.shots, reloadRequested = false, reloadSeen = false, reloadCompleteAt = null;
  let lastStatus = 0, nextAction = 0, lastTarget = null, misses = 0;
  const blockedUntil = new Map();
  log('weapon-demo-start', state, { weapon: names[0], index: 0 });
  while (state.phase === 'playing') {
    if (Date.now() - recordingStart > 300_000) throw Error('对局超过五分钟，录制停止保护资源');
    if (state.survived - lastStatus > 15) { lastStatus = state.survived; log('progress', state, { kills: state.kills, alive: state.targets.filter(z => z.health > 0).length }); }
    if (state.switching || state.weaponIndex !== stage % 6) { await pause(60); state = await snapshot(); continue; }
    if (reloadRequested) {
      if (state.reloading) reloadSeen = true;
      if (reloadSeen && !state.reloading && reloadCompleteAt === null) {
        reloadCompleteAt = state.survived;
        const entry = { index: stage % 6, weapon: names[stage % 6], shots: state.shots - stageShots, ammoAfterReload: state.ammo, gameSeconds: state.survived, videoSeconds: (Date.now() - recordingStart) / 1000 };
        demonstrations.push(entry); log('reload-complete', state, entry);
      }
      if (reloadCompleteAt !== null && state.survived - reloadCompleteAt > 0.55) {
        stage++; const index = stage % 6;
        // 首轮用数字键，之后也通过滚轮演示顺序切换。
        if (stage < 6) await page.keyboard.press(`Digit${index + 1}`); else await page.mouse.wheel(0, 120);
        log('weapon-demo-start', state, { weapon: names[index], index });
        stageStart = state.survived; stageShots = state.shots; reloadRequested = false; reloadSeen = false; reloadCompleteAt = null;
      }
      await pause(75); state = await snapshot(); continue;
    }
    if (state.reloading) { await pause(75); state = await snapshot(); continue; }
    if (state.shots > stageShots && (state.shots - stageShots >= quotas[stage % 6] || state.survived - stageStart > 5.5 || state.ammo === 0)) {
      await page.mouse.move(640, 360, { steps: 5 });
      await page.keyboard.press('KeyR'); reloadRequested = true;
      log('reload-start', state, { weapon: names[stage % 6], index: stage % 6 });
      await pause(80); state = await snapshot(); continue;
    }
    if (Date.now() < nextAction) { await pause(40); state = await snapshot(); continue; }
    const targets = state.targets.filter(z => z.health > 0 && z.head.x > 35 && z.head.x < 1245 && z.head.y > 190 && z.head.y < 600 && (blockedUntil.get(z.id) ?? 0) < state.survived)
      .sort((a, b) => Math.hypot(a.x, a.z - 9) - Math.hypot(b.x, b.z - 9));
    const target = targets[0];
    if (target) {
      await page.mouse.move(target.head.x, target.head.y, { steps: 4 });
      const latest = (await snapshot()).targets.find(z => z.id === target.id);
      if (latest?.health > 0) await page.mouse.move(latest.head.x, latest.head.y);
      const beforeHits = state.hits;
      if (state.weaponIndex < 2) {
        await page.mouse.down(); await pause(state.weaponIndex === 0 ? 175 : 135); await page.mouse.up();
      } else await page.mouse.click(latest?.head.x ?? target.head.x, latest?.head.y ?? target.head.y);
      await pause(70);
      const after = await snapshot();
      if (after.hits === beforeHits && lastTarget === target.id) misses++; else misses = 0;
      lastTarget = target.id;
      if (misses >= 3) { blockedUntil.set(target.id, after.survived + 1.5); misses = 0; }
      state = after; nextAction = Date.now() + 100;
    } else { await pause(100); state = await snapshot(); }
  }
  await page.mouse.up();
  log('defense-breached', state, { culprit: state.breach });
  await page.getByRole('heading', { name: '波次排行榜', exact: true }).waitFor({ state: 'visible', timeout: 8000 });
  state = await snapshot(); result = state.result;
  log('run-ended', state, { result });
  await pause(4000);
  await page.screenshot({ path: path.join(directory, 'result.png') });
  const audioInfo = await page.evaluate(() => window.__playthroughAudio.stop());
  const videoInfo = await capture.stop();
  capture = null;
  await muxCapture(ffmpeg, silentPath, audioPath, videoPath, (audioInfo.startedAt - recordingStart) / 1000, videoInfo.duration);
  captureInfo = { ...captureInfo, ...videoInfo, audioOffset: (audioInfo.startedAt - recordingStart) / 1000 };
  const bytes = (await stat(videoPath)).size;
  if (bytes < 10_000) throw Error(`录制文件只有 ${bytes} 字节，未捕获到有效画面`);
  const coverage = new Set(demonstrations.filter(d => d.shots > 0 && d.ammoAfterReload > 0).map(d => d.index));
  await writeFile(path.join(directory, 'recording.json'), JSON.stringify({ url, bytes, captureInfo, result, demonstrations, completeCoverage: coverage.size === 6, events }, null, 2));
  if (coverage.size !== 6) throw Error(`本局只完成 ${coverage.size}/6 把枪的射击与换弹演示`);
  console.log(JSON.stringify({ videoPath, result, completeCoverage: true }));
} finally {
  if (capture) await capture.stop().catch(error => console.error('录制清理：', error.message));
  await writeFile(path.join(directory, 'events.json'), JSON.stringify(events, null, 2));
  await browser.close();
}
