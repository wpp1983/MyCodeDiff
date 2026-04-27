# MyCodeDiff

本地 Windows 桌面 P4 diff 工具，基于 Electron + React + TypeScript + Vite + Bun。
Diff 渲染由 [`@pierre/diffs`](https://diffs.com) 完整负责，文件树由 [`@pierre/trees`](https://www.npmjs.com/package/@pierre/trees) 完整负责。

## 第一版特性

- Windows 桌面应用
- Pending 页面：当前 workspace/client 下 pending CL
- History 页面：当前 client view 范围内最近 50 条 submitted CL
- 点击 CL 显示文件树（`@pierre/trees`）
- 点击文件懒加载 `FileContentPair` 并用 `@pierre/diffs` 渲染
- unified/side-by-side 切换
- 状态筛选 / hide unchanged / 忽略空白
- 大文件 (>2 MB) 和 大 CL (>500 文件) 提示
- 配置持久化在 Electron userData 目录

## 第一版不支持

- shelved CL
- 文件路径搜索 / 全文搜索
- 导出 HTML/Markdown/文本报告
- Git diff / 普通目录比较
- macOS / Linux（虽然可能能跑）

## 环境要求

- Windows 10/11
- Bun ≥ 1.3
- 本机可执行 `p4` 命令（在 PATH 中）
- 已在外部登录：`p4 login`
- `p4 info` 能正常工作

## 安装 & 开发

```bash
bun install
bun run typecheck
bun run test
bun run build
bun run dev       # 启动 Electron 开发模式
```

如果 `bun install` 的 electron postinstall 因网络（`ECONNRESET` 等）失败，
可设置镜像后重试：

```bash
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
bun install
```

或只重试 electron 一步：

```bash
cd node_modules/electron
node install.js
```

## 打包

```bash
bun run package
```

产物在 `release/`（`electron-builder --dir` 产生）。
生产构建不依赖 dev server。

## P4 环境诊断

```powershell
pwsh -ExecutionPolicy Bypass -File scripts/test-p4-env.ps1 -Workspace "C:\work\wp_dev_1"
```

必须使用 PowerShell 7（`pwsh`），不要用 Windows PowerShell 5.1。

## Codex agent 常用命令

```bash
bun install
bun run typecheck
bun run test
bun run build
bun run package
bun run smoke
```

## 常见错误处理

| 现象 | 含义 | 处理 |
| --- | --- | --- |
| `P4_NOT_FOUND` | PATH 里没有 `p4` | 安装 Helix CLI 或把 p4 加到 PATH |
| `P4_AUTH_REQUIRED` | session 过期 | 在终端跑 `p4 login` |
| `P4_CLIENT_NOT_FOUND` | 当前 `P4CLIENT` 不存在 | 检查 `p4 set P4CLIENT` |
| `FILE_NOT_FOUND` | 本地 workspace 缺文件 | 跑 `p4 sync` 或确认文件在 workspace |
| `BINARY_FILE` | 二进制文件 | 第一版不 diff 二进制 |
| `LARGE_FILE_REQUIRES_CONFIRMATION` | 超过 2 MB | 在 UI 点击 "Load anyway" |
| `LARGE_CHANGE_REQUIRES_CONFIRMATION` | CL 超 500 文件 | 仍按需懒加载；忽略警告即可 |

## 目录结构

```
src/
  core/            # 类型、P4 解析、IPC contract（renderer/main 共享）
  main/            # Electron 主进程、services
  preload/         # IPC bridge
  renderer/        # React UI（pages、components、state）
tests/             # bun test 单元/集成测试
scripts/           # smoke / P4 诊断脚本
docs/              # 需求 / 设计 / 实施计划
```
