# Design — Undead Survivor

## Genre and theme
Bloom / atmospheric。暖白纸面、陶土色操作按钮。首页参考《求生之路》的暗色场景与战役菜单层级，以实时游戏画面配右侧白字、红色悬停选项；设置、排行榜、暂停和多人房间继续使用暖白界面。战斗 HUD 和瞄准镜继续使用原有深色主题，以保证复杂场景上的可读性。

## Structure
- 主界面：实时游戏画面铺底，左下标题、右侧纵向并列练习模式 / 单人模式 / 多人模式，一次点击进入。无卡片容器，窄屏菜单在标题下方靠右。工具栏位于右上，无营销页脚。
- 设置：Workbench 控制面板，声音与操控、画质两列；窄屏单列。操作按键及渲染信息按需展开。
- 多人大厅：房间浏览与创建两列；房间显示四个队员席位，窄屏两列。席位图形仅作成员占位标识，不预告随机皮肤。
- 排行榜和暂停：沿用纸面、字色、圆角与按钮规则。

## Typography and spacing
显示字体沿用项目自带 Barlow Condensed 600/700；中文与正文使用 Segoe UI / Microsoft YaHei，数字诊断使用 IBM Plex Mono。标题正体，4px 命名间距。全部颜色、字体从 tokens.css 引用。

## Interaction and copy
只保留操作名、模式区别、落水扣血回出生点、等待条件、错误和实时状态。移除重复双语副标题与自动保存解释。圆角主按钮，选中状态明确；焦点即时显示；禁用、加载、错误和复制成功分别有可见反馈。无自动播放动画；减少动态效果偏好下停用动效。

## Variants
Bloom 覆盖首页以外的菜单层；不改变游戏场景渲染。窄屏 320 / 375 / 414 / 768 保留可滚动对话框与可达操作。

## Exports
项目实际导入根目录 tokens.css。下列导出可移植菜单系统；保留现有战斗 token。

### tokens.css
```css
/* Bloom 菜单系统；战斗 HUD 保留深色可读性。 */
:root {
  --color-bloom-paper: oklch(97% .016 75);
  --color-bloom-panel: oklch(99% .009 75);
  --color-bloom-raised: oklch(94% .021 70);
  --color-bloom-ink: oklch(28% .026 43);
  --color-bloom-muted: oklch(49% .026 48);
  --color-bloom-dim: oklch(57% .029 48);
  --color-bloom-accent: oklch(51% .132 38);
  --color-bloom-hover: oklch(45% .13 38);
  --color-bloom-rule: oklch(85% .023 65);
  --color-bloom-faint: oklch(91% .04 55);
  --color-bloom-glow: oklch(82% .091 47 / .65);
  --color-bloom-halo: oklch(92% .04 55 / .5);
  --color-bloom-shadow: oklch(34% .025 40 / .12);
  --color-bloom-overlay: oklch(32% .03 43 / .32);
  --color-bloom-glass: oklch(99% .009 75 / .86);
  --color-bloom-clear: oklch(97% .016 75 / 0);
  --color-bloom-signal: oklch(46% .075 147);
  --color-bloom-seat: oklch(76% .059 48);
  --color-bloom-seat-alt: oklch(68% .035 60);
  --font-bloom-body: 'Segoe UI', 'Microsoft YaHei', sans-serif;
  --font-bloom-display: 'Barlow Condensed', 'Microsoft YaHei', sans-serif;
  --font-mono: 'IBM Plex Mono', 'Microsoft YaHei', monospace;
  --radius-panel: 28px;
  --radius-control: 12px;
  --radius-pill: 999px;
  --text-bloom-display: clamp(64px, 8vw, 116px);
}
```

