# AGENTS.md

为在本仓库工作的 AI 编码代理（Claude Code / Codex / Amp 等）提供必要上下文与硬约束。
人类开发者请优先看 `README.md` 与 `docs/`。

## 项目速览

- 用途：本地 Windows 桌面 P4 diff 工具
- 技术栈：Electron + React 19 + TypeScript + Vite (`electron-vite`) + Bun
- 关键依赖：
  - `@pierre/diffs` 负责所有 diff 渲染（不要自己写 diff 算法/UI）
  - `@pierre/trees` 负责文件树（不要自己写树组件）
- 平台目标：Windows 10/11（macOS/Linux 不支持，不必兼容）
- 运行依赖：本机 PATH 中可执行 `p4`，且已 `p4 login`

## 目录结构

```
src/
  core/            # renderer/main 共享：types、p4 解析、IPC contract、错误模型
    ipc/           # IPC 接口定义（contract.ts）
    models/        # AppConfig、ChangelistSummary、错误码 等
    p4/            # p4 命令输出解析（纯函数，便于测试）
  main/            # Electron 主进程
    services/      # configService / p4Service / changeService / fileService 等
  preload/         # contextBridge 暴露 window.mycodediff
  renderer/        # React UI
    components/    # DiffToolbar / ChangelistList / FileListView / PierreDiffView 等
    pages/         # PendingPage / HistoryPage
    state/         # changeStore、paneSizes 等 hook
    styles/        # CSS
tests/             # bun test：单元 + 集成（不要用 jest/vitest）
scripts/           # smoke.ts、test-p4-env.ps1（PowerShell 7）
docs/              # requirements / design / implementation-plan
out/               # electron-vite 构建产物（main/preload/renderer）
dist/              # 打包临时目录
```

## 必跑命令

任何代码改动后至少跑一次：

```bash
bun run typecheck     # tsc 校验 node 与 web 两个 tsconfig
bun run test          # bun test 全量
bun run build         # electron-vite build；UI 改动后必须 build 才能在产物中看到
```

可选：

```bash
bun run dev           # 开发模式（HMR），交互验证 UI
bun run smoke         # scripts/smoke.ts 端到端冒烟
bun run package       # electron-builder --win --dir，产物在 release/
```

环境注意：
- 用 Bun，不要用 npm/pnpm/yarn 安装或运行脚本
- shell 默认是 PowerShell；用 `Select-String` / `Get-ChildItem`，没有 `rg`/`grep`/`find`
- Electron postinstall 国内可能需要 `set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`

## 架构硬约束

1. **进程边界**
   - `core/` 里禁止 import `electron`、Node 专属 API 之外的 main 模块
   - `renderer/` 只能通过 `window.mycodediff`（preload 暴露）访问 main，禁止 `require('electron')` / Node fs
   - 新增 IPC 必须先在 `src/core/ipc/contract.ts` 加类型，再在 `main/services` 实现，最后在 `preload` 暴露
2. **Diff/Tree 渲染**
   - 必须用 `@pierre/diffs` / `@pierre/trees`，禁止重写 diff 计算或 UI
   - `PierreDiffView` 是唯一的 diff 渲染入口
3. **配置**
   - `AppConfig` 字段都加在 `src/core/models/configModel.ts` 的 `AppConfig` + `defaultConfig`
   - `mergeConfig` 会做字段白名单 + 类型校验，不要绕过
   - 写入用 `api.updateConfig(patch)`，会持久化到 Electron `userData`
4. **P4 调用**
   - 所有 p4 子进程调用集中在 `main/services/p4Service`
   - p4 命令输出解析放 `core/p4/p4Parsers.ts`，纯函数 + 单测覆盖
   - 错误统一用 `core/models/errors.ts` 的错误码（`P4_NOT_FOUND` / `P4_AUTH_REQUIRED` / `LARGE_FILE_REQUIRES_CONFIRMATION` 等），不要随意加新码
5. **大文件 / 大 CL**
   - 文件 >2 MB 抛 `LARGE_FILE_REQUIRES_CONFIRMATION`，UI 提示后用 `confirmLargeFile: true` 重试
   - CL >500 文件给提示但仍按需懒加载
6. **不在第一版做的事**（除非用户明确要求，不要主动加）
   - shelved CL、文件搜索、报告导出、Git diff、目录比较、跨平台支持

## 编码风格

- TS strict、显式返回类型；React 19 函数组件 + hooks
- 不引入新的运行时依赖前先确认必要性；新依赖用 `bun add`
- 路径别名：`@core/*` → `src/core/*`，`@pierre/diffs` 等走 npm 包
- React 状态：本地 `useState` / 自定义 hook（`useChangeStore`、`usePaneSizes`）；不要引 redux/zustand
- 样式：CSS 文件，已有简单 class，不要引 Tailwind / CSS-in-JS
- 错误处理：renderer 显示 `error-banner`；main 抛带 `code` 的 AppError

## 修改规范

- 改 UI 后用 `bun run build`（或让用户在 `bun run dev` 下验证）；只 `typecheck` 不够
- 改 IPC contract / 配置字段：同步更新 `tests/`，否则集成测试会挂
- 删除/重命名导出 API：grep 全仓确认没有遗留 import
- 不要无谓重构、不要顺手加注释/类型/日志；只改任务要求的范围
- 不要 `git commit` / `git push`，除非用户明确要求

## 测试

- 框架：`bun test`（用 `import { test, expect } from "bun:test"`）
- 测试文件放 `tests/`，命名 `*.test.ts`
- p4 相关测试用 mock 子进程或解析器纯函数测试；不要在 CI 真连 p4
- 新增 service / parser 必须配单测

## Smoke 与 P4 诊断

- `bun run smoke`：跑 `scripts/smoke.ts`，模拟核心流程
- `pwsh -ExecutionPolicy Bypass -File scripts/test-p4-env.ps1 -Workspace "<path>"`：诊断 p4 环境，必须 PowerShell 7

## 用户实际使用方式（重要）

用户**不用 `bun run dev`**，而是**直接双击运行打包后的 exe**：

```
C:\work\github\MyCodeDiff\dist\win-unpacked\MyCodeDiff.exe
```

含义与影响：

- 用户手动关闭 exe 后再启动；不要假设有 HMR / 热更新
- 配置写入 Electron `userData` 目录（不是仓库内），重启 exe 仍会保留
- 仅 `bun run typecheck` / `bun run build` 不会更新 `dist/win-unpacked/`

### 代理硬性规则：自动 package

**任何代码或 UI 改动后，代理必须自己执行 `bun run package`，不要让用户跑、也不要提醒用户跑。**

- 不要问"是否需要打包"，直接跑
- 不要只跑 `bun run build` 就交付；必须 `bun run package`，否则用户启动 exe 看不到改动
- package 失败时报错给用户并停下来排查
- 完成后简短告知用户"已重新 package，可重启 exe 验证"，不需要长篇说明

例外：仅修改 `tests/`、`docs/`、`scripts/` 或 `AGENTS.md`/`README.md` 等不影响打包产物的文件时，可以不 package。

## 沟通约定

- 默认中文回复用户
- 改完贴出关键文件:行号引用，简洁说明影响面
- 改了 src/ 下代码后自己跑 `bun run package`，不要把这个步骤丢给用户
