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
    // Clean up expired users every 30 seconds
    this.cleanupTimer = setInterval(() => this.cleanupUsers(), 30000);
  }

  async cleanupUsers() {
    try {
      const rooms = await this.state.storage.list({ prefix: 'users:' });
      const now = Date.now();
      const TIMEOUT = 60000; // 1 minute timeout

      for (const [key, users] of rooms) {
        const activeUsers = {};
        let changed = false;

        for (const [username, lastSeen] of Object.entries(users)) {
          if (now - lastSeen < TIMEOUT) {
            activeUsers[username] = lastSeen;
          } else {
            changed = true;
          }
        }

        if (changed) {
          if (Object.keys(activeUsers).length > 0) {
            await this.state.storage.put(key, activeUsers);
          } else {
            await this.state.storage.delete(key);
          }
        }
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  async updateUserPresence(room, username) {
    const key = `users:${room}`;
    const users = await this.state.storage.get(key) || {};
    users[username] = Date.now();
    await this.state.storage.put(key, users);
    return users;
  }

  async getUsers(room) {
    const key = `users:${room}`;
    const users = await this.state.storage.get(key) || {};
    const now = Date.now();
    const TIMEOUT = 60000; // 1 minute timeout
    
    // Filter out expired users
    const activeUsers = {};
    for (const [username, lastSeen] of Object.entries(users)) {
      if (now - lastSeen < TIMEOUT) {
        activeUsers[username] = lastSeen;
      }
    }
    
    // Update storage if we filtered anyone out
    if (Object.keys(activeUsers).length !== Object.keys(users).length) {
      if (Object.keys(activeUsers).length > 0) {
        await this.state.storage.put(key, activeUsers);
      } else {
        await this.state.storage.delete(key);
      }
    }
    
    return Object.keys(activeUsers);
  }

  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response('', {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    const url = new URL(request.url);
    // Extract room from URL path, e.g. /chat/roomname
    const parts = url.pathname.split('/');
    const room = parts.length > 2 ? parts[2] : 'default';
    const user = url.searchParams.get('user') || 'anon';

    // GET /chat/roomname - Get messages and users
    if (request.method === 'GET') {
      const messages = await this.state.storage.get(`messages:${room}`) || [];
      const users = await this.getUsers(room);
      
      return jsonResponse({
        messages,
        users,
        userCount: users.length
      });
    }

    // POST /chat/roomname - Send message
    if (request.method === 'POST') {
      const { text } = await request.json();
      
      if (!text || typeof text !== 'string') {
        return textResponse('Invalid message', 400);
      }

      const message = {
        user,
        text,
        time: Date.now()
      };

      // Store message
      const key = `messages:${room}`;
      const messages = await this.state.storage.get(key) || [];
      messages.push(message);
      if (messages.length > 100) messages.shift();
      await this.state.storage.put(key, messages);

      // Update user presence
      await this.updateUserPresence(room, user);

      return textResponse('OK');
    }

    // PUT /chat/roomname?user=username - Update user presence (heartbeat)
    if (request.method === 'PUT') {
      await this.updateUserPresence(room, user);
      const users = await this.getUsers(room);
      
      return jsonResponse({
        users,
        userCount: users.length
      });
    }

    // DELETE /chat/roomname?user=username - User leaving
    if (request.method === 'DELETE') {
      const key = `users:${room}`;
      const users = await this.state.storage.get(key) || {};
      delete users[user];
      
      if (Object.keys(users).length > 0) {
        await this.state.storage.put(key, users);
      } else {
        await this.state.storage.delete(key);
      }

      return textResponse('OK');
    }

    return textResponse('Method not allowed', 405);
  }
}