// api/proxy.js — Vercel Serverless Function
// Bu fayl vercel.com-da avtomatik işləyir

const GROQ_KEY   = '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';
const ELEVEN_KEY = 'sk_2785e1529f106be3cd64dedd464bf62b0691b44dc747e093';
const VOICE_ID   = '21m00Tcm4TlvDq8ikWAM';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).end();

  const { type, ...body } = req.body;

  // ── GROQ ──
  if (type === 'groq') {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  }

  // ── ELEVENLABS ──
  if (type === 'eleven') {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, {
      method: 'POST',
      headers: { 'xi-api-key': ELEVEN_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: body.text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.52, similarity_boost: 0.85, style: 0.3, use_speaker_boost: true },
      }),
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    return res.status(200).send(buf);
  }

  return res.status(400).json({ error: 'Unknown type' });
}
