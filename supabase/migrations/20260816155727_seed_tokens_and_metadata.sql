/*
# Seed: tokens + token_metadata (48 tokens, 10 scenarios)

Inserts 48 tokens across the six developers, covering every required scenario:
strong launches, momentum exhaustion, low-volume failed launches, liquidity
events, developer/associated-wallet distribution, repeated tickers ($LOUIE,
$PEPE, $DOGE, $QUACK, $GROK), repeated images, repeated narratives, an old
developer wallet (Aurora Labs), and a newly observed wallet (Fresh Mint hero
token $LOUIE).

The hero token being analyzed is $LOUIE by "Fresh Mint" (address LOUIEhero...).

token_metadata.raw_metadata carries analytical hints (theme, narrative, culture,
peak market cap, time-to-peak minutes, failure_type, minutes_ago) that later
migrations use to derive launches, lifecycles and meta labels — keeping the
raw dataset in one place.

Time anchor: 2026-08-16 12:00:00+00.
*/

WITH v(addr, symbol, name, devw, plat, img, mins, ttp, peak, ftype, status, theme, narr, cult, descr) AS (
  VALUES
  ('LOUIEheroXXXXXXXXXXXXXXXXXXXXXXXXXXXXX001','LOUIE','Louie the Duck','FreshM1ntPr1marywa11etXXXXXXXXXXXXXXXXXX9','pumplaunch','duck1',40,25,82000,'HEALTHY','ACTIVE','duck','wholesome','internet','A wholesome duck mascot for the community. Louie waddles to the moon.'),
  ('LOUIEauroraXXXXXXXXXXXXXXXXXXXXXXXXXXX002','LOUIE','Louie','Aur0raPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1','moonpad','duck1',101,55,620000,'MOMENTUM_EXHAUSTION','DEAD','duck','wholesome','internet','The original wholesome duck. Louie says hi.'),
  ('LOUIE2nightXXXXXXXXXXXXXXXXXXXXXXXXXXX003','LOUIE2','Louie Two','N1ghtSh1ftPr1marywa11etXXXXXXXXXXXXXXXXX3','rayswap','duck2',20,30,83000,'MOMENTUM_EXHAUSTION','DECLINING','duck','wholesome','internet','Louie is back, two times the duck energy.'),
  ('MIRACLElouieXXXXXXXXXXXXXXXXXXXXXXXXXX004','LOUIE','Miracle Louie','Qu1etBu1ldPr1marywa11etXXXXXXXXXXXXXXXXX8','bondingworks','duck2',4320,90,210000,'DEV_SELLING','DEAD','duck','tragic','community','The miracle duck that touched hearts before it vanished.'),
  ('PEPEprimeXXXXXXXXXXXXXXXXXXXXXXXXXXXXX005','PEPE','Pepe Prime','Aur0raPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1','moonpad','frog1',8640,120,1420000,'MOMENTUM_EXHAUSTION','DEAD','frog','funny','internet','The prime frog. Feels good man.'),
  ('PEPEreduxXXXXXXXXXXXXXXXXXXXXXXXXXXXXX006','PEPE','Pepe Redux','M1rr0rW0rksPr1marywa11etXXXXXXXXXXXXXXXX7','pumplaunch','frog1',5760,40,74000,'FAILED_LAUNCH','DEAD','frog','funny','internet','Another take on the classic frog.'),
  ('PEPErealXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX007','PEPE','Real Pepe','N1ghtSh1ftPr1marywa11etXXXXXXXXXXXXXXXXX3','rayswap','frog1',2880,35,156000,'DEV_SELLING','DEAD','frog','funny','internet','The real frog, accept no substitutes.'),
  ('DOGE2auroraXXXXXXXXXXXXXXXXXXXXXXXXXXX008','DOGE2','Doge Two','Aur0raPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1','moonpad','dog1',12960,200,940000,'HEALTHY','ACTIVE','dog','wholesome','community','Much wow. Very community. Second edition.'),
  ('DOGEclassicXXXXXXXXXXXXXXXXXXXXXXXXXXX009','DOGE','Doge Classic','Qu1etBu1ldPr1marywa11etXXXXXXXXXXXXXXXXX8','rayswap','dog1',11520,150,480000,'MOMENTUM_EXHAUSTION','DEAD','dog','wholesome','community','The classic good boy.'),
  ('WOWDOGmirrorXXXXXXXXXXXXXXXXXXXXXXXXXX010','WOWDOG','Wow Dog','M1rr0rW0rksPr1marywa11etXXXXXXXXXXXXXXXX7','pumplaunch','dog2',3200,20,39000,'FAILED_LAUNCH','DEAD','dog','funny','internet','Such wow, very dog.'),
  ('MOONKdrainXXXXXXXXXXXXXXXXXXXXXXXXXXXX011','MOONK','Moon Kitty','Dra1nC0llectPr1marywa11etXXXXXXXXXXXXXXX5','moonpad','cat1',1440,45,260000,'LIQUIDITY_EVENT','DEAD','cat','funny','internet','A kitty headed to the moon.'),
  ('CATZdrainXXXXXXXXXXXXXXXXXXXXXXXXXXXXX012','CATZ','Catz','Dra1nC0llectPr1marywa11etXXXXXXXXXXXXXXX5','rayswap','cat1',2200,60,175000,'LIQUIDITY_EVENT','DEAD','cat','wholesome','community','All the catz in one place.'),
  ('SPLASHdrainXXXXXXXXXXXXXXXXXXXXXXXXXXX013','SPLASH','Splash Duck','Dra1nC0llectPr1marywa11etXXXXXXXXXXXXXXX5','pumplaunch','duck1',900,30,95000,'LIQUIDITY_EVENT','DEAD','duck','viral-story','internet','Splash into the pond.'),
  ('GROKauroraXXXXXXXXXXXXXXXXXXXXXXXXXXXX014','GROK','Grok Frog','Aur0raPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1','rayswap','frog1',20160,80,320000,'MOMENTUM_EXHAUSTION','DEAD','frog','funny','internet','A frog that groks it all.'),
  ('SUNNYauroraXXXXXXXXXXXXXXXXXXXXXXXXXXX015','SUNNY','Sunny Duck','Aur0raPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1','moonpad','duck2',25920,110,210000,'HEALTHY','ACTIVE','duck','wholesome','community','A sunny little duck.'),
  ('BONEauroraXXXXXXXXXXXXXXXXXXXXXXXXXXXX016','BONE','Bone Dog','Aur0raPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1','pumplaunch','dog2',30240,70,130000,'MOMENTUM_EXHAUSTION','DEAD','dog','funny','internet','Give the dog a bone.'),
  ('HOPZauroraXXXXXXXXXXXXXXXXXXXXXXXXXXXX017','HOPZ','Hopz Frog','Aur0raPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1','rayswap','frog1',40320,65,88000,'FAILED_LAUNCH','DEAD','frog','funny','internet','Hop hop hop.'),
  ('MEOWAauroraXXXXXXXXXXXXXXXXXXXXXXXXXXX018','MEOWA','Meow Aurora','Aur0raPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1','moonpad','cat1',43200,130,410000,'HEALTHY','ACTIVE','cat','wholesome','community','A gentle cat from Aurora.'),
  ('QUACKauroraXXXXXXXXXXXXXXXXXXXXXXXXXXX019','QUACK','Quack King','Aur0raPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1','pumplaunch','duck1',50400,95,275000,'MOMENTUM_EXHAUSTION','DEAD','duck','funny','internet','The king of quacks.'),
  ('STARDOGauroraXXXXXXXXXXXXXXXXXXXXXXXXX020','STARDOG','Star Dog','Aur0raPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1','rayswap','dog1',57600,140,190000,'DEV_SELLING','DEAD','dog','tragic','community','A dog among the stars.'),
  ('LILFROGauroraXXXXXXXXXXXXXXXXXXXXXXXXX021','LILFROG','Lil Frog','Aur0raPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1','moonpad','frog1',64800,50,62000,'FAILED_LAUNCH','DEAD','frog','funny','internet','A little frog with big dreams.'),
  ('AURORAcoinXXXXXXXXXXXXXXXXXXXXXXXXXXXX022','AURORA','Aurora Coin','Aur0raPrimewa11etXXXXXXXXXXXXXXXXXXXXXXX1','pumplaunch','rocket1',72000,160,540000,'MOMENTUM_EXHAUSTION','DEAD','rocket','viral-story','celebrity','The flagship Aurora launch.'),
  ('NITEnightXXXXXXXXXXXXXXXXXXXXXXXXXXXXX023','NITE','Night Owl','N1ghtSh1ftPr1marywa11etXXXXXXXXXXXXXXXXX3','rayswap','duck2',300,22,61000,'MOMENTUM_EXHAUSTION','DEAD','duck','tragic','internet','A night owl duck.'),
  ('SHADOWnightXXXXXXXXXXXXXXXXXXXXXXXXXXX024','SHADOW','Shadow Cat','N1ghtSh1ftPr1marywa11etXXXXXXXXXXXXXXXXX3','pumplaunch','cat1',600,18,44000,'DEV_SELLING','DEAD','cat','tragic','internet','A cat in the shadows.'),
  ('DUSKnightXXXXXXXXXXXXXXXXXXXXXXXXXXXXX025','DUSK','Dusk Frog','N1ghtSh1ftPr1marywa11etXXXXXXXXXXXXXXXXX3','moonpad','frog1',1500,25,72000,'MOMENTUM_EXHAUSTION','DEAD','frog','funny','internet','A frog at dusk.'),
  ('MIDNITEnightXXXXXXXXXXXXXXXXXXXXXXXXXX026','MIDNITE','Midnight Dog','N1ghtSh1ftPr1marywa11etXXXXXXXXXXXXXXXXX3','rayswap','dog2',2600,20,51000,'MOMENTUM_EXHAUSTION','DEAD','dog','funny','internet','A dog that howls at midnight.'),
  ('GLOOMnightXXXXXXXXXXXXXXXXXXXXXXXXXXXX027','GLOOM','Gloom Duck','N1ghtSh1ftPr1marywa11etXXXXXXXXXXXXXXXXX3','pumplaunch','duck1',3400,15,33000,'DEV_SELLING','DEAD','duck','tragic','internet','A gloomy little duck.'),
  ('RAVENnightXXXXXXXXXXXXXXXXXXXXXXXXXXXX028','RAVEN','Raven','N1ghtSh1ftPr1marywa11etXXXXXXXXXXXXXXXXX3','moonpad','cat1',4800,28,96000,'MOMENTUM_EXHAUSTION','DEAD','cat','tragic','community','Nevermore.'),
  ('ECLIPSEnightXXXXXXXXXXXXXXXXXXXXXXXXXX029','ECLIPSE','Eclipse Frog','N1ghtSh1ftPr1marywa11etXXXXXXXXXXXXXXXXX3','rayswap','frog1',6200,24,58000,'MOMENTUM_EXHAUSTION','DEAD','frog','funny','internet','A frog in the eclipse.'),
  ('VOIDnightXXXXXXXXXXXXXXXXXXXXXXXXXXXXX030','VOID','Void Dog','N1ghtSh1ftPr1marywa11etXXXXXXXXXXXXXXXXX3','pumplaunch','dog1',7800,19,41000,'FAILED_LAUNCH','DEAD','dog','tragic','internet','Into the void.'),
  ('DRIPdrainXXXXXXXXXXXXXXXXXXXXXXXXXXXXX031','DRIP','Drip Frog','Dra1nC0llectPr1marywa11etXXXXXXXXXXXXXXX5','moonpad','frog1',3000,40,140000,'LIQUIDITY_EVENT','DEAD','frog','funny','internet','Drip drip drip.'),
  ('TIDEdrainXXXXXXXXXXXXXXXXXXXXXXXXXXXXX032','TIDE','Tide Duck','Dra1nC0llectPr1marywa11etXXXXXXXXXXXXXXX5','rayswap','duck2',4200,55,220000,'LIQUIDITY_EVENT','DEAD','duck','viral-story','community','Ride the tide.'),
  ('WAVEdrainXXXXXXXXXXXXXXXXXXXXXXXXXXXXX033','WAVE','Wave Cat','Dra1nC0llectPr1marywa11etXXXXXXXXXXXXXXX5','pumplaunch','cat1',5400,35,88000,'ASSOCIATED_WALLET_DISTRIBUTION','DEAD','cat','funny','internet','Catch the wave.'),
  ('FLOODdrainXXXXXXXXXXXXXXXXXXXXXXXXXXXX034','FLOOD','Flood Dog','Dra1nC0llectPr1marywa11etXXXXXXXXXXXXXXX5','moonpad','dog2',6600,48,165000,'LIQUIDITY_EVENT','DEAD','dog','tragic','community','When the levee breaks.'),
  ('RINSEdrainXXXXXXXXXXXXXXXXXXXXXXXXXXXX035','RINSE','Rinse Frog','Dra1nC0llectPr1marywa11etXXXXXXXXXXXXXXX5','rayswap','frog1',7500,30,72000,'ASSOCIATED_WALLET_DISTRIBUTION','DEAD','frog','funny','internet','Rinse and repeat.'),
  ('LOUIEmirrorXXXXXXXXXXXXXXXXXXXXXXXXXXX036','LOUIE','Louie Classic','M1rr0rW0rksPr1marywa11etXXXXXXXXXXXXXXXX7','pumplaunch','duck1',8000,30,47000,'FAILED_LAUNCH','DEAD','duck','wholesome','internet','The classic Louie, reborn.'),
  ('PEPE2mirrorXXXXXXXXXXXXXXXXXXXXXXXXXXX037','PEPE2','Pepe Two','M1rr0rW0rksPr1marywa11etXXXXXXXXXXXXXXXX7','rayswap','frog1',9000,25,39000,'FAILED_LAUNCH','DEAD','frog','funny','internet','Pepe, the sequel.'),
  ('DOGEmirrorXXXXXXXXXXXXXXXXXXXXXXXXXXXX038','DOGE','Doge Mirror','M1rr0rW0rksPr1marywa11etXXXXXXXXXXXXXXXX7','moonpad','dog1',9500,22,52000,'FAILED_LAUNCH','DEAD','dog','wholesome','community','Reflecting the good boy.'),
  ('MEOWmirrorXXXXXXXXXXXXXXXXXXXXXXXXXXXX039','MEOW','Meow Mirror','M1rr0rW0rksPr1marywa11etXXXXXXXXXXXXXXXX7','pumplaunch','cat1',10200,28,61000,'MOMENTUM_EXHAUSTION','DEAD','cat','funny','internet','Meow in the mirror.'),
  ('QUACKmirrorXXXXXXXXXXXXXXXXXXXXXXXXXXX040','QUACK','Quack Mirror','M1rr0rW0rksPr1marywa11etXXXXXXXXXXXXXXXX7','rayswap','duck1',11000,20,35000,'FAILED_LAUNCH','DEAD','duck','funny','internet','Quack, reflected.'),
  ('GROKmirrorXXXXXXXXXXXXXXXXXXXXXXXXXXXX041','GROK','Grok Mirror','M1rr0rW0rksPr1marywa11etXXXXXXXXXXXXXXXX7','moonpad','frog1',12000,26,44000,'FAILED_LAUNCH','DEAD','frog','funny','internet','Grok, but a copy.'),
  ('BUILDERquietXXXXXXXXXXXXXXXXXXXXXXXXXX042','BUILDER','Builder Duck','Qu1etBu1ldPr1marywa11etXXXXXXXXXXXXXXXXX8','moonpad','duck2',14400,180,330000,'HEALTHY','ACTIVE','duck','wholesome','community','Build in public, one quack at a time.'),
  ('STEADYquietXXXXXXXXXXXXXXXXXXXXXXXXXXX043','STEADY','Steady Cat','Qu1etBu1ldPr1marywa11etXXXXXXXXXXXXXXXXX8','rayswap','cat1',20000,160,175000,'MOMENTUM_EXHAUSTION','DEAD','cat','wholesome','community','Slow and steady cat.'),
  ('CALMquietXXXXXXXXXXXXXXXXXXXXXXXXXXXXX044','CALM','Calm Frog','Qu1etBu1ldPr1marywa11etXXXXXXXXXXXXXXXXX8','pumplaunch','frog1',26000,120,98000,'HEALTHY','ACTIVE','frog','wholesome','community','Stay calm and hop on.'),
  ('ROOTquietXXXXXXXXXXXXXXXXXXXXXXXXXXXXX045','ROOT','Root Dog','Qu1etBu1ldPr1marywa11etXXXXXXXXXXXXXXXXX8','moonpad','dog2',33000,140,260000,'MOMENTUM_EXHAUSTION','DEAD','dog','wholesome','community','Rooted in community.'),
  ('SPROUTquietXXXXXXXXXXXXXXXXXXXXXXXXXXX046','SPROUT','Sprout','Qu1etBu1ldPr1marywa11etXXXXXXXXXXXXXXXXX8','rayswap','rocket1',41000,200,145000,'HEALTHY','ACTIVE','rocket','viral-story','community','Watch it grow.'),
  ('QUILLquietXXXXXXXXXXXXXXXXXXXXXXXXXXXX047','QUILL','Quill Duck','Qu1etBu1ldPr1marywa11etXXXXXXXXXXXXXXXXX8','pumplaunch','duck1',48000,100,71000,'FAILED_LAUNCH','DEAD','duck','tragic','community','A duck with a pen.'),
  ('FRESHmintXXXXXXXXXXXXXXXXXXXXXXXXXXXXX048','FRESH','Fresh Start','FreshM1ntPr1marywa11etXXXXXXXXXXXXXXXXXX9','pumplaunch','rocket1',30,15,22000,'HEALTHY','ACTIVE','rocket','viral-story','internet','A fresh start for everyone.')
),
img_map(key, url) AS (
  VALUES
  ('duck1','https://images.pexels.com/photos/31558264/pexels-photo-31558264.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('duck2','https://images.pexels.com/photos/37475355/pexels-photo-37475355.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('dog1','https://images.pexels.com/photos/16254908/pexels-photo-16254908.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('dog2','https://images.pexels.com/photos/25955633/pexels-photo-25955633.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('frog1','https://images.pexels.com/photos/12079027/pexels-photo-12079027.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('cat1','https://images.pexels.com/photos/33444883/pexels-photo-33444883.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('rocket1','https://images.pexels.com/photos/9710060/pexels-photo-9710060.jpeg?auto=compress&cs=tinysrgb&h=650&w=940')
)
INSERT INTO tokens (chain_id, platform_id, address, name, symbol, decimals, creator_wallet_id, created_at, first_seen_at, image_url, website_url, status)
SELECT c.id, p.id, v.addr, v.name, v.symbol, 9, w.id,
       (timestamptz '2026-08-16 12:00:00+00' - (v.mins || ' minutes')::interval),
       (timestamptz '2026-08-16 12:00:00+00' - (v.mins || ' minutes')::interval),
       im.url, NULL, v.status
FROM v
JOIN chains c ON c.chain_id = 'solana-mainnet'
JOIN platforms p ON p.slug = v.plat
JOIN wallets w ON w.address = v.devw
JOIN img_map im ON im.key = v.img
ON CONFLICT (chain_id, address) DO NOTHING;
