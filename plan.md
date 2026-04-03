# Claude Code 桌面宠物 - 实现计划

## 目标

构建一个轻量桌面宠物应用，被动监听 Claude Code 本地文件，实时展示任务状态并同步 Siltpaw 伴侣数据。

## 技术栈

- **框架**: Tauri (Rust 后端 + Web 前端)
- **文件监控**: notify crate (Rust) / fs.watch (Node)
- **动画渲染**: Canvas 或 Lottie

## 数据源

| 文件 | 内容 | 用途 |
|------|------|------|
| `~/.claude/sessions/*.json` | `{pid, sessionId, cwd, startedAt, kind}` | 发现/追踪活跃会话 |
| `~/.claude/projects/<slug>/<sessionId>.jsonl` | 对话事件流（role, tool_use, result 等） | 实时推断任务状态 |
| `.claude.json` → `companion` | `{name, personality, hatchedAt}` | 同步 Siltpaw 身份 |

## 模块划分

### 1. SessionManager - 会话管理

- watch `~/.claude/sessions/*.json`，检测会话增删
- 通过 `process.kill(pid, 0)` 验证进程存活，过滤僵尸会话
- 输出 `Map<sessionId, {pid, cwd, alive}>`

### 2. EventTailer - 事件流监听

- 对每个活跃会话，增量 tail 对应的 `.jsonl` 文件（记录 offset）
- 解析每行 JSON，提取事件类型（assistant / tool_use / tool_result / result / error）
- 会话结束时停止 tail

### 3. BehaviorInferrer - 行为推断

事件到宠物状态的映射：

| 事件 | mood | action |
|------|------|--------|
| 无活跃会话 | idle | sleeping |
| assistant (streaming) | thinking | pondering |
| tool_use: Bash | excited | running_command |
| tool_use: Edit/Write | focused | writing_code |
| tool_use: Read | curious | reading |
| tool_use: Grep/Glob | hunting | searching |
| tool_use: Agent | busy | delegating |
| result | happy | celebrating |
| error | worried | debugging |

### 4. CompanionSync - Siltpaw 同步

- watch `.claude.json`，读取 `companion` 字段
- 同步 name、personality、age（`Date.now() - hatchedAt`）

### 5. PetRenderer - 渲染层

- 透明无边框 always-on-top 窗口
- 根据 `{mood, action}` 播放对应动画
- 多会话处理策略：
  - 每个会话一个小分身
  - 有一个固定场景，类似猫爬架或者生活化的卡通场景，最多支持出现3只猫，对应最活跃的3个会话。

## 关键实现细节

**JSONL 增量读取**：记录文件 offset，每次 watch 触发时只读新增部分，按换行符分割解析。

**Windows 兼容**：进程检测用 `tasklist` 替代 `kill(pid, 0)`；路径使用正斜杠或正确转义。

**零侵入**：纯只读文件监控，不修改 Claude Code 任何文件，不 spawn 子进程。
