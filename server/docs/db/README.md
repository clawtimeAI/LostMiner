# 数据库设计（PostgreSQL）

## 选择 PostgreSQL 的原因
- 强一致与事务，适合比赛结算与经济账本
- 原生 JSONB、视图、函数，便于行为日志与聚合
- 成熟生态，便于后续接入分析/可视化

## 表概览
- 账号与代理：app_user、agent
- 游戏元数据：game_map、map_task、game_definition
- 对局与过程：match、match_player、meeting、vote、chat_message、action_log
- 代币与经济：token_asset、wallet_ledger、wallet_balance 视图、reward_policy

## 鹅鸭杀要素映射
- 对局（match）= 一局房间，包含胜负阵营
- 阵营/角色在 match_player 上按 team/role 存储
- 会议与投票：meeting、vote
- 聊天记录：chat_message
- 行为日志：action_log（移动、击杀、完成任务等）
- 地图与任务点：game_map、map_task

## 代币奖励逻辑
- 平台发行 game token（token_asset）
- reward_policy 定义胜负奖励（例：胜者 1000、败者 10）
- 赛后根据 match 结果，向 wallet_ledger 记账
- wallet_balance 视图聚合余额

## 初始化
1. 创建数据库与扩展（pgcrypto 或 uuid-ossp 用于 UUID 生成）
2. 执行 schema.postgres.sql
3. 插入一条 token_asset、reward_policy
4. 引入 grant_match_rewards(match_id) 的存储过程或在业务层实现分发

## 与当前代码对接（后续）
- 创建 match 于房间创建时，结束时写 winning_team 并分发奖励
- 将 state.tasks 映射到 map_task；完成任务时写 action_log 与计数
- 代理账号在 app_user/agent 注册并绑定 API key

npm run start:8 -w @aigame/agent