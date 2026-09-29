// Phase 2B.1 — Wallet Intelligence over canonical AnalysisStore.
import { describe, it, expect } from 'vitest';
import { buildWalletIntelligence, classifyWalletAge } from '../src/intelligence/wallet-intelligence.ts';
import { fxBrandNew, fxEstablished, fxNoFirstSeen, fxWithDev, T0 } from './helpers/intel-fixtures.ts';

describe('wallet-intelligence (AnalysisStore)', () => {
  it('brand-new wallet: 30s age, VERY_NEW, 1 before and 1 after', async () => {
    const { store, walletId, tokenId } = await fxBrandNew();
    const r = await buildWalletIntelligence(store, { walletId, tokenId });
    expect(r.walletAgeAtLaunch?.seconds).toBe(30);
    expect(r.ageSignal).toBe('VERY_NEW');
    expect(r.activity.transactionsBeforeLaunch).toBe(1);
    expect(r.activity.transactionsAfterLaunch).toBe(1);
    expect(r.activity.transactionCount).toBe(2);
    expect(r.activity.uniqueTokensInteractedWith).toBe(1);
    expect(r.previousLaunches).toHaveLength(1);
  });
  it('established wallet: LONG_ESTABLISHED, 2 before and 1 after', async () => {
    const { store, walletId, tokenId } = await fxEstablished();
    const r = await buildWalletIntelligence(store, { walletId, tokenId });
    expect(r.ageSignal).toBe('LONG_ESTABLISHED');
    expect(r.walletAgeAtLaunch!.days).toBeGreaterThan(90);
    expect(r.activity.transactionsBeforeLaunch).toBe(2);
    expect(r.activity.transactionsAfterLaunch).toBe(1);
    expect(r.previousLaunches).toHaveLength(2);
    const old = r.previousLaunches.find((p) => p.tokenSymbol === 'OLD')!;
    expect(old.peakMarketCap).toBe(50_000);
    expect(old.outcome).toBe('LIQUIDITY_EVENT');
  });
  it('missing first-observed: null age, UNKNOWN, no invention', async () => {
    const { store, walletId, tokenId } = await fxNoFirstSeen();
    const r = await buildWalletIntelligence(store, { walletId, tokenId });
    expect(r.firstObservedOnChain).toBeNull();
    expect(r.lastObservedOnChain).toBeNull();
    expect(r.walletAgeAtLaunch).toBeNull();
    expect(r.ageSignal).toBe('UNKNOWN');
    expect(r.activity.transactionCount).toBe(0);
    expect(r.activity.uniqueTokensInteractedWith).toBe(0);
  });
  it('before-launch count from stored timestamps', async () => {
    const { store, walletId } = await fxEstablished();
    const r = await buildWalletIntelligence(store, { walletId, launchTime: T0 });
    expect(r.activity.transactionsBeforeLaunch).toBe(2);
  });
  it('after-launch count independent of wallet row', async () => {
    const { store, walletId } = await fxBrandNew();
    const r = await buildWalletIntelligence(store, { walletId, launchTime: T0 });
    expect(r.activity.transactionsAfterLaunch).toBe(1);
  });
  it('previous launches from stored creator links', async () => {
    const { store, walletId } = await fxEstablished();
    const r = await buildWalletIntelligence(store, { walletId, launchTime: T0 });
    expect(r.activity.observedLaunches).toBe(2);
    expect(r.previousLaunches.map((p) => p.tokenSymbol).sort()).toEqual(['EST', 'OLD']);
  });
  it('incomplete history yields nulls not zeros', async () => {
    const { store, walletId } = await fxNoFirstSeen();
    const r = await buildWalletIntelligence(store, { walletId });
    expect(r.launchTime).toBeTruthy();
    expect(r.walletAgeAtLaunch).toBeNull();
    expect(r.activity.transactionsBeforeLaunch).toBe(0);
    expect(r.activity.transactionsAfterLaunch).toBe(0);
  });
  it('stored developer association exposed without graph', async () => {
    const { store, walletId, tokenId } = await fxWithDev();
    const r = await buildWalletIntelligence(store, { walletId, tokenId });
    expect(r.developerWallets).toHaveLength(1);
    expect(r.developerWallets[0].relationshipType).toBe('PRIMARY');
    expect(r.developerWallets[0].confidence).toBe(0.95);
  });
  it('thresholds explicit and deterministic', () => {
    expect(classifyWalletAge(30)).toBe('VERY_NEW');
    expect(classifyWalletAge(3600)).toBe('NEW');
    expect(classifyWalletAge(7 * 86400)).toBe('ESTABLISHED');
    expect(classifyWalletAge(90 * 86400 + 1)).toBe('LONG_ESTABLISHED');
    expect(classifyWalletAge(null)).toBe('UNKNOWN');
  });
});
