# MyCodeDiff 实施计划

## 1. 计划目标

本计划基于 `docs/design.md`，用于指导第一版 MyCodeDiff 的实现、验证和验收。

第一版范围：

- Windows 桌面应用。
- Electron + React + TypeScript + Vite + Bun。
- 使用当前系统默认 P4 环境。
- Pending 页面查看当前 workspace/client 下的 pending CL。
- History 页面查看当前 client view 对应 depot 路径范围内最近 50 条 submitted CL。
- 使用 `@pierre/diffs` 完成 diff 计算、语法高亮、unified/side-by-side 渲染。
- 使用 `@pierre/trees` 完成文件树构建与展示。
- 不支持 shelved CL、文件路径搜索、全文搜索、导出报告。

## 2. 验证原则

- 每个里程碑必须能由 Codex agent 独立验证。
- P4 相关逻辑必须支持 mock 命令输出测试，避免依赖真实 P4 服务器才能验收。
- 真实 P4 环境可作为额外人工验证，不作为唯一验收方式。
- 真实 P4 环境测试路径固定为 `C:\work\wp_dev_1`。
- 真实 P4 环境诊断脚本为 `scripts/test-p4-env.ps1`。
- UI 功能应至少支持本地启动、页面状态检查、构建检查。
- 每个里程碑完成时至少运行：

```bash
bun run typecheck
bun run test
bun run build
```

如果某个脚本在对应里程碑尚未存在，应在该里程碑内补齐。

真实 P4 环境可用性检查：

```powershell
pwsh -ExecutionPolicy Bypass -File scripts\test-p4-env.ps1 -Workspace "C:\work\wp_dev_1"
```

必须使用 PowerShell 7 (`pwsh`)，不能使用 Windows PowerShell 5.1 (`powershell.exe`)。脚本内部依赖 `System.Diagnostics.ProcessStartInfo.ArgumentList`，该属性仅在 .NET Core 3.0+/PowerShell 7+ 可用；在 Windows PowerShell 5.1 下会导致所有 `p4` 子命令以无参形式被调用，并错误判定为成功。

该脚本只执行只读检查，包括 workspace、`.p4config`、`p4 set`、DNS/TCP、`p4 info`、`p4 client -o`、pending CL 列表和 history CL 列表。

Codex Windows 注意事项：

- 如果 Codex shell 缺少 `SystemRoot` 或 `WINDIR`，Winsock provider path 中的 `%SystemRoot%` 无法展开，会导致 `p4`、`curl` 或 TCP socket 创建失败，典型错误为 `WSAEPROVIDERFAILEDINIT`。
- `scripts/test-p4-env.ps1` 会在脚本内补齐 `SystemRoot=C:\Windows` 和 `WINDIR=C:\Windows`。
- 后续 Codex agent 直接运行 P4 命令时，也应在命令前补齐这两个环境变量。

## 3. Milestone 1：项目脚手架

### 目标

建立可运行、可构建、可测试的 Electron + React + TypeScript + Vite + Bun 项目骨架，并安装核心依赖。

### 任务 1.1 初始化项目结构

内容：

- 创建 `package.json`。
- 创建 `tsconfig.json`、`vite.config.ts`。
- 创建 Electron main/preload/renderer 基础入口。
- 创建 `src/main`、`src/preload`、`src/renderer`、`src/core` 目录。
- 创建 `docs` 保持需求、设计、计划文档。

验收：

- `src/main/index.ts` 存在。
- `src/preload/index.ts` 存在。
- `src/renderer/App.tsx` 存在。
- `src/core` 存在。
- `bun install` 可以完成。

Codex 验证：

```bash
bun install
bun run typecheck
```

### 任务 1.2 配置 Electron + Vite 开发和构建脚本

内容：

- 使用 `electron-vite` 作为统一脚手架，同时构建 main、preload、renderer 三个 target。
- 配置 renderer Vite 构建（React 插件）。
- 配置 main/preload TypeScript 构建。
- 配置 `dev`、`build`、`typecheck`、`test` 脚本。
- 确保 Electron 能加载本地 renderer。
- M6 打包使用 `electron-builder`，Windows 为首要目标。

验收：

- `bun run dev` 可以启动桌面应用。
- `bun run build` 可以生成构建产物。
- `bun run typecheck` 通过。

Codex 验证：

```bash
bun run typecheck
bun run build
```

### 任务 1.3 安装并隔离核心库入口

内容：

