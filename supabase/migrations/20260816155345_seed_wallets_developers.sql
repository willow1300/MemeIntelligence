/*
# Seed: wallets, developers, developer_wallets

Creates observed wallets (with an analytical wallet_type and first_seen "observed"
timestamps), six analytical developer entities, and the wallet<->developer links
with confidence + evidence.

Time anchor for the whole dataset: 2026-08-16 12:00:00+00.

Scenarios represented:
- Old developer wallet (~2 years observed) -> "Aurora Labs"
- Newly observed wallet (seconds before launch) -> "Fresh Mint"
- Serial momentum-exhaustion dev -> "NightShift"
- Liquidity-event dev -> "Drain Collective"
- Copy/derivative dev -> "Mirror Works"
- Mixed / quiet builder -> "Quiet Build"
*/

-- Wallets (offsets measured back from the 2026-08-16 anchor)
INSERT INTO wallets (chain_id, address, first_seen_at, last_seen_at, transaction_count, wallet_type)
SELECT c.id, v.address,
       (timestamptz '2026-08-16 12:00:00+00' - (v.first_days || ' days')::interval),
       (timestamptz '2026-08-16 12:00:00+00' - (v.last_days || ' days')::interval),
       v.txc, v.wtype
FROM chains c
JOIN (VALUES
  ('Aur0raPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1', 730, 1,  4210, 'PERSONAL'),
  ('Aur0raFunderwa11etXXXXXXXXXXXXXXXXXXXXXX2', 690, 30,  980, 'PERSONAL'),
  ('N1ghtSh1ftPr1marywa11etXXXXXXXXXXXXXXXXX3', 210, 2,  1620, 'PERSONAL'),
  ('N1ghtSh1ftAssoc1atewa11etXXXXXXXXXXXXXXX4', 150, 5,   640, 'PERSONAL'),
  ('Dra1nC0llectPr1marywa11etXXXXXXXXXXXXXXX5', 320, 3,  2110, 'PERSONAL'),
  ('Dra1nC0llectLPwa11etXXXXXXXXXXXXXXXXXXXX6', 300, 8,   410, 'PERSONAL'),
  ('M1rr0rW0rksPr1marywa11etXXXXXXXXXXXXXXXX7', 95,  1,   870, 'PERSONAL'),
  ('Qu1etBu1ldPr1marywa11etXXXXXXXXXXXXXXXXX8', 540, 4,  1330, 'PERSONAL'),
  ('FreshM1ntPr1marywa11etXXXXXXXXXXXXXXXXXX9', 1,   0,     6, 'PERSONAL'),
  ('FreshM1ntFunderwa11etXXXXXXXXXXXXXXXXXX10', 400, 0,  3200, 'EXCHANGE'),
  ('Assoc1atedTraderAwa11etXXXXXXXXXXXXXXXX11', 260, 6,   540, 'PERSONAL'),
  ('Assoc1atedTraderBwa11etXXXXXXXXXXXXXXXX12', 180, 9,   330, 'PERSONAL'),
  ('Exchange0mn1busHotwa11etXXXXXXXXXXXXXXX13', 900, 0, 88000, 'EXCHANGE'),
  ('T0kenPr0gramAuth0r1tywa11etXXXXXXXXXXXX14', 900, 0, 12000, 'PROGRAM'),
  ('TreasuryMultiSigwa11etXXXXXXXXXXXXXXXXX15', 500, 12,  210, 'TREASURY'),
  ('Retai1TraderOnewa11etXXXXXXXXXXXXXXXXXX16', 120, 7,   190, 'PERSONAL'),
  ('Retai1TraderTwowa11etXXXXXXXXXXXXXXXXXX17', 88,  3,   150, 'PERSONAL'),
  ('Retai1TraderThreewa11etXXXXXXXXXXXXXXXX18', 45,  2,    70, 'PERSONAL')
) AS v(address, first_days, last_days, txc, wtype) ON true
WHERE c.chain_id = 'solana-mainnet'
ON CONFLICT (chain_id, address) DO NOTHING;

-- Developers (primary wallet resolved by address)
INSERT INTO developers (name, primary_wallet_id, first_seen_at, last_seen_at, launch_count)
SELECT v.name, w.id, w.first_seen_at, w.last_seen_at, 0
FROM (VALUES
  ('Aurora Labs',      'Aur0raPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1'),
  ('NightShift',       'N1ghtSh1ftPr1marywa11etXXXXXXXXXXXXXXXXX3'),
  ('Drain Collective', 'Dra1nC0llectPr1marywa11etXXXXXXXXXXXXXXX5'),
  ('Mirror Works',     'M1rr0rW0rksPr1marywa11etXXXXXXXXXXXXXXXX7'),
  ('Quiet Build',      'Qu1etBu1ldPr1marywa11etXXXXXXXXXXXXXXXXX8'),
  ('Fresh Mint',       'FreshM1ntPr1marywa11etXXXXXXXXXXXXXXXXXX9')
) AS v(name, waddr)
JOIN wallets w ON w.address = v.waddr
WHERE NOT EXISTS (SELECT 1 FROM developers d WHERE d.name = v.name);

-- developer_wallets links
INSERT INTO developer_wallets (developer_id, wallet_id, relationship_type, confidence, evidence)
SELECT d.id, w.id, v.rel, v.conf, v.evidence::jsonb
FROM (VALUES
  ('Aurora Labs','Aur0raPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1','PRIMARY', 1.0, '["Primary deployer of all Aurora launches"]'),
  ('Aurora Labs','Aur0raFunderwa11etXXXXXXXXXXXXXXXXXXXXXX2','FUNDER',  0.72,'["Repeatedly funded the primary wallet before launches"]'),
  ('NightShift','N1ghtSh1ftPr1marywa11etXXXXXXXXXXXXXXXXX3','PRIMARY', 1.0, '["Deployer wallet"]'),
  ('NightShift','N1ghtSh1ftAssoc1atewa11etXXXXXXXXXXXXXXX4','ASSOCIATED',0.61,'["Received tokens from deployer minutes after each launch"]'),
  ('Drain Collective','Dra1nC0llectPr1marywa11etXXXXXXXXXXXXXXX5','PRIMARY',1.0,'["Deployer wallet"]'),
  ('Drain Collective','Dra1nC0llectLPwa11etXXXXXXXXXXXXXXXXXXXX6','ASSOCIATED',0.68,'["Held and later removed liquidity across launches"]'),
  ('Mirror Works','M1rr0rW0rksPr1marywa11etXXXXXXXXXXXXXXXX7','PRIMARY',1.0,'["Deployer wallet"]'),
  ('Quiet Build','Qu1etBu1ldPr1marywa11etXXXXXXXXXXXXXXXXX8','PRIMARY',1.0,'["Deployer wallet"]'),
  ('Fresh Mint','FreshM1ntPr1marywa11etXXXXXXXXXXXXXXXXXX9','PRIMARY',1.0,'["Deployer wallet, first observed seconds before launch"]'),
  ('Fresh Mint','FreshM1ntFunderwa11etXXXXXXXXXXXXXXXXXX10','FUNDER',0.55,'["Exchange withdrawal funded the deployer just before launch"]')
) AS v(dev, waddr, rel, conf, evidence)
JOIN developers d ON d.name = v.dev
JOIN wallets w ON w.address = v.waddr
ON CONFLICT (developer_id, wallet_id) DO NOTHING;
