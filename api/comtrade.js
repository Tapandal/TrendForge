// Deploy path: /api/comtrade.js
// Set COMTRADE_API_KEY in Vercel Project Settings → Environment Variables

export default async function handler(req, res) {
  const { hsCode, countryCode } = req.query;
  const CT_KEY = process.env.COMTRADE_API_KEY || '';
  if (!CT_KEY) return res.json({ configured: false });
  if (!hsCode) return res.json({ configured: true, available: false, reason: 'no_hs_code' });
  try {
    const r = await fetch(
      `https://comtradeapi.un.org/data/v1/get/C/A/HS?reporterCode=${countryCode}&flowCode=M&cmdCode=${hsCode}&period=2024,2023`,
      { headers: { 'Ocp-Apim-Subscription-Key': CT_KEY } }
    );
    const d = await r.json();
    const rows = d.data || [];
    const y24 = rows.find(x => x.period == 2024)?.primaryValue || null;
    const y23 = rows.find(x => x.period == 2023)?.primaryValue || null;
    if (y24 && y23) {
      const growth = Math.round(((y24 - y23) / y23) * 100);
      return res.json({ configured: true, available: true, growth, y2024: y24, y2023: y23 });
    }
    res.json({ configured: true, available: false, reason: 'no_data' });
  } catch (e) {
    res.json({ configured: true, available: false, reason: e.message });
  }
}
