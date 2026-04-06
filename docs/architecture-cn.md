# CC Buddy 架构说明

## 1. 项目目标

CC Buddy 是一个基于 Tauri 的桌面监控应用，用来被动观察本地 Claude Code 的运行状态，并把会话活跃度、工具使用情况、伴侣信息映射成“桌宠”视图。

它的目标不是控制 Claude Code，而是：

1. 只读采集本地状态。
2. 实时推断当前会话行为。
3. 用低打扰、常驻桌面的方式把这些状态展示出来。

当前版本主要解决三个问题：

1. 从本地文件系统发现仍然活跃的 Claude Code session。
2. 从 session 对应的 JSONL 事件流中推断“当前在做什么”。
3. 把这些状态同时呈现为桌宠浮层窗口和仪表盘窗口。

## 2. 运行形态

应用当前有两个窗口：

- `pet`：透明置顶的桌宠窗口，路由为 `/pet`
- `dashboard`：普通层级的信息面板窗口，路由为 `/dashboard`

窗口定义在 [`../app/src-tauri/tauri.conf.json`](../app/src-tauri/tauri.conf.json)。

前端入口在 [`../app/src/main.tsx`](../app/src/main.tsx)。这里根据 `window.location.pathname` 在两个界面之间切换：

- `/pet` -> 渲染 [`../app/src/PetWindow.tsx`](../app/src/PetWindow.tsx)
- 其他路径 -> 渲染 [`../app/src/App.tsx`](../app/src/App.tsx)

## 3. 总体架构

整体采用 Tauri 的双层结构：

- 前端：`React + TypeScript + Vite`
- 桌面壳与本地能力：`Tauri + Rust`

数据流保持单向：

1. Rust 侧读取 `~/.claude/sessions`、`~/.claude/projects` 和 `.claude.json`
2. Rust 侧维护运行时状态，并增量消费 JSONL 变化
3. Rust 侧通过 Tauri 事件把 `monitor-snapshot` / `monitor-delta` 推给前端
4. 前端合并状态后，驱动 dashboard 与 pet window 的 UI

## 4. 前端分层

### 4.1 路由与窗口入口

[`../app/src/main.tsx`](../app/src/main.tsx) 负责：

- 根据 URL 决定进入 pet window 还是 dashboard
- 在 `/pet` 时给根节点加上 `pet-mode`，让整棵 DOM 使用透明背景

### 4.2 Dashboard 展示层

[`../app/src/App.tsx`](../app/src/App.tsx) 是仪表盘界面，负责：

- 展示 companion 信息
- 展示 Top 3 活跃 rooms
- 展示 event feed

它消费的是统一的 `snapshot` 结构，不直接接触底层文件或 Tauri 细节。

### 4.3 Pet Window 展示层

[`../app/src/PetWindow.tsx`](../app/src/PetWindow.tsx) 是桌宠浮层窗口，负责：

- 根据当前最活跃 room 选择宠物情绪和文案
- 播放对应的 `.webm` 动画
- 管理气泡淡入淡出
- 提供悬停边框和窗口拖拽体验

当前宠物窗口布局规则为：

1. 上方保留约 `20%` 的气泡区域。
2. 下方使用一个始终 `1:1` 的宠物舞台。
3. 宠物舞台内部有一个约 `70%` 尺寸、轻微下移的白色径向渐隐圆形背景。
4. 视频层覆盖在圆形背景之上，使用 `object-fit: contain` 保证宠物显示完整。

这些样式定义在 [`../app/src/PetWindow.css`](../app/src/PetWindow.css)。

当前最活跃 room 的选择不是机械地固定取 `rooms[0]`，而是会根据 `latestEvent.timestamp` 和 `session.updatedAt` 重新比较活动时间，优先跟随最新活跃的 session，避免桌宠停留在旧 room 上。

### 4.4 前端桥接层

[`../app/src/bridge/monitor.ts`](../app/src/bridge/monitor.ts) 负责屏蔽运行环境差异：

- 在 Tauri 环境下，通过 `invoke + listen` 调用 Rust 命令与事件
- 在普通浏览器开发环境下，退回到 demo/mock 数据

这样前端组件不需要知道当前是在真实桌面窗口里，还是在纯 Vite 页面里。

### 4.5 Hooks 与领域模型

前端逻辑主要分布在以下位置：

