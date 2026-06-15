// Netlify serverless function — secure proxy to the Anthropic API.
// The API key is read from the ANTHROPIC_API_KEY environment variable
// (set in Netlify → Site configuration → Environment variables).
// The key is NEVER sent to the browser; the app only ever talks to this function.

exports.handler = async function (event) {
  // CORS / preflight
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: 'Server is missing ANTHROPIC_API_KEY. Add it in Netlify environment variables.' }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const userMessages = Array.isArray(payload.messages) ? payload.messages : [];
  const tripContext = typeof payload.tripContext === 'string' ? payload.tripContext : '';

  const system =
    'You are the in-app assistant for a 4-person summer trip (Mykonos, Mallorca, Paris, 11–27 Aug 2026). ' +
    'You have two jobs: (1) answer questions about THIS trip using the trip data below, and ' +
    '(2) act as a helpful general travel companion — answer any other question too (places to visit, restaurants, ' +
    'local tips, directions, culture, language phrases, weather, general knowledge, etc.). ' +
    'Reply in the same language the user writes in (Arabic or English). Keep answers friendly, concise, and practical. ' +
    'For trip-specific facts (budget, expenses, flights, hotels, bookings) rely strictly on the trip data below. ' +
    'For general questions, use your own knowledge freely and feel free to tailor suggestions to where the group is ' +
    '(Mykonos, Mallorca, or Paris) when relevant. Use SAR and EUR where money is involved.\n\n' +
    '=== TRIP DATA ===\n' + tripContext;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: system,
        messages: userMessages,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        headers: cors,
        body: JSON.stringify({ error: (data && data.error && data.error.message) || 'Upstream error' }),
      };
    }

    const text = Array.isArray(data.content)
      ? data.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
      : '';

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: text || '…' }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: cors,
      body: JSON.stringify({ error: 'Could not reach the AI service. Please try again.' }),
    };
  }
};
