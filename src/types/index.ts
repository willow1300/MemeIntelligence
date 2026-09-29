// Shared domain types for the Meme Intelligence Engine.
// These mirror the database schema and are the contract between
// the data-access layer, intelligence engines, and UI.

export type WalletType = 'UNKNOWN' | 'PERSONAL' | 'PROGRAM' | 'EXCHANGE' | 'TREASURY' | 'CONTRACT';
export type RelationshipType = 'PRIMARY' | 'DEPLOYER' | 'FUNDER' | 'ASSOCIATED' | 'UNKNOWN';
export type TokenStatus = 'ACTIVE' | 'DECLINING' | 'DEAD' | 'UNKNOWN';
export type EventType =
  | 'TRANSFER' | 'BUY' | 'SELL' | 'LIQUIDITY_ADD' | 'LIQUIDITY_REMOVE'
  | 'DEPLOY' | 'MINT' | 'BURN' | 'OTHER';
export type FailureType =
  | 'UNKNOWN' | 'FAILED_LAUNCH' | 'MOMENTUM_EXHAUSTION' | 'META_EXHAUSTION'
  | 'DEV_SELLING' | 'LIQUIDITY_EVENT' | 'ASSOCIATED_WALLET_DISTRIBUTION'
  | 'OTHER' | 'HEALTHY';
export type SimilarityRelationship = 'SIMILAR' | 'POSSIBLE_DERIVATIVE' | 'SAME_META' | 'POSSIBLE_COPY';
export type AnalysisType =
  | 'META_CLASSIFICATION' | 'SIMILARITY' | 'DEVELOPER_PROFILE' | 'WALLET_PROFILE'
  | 'HISTORICAL_COMPARISON' | 'LIFECYCLE' | 'OVERALL';
export type TradeSide = 'BUY' | 'SELL';

export interface Chain {
  id: string;
  name: string;
  chain_id: string;
  native_symbol: string;
  created_at: string;
}

export interface Platform {
  id: string;
  chain_id: string;
  name: string;
  slug: string;
  url: string | null;
  created_at: string;
}

export interface Wallet {
  id: string;
  chain_id: string;
  address: string;
  first_seen_at: string | null;
  last_seen_at: string | null;
  transaction_count: number;
  wallet_type: WalletType;
  created_at: string;
  updated_at: string;
  /** Phase 2A: original provider payload preserved verbatim. */
  raw_data?: Record<string, unknown>;
}

export interface Developer {
  id: string;
  name: string;
  primary_wallet_id: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  launch_count: number;
  created_at: string;
  updated_at: string;
}

export interface DeveloperWallet {
  id: string;
  developer_id: string;
  wallet_id: string;
  relationship_type: RelationshipType;
  confidence: number;
  evidence: string[];
  created_at: string;
}

export interface Token {
  id: string;
  chain_id: string;
  platform_id: string | null;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  creator_wallet_id: string | null;
  created_at: string | null;
  first_seen_at: string | null;
  image_url: string | null;
  website_url: string | null;
  status: TokenStatus;
  created_at_db: string;
  updated_at: string;
  /** Phase 2A: original provider payload preserved verbatim. */
  raw_data?: Record<string, unknown>;
}

export interface TokenMetadata {
  id: string;
  token_id: string;
  description: string | null;
  image_url: string | null;
  website_url: string | null;
  twitter_url: string | null;
  telegram_url: string | null;
  discord_url: string | null;
  metadata_uri: string | null;
  raw_metadata: Record<string, unknown>;
  fetched_at: string;
}

export interface Launch {
  id: string;
  token_id: string;
  developer_id: string | null;
  platform_id: string | null;
  launch_time: string;
  initial_liquidity: number;
  initial_market_cap: number;
  launch_transaction: string | null;
  status: string;
  created_at: string;
  /** Phase 2A: original provider launch payload preserved verbatim. */
  raw_data?: Record<string, unknown>;
}

export interface Transaction {
  id: string;
  chain_id: string;
  tx_hash: string;
  block_number: number | null;
  timestamp: string;
  wallet_id: string | null;
  token_id: string | null;
  event_type: EventType;
  token_amount: number;
  native_amount: number;
  usd_value: number;
  direction: 'IN' | 'OUT' | null;
  raw_data: Record<string, unknown>;
  created_at: string;
}

export interface MarketSnapshot {
  id: string;
  token_id: string;
  timestamp: string;
  price: number;
  market_cap: number;
  volume: number;
  liquidity: number;
  buys: number;
  sells: number;
  transaction_count: number;
  holder_count: number;
  /** Phase 2A: original provider payload preserved verbatim. */
  raw_data?: Record<string, unknown>;
}

export interface HolderSnapshot {
  id: string;
  token_id: string;
  timestamp: string;
  holder_count: number;
  top_10_percentage: number;
  top_20_percentage: number;
  developer_percentage: number;
}

export interface Meta {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  type: string;
  description: string | null;
  created_at: string;
}

export interface TokenMeta {
  id: string;
  token_id: string;
  meta_id: string;
  confidence: number;
  source: string;
  created_at: string;
}

