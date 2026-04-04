# CC Buddy 框架说明

## 1. 项目目标

CC Buddy 是一个基于 Tauri 的桌面监控应用，用来被动观察本地 Claude Code 运行状态，并把会话活跃度、工具使用情况、伴侣信息映射成“桌宠”视图。它的设计重点不是控制 Claude Code，而是只读采集、实时推断和低打扰展示。

当前版本解决的是三个核心问题：

1. 从本地文件系统发现正在运行的 Claude Code session。
2. 从 session 的 JSONL 事件流里推断每个会话当前在做什么。
3. 把这些状态以轻量、可持续刷新的桌面 UI 呈现出来。

## 2. 总体架构

整体采用 Tauri 的双层结构：

- 前端：`React + TypeScript + Vite`
- 桌面壳与本地能力：`Tauri + Rust`

数据流是单向的：

1. Rust 侧读取 `~/.claude/sessions`、`~/.claude/projects` 和 `.claude.json`
2. Rust 侧构建运行时快照，并对变更做增量 tail
3. Rust 侧通过 Tauri event 把 `snapshot` / `delta` 推给前端
4. 前端合并状态并驱动桌宠场景、房间列表和事件 feed

## 3. 模块分层

### 3.1 前端展示层

前端入口在 [`App.tsx`](D:/repo/cc-buddy/.worktrees/pet-monitor/app/src/App.tsx)。

它负责三件事：

- 初始化首屏快照
- 订阅 Rust 推送的增量事件
- 把会话状态渲染成桌宠舞台、会话列表和事件 feed

前端没有文件系统访问能力，也不直接解析 Claude 原始文件；它只消费统一的数据模型。

### 3.2 前端桥接层

桥接层位于 [`monitor.ts`](D:/repo/cc-buddy/.worktrees/pet-monitor/app/src/bridge/monitor.ts)。

它屏蔽了两种运行环境差异：

- 在 Tauri 环境下，通过 `invoke + listen` 调用 Rust 命令和事件
- 在普通浏览器开发环境下，退回到 demo/mock 数据，保证 UI 可以独立开发

这层的价值是把“桌面能力”与“界面逻辑”分离，前端组件不需要知道当前是在真实桌面应用里，还是纯 Vite 开发模式里。

### 3.3 领域模型层

领域模型集中在 `app/src/domain`：

- [`types.ts`](D:/repo/cc-buddy/.worktrees/pet-monitor/app/src/domain/types.ts)：统一定义 `SessionSnapshot`、`ConversationEvent`、`MonitorSnapshot`、`MonitorDelta` 等模型
- [`behavior.ts`](D:/repo/cc-buddy/.worktrees/pet-monitor/app/src/domain/behavior.ts)：把事件类型映射成桌宠状态
- [`jsonl.ts`](D:/repo/cc-buddy/.worktrees/pet-monitor/app/src/domain/jsonl.ts)：前端侧 JSONL 解析工具与测试支撑
- [`companion.ts`](D:/repo/cc-buddy/.worktrees/pet-monitor/app/src/domain/companion.ts)：伴侣信息整理
- [`monitor.ts`](D:/repo/cc-buddy/.worktrees/pet-monitor/app/src/domain/monitor.ts)：快照构造与排序语义
- [`monitorDelta.ts`](D:/repo/cc-buddy/.worktrees/pet-monitor/app/src/domain/monitorDelta.ts)：前端增量合并逻辑

这里定义的是“应用理解世界的方式”，而不是某个 UI 的实现细节，所以它可以被测试、复用，也方便后续替换展示形式。

### 3.4 Rust 运行时层

Rust 主体在 [`lib.rs`](D:/repo/cc-buddy/.worktrees/pet-monitor/app/src-tauri/src/lib.rs)。

它维护一个 `MonitorRuntime`，里面缓存：

- 当前 companion 状态
- 活跃 sessions
- 每个 session 对应的日志路径
- 每个日志文件的 tail offset 与 remainder
- 每个 session 的最新事件

可以把它理解成“应用内存中的真实状态树”。文件系统变化先进运行时，再由运行时统一生成快照或增量推送给前端。

## 4. 数据来源与职责边界

### 4.1 Session 元数据

来源：`~/.claude/sessions/*.json`

作用：

- 发现有哪些 session 存在
- 拿到 `pid`、`cwd`、`sessionId`、`startedAt`
- 结合进程探测判断会话是否还活着

Rust 侧会周期性/事件驱动地刷新这部分状态，并建立 `sessionId -> logPath` 的映射。

### 4.2 会话事件流

来源：`~/.claude/projects/<slug>/<sessionId>.jsonl`

作用：

- 提供 assistant、tool_use、tool_result、result、error 等行为信号
- 用于推断当前桌宠动作、情绪和说明文案

这部分是状态判断的核心来源。

### 4.3 Companion 信息

来源：`.claude.json` 的 `companion` 字段

作用：

