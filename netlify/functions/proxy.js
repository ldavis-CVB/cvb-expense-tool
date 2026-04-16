const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let payload;
  try { payload = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) }; }

  const { action, data, mediaType } = payload;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured — add ANTHROPIC_API_KEY in Netlify environment variables' }) };

  // Build the Claude request body
  let claudeBody;

  if (action === 'test') {
    claudeBody = {
      model: 'claude-opus-4-5',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }]
    };
  } else {
    const isPDF = mediaType === 'application/pdf';
    const contentBlock = isPDF
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image',    source: { type: 'base64', media_type: mediaType,          data } };

    claudeBody = {
      model: 'claude-opus-4-5',
      max_tokens: 512,
      messages: [{ role: 'user', content: [
        contentBlock,
        { type: 'text', text: 'Extract from this receipt and return ONLY valid JSON, no markdown: {"date":"MM/DD/YYYY","vendor":"merchant name","description":"brief description","amount":0.00}. Use null if not found.' }
      ]}]
    };
  }

  // Use node https module as fallback if fetch unavailable
  const doFetch = typeof fetch !== 'undefined' ? fetch : require('node-fetch').default;

  try {
    const res = await doFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify(claudeBody)
    });

    const result = await res.json();

    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: result.error?.message || 'API error' }) };
    }

    if (action === 'test') {
      return { statusCode: 200, headers, body: JSON.stringify({ status: 'ok' }) };
    }

    const text = result.content[0].text.replace(/^```[a-z]*\n?/i,'').replace(/```$/,'').trim();
    return { statusCode: 200, headers, body: text };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message || 'Unknown server error' }) };
  }
};