- 安装 `@pierre/diffs`。
- 安装 `@pierre/trees`。
- 创建 `PierreDiffView.tsx` 薄封装占位。
- 创建 `PierreTreeView.tsx` 薄封装占位。
- 禁止业务层直接散落调用这两个库。

验收：

- `package.json` 包含 `@pierre/diffs` 和 `@pierre/trees`。
- renderer 能 import 两个封装组件。
- 项目能通过类型检查。

Codex 验证：

```bash
bun pm ls @pierre/diffs
bun pm ls @pierre/trees
bun run typecheck
```

### 任务 1.4 建立基础测试框架

内容：

- 统一使用 `bun test` 作为测试框架。
- 建立 `src/**/*.test.ts` 或 `tests` 测试目录。
- 添加一个 smoke test。
- 组件级 DOM 测试如果出现，按需引入 `happy-dom`，不引入第二套测试框架。

验收：

- `bun run test` 可以运行。
- 至少有一个通过的测试。

Codex 验证：

```bash
bun run test
```

### 里程碑 1 完成标准

- 桌面应用骨架能构建。
- 类型检查通过。
- 测试命令可运行。
- `@pierre/diffs` 和 `@pierre/trees` 已接入封装层。

## 4. Milestone 2：P4 环境和 CL 列表

### 目标

实现 P4 命令执行封装、环境检测、Pending CL 列表、History CL 列表和 client view depot path 推导。

### 任务 2.1 实现 P4 命令执行器

内容：

- 创建 `p4Service.ts`。
- 封装 `p4` 命令调用。
- 捕获 stdout、stderr、exit code。
- 返回结构化结果。
- 支持注入 mock executor 供测试使用。

验收：

- 所有 P4 调用集中在 `p4Service`。
- 命令失败能返回结构化错误。
- 测试可 mock P4 输出。

Codex 验证：

```bash
bun run test -- p4Service
bun run typecheck
```

### 任务 2.2 实现 `p4 info` 环境检测

内容：

- 解析 `p4 info` 输出。
- 生成 `P4Environment`。
- 包含 user、client、root、port。
- 对 P4 未安装、未登录、client 无效做错误映射。

验收：

- mock 正常 `p4 info` 输出能得到环境对象。
- mock 未登录输出能得到 `P4_AUTH_REQUIRED`。
- mock 命令不存在能得到 `P4_NOT_FOUND`。

Codex 验证：

```bash
bun run test -- p4Info
```

### 任务 2.3 实现 client view depot path 推导

内容：

- 调用并解析 `p4 client -o`。
- 提取 View 映射中的 depot path。
- 生成 History 默认 depot path 列表。
- 处理多条映射。

验收：

- 单条 View 映射能推导 depot path。
- 多条 View 映射能返回多个 depot path。
- 排除行、注释行、空行不会误解析。

Codex 验证：

```bash
bun run test -- clientView
```

### 任务 2.4 实现 Pending CL 列表

内容：

- 使用当前 client 查询 pending CL。
- 解析 `p4 changes -s pending -c <client>` 输出。
- 转换为 `ChangelistListItem[]`。

验收：

- mock 多条 pending CL 输出能解析为列表。
- 默认 changelist 和 numbered changelist 行为明确。
- 列表项包含 id、kind、date、author/client、description。

Codex 验证：

```bash
bun run test -- pendingChanges
```

### 任务 2.5 实现 History CL 列表

内容：

- 使用 depot path 查询 submitted CL。
- 默认 limit 为 50。
- 解析 `p4 changes -s submitted -m 50 <depotPath>/...` 输出。
- 转换为 `ChangelistListItem[]`。

验收：

- mock submitted CL 输出能解析为列表。
- 命令参数包含 `-m 50`。
- 没有 depot path 时能给出明确错误或降级策略。

Codex 验证：

```bash
bun run test -- historyChanges
```

### 任务 2.6 暴露 IPC API

内容：

- 实现 `getP4Environment()`。
- 实现 `listPendingChanges()`。
- 实现 `listHistoryChanges()`。
- preload 中只暴露受控 API。

验收：

- renderer 不能直接访问 Node/P4。
- API 类型与设计文档一致。
- mock IPC 调用测试通过。

Codex 验证：

```bash
bun run test -- ipc
bun run typecheck
```

### 里程碑 2 完成标准

- P4 环境检测可 mock 验证。
- Pending CL 列表可 mock 验证。
- History CL 列表可 mock 验证。
- client view depot path 推导可 mock 验证。
- IPC API 类型稳定。