- 同步宠物名字、性格、孵化时间
- 计算 `ageDays`

这部分不参与 session 活跃判断，但影响 UI 中“是谁在陪伴你”的展示语义。

## 5. 实时更新机制

### 5.1 文件监听

Rust 侧使用 `notify` 对以下位置建立监听：

- `~/.claude/sessions`
- `~/.claude/projects`
- 当前工作目录或用户目录下可命中的 `.claude.json`

监听的目标不是“所有业务逻辑都靠轮询重扫”，而是尽量把变化变成局部刷新触发器。

### 5.2 增量 JSONL tail

相比最初的“文件变化后整文件重读”，当前实现已经升级为增量 tail：

- 每个日志文件维护 `offset`
- 若文件新增内容，只读取新增字节
- 若新增字节没有形成完整行，则把残片放进 `remainder`
- 下一次再和新字节拼接解析

这样可以显著减少长会话日志的重复读取成本，也更接近真正事件流的语义。

### 5.3 Snapshot 与 Delta

当前通信分成两类：

- `monitor-snapshot`：完整状态，适合初始化和兜底恢复
- `monitor-delta`：只推送变化片段，适合运行中的高频更新

前端首次进入时先拿完整快照，之后主要消费 delta，并通过 [`monitorDelta.ts`](D:/repo/cc-buddy/.worktrees/pet-monitor/app/src/domain/monitorDelta.ts) 合并到当前状态。

这个设计的好处是：

- 首屏稳定
- 持续更新成本更低
- 前后端协议更清晰，后续扩展字段时不需要每次都整包替换

## 6. 行为推断规则

行为推断在前后端都保持同一套语义，核心规则在：

- 前端：[`behavior.ts`](D:/repo/cc-buddy/.worktrees/pet-monitor/app/src/domain/behavior.ts)
- Rust：[`lib.rs`](D:/repo/cc-buddy/.worktrees/pet-monitor/app/src-tauri/src/lib.rs)

映射大致如下：

- `assistant` -> `thinking / pondering`
- `tool_use + Bash` -> `excited / running_command`
- `tool_use + Edit/Write` -> `focused / writing_code`
- `tool_use + Read` -> `curious / reading`
- `tool_use + Grep/Glob` -> `hunting / searching`
- `tool_use + Agent` -> `busy / delegating`
- `result` -> `happy / celebrating`
- `error` -> `worried / debugging`

另外，当前已经加入“陈旧事件回落 idle”的判定：

- 如果最近事件或会话更新时间超过 2 分钟没有变化
- 即使之前最后一条事件是 `thinking` 或 `writing_code`
- 也会回落为 `idle / sleeping`

这样可以避免旧事件把已经空闲的 session 长时间误判成活跃状态。

## 7. UI 组织方式

前端界面目前分成三块：

1. Hero 区：展示 companion 身份、活跃 session 数、桌宠舞台
2. Live rooms：展示按最新时间排序后的前三个 session
3. Event feed：展示当前最新事件摘要

其中“桌宠舞台”和“房间列表”消费的是同一份 session room 数据，只是表现形式不同。这样做可以保证：

- 视觉层和信息层保持一致
- 改动排序规则时不会出现不同区域展示不一致

## 8. 调试与开发方式

推荐的本地开发方式：

```powershell
cd D:\repo\cc-buddy\app
npm run tauri:dev
```

常用验证命令：

```powershell
npm test
npm run lint
npm run build
cargo.exe test
```

其中：

- `npm run dev` 适合只调前端
- `npm run tauri:dev` 适合联调前后端和真实监听
- `cargo.exe test` 适合单独验证 Rust 的监听、tail 与推断逻辑

## 9. 当前设计的优点与限制

### 优点

- 纯只读集成，不侵入 Claude Code
- 前后端职责清晰，UI 可脱离真实数据独立开发
- Rust 侧已具备增量 tail 与事件推送能力
- 状态模型统一，便于后续加更多视觉表现

### 限制

- 当前 `activeCount` 语义仍偏向“当前展示中的活跃房间数”，不是完整 session 总量统计
- watcher 仍以目录级监听为主，还可以进一步收窄到命中的 session log
- 现在推的是“结构化状态变化”，还没细化到更低层级的动画事件
- idle 阈值目前是固定值，后续可以配置化

## 10. 后续演进建议

后续可以按下面方向继续演进：

1. 把 `activeCount` 改成真实活跃会话总数，并把“展示前三个”与“统计总数”解耦。
2. 把 watcher 收窄到已命中的 session 日志文件，减少无关目录噪音。
3. 在 delta 之上再增加更细粒度的动画事件，让桌宠动作更自然。
4. 把 idle 时间阈值做成可配置项。
5. 继续补透明置顶窗口、点击穿透、托盘控制等完整桌面体验。

这份架构的核心思想可以概括为一句话：

“Rust 负责理解本地世界，React 负责把这种理解温和地呈现出来。”
