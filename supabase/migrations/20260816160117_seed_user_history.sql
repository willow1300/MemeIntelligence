/*
# Seed: users, user_wallets, user_trades

Establishes the user trade history foundation with a single demo user who has
traded several tokens. Deliberately includes:
  - EARLY_EXIT: user sold a token that later pumped (AURORA coin -> peaked well after exit)
  - EXIT_BEFORE_SEVERE_FAILURE: user sold a token that later collapsed (MOONK -> liquidity event)
  - STILL_HOLDING: user bought LOUIE hero token and hasn't sold

This lets the trade-outcome engine distinguish early exits from severe failures.
*/

INSERT INTO users (id, display_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Analyst One')
ON CONFLICT (id) DO NOTHING;

-- Track two wallets for the demo user
INSERT INTO user_wallets (user_id, wallet_id, label)
SELECT '00000000-0000-0000-0000-000000000001', w.id, v.label
FROM (VALUES
  ('Retai1TraderOnewa11etXXXXXXXXXXXXXXXXXX16', 'Primary trading wallet'),
  ('Retai1TraderTwowa11etXXXXXXXXXXXXXXXXXX17', 'Secondary wallet')
) AS v(addr, label)
JOIN wallets w ON w.address = v.addr
ON CONFLICT (user_id, wallet_id) DO NOTHING;

-- Trades: deterministic timestamps relative to token launch/peak/death
-- 1) AURORA coin: BUY then SELL before the big pump => EARLY_EXIT
INSERT INTO user_trades (user_id, token_id, wallet_id, side, timestamp, token_amount, price, market_cap, usd_value, tx_hash)
SELECT '00000000-0000-0000-0000-000000000001', t.id, w.id, 'BUY',
  t.created_at + '20 minutes'::interval, 500000, 0.00002, 50000, 100, 'trade_aurora_buy'
FROM tokens t JOIN wallets w ON w.address = 'Retai1TraderOnewa11etXXXXXXXXXXXXXXXXXX16'
WHERE t.address = 'AURORAcoinXXXXXXXXXXXXXXXXXXXXXXXXXXXX022';

INSERT INTO user_trades (user_id, token_id, wallet_id, side, timestamp, token_amount, price, market_cap, usd_value, tx_hash)
SELECT '00000000-0000-0000-0000-000000000001', t.id, w.id, 'SELL',
  t.created_at + '60 minutes'::interval, 500000, 0.000018, 45000, 90, 'trade_aurora_sell'
FROM tokens t JOIN wallets w ON w.address = 'Retai1TraderOnewa11etXXXXXXXXXXXXXXXXXX16'
WHERE t.address = 'AURORAcoinXXXXXXXXXXXXXXXXXXXXXXXXXXXX022';

-- 2) MOONK: BUY then SELL before liquidity event => EXIT_BEFORE_SEVERE_FAILURE
INSERT INTO user_trades (user_id, token_id, wallet_id, side, timestamp, token_amount, price, market_cap, usd_value, tx_hash)
SELECT '00000000-0000-0000-0000-000000000001', t.id, w.id, 'BUY',
  t.created_at + '10 minutes'::interval, 800000, 0.00005, 80000, 160, 'trade_moonk_buy'
FROM tokens t JOIN wallets w ON w.address = 'Retai1TraderTwowa11etXXXXXXXXXXXXXXXXXX17'
WHERE t.address = 'MOONKdrainXXXXXXXXXXXXXXXXXXXXXXXXXXXX011';

INSERT INTO user_trades (user_id, token_id, wallet_id, side, timestamp, token_amount, price, market_cap, usd_value, tx_hash)
SELECT '00000000-0000-0000-0000-000000000001', t.id, w.id, 'SELL',
  t.created_at + '35 minutes'::interval, 800000, 0.00004, 64000, 128, 'trade_moonk_sell'
FROM tokens t JOIN wallets w ON w.address = 'Retai1TraderTwowa11etXXXXXXXXXXXXXXXXXX17'
WHERE t.address = 'MOONKdrainXXXXXXXXXXXXXXXXXXXXXXXXXXXX011';

-- 3) LOUIE hero: BUY only, still holding
INSERT INTO user_trades (user_id, token_id, wallet_id, side, timestamp, token_amount, price, market_cap, usd_value, tx_hash)
SELECT '00000000-0000-0000-0000-000000000001', t.id, w.id, 'BUY',
  t.created_at + '5 minutes'::interval, 1000000, 0.00003, 30000, 60, 'trade_louie_buy'
FROM tokens t JOIN wallets w ON w.address = 'Retai1TraderOnewa11etXXXXXXXXXXXXXXXXXX16'
WHERE t.address = 'LOUIEheroXXXXXXXXXXXXXXXXXXXXXXXXXXXXX001';

-- 4) PEPE prime: BUY then SELL near peak => GOOD_EXIT
INSERT INTO user_trades (user_id, token_id, wallet_id, side, timestamp, token_amount, price, market_cap, usd_value, tx_hash)
SELECT '00000000-0000-0000-0000-000000000001', t.id, w.id, 'BUY',
  t.created_at + '30 minutes'::interval, 400000, 0.0001, 100000, 200, 'trade_pepe_buy'
FROM tokens t JOIN wallets w ON w.address = 'Retai1TraderOnewa11etXXXXXXXXXXXXXXXXXX16'
WHERE t.address = 'PEPEprimeXXXXXXXXXXXXXXXXXXXXXXXXXXXXX005';

INSERT INTO user_trades (user_id, token_id, wallet_id, side, timestamp, token_amount, price, market_cap, usd_value, tx_hash)
SELECT '00000000-0000-0000-0000-000000000001', t.id, w.id, 'SELL',
  t.created_at + '110 minutes'::interval, 400000, 0.0008, 800000, 1600, 'trade_pepe_sell'
FROM tokens t JOIN wallets w ON w.address = 'Retai1TraderOnewa11etXXXXXXXXXXXXXXXXXX16'
WHERE t.address = 'PEPEprimeXXXXXXXXXXXXXXXXXXXXXXXXXXXXX005';