## 5. Milestone 3：CL 文件列表和文件内容对

### 目标

实现 pending/submitted CL 文件列表读取，以及点击文件时生成 `FileContentPair`。

### 任务 3.1 解析 pending CL 文件列表

内容：

- 调用 `p4 opened -c <cl>`。
- 解析 depot path、action、revision。
- 映射到 `ChangeFile`。

验收：

- 支持 `edit`、`add`、`delete`。
- 未识别 action 映射为 `unknown` 或 `UNSUPPORTED_ACTION`。
- 文件状态映射准确。

Codex 验证：

```bash
bun run test -- pendingFiles
```

### 任务 3.2 解析 submitted CL 文件列表

内容：

- 调用 `p4 describe <cl>`。
- 解析 submitted CL 文件、action、revision。
- 推导 oldRev/newRev。
- 映射到 `ChangeFile`。

验收：

- 支持 `edit`、`add`、`delete`。
- edit 文件能推导 oldRev/newRev。
- add/delete 文件空侧规则正确。

Codex 验证：

```bash
bun run test -- submittedFiles
```

### 任务 3.3 实现 depot path 到 local path 映射

内容：

- 调用并解析 `p4 where <depotPath>`。
- 支持 Windows 路径。
- 处理路径中空格。

验收：

- mock `p4 where` 输出能得到 localPath。
- Windows 反斜杠路径保留正确。
- 路径不存在时返回结构化错误。

Codex 验证：

```bash
bun run test -- p4Where
```

### 任务 3.4 实现 pending 文件内容对

内容：

- edit：左侧 `p4 print -q <depotPath>#have`，右侧读 localPath。
- add：左侧 null，右侧读 localPath。
- delete：左侧 `p4 print -q <depotPath>#have`，右侧 null。
- 二进制文件不进入文本 diff。

验收：

- 三种 action 的 `FileContentPair` 生成规则正确。
- leftLabel/rightLabel 清晰。
- 本地文件缺失时返回 `FILE_NOT_FOUND`。

Codex 验证：

```bash
bun run test -- pendingContentPair
```

### 任务 3.5 实现 submitted 文件内容对

内容：

- edit：左侧 print oldRev，右侧 print newRev。
- add：左侧 null，右侧 print newRev。
- delete：左侧 print oldRev，右侧 null。
- 结果生成 `FileContentPair`。

验收：

- 三种 action 的 `FileContentPair` 生成规则正确。
- revision 标签清晰。
- print 失败时返回结构化错误。

Codex 验证：

```bash
bun run test -- submittedContentPair
```

### 任务 3.6 实现大文件和大 CL 提示逻辑

内容：

- 单文件超过 2 MB 时返回 `LARGE_FILE_REQUIRES_CONFIRMATION`。
- 单个 CL 超过 500 个文件时返回提示状态。
- 支持用户确认后继续加载大文件。

验收：

- mock 文件大小超过 2 MB 时不会自动读取内容。
- mock CL 文件数超过 500 时返回大 CL 标记。
- 用户确认参数能绕过大文件提示。

Codex 验证：

```bash
bun run test -- largeFile
bun run test -- largeChange
```

### 任务 3.7 暴露 CL 和文件内容 IPC API

内容：

- 实现 `loadChangelist()`。
- 实现 `loadFileContentPair()`。
- 保持文件内容懒加载。

验收：

- 选择 CL 只加载文件列表，不加载所有文件内容。
- 点击文件才加载内容。
- IPC API 类型与设计文档一致。

Codex 验证：

```bash
bun run test -- changeIpc
bun run typecheck
```

### 里程碑 3 完成标准

- Pending/submitted CL 文件列表解析完整。
- Pending/submitted 文件内容对生成完整。
- 大文件和大 CL 逻辑可测试。
- 文件 diff 已具备懒加载数据基础。

## 6. Milestone 4：桌面 UI 和核心组件接入

### 目标

实现可用的 Pending/History 桌面界面，接入 `@pierre/trees` 和 `@pierre/diffs`。

### 任务 4.1 实现应用主布局

内容：

- 实现顶部 Pending/History 切换。
- 实现 CL 输入框和加载按钮。
- 实现左侧 CL 列表区域。
- 实现左侧文件树区域。
- 实现右侧 diff 区域。
- 实现状态栏。

验收：

- 页面结构符合设计文档。
- 窗口初始状态清晰。
- 空状态和加载状态可见。

