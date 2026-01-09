// Import modules
import { SoundManager } from "./soundManager.js";
import { MessageRenderer } from "./messageRenderer.js";
import { PrivateMessageManager } from "./privateMessages.js";
import { FileUploadManager } from "./fileUpload.js";
import { SearchManager } from "./search.js";
import { NotificationManager } from "./notifications.js";
import { ContextMenuManager } from "./contextMenu.js";
import { ModeratorTools } from "./moderatorTools.js";
import { createIconHTML } from "./iconHelper.js"
import { getKeyFromPassphrase, encryptData, decryptData } from "./securityHelper.js";

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
    this.initialLoad = true;

    // Initialize managers to null (will be created in init)
    this.soundManager = null;
    this.messageRenderer = null;
    this.pmManager = null;
    this.fileManager = null;
    this.searchManager = null;
    this.notificationManager = null;
    this.contextMenu = null;
    this.modTools = null;

    // Server-side moderator status (authoritative)
    this.serverIsModerator = false;

    // DOM elements
    this.elements = {
      roomSelect: document.getElementById("room-select"),
      welcomeDiv: document.getElementById("welcome"),
      chatBox: document.getElementById("chat"),
      input: document.getElementById("msg"),
      sendBtn: document.getElementById("send-btn"),
      usersDiv: document.getElementById("users"),
      replyPreview: document.getElementById("reply-preview"),
      soundToggle: document.getElementById("sound-toggle"),
    };

    this.init();
  }

  // Initialize all icons in the DOM
  initializeIcons() {
    const nodes = document.querySelectorAll('[data-lucide]');
    for (const node of nodes) {
      const iconName = node.getAttribute('data-lucide');
      // Gather all classes except 'context-icon' (which may be replaced anyway)
      let classes = node.className ? node.className.split(' ') : [];
      // Always add 'context-icon' if present
      const classString = classes.join(' ').trim();
      // Inline styles (including display:none, inline widths, etc)
      const styleString = node.getAttribute('style') || '';
      const width = node.getAttribute('width') || 16;

      const svgHTML = createIconHTML(iconName, {
        size: width,
        class: classString,
        style: styleString
      });
      node.outerHTML = svgHTML;
    }
  }

  // Simple storage helpers
  async saveToStorage(key, data, passphrase = null) {
    try {
      if (key === "htmlchat_auth_token") {
        // Encrypt sensitive token with passphrase before storage
        if (!passphrase) throw new Error("Missing passphrase for sensitive storage");
        const encrypted = await encryptData(data, passphrase);
        localStorage.setItem(key, JSON.stringify({ encrypted: encrypted }));
      } else {
        localStorage.setItem(key, JSON.stringify(data));
      }
    } catch (e) {
      console.warn("Storage failed:", e);
    }
  }

  async loadFromStorage(key, passphrase = null) {
    try {
      const data = localStorage.getItem(key);
      if (key === "htmlchat_auth_token" && data && passphrase) {
        const obj = JSON.parse(data);
        if (obj && obj.encrypted) {
          try {
            return await decryptData(obj.encrypted, passphrase);
          } catch (de) {
            console.warn("Failed to decrypt auth token:", de);
            return null;
          }
        }
        return null;
      } else {
        return data ? JSON.parse(data) : null;
      }
    } catch (e) {
      console.warn("Load failed:", e);
      return null;
    }
  }

  async init() {
    // Get or prompt for username
    this.user = await this.loadFromStorage("htmlchat_user");
    this.authToken = null;
    this._authPassphrase = null;

    // Only prompt if no stored user; otherwise keep stored username.
    if (!this.user) {
      do {
        this.user = prompt("Enter your nickname:") || "";
        this.user = this.user.trim().substring(0, 20);
      } while (!this.user);
      await this.saveToStorage("htmlchat_user", this.user);

      // If user is NellowTCS, prompt for moderator password & passphrase to encrypt
      if (this.user.toLowerCase() === 'nellowtcs') {
        let pw = prompt("Enter moderator password:");
        if (pw) {
          // Ask for a passphrase to encrypt the saved token (can use same value for simplicity)
          let passphrase = prompt("Provide a passphrase to protect your moderator token:", "");
          if (!passphrase) passphrase = pw; // fallback for less friction
          this._authPassphrase = passphrase;
          this.authToken = pw;
          await this.saveToStorage("htmlchat_auth_token", this.authToken, this._authPassphrase);
        }
      }
    } else {
      // If stored user is nellowtcs, attempt to load auth token if passphrase is available
      if (this.user.toLowerCase() === 'nellowtcs') {
        // Try to load existing moderator token (non-blocking)
        try {
          const passphrase = prompt("Enter passphrase to unlock moderator password (or leave blank):");
          this._authPassphrase = passphrase || null;
          if (passphrase) {
            this.authToken = await this.loadFromStorage("htmlchat_auth_token", passphrase);
          }
        } catch (e) {
          // ignore
        }
      }
    }

    // Set up room (always)
    const savedRoom = (await this.loadFromStorage("htmlchat_room")) || "default";
    if (this.elements.roomSelect) this.elements.roomSelect.value = savedRoom;

    this.updateWelcome();
    this.setupEventListeners();

    // Initialize managers (always)
    this.soundManager = new SoundManager();
    this.messageRenderer = new MessageRenderer(this);
    this.pmManager = new PrivateMessageManager(this);
    this.fileManager = new FileUploadManager(this);
    this.searchManager = new SearchManager(this);
    this.notificationManager = new NotificationManager(this);
    this.contextMenu = new ContextMenuManager(this);
    this.modTools = new ModeratorTools(this);

    // Initialize notification manager (it checks Notification API)
    await this.notificationManager.init();

    // Initialize Lucide icons (npm module)
    this.initializeIcons();

    // Set initial sound toggle state
    const soundsEnabled = this.soundManager.isSoundEnabled();
    const soundToggle = this.elements.soundToggle;

    // Wait a bit for icons to initialize, then set the state
    setTimeout(() => {
      const soundOnIcon = soundToggle && soundToggle.querySelector('.sound-on-icon');
      const soundOffIcon = soundToggle && soundToggle.querySelector('.sound-off-icon');

      if (soundsEnabled) {
        if (soundOnIcon) {
          soundOnIcon.style.display = "inline";
          soundOnIcon.style.visibility = "visible";
        }
        if (soundOffIcon) {
          soundOffIcon.style.display = "none";
          soundOffIcon.style.visibility = "hidden";
        }
        soundToggle && soundToggle.classList.remove("muted");
      } else {
        if (soundOnIcon) {
          soundOnIcon.style.display = "none";
          soundOnIcon.style.visibility = "hidden";
        }
        if (soundOffIcon) {
          soundOffIcon.style.display = "inline";
          soundOffIcon.style.visibility = "visible";
        }
        soundToggle && soundToggle.classList.add("muted");
      }
    }, 100); // Small delay to ensure Lucide has initialized

    // Start the app
    try {
      await this.fetchMessages(true);
    } catch (e) {
      console.warn('Initial fetchMessages failed:', e);
    }
    this.scheduleNextRefresh(15000);
    this.elements.input && this.elements.input.focus();

    // Set up activity tracking and heartbeat
    this.setupActivityTracking();
    setTimeout(() => this.scheduleHeartbeat(), 60000);
  }

  setupEventListeners() {
    // Send message events
    if (this.elements.sendBtn) {
      this.elements.sendBtn.addEventListener("click", () => this.sendMessage());
    }
    if (this.elements.input) {
      this.elements.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
    }

    // Room change
    if (this.elements.roomSelect) {
      this.elements.roomSelect.addEventListener("change", () =>
        this.changeRoom()
      );
    }

    // Page visibility
    document.addEventListener("visibilitychange", () => {
      this.isVisible = !document.hidden;

      if (this.isVisible) {
        this.fetchMessages(true);
        this.scheduleNextRefresh(15000);
      } else {
        this.scheduleNextRefresh(60000);
      }
    });

    // Activity tracking
    ["click", "keypress", "scroll", "mousemove"].forEach((event) => {
      document.addEventListener(
        event,
        () => {
          this.lastActivity = Date.now();
        },
        { passive: true }
      );
    });

    // Enter key focus
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Enter" &&
        document.activeElement !== this.elements.input &&
        e.target.tagName !== "BUTTON"
      ) {
        this.elements.input && this.elements.input.focus();
      }
    });

    // Window unload
    window.addEventListener("beforeunload", () => this.leaveRoom());

    // Sound toggle
    if (this.elements.soundToggle) {
      this.elements.soundToggle.addEventListener("click", () =>
        this.toggleSounds()
      );
    }
  }

  setupActivityTracking() {
    // Activity tracking for smart refresh
    ["click", "keypress", "scroll", "mousemove"].forEach((event) => {
      document.addEventListener(
        event,
        () => {
          this.lastActivity = Date.now();
        },
        { passive: true }
      );
    });
  }

  addLongPressListener(target, callback, duration = 500) {
    let timer = null;
    let startX = 0, startY = 0;

    target.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      timer = setTimeout(() => {
        // Prevent system context menu (copy/paste/share)
        e.preventDefault();
        callback({
          clientX: startX,
          clientY: startY,
          preventDefault: () => e.preventDefault(),
          originalEvent: e
        }, target);
      }, duration);
    }, { passive: false });

    ['touchend', 'touchmove', 'touchcancel'].forEach(evt => {
      target.addEventListener(evt, function (e) {
        clearTimeout(timer);
        timer = null;
      });
    });

    // Block browser's contextmenu (system) on this element on all platforms 
    // (it does show up if you hold for longer (must mean I'm doing something wrong haha, but not complaining))
    target.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });
  }

  attachMessageEventListeners() {
    if (!this.elements.chatBox) return;
    const messages = this.elements.chatBox.querySelectorAll('.msg');
    messages.forEach(msgEl => {
      // Desktop: right-click (we show AND block default)
      msgEl.addEventListener('contextmenu', (e) => {
        e.preventDefault(); // Block browser's menu
        this.contextMenu.show(e, msgEl);
      });
      // Mobile: long-press (we show AND block default)
      this.addLongPressListener(msgEl, (touchEvent, el) => {
        this.contextMenu.show(touchEvent, el);
      });
    });

    // Add click event listeners for reply references
    const replyRefs = this.elements.chatBox.querySelectorAll('.reply-reference');
    replyRefs.forEach(replyEl => {
      replyEl.addEventListener('click', () => {
        const messageId = replyEl.getAttribute('data-message-id');
        if (messageId) {
          this.messageRenderer.jumpToMessage(messageId);
        }
      });
    });

    // Add double-click event listeners for user spans to open private messages
    const userSpans = this.elements.chatBox.querySelectorAll('.user');
    userSpans.forEach(userSpan => {
      userSpan.addEventListener('dblclick', () => {
        const user = userSpan.getAttribute('data-user');
        if (user && user !== this.user) {
          this.pmManager.openPrivateMessage(user);
        }
      });
    });

    // Add click event listeners for clickable images
    const images = this.elements.chatBox.querySelectorAll('.clickable-image');
    images.forEach(img => {
      img.addEventListener('click', () => {
        const url = img.getAttribute('data-url');
        if (url && this.isValidUrl(url)) {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      });
    });
  }

  // URL validation helper
  isValidUrl(string) {
    try {
      const url = new URL(string);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  updateWelcome() {
    if (!this.elements.welcomeDiv) return;
    // Clear existing content
    this.elements.welcomeDiv.innerHTML = '';

    // Create text node with safe content
    const welcomeText = document.createTextNode('Welcome to HTMLChat, ');
    const userBold = document.createElement('b');
    userBold.textContent = this.user || 'Guest';
    const middleText = document.createTextNode('! You are now in room ');
    const roomBold = document.createElement('b');
    roomBold.textContent = this.elements.roomSelect ? this.elements.roomSelect.value : 'default';
    const endText = document.createTextNode('.');

    // Append all elements
    this.elements.welcomeDiv.appendChild(welcomeText);
    this.elements.welcomeDiv.appendChild(userBold);
    this.elements.welcomeDiv.appendChild(middleText);
    this.elements.welcomeDiv.appendChild(roomBold);
    this.elements.welcomeDiv.appendChild(endText);
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
      document.getElementById("user-count").textContent =
        userCount || users.length;

      // Create a document fragment for efficient DOM manipulation
      const fragment = document.createDocumentFragment();

      // Create user items programmatically
      users.forEach((u) => {
        const userDiv = document.createElement('div');
        userDiv.classList.add('user-item');
        if (this.modTools.isModerator(u)) {
          userDiv.classList.add('moderator');
        }
        userDiv.style.color = this.messageRenderer.getUserColor(u);
        userDiv.dataset.user = u;
        userDiv.textContent = u;

        // Add event listener instead of inline handler
        userDiv.addEventListener('dblclick', () => {
          this.pmManager.openPrivateMessage(u);
        });

        fragment.appendChild(userDiv);
      });

      // Replace usersDiv contents efficiently
      this.elements.usersDiv.innerHTML = '';
      this.elements.usersDiv.appendChild(fragment);
    } else {
      // Fallback to fake users
      const fakeUsers = [this.user || 'Guest', "ChatBot", "Guest123"];
      document.getElementById("user-count").textContent = fakeUsers.length;

      // Create a document fragment for efficient DOM manipulation
      const fragment = document.createDocumentFragment();

      // Create fake user items programmatically
      fakeUsers.forEach((u) => {
        const userDiv = document.createElement('div');
        userDiv.classList.add('user-item');
        userDiv.style.color = this.messageRenderer.getUserColor(u);
        userDiv.textContent = u;

        fragment.appendChild(userDiv);
      });

      // Replace usersDiv contents efficiently
      this.elements.usersDiv.innerHTML = '';
      this.elements.usersDiv.appendChild(fragment);
    }
  }

  // Helper to get auth headers for moderator actions
  getAuthHeaders(includeContentType = false) {
    const headers = {};

    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.user && this.user.toLowerCase() === 'nellowtcs' && this.authToken) {
      headers['X-Auth-Token'] = this.authToken;
      headers['X-Auth-User'] = this.user;
      console.log('Adding auth headers:', { user: this.user, hasToken: !!this.authToken, includeContentType });
    } else {
      console.log('No auth headers added:', {
        user: this.user,
        isNellowTCS: this.user && this.user.toLowerCase() === 'nellowtcs',
        hasToken: !!this.authToken
      });
    }

    return headers;
  }

  scrollToBottom() {
    this.elements.chatBox.scrollTop = this.elements.chatBox.scrollHeight;
  }

  async fetchMessages(forceRefresh = false) {
    try {
      if (!forceRefresh) {
        const cached = this.loadFromStorage(
          `htmlchat_${this.elements.roomSelect.value}`
        );
        if (cached && Array.isArray(cached) && this.messageRenderer) {
          this.elements.chatBox.innerHTML =
            this.messageRenderer.renderMessages(cached);
          this.scrollToBottom();
          // Attach event listeners for cached content
          this.attachMessageEventListeners();
        }
      }

      const url = `${this.baseURL}/chat/${this.elements.roomSelect.value}`;
      const headers = this.getAuthHeaders(false); // No Content-Type for GET requests

      console.log('Fetching messages:', { url, headers });

      const res = await fetch(url, { headers });

      console.log('Fetch response:', {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers.entries())
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

      const data = await res.json();
      console.log("Received data:", data);

      const messages = data.messages || [];
      const users = data.users || [];
      const userCount = data.userCount || users.length;

      // Store server's moderator status for current user
      if (typeof data.isModerator === 'boolean') {
        this.serverIsModerator = data.isModerator;
        console.log('Server moderator status:', this.serverIsModerator);
      }

      // Check for new messages for notifications and update stored message IDs
      // Load last message time (default 0 for first load)
      const lastMessageTime = this.loadFromStorage(`htmlchat_${this.elements.roomSelect.value}_last_time`) || 0;

      // Check for new messages after initial load
      if (!this.initialLoad && messages.length > 0) {
        const latestTime = Math.max(...messages.map(m => m.time || 0));
        if (latestTime > lastMessageTime) {
          // Find and notify for messages newer than lastMessageTime
          const newMessages = messages.filter(m => (m.time || 0) > lastMessageTime);
          newMessages.forEach((msg) => {
            if (msg.user !== this.user) {
              this.notificationManager.showNotification(msg.user, msg.text);
              this.soundManager.playSound("message");
            }
          });
        }
      }

      // Update last message time to the latest
      if (messages.length > 0) {
        const latestTime = Math.max(...messages.map(m => m.time || 0));
        this.saveToStorage(`htmlchat_${this.elements.roomSelect.value}_last_time`, latestTime);
      }

      // Mark as loaded
      this.initialLoad = false;

      this.saveToStorage(
        `htmlchat_${this.elements.roomSelect.value}_count`,
        messages.length
      );

      // Store messages with proper IDs for deletion
      if (this.messageRenderer) {
        this.elements.chatBox.innerHTML =
          this.messageRenderer.renderMessages(messages);
      } else {
        // graceful fallback
        this.elements.chatBox.innerHTML = '<div class="msg system"><span class="time">[--:--]</span><span class="user">*** System ***</span><span class="text">Messages loaded (renderer missing)</span></div>';
      }
      this.scrollToBottom();

      // Re-initialize Lucide icons for new messages
      this.initializeIcons();

      // Attach secure event listeners for interactive elements
      this.attachMessageEventListeners();

      this.updateUserList(users, userCount);

      this.saveToStorage(
        `htmlchat_${this.elements.roomSelect.value}`,
        messages
      );
      this.saveToStorage("htmlchat_messages", messages);
      this.updateStatus(true);
    } catch (e) {
      console.error("Fetch failed:", e);
      console.error("Error details:", {
        name: e.name,
        message: e.message,
        stack: e.stack,
        cause: e.cause
      });

      // Check if it's a network error vs server error
      if (e.message && e.message.includes('Failed to fetch')) {
        console.error('Network error - possible CORS or connectivity issue');
        console.error('Current URL:', `${this.baseURL}/chat/${this.elements.roomSelect.value}`);
      }

      this.updateStatus(false);

      if (this.elements.chatBox.innerHTML === "") {
        // Create system error message safely
        const errorDiv = document.createElement('div');
        errorDiv.className = 'msg system';

        const timeSpan = document.createElement('span');
        timeSpan.className = 'time';
        timeSpan.textContent = '[--:--]';

        const userSpan = document.createElement('span');
        userSpan.className = 'user';
        userSpan.textContent = '*** System ***';

        const textSpan = document.createElement('span');
        textSpan.className = 'text';
        textSpan.textContent = 'Unable to connect to server. Please check your connection.';

        errorDiv.appendChild(timeSpan);
        errorDiv.appendChild(userSpan);
        errorDiv.appendChild(textSpan);

        this.elements.chatBox.innerHTML = '';
        this.elements.chatBox.appendChild(errorDiv);
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
      const messageId = `msg_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const room = this.elements.roomSelect.value;
      const res = await fetch(
        `${this.baseURL}/chat/${room}?user=${encodeURIComponent(this.user)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: finalMessage, messageId }),
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`${res.status}: ${errorText}`);
      }

      this.elements.input.value = "";

      // Play send sound
      this.soundManager.playSound("message");

      // Fetch new messages
      await this.fetchMessages(true);
      this.scheduleNextRefresh(15000);
    } catch (e) {
      console.error("Send failed:", e);

      if (e.message && e.message.includes("403")) {
        alert("Message blocked: " + e.message.split(": ")[1]);
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
        await fetch(
          `${this.baseURL}/chat/${oldRoom}?user=${encodeURIComponent(
            this.user
          )}`,
          {
            method: "DELETE",
          }
        );
      } catch (e) {
        console.warn("Failed to leave room:", e);
      }
    }

    this.saveToStorage("htmlchat_room", this.elements.roomSelect.value);
    this.updateWelcome();
    this.elements.chatBox.innerHTML =
      '<div class="msg system"><span class="time">[--:--]</span><span class="user">*** System ***</span><span class="text">Loading messages...</span></div>';

    this.lastMessageTime = 0;
    this.lastFetchTime = 0;

    await this.fetchMessages(true);
    this.scheduleNextRefresh(15000);
  }

  // Manually trigger a refresh from UI
  async manualRefresh() {
    try {
      // cancel any pending timer so we don't double-fetch
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
      }
      // force fetch latest
      await this.fetchMessages(true);
      // schedule next automatic refresh
      this.scheduleNextRefresh(15000);
    } catch (e) {
      console.error('Manual refresh failed:', e);
    }
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
      await fetch(
        `${this.baseURL}/chat/${this.elements.roomSelect.value
        }?user=${encodeURIComponent(this.user)}`,
        {
          method: "PUT",
        }
      );
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
    const url = `${this.baseURL}/chat/${this.elements.roomSelect.value
      }?user=${encodeURIComponent(this.user)}`;
    try {
      await fetch(url, { method: "DELETE", keepalive: true });
    } catch (e) {
      // Fallback: try again without awaiting in case of network issues
      fetch(url, { method: "DELETE", keepalive: true }).catch(() => { });
    }
  }

  // Reply functionality
  setReplyTo(messageId, user, text) {
    this.currentReplyTo = { id: messageId, user, text };
    this.elements.replyPreview.style.display = "flex";
    this.elements.replyPreview.querySelector(
      ".reply-text"
    ).textContent = `${user}: ${text.substring(0, 50)}${text.length > 50 ? "..." : ""
    }`;
    this.elements.input.focus();
  }

  cancelReply() {
    this.currentReplyTo = null;
    this.elements.replyPreview.style.display = "none";
  }

  toggleSounds() {
    const isEnabled = this.soundManager.toggleSounds();
    const soundToggle = this.elements.soundToggle;

    // Update icons 
    const soundOnIcon = soundToggle.querySelector('.sound-on-icon');
    const soundOffIcon = soundToggle.querySelector('.sound-off-icon');

    if (isEnabled) {
      if (soundOnIcon) {
        soundOnIcon.style.display = "inline";
        soundOnIcon.style.visibility = "visible";
      }
      if (soundOffIcon) {
        soundOffIcon.style.display = "none";
        soundOffIcon.style.visibility = "hidden";
      }
      soundToggle.classList.remove("muted");
    } else {
      if (soundOnIcon) {
        soundOnIcon.style.display = "none";
        soundOnIcon.style.visibility = "hidden";
      }
      if (soundOffIcon) {
        soundOffIcon.style.display = "inline";
        soundOffIcon.style.visibility = "visible";
      }
      soundToggle.classList.add("muted");
    }
  }
}

