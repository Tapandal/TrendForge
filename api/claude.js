// Deploy path: /api/claude.js
// Set ANTHROPIC_API_KEY in Vercel Project Settings → Environment Variables

export default async function handler(req, res) {
  const AI_KEY = process.env.ANTHROPIC_API_KEY || '';
  if (!AI_KEY) return res.json({ configured: false });
  try {
    const { product, location } = req.method === 'POST' ? req.body : req.query;
    const prompt = `For the product "${product}" in the context of "${location}", return ONLY a valid JSON object (no markdown, no extra text) with exactly this structure:
{"category":"string","hsCode":"4-6 digit HS code","oneLiner":"why demand rising now max 15 words","rawMaterials":[{"name":"string","pct":number,"priceTrend":"+X%","topProducers":[{"flag":"emoji","country":"string","share":number}]}],"exporters":[{"flag":"emoji","country":"string","share":number,"value":"$XB"}],"companies":[{"name":"string","ticker":"string","exchange":"string","country":"string","mktCap":"$XB","investScore":0-100,"risk":"Low/Medium/High","oneLiner":"8 word role description","thesis":"12 word investment reason"}],"thesis":"2 sentence investment thesis including a key risk.","scRawMat":number,"scProduction":number,"scShipping":number,"scMarketing":number}
Provide 3-4 rawMaterials, 4-5 exporters, 4-5 companies. All numbers realistic estimates.`;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AI_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
    });
    const d = await r.json();
    const txt = d.content?.[0]?.text || '';
    const parsed = JSON.parse(txt.replace(/```json|```/g, '').trim());
    res.json({ configured: true, available: true, data: parsed });
  } catch (e) {
    res.json({ configured: true, available: false, reason: e.message });
  }
}