export interface TokenSimilarity {
  id: string;
  token_a_id: string;
  token_b_id: string;
  name_score: number;
  symbol_score: number;
  image_score: number;
  narrative_score: number;
  metadata_score: number;
  time_difference_seconds: number;
  overall_score: number;
  relationship_type: SimilarityRelationship;
  confidence: number;
  created_at: string;
}

export interface TokenLifecycle {
  id: string;
  token_id: string;
  launch_time: string | null;
  peak_time: string | null;
  peak_market_cap: number;
  death_time: string | null;
  failure_type: FailureType;
  confidence: number;
  evidence: string[];
  created_at: string;
  updated_at: string;
}

export interface Analysis {
  id: string;
  token_id: string;
  analysis_type: AnalysisType;
  version: number;
  score: number;
  confidence: number;
  result: Record<string, unknown>;
  evidence: string[];
  created_at: string;
  expires_at: string | null;
}

export interface User {
  id: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserTrade {
  id: string;
  user_id: string;
  token_id: string;
  wallet_id: string | null;
  side: TradeSide;
  timestamp: string;
  token_amount: number;
  price: number;
  market_cap: number;
  usd_value: number;
  tx_hash: string | null;
  created_at: string;
}

// ---- Composite / derived types (analytical conclusions) ----

export interface WalletProfile {
  wallet: Wallet;
  firstObservedAge: string;
  firstObservedAbsolute: string | null;
  transactionCount: number;
  launchCount: number;
  associatedTokenCount: number;
  relationships: Array<{
    developerName: string;
    relationshipType: RelationshipType;
    confidence: number;
    evidence: string[];
  }>;
  activityBeforeLaunch: number;
  activityAfterLaunch: number;
  isFreshWallet: boolean;
}

export interface DeveloperStats {
  developer: Developer;
  launchCount: number;
  highestPeakMarketCap: number;
  medianPeakMarketCap: number;
  averagePeakMarketCap: number;
  averageTimeToPeakMinutes: number;
  medianTimeToPeakMinutes: number;
  averageLifespanMinutes: number;
  successfulLaunches: number;
  failedLaunches: number;
  unknownOutcomes: number;
  outcomeBreakdown: Array<{ failureType: FailureType; count: number }>;
  launches: DeveloperLaunch[];
}

export interface DeveloperLaunch {
  tokenId: string;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenImageUrl: string | null;
  launchTime: string;
  peakMarketCap: number;
  timeToPeakMinutes: number;
  lifespanMinutes: number | null;
  failureType: FailureType;
  evidence: string[];
}

export interface SimilarToken {
  similarity: TokenSimilarity;
  token: Token;
  lifecycle: TokenLifecycle | null;
  metas: Meta[];
  peakMarketCap: number;
  cameFirst: boolean;
  timeDifferenceLabel: string;
}

export interface MetaPerformance {
  meta: Meta;
  launchCount: number;
  averagePeakMarketCap: number;
  medianPeakMarketCap: number;
  highestPeakMarketCap: number;
  medianTimeToPeakMinutes: number;
  medianLifespanMinutes: number;
  successRate: number;
}

export interface LifecycleAnalysis {
  lifecycle: TokenLifecycle;
  timeToPeakMinutes: number | null;
  drawdownFromPeak: number;
  snapshots: MarketSnapshot[];
}

export interface ResearchSignal {
  components: Array<{
    label: string;
    value: string;
    score: number;
    confidence: number;
    evidence: string[];
  }>;
  overall: string;
  overallScore: number;
}

export type TradeOutcome =
  | 'EARLY_EXIT'
  | 'EXIT_BEFORE_SEVERE_FAILURE'
  | 'GOOD_EXIT'
  | 'STILL_HOLDING'
  | 'UNKNOWN';

export interface TradeOutcomeResult {
  token: Token;
  entryTimestamp: string;
  entryMarketCap: number;
  exitTimestamp: string | null;
  exitMarketCap: number | null;
  peakAfterExit: number | null;
  lowestAfterExit: number | null;
  outcome: TradeOutcome;
  evidence: string[];
}

// ---- Provider interfaces (abstraction for V2 replacement) ----

export interface BlockchainProvider {
  getToken(address: string): Promise<Token | null>;
  getWallet(address: string): Promise<Wallet | null>;
  getTransactions(address: string): Promise<Transaction[]>;
  getTokenTransactions(tokenAddress: string): Promise<Transaction[]>;
  getTokenHolders(tokenAddress: string): Promise<HolderSnapshot[]>;
  getTokenMetadata(tokenAddress: string): Promise<TokenMetadata | null>;
}

export interface MarketDataProvider {
  getTokenMarketData(address: string): Promise<MarketSnapshot | null>;
  getHistoricalMarketData(address: string): Promise<MarketSnapshot[]>;
  getLiquidity(address: string): Promise<number>;
  getVolume(address: string): Promise<number>;
}

export interface LaunchProvider {
  getRecentLaunches(): Promise<Launch[]>;
  getLaunch(tokenAddress: string): Promise<Launch | null>;
  getPlatformInfo(platformSlug: string): Promise<Platform | null>;
}
