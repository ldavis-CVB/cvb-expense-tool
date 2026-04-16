export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const { action, data, mediaType } = req.body;

  let claudeBody;
  if (action === 'test') {
    claudeBody = {
      model: 'claude-opus-4-5',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }]
    };
  } else {
    const isPDF = mediaType === 'application/pdf';
    claudeBody = {
      model: 'claude-opus-4-5',
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
      return res.status(response.status).json({ error: result.error?.message || 'API error' });
    }

    if (action === 'test') return res.status(200).json({ status: 'ok' });

    const text = result.content[0].text.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
    return res.status(200).send(text);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
