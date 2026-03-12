const GROQ_KEY   = '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';
const ELEVEN_KEY = 'sk_2785e1529f106be3cd64dedd464bf62b0691b44dc747e093';
const DID_KEY    = 'bWFoaXJ2ZWxpeWV2QGdtYWlsLmNvbQ:K4ncy8RbICP9OHe30DtJf';
const VOICE_ID   = '21m00Tcm4TlvDq8ikWAM';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  const { type, ...body } = req.body;

  // ── GROQ ──
  if (type === 'groq') {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body:    JSON.stringify(body),
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  }

  // ── ELEVENLABS ──
  if (type === 'eleven') {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, {
      method:  'POST',
      headers: { 'xi-api-key': ELEVEN_KEY, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        text: body.text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.52, similarity_boost: 0.85, style: 0.3, use_speaker_boost: true },
      }),
    });
    if (!r.ok) {
      const errText = await r.text();
      return res.status(r.status).json({ error: errText });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    return res.status(200).send(buf);
  }

  // ── D-ID: Şəkli yüklə + video yarat ──
  if (type === 'did_create') {
    try {
      const dataUrl = body.image_b64;
      const matches = dataUrl ? dataUrl.match(/^data:(.+);base64,(.+)$/) : null;
      if (!matches) return res.status(400).json({ error: 'Invalid image_b64' });

      const mimeType = matches[1];
      const imgBuf   = Buffer.from(matches[2], 'base64');
      const ext      = mimeType.includes('png') ? 'png' : 'jpg';

      // Şəkli D-ID serverinə yüklə
      const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
      const CRLF     = '\r\n';
      const header   = Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="image"; filename="photo.${ext}"${CRLF}` +
        `Content-Type: ${mimeType}${CRLF}${CRLF}`
      );
      const footer   = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
      const multipart = Buffer.concat([header, imgBuf, footer]);

      const uploadRes = await fetch('https://api.d-id.com/images', {
        method:  'POST',
        headers: {
          'Authorization':  `Basic ${DID_KEY}`,
          'Content-Type':   `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(multipart.length),
        },
        body: multipart,
      });

      let imageUrl;
      if (uploadRes.ok) {
        const ud = await uploadRes.json();
        imageUrl = ud.url;
      } else {
        const uploadErr = await uploadRes.text();
        // fallback — D-ID-in öz nümunə şəkli
        console.warn('D-ID upload failed:', uploadRes.status, uploadErr);
        imageUrl = 'https://d-id-public-bucket.s3.amazonaws.com/alice.jpg';
      }

      // Talk yarat
      const talkRes = await fetch('https://api.d-id.com/talks', {
        method:  'POST',
        headers: { 'Authorization': `Basic ${DID_KEY}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          source_url: imageUrl,
          script: {
            type:     'text',
            input:    body.text,
            provider: { type: 'microsoft', voice_id: 'az-AZ-BabekNeural' },
          },
          config: { fluent: true, pad_audio: 0.5 },
        }),
      });

      const talkText = await talkRes.text();
      let talkData;
      try { talkData = JSON.parse(talkText); } catch { talkData = { raw: talkText }; }
      return res.status(talkRes.status).json(talkData);

    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── D-ID: Poll ──
  if (type === 'did_poll') {
    const r = await fetch(`https://api.d-id.com/talks/${body.id}`, {
      headers: { 'Authorization': `Basic ${DID_KEY}` },
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  }

  return res.status(400).json({ error: 'Unknown type: ' + type });
}