- [`../app/src/hooks/useMonitorState.ts`](../app/src/hooks/useMonitorState.ts)：拉取初始快照并订阅 delta
- [`../app/src/hooks/usePetAnimation.ts`](../app/src/hooks/usePetAnimation.ts)：驱动宠物动画状态机与视频切换
- [`../app/src/domain/types.ts`](../app/src/domain/types.ts)：统一数据模型
- [`../app/src/domain/behavior.ts`](../app/src/domain/behavior.ts)：行为到宠物状态的前端映射
- [`../app/src/domain/companion.ts`](../app/src/domain/companion.ts)：伴侣信息整理
- [`../app/src/domain/monitor.ts`](../app/src/domain/monitor.ts)：快照构造语义
- [`../app/src/domain/monitorDelta.ts`](../app/src/domain/monitorDelta.ts)：增量合并逻辑
- [`../app/src/domain/animationMachine.ts`](../app/src/domain/animationMachine.ts)：宠物动画切换状态机
- [`../app/src/domain/videoPath.ts`](../app/src/domain/videoPath.ts)：动画资源路径解析

## 5. Rust 运行时层

Rust 主体在 [`../app/src-tauri/src/lib.rs`](../app/src-tauri/src/lib.rs)。

它维护一个 `MonitorRuntime`，里面缓存：

- 当前 companion 状态
- 活跃 sessions
- `sessionId -> logPath` 的映射
- 每个日志文件的 `tail offset` 与 `remainder`
- 每个 session 的最新事件

它可以理解为应用的“真实状态树”。

文件系统变化先进入 `MonitorRuntime`，再由运行时统一产生：

- `monitor-snapshot`：完整状态，用于初始化和兜底恢复
- `monitor-delta`：局部变化，用于运行中的高频更新

## 6. 数据来源与职责边界

### 6.1 Session 元数据

来源：`~/.claude/sessions/*.json`

作用：

- 发现有哪些 session 存在
- 读取 `pid`、`cwd`、`sessionId`、`startedAt`
- 结合进程探测判断 session 是否仍然活跃

### 6.2 会话事件流

来源：`~/.claude/projects/<slug>/<sessionId>.jsonl`

作用：

- 提供 `assistant`、`tool_use`、`result`、`error` 等行为信号
- 作为宠物情绪、动作、说明文案的核心推断来源

### 6.3 Companion 信息

来源：`.claude.json` 的 `companion` 字段

作用：

- 同步宠物名字、性格、孵化时间
- 计算 `ageDays`

## 7. 实时更新机制

### 7.1 文件监听

Rust 侧通过 `notify` 监听：

- `~/.claude/sessions`
- `~/.claude/projects`
- 当前工作目录或用户目录下可命中的 `.claude.json`

目标不是“定时整仓扫描”，而是把本地文件变化转成局部刷新信号。

### 7.2 增量 JSONL tail

相比整文件重读，当前实现已升级为增量 tail：

- 每个 JSONL 文件维护 `offset`
- 只读取新增字节
- 不完整尾行进入 `remainder`
- 下一次读取时继续拼接解析

这样可以明显减少长会话日志的重复读取成本。

### 7.3 Snapshot 与 Delta 协同

前端首次进入时先获取完整快照，之后主要消费 delta，并通过 [`../app/src/domain/monitorDelta.ts`](../app/src/domain/monitorDelta.ts) 合并到当前状态。

这种设计的收益是：

- 首屏稳定
- 持续更新成本更低
- 前后端协议更清晰

## 8. 行为推断与动画语义

前后端保持同一套行为语义：

- 前端规则在 [`../app/src/domain/behavior.ts`](../app/src/domain/behavior.ts)
- Rust 规则在 [`../app/src-tauri/src/lib.rs`](../app/src-tauri/src/lib.rs)

当前核心映射大致如下：

- `assistant` -> `thinking / pondering`
- `tool_use + Bash` -> `excited / running_command`
- `tool_use + Edit/Write` -> `focused / writing_code`
- `tool_use + Read` -> `curious / reading`
- `tool_use + Grep/Glob` -> `hunting / searching`
- `tool_use + Agent` -> `busy / delegating`
- `result` -> `happy / celebrating`
- `error` -> `worried / debugging`

同时还包含“陈旧事件回落 idle”的规则：

- 如果最近事件或会话更新时间超过 30 秒无变化
- 即使最后一次是 `thinking` 或 `writing_code`
- 也会回落为 `idle / sleeping`

在 pet window 中，情绪切换并不是直接替换静态资源，而是通过 [`../app/src/domain/animationMachine.ts`](../app/src/domain/animationMachine.ts) 和 [`../app/src/hooks/usePetAnimation.ts`](../app/src/hooks/usePetAnimation.ts) 驱动 `from -> to` 的 `.webm` 动画过渡。

## 9. Pet Window 交互约定

当前桌宠窗口除展示外，还承担基础桌面交互：

### 9.1 悬停边框

当鼠标移入 pet window 时，窗口外围会显示一圈高亮边框，方便用户识别透明窗口边缘并做窗口大小调整。

实现位置：

- 结构：[`../app/src/PetWindow.tsx`](../app/src/PetWindow.tsx)
- 样式：[`../app/src/PetWindow.css`](../app/src/PetWindow.css)

### 9.2 窗口拖拽

当前拖拽采用双保险：

1. 容器层保留 `data-tauri-drag-region`
2. 中间宠物舞台在左键按下时显式调用 `getCurrentWindow().startDragging()`

这样可以避免点击落在内部舞台层时，透明窗口因为事件命中层级不同而拖不动。

对应实现位于 [`../app/src/PetWindow.tsx`](../app/src/PetWindow.tsx)。

### 9.3 气泡文案来源

宠物气泡文案与 dashboard 中 live room 列表每一行最右侧的说明文案保持同源，优先使用：

`room.latestEvent?.detail ?? room.petState.label`

这意味着：

- 如果 room 有最新事件描述，气泡直接显示该事件摘要
- 如果没有事件摘要，才回退到宠物状态文案

这样 pet window 和 dashboard 在“当前 room 正在做什么”的表述上能保持一致。

## 10. 调试与开发方式

### 10.1 整体联调

推荐的整体联调命令是：

```powershell
Set-Location D:\repo\cc-buddy\app
npm run tauri:dev
```

这会同时启动：

- Vite 前端开发服务
- Tauri 桌面应用壳
- 真实的 `pet` / `dashboard` 窗口

适合调试完整链路，包括：

- Rust 文件监听
- snapshot / delta 推送
- 宠物动画与窗口交互

### 10.2 仅前端调试

```powershell
Set-Location D:\repo\cc-buddy\app
npm run dev
```

适合只调 UI，不依赖真实 Tauri 环境时使用。

### 10.3 常用验证命令

前端验证：

```powershell
Set-Location D:\repo\cc-buddy\app
npm test
npm run lint
npm run build
```

Rust 验证：

```powershell
Set-Location D:\repo\cc-buddy\app\src-tauri
cargo.exe test
```

### 10.4 文档维护说明

当前仓库没有“调试结束后自动写回 `docs/`”的脚本。

也就是说：

- `npm run tauri:dev` 只负责启动联调
- `docs/architecture-cn.md` 需要在架构或交互发生变化后手动更新

## 11. 当前设计的优点与限制

### 优点

- 纯只读集成，不侵入 Claude Code
- 前后端职责清晰，UI 可脱离真实数据独立开发
- Rust 侧已具备增量 tail 与事件推送能力
- Pet window 与 dashboard 共享统一数据模型
- 宠物窗口已具备透明浮层、拖拽和边界提示能力
- dashboard 不再强制置顶，更符合普通信息面板的桌面使用习惯

### 限制

- 当前 `activeCount` 更偏向“当前展示中的活跃房间数”，不是完整 session 总量统计
- watcher 仍以目录级监听为主，还可以进一步收窄到命中的 session log
- 现在推的是“结构化状态变化”，还没细化到更低层级的动画事件
- idle 阈值目前是固定值，后续可以配置化

## 12. 后续演进建议

后续可以按下面方向继续演进：

1. 把 `activeCount` 改成真实活跃会话总数，并把“展示前三个”与“统计总数”解耦。
2. 把 watcher 收窄到已命中的 session 日志文件，减少无关目录噪音。
3. 在 delta 之上再增加更细粒度的动画事件，让桌宠动作更自然。
4. 把 idle 时间阈值做成可配置项。
5. 继续补点击穿透、托盘控制和更完整的透明窗口交互策略。

这份架构的核心思想可以概括为一句话：

“Rust 负责理解本地世界，React 负责把这种理解温和地呈现出来。”
