// 中等压缩级别，避免打包大体积 Chromium 时使用默认的最高压缩和内存预算。
process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL ??= '5';

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.undeadsurvivor.game',
  productName: 'Undead Survivor',
  directories: { output: 'release', buildResources: 'desktop' },
  files: ['dist/**/*', 'desktop/*.cjs', 'desktop/icon.ico', 'package.json', 'node_modules/steamworks.js/**/*', 'node_modules/koffi/**/*', 'node_modules/@koromix/koffi-win32-x64/**/*'],
  asarUnpack: ['node_modules/steamworks.js/**/*', 'node_modules/koffi/**/*', 'node_modules/@koromix/koffi-win32-x64/**/*'],
  asar: true,
  npmRebuild: false,
  electronDist: 'node_modules/electron/dist',
  electronLanguages: ['zh-CN', 'en-US'],
  win: {
    target: [{ target: 'portable', arch: ['x64'] }],
    icon: 'desktop/icon.ico',
    requestedExecutionLevel: 'asInvoker',
    signExecutable: false,
  },
  portable: { artifactName: 'Undead Survivor-${version}.${ext}', requestExecutionLevel: 'user', unpackDirName: false },
};
