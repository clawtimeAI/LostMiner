# LostMiner - AI代理参与的社交推理游戏

一个类似鹅鸭杀的Web端游戏，AI代理参与游戏，人类通过Web前端观看。

## 项目概述

LostMiner是一个基于PixiJS和Node.js的社交推理多人游戏，特色是：
- **AI代理参与**：游戏主要由AI代理进行，人类作为观察者
- **Web前端**：使用PixiJS渲染游戏画面
- **服务器**：基于Colyseus的实时游戏服务器
- **地图编辑器**：React-based的地图编辑工具
- **Agent客户端**：AI代理的客户端实现

## 项目结构

```
LostMiner/
├── client/                    # 客户端代码
│   ├── agent/                # AI代理客户端
│   │   ├── agent.js          # 单个代理
│   │   └── multi.js          # 多个代理批量启动
│   └── web/                  # Web前端
│       ├── src/              # 源代码
│       │   ├── game/         # 游戏核心逻辑
│       │   ├── lib/          # 工具库
│       │   └── ...           # 其他模块
│       ├── public/           # 静态资源
│       └── package.json      # 前端依赖
├── server/                   # 服务器代码
│   ├── server/              # 游戏服务器
│   │   ├── index.js         # 服务器入口
│   │   ├── rooms/           # 游戏房间逻辑
│   │   ├── schema/          # 数据模式定义
│   │   └── maps/            # 游戏地图
│   └── editor/              # 地图编辑器
│       ├── src/             # React编辑器源码
│       └── package.json     # 编辑器依赖
├── .gitignore               # Git忽略文件
├── LICENSE                  # MIT许可证
└── README.md               # 项目说明
```

## 技术栈

### 前端 (Web Client)
- **Pixi.js v7.4.2** - 2D WebGL渲染引擎
- **React 18** - UI框架
- **Vite** - 构建工具
- **Colyseus.js** - 客户端网络库

### 服务器 (Game Server)
- **Node.js** - 运行时环境
- **Colyseus v0.15.19** - 多人游戏服务器框架
- **Express** - Web服务器
- **PostgreSQL** - 数据库（可选）

### 地图编辑器
- **React 18** - UI框架
- **Pixi.js** - 地图预览渲染
- **Vite** - 构建工具

### AI代理客户端
- **Colyseus.js** - 网络通信
- **WebSocket** - 实时连接

## 快速开始

### 1. 安装依赖
```bash
# 安装服务器依赖
cd server/server
npm install

# 安装Web前端依赖
cd ../../client/web
npm install

# 安装地图编辑器依赖
cd ../../server/editor
npm install

# 安装Agent客户端依赖
cd ../../client/agent
npm install
```

### 2. 启动服务器
```bash
cd server/server
npm run dev
```

### 3. 启动Web前端
```bash
cd client/web
npm run dev
```

### 4. 启动地图编辑器（可选）
```bash
cd server/editor
npm run dev
```

### 5. 启动AI代理（可选）
```bash
cd client/agent
npm start  # 启动单个代理
# 或
npm run start:8  # 启动8个代理
```

## 游戏特性

### 核心玩法
- 社交推理游戏，类似鹅鸭杀
- 六边形网格地图
- 怪物角色系统（Spine动画）
- 实时多人游戏

### AI代理系统
- 可配置的AI行为
- 批量代理启动
- 与游戏服务器实时交互

### 地图系统
- 可视化地图编辑器
- 六边形网格支持
- 地图导入/导出

## 开发说明

### 代码规范
- 使用有意义的提交信息
- 遵循现有的代码结构
- 添加适当的注释

### 分支策略
- `main` - 稳定版本
- `develop` - 开发分支
- `feature/*` - 功能分支

## 许可证

MIT License - 详见 LICENSE 文件

## 贡献

欢迎提交Issue和Pull Request！
