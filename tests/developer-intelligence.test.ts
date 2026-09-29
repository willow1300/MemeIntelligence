// Phase 2B.1 — Developer Intelligence over canonical AnalysisStore.
import { describe, it, expect } from 'vitest';
import { buildDeveloperIntelligence } from '../src/intelligence/developer-intelligence.ts';
import { fxNoHistory, fxOnePrevious, fxMulti } from './helpers/intel-fixtures.ts';

describe('developer-intelligence (AnalysisStore)', () => {
  it('developer with no history: null identity, zero counts, null stats', async () => {
    const { store, tokenId } = await fxNoHistory();
    const r = await buildDeveloperIntelligence(store, { tokenId });
    expect(r.developerId).toBeNull();
    expect(r.launchCount).toBe(0);
    expect(r.previousLaunchCount).toBe(0);
    expect(r.previousLaunches).toEqual([]);
    expect(r.statistics.peakMarketCapAverage).toBeNull();
    expect(r.statistics.highestPeakMarketCap).toBeNull();
    expect(r.statistics.observedPeakMarketCapCount).toBe(0);
    expect(r.outcomes.unknownOutcomeCount).toBe(0);
    expect(r.evidence.length).toBeGreaterThan(0);
  });
  it('one previous launch: identity, peak 60000, ttp 60, momentum count', async () => {
    const { store, currentTokenId } = await fxOnePrevious();
    const r = await buildDeveloperIntelligence(store, { tokenId: currentTokenId });
    expect(r.developerId).toBeTruthy();
    expect(r.developerName).toBe('Aurora');
    expect(r.launchCount).toBe(2);
    expect(r.previousLaunchCount).toBe(1);
    expect(r.previousLaunches).toHaveLength(1);
    const prev = r.previousLaunches[0];
    expect(prev.peakMarketCap).toBe(60_000);
    expect(prev.finalMarketCap).toBe(20_000);
    expect(prev.timeToPeakMinutes).toBe(60);
    expect(prev.lifespanMinutes).toBe(120);
    expect(prev.outcome).toBe('MOMENTUM_EXHAUSTION');
    expect(r.statistics.peakMarketCapAverage).toBe(60_000);
    expect(r.statistics.highestPeakMarketCap).toBe(60_000);
    expect(r.statistics.observedPeakMarketCapCount).toBe(1);
    expect(r.outcomes.momentumExhaustionCount).toBe(1);
    expect(r.outcomes.unknownOutcomeCount).toBe(1);
    expect(r.outcomes.successfulObservedLaunches).toBe(0);
  });
  it('multiple launches: honest counts, excludes current, mixed outcomes', async () => {
    const { store, currentTokenId } = await fxMulti();
    const r = await buildDeveloperIntelligence(store, { tokenId: currentTokenId });
    expect(r.launchCount).toBe(4);
    expect(r.previousLaunchCount).toBe(3);
    expect(r.statistics.observedPeakMarketCapCount).toBe(2);
    expect(r.statistics.peakMarketCapAverage).toBe(150_000);
    expect(r.statistics.peakMarketCapMedian).toBe(150_000);
    expect(r.statistics.highestPeakMarketCap).toBe(200_000);
    expect(r.statistics.timeToPeakAverage).toBe(67.5);
    const missing = r.previousLaunches.find((p) => p.tokenSymbol === 'CCC')!;
    expect(missing.peakMarketCap).toBeNull();
    expect(missing.finalMarketCap).toBeNull();
    expect(missing.timeToPeakMinutes).toBeNull();
    expect(missing.outcome).toBe('UNKNOWN');
    expect(r.outcomes.successfulObservedLaunches).toBe(1);
    expect(r.outcomes.failedLaunches).toBe(1);
    expect(r.outcomes.devSellingCount).toBe(1);
    expect(r.outcomes.unknownOutcomeCount).toBe(2);
  });
  it('missing market-cap data never becomes 0', async () => {
    const { store, currentTokenId } = await fxMulti();
    const r = await buildDeveloperIntelligence(store, { tokenId: currentTokenId });
    expect(r.statistics.peakMarketCapAverage).not.toBe(0);
    expect(r.previousLaunches.some((p) => p.peakMarketCap === 0)).toBe(false);
  });
  it('missing lifecycle outcome stays UNKNOWN with counts', async () => {
    const { store, currentTokenId } = await fxMulti();
    const r = await buildDeveloperIntelligence(store, { tokenId: currentTokenId });
    const unk = r.previousLaunches.filter((p) => p.outcome === 'UNKNOWN');
    expect(unk.length).toBe(1);
    expect(r.outcomes.unknownOutcomeCount).toBe(2);
    expect(r.outcomes.countsByOutcome.find((c) => c.outcome === 'UNKNOWN')?.count).toBe(2);
  });
  it('multiple historical outcomes aggregate correctly', async () => {
    const { store, devId } = await fxMulti();
    const r = await buildDeveloperIntelligence(store, { developerId: devId });
    expect(r.launchCount).toBe(4);
    expect(r.previousLaunchCount).toBe(4);
    const names = r.outcomes.countsByOutcome.map((c) => c.outcome).sort();
    expect(names).toEqual(['DEV_SELLING', 'HEALTHY', 'UNKNOWN']);
    expect(r.outcomes.countsByOutcome.find((c) => c.outcome === 'UNKNOWN')?.count).toBe(2);
  });
});