Codex 验证：

```bash
bun run build
```

可选 UI 验证：

- 启动 `bun run dev`。
- 使用浏览器/截图工具检查主布局无明显重叠。

### 任务 4.2 实现 Pending Page

内容：

- 页面加载时调用 `listPendingChanges()`。
- 显示 pending CL 列表。
- 点击 CL 调用 `loadChangelist()`。
- 显示当前 CL 头部信息。

验收：

- mock API 下 Pending 列表可渲染。
- 点击 CL 后文件树区域收到文件数据。
- P4 错误能显示。

Codex 验证：

```bash
bun run test -- PendingPage
bun run build
```

### 任务 4.3 实现 History Page

内容：

- 页面加载时调用 `getP4Environment()` 获取 depot path。
- 调用 `listHistoryChanges({ limit: 50 })`。
- 显示 submitted CL 列表。
- 支持输入 CL 编号直接打开。

验收：

- mock API 下 History 列表可渲染。
- 默认 limit 为 50。
- 输入 CL 编号能触发 `loadChangelist()`。

Codex 验证：

```bash
bun run test -- HistoryPage
bun run build
```

### 任务 4.4 接入 `@pierre/trees`

内容：

- 实现 `PierreTreeView`。
- 将 `ChangeFile[]` 转换为 `@pierre/trees` 需要的数据。
- 显示文件状态。
- 点击文件触发选择回调。

验收：

- 文件路径能按目录层级显示。
- added/deleted/modified 状态可见。
- 点击文件能请求 `loadFileContentPair()`。
- 项目没有自研完整树渲染主路径。

Codex 验证：

```bash
bun run test -- PierreTreeView
bun run typecheck
```

### 任务 4.5 接入 `@pierre/diffs`

内容：

- 实现 `PierreDiffView`。
- 传入 leftText/rightText、文件名、布局、主题、行号等配置。
- 支持空侧内容。
- 支持二进制文件提示。

验收：

- modified 文件能渲染 diff。
- add 文件左侧为空，右侧新增。
- delete 文件左侧删除，右侧为空。
- 语法高亮由 `@pierre/diffs` 提供。
- 项目没有自研完整 diff 渲染主路径。

Codex 验证：

```bash
bun run test -- PierreDiffView
bun run typecheck
bun run build
```

### 任务 4.6 实现错误、空状态和加载状态

内容：

- P4 未安装。
- P4 未登录。
- CL 不存在。
- 文件不存在。
- 大文件确认。
- 二进制文件。

验收：

- 每种错误有可读提示。
- 错误不导致整页崩溃。
- 文件级错误不影响 CL 列表和文件树继续使用。

Codex 验证：

```bash
bun run test -- errorStates
bun run build
```

### 里程碑 4 完成标准

- Pending/History UI 可运行。
- CL 列表、文件树、diff 区域串通。
- `@pierre/diffs` 和 `@pierre/trees` 已作为主渲染路径。
- 基础错误状态完整。

## 7. Milestone 5：体验完善和配置持久化

### 目标

完善第一版阅读体验，包括视图切换、状态筛选、隐藏未变化文件、配置持久化、Windows 路径和编码处理。

### 任务 5.1 实现 unified/side-by-side 切换

内容：

- 顶部工具栏提供视图切换。
- 切换时只更新 `@pierre/diffs` 布局配置。
- 不重新读取 P4。

验收：

- 切换 unified 和 side-by-side 后 diff 内容保持一致。
- 不触发新的 `loadFileContentPair()`。
- 默认视图来自配置。

Codex 验证：

```bash
bun run test -- diffViewMode
```

### 任务 5.2 实现文件状态筛选

内容：

- 支持 added/deleted/modified/unchanged 状态筛选。
- 文件树输入数据按状态过滤后传给 `@pierre/trees`。
- 不做路径搜索。

验收：

- 单选或多选状态筛选生效。
- 清空筛选恢复全部文件。
- 筛选不会改变原始 CL 数据。

Codex 验证：

```bash
bun run test -- fileStatusFilter
```

### 任务 5.3 实现隐藏未变化文件

内容：

- 工具栏提供 hide unchanged。
- 配置可持久化。
- 对 `unchanged` 文件过滤。

验收：

- 开启后文件树不显示 unchanged 文件。
- 关闭后恢复。
- 配置保存后重启仍生效。

Codex 验证：

```bash
bun run test -- hideUnchanged
```

