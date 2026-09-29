// Phase 2A — Ingestion worker.
//
// Implements the mandated flow:
//   launch detected -> validate launch -> check token identity ->
//   create/update token -> identify creator/deployer -> create/update wallet ->
//   create launch record -> fetch metadata -> store metadata ->
//   fetch initial market data -> store market snapshot ->
//   fetch relevant transactions -> store transactions -> finish ingestion
//
// Guarantees:
//   - idempotent: running the same job twice never duplicates rows
//     (natural-key upserts + tx_hash dedup)
//   - safe on failure: any step aborts the job, re-running resumes safely
//   - structured logs for every transition (no secrets)
//   - RAW provider payloads preserved in raw_data / raw_metadata

import type { ProviderSet } from '../providers/interfaces.ts';
import { ProviderError, IngestionError, toProviderError } from '../providers/errors.ts';
import {
  earlierTimestamp,
  formatWalletAge,
  isValidSolanaAddress,
  laterTimestamp,
  normalizeToken,
  sanitizeJson,
  type WalletAgeResult,
} from '../providers/normalize.ts';
import { createLogger, type StructuredLogger } from './logger.ts';
import type { ChainInfo, IngestionStore } from './store.ts';
import type { Wallet } from '../types/index.ts';

export interface IngestionWorkerOptions {
  providers: ProviderSet;
  store: IngestionStore;
  logger?: StructuredLogger;
  maxRetries?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** When true, resolve + normalize + log, but write nothing. */
  dryRun?: boolean;
  /**
   * Phase 2B: optional post-ingestion hook (e.g. run the intelligence
   * analysis runner). Invoked once per successful non-dry-run ingestion.
   * Failures are logged but never fail the ingestion itself.
   */
  postIngest?: (result: IngestResult) => Promise<void>;
}

export interface IngestResult {
  provider: string;
  tokenAddress: string;
  tokenId: string | null;
  jobId: string;
  dryRun: boolean;
  token: { created: boolean } | null;
  wallet: {
    address: string | null;
    created: boolean;
    ageAtLaunch: WalletAgeResult | null;
  };
  launch: { created: boolean } | null;
  metadata: boolean;
  marketSnapshot: boolean;
  transactionsStored: number;
  transactionsSkipped: number;
  events: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class IngestionWorker {
  private readonly providers: ProviderSet;
  private readonly store: IngestionStore;
  private readonly logger: StructuredLogger;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly dryRun: boolean;
  private readonly postIngest?: (result: IngestResult) => Promise<void>;
  private currentJobId = '';

  constructor(options: IngestionWorkerOptions) {
    this.providers = options.providers;
    this.store = options.store;
    this.logger = options.logger ?? createLogger();
    this.maxRetries = Math.max(0, options.maxRetries ?? 2);
    this.backoffBaseMs = Math.max(0, options.backoffBaseMs ?? 250);
    this.backoffMaxMs = Math.max(250, options.backoffMaxMs ?? 8000);
    this.dryRun = options.dryRun ?? false;
    this.postIngest = options.postIngest;
  }

  async ingest(tokenAddress: string): Promise<IngestResult> {
    const log = this.logger.child({ provider: this.providers.name, tokenAddress });
    const events: string[] = [];
    let attempt = 0;

    for (;;) {
      events.length = 0; // events are per-attempt; retries must not accumulate duplicates
      try {
        const result = await this.tryIngest(tokenAddress, log, events);
        log.info('ingestion_completed', { tokenAddress, tokenId: result.tokenId, events });
        return result;
      } catch (err) {
        const structured = this.toIngestionError(err, tokenAddress);
        if (structured.retryable && attempt < this.maxRetries) {
          attempt += 1;
          const backoff = Math.min(this.backoffMaxMs, this.backoffBaseMs * Math.pow(2, attempt - 1));
          log.warn('ingestion_retrying', { attempt, backoffMs: backoff, kind: structured.kind });
          await sleep(backoff);
          continue;
        }
        await this.store.finishJob(this.currentJobId, 'FAILED', 0, structured.message);
        log.error('ingestion_failed', { kind: structured.kind, message: structured.message, attempt, events });
        throw structured;
      }
    }
  }

  private toIngestionError(err: unknown, tokenAddress: string): IngestionError {
    const structured = toProviderError(err, this.providers.name, 0);
    return new IngestionError({
      kind: structured.kind,
      message: structured.message,
      tokenAddress,
      retryable: structured.retryable,
      cause: err,
    });
  }

  private async tryIngest(
    tokenAddress: string,
    log: StructuredLogger,
    events: string[],
  ): Promise<IngestResult> {
    const p = this.providers;

    // ---- validate launch ------------------------------------------------
    log.info('provider_request', { method: 'getLaunch', address: tokenAddress });
    const detected = await p.launch.getLaunch(tokenAddress);
    if (!detected) {
      log.info('launch_not_detected', { address: tokenAddress });
    } else {
      events.push('launch_detected');
    }

    if (!isValidSolanaAddress(tokenAddress)) {
      throw new IngestionError({
        kind: 'INVALID_ARGUMENT',
        message: `Refusing ingest: invalid token address "${tokenAddress ?? ''}"`,
        tokenAddress,
      });
    }

    // ---- token identity --------------------------------------------------
    log.info('provider_request', { method: 'getToken', address: tokenAddress });
    const rawProviderToken = await p.blockchain.getToken(tokenAddress);
    if (!rawProviderToken) {
      throw new IngestionError({
        kind: 'NOT_FOUND',
        message: `Token not found / not a token mint: ${tokenAddress}`,
        tokenAddress,
      });
    }

    const chain = await this.store.ensureChain(p.chainSlug, p.nativeSymbol);
    const token = normalizeToken({
      chainId: chain.id,
      address: tokenAddress,
      name: rawProviderToken.name,
      symbol: rawProviderToken.symbol,
      decimals: rawProviderToken.decimals,
      firstSeenAt: rawProviderToken.first_seen_at,
      createdAt: rawProviderToken.created_at,
      imageUrl: rawProviderToken.image_url,
      raw: rawProviderToken.raw_data ?? {},
    });

    this.currentJobId = await this.store.createJob('live', p.name, tokenAddress);
    log.info('job_started', { jobId: this.currentJobId });

    const existing = await this.store.getTokenByAddress(chain.id, tokenAddress);
    token.created_at = token.created_at ?? existing?.created_at ?? null;
    token.first_seen_at = earlierTimestamp(existing?.first_seen_at, token.first_seen_at);

    let tokenOutcome;
    if (this.dryRun) {
      tokenOutcome = existing ? { id: existing.id, created: false } : { id: null, created: true };
      log.info(existing ? 'token_updated' : 'token_discovered', { address: tokenAddress, dryRun: true });
    } else {
      tokenOutcome = await this.store.upsertToken(token);
      log.info(tokenOutcome.created ? 'token_created' : 'token_updated', { address: tokenAddress, tokenId: tokenOutcome.id });
    }
    events.push(tokenOutcome.created ? 'token_created' : 'token_updated');
// ---- creator / deployer wallet ---------------------------------------
    const creatorWalletAddress =
      detected?.creatorWalletAddress
      ?? (rawProviderToken.raw_data as { mintAuthority?: string | null } | null)?.mintAuthority
      ?? null;

    let walletId: string | null = null;
    let walletAge: WalletAgeResult | null = null;
    const walletResult: IngestResult['wallet'] = { address: creatorWalletAddress, created: false, ageAtLaunch: null };

    if (creatorWalletAddress) {
      log.info('provider_request', { method: 'getWallet', address: creatorWalletAddress });
      const rawWallet = await p.blockchain.getWallet(creatorWalletAddress);
      if (rawWallet) {
        const wallet = normalizeWalletForStore(rawWallet, chain);
        const existingWallet = await this.store.getWalletByAddress(chain.id, creatorWalletAddress);
        wallet.first_seen_at = earlierTimestamp(existingWallet?.first_seen_at, wallet.first_seen_at);
        wallet.last_seen_at = laterTimestamp(existingWallet?.last_seen_at, wallet.last_seen_at);
        wallet.transaction_count = Math.max(existingWallet?.transaction_count ?? 0, wallet.transaction_count ?? 0);
        if (existingWallet && existingWallet.wallet_type !== 'UNKNOWN') wallet.wallet_type = existingWallet.wallet_type;

        if (this.dryRun) {
          walletResult.created = !existingWallet;
        } else {
          const wOutcome = await this.store.upsertWallet(wallet);
          walletId = wOutcome.id;
          walletResult.created = wOutcome.created;
        }
        log.info(walletResult.created ? 'wallet_created' : 'wallet_updated', { address: creatorWalletAddress, walletId });
        events.push(walletResult.created ? 'wallet_created' : 'wallet_updated');

        // "First observed on-chain" — never claimed as creation time.
        const launchTime = detected?.launchTime ?? token.created_at ?? rawWallet.first_seen_at;
        walletAge = formatWalletAge(wallet.first_seen_at, launchTime);
        walletResult.ageAtLaunch = walletAge;
        log.info('wallet_age_at_launch', {
          walletAddress: creatorWalletAddress,
          firstObservedOnChain: wallet.first_seen_at,
          launchTime,
          ageLabel: walletAge.label,
          isFresh: walletAge.isFresh,
        });
      }
    } else {
      log.info('wallet_unknown', { address: tokenAddress });
    }
// ---- launch record ------------------------------------------------------
    let launchOutcome: { created: boolean } | null = null;
    if (this.dryRun) {
      launchOutcome = { created: true };
      events.push('launch_created');
    } else if (detected && tokenOutcome?.id) {
      const platformId = detected.platform
        ? await this.store.ensurePlatform(chain.id, detected.platform.slug, detected.platform.name, detected.platform.url)
        : null;
      const launchTime = detected.launchTime ?? token.created_at;
      if (launchTime) {
        const outcome = await this.store.upsertLaunch({
          id: '',
          token_id: tokenOutcome.id,
          developer_id: null,
          platform_id: platformId,
          launch_time: launchTime,
          initial_liquidity: detected.initialLiquidity ?? 0,
          initial_market_cap: detected.initialMarketCap ?? 0,
          launch_transaction: null,
          status: 'COMPLETED',
          created_at: '',
          raw_data: sanitizeJson(detected.raw ?? {}),
        });
        launchOutcome = { created: outcome.created };
        log.info(outcome.created ? 'launch_created' : 'launch_updated', { tokenAddress, tokenId: tokenOutcome.id });
        events.push(outcome.created ? 'launch_created' : 'launch_updated');
      }
    }

    // ---- metadata -------------------------------------------------------------
    let metadataStored = false;
    const providerMetadata = await p.blockchain.getTokenMetadata(tokenAddress);
    if (providerMetadata && tokenOutcome?.id) {
      if (!this.dryRun) {
        await this.store.upsertTokenMetadata({ ...providerMetadata, token_id: tokenOutcome.id });
      }
      metadataStored = true;
      log.info('metadata_fetched', { tokenAddress });
      events.push('metadata_fetched');
    } else {
      log.info('metadata_missing', { tokenAddress });
      events.push('metadata_missing');
    }

    // ---- initial market data -----------------------------------------------------
    let marketStored = false;
    const marketSnapshot = await p.market.getTokenMarketData(tokenAddress);
    if (marketSnapshot && tokenOutcome?.id) {
      if (!this.dryRun) {
        await this.store.upsertMarketSnapshot({ ...marketSnapshot, token_id: tokenOutcome.id });
      }
      marketStored = true;
      events.push('market_snapshot_created');
    } else {
      log.info('market_data_missing', { tokenAddress });
      events.push('market_data_missing');
    }
// ---- relevant transactions --------------------------------------------------
    let transactionsStored = 0;
    let transactionsSkipped = 0;
    const txs = await p.blockchain.getTokenTransactions(tokenAddress);
    const sortedTxs = [...txs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    if (sortedTxs.length === 0) {
      log.info('transactions_missing', { tokenAddress });
      events.push('transactions_missing');
    }
    for (const tx of sortedTxs) {
      if (this.dryRun) {
        transactionsStored += 1;
        continue;
      }
      try {
        if (await this.store.transactionExists(tx.tx_hash)) {
          transactionsSkipped += 1;
          log.info('transaction_skipped', { tokenAddress, txHash: tx.tx_hash, reason: 'already_ingested' });
          continue;
        }
        await this.store.insertTransaction({ ...tx, chain_id: chain.id, token_id: tokenOutcome?.id ?? null, wallet_id: tx.wallet_id ?? walletId });
        transactionsStored += 1;
      } catch (err) {
        transactionsSkipped += 1;
        log.warn('transaction_skipped', { tokenAddress, txHash: tx.tx_hash, kind: toErrKind(err) });
      }
    }
    if (transactionsStored > 0) log.info('transaction_created', { count: transactionsStored, tokenAddress });

    // wallet-level transactions enrich wallet profiling (token_id stays null)
    if (walletId && creatorWalletAddress && !this.dryRun) {
      try {
        const walletTxs = await p.blockchain.getTransactions(creatorWalletAddress);
        let walletTxStored = 0;
        for (const tx of walletTxs) {
          try {
            if (await this.store.transactionExists(tx.tx_hash)) continue;
            await this.store.insertTransaction({ ...tx, chain_id: chain.id, token_id: null, wallet_id: walletId });
            walletTxStored += 1;
          } catch {
            /* skip individual wallet tx on conflict */
          }
        }
        if (walletTxStored > 0) {
          log.info('transaction_created', { count: walletTxStored, wallet: creatorWalletAddress, tokenId: null });
        }
      } catch (err) {
        log.warn('wallet_transactions_failed', { kind: toErrKind(err), message: messageOf(err) });
      }
    }

    if (!this.dryRun) await this.store.finishJob(this.currentJobId, 'SUCCEEDED', 1, null);

    const result: IngestResult = {
      provider: p.name,
      tokenAddress,
      tokenId: tokenOutcome?.id ?? existing?.id ?? null,
      jobId: this.currentJobId,
      dryRun: this.dryRun,
      token: tokenOutcome ? { created: tokenOutcome.created } : null,
      wallet: walletResult,
      launch: launchOutcome,
      metadata: metadataStored,
      marketSnapshot: marketStored,
      transactionsStored,
      transactionsSkipped,
      events,
    };

    // Phase 2B: optional intelligence hook — never fails the ingestion.
    if (this.postIngest && !this.dryRun) {
      try {
        await this.postIngest(result);
      } catch (err) {
        log.warn('post_ingest_failed', { tokenAddress, kind: toErrKind(err), message: messageOf(err) });
        events.push('post_ingest_failed');
      }
    }

    return result;
  }
}

function normalizeWalletForStore(raw: Wallet, chain: ChainInfo): Wallet {
  return {
    id: raw.id ?? '',
    chain_id: chain.id,
    address: raw.address,
    first_seen_at: raw.first_seen_at,
    last_seen_at: raw.last_seen_at,
    transaction_count: raw.transaction_count,
    wallet_type: raw.wallet_type,
    created_at: raw.created_at || '',
    updated_at: raw.updated_at || '',
    raw_data: sanitizeJson(raw.raw_data ?? {}),
  };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function toErrKind(err: unknown): string {
  return err instanceof ProviderError ? err.kind : 'UNKNOWN';
}