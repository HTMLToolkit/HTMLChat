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
    this.cleanupTimer = setInterval(() => this.cleanupUsers(), 30000);
    
    // Initialize moderators and banned users
    this.initializeModerationData();
  }

  async initializeModerationData() {
    // Set default moderators if none exist
    const moderators = await this.state.storage.get('moderators');
    if (!moderators) {
      await this.state.storage.put('moderators', ['admin', 'mod']);
    }
    
    // Initialize banned users if none exist
    const bannedUsers = await this.state.storage.get('banned_users');
    if (!bannedUsers) {
      await this.state.storage.put('banned_users', {});
    }
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

      // Clean up expired bans
      await this.cleanupExpiredBans();
      
      // Clean up expired kicks
      await this.cleanupExpiredKicks();
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  async cleanupExpiredKicks() {
    const kickLists = await this.state.storage.list({ prefix: 'kicked_users:' });
    const now = Date.now();
    
    for (const [key, kickedUsers] of kickLists) {
      let changed = false;
      
      for (const [username, kick] of Object.entries(kickedUsers)) {
        if (now > kick.expires) {
          delete kickedUsers[username];
          changed = true;
        }
      }
      
      if (changed) {
        if (Object.keys(kickedUsers).length > 0) {
          await this.state.storage.put(key, kickedUsers);
        } else {
          await this.state.storage.delete(key);
        }
      }
    }
  }

  async cleanupExpiredBans() {
    const bannedUsers = await this.state.storage.get('banned_users') || {};
    const now = Date.now();
    let changed = false;

    for (const [username, ban] of Object.entries(bannedUsers)) {
      if (ban.expires && now > ban.expires) {
        delete bannedUsers[username];
        changed = true;
      }
    }

    if (changed) {
      await this.state.storage.put('banned_users', bannedUsers);
    }
  }

  async updateUserPresence(room, username) {
    // Check if user is kicked before allowing presence update
    if (await this.isKicked(username, room)) {
      return { error: 'User is kicked from this room' };
    }
    
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

  async isModerator(username) {
    const moderators = await this.state.storage.get('moderators') || [];
    return moderators.includes(username.toLowerCase());
  }

  async isKicked(username, room) {
    const kickKey = `kicked_users:${room}`;
    const kickedUsers = await this.state.storage.get(kickKey) || {};
    const kick = kickedUsers[username.toLowerCase()];
    
    if (!kick) return false;
    
    // Check if kick has expired
    if (Date.now() > kick.expires) {
      delete kickedUsers[username.toLowerCase()];
      await this.state.storage.put(kickKey, kickedUsers);
      return false;
    }
    
    return true;
  }

  async isBanned(username) {
    const bannedUsers = await this.state.storage.get('banned_users') || {};
    const ban = bannedUsers[username.toLowerCase()];
    
    if (!ban) return false;
    
    // Check if ban has expired
    if (ban.expires !== null && ban.expires !== undefined && Date.now() > ban.expires) {
      delete bannedUsers[username.toLowerCase()];
      await this.state.storage.put('banned_users', bannedUsers);
      return false;
    }
    
    return true;
  }

  async moderateMessage(text, user, room) {
    // Check if user is banned
    if (await this.isBanned(user)) {
      return { allowed: false, reason: 'User is banned' };
    }
    
    // Check if user is kicked
    if (await this.isKicked(user, room)) {
      return { allowed: false, reason: 'User is kicked from this room' };
    }

    // Simple spam detection - check for repeated messages
    const userMessages = await this.state.storage.get(`user_messages:${user}`) || [];
    const now = Date.now();
    const recentMessages = userMessages.filter(msg => now - msg.time < 30000); // 30 seconds

    // Check for identical message in recent history
    if (recentMessages.some(msg => msg.text === text)) {
      return { allowed: false, reason: 'Spam detected' };
    }

    // Store this message
    recentMessages.push({ text, time: now });
    await this.state.storage.put(`user_messages:${user}`, recentMessages.slice(-10)); // Keep last 10

    return { allowed: true };
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
    const parts = url.pathname.split('/');
    const user = url.searchParams.get('user') || 'anon';

    // Handle private messages
    if (parts[1] === 'pm') {
      return this.handlePrivateMessages(request, parts[2], user);
    }

    // Handle moderation
    if (parts[1] === 'mod') {
      return this.handleModeration(request, parts[2], user);
    }

    // Regular chat room handling
    const room = parts.length > 2 ? parts[2] : 'default';

    // GET /chat/roomname - Get messages and users
    if (request.method === 'GET') {
      const messages = await this.state.storage.get(`messages:${room}`) || [];
      const users = await this.getUsers(room);
      const moderators = await this.state.storage.get('moderators') || [];
      
      return jsonResponse({
        messages,
        users,
        userCount: users.length,
        moderators,
        isModerator: moderators.includes(user.toLowerCase())
      });
    }

    // POST /chat/roomname - Send message
    if (request.method === 'POST') {
      const { text, messageId } = await request.json();
      
      if (!text || typeof text !== 'string') {
        return textResponse('Invalid message', 400);
      }

      // Moderate message
      const moderation = await this.moderateMessage(text, user, room);
      if (!moderation.allowed) {
        return textResponse(moderation.reason, 403);
      }

      const message = {
        id: messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        user,
        text,
        time: Date.now()
      };

      // Store message
      const key = `messages:${room}`;
      const messages = await this.state.storage.get(key) || [];
      messages.push(message);
      if (messages.length > 1000) messages.shift(); // Keep last 1000 messages
      await this.state.storage.put(key, messages);

      // Update user presence
      await this.updateUserPresence(room, user);

      return jsonResponse({ success: true, messageId: message.id });
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

    // DELETE /chat/roomname?user=username - User leaving or delete message
    if (request.method === 'DELETE') {
      const messageId = url.searchParams.get('messageId');
      
      if (messageId) {
        // Delete specific message
        return this.deleteMessage(room, messageId, user);
      } else {
        // User leaving room
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
    }

    return textResponse('Method not allowed', 405);
  }

  async deleteMessage(room, messageId, user) {
    const key = `messages:${room}`;
    const messages = await this.state.storage.get(key) || [];
    const messageIndex = messages.findIndex(msg => msg.id === messageId);
    
    console.log(`Delete request: room=${room}, messageId=${messageId}, user=${user}`); // Debug
    console.log(`Found message at index: ${messageIndex}`); // Debug
    
    if (messageIndex === -1) {
      return textResponse('Message not found', 404);
    }

    const message = messages[messageIndex];
    console.log(`Message to delete:`, message); // Debug
    
    // Check permissions - can delete own message or if moderator
    const isMod = await this.isModerator(user);
    if (message.user !== user && !isMod) {
      console.log(`Permission denied: user=${user}, messageUser=${message.user}, isMod=${isMod}`); // Debug
      return textResponse('Unauthorized - can only delete own messages or need moderator privileges', 403);
    }

    // Store original message info for system message
    const originalUser = message.user;
    const originalText = message.text.length > 50 ? message.text.substring(0, 50) + '...' : message.text;

    // Remove message
    messages.splice(messageIndex, 1);

    // Add system message about deletion
    const systemMessage = {
      id: `sys_del_${Date.now()}`,
      user: '*** System ***',
      text: `Message from ${originalUser} deleted by ${user}${originalUser !== user ? ' (moderator action)' : ''}`,
      time: Date.now(),
      system: true
    };
    
    messages.push(systemMessage);
    await this.state.storage.put(key, messages);

    console.log('Message deleted successfully'); // Debug
    return jsonResponse({ 
      success: true, 
      deleted: true,
      systemMessage: systemMessage 
    });
  }

  async handlePrivateMessages(request, conversationId, user) {
    const key = `pm:${conversationId}`;
    
    if (request.method === 'GET') {
      const messages = await this.state.storage.get(key) || [];
      return jsonResponse({ messages });
    }
    
    if (request.method === 'POST') {
      const { text, to } = await request.json();
      
      if (!text || !to) {
        return textResponse('Missing text or recipient', 400);
      }

      const message = {
        id: `pm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        from: user,
        to: to,
        text: text,
        time: Date.now()
      };

      const messages = await this.state.storage.get(key) || [];
      messages.push(message);
      
      // Keep last 100 PM messages
      if (messages.length > 100) messages.shift();
      
      await this.state.storage.put(key, messages);
      
      return jsonResponse({ success: true, messageId: message.id });
    }
    
    return textResponse('Method not allowed', 405);
  }

  async handleModeration(request, room, user) {
    // Check if user is moderator
    if (!(await this.isModerator(user))) {
      return textResponse('Unauthorized - Moderator access required', 403);
    }

    if (request.method === 'POST') {
      const { action, targetUser, reason, duration } = await request.json();
      
      switch (action) {
        case 'ban':
          return this.banUser(targetUser, user, reason, duration);
        case 'unban':
          return this.unbanUser(targetUser, user);
        case 'kick':
          return this.kickUser(room, targetUser, user, reason);
        case 'addMod':
          return this.addModerator(targetUser, user);
        case 'removeMod':
          return this.removeModerator(targetUser, user);
      }
    }

    if (request.method === 'GET') {
      const bannedUsers = await this.state.storage.get('banned_users') || {};
      const moderators = await this.state.storage.get('moderators') || [];
      
      return jsonResponse({
        bannedUsers,
        moderators
      });
    }

    return textResponse('Method not allowed', 405);
  }

  async banUser(targetUser, moderator, reason = '', durationMinutes = null) {
    const bannedUsers = await this.state.storage.get('banned_users') || {};
    
    const ban = {
      bannedBy: moderator,
      reason: reason,
      timestamp: Date.now(),
      expires: durationMinutes ? Date.now() + (durationMinutes * 60 * 1000) : null
    };
    
    bannedUsers[targetUser.toLowerCase()] = ban;
    await this.state.storage.put('banned_users', bannedUsers);
    
    return jsonResponse({ success: true, message: `User ${targetUser} banned` });
  }

  async unbanUser(targetUser, moderator) {
    const bannedUsers = await this.state.storage.get('banned_users') || {};
    
    if (bannedUsers[targetUser.toLowerCase()]) {
      delete bannedUsers[targetUser.toLowerCase()];
      await this.state.storage.put('banned_users', bannedUsers);
      return jsonResponse({ success: true, message: `User ${targetUser} unbanned` });
    }
    
    return textResponse('User not banned', 400);
  }

  async kickUser(room, targetUser, moderator, reason = '') {
    // Add user to temporary kick list (5 minute kick)
    const kickKey = `kicked_users:${room}`;
    const kickedUsers = await this.state.storage.get(kickKey) || {};
    
    kickedUsers[targetUser.toLowerCase()] = {
      kickedBy: moderator,
      reason: reason,
      timestamp: Date.now(),
      expires: Date.now() + (5 * 60 * 1000) // 5 minutes
    };
    
    await this.state.storage.put(kickKey, kickedUsers);
    
    // Remove user from room
    const usersKey = `users:${room}`;
    const users = await this.state.storage.get(usersKey) || {};
    delete users[targetUser];
    await this.state.storage.put(usersKey, users);
    
    // Add system message
    const messagesKey = `messages:${room}`;
    const messages = await this.state.storage.get(messagesKey) || [];
    
    const systemMessage = {
      id: `sys_kick_${Date.now()}`,
      user: '*** System ***',
      text: `${targetUser} was kicked by ${moderator}${reason ? ` (${reason})` : ''} - banned for 5 minutes`,
      time: Date.now(),
      system: true
    };
    
    messages.push(systemMessage);
    await this.state.storage.put(messagesKey, messages);
    
    return jsonResponse({ 
      success: true, 
      message: `User ${targetUser} kicked for 5 minutes`,
      systemMessage: systemMessage 
    });
  }

  async addModerator(targetUser, moderator) {
    const moderators = await this.state.storage.get('moderators') || [];
    
    if (!moderators.includes(targetUser.toLowerCase())) {
      moderators.push(targetUser.toLowerCase());
      await this.state.storage.put('moderators', moderators);
      return jsonResponse({ success: true, message: `${targetUser} added as moderator` });
    }
    
    return textResponse('User already moderator', 400);
  }

  async removeModerator(targetUser, moderator) {
    const moderators = await this.state.storage.get('moderators') || [];
    const index = moderators.indexOf(targetUser.toLowerCase());
    
    if (index > -1) {
      moderators.splice(index, 1);
      await this.state.storage.put('moderators', moderators);
      return jsonResponse({ success: true, message: `${targetUser} removed as moderator` });
    }
    
    return textResponse('User not moderator', 400);
  }
}