// Deploy path: /api/claude.js
// Needs: ANTHROPIC_API_KEY in Vercel → Project Settings → Environment Variables.
// Optional: ANTHROPIC_MODEL (default below), AI_HOURLY_LIMIT (default 20 per visitor).
//
// v7 changes:
//  - The AI now receives the REAL measured signals (growth %, trade data…)
//    and is told to base its verdict on them, instead of inventing a story.
//  - It is asked for every field the app shows (v6 asked for only some, so
//    several sections always fell back to formulas).
//  - Bigger answer budget (v6 often got cut off mid-answer → whole section vanished).
//  - Tolerant reading of the answer, and a basic usage limit so a stranger
//    can't run up your bill.

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const LIMIT = parseInt(process.env.AI_HOURLY_LIMIT || '20', 10);
const hits = new Map(); // best-effort, per server instance

function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 3600000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > LIMIT;
}

function extractJson(txt) {
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('no_json_in_answer');
  return JSON.parse(txt.slice(a, b + 1));
}

export default async function handler(req, res) {
  const AI_KEY = process.env.ANTHROPIC_API_KEY || '';
  if (!AI_KEY) return res.json({ configured: false });
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.json({ configured: true, available: false, reason: 'hourly_limit_reached' });

  try {
    const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : req.query;
    const product = String(body.product || '').slice(0, 80);
    const location = String(body.location || 'Global').slice(0, 40);
    const signals = body.signals ? JSON.stringify(body.signals).slice(0, 2500) : '{}';
    if (!product) return res.json({ configured: true, available: false, reason: 'no_product' });

    const prompt = `You are a market analyst. Product: "${product}". Market: "${location}".

Measured data from live sources (treat as facts; do not contradict them):
${signals}

Return ONLY one valid JSON object (no markdown, no commentary) with exactly these keys:
{
 "category": "string",
 "hsCode": "4-digit HS code for this product",
 "oneLiner": "plain-English verdict for a non-expert, max 30 words, based on the measured data above; say clearly if data is weak",
 "marketSizeUSD": number (annual market size in ${location}, USD, rough estimate),
 "avgPriceUSD": number (typical retail price per unit, USD),
 "rawMaterials": [{"name":"string","pct":number,"priceTrend":"+X% or -X%","topProducers":[{"flag":"emoji","country":"string","share":number}]}],
 "exporters": [{"flag":"emoji","country":"string","share":number,"value":"$XB"}],
 "companies": [{"name":"string","ticker":"string","exchange":"string","country":"string","mktCap":"$XB","investScore":0-100,"risk":"Low|Medium|High","oneLiner":"max 8 words","thesis":"max 12 words"}],
 "thesis": "2 sentences, include one key risk",
 "scRawMat": number, "scProduction": number, "scShipping": number, "scMarketing": number,
 "risks": {"supply":"Low|Medium|High","geo":"Low|Medium|High","regulatory":"Low|Medium|High","notes":"1-2 sentences in plain English"},
 "contentGaps": ["3 short, specific opportunities a small seller could act on"]
}
Rules: 3 rawMaterials (2-3 producers each), 5 exporters, 4 companies (real, listed companies only). sc* numbers are the % cost increase each stage would see if demand doubled. Estimates must be realistic; if unsure, be conservative.`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AI_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 3000, temperature: 0.2, messages: [{ role: 'user', content: prompt }] }),
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message || 'ai_error');
    const txt = (d.content || []).map((c) => c.text || '').join('');
    res.json({ configured: true, available: true, model: MODEL, data: extractJson(txt) });
  } catch (e) {
    res.json({ configured: true, available: false, reason: e.message });
  }
}
