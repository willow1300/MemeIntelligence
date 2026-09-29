// Live-network smoke test for the real Solana provider (no DB writes).
//
//   npx tsx scripts/probe-live.ts
//
// Queries real mainnet data through the provider adapter and prints the
// normalized results. Useful for verifying RPC connectivity and
// normalization without touching PostgreSQL.
import 'dotenv/config';
import { buildProviderSet } from '../src/providers/provider-factory.ts';

const set = buildProviderSet({ dataProvider: 'solana' });
console.log('provider:', set.name, '| chain:', set.chainSlug);

// USDC (real mainnet mint)
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const token = await set.blockchain.getToken(USDC);
console.log('token:', JSON.stringify({
  address: token?.address,
  decimals: token?.decimals,
  firstSeenAt: token?.first_seen_at,
  rawSource: (token?.raw_data as { source?: string } | undefined)?.source,
}));

// A well-known wallet (Binance hot wallet)
const WALLET = '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9';
const wallet = await set.blockchain.getWallet(WALLET);
console.log('wallet:', JSON.stringify({
  address: wallet?.address,
  firstSeenAt: wallet?.first_seen_at,
  lastSeenAt: wallet?.last_seen_at,
  txCount: wallet?.transaction_count,
}));

const launches = await set.launch.getRecentLaunches();
console.log('recentLaunches:', launches.length, '(launchpad detection is a Phase 2B deliverable)');