### 任务 5.4 实现配置持久化

内容：

- 实现 `configService`。
- 存储在用户 app data。
- 支持 get/update。
- 包含默认值。

验收：

- 没有配置文件时返回默认配置。
- 更新配置后能再次读取。
- 无效配置能回退默认值。

Codex 验证：

```bash
bun run test -- configService
```

### 任务 5.5 补齐 Windows 路径处理

内容：

- depot path 和 local path 分开处理。
- 本地路径支持反斜杠。
- 支持路径中空格。
- 不把 depot path 当作本地路径处理。

验收：

- mock Windows 路径测试通过。
- `p4 where` 解析路径中空格时正确。
- 文件读取使用 localPath。

Codex 验证：

```bash
bun run test -- windowsPath
```

### 任务 5.6 补齐文本编码和换行处理

内容：

- 默认按 UTF-8 读取。
- 保留或合理处理 CRLF。
- 二进制文件检测。
- 读取失败时返回结构化错误。

验收：

- UTF-8 文件读取正确。
- CRLF 文件不破坏显示。
- 二进制文件不传给 diff。

Codex 验证：

```bash
bun run test -- fileService
```

### 任务 5.7 最终构建和回归

内容：

- 完成第一版回归。
- 确保所有测试通过。
- 确保构建通过。
- 检查第一版非目标未被误加入。

验收：

- typecheck 通过。
- test 通过。
- build 通过。
- 没有自研 diff/tree 主渲染器。
- 没有 shelved CL、文件搜索、导出报告入口。

Codex 验证：

```bash
bun run typecheck
bun run test
bun run build
```

### 里程碑 5 完成标准

- 第一版 MVP 功能完整。
- 配置和基础体验完整。
- Windows 路径、编码、大文件、大 CL 都有处理。
- 构建和测试全部通过。

## 8. Milestone 6：第一版发布准备

### 目标

将 MVP 整理成可本地使用的第一版 Windows 应用。

### 任务 6.1 打包配置

内容：

- 配置 Electron 打包工具。
- 生成 Windows 可运行产物。
- 保留开发构建和生产构建脚本。

验收：

- `bun run package` 能生成 Windows 应用产物。
- 产物能启动。
- 应用不依赖开发服务器运行。

Codex 验证：

```bash
bun run package
```

### 任务 6.2 本地 smoke 验证

内容：

- 启动打包产物。
- 检查 Pending/History 页面。
- 检查无 P4 环境或 P4 错误时提示。
- 如果本机有 P4 环境，额外验证真实 CL。

验收：

- 无 P4 环境时应用不崩溃。
- P4 错误提示清晰。
- 有 P4 环境时能加载列表和文件 diff。

Codex 验证：

```bash
bun run smoke
```

如果 `smoke` 脚本无法自动覆盖真实 P4，Codex agent 应至少完成无 P4/mock P4 smoke 验证。

### 任务 6.3 文档整理

内容：

- 更新 README。
- 写明安装、运行、P4 环境前置条件。
- 写明第一版支持和不支持的功能。
- 写明常见错误处理。

验收：

- README 可指导本地启动。
- README 明确需要本机 `p4` 和已登录状态。
- README 明确第一版不支持 shelved/search/export。

Codex 验证：

```bash
Get-Content README.md
```

### 里程碑 6 完成标准

- Windows 应用可打包。
- smoke 验证通过。
- README 完整。
- 第一版可以交付本地使用。

## 9. 总体验收清单

第一版完成时，Codex agent 应执行并通过：

```bash
bun install
bun run typecheck
bun run test
bun run build
bun run package
```

功能验收：

- 应用启动后显示 Pending/History 两个页面。
- Pending 只查询当前 workspace/client。
- History 从当前 client view 推导 depot path，并默认加载最近 50 条。
- 点击 CL 后显示文件树。
- 文件树由 `@pierre/trees` 封装组件渲染。
- 点击文件后懒加载 `FileContentPair`。
- Diff 由 `@pierre/diffs` 封装组件渲染。
- unified/side-by-side 可切换。
- 大文件超过 2 MB 时提示确认。
- 大 CL 超过 500 文件时提示。
- P4 未安装、未登录、命令失败都有提示。

范围验收：

- 没有 shelved CL 主流程。
- 没有文件路径搜索。
- 没有全文搜索。
- 没有导出报告。
- 没有自研 diff 渲染主路径。
- 没有自研文件树渲染主路径。
