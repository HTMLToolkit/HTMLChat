// Import modules
import { SoundManager } from './soundManager.js';
import { MessageRenderer } from './messageRenderer.js';
import { PrivateMessageManager } from './privateMessages.js';
import { FileUploadManager } from './fileUpload.js';
import { SearchManager } from './search.js';
import { NotificationManager } from './notifications.js';
import { ContextMenuManager } from './contextMenu.js';
import { ModeratorTools } from './moderatorTools.js';

// Global app state
class HTMLChatApp {
  constructor() {
    // Core properties
    this.user = null;
    this.baseURL = "https://htmlchat.neeljaiswal23.workers.dev";
    this.refreshTimer = null;
    this.isVisible = !document.hidden;
    this.lastActivity = Date.now();
    this.lastMessageTime = 0;
    this.lastFetchTime = 0;
    this.currentReplyTo = null;

    // Initialize managers
    this.soundManager = new SoundManager();
    this.messageRenderer = new MessageRenderer(this);
    this.pmManager = new PrivateMessageManager(this);
    this.fileManager = new FileUploadManager(this);
    this.searchManager = new SearchManager(this);
    this.notificationManager = new NotificationManager(this);
    this.contextMenu = new ContextMenuManager(this);
    this.modTools = new ModeratorTools(this);

    // DOM elements
    this.elements = {
      roomSelect: document.getElementById("room-select"),
      welcomeDiv: document.getElementById("welcome"),
      chatBox: document.getElementById("chat"),
      input: document.getElementById("msg"),
      sendBtn: document.getElementById("send-btn"),
      usersDiv: document.getElementById("users"),
      replyPreview: document.getElementById("reply-preview"),
      soundToggle: document.getElementById("sound-toggle")
    };

    this.init();
  }

