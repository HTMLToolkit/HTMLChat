// Helper for CORS responses
function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    }
  });
}

function textResponse(text, status = 200) {
  return new Response(text, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'text/plain'
    }
  });
}

export default class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response('', {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    const url = new URL(request.url);
    // Extract room from URL path, e.g. /chat/roomname
    const parts = url.pathname.split('/');
    const room = parts.length > 2 ? parts[2] : 'default';

    if (request.method === 'GET') {
      const messages = await this.state.storage.get(`messages:${room}`) || [];
      return jsonResponse(messages);
    }

    if (request.method === 'POST') {
      const { text } = await request.json();
      const user = url.searchParams.get('user') || 'anon';

      if (!text || typeof text !== 'string') {
        return textResponse('Invalid message', 400);
      }

      const message = {
        user,
        text,
        time: Date.now()
      };

      const key = `messages:${room}`;
      const messages = await this.state.storage.get(key) || [];
      messages.push(message);
      if (messages.length > 100) messages.shift();

      await this.state.storage.put(key, messages);
      return textResponse('OK');
    }

    return textResponse('Method not allowed', 405);
  }
}
