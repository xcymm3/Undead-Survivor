# Undead Survivor Windows 便携版

当前发布目标：本地构建为 `Undead Survivor-0.8.0.exe`，GitHub Release 附件为 `Undead-Survivor-0.8.0.exe`。支持 Windows 10/11 x64，包含自由移动、视角导向跳跃、波次生存、排行榜、鼠标灵敏度和五档画质设置，以及 Steam 2～4 人合作模式。

## 使用与分发

将 EXE 放在可写入的文件夹，双击启动。无需 Node.js、Chrome 或本地服务器，首次启动会自动解压内置运行环境到临时目录。单人模式可离线游玩；多人模式要求每名玩家分别登录不同的 Steam 账号。

联机的准备、创建/搜索/加入房间、操作与问题排查请阅读 [EXE 联机说明](MULTIPLAYER.md)。发给朋友时附上 Release 中的 `Multiplayer-Guide-0.8.0.txt` 即可，不需要源码或 `win-unpacked`。

EXE 旁自动创建 `Undead Survivor Data`，保存本机排行榜、设置与缓存。迁移自己的游戏时将 EXE 和数据文件夹一起移动；发给朋友时不要附上个人数据。新旧版使用相同数据目录，升级时可把新版放在旧版旁，避免同时运行两版。

文件名采用 `Undead Survivor-版本号.exe`，保留绿色盾形持枪幸存者图标。成品未做 Authenticode 签名，不要求管理员权限。正常手动双击会显示游戏窗口；静默参数只用于自动验收。

## 构建与静默验证

仅在用户明确要求重新打包时执行：

```powershell
npm ci
npm run dist:portable
npm run test:portable
```

`electron-builder.cjs` 生成 Windows x64 单文件便携版。推送与 `package.json` 一致的 `vX.Y.Z` 标签后，GitHub Actions 自动测试、构建、静默验收并发布 EXE、SHA-256 文件和联机说明。Steamworks 和 Koffi 原生模块随包分发，并解包到真实文件路径以加载 Steam DLL。二进制不提交到 Git。

`test:portable` 仅接受当前版本，拒绝 0.5.0 及更早版本。测试在独立的 `test-results/portable-时间戳/` 中文路径内复制成品，通过便携启动器启动内层 Electron。启动器不配置 splash，默认静默解压；游戏同时传入 `--silent` 与静默环境变量，隐藏、不可聚焦、不占任务栏且静音。操作使用 DOM，不执行前台鼠标捕获或全屏；截图使用 `capturePage(..., { stayHidden: true })`。

成品验收检查实际打包版本、窗口状态、从成品加载 Steam/Koffi 原生模块、五项 Steam DLL 接口绑定、多人入口与 Steam 状态、离线资源加载和渲染隔离。退出后，在同一测试证据目录内搬迁 EXE 和数据，再次静默启动核对音量保存，最后正常关闭。不会往交付 EXE 旁写入测试成绩，也不启动旧版 EXE。

战斗逻辑用 `npm test` 和无界面、静音、单 worker 的 `npx playwright test tests/e2e/coop.spec.ts` 检查；这与实际 Steam 跨电脑连接测试是不同的验证。

## 桌面实现与验收边界

入口 `desktop/main.cjs` 使用私有 `undead://game/` 协议读取包内资源，无需 HTTP 服务。启用沙箱、上下文隔离与内容安全策略，不向页面开放 Node API，生产包没有游戏诊断接口。正常启动不开调试端口，只有自动验收临时建立本机调试连接。

0.6.0 已完成双机双账号 Spacewar 联机试玩；发现的客机画质和同步问题已在后续源码中优化。0.8.0 的 2～4 人协议仍需用对应数量的电脑和 Steam 账号继续实机验收。成品测试的本机 Steam 状态与具体结果记录在测试目录的 `result.json` 中。

## 0.6.0 成品记录（2026-09-04）

- 文件：`Undead Survivor-0.6.0.exe`，109,784,456 字节。
- SHA-256：`B13CEB15150BDF274FEC952F47B560B8420D461CA778DA75E99498460D51562E`。
- TypeScript 与生产构建通过；92 项单元测试、2 项无界面双人端到端测试通过。
- 实际便携 EXE 两次静默启动、窗口状态、原生依赖与五项 Steam DLL 绑定、离线资源、中文路径搬迁后的设置保存、正常退出均通过，页面错误为零。本机 Steam 未就绪提示正常，未进行实际双账号联网。
- 本次成品证据：`test-results/portable-1788518396952/result.json`。
- 旧 0.5.0 EXE 保留，哈希未改变；本轮自动验证没有启动旧版。