  // Simple storage helpers
  saveToStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn("Storage failed:", e);
    }
  }

  loadFromStorage(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.warn("Load failed:", e);
      return null;
    }
  }

  async init() {
    // Get or prompt for username
    this.user = this.loadFromStorage("htmlchat_user");
    if (!this.user) {
      do {
        this.user = prompt("Enter your nickname:") || "";
        this.user = this.user.trim().substring(0, 20);
      } while (!this.user);
      this.saveToStorage("htmlchat_user", this.user);
    }

    // Set up room
    const savedRoom = this.loadFromStorage("htmlchat_room") || "default";
    this.elements.roomSelect.value = savedRoom;

    this.updateWelcome();
    this.setupEventListeners();

    // Initialize managers
    await this.notificationManager.init();

    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    // Set initial sound toggle state
    const soundsEnabled = this.soundManager.isSoundEnabled();
    const soundToggle = this.elements.soundToggle;
    const soundOnIcon = soundToggle.querySelector('.sound-on-icon');
    const soundOffIcon = soundToggle.querySelector('.sound-off-icon');

    if (soundsEnabled) {
      soundOnIcon.style.display = 'inline';
      soundOffIcon.style.display = 'none';
      soundToggle.classList.remove('muted');
    } else {
      soundOnIcon.style.display = 'none';
      soundOffIcon.style.display = 'inline';
      soundToggle.classList.add('muted');
    }

    // Start the app
    await this.fetchMessages(true);
    this.scheduleNextRefresh(15000);
    this.elements.input.focus();

    // Set up activity tracking and heartbeat
    this.setupActivityTracking();
    setTimeout(() => this.scheduleHeartbeat(), 60000);
  }

  setupEventListeners() {
    // Send message events
    this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
    this.elements.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Room change
    this.elements.roomSelect.addEventListener('change', () => this.changeRoom());

    // Page visibility
    document.addEventListener('visibilitychange', () => {
      this.isVisible = !document.hidden;

      if (this.isVisible) {
        this.fetchMessages(true);
        this.scheduleNextRefresh(15000);
      } else {
        this.scheduleNextRefresh(60000);
      }
    });

    // Activity tracking
    ['click', 'keypress', 'scroll', 'mousemove'].forEach(event => {
      document.addEventListener(event, () => {
        this.lastActivity = Date.now();
      }, { passive: true });
    });

    // Enter key focus
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && document.activeElement !== this.elements.input && e.target.tagName !== 'BUTTON') {
        this.elements.input.focus();
      }
    });

    // Window unload
    window.addEventListener('beforeunload', () => this.leaveRoom());

    // Sound toggle
    this.elements.soundToggle.addEventListener('click', () => this.toggleSounds());
  }

  setupActivityTracking() {
    // Activity tracking for smart refresh
    ['click', 'keypress', 'scroll', 'mousemove'].forEach(event => {
      document.addEventListener(event, () => {
        this.lastActivity = Date.now();
      }, { passive: true });
    });
  }

  updateWelcome() {
    this.elements.welcomeDiv.innerHTML = `Welcome to HTMLChat Enhanced, <b>${this.user}</b>! You are now in room <b>${this.elements.roomSelect.value}</b>.`;
  }

  updateStatus(connected) {
    const dot = document.getElementById("status-dot");
    const text = document.getElementById("status-text");

    if (connected) {
      dot.className = "status-dot";
      text.textContent = "Connected";
    } else {
      dot.className = "status-dot disconnected";
      text.textContent = "Disconnected";
    }
  }

  updateUserList(users = null, userCount = null) {
    if (users && Array.isArray(users)) {
      document.getElementById("user-count").textContent = userCount || users.length;
      this.elements.usersDiv.innerHTML = users.map(u =>
        `<div class="user-item${this.modTools.isModerator(u) ? ' moderator' : ''}" 
             style="color:${this.messageRenderer.getUserColor(u)}" 
             data-user="${u}"
             ondblclick="app.pmManager.openPrivateMessage('${u}')">${u}</div>`
      ).join('');
    } else {
      // Fallback to fake users
      const fakeUsers = [this.user, "ChatBot", "Guest123"];
      document.getElementById("user-count").textContent = fakeUsers.length;
      this.elements.usersDiv.innerHTML = fakeUsers.map(u =>
        `<div class="user-item" style="color:${this.messageRenderer.getUserColor(u)}">${u}</div>`
      ).join('');
    }
  }

  scrollToBottom() {
    this.elements.chatBox.scrollTop = this.elements.chatBox.scrollHeight;
  }

  async fetchMessages(forceRefresh = false) {
    try {
      if (!forceRefresh) {
        const cached = this.loadFromStorage(`htmlchat_${this.elements.roomSelect.value}`);
        if (cached && Array.isArray(cached)) {
          this.elements.chatBox.innerHTML = this.messageRenderer.renderMessages(cached);
          this.scrollToBottom();
        }
      }

      const res = await fetch(`${this.baseURL}/chat/${this.elements.roomSelect.value}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      console.log('Received data:', data);

      const messages = data.messages || [];
      const users = data.users || [];
      const userCount = data.userCount || users.length;

      // Check for new messages for notifications and update stored message IDs
      const lastMessageCount = this.loadFromStorage(`htmlchat_${this.elements.roomSelect.value}_count`) || 0;
      if (messages.length > lastMessageCount && !this.isVisible && lastMessageCount > 0) {
        const newMessages = messages.slice(lastMessageCount);
        newMessages.forEach(msg => {
          if (msg.user !== this.user) {
            this.notificationManager.showNotification(msg.user, msg.text);
            this.soundManager.playSound('message');
          }
        });
      }
      this.saveToStorage(`htmlchat_${this.elements.roomSelect.value}_count`, messages.length);

      // Store messages with proper IDs for deletion
      this.elements.chatBox.innerHTML = this.messageRenderer.renderMessages(messages);
      this.scrollToBottom();

      this.updateUserList(users, userCount);

      this.saveToStorage(`htmlchat_${this.elements.roomSelect.value}`, messages);
      this.saveToStorage("htmlchat_messages", messages);
      this.updateStatus(true);
    } catch (e) {
      console.error("Fetch failed:", e);
      this.updateStatus(false);

      if (this.elements.chatBox.innerHTML === '') {
        this.elements.chatBox.innerHTML = `
          <div class="msg system">
            <span class="time">[--:--]</span>
            <span class="user">*** System ***</span>
            <span class="text">Unable to connect to server. Please check your connection.</span>
          </div>
        `;
      }
    }
  }

  async sendMessage() {
    const messageText = this.elements.input.value.trim();
    if (!messageText) return;

    this.elements.sendBtn.disabled = true;
    this.elements.sendBtn.textContent = "...";

    try {
      let finalMessage = messageText;

      // Add reply reference if replying
      if (this.currentReplyTo) {
        finalMessage = `@reply:${this.currentReplyTo.id}:${this.currentReplyTo.user}: ${messageText}`;
        this.cancelReply();
      }

      // Generate message ID for tracking
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const room = this.elements.roomSelect.value;
      const res = await fetch(`${this.baseURL}/chat/${room}?user=${encodeURIComponent(this.user)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: finalMessage, messageId }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`${res.status}: ${errorText}`);
      }

      this.elements.input.value = "";

      // Play send sound
      this.soundManager.playSound('message');

      // Fetch new messages
      await this.fetchMessages(true);
      this.scheduleNextRefresh(15000);

    } catch (e) {
      console.error("Send failed:", e);

      if (e.message.includes('403')) {
        alert("Message blocked: " + e.message.split(': ')[1]);
      } else {
        alert("Message failed to send. Please try again.");
      }

      this.updateStatus(false);
    } finally {
      this.elements.sendBtn.disabled = false;
      this.elements.sendBtn.textContent = "Send";
      this.elements.input.focus();
    }
  }

  async changeRoom() {
    // Clear current timers
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    // Leave current room
    const oldRoom = this.loadFromStorage("htmlchat_room") || "default";
    if (oldRoom !== this.elements.roomSelect.value) {
      try {
        await fetch(`${this.baseURL}/chat/${oldRoom}?user=${encodeURIComponent(this.user)}`, {
          method: "DELETE"
        });
      } catch (e) {
        console.warn("Failed to leave room:", e);
      }
    }

    this.saveToStorage("htmlchat_room", this.elements.roomSelect.value);
    this.updateWelcome();
    this.elements.chatBox.innerHTML = '<div class="msg system"><span class="time">[--:--]</span><span class="user">*** System ***</span><span class="text">Loading messages...</span></div>';

    this.lastMessageTime = 0;
    this.lastFetchTime = 0;

    await this.fetchMessages(true);
    this.scheduleNextRefresh(15000);
  }

  scheduleNextRefresh(delay = 20000) {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!this.isVisible) {
      delay = Math.min(delay * 3, 60000);
    }

    this.refreshTimer = setTimeout(async () => {
      await this.fetchMessages();
      this.scheduleNextRefresh(this.isVisible ? 20000 : 45000);
    }, delay);
  }

  async sendHeartbeat() {
    try {
      await fetch(`${this.baseURL}/chat/${this.elements.roomSelect.value}?user=${encodeURIComponent(this.user)}`, {
        method: "PUT"
      });
    } catch (e) {
      console.warn("Heartbeat failed:", e);
    }
  }

  scheduleHeartbeat() {
    setTimeout(async () => {
      const timeSinceActivity = Date.now() - this.lastActivity;
      if (this.isVisible && timeSinceActivity < 300000) {
        await this.sendHeartbeat();
      }
      this.scheduleHeartbeat();
    }, 120000);
  }

  async leaveRoom() {
    const url = `${this.baseURL}/chat/${this.elements.roomSelect.value}?user=${encodeURIComponent(this.user)}`;
    try {
      navigator.sendBeacon(url, JSON.stringify({ method: 'DELETE' }));
    } catch (e) {
      fetch(url, { method: 'DELETE', keepalive: true }).catch(() => { });
    }
  }

  // Reply functionality
  setReplyTo(messageId, user, text) {
    const displayUser = user || "Unknown"; // fallback just in case
    this.currentReplyTo = { id: messageId, user: displayUser, text };

    this.elements.replyPreview.style.display = 'flex';
    this.elements.replyPreview.querySelector('.reply-text').textContent =
      `${displayUser}: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`;

    this.elements.input.focus();
  }


  cancelReply() {
    this.currentReplyTo = null;
    this.elements.replyPreview.style.display = 'none';
  }

  toggleSounds() {
    const isEnabled = this.soundManager.toggleSounds();
    const soundToggle = this.elements.soundToggle;

    // Update icons
    const soundOnIcon = soundToggle.querySelector('.sound-on-icon');
    const soundOffIcon = soundToggle.querySelector('.sound-off-icon');

    if (isEnabled) {
      soundOnIcon.style.display = 'inline';
      soundOffIcon.style.display = 'none';
      soundToggle.classList.remove('muted');
    } else {
      soundOnIcon.style.display = 'none';
      soundOffIcon.style.display = 'inline';
      soundToggle.classList.add('muted');
    }
  }
}

// Global functions for HTML onclick handlers
window.app = null;

window.openSearchModal = () => app.searchManager.openModal();
window.closeSearchModal = () => app.searchManager.closeModal();
window.openUploadModal = () => app.fileManager.openModal();
window.closeUploadModal = () => app.fileManager.closeModal();
window.cancelReply = () => app.cancelReply();
window.toggleSounds = () => app.toggleSounds();
window.exportChat = () => exportChat();
window.requestNotificationPermission = () => app.notificationManager.requestPermission();
window.dismissNotificationBanner = () => app.notificationManager.dismissBanner();
window.showNotificationSettings = () => app.notificationManager.showSettings();

// Export chat function
window.exportChat = function () {
  const messages = app.loadFromStorage("htmlchat_messages") || [];
  if (messages.length === 0) {
    alert("No messages to export.");
    return;
  }

  const exportData = {
    room: app.elements.roomSelect.value,
    exported: new Date().toISOString(),
    messages: messages
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `htmlchat-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.app = new HTMLChatApp();
});