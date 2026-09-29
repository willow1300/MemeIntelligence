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
