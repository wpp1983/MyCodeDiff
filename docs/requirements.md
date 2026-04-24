# MyCodeDiff 需求文档

## 1. 项目背景

MyCodeDiff 是一个面向个人使用场景定制的 Windows 桌面 diff 工具，主要用于查看 Perforce/P4 changelist 中的代码变更。

项目核心依赖：

- `@pierre/diffs`：负责文本或结构化内容的差异计算、语法高亮、unified diff 和 side-by-side diff 渲染。
- `@pierre/trees`：负责目录树、文件树或层级结构的构建与展示。

MyCodeDiff 自身重点负责 P4 数据获取、Pending/History 图形界面、CL 列表、配置和状态管理。

## 2. 项目目标

### 2.1 核心目标

- 提供一个轻量、可定制、个人化的 P4 diff 桌面工具。
- 提供两个图形化主界面：Pending 和 History。
- Pending 页面查看当前 workspace/client 下的 pending changelist。
- History 页面查看当前 workspace 对应 depot 路径范围内的 submitted changelist。
- 点击 CL 后用文件树展示该 CL 中的文件变更。
- 点击文件后用 `@pierre/diffs` 展示 diff。
- 同时支持 unified diff 和左右并排 diff。
- 语法高亮完全交给 `@pierre/diffs`，项目自身不单独实现语法高亮。
- 文件树构建和展示完全交给 `@pierre/trees`，项目自身不单独实现文件树渲染器。

### 2.2 非目标

- 第一版不支持 shelved CL，只保留后续扩展点。
- 第一版不做 Git diff。
- 第一版不做普通文件夹对比主流程。
- 第一版不做文件路径搜索。
- 第一版不做全文内容搜索。
- 第一版不导出 HTML、Markdown 或文本 diff 报告。
- 第一版不优先支持二进制文件内容 diff。
- 第一版不保证 macOS/Linux，只保证 Windows。

## 3. 目标用户

当前主要目标用户是项目作者本人。

典型使用者特征：

- 使用 Perforce/P4 管理代码。
- 经常查看 pending CL 和 submitted CL。
- 希望用更顺手的图形界面查看 P4 diff。
- 更看重本地、快速、清晰、可定制，而不是复杂团队协作能力。

## 4. 使用场景

### 4.1 Pending 图形界面

用户打开 Pending 页面，查看当前 workspace/client 下尚未提交的 changelist。

基础能力：

- 显示当前 workspace/client 下的 pending CL 列表。
- 区分默认 changelist 和 numbered changelist。
- 点击某个 pending CL 后显示该 CL 的文件树。
- 点击文件后对比 depot 基准版本和本地 workspace 文件。
- 支持刷新 pending CL 列表。
- 支持按文件状态筛选。
- 支持隐藏未变化文件。

### 4.2 History 图形界面

用户打开 History 页面，查看当前 workspace 对应 depot 路径范围内最近 50 条 submitted CL。

基础能力：

- 从当前 P4 client view 推导默认 depot 路径范围。
- 默认加载最近 50 条 submitted CL。
- 点击某个 submitted CL 后显示该 CL 的文件树。
- 点击文件后对比提交前 revision 和提交后 revision。
- 支持刷新历史列表。
- 支持输入 CL 编号直接定位到历史 CL。
- 支持按文件状态筛选。
- 支持隐藏未变化文件。

### 4.3 Diff 阅读

用户在 Pending 或 History 页面中选择文件后查看 diff。

基础能力：

- 使用 `@pierre/diffs` 渲染 diff。
- 支持 unified diff。
- 支持 side-by-side diff。
- 支持语法高亮。
- 支持行号。
- 支持忽略空白差异。
- 支持上下文行数量配置。
- 大文件按需确认后加载。

## 5. 功能需求

### 5.1 P4 环境

第一版使用当前系统/P4 默认环境，不在应用内单独配置 P4 server/user/client。

依赖条件：

- 本机已安装 `p4` 命令。
- 用户已在外部完成 `p4 login`。
- 当前环境能正常执行 `p4 info`。
- 当前 `P4CLIENT` 就是工具使用的 workspace/client。

