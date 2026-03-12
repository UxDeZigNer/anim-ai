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

  const body = req.body;
  const type = body.type;

  // ── GROQ ──
  if (type === 'groq') {
    const groqBody = {
      model:       body.model || 'llama3-8b-8192',
      messages:    body.messages,
      max_tokens:  body.max_tokens  || 100,
      temperature: body.temperature || 0.9,
    };
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify(groqBody),
    });
    const text = await r.text();
    res.setHeader('Content-Type', 'application/json');
    return res.status(r.status).send(text);
  }

  // ── ELEVENLABS ──
  if (type === 'eleven') {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, {
        method:  'POST',
        headers: {
          'xi-api-key':   ELEVEN_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text:       body.text,
          model_id:   'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.52, similarity_boost: 0.85,
            style: 0.3, use_speaker_boost: true,
          },
        }),
      }
    );
    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    return res.status(200).send(buf);
  }

  // ── D-ID CREATE ──
  if (type === 'did_create') {
    try {
      const dataUrl = body.image_b64 || '';
      const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
      if (!matches) return res.status(400).json({ error: 'Bad image_b64' });

      const mime   = matches[1];
      const imgBuf = Buffer.from(matches[2], 'base64');
      const ext    = mime.includes('png') ? 'png' : 'jpg';

      // Multipart upload to D-ID
      const boundary  = 'Boundary' + Date.now();
      const CRLF      = '\r\n';
      const partHead  = Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="image"; filename="photo.${ext}"${CRLF}` +
        `Content-Type: ${mime}${CRLF}${CRLF}`
      );
      const partFoot  = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
      const multipart = Buffer.concat([partHead, imgBuf, partFoot]);

      const upRes = await fetch('https://api.d-id.com/images', {
        method:  'POST',
        headers: {
          'Authorization': `Basic ${DID_KEY}`,
          'Content-Type':  `multipart/form-data; boundary=${boundary}`,
        },
        body: multipart,
      });

      let imageUrl = 'https://d-id-public-bucket.s3.amazonaws.com/alice.jpg';
      if (upRes.ok) {
        const ud = await upRes.json();
        imageUrl = ud.url || imageUrl;
      }

      const talkRes = await fetch('https://api.d-id.com/talks', {
        method:  'POST',
        headers: {
          'Authorization': `Basic ${DID_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
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
      res.setHeader('Content-Type', 'application/json');
      return res.status(talkRes.status).send(talkText);

    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── D-ID POLL ──
  if (type === 'did_poll') {
    const r = await fetch(`https://api.d-id.com/talks/${body.id}`, {
      headers: { 'Authorization': `Basic ${DID_KEY}` },
    });
    const text = await r.text();
    res.setHeader('Content-Type', 'application/json');
    return res.status(r.status).send(text);
  }

  return res.status(400).json({ error: `Unknown type: ${type}` });
}
