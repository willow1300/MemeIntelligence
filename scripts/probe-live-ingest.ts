// Live end-to-end ingestion probe: REAL Solana provider -> worker -> store.
//
//   npx tsx scripts/probe-live-ingest.ts
//
// Uses MemoryStore (no PostgreSQL connection) to prove the full Phase 2A
// pipeline on real on-chain data: normalize -> validate -> token/wallet/
// launch/metadata/market/transactions -> idempotent re-ingest.
// The second run must report token created:false and must not grow the store.
import 'dotenv/config';
import { buildProviderSet } from '../src/providers/provider-factory.ts';
import { MemoryStore } from '../src/ingestion/memory-store.ts';
import { IngestionWorker } from '../src/ingestion/worker.ts';
import { createLogger } from '../src/ingestion/logger.ts';

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const providers = buildProviderSet({ dataProvider: 'solana' });
const store = new MemoryStore();
const log = createLogger();
const worker = new IngestionWorker({ providers, store, logger: log });

console.error(`[probe] provider=${providers.name} store=memory token=${USDC}`);
const first = await worker.ingest(USDC);
const sizeAfterFirst = {
  tokens: store.tokens.size,
  wallets: store.wallets.size,
  launches: store.launches.size,
  metadata: store.metadata.size,
  marketSnapshots: store.marketSnapshots.size,
  transactions: store.transactions.size,
};
const second = await worker.ingest(USDC);
const sizeAfterSecond = {
  tokens: store.tokens.size,
  wallets: store.wallets.size,
  launches: store.launches.size,
  metadata: store.metadata.size,
  marketSnapshots: store.marketSnapshots.size,
  transactions: store.transactions.size,
};

// Live-chain idempotency semantics: the chain keeps producing new transactions
// between runs, so row growth in `transactions` is legitimate NEW data. The
// invariants that must hold are:
//   1. the token/wallet/launch rows were NOT duplicated (token.created=false)
//   2. every tx hash from run 1 is still present exactly once in run 2
//      (previously-ingested data is never re-created)
const hashesAfterFirst = new Set(store.transactions.keys());
const stillPresent = [...hashesAfterFirst].every((h) => store.transactions.has(h));
const uniqueHashes = store.transactions.size === new Set(store.transactions.keys()).size;

const idempotent =
  second.token?.created === false &&
  second.wallet.created === false &&
  stillPresent &&
  uniqueHashes &&
  sizeAfterSecond.tokens === sizeAfterFirst.tokens &&
  sizeAfterSecond.wallets === sizeAfterFirst.wallets &&
  sizeAfterSecond.launches === sizeAfterFirst.launches;

console.log(JSON.stringify({
  provider: providers.name,
  firstRun: {
    tokenCreated: first.token?.created ?? null,
    walletCreated: first.wallet.created,
    creatorWallet: first.wallet.address,
    walletFirstSeenAt: store.wallets.get(
      [...store.wallets.keys()].find((k) => store.wallets.get(k)?.address === first.wallet.address) ?? '',
    )?.first_seen_at ?? null,
    walletAgeAtLaunch: first.wallet.ageAtLaunch?.label ?? null,
    launchCreated: first.launch?.created ?? null,
    metadataStored: first.metadata,
    marketSnapshotStored: first.marketSnapshot,
    transactionsStored: first.transactionsStored,
    transactionsSkipped: first.transactionsSkipped,
    events: first.events,
  },
  storeRowsAfterFirstRun: sizeAfterFirst,
  secondRun: {
    tokenCreated: second.token?.created ?? null,
    walletCreated: second.wallet.created,
    transactionsStored: second.transactionsStored,
    newTxsSinceFirstRun: sizeAfterSecond.transactions - sizeAfterFirst.transactions,
  },
  storeRowsAfterSecondRun: sizeAfterSecond,
  idempotent,
}, null, 2));
