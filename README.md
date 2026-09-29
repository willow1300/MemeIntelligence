# Meme Intelligence Engine (MIE)

A research and intelligence platform for analyzing newly launched meme tokens and their surrounding ecosystem.

**MIE is NOT a trading bot.** It does not execute trades, sign transactions, or provide financial advice. All conclusions are presented as analysis with evidence and confidence.

## What MIE Answers

1. What is this token?
2. Is there an older token using the same/similar ticker, name, image, or narrative?
3. Which similar token came first?
4. How did the earlier token perform?
5. Who launched this token?
6. How old is the deployer wallet?
7. What other tokens has this developer launched?
8. How did those launches perform?
9. Did previous launches fail due to momentum exhaustion, dev selling, liquidity events, or other behavior?
10. What meta/narrative does this token belong to?
11. Have similar metas historically performed well?
12. What evidence supports the system's assessment?
13. If the user previously traded this token, what happened to their position?
14. Can the system distinguish an early exit from a later severe failure?
15. What should the user investigate next?

## Architecture

```
DATABASE + MOCK DATA
        ↓
 INGESTION ENGINE
        ↓
 WALLET / DEVELOPER / MARKET ENGINES
        ↓
 SIMILARITY / META / LIFECYCLE ENGINES
        ↓
   EVIDENCE SYSTEM
        ↓
    REST API (Supabase)
        ↓
  DASHBOARD        EXTENSION
```

### Stack
- **Frontend:** React + TypeScript + Tailwind CSS + Vite
- **Database:** PostgreSQL (Supabase)
- **Intelligence:** Modular TypeScript engines (wallet, developer, similarity, meta, lifecycle, scoring, trade outcome)
- **Extension:** Chrome Manifest V3

### Key Principles
1. Evidence before conclusions
2. Raw observations and analytical conclusions stored separately
3. Never hard-code one blockchain provider
4. Never assume wallet ownership without evidence
5. "First observed" ≠ wallet creation time
6. Every score is explainable
7. No automatic trading, wallet signing, or financial predictions

## Project Structure

```
src/
├── components/      # Shared UI components
├── intelligence/    # Modular intelligence engines
│   ├── wallet.ts         # Wallet profiling
│   ├── developer.ts      # Developer aggregation
│   ├── similarity.ts     # Token similarity detection
│   ├── meta.ts           # Meta classification + performance
│   ├── lifecycle.ts      # Lifecycle reconstruction
│   ├── scoring.ts        # Explainable research signal
│   └── tradeOutcome.ts   # User trade outcome analysis
├── lib/             # Data-access layer + utilities
│   ├── supabase.ts       # Supabase client
│   ├── data-access.ts    # Raw observation fetchers
│   └── format.ts         # Formatting utilities
├── pages/           # Dashboard pages
│   ├── Overview.tsx
│   ├── LiveTokens.tsx
│   ├── TokenIntelligence.tsx
│   ├── Developers.tsx
│   ├── Wallets.tsx
│   ├── Metas.tsx
│   ├── Similarity.tsx
│   ├── History.tsx
│   └── Settings.tsx
├── types/           # Shared domain types
└── App.tsx          # Main app with navigation

extension/           # Chrome extension
├── manifest.json
├── background.js
├── content.js
├── popup.html
└── popup.js

supabase/migrations/ # Database schema + seed data
```

## Running the Dashboard

The dev server runs automatically. The app connects to the pre-configured Supabase database containing mock data.

To build for production:
```bash
npm run build
```

## Loading the Chrome Extension

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension/` folder
5. Click the MIE icon in your toolbar
6. Enter a token address (try: `LOUIEheroXXXXXXXXXXXXXXXXXXXXXXXXXXXXX001`)

The extension queries the Supabase backend directly and displays a lightweight intelligence overlay.

## Mock Data

The database is seeded with deterministic synthetic data covering 10 scenarios:
- Strong launch (HEALTHY lifecycle)
- Momentum exhaustion
- Low-volume failure
- Liquidity event
- Developer-associated selling
- Same ticker appearing multiple times ($LOUIE, $PEPE, $DOGE, $QUACK, $GROK)
- Same image appearing multiple times
- Same narrative appearing multiple times
- Old developer wallet (Aurora Labs, ~2 years observed)
- Newly observed wallet (Fresh Mint, seconds before launch)

Dataset: 48 tokens, 18 wallets, 6 developers, 48 launches, 184 transactions, 136 market snapshots, 178 token similarities, 48 lifecycles, 192 analyses, 7 user trades.

## Token Addresses for Testing

| Token | Address | Scenario |
|-------|---------|----------|
| $LOUIE (hero) | `LOUIEheroXXXXXXXXXXXXXXXXXXXXXXXXXXXXX001` | New wallet, similar to older $LOUIE |
| $LOUIE (Aurora) | `LOUIEauroraXXXXXXXXXXXXXXXXXXXXXXXXXXX002` | Original, old wallet, momentum exhaustion |
| $PEPE (Prime) | `PEPEprimeXXXXXXXXXXXXXXXXXXXXXXXXXXXXX005` | Strong performer, old dev |
| $MOONK | `MOONKdrainXXXXXXXXXXXXXXXXXXXXXXXXXXXX011` | Liquidity event |
| $AURORA | `AURORAcoinXXXXXXXXXXXXXXXXXXXXXXXXXXXX022` | User early exit scenario |

## V2 Roadmap (Not Required for V1)

- Embeddings-based similarity
- Image similarity models
- Semantic narrative analysis
- Graph-based wallet clustering
- Advanced meta discovery
- Anomaly detection
- Time-series models
- ML lifecycle classification
- Real-time streaming
- Additional blockchain providers
