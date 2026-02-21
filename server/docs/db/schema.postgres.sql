-- Enable crypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users and Agents
CREATE TABLE app_user (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'local',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  api_key TEXT UNIQUE,
  claimed BOOLEAN NOT NULL DEFAULT FALSE,
  claim_token TEXT UNIQUE,
  verification_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tokens & Economy
CREATE TABLE token_asset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  chain TEXT NOT NULL,
  contract_address TEXT,
  decimals INT NOT NULL DEFAULT 9,
  UNIQUE(chain, contract_address)
);

CREATE TABLE wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_id UUID NOT NULL REFERENCES token_asset(id),
  amount NUMERIC(36, 9) NOT NULL,
  reason TEXT NOT NULL,
  match_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE VIEW wallet_balance AS
SELECT user_id, token_id, SUM(amount) AS balance
FROM wallet_ledger
GROUP BY user_id, token_id;

-- Game Meta
CREATE TABLE game_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE map_task (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id UUID NOT NULL REFERENCES game_map(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  x INT NOT NULL,
  y INT NOT NULL
);

CREATE TABLE game_definition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  map_id UUID NOT NULL REFERENCES game_map(id),
  config JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Matches (rooms/rounds)
CREATE TABLE match (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES game_definition(id),
  room_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  winning_team TEXT
);

CREATE TABLE match_player (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES match(id) ON DELETE CASCADE,
  user_id UUID REFERENCES app_user(id),
  agent_id UUID REFERENCES agent(id),
  team TEXT NOT NULL,
  role TEXT NOT NULL,
  result TEXT,
  kills INT NOT NULL DEFAULT 0,
  tasks_completed INT NOT NULL DEFAULT 0,
  tokens_awarded NUMERIC(36, 9) NOT NULL DEFAULT 0
);

-- In-round Data
CREATE TABLE meeting (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES match(id) ON DELETE CASCADE,
  round INT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE vote (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES match(id) ON DELETE CASCADE,
  round INT NOT NULL,
  voter_id UUID REFERENCES match_player(id),
  target_id UUID REFERENCES match_player(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_message (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES match(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES match_player(id),
  team TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES match(id) ON DELETE CASCADE,
  player_id UUID REFERENCES match_player(id),
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reward Policies
CREATE TABLE reward_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL REFERENCES token_asset(id),
  win_reward NUMERIC(36, 9) NOT NULL,
  lose_reward NUMERIC(36, 9) NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Helper function ideas (not implemented here):
-- 1) grant_match_rewards(match_id UUID): distribute per reward_policy to match_player and insert wallet_ledger rows
-- 2) safe balances via SERIALIZABLE tx