### 5.2 输入能力

第一版应支持：

- 从 Pending 页面选择 pending CL。
- 从 History 页面选择 submitted CL。
- 输入 P4 CL 编号直接打开。

第一版不支持：

- shelved CL。
- Git commit/branch/tag。
- 拖拽文件或目录。
- 文件路径搜索。
- 全文内容搜索。

### 5.3 Pending CL

第一版 Pending 页面应支持：

- 只显示当前 workspace/client 下的 pending CL。
- 读取 pending CL 文件列表。
- 对 `edit` 文件比较 depot have revision 和本地文件。
- 对 `add` 文件显示右侧新增内容。
- 对 `delete` 文件显示左侧删除内容。

### 5.4 History CL

第一版 History 页面应支持：

- 从当前 P4 client view 推导 depot 路径范围。
- 默认读取最近 50 条 submitted CL。
- 读取 submitted CL 文件列表。
- 对 `edit` 文件比较提交前 revision 和提交后 revision。
- 对 `add` 文件显示右侧新增内容。
- 对 `delete` 文件显示左侧删除内容。

### 5.5 Diff 展示

第一版 diff 展示应满足：

- 使用 `@pierre/diffs` 作为完整 diff 渲染组件。
- 由 `@pierre/diffs` 负责 diff 计算。
- 由 `@pierre/diffs` 负责语法高亮。
- 由 `@pierre/diffs` 负责 unified 和 side-by-side 布局。
- MyCodeDiff 只负责传入左右文件内容、文件名、语言/扩展名、主题和显示配置。

### 5.6 文件树展示

第一版文件树展示应满足：

- 使用 `@pierre/trees` 作为完整文件树构建与展示组件。
- 由 `@pierre/trees` 负责树结构和树 UI。
- MyCodeDiff 只负责传入文件路径、文件状态、点击回调和必要的展示配置。

### 5.7 筛选与导航

第一版支持：

- Pending/History 页面切换。
- CL 列表刷新。
- 文件状态筛选。
- 展开或折叠目录。
- 隐藏未变化文件。
- unified/side-by-side 视图切换。

第一版不支持：

- 文件路径搜索。
- 全文搜索。
- 导出报告。

## 6. 非功能需求

### 6.1 平台

- 第一版只保证 Windows。
- 后续可扩展 macOS/Linux，但不作为第一版承诺。

### 6.2 性能

- CL 文件列表正常加载。
- 文件 diff 按点击懒加载。
- 单文件超过 2 MB 时不自动打开 diff，需要用户确认。
- 单个 CL 超过 500 个文件时提示大 CL。
- 第一版不做复杂虚拟滚动或分块 diff。

### 6.3 本地优先

- 默认在本地运行。
- 不依赖云服务。
- 不上传用户代码。

## 7. 第一版 MVP

第一版必须完成：

- Electron 桌面应用启动。
- React + TypeScript + Vite + Bun 项目结构。
- Pending 图形界面。
- History 图形界面。
- 当前 P4 默认环境检测。
- 当前 client view depot 路径推导。
- Pending CL 列表。
- History 最近 50 条 CL 列表。
- CL 文件树展示。
- 点击文件加载左右内容。
- `@pierre/diffs` diff 渲染。
- `@pierre/trees` 文件树渲染。
- unified/side-by-side 切换。
- 大文件和大 CL 提示。
- 基础错误提示。

## 8. 术语约定

- P4：Perforce Helix Core 的命令行工具和版本控制系统。
- CL：changelist，P4 中的一组文件变更。
- pending CL：尚未提交的 changelist。
- submitted CL：已经提交的 changelist。
- shelved CL：已 shelve 到服务器但尚未提交的 changelist，第一版不支持。
- Pending 页面：查看当前 workspace/client 下待提交 CL 的图形界面。
- History 页面：查看当前 workspace 对应 depot 路径范围内 submitted CL 的图形界面。
- 左侧：基准版本。
- 右侧：目标版本。

