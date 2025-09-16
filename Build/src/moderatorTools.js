export class ModeratorTools {
  constructor(app) {
    this.app = app;
    this.moderators = this.loadModerators();
    this.bannedUsers = this.loadBannedUsers();
  }
  
  loadModerators() {
    try {
      const saved = localStorage.getItem('htmlchat_moderators');
      return saved ? JSON.parse(saved) : ['admin', 'mod']; // Default moderators
    } catch(e) {
      return ['admin', 'mod'];
    }
  }
  
  saveModerators() {
    try {
      localStorage.setItem('htmlchat_moderators', JSON.stringify(this.moderators));
    } catch(e) {
      console.warn('Failed to save moderators:', e);
    }
  }
  
  loadBannedUsers() {
    try {
      const saved = localStorage.getItem('htmlchat_banned_users');
      return saved ? JSON.parse(saved) : {};
    } catch(e) {
      return {};
    }
  }
  
  saveBannedUsers() {
    try {
      localStorage.setItem('htmlchat_banned_users', JSON.stringify(this.bannedUsers));
    } catch(e) {
      console.warn('Failed to save banned users:', e);
    }
  }
  
  isModerator(username) {
    return this.moderators.includes(username.toLowerCase());
  }
  
  addModerator(username) {
    if (!this.isModerator(this.app.user)) return false;
    
    const normalizedName = username.toLowerCase();
    if (!this.moderators.includes(normalizedName)) {
      this.moderators.push(normalizedName);
      this.saveModerators();
      return true;
    }
    return false;
  }
  
  removeModerator(username) {
    if (!this.isModerator(this.app.user)) return false;
    
    const normalizedName = username.toLowerCase();
    const index = this.moderators.indexOf(normalizedName);
    if (index > -1) {
      this.moderators.splice(index, 1);
      this.saveModerators();
      return true;
    }
    return false;
  }
  
  isBanned(username) {
    const ban = this.bannedUsers[username.toLowerCase()];
    if (!ban) return false;
    
    // Check if ban has expired
    if (ban.expires && Date.now() > ban.expires) {
      delete this.bannedUsers[username.toLowerCase()];
      this.saveBannedUsers();
      return false;
    }
    
    return true;
  }
  
  banUser(username, reason = '', durationMinutes = null) {
    if (!this.isModerator(this.app.user)) return false;
    
    const normalizedName = username.toLowerCase();
    const ban = {
      bannedBy: this.app.user,
      reason: reason,
      timestamp: Date.now(),
      expires: durationMinutes ? Date.now() + (durationMinutes * 60 * 1000) : null
    };
    
    this.bannedUsers[normalizedName] = ban;
    this.saveBannedUsers();
    
    return true;
  }
  
  unbanUser(username) {
    if (!this.isModerator(this.app.user)) return false;
    
    const normalizedName = username.toLowerCase();
    if (this.bannedUsers[normalizedName]) {
      delete this.bannedUsers[normalizedName];
      this.saveBannedUsers();
      return true;
    }
    return false;
  }
  
  getBanInfo(username) {
    return this.bannedUsers[username.toLowerCase()] || null;
  }
  
  // Get all current bans
  getAllBans() {
    const activeBans = {};
    const now = Date.now();
    
    for (const [username, ban] of Object.entries(this.bannedUsers)) {
      // Check if ban is still active
      if (!ban.expires || now <= ban.expires) {
        activeBans[username] = ban;
      } else {
        // Remove expired ban
        delete this.bannedUsers[username];
      }
    }
    
    this.saveBannedUsers();
    return activeBans;
  }
  
  // Clean up expired bans
  cleanupExpiredBans() {
    const now = Date.now();
    let changed = false;
    
    for (const [username, ban] of Object.entries(this.bannedUsers)) {
      if (ban.expires && now > ban.expires) {
        delete this.bannedUsers[username];
        changed = true;
      }
    }
    
    if (changed) {
      this.saveBannedUsers();
    }
  }
  
  // Moderate message (check for banned words, spam, etc.)
  moderateMessage(message, username) {
    // Check if user is banned
    if (this.isBanned(username)) {
      return {
        allowed: false,
        reason: 'User is banned'
      };
    }
    
    // Check for banned words (simple implementation)
    const bannedWords = ['spam', 'badword']; // In real app, this would be more comprehensive
    const lowercaseMessage = message.toLowerCase();
    
    for (const word of bannedWords) {
      if (lowercaseMessage.includes(word)) {
        return {
          allowed: false,
          reason: 'Message contains inappropriate content'
        };
      }
    }
    
    // Check for spam (repeated messages)
    if (this.isSpam(message, username)) {
      return {
        allowed: false,
        reason: 'Spam detected'
      };
    }
    
    return {
      allowed: true,
      reason: null
    };
  }
  
  isSpam(message, username) {
    // Simple spam detection - check if same message was sent recently
    const key = `last_messages_${username}`;
    const lastMessages = this.app.loadFromStorage(key) || [];
    
    // Check if identical message was sent in last 30 seconds
    const now = Date.now();
    const recentMessages = lastMessages.filter(msg => now - msg.time < 30000);
    
    if (recentMessages.some(msg => msg.text === message)) {
      return true;
    }
    
    // Store this message
    recentMessages.push({ text: message, time: now });
    
    // Keep only last 5 messages
    const messagesToKeep = recentMessages.slice(-5);
    this.app.saveToStorage(key, messagesToKeep);
    
    return false;
  }
  
  // Show moderation panel
  showModerationPanel() {
    if (!this.isModerator(this.app.user)) {
      alert('You do not have moderator privileges.');
      return;
    }
    
    const bans = this.getAllBans();
    const banList = Object.entries(bans).map(([username, ban]) => {
      const expires = ban.expires ? new Date(ban.expires).toLocaleString() : 'Never';
      const reason = ban.reason || 'No reason given';
      return `${username} - Expires: ${expires} - Reason: ${reason}`;
    }).join('\n') || 'No active bans';
    
    const panel = `
MODERATION PANEL

Moderators: ${this.moderators.join(', ')}

Active Bans:
${banList}

Available Commands:
- Right-click messages for moderation options
- Double-click usernames to send private messages
    `;
    
    alert(panel);
  }
  
  // Process moderator commands
  processModCommand(command, args) {
    if (!this.isModerator(this.app.user)) return false;
    
    switch (command.toLowerCase()) {
      case 'ban':
        if (args.length > 0) {
          const username = args[0];
          const duration = args[1] ? parseInt(args[1]) : null;
          const reason = args.slice(2).join(' ') || 'No reason given';
          
          if (this.banUser(username, reason, duration)) {
            return `Banned ${username}${duration ? ` for ${duration} minutes` : ' permanently'}`;
          }
        }
        break;
        
      case 'unban':
        if (args.length > 0) {
          const username = args[0];
          if (this.unbanUser(username)) {
            return `Unbanned ${username}`;
          }
        }
        break;
        
      case 'mod':
        if (args.length > 0) {
          const username = args[0];
          if (this.addModerator(username)) {
            return `Added ${username} as moderator`;
          }
        }
        break;
        
      case 'demod':
        if (args.length > 0) {
          const username = args[0];
          if (this.removeModerator(username)) {
            return `Removed ${username} as moderator`;
          }
        }
        break;
    }
    
    return false;
  }
  
  // Initialize mod tools (run periodic cleanup)
  init() {
    // Clean up expired bans every 5 minutes
    setInterval(() => {
      this.cleanupExpiredBans();
    }, 5 * 60 * 1000);
  }
}