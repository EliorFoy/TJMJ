# TJMJ 全栈架构文档

> 桃江经典王麻将 — 单页 Web 麻将游戏，含联机对战、观战、AI 机器人

---

## 项目总览

```
TJMJ/
├── frontend/              # Vue 3 前端 (SPA)
│   ├── src/
│   │   ├── App.vue        # ★ 主组件 (2602行, 单文件承载全部游戏UI+逻辑)
│   │   ├── main.js        # Vue 入口
│   │   ├── style.css      # 全局样式
│   │   ├── core/          # 游戏引擎 (纯逻辑，无UI依赖)
│   │   │   ├── constants.js      # 牌花色、258判定、王计算
│   │   │   ├── HuCalculator.js   # 核心胡牌判定引擎
│   │   │   └── RuleChecker.js    # 吃/碰/杠/听牌规则
│   │   ├── ai/
│   │   │   └── NpcStrategy.js    # NPC 出牌决策AI
│   │   ├── network/
│   │   │   └── client.js         # WebSocket 客户端 (224行)
│   │   ├── utils/
│   │   │   ├── mjLogic.js        # 洗牌、牌墙布局 (防重复)
│   │   │   └── speech.js         # 语音播报 (预录/TTS)
│   │   └── components/
│   │       └── HelloWorld.vue    # 脚手架模板 (未使用)
│   ├── public/
│   │   ├── images/        # 牌面 + 3D 素材 + 头像
│   │   ├── docs/          # PDF 教程 + 演示视频
│   │   ├── sfx/           # 预录制音效 (牌名/动作)
│   │   └── *.mp3          # BGM 歌单 (1-13.mp3)
│   ├── index.html
│   ├── vite.config.js     # base: '/TJMJ/' (GitHub Pages)
│   └── package.json       # vue 3.5 + vite 8.0
│
├── server/                # Node.js 游戏服务器
│   ├── index.js           # ★ WebSocket 入口 (247行)
│   ├── GameRoom.js        # ★ 房间状态机 (494行)
│   ├── game/              # 游戏逻辑 (前端镜像)
│   │   ├── constants.js
│   │   ├── HuCalculator.js
│   │   ├── RuleChecker.js
│   │   └── mjLogic.js
│   └── package.json       # ws 8.18 + uuid 10
│
├── backend/               # ⚠️ 早期 Socket.io 版本 (已废弃)
│   └── node_modules/      # 已从 Git 移除
│
├── other/                 # 本地工具 (ngrok.exe, 视频)
├── .github/workflows/     # GitHub Actions CI (build 检查)
├── start-all.bat          # 一键启动脚本
├── stop-all.bat
├── readme.md
├── ARCHITECTURE.md        # ← 本文档
└── TJMJ_Technical_Manual.tex  # LaTeX 技术手册
```

---

## 技术栈

| 层 | 技术 | 作用 |
|----|------|------|
| **前端框架** | Vue 3 (Composition API) | 响应式 UI |
| **构建** | Vite 8 + Rolldown | 开发/打包 |
| **样式** | 原生 CSS | 棋牌桌 3D 布局 |
| **语音合成** | Web Speech API (TTS) + 预录 mp3 | 牌名播报 |
| **实时语音** | WebRTC (P2P 网状) | 4 人通话 |
| **TURN 中继** | Twilio TURN (10GB/月) | NAT 穿透 |
| **联机通信** | WebSocket (ws 库) | JSON 消息 |
| **部署** | GitHub Pages + ngrok | 前端 + 后端隧道 |
| **CI** | GitHub Actions | PR 自动 build 检查 |

---

## 前后端通信架构

```
┌──────────┐          WebSocket          ┌──────────────┐
│  Vue 3   │◄══════════════════════════►│  Node.js      │
│  前端    │   JSON 消息 (ws/wss)        │  游戏服务器    │
│  :5173   │                            │  :8080        │
└────┬─────┘                            └──────┬─────────┘
     │                                         │
     │  本地直连: ws://localhost:8080          │
     │  公网: wss://xxx.ngrok-free.dev        │
     │                                         │
     │  ┌──── WebRTC (P2P 语音) ────┐        │
     └──┤  浏览器 ↔ 浏览器 (mesh)    ├────────┘
        └───────────────────────────┘
```

### 消息类型一览

| 方向 | 消息 | 说明 |
|------|------|------|
| C→S | `create_room` | 创建房间 |
| C→S | `join_room` | 加入房间 |
| C→S | `ready` / `ready_next` | 准备 / 确认继续 |
| C→S | `discard` | 出牌 |
| C→S | `draw` | 摸牌 |
| C→S | `action` (hu/peng/gang/chi) | 吃碰杠胡 |
| C→S | `pass` | 过 |
| C→S | `chat` | 文字弹幕 |
| C→S | `emoji` | 发送表情 |
| C→S | `webrtc_offer/answer/ice` | 语音信令中继 |
| C→S | `update_avatar` | 头像更新同步 |
| C→S | `ping` | 心跳 |
| C→S | `get_turn` | 请求 TURN 凭据 |
| S→C | `game_start` | 开局 (发牌+王+骰子) |
| S→C | `game_state` | 实时状态同步 (手牌/弃牌/副露) |
| S→C | `drew_tile` | 摸到某张牌 |
| S→C | `action_prompt` | 请求玩家操作 |
| S→C | `your_turn` | 轮到你出牌 |
| S→C | `round_end` | 本局结束 |
| S→C | `room_players` | 玩家列表更新 |
| S→C | `turn_credentials` | TURN 服务器凭据 |
| S→C | `pong` | 心跳回复 |
| S→C | `avatar_updated` | 头像已更新 |

---

## 核心模块详解

### 1. App.vue (2602 行)

整个游戏的**唯一前端文件**，包含：

| 区域 | 行数范围 | 内容 |
|------|---------|------|
| `<template>` | 1-371 | HTML 结构：牌桌、手牌、弹窗、按钮 |
| `<script setup>` | 373-2451 | 所有 JS 逻辑 |
| `<style>` | 2453-2602 | 所有 CSS 样式 |

**关键状态变量：**

| 变量 | 类型 | 作用 |
|------|------|------|
| `gameState` | `reactive` | 核心游戏状态 (手牌/牌堆/回合/骰子) |
| `gameMode` | `ref` | `'single' \| 'multi' \| 'spectate'` |
| `isInMenu` | `ref` | 是否在主菜单 |
| `netState` | `reactive` | 联机状态 (来自 client.js) |
| `actionState` | `reactive` | 当前操作 (可吃/碰/杠/胡) |
| `settlement` | `reactive` | 结算状态 |
| `musicPlaying` | `ref` | BGM 播放中 |
| `micEnabled` | `ref` | 麦克风开启 |

**模式切换流程：**

```
isInMenu=true
    ├── 点击"单机模式" → enterGame('single')
    │   └── handleReady() → startRound() → 本地游戏循环
    ├── 点击"联机模式" → enterGame('multi')
    │   └── createRoom() / joinRoom() → WebSocket → 等待4人 → 服务器开局
    ├── 点击"观战模式" → enterGame('spectate')
    │   └── joinSpectate() → 接收 game_state 并显示
    └── 点击"其他玩法" → 已禁用
```

### 2. server/index.js (247 行)

WebSocket 入口：

```
启动 → 创建 WebSocket Server → 监听 :8080
  ├── 创建测试房间 8888 (常驻)
  ├── 连接 → 注册消息处理
  │   ├── create_room / join_room → GameRoom 实例
  │   ├── discard / draw / action / pass → 转交 GameRoom
  │   ├── webrtc_* → 信令中继 (不解析数据)
  │   ├── get_turn → 返回 Twilio TURN 凭据
  │   └── ping → pong 回复
  └── 断开 → removePlayer
```

**Twilio TURN 凭据生成：**
```
启动时:
  timestamp = now + 86400秒 (24h)
  username = timestamp + ":" + TWILIO_ACCOUNT_SID
  password = HMAC-SHA1(AuthToken, username) → Base64

每小时刷新一次
```

### 3. server/GameRoom.js (494 行)

房间状态机：

```
LOBBY → (4人满+ready) → PLAYING → (有人胡/流局) → SETTLEMENT → (4人确认) → PLAYING
```

**核心方法：**

| 方法 | 作用 |
|------|------|
| `startGame()` | 洗牌、发牌 (53张)、广播 game_start |
| `handleDiscard()` | 出牌 → checkIntercepts |
| `handleDraw()` | 摸牌 → 自摸检测 |
| `checkIntercepts()` | 检查吃碰杠胡 → 通知相关玩家 |
| `resolveActions()` | 收集响应 → 优先级 (胡>杠>碰>吃) → 执行 |
| `nextTurn()` | 切换回合 → 发牌 |
| `endRound()` | 结算 (赢家庄家) → 等待确认 |
| `playerReadyForNext()` | 4人确认后开新局 |
| `broadcastPublic()` | 同步完整状态给所有人 |

**关键机制：**
- **超时保护**：`pendingActions` 10 秒后自动清除
- **手牌不排序**：保留玩家自定义顺序 (联机拖拽)
- **防重复**：`physicalDraw()` 跳过 `diIndex` 位置

### 4. frontend/src/network/client.js (224 行)

WebSocket 客户端：

```
connect()
  ├── 本地 → ws://localhost:8080
  └── 公网 → wss://xxx.ngrok-free.dev

断线重连 (指数退避):
  1s → 2s → 4s → 8s → ... → 128s (最多8次)
  重连成功 → 自动重新加入房间

心跳:
  每 10 秒发 ping
  收到 pong → 计算延迟 → 更新 4 格信号

发送节流:
  游戏操作 400ms 节流
  WebRTC/聊天/心跳 不节流
  连接建立前的消息入缓冲队列

Latency 等级:
  <100ms → 4格 ████
  <200ms → 3格 ███░
  <400ms → 2格 ██░░
  >400ms → 1格 █░░░
```

### 5. 游戏引擎 (core/ + game/)

**前端和 `server/game/` 各有一份相同代码** (双端校验)：

| 模块 | 功能 |
|------|------|
| `constants.js` | 花色 (万/条/筒)、258 判定、王 (癞子) 计算 |
| `HuCalculator.js` | 递归回溯判定胡牌：检查刻子/顺子/对子/将，支持王替代 |
| `RuleChecker.js` | 吃碰杠规则 (`canPeng`, `canMingGang`, `canAnGang`, `canChi`, `isTing`) |
| `mjLogic.js` | Fisher-Yates 洗牌、牌墙 4 面布局、打筛扳王位置计算 |

### 6. 语音系统 (speech.js)

```
speak(event) → 优先播预录文件 sfx/xxx.mp3
             → 文件不存在则降级 TTS

speakTile(val) → sfx/tile_XX.mp3 (牌名播报)

playDong() → Web Audio 合成 "咚" 音

playWin() → sfx/win.mp3
```

**需要录制的文件 (放 `public/sfx/`)：**
- 牌名：`tile_11.mp3` ~ `tile_39.mp3` (27个)
- 动作：`chi.mp3`, `peng.mp3`, `gang.mp3`, `hu.mp3`, `zimo.mp3`, `win.mp3`, `pass.mp3` (7个)

### 7. NPC 策略 (NpcStrategy.js)

启发式 AI：
1. **听牌优先**：遍历手牌找丢弃后能听牌的
2. **价值排序**：孤张 > 边张 > 散搭 > 将对 > 王 (绝不丢弃)
3. **吃碰决策**：评估是否有利 (`shouldPeng`, `shouldChi`)

---

## 部署架构

```
开发者电脑                      云端
┌──────────┐     git push      ┌──────────────────┐
│ 源码      │ ────────────────► │ GitHub (main)     │
│ git repo  │                   │  ├── GitHub Pages │ ← 前端静态文件
└────┬─────┘                   │  │   /TJMJ/       │
     │                         │  └── Actions CI   │ ← build 检查
     │                         └──────────────────┘
     │ npm run build
     │ npm run deploy
     │ (gh-pages -d dist)
     │
     ├── start-all.bat
     │   ├── Window 1: server → :8080
     │   ├── Window 2: frontend → :5173
     │   └── Window 3: ngrok http 8080
     │
     ▼
  玩家访问 https://jaijaic.github.io/TJMJ/
       └── WebSocket → ngrok → server :8080
       └── WebRTC 语音 → P2P + Twilio TURN 中继
```

---

## 数据流：一局游戏的完整生命周期

```
玩家 A 打开页面
  └── onMounted → restoreAvatar → BGM 默认关闭

玩家 A 创建房间
  └── connect() → create_room → server: new GameRoom
      └── A 收到 room_created (roomId)
      └── URL 写入 ?auto_join=xxxx&name=AAA

玩家 B/C/D 加入房间
  └── join_room(roomId) → server: addPlayer
      └── room_players 广播 → 4人列表显示

4人 ready → 服务器开局
  └── GameRoom.startGame()
      ├── 洗牌 108 张
      ├── 掷骰子 (d1,d2) → 定庄家起手位置
      ├── 扳王 → 计算癞子
      ├── 发牌 (每人对号入座)
      └── game_start 广播 (每人只收到自己的手牌)

游戏循环:
  A 出牌 → send({type:'discard',tile})
    → server: handleDiscard → 移除手牌 → 广播 game_state
    → 其他玩家: game_state 更新局部状态
  
  B/C/D 收到 → checkIntercepts
    ├── 有人能胡 → 结束
    ├── 有人能碰/杠 → 请求操作
    ├── 下家能吃 → 请求操作
    └── 无人拦截 → nextTurn → B 摸牌

  超时保护: 10 秒无响应 → 强制跳过

B 摸牌 → 自摸检测 → 出牌

...循环直到有人胡牌或流局...

胡牌 → endRound(winnerIndex)
  ├── 赢家坐庄
  ├── 亮牌 showdownHands → 所有玩家可见
  ├── 各玩家点"确认继续"
  └── 全部确认 → startGame (下一局)
```

---

## 文件大小统计

| 文件 | 行数 | 职责 |
|------|------|------|
| `App.vue` | 2602 | UI + 游戏逻辑 |
| `server/GameRoom.js` | 494 | 多人房间状态机 |
| `server/index.js` | 247 | WebSocket 入口 |
| `client.js` | 224 | 网络层 (重连/心跳/节流) |
| `NpcStrategy.js` | 227 | AI 决策 |
| `HuCalculator.js` | 208 | 胡牌判定 |
| `RuleChecker.js` | 142 | 规则检查 |
| `speech.js` | 100 | 语音播报 |
| **合计** | **4244** | — |

---

## 关键设计决策

1. **单文件架构** (App.vue 2602 行)：适合个人快速迭代，后续可分拆
2. **双端逻辑镜像** (frontend/core/ + server/game/)：前端可独立运行单机模式，服务端做权威校验
3. **手牌不排序**：保留玩家拖拽顺序 (联机通过计数差集合并)
4. **fixed 弹窗必须在 game-wrapper 外**：桌面端 transform scale 会破坏 fixed 定位
5. **TURN 凭据服务端生成**：HMAC 签名，24h 有效，每小时刷新
6. **WebSocket 节流**：游戏操作 400ms，防止高频崩溃
7. **断线重连**：指数退避 + URL 参数保存房间号