### Tailwind v4
```css
@theme {
  --color-bloom-paper: oklch(97% .016 75);
  --color-bloom-panel: oklch(99% .009 75);
  --color-bloom-raised: oklch(94% .021 70);
  --color-bloom-ink: oklch(28% .026 43);
  --color-bloom-muted: oklch(49% .026 48);
  --color-bloom-dim: oklch(57% .029 48);
  --color-bloom-accent: oklch(51% .132 38);
  --color-bloom-hover: oklch(45% .13 38);
  --color-bloom-rule: oklch(85% .023 65);
  --color-bloom-faint: oklch(91% .04 55);
  --color-bloom-glow: oklch(82% .091 47 / .65);
  --color-bloom-halo: oklch(92% .04 55 / .5);
  --color-bloom-shadow: oklch(34% .025 40 / .12);
  --color-bloom-overlay: oklch(32% .03 43 / .32);
  --color-bloom-glass: oklch(99% .009 75 / .86);
  --color-bloom-clear: oklch(97% .016 75 / 0);
  --color-bloom-signal: oklch(46% .075 147);
  --color-bloom-seat: oklch(76% .059 48);
  --color-bloom-seat-alt: oklch(68% .035 60);
  --font-bloom-body: 'Segoe UI', 'Microsoft YaHei', sans-serif;
  --font-bloom-display: 'Barlow Condensed', 'Microsoft YaHei', sans-serif;
}
```

### DTCG
```json
{
  "color-bloom-paper": {
    "$value": "oklch(97% .016 75)",
    "$type": "color"
  },
  "color-bloom-panel": {
    "$value": "oklch(99% .009 75)",
    "$type": "color"
  },
  "color-bloom-raised": {
    "$value": "oklch(94% .021 70)",
    "$type": "color"
  },
  "color-bloom-ink": {
    "$value": "oklch(28% .026 43)",
    "$type": "color"
  },
  "color-bloom-muted": {
    "$value": "oklch(49% .026 48)",
    "$type": "color"
  },
  "color-bloom-dim": {
    "$value": "oklch(57% .029 48)",
    "$type": "color"
  },
  "color-bloom-accent": {
    "$value": "oklch(51% .132 38)",
    "$type": "color"
  },
  "color-bloom-hover": {
    "$value": "oklch(45% .13 38)",
    "$type": "color"
  },
  "color-bloom-rule": {
    "$value": "oklch(85% .023 65)",
    "$type": "color"
  },
  "color-bloom-faint": {
    "$value": "oklch(91% .04 55)",
    "$type": "color"
  },
  "color-bloom-glow": {
    "$value": "oklch(82% .091 47 / .65)",
    "$type": "color"
  },
  "color-bloom-halo": {
    "$value": "oklch(92% .04 55 / .5)",
    "$type": "color"
  },
  "color-bloom-shadow": {
    "$value": "oklch(34% .025 40 / .12)",
    "$type": "color"
  },
  "color-bloom-overlay": {
    "$value": "oklch(32% .03 43 / .32)",
    "$type": "color"
  },
  "color-bloom-glass": {
    "$value": "oklch(99% .009 75 / .86)",
    "$type": "color"
  },
  "color-bloom-clear": {
    "$value": "oklch(97% .016 75 / 0)",
    "$type": "color"
  },
  "color-bloom-signal": {
    "$value": "oklch(46% .075 147)",
    "$type": "color"
  },
  "color-bloom-seat": {
    "$value": "oklch(76% .059 48)",
    "$type": "color"
  },
  "color-bloom-seat-alt": {
    "$value": "oklch(68% .035 60)",
    "$type": "color"
  },
  "font-bloom-body": {
    "$value": "'Segoe UI', 'Microsoft YaHei', sans-serif",
    "$type": "fontFamily"
  },
  "font-bloom-display": {
    "$value": "'Barlow Condensed', 'Microsoft YaHei', sans-serif",
    "$type": "fontFamily"
  }
}
```

### shadcn/ui
```css
:root {
  --background: var(--color-bloom-paper);
  --foreground: var(--color-bloom-ink);
  --primary: var(--color-bloom-accent);
  --primary-foreground: var(--color-bloom-panel);
  --muted: var(--color-bloom-raised);
  --muted-foreground: var(--color-bloom-muted);
  --border: var(--color-bloom-rule);
  --input: var(--color-bloom-rule);
  --ring: var(--color-bloom-accent);
  --radius: 12px;
}
```
