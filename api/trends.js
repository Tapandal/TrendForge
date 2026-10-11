// Deploy path: /api/trends.js  (NEW in v7, optional)
// Google Trends search interest, via SerpAPI (https://serpapi.com — free plan
// has 100 searches/month). Set SERPAPI_KEY in Vercel → Environment Variables.
// Without the key the app simply skips this source.
//
// Returns monthly search interest for the last 5 years in the chosen country,
// which is the same kind of data Exploding Topics is built on.

export default async function handler(req, res) {
  const { product, geo } = req.query;
  const KEY = process.env.SERPAPI_KEY || '';
  if (!KEY) return res.json({ configured: false });
  if (!product || String(product).length > 80) return res.json({ configured: true, available: false, reason: 'bad_product' });
  try {
    const u = new URL('https://serpapi.com/search.json');
    u.search = new URLSearchParams({
      engine: 'google_trends', q: String(product), date: 'today 5-y',
      data_type: 'TIMESERIES', api_key: KEY, ...(geo ? { geo } : {}),
    }).toString();
    const r = await fetch(u);
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    const pts = d.interest_over_time?.timeline_data || [];
    // Weekly points → monthly averages
    const months = {};
    pts.forEach((p) => {
      const t = new Date(Number(p.timestamp) * 1000);
      const k = t.getUTCFullYear() + String(t.getUTCMonth() + 1).padStart(2, '0');
      const v = Number(p.values?.[0]?.extracted_value ?? 0);
      (months[k] = months[k] || []).push(v);
    });
    const keys = Object.keys(months).sort();
    // Drop the current, unfinished month
    const now = new Date();
    const cur = now.getUTCFullYear() + String(now.getUTCMonth() + 1).padStart(2, '0');
    const full = keys.filter((k) => k !== cur);
    if (full.length < 9) return res.json({ configured: true, available: false, reason: 'not_enough_data' });
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.json({
      configured: true, available: true, start: full[0],
      values: full.map((k) => months[k].reduce((a, b) => a + b, 0) / months[k].length),
    });
  } catch (e) {
    res.json({ configured: true, available: false, reason: e.message });
  }
}
