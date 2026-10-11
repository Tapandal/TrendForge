# TrendForge Predict — v7 (momentum engine)

TrendForge spots products whose demand is **starting to rise**, using live data, and tells you how sure it is.

---

## What changed from v6 (plain English)

| | v6 | v7 |
|---|---|---|
| **What the score measured** | How *big* a product already was (total YouTube views of the top 10 videos ever) | How *fast* interest is *growing*, and whether that growth is *steady* |
| **"Last 12 months" chart** | Drawn by a formula (same curve for every product) | Real monthly data, up to 10+ years |
| **Data that works with zero setup** | None (everything "simulated") | Wikipedia interest history — free, no keys, no server |
| **Trade data** | Compared 2024 vs 2023 (hard-coded), and India never worked (wrong country code) | Newest years automatically, India fixed, works without a key |
| **Product → customs code** | Matched letters inside words ("office chair" → shampoo) | Whole words only; says "not matched" instead of guessing; AI fills gaps |
| **Margin** | Same % whatever price you typed | Uses your price, your cost, and your other costs |
| **AI** | Guessed from memory; several sections never received data | Gets the real measured numbers; asked for every field; usage limit added |
| **Accuracy** | Unknown | Built-in accuracy test against 10 years of history |

### The new Trend Score (0–100)
Built from measured data only (AI never changes it):

| Ingredient | Max points | Meaning |
|---|---|---|
| Year-on-year growth | 30 | Last 3 months vs the same 3 months last year |
| 12-month trend | 25 | This year vs last year |
| 2-year growth | 15 | Now vs two years ago |
| Consistency | 20 | How many of the last 6 months beat last year |
| Recent momentum | 10 | Last 3 months vs the 3 before |
| Trade confirmation | 15 | Import growth (when trade data is available) |

Penalties: fading fads are halved, sudden one-off bursts are cut, shrinking products are capped at 25, and products with less than 15 months of history can't score above 60.

**Labels:** EXPLODING (80+), RISING (65–79), EMERGING (45–64 and growing), STEADY, PEAKING (was hot, now fading), DECLINING.

**Confidence:** High = two or more sources agree with 2+ years of history. Medium = one source with 2+ years. Low = thin or conflicting data.

---

## How well does it work? (tested on real data, October 2026)

We took 64 well-known products (oat milk, fidget spinners, Ozempic, pickleball…), went back to 988 past moments, let the engine see only the data up to each moment, and checked the next 12 months.

- A random product grew 20%+ in the next year **21%** of the time.
- When v7 scored a product **80+**, it grew **53%** of the time — **about 2.5× better than random**.
- On the half of products the settings were *not* tuned on, it still scored **50% vs 20%**.
- Ranking by the old v6 logic ("bigger = better"), the top picks grew only **17%** of the time — *worse* than random. v7's top picks: **28%**.
- Hot products are volatile: about **3 in 10** strong calls fell back instead. Treat EXPLODING as "high potential, check the details", not a guarantee.
- Spotted early about **1 in 3** of the products that went on to grow 50%+.
- Weak spots: pandemic-style spikes (hand sanitizer 2020) and the PEAKING/DECLINING warnings, which are only slightly better than chance.

Good early calls it made: Ozempic/semaglutide from 2018, Beyond Meat and Impossible Foods in 2018 (before their 2019 boom), oat milk in 2019 (+1,085% the next year).

**Re-run this yourself any time:** open the app → "🎯 How accurate is it?" → *Run accuracy test*. Use the ⏳ *Time machine* to rewind any single product.

---

## How to judge it yourself (no coding needed)

1. **Run the accuracy test** after every change. The number to watch: *"When TrendForge scored 80+, it grew X% vs Y% random"*. Above 2× = useful; 2.5× or more = good.
2. **Time machine:** pick products you know (something that boomed, something that flopped), rewind to a date before it happened, and see if TrendForge would have warned you.
3. **Watch real products forward:** note today's score for 10 products, then check again in 3 and 6 months. The Testing summary panel keeps your history in this browser.
4. **Check the confidence label.** Low confidence = treat the score as a hint only.
5. **Check which Wikipedia article was used** (shown under the chart). If it picked the wrong one, set it under "Advanced".

---

## Setup (Vercel)

Files: `TrendForge.html` (the app), `engine.js` (the scoring brain — must sit next to the app), `index.html` (redirect), `api/` (server functions).

Works immediately with **no keys** for Wikipedia. Trade data needs the site to run on Vercel (no key required). Add these in Vercel → Project → Settings → Environment Variables to switch on more sources, then redeploy:

| Key | What it adds | Where to get it |
|---|---|---|
| `SERPAPI_KEY` | Google Trends search history (strongest extra signal) | serpapi.com (free plan: 100 searches/month) |
| `YT_API_KEY` | YouTube creator momentum and crowding | Google Cloud Console → YouTube Data API v3 (free quota) |
| `ANTHROPIC_API_KEY` | AI write-up (verdict text, materials, exporters, companies) | console.anthropic.com |
| `COMTRADE_API_KEY` | Faster, more complete trade data (optional) | comtradeplus.un.org |
| `AI_HOURLY_LIMIT` | Max AI calls per visitor per hour (default 20) | — |
| `ANTHROPIC_MODEL` | Which Claude model to use (default `claude-sonnet-4-6`) | — |

The "⚙ Setup & data sources" panel shows a green dot for each source that is working.

---

## Known limits

- Wikipedia interest is **global**, not per country. Google Trends (with `SERPAPI_KEY`) is per country.
- Wikipedia visits are drifting down overall as people use AI search; the engine adjusts for total Wikipedia traffic, but Google Trends is the cleaner signal.
- Product names need a matching Wikipedia article. Very new or niche products may have none.
- AI sections are estimates from general knowledge and can be outdated. Not financial advice.
