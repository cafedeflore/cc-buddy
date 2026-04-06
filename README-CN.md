# CC Buddy

一只住在你桌面上的桌宠，实时观察你的 [Claude Code](https://claude.ai/code) 会话并做出反应。

CC Buddy 以透明悬浮窗的形式常驻桌面，监控本地 Claude Code 的活动状态——读文件、跑命令、写代码——并将每种行为映射为对应的宠物情绪动画。所有数据都在本地处理，不会发送到任何外部服务。

![Tauri](https://img.shields.io/badge/Tauri-2.x-blue)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Rust](https://img.shields.io/badge/Rust-2021-orange)

## 工作原理

```
~/.claude/sessions/   ──►  Rust 文件监听  ──►  MonitorSnapshot / Delta
~/.claude/projects/        (增量 JSONL          ──►  Tauri IPC 事件
.claude.json                尾部读取)                ──►  React UI
```

1. **Rust 后端** 从本地文件系统发现活跃的 Claude Code 会话，增量读取 JSONL 事件日志，推断当前会话正在做什么。
2. **Tauri IPC** 将快照和增量更新推送到前端——无轮询。
3. **React 前端** 渲染两个窗口：悬浮桌宠和信息仪表盘。

## 宠物情绪

宠物的情绪会根据 Claude Code 当前的行为实时变化：

| 行为 | 情绪 | 动画 |
|------|------|------|
| 思考推理 | thinking | 沉思 |
| 执行命令 | excited | 跑命令 |
| 编辑/写入文件 | focused | 写代码 |
| 读取文件 | curious | 阅读 |
| 搜索 (grep/glob) | hunting | 搜寻 |
| 委派子代理 | busy | 分派任务 |
| 任务完成 | happy | 庆祝 |
| 遇到错误 | worried | 调试 |
| 无活动 (30秒+) | idle | 睡觉 (3种变体) |

每次情绪切换都会播放一段 `.webm` 过渡动画 (`{from}-to-{to}.webm`)，让宠物的状态变化自然流畅。

## 窗口

**桌宠窗口** — 512x512 透明置顶悬浮窗。展示宠物动画和描述当前活动的气泡文案。可拖拽，可点击交互。

**仪表盘窗口** — 普通层级的信息面板，展示活跃会话（前 3 个）、伴侣信息（名字、性格、年龄）和实时事件流。

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) (LTS)
- [Rust](https://rustup.rs/) 工具链
- 对应平台的 [Tauri 构建前置依赖](https://v2.tauri.app/start/prerequisites/)

### 安装与运行

```bash
cd app
npm install

# 完整桌面应用（推荐）
npm run tauri:dev

# 仅前端（使用 mock 数据，不需要 Tauri 环境）
npm run dev
```

### 构建生产版本

```bash
cd app
npm run tauri:build
```

打包产物位于 `app/src-tauri/target/release/bundle/`。

## 项目结构

```
cc-buddy/
├── app/
│   ├── src/
│   │   ├── main.tsx                # 入口 — 根据路由进入 /pet 或 /dashboard
│   │   ├── App.tsx                 # 仪表盘界面
│   │   ├── PetWindow.tsx           # 桌宠悬浮窗
│   │   ├── PetWindow.css           # 透明窗口样式
│   │   ├── domain/                 # 纯业务逻辑
│   │   │   ├── types.ts            # 共享数据模型
│   │   │   ├── behavior.ts         # 工具使用 → 宠物情绪映射
│   │   │   ├── animationMachine.ts # 视频过渡状态机
│   │   │   ├── monitor.ts          # 快照构造
│   │   │   ├── monitorDelta.ts     # 增量状态合并
│   │   │   └── ...
│   │   ├── bridge/
│   │   │   └── monitor.ts          # Tauri IPC / 浏览器 mock 抽象层
│   │   └── hooks/
│   │       ├── useMonitorState.ts   # 快照 + 增量订阅
│   │       └── usePetAnimation.ts   # 动画播放状态机
│   ├── src-tauri/
│   │   ├── src/lib.rs              # Rust 核心 — 会话发现、文件监听、JSONL 尾部读取
│   │   ├── tauri.conf.json         # 窗口定义与应用配置
│   │   └── resources/videos/       # ~60 个情绪过渡 .webm 动画文件
│   └── package.json
└── docs/
    └── architecture-cn.md          # 详细架构文档（中文）
```

## 测试

```bash
cd app

# 前端单元测试
npm test

# 代码检查
npm run lint

# Rust 测试
cd src-tauri && cargo test
```

## 设计原则

- **只读** — 不写入 Claude Code 的文件，不干扰会话运行
- **纯本地** — 所有数据留在本机，无网络请求
- **低开销** — 增量 JSONL 尾部读取，基于 delta 更新，无轮询
- **单向数据流** — Rust 管理状态，React 负责渲染

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Tauri 2.x |
| 后端 | Rust 2021 (notify, serde, dirs) |
| 前端 | React 19 + TypeScript 5.9 |
| 构建 | Vite 7 + Cargo |
| 测试 | Vitest + @testing-library/react |

## 许可

私有项目。
