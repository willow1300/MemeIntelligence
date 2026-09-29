// Writes analysis-store-memory.ts to avoid bash backtick escaping issues.
import { writeFileSync } from 'node:fs';

const HEADER = `// Phase 2B — In-memory AnalysisStore (tests + offline demo).
//
// Extends MemoryStore (which already implements every IngestionStore method)
// and adds the analysis-specific read/write surface the analysis runner and
// REST API need. Mirrors the Supabase implementation's upsert semantics with
// inspectable maps so intelligence behavior is IDENTICAL in both modes
// (Phase 2B spec §13 — zero duplicated logic between modes).

import type {
  AnalysisStore,
  AnalysisRow,
  DeveloperLink,
  DeveloperRow,
  LaunchWithToken,
  MetaRow,
  NewAnalysis,
  SimilarityRow,
  TokenMetaRow,
} from './analysis-store.ts';
import type {
  HolderSnapshot,
  Launch,
  MarketSnapshot,
  Token,
  TokenMetadata,
  Transaction,
  Wallet,
} from '../types/index.ts';
import { MemoryStore } from './memory-store.ts';
`;
