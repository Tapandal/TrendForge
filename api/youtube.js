// Deploy path: /api/youtube.js — Vercel auto-detects this as a serverless function
// Set YT_API_KEY in Vercel Project Settings → Environment Variables

export default async function handler(req, res) {
  const { product, location } = req.query;
  const YT_KEY = process.env.YT_API_KEY || '';
  if (!YT_KEY) return res.json({ configured: false });
  try {
    const q = encodeURIComponent(`${product} trend ${location}`);
    const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${q}&type=video&maxResults=10&key=${YT_KEY}`);
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    const ids = (d.items || []).map(i => i.id.videoId).filter(Boolean).join(',');
    let totalViews = 0;
    if (ids) {
      const r2 = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids}&key=${YT_KEY}`);
      const d2 = await r2.json();
      totalViews = (d2.items || []).reduce((s, v) => s + parseInt(v.statistics?.viewCount || 0, 10), 0);
    }
    res.json({ configured: true, available: true, totalViews, totalResults: d.pageInfo?.totalResults || 0 });
  } catch (e) {
    res.json({ configured: true, available: false, reason: e.message });
  }
}
