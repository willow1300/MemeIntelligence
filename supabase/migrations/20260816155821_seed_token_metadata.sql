/*
# Seed: token_metadata

One metadata row per token. raw_metadata stores analytical hints
(theme, narrative, culture, peak_mc, ttp_min, failure_type, minutes_ago)
consumed by later migrations to derive launches, lifecycles and meta labels.
Social links are synthesized deterministically from the symbol.
*/

WITH v(addr, descr, theme, narr, cult, peak, ttp, ftype, mins) AS (
  VALUES
  ('LOUIEheroXXXXXXXXXXXXXXXXXXXXXXXXXXXXX001','A wholesome duck mascot for the community. Louie waddles to the moon.','duck','wholesome','internet',82000,25,'HEALTHY',40),
  ('LOUIEauroraXXXXXXXXXXXXXXXXXXXXXXXXXXX002','The original wholesome duck. Louie says hi.','duck','wholesome','internet',620000,55,'MOMENTUM_EXHAUSTION',101),
  ('LOUIE2nightXXXXXXXXXXXXXXXXXXXXXXXXXXX003','Louie is back, two times the duck energy.','duck','wholesome','internet',83000,30,'MOMENTUM_EXHAUSTION',20),
  ('MIRACLElouieXXXXXXXXXXXXXXXXXXXXXXXXXX004','The miracle duck that touched hearts before it vanished.','duck','tragic','community',210000,90,'DEV_SELLING',4320),
  ('PEPEprimeXXXXXXXXXXXXXXXXXXXXXXXXXXXXX005','The prime frog. Feels good man.','frog','funny','internet',1420000,120,'MOMENTUM_EXHAUSTION',8640),
  ('PEPEreduxXXXXXXXXXXXXXXXXXXXXXXXXXXXXX006','Another take on the classic frog.','frog','funny','internet',74000,40,'FAILED_LAUNCH',5760),
  ('PEPErealXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX007','The real frog, accept no substitutes.','frog','funny','internet',156000,35,'DEV_SELLING',2880),
  ('DOGE2auroraXXXXXXXXXXXXXXXXXXXXXXXXXXX008','Much wow. Very community. Second edition.','dog','wholesome','community',940000,200,'HEALTHY',12960),
  ('DOGEclassicXXXXXXXXXXXXXXXXXXXXXXXXXXX009','The classic good boy.','dog','wholesome','community',480000,150,'MOMENTUM_EXHAUSTION',11520),
  ('WOWDOGmirrorXXXXXXXXXXXXXXXXXXXXXXXXXX010','Such wow, very dog.','dog','funny','internet',39000,20,'FAILED_LAUNCH',3200),
  ('MOONKdrainXXXXXXXXXXXXXXXXXXXXXXXXXXXX011','A kitty headed to the moon.','cat','funny','internet',260000,45,'LIQUIDITY_EVENT',1440),
  ('CATZdrainXXXXXXXXXXXXXXXXXXXXXXXXXXXXX012','All the catz in one place.','cat','wholesome','community',175000,60,'LIQUIDITY_EVENT',2200),
  ('SPLASHdrainXXXXXXXXXXXXXXXXXXXXXXXXXXX013','Splash into the pond.','duck','viral-story','internet',95000,30,'LIQUIDITY_EVENT',900),
  ('GROKauroraXXXXXXXXXXXXXXXXXXXXXXXXXXXX014','A frog that groks it all.','frog','funny','internet',320000,80,'MOMENTUM_EXHAUSTION',20160),
  ('SUNNYauroraXXXXXXXXXXXXXXXXXXXXXXXXXXX015','A sunny little duck.','duck','wholesome','community',210000,110,'HEALTHY',25920),
  ('BONEauroraXXXXXXXXXXXXXXXXXXXXXXXXXXXX016','Give the dog a bone.','dog','funny','internet',130000,70,'MOMENTUM_EXHAUSTION',30240),
  ('HOPZauroraXXXXXXXXXXXXXXXXXXXXXXXXXXXX017','Hop hop hop.','frog','funny','internet',88000,65,'FAILED_LAUNCH',40320),
  ('MEOWAauroraXXXXXXXXXXXXXXXXXXXXXXXXXXX018','A gentle cat from Aurora.','cat','wholesome','community',410000,130,'HEALTHY',43200),
  ('QUACKauroraXXXXXXXXXXXXXXXXXXXXXXXXXXX019','The king of quacks.','duck','funny','internet',275000,95,'MOMENTUM_EXHAUSTION',50400),
  ('STARDOGauroraXXXXXXXXXXXXXXXXXXXXXXXXX020','A dog among the stars.','dog','tragic','community',190000,140,'DEV_SELLING',57600),
  ('LILFROGauroraXXXXXXXXXXXXXXXXXXXXXXXXX021','A little frog with big dreams.','frog','funny','internet',62000,50,'FAILED_LAUNCH',64800),
  ('AURORAcoinXXXXXXXXXXXXXXXXXXXXXXXXXXXX022','The flagship Aurora launch.','rocket','viral-story','celebrity',540000,160,'MOMENTUM_EXHAUSTION',72000),
  ('NITEnightXXXXXXXXXXXXXXXXXXXXXXXXXXXXX023','A night owl duck.','duck','tragic','internet',61000,22,'MOMENTUM_EXHAUSTION',300),
  ('SHADOWnightXXXXXXXXXXXXXXXXXXXXXXXXXXX024','A cat in the shadows.','cat','tragic','internet',44000,18,'DEV_SELLING',600),
  ('DUSKnightXXXXXXXXXXXXXXXXXXXXXXXXXXXXX025','A frog at dusk.','frog','funny','internet',72000,25,'MOMENTUM_EXHAUSTION',1500),
  ('MIDNITEnightXXXXXXXXXXXXXXXXXXXXXXXXXX026','A dog that howls at midnight.','dog','funny','internet',51000,20,'MOMENTUM_EXHAUSTION',2600),
  ('GLOOMnightXXXXXXXXXXXXXXXXXXXXXXXXXXXX027','A gloomy little duck.','duck','tragic','internet',33000,15,'DEV_SELLING',3400),
  ('RAVENnightXXXXXXXXXXXXXXXXXXXXXXXXXXXX028','Nevermore.','cat','tragic','community',96000,28,'MOMENTUM_EXHAUSTION',4800),
  ('ECLIPSEnightXXXXXXXXXXXXXXXXXXXXXXXXXX029','A frog in the eclipse.','frog','funny','internet',58000,24,'MOMENTUM_EXHAUSTION',6200),
  ('VOIDnightXXXXXXXXXXXXXXXXXXXXXXXXXXXXX030','Into the void.','dog','tragic','internet',41000,19,'FAILED_LAUNCH',7800),
  ('DRIPdrainXXXXXXXXXXXXXXXXXXXXXXXXXXXXX031','Drip drip drip.','frog','funny','internet',140000,40,'LIQUIDITY_EVENT',3000),
  ('TIDEdrainXXXXXXXXXXXXXXXXXXXXXXXXXXXXX032','Ride the tide.','duck','viral-story','community',220000,55,'LIQUIDITY_EVENT',4200),
  ('WAVEdrainXXXXXXXXXXXXXXXXXXXXXXXXXXXXX033','Catch the wave.','cat','funny','internet',88000,35,'ASSOCIATED_WALLET_DISTRIBUTION',5400),
  ('FLOODdrainXXXXXXXXXXXXXXXXXXXXXXXXXXXX034','When the levee breaks.','dog','tragic','community',165000,48,'LIQUIDITY_EVENT',6600),
  ('RINSEdrainXXXXXXXXXXXXXXXXXXXXXXXXXXXX035','Rinse and repeat.','frog','funny','internet',72000,30,'ASSOCIATED_WALLET_DISTRIBUTION',7500),
  ('LOUIEmirrorXXXXXXXXXXXXXXXXXXXXXXXXXXX036','The classic Louie, reborn.','duck','wholesome','internet',47000,30,'FAILED_LAUNCH',8000),
  ('PEPE2mirrorXXXXXXXXXXXXXXXXXXXXXXXXXXX037','Pepe, the sequel.','frog','funny','internet',39000,25,'FAILED_LAUNCH',9000),
  ('DOGEmirrorXXXXXXXXXXXXXXXXXXXXXXXXXXXX038','Reflecting the good boy.','dog','wholesome','community',52000,22,'FAILED_LAUNCH',9500),
  ('MEOWmirrorXXXXXXXXXXXXXXXXXXXXXXXXXXXX039','Meow in the mirror.','cat','funny','internet',61000,28,'MOMENTUM_EXHAUSTION',10200),
  ('QUACKmirrorXXXXXXXXXXXXXXXXXXXXXXXXXXX040','Quack, reflected.','duck','funny','internet',35000,20,'FAILED_LAUNCH',11000),
  ('GROKmirrorXXXXXXXXXXXXXXXXXXXXXXXXXXXX041','Grok, but a copy.','frog','funny','internet',44000,26,'FAILED_LAUNCH',12000),
  ('BUILDERquietXXXXXXXXXXXXXXXXXXXXXXXXXX042','Build in public, one quack at a time.','duck','wholesome','community',330000,180,'HEALTHY',14400),
  ('STEADYquietXXXXXXXXXXXXXXXXXXXXXXXXXXX043','Slow and steady cat.','cat','wholesome','community',175000,160,'MOMENTUM_EXHAUSTION',20000),
  ('CALMquietXXXXXXXXXXXXXXXXXXXXXXXXXXXXX044','Stay calm and hop on.','frog','wholesome','community',98000,120,'HEALTHY',26000),
  ('ROOTquietXXXXXXXXXXXXXXXXXXXXXXXXXXXXX045','Rooted in community.','dog','wholesome','community',260000,140,'MOMENTUM_EXHAUSTION',33000),
  ('SPROUTquietXXXXXXXXXXXXXXXXXXXXXXXXXXX046','Watch it grow.','rocket','viral-story','community',145000,200,'HEALTHY',41000),
  ('QUILLquietXXXXXXXXXXXXXXXXXXXXXXXXXXXX047','A duck with a pen.','duck','tragic','community',71000,100,'FAILED_LAUNCH',48000),
  ('FRESHmintXXXXXXXXXXXXXXXXXXXXXXXXXXXXX048','A fresh start for everyone.','rocket','viral-story','internet',22000,15,'HEALTHY',30)
)
INSERT INTO token_metadata (token_id, description, image_url, website_url, twitter_url, telegram_url, metadata_uri, raw_metadata)
SELECT t.id, v.descr, t.image_url,
       'https://' || lower(t.symbol) || '.meme.test',
       'https://twitter.com/' || lower(t.symbol) || 'coin',
       'https://t.me/' || lower(t.symbol),
       'ipfs://meta/' || t.address,
       jsonb_build_object(
         'theme', v.theme, 'narrative', v.narr, 'culture', v.cult,
         'peak_mc', v.peak, 'ttp_min', v.ttp, 'failure_type', v.ftype, 'minutes_ago', v.mins
       )
FROM v
JOIN tokens t ON t.address = v.addr
ON CONFLICT (token_id) DO NOTHING;
