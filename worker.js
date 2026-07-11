/**
 * ApexNoteTaker AI Worker
 * Proxies requests to the Anthropic API — keeps the API key server-side.
 * Deploy: wrangler deploy
 * Secret:  wrangler secret put ANTHROPIC_API_KEY
 */

const ACTIONS = {
  summarize: (title, content) =>
    `Summarize the following notes from a page titled "${title}". Return 4-6 tight bullet points capturing the key ideas. No preamble.\n\n${content}`,

  todos: (title, content) =>
    `Extract every action item, task, or next step from these notes titled "${title}". Return a clean bulleted list. If none exist, say so briefly.\n\n${content}`,

  cleanup: (title, content) =>
    `Rewrite and organize the following notes titled "${title}". Preserve all information, fix grammar, remove redundancy, group related ideas. Return plain text with bullet hierarchy.\n\n${content}`,

  ask: (title, content, question) =>
    `You are a helpful assistant. The user is looking at their notes titled "${title}".\n\nNotes:\n${content}\n\nQuestion: ${question}`,
};

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return reply(null, 204);
    }

    if (request.method !== 'POST') {
      return reply({ error: 'POST only' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return reply({ error: 'Invalid JSON' }, 400);
    }

    const { action = 'summarize', content = '', pageTitle = 'Untitled', question = '' } = body;

    if (!content.trim()) {
      return reply({ error: 'No content provided' }, 400);
    }

    const buildPrompt = ACTIONS[action];
    if (!buildPrompt) {
      return reply({ error: `Unknown action: ${action}` }, 400);
    }

    const prompt = buildPrompt(pageTitle, content.slice(0, 12000), question);

    let anthropicRes;
    try {
      anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
    } catch (err) {
      return reply({ error: 'Failed to reach Anthropic API' }, 502);
    }

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      return reply({ error: data?.error?.message || 'Anthropic error' }, anthropicRes.status);
    }

    return reply({ result: data.content?.[0]?.text ?? '' });
  },
};

function reply(body, status = 200) {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
