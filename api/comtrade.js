// Deploy path: /api/comtrade.js
// Optional: COMTRADE_API_KEY in Vercel → Project Settings → Environment Variables.
// v7: works WITHOUT a key too (falls back to UN Comtrade's free public preview).
//
// v7 changes:
//  - No more hard-coded 2024 vs 2023: asks for the last 4 years and uses
//    the newest two years that actually have data.
//  - Asks only for "imports from the whole world" totals, so we don't
//    accidentally pick a single partner-country row.
//  - Note: UN Comtrade's code for India is 699 (not 356) — v6 used 356,
//    so India never got trade data. Fixed in the app's country list.
//  - Returns the yearly series so the app can draw a real chart and see
//    whether growth is speeding up or slowing down.

export default async function handler(req, res) {
  const { hsCode, countryCode } = req.query;
  const CT_KEY = process.env.COMTRADE_API_KEY || '';
  if (!hsCode || !/^\d{4,6}$/.test(String(hsCode))) return res.json({ configured: true, available: false, reason: 'no_hs_code' });
  if (!countryCode || !/^\d{1,3}$/.test(String(countryCode))) return res.json({ configured: true, available: false, reason: 'no_country' });

  const y = new Date().getFullYear();
  const base = `reporterCode=${countryCode}&flowCode=M&cmdCode=${hsCode}&partnerCode=0&partner2Code=0&customsCode=C00&motCode=0`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    let d;
    if (CT_KEY) {
      // With a key: one request for the last 4 years.
      const r = await fetch(`https://comtradeapi.un.org/data/v1/get/C/A/HS?${base}&period=${[y - 1, y - 2, y - 3, y - 4].join(',')}`, { headers: { 'Ocp-Apim-Subscription-Key': CT_KEY } });
      d = await r.json();
    } else {
      // Without a key: the free preview allows ONE year per request and
      // limits how fast we ask, so we ask for 3 years one by one.
      d = { data: [] };
      for (const yr of [y - 1, y - 2, y - 3]) {
        const r = await fetch(`https://comtradeapi.un.org/public/v1/preview/C/A/HS?${base}&period=${yr}`);
        if (r.status === 429) { await sleep(2500); continue; }
        const j = await r.json();
        d.data.push(...(j.data || []));
        await sleep(1200);
      }
    }
    const rows = (d.data || []).filter((x) => x.partnerCode === 0 || x.partnerCode == null);
    const byYear = {};
    rows.forEach((x) => {
      const v = Number(x.primaryValue) || 0;
      byYear[x.period] = Math.max(byYear[x.period] || 0, v); // keep the total row
    });
    const series = Object.keys(byYear).map(Number).sort().map((yr) => ({ year: yr, value: byYear[yr] })).filter((s) => s.value > 0);
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    if (series.length >= 2) {
      const a = series[series.length - 1], b = series[series.length - 2];
      const growth = Math.round((a.value / b.value - 1) * 100);
      const prevGrowth = series.length >= 3 ? Math.round((b.value / series[series.length - 3].value - 1) * 100) : null;
      return res.json({ configured: true, available: true, keyless: !CT_KEY, growth, prevGrowth, latestYear: a.year, latestValue: a.value, series });
    }
    res.json({ configured: true, available: false, reason: 'no_data_for_this_country_and_code', series });
  } catch (e) {
    res.json({ configured: true, available: false, reason: e.message });
  }
}
