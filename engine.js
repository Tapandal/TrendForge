/* =====================================================================
   TrendForge v7 — Trend Engine
   ---------------------------------------------------------------------
   This file is the "brain". It contains no screen code, so it can be
   tested on its own (see the Accuracy Test panel in the app).

   Core idea (the big change from v6):
     v6 scored how BIG a product already was (total YouTube views).
     v7 scores how FAST interest is GROWING, whether that growth is
     SPEEDING UP, and whether it is STEADY rather than a one-off spike.

   Everything works on a list of monthly numbers (oldest → newest),
   e.g. monthly Wikipedia page views or monthly Google Trends interest.
   ===================================================================== */
(function (root) {
  'use strict';

  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const median = (a) => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  // Percentage change from b to a, capped so one tiny base can't explode the maths.
  const change = (a, b) => {
    if (b == null || a == null) return null;
    if (b <= 0) return a > 0 ? 3 : 0;
    return clamp(a / b - 1, -0.95, 5);
  };

  /* -------- 1. Clean the data --------
     Wikipedia (and other sources) sometimes show a single month that is
     10x the months either side — usually bots or a one-day news mention.
     A real trend lasts more than one month, so an isolated one-month
     spike is flattened to its neighbours' level. */
  function clean(series) {
    const v = series.map((x) => (Number.isFinite(+x) ? Math.max(+x, 0) : 0));
    for (let i = 1; i < v.length - 1; i++) {
      const nb = Math.max(v[i - 1], v[i + 1]);
      if (nb > 0 && v[i] > 3 * nb) v[i] = nb;
    }
    return v;
  }

  /* -------- 2. Measure the shape of the line -------- */
  function analyzeSeries(raw) {
    const v = clean(raw || []);
    const n = v.length;
    if (n < 9) return { ok: false, reason: 'not_enough_history', months: n };

    const last3 = avg(v.slice(n - 3));
    const prev3 = avg(v.slice(n - 6, n - 3));
    const prev3b = avg(v.slice(n - 9, n - 6));
    const yearAgo3 = n >= 15 ? avg(v.slice(n - 15, n - 12)) : null;
    const last12 = n >= 12 ? avg(v.slice(n - 12)) : null;
    const prev12 = n >= 24 ? avg(v.slice(n - 24, n - 12)) : null;

    const growth3m = change(last3, prev3);          // last 3 months vs the 3 before
    const prevGrowth3m = change(prev3, prev3b);
    const yoy = change(last3, yearAgo3);            // vs same 3 months last year (cancels seasons)
    const growth12m = change(last12, prev12);       // whole year vs the year before
    const acceleration = growth3m - prevGrowth3m;   // is growth speeding up? (shown, not scored)
    const g24 = n >= 27 ? change(last3, avg(v.slice(n - 27, n - 24))) : null; // vs two years ago

    // Consistency: in how many of the last 6 months was interest higher
    // than the same month a year earlier? (6/6 = steady climb)
    let upMonths = null, checked = 0;
    if (n >= 18) {
      upMonths = 0;
      for (let i = n - 6; i < n; i++) { checked++; if (v[i] > v[i - 12] * 1.05) upMonths++; }
    } else {
      upMonths = 0;
      for (let i = n - 6; i < n; i++) { checked++; if (v[i] > v[i - 1]) upMonths++; }
    }

    // Peak check: how far are we below the highest point of the last 2 years?
    const window = v.slice(Math.max(0, n - 24));
    const peak = Math.max(...window);
    const peakAgo = window.length - 1 - window.lastIndexOf(peak);
    const fromPeak = peak > 0 ? last3 / peak : 1;

    // Is the newest month itself a sudden jump (not yet confirmed)?
    const latestJump = v[n - 2] > 0 && v[n - 1] > 3 * v[n - 2] && v[n - 1] > 3 * median(v.slice(n - 12));

    return {
      ok: true, months: n, level: last3,
      growth3m, yoy, growth12m, g24, acceleration,
      upMonths, checked, fromPeak, peakAgo, latestJump,
    };
  }

  /* -------- 3. Turn the measurements into a 0–100 Trend Score --------
     The weights below were chosen by testing on 10 years of real data
     for 64 products (see the Accuracy Test panel). What we learned:
       - SUSTAINED growth (vs 1 year ago, vs 2 years ago, month after
         month) predicts future growth.
       - Short bursts and "acceleration" do NOT — they usually reverse.
     Points (before any penalty):
       Year-on-year growth ........ up to 30  (+100% or more = full)
       12-month trend ............. up to 25  (this year vs last year)
       2-year growth .............. up to 15  (+150% or more = full)
       Consistency ................ up to 20  (6 of 6 months beat last year)
       Recent momentum ............ up to 10  (last 3 months vs 3 before)
       Trade confirmation ......... up to 15  (import growth, if available)
     Parts with no data are left out and the rest is scaled to 100.
     Penalties: fading spike ×0.5, sudden hype burst ×0.6,
     clear decline capped at 25. */
  const logPts = (g, full, max) => (g == null ? null : clamp(Math.log2(1 + Math.max(g, -0.9)) / Math.log2(1 + full), 0, 1) * max);

  function scoreTrend(m, opts) {
    opts = opts || {};
    const parts = [];
    const add = (key, label, pts, max, note) => parts.push({ key, label, points: pts == null ? null : Math.round(pts), max, note });

    add('yoy', 'Year-on-year growth', logPts(m.yoy, 1, 30), 30, 'Last 3 months vs the same 3 months a year ago');
    add('t12', '12-month trend', logPts(m.growth12m, 1, 25), 25, 'Last 12 months vs the 12 months before');
    add('g24', '2-year growth', logPts(m.g24, 1.5, 15), 15, 'Last 3 months vs two years ago');
    add('con', 'Consistency', m.upMonths == null ? null : (m.upMonths / (m.checked || 6)) * 20, 20, 'Months (out of the last 6) that beat the same month last year');
    add('mom', 'Recent momentum', logPts(m.growth3m, 0.6, 10), 10, 'Last 3 months vs the 3 months before');
    const tg = opts.tradeGrowth;
    add('trade', 'Trade confirmation', tg == null ? null : logPts(tg / 100, 1, 15), 15, 'Import value growth, latest year (UN Comtrade)');

    const avail = parts.filter((p) => p.points != null);
    const maxAvail = avail.reduce((s, p) => s + p.max, 0) || 1;
    let total = (avail.reduce((s, p) => s + p.points, 0) / maxAvail) * 100;

    const flags = [];
    const spikeFading = m.peakAgo != null && m.peakAgo <= 12 && m.fromPeak < 0.55;
    const hype = m.growth3m != null && m.growth3m > 1 && (m.growth12m == null || m.growth12m < 0.3 || (m.upMonths != null && m.upMonths <= 3));
    const declining = m.yoy != null && m.yoy < -0.15 && (m.growth12m == null || m.growth12m < 0);
    if (spikeFading) { total *= 0.5; flags.push('Interest is well below a recent peak — this looks like a fad that is fading.'); }
    if (hype) { total *= 0.6; flags.push('A sudden burst in the last few months without a longer build-up. Bursts like this often reverse.'); }
    if (declining) { total = Math.min(total, 25); flags.push('Interest is lower than a year ago — this product is cooling down.'); }
    if (m.yoy == null) { total = Math.min(total, 60); flags.push('Less than 15 months of history — too new to call it a confirmed trend yet.'); }
    if (m.latestJump) flags.push('The newest month jumped suddenly. Wait one more month to confirm it is not a one-off.');

    total = Math.round(clamp(total, 0, 99));
    const stage = stageFor(total, m, spikeFading, declining);
    return { total, stage, parts, flags };
  }

  function stageFor(total, m, spikeFading, declining) {
    if (declining) return STAGES.declining;
    if (spikeFading || (m.growth3m != null && m.growth3m < -0.25 && (m.yoy || 0) > 0)) return STAGES.peaking;
    if (total >= 80) return STAGES.exploding;
    if (total >= 65) return STAGES.rising;
    if (total >= 45 && ((m.yoy != null ? m.yoy : m.growth3m) || 0) > 0) return STAGES.emerging;
    return STAGES.steady;
  }

  const STAGES = {
    exploding: { key: 'exploding', l: 'EXPLODING', positive: true, desc: 'Fast, steady, accelerating growth.' },
    rising: { key: 'rising', l: 'RISING', positive: true, desc: 'Clearly growing and holding up.' },
    emerging: { key: 'emerging', l: 'EMERGING', positive: false, desc: 'Early signs of growth — watch it.' },
    steady: { key: 'steady', l: 'STEADY', positive: false, desc: 'No strong movement either way.' },
    peaking: { key: 'peaking', l: 'PEAKING', positive: false, negative: true, desc: 'Was hot, now losing steam.' },
    declining: { key: 'declining', l: 'DECLINING', positive: false, negative: true, desc: 'Interest is shrinking.' },
  };

  /* -------- 4. Combine several sources into one answer --------
     Each source (Wikipedia, Google Trends, YouTube) is analysed on its
     own; the measurements are blended with weights. Confidence goes up
     when sources agree and when we have long history. */
  function combine(sources) {
    const usable = sources.filter((s) => s && s.metrics && s.metrics.ok);
    if (!usable.length) return null;
    const keys = ['growth3m', 'yoy', 'growth12m', 'g24', 'acceleration', 'fromPeak'];
    const out = { ok: true, months: Math.max(...usable.map((s) => s.metrics.months)) };
    keys.forEach((k) => {
      let w = 0, sum = 0;
      usable.forEach((s) => { const x = s.metrics[k]; if (x != null) { w += s.weight; sum += s.weight * x; } });
      out[k] = w ? sum / w : null;
    });
    // Consistency / peak / jump: take them from the source with the longest history.
    const longest = usable.slice().sort((a, b) => b.metrics.months - a.metrics.months)[0].metrics;
    out.upMonths = longest.upMonths; out.checked = longest.checked;
    out.peakAgo = longest.peakAgo; out.latestJump = usable.some((s) => s.metrics.latestJump);
    out.level = longest.level;

    const dirs = usable.map((s) => Math.sign(s.metrics.yoy == null ? s.metrics.growth3m || 0 : s.metrics.yoy));
    const agree = dirs.every((d) => d === dirs[0]);
    let confidence;
    if (usable.length >= 2 && agree && out.months >= 24) confidence = 'High';
    else if (out.months >= 24 && (usable.length === 1 || agree)) confidence = 'Medium';
    else confidence = 'Low';
    return { metrics: out, confidence, sourcesUsed: usable.map((s) => s.name), agree };
  }

  /* -------- Share-of-attention adjustment --------
     Total Wikipedia traffic has been falling since 2025 (people read AI
     answers instead). Without a fix, EVERY product would look like it is
     declining. We divide each product's views by total Wikipedia views,
     so we measure its SHARE of attention instead. */
  function normalize(values, start, totalsByMonth) {
    if (!totalsByMonth) return values.slice();
    return values.map((x, i) => {
      const t = totalsByMonth[addMonths(start, i).replace('-', '')];
      return t ? (x / t) * 1e9 : x;
    });
  }

  /* -------- 5. Accuracy test ("time machine") --------
     For each product and each past date, pretend it is that date:
     the engine only sees data up to then. We then look at what really
     happened in the following 12 months and check if it was right. */
  function backtest(seriesByName, opts) {
    opts = opts || {};
    const horizon = opts.horizon || 12, step = opts.step || 6, minHist = opts.minHistory || 24;
    const cases = [];
    Object.entries(seriesByName).forEach(([name, raw]) => {
      const v = clean(Array.isArray(raw) ? raw : raw.values);
      for (let i = minHist; i + horizon <= v.length; i += step) {
        const hist = v.slice(0, i);
        const m = analyzeSeries(hist);
        if (!m.ok) continue;
        const s = scoreTrend(m);
        const now = avg(hist.slice(-3));
        const future = avg(v.slice(i, i + horizon));
        const outcome = now > 0 ? future / now - 1 : 0;
        cases.push({
          name, at: raw.start ? addMonths(raw.start, i) : i,
          score: s.total, stage: s.stage.key, positive: s.stage.positive, negative: !!s.stage.negative,
          sizeScore: now, outcome,
          result: outcome > 0.2 ? 'grew' : outcome < -0.2 ? 'fell' : 'flat',
        });
      }
    });
    return { cases, summary: summarize(cases) };
  }

  function summarize(cases) {
    const pct = (a, f) => (a.length ? Math.round((a.filter(f).length / a.length) * 100) : null);
    const grew = (c) => c.result === 'grew';
    const pos = cases.filter((c) => c.positive);
    const neg = cases.filter((c) => c.negative);
    const bigWinners = cases.filter((c) => c.outcome > 0.5);

    // "Old way" comparison: v6 rewarded size. Take the biggest 25% by size.
    const bySize = cases.slice().sort((a, b) => b.sizeScore - a.sizeScore).slice(0, Math.max(1, Math.round(cases.length / 4)));
    const byScore = cases.slice().sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.round(cases.length / 4)));

    const buckets = [[0, 20], [20, 40], [40, 60], [60, 80], [80, 101]].map(([lo, hi]) => {
      const b = cases.filter((c) => c.score >= lo && c.score < hi);
      return { range: `${lo}–${Math.min(hi, 100)}`, n: b.length, medianOutcome: b.length ? Math.round(median(b.map((c) => c.outcome)) * 100) : null, grewPct: pct(b, grew) };
    });

    return {
      totalCases: cases.length,
      products: new Set(cases.map((c) => c.name)).size,
      baseRateGrew: pct(cases, grew),
      baseRateFell: pct(cases, (c) => c.result === 'fell'),
      strongCalls: cases.filter((c) => c.score >= 80).length,
      strongGrew: pct(cases.filter((c) => c.score >= 80), grew),
      strongFell: pct(cases.filter((c) => c.score >= 80), (c) => c.result === 'fell'),
      warningFell: pct(neg, (c) => c.result === 'fell'),
      positiveCalls: pos.length,
      hitRate: pct(pos, grew),
      falseAlarm: pct(pos, (c) => c.result === 'fell'),
      warningCalls: neg.length,
      warningCorrect: pct(neg, (c) => c.result !== 'grew'),
      bigWinners: bigWinners.length,
      caughtEarly: pct(bigWinners, (c) => c.positive || c.stage === 'emerging'),
      top25NewGrew: pct(byScore, grew),
      top25OldGrew: pct(bySize, grew),
      buckets,
    };
  }

  function addMonths(yyyymm, k) {
    const y = +String(yyyymm).slice(0, 4), m = +String(yyyymm).slice(4, 6) - 1 + k;
    const d = new Date(y, m, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  /* -------- 6. HS (customs) code matching — whole words only --------
     v6 matched letters inside words ("chair" → hair → shampoo).
     v7 matches whole words/phrases, checks longer phrases first, and
     says "no match" rather than guessing wrong. */
  const HS_TABLE = [
    ['solar panel|solar panels|photovoltaic|pv module|solar module', '8541'],
    ['solar water heater|solar water heaters', '8419'],
    ['wind turbine|wind turbines|wind turbine blades', '8412'],
    ['ev battery|ev batteries|lithium battery|lithium batteries|lithium ion battery|power bank|batteries|battery', '8507'],
    ['air fryer|air fryers|toaster|kettle|electric kettle|espresso machine|espresso machines|home espresso machines|coffee machine|coffee maker|hair dryer|hair straightener', '8516'],
    ['shampoo|conditioner|hair oil|hair serum', '3305'],
    ['skincare|skin care|cosmetics|face cream|moisturizer|serum|sunscreen|aloe vera skincare|lipstick', '3304'],
    ['perfume|fragrance', '3303'],
    ['steel pipe|steel pipes|steel tube', '7304'],
    ['copper wire|copper wires', '7408'],
    ['copper', '7403'],
    ['linen|linen fabric', '5309'],
    ['saree|sarees', '5208'],
    ['wheat', '1001'],
    ['rice|basmati', '1006'],
    ['coffee|coffee beans|mushroom coffee', '0901'],
    ['tea|green tea|matcha', '0902'],
    ['spices|spice|turmeric|cardamom|pepper', '0910'],
    ['cotton', '5201'],
    ['led|led lights|led lighting|led bulb|led bulbs', '8539'],
    ['natural rubber|rubber', '4001'],
    ['plastic resin|polyethylene', '3901'],
    ['aluminium|aluminum', '7601'],
    ['cement', '2523'],
    ['pharmaceuticals|medicine|medicines|tablets', '3004'],
    ['drone|drones|uav', '8806'],
    ['smartwatch|smartwatches|smartphone|smartphones|mobile phone|earbuds|wireless earbuds|headphones', '8517'],
    ['smart ring|smart rings|fitness tracker|fitness trackers', '8517'],
    ['3d printer|3d printers', '8485'],
    ['air purifier|air purifiers|water purifier|water purifiers', '8421'],
    ['electric scooter|electric scooters|e scooter|electric bike|electric bicycle|e bike|ebike', '8711'],
    ['honey|organic honey', '0409'],
    ['hydroponic kit|hydroponic kits|hydroponics', '8424'],
    ['baby formula|infant formula', '1901'],
    ['pet food|pet supplement|pet supplements|dog food|cat food', '2309'],
    ['toothbrush|toothbrushes|bamboo toothbrush|bamboo toothbrushes', '9603'],
    ['electric toothbrush|electric toothbrushes', '8509'],
    ['sneakers|sneaker|shoes|footwear|running shoes|crocs|clogs', '6404'],
    ['backpack|backpacks|handbag|handbags|luggage|suitcase', '4202'],
    ['sunglasses', '9004'],
    ['yoga mat|yoga mats|dumbbell|dumbbells|kettlebell|kettlebells|pickleball paddle|pickleball paddles|fitness equipment', '9506'],
    ['water bottle|water bottles|reusable water bottles|steel bottle|tumbler|tumblers', '9617'],
    ['leather', '4107'],
    ['wool', '5101'],
    ['silk', '5007'],
    ['jute', '5310'],
    ['paper|cardboard', '4802'],
    ['glass|glassware|wine glass', '7013'],
    ['timber|lumber|wood', '4407'],
    ['sugar', '1701'],
    ['fertilizer|fertilizers|fertiliser', '3105'],
    ['semiconductor|semiconductors|microchip|microchips', '8542'],
    ['furniture|office chair|office chairs|chair|chairs|sofa|bean bag', '9401'],
    ['protein powder|whey protein|protein bar|protein bars|supplements|dietary supplements', '2106'],
    ['plush toy|plush toys|soft toy|soft toys|stuffed toy|toys|squishmallows|labubu', '9503'],
    ['vape|vapes|e cigarette|e cigarettes|electronic cigarette', '8543'],
    ['oat milk|plant milk|almond milk', '2202'],
    ['heat pump|heat pumps|air conditioner|air conditioners', '8418'],
    ['induction cooktop|induction stove|induction cooktops', '8516'],
    ['potato chips|chips|snacks|namkeen', '2005'],
    ['kombucha|energy drink|energy drinks|soft drinks', '2202'],
    ['ghee|butter', '0405'],
    ['quinoa|millet|millets', '1008'],
    ['chia seeds|chia seed|flax seeds', '1207'],
  ];
  const HS_INDEX = (() => {
    const rows = [];
    HS_TABLE.forEach(([alts, code]) => alts.split('|').forEach((p) => rows.push({ p, code, words: p.split(' ').length })));
    return rows.sort((a, b) => b.words - a.words || b.p.length - a.p.length);
  })();
  function matchHS(product) {
    const text = ' ' + String(product || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
    for (const r of HS_INDEX) if (text.includes(' ' + r.p + ' ')) return { code: r.code, matched: true, phrase: r.p };
    return { code: null, matched: false };
  }

  /* -------- 7. Margin — now uses YOUR cost, not just the price -------- */
  function margin(price, unitCost, overheadPct) {
    price = parseFloat(price); unitCost = parseFloat(unitCost);
    if (!(price > 0) || !(unitCost >= 0) || Number.isNaN(unitCost)) return null;
    const overhead = price * (overheadPct || 0) / 100;
    const profit = price - unitCost - overhead;
    return { marginPct: Math.round((profit / price) * 1000) / 10, profit: Math.round(profit * 100) / 100, overhead: Math.round(overhead * 100) / 100 };
  }

  const api = { normalize, clean, analyzeSeries, scoreTrend, combine, backtest, summarize, matchHS, margin, STAGES, avg, median, addMonths };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TFEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
