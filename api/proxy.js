import sharp from 'sharp';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, data, mediaType } = req.body;

  // HEIC conversion — no API key needed
  if (action === 'convert-heic') {
    try {
      const inputBuf = Buffer.from(data, 'base64');
      const jpegBuf = await sharp(inputBuf)
        .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      return res.status(200).json({ data: jpegBuf.toString('base64') });
    } catch (e) {
      return res.status(500).json({ error: 'HEIC conversion failed: ' + e.message });
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });


  let claudeBody;
  if (action === 'test') {
    claudeBody = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }]
    };
  } else {
    const isPDF = mediaType === 'application/pdf';
    claudeBody = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: [
        isPDF
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
          : { type: 'image',    source: { type: 'base64', media_type: mediaType,          data } },
        { type: 'text', text: 'Extract from this receipt and return ONLY valid JSON, no markdown: {"date":"MM/DD/YYYY","vendor":"merchant name","description":"brief description","amount":0.00}. Use null if not found.' }
      ]}]
    };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify(claudeBody)
    });

    const result = await response.json();

    if (!response.ok) {
      const errType = result.error?.type || 'unknown';
      const errMsg  = result.error?.message || `API error`;
      const full    = `[${response.status} ${errType}] ${errMsg}`;
      return res.status(response.status).json({ error: full });
    }

    if (action === 'test') return res.status(200).json({ status: 'ok' });

    const text = result.content[0].text.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
    return res.status(200).send(text);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
