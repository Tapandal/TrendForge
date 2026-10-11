// Deploy path: /api/youtube.js — Vercel runs this as a serverless function.
// Needs: YT_API_KEY in Vercel → Project Settings → Environment Variables.
//
// v7: instead of "total views of the top 10 videos ever" (which only
// measured how famous a product already is), we now measure CREATOR
// MOMENTUM: how many new videos were uploaded in the last 30 days compared
// with the same 30 days one year ago, and how many views those new videos
// get per day. Cost: about 201 quota units per call (free quota is 10,000
// a day ≈ 49 analyses/day). Results are cached for 12 hours to save quota.

const DAY = 86400000;

async function searchWindow(q, after, before, region, key) {
  const u = new URL('https://www.googleapis.com/youtube/v3/search');
  u.search = new URLSearchParams({
    part: 'snippet', q, type: 'video', order: 'date', maxResults: '50',
    publishedAfter: new Date(after).toISOString(), publishedBefore: new Date(before).toISOString(),
    key, ...(region ? { regionCode: region } : {}),
  }).toString();
  const r = await fetch(u);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  const items = (d.items || []).filter((i) => i.id && i.id.videoId);
  // If we hit the 50 cap, estimate the 30-day count from how many days those 50 covered.
  let count = items.length;
  if (items.length >= 50) {
    const times = items.map((i) => Date.parse(i.snippet.publishedAt)).sort((a, b) => a - b);
    const spanDays = Math.max((times[times.length - 1] - times[0]) / DAY, 0.5);
    count = Math.round((50 / spanDays) * 30);
  }
  return { count, capped: items.length >= 50, items };
}

export default async function handler(req, res) {
  const { product, region } = req.query;
  const YT_KEY = process.env.YT_API_KEY || '';
  if (!YT_KEY) return res.json({ configured: false });
  if (!product || String(product).length > 80) return res.json({ configured: true, available: false, reason: 'bad_product' });
  try {
    const q = String(product);
    const now = Date.now();
    const [recent, yearAgo] = await Promise.all([
      searchWindow(q, now - 30 * DAY, now, region, YT_KEY),
      searchWindow(q, now - 395 * DAY, now - 365 * DAY, region, YT_KEY),
    ]);

    // How much attention do the NEW videos get? (views per day since upload)
    let avgViewsPerDay = null, recentViews = 0;
    const ids = recent.items.slice(0, 50).map((i) => i.id.videoId).join(',');
    if (ids) {
      const r2 = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${ids}&key=${YT_KEY}`);
      const d2 = await r2.json();
      const rates = (d2.items || []).map((v) => {
        const views = parseInt(v.statistics?.viewCount || 0, 10);
        recentViews += views;
        const ageDays = Math.max((now - Date.parse(v.snippet.publishedAt)) / DAY, 1);
        return views / ageDays;
      }).sort((a, b) => a - b);
      if (rates.length) avgViewsPerDay = Math.round(rates[Math.floor(rates.length / 2)]); // median: one viral video can't skew it
    }

    const uploadGrowth = yearAgo.count > 0 ? Math.round((recent.count / yearAgo.count - 1) * 100) : (recent.count > 0 ? 300 : 0);
    res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate=86400');
    res.json({
      configured: true, available: true,
      uploadsLast30d: recent.count, uploadsSame30dLastYear: yearAgo.count,
      uploadGrowth, medianViewsPerDayNewVideos: avgViewsPerDay, recentViews,
      estimated: recent.capped || yearAgo.capped,
    });
  } catch (e) {
    res.json({ configured: true, available: false, reason: e.message });
  }
}