// Global functions for HTML onclick handlers
window.app = null;

window.openSearchModal = () => window.app.searchManager.openModal();
window.closeSearchModal = () => window.app.searchManager.closeModal();
window.openUploadModal = () => window.app.fileManager.openModal();
window.closeUploadModal = () => window.app.fileManager.closeModal();
window.openSettingsModal = () => window.app.notificationManager.showSettings();
window.closeSettingsModal = () => window.app.notificationManager.closeSettings();
window.cancelReply = () => window.app.cancelReply();
window.toggleSounds = () => window.app?.toggleSounds();
window.requestNotificationPermission = () => window.app.notificationManager.requestPermission();
window.dismissNotificationBanner = () => window.app.notificationManager.dismissBanner();
window.showNotificationSettings = () => window.app.notificationManager.showSettings();
// Manual reload handler for status bar button
window.reloadChats = () => window.app?.manualRefresh();

// Export chat function
window.exportChat = function () {
  const messages = window.app.loadFromStorage("htmlchat_messages") || [];
  if (messages.length === 0) {
    alert("No messages to export.");
    return;
  }

  const exportData = {
    room: window.app.elements.roomSelect.value,
    exported: new Date().toISOString(),
    messages: messages,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `htmlchat-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

// Initialize app when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.app = new HTMLChatApp();
});