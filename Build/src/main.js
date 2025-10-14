// Import modules
import { SoundManager } from "./soundManager.js";
import {
  Volume2, VolumeX, Search, Reply, Trash2, Mail, UserX, Ban, X,
  Folder, Paperclip, Bell, Image, Music, FileText, Settings
} from 'lucide';
import { MessageRenderer } from "./messageRenderer.js";
import { PrivateMessageManager } from "./privateMessages.js";
import { FileUploadManager } from "./fileUpload.js";
import { SearchManager } from "./search.js";
import { NotificationManager } from "./notifications.js";
import { ContextMenuManager } from "./contextMenu.js";
import { ModeratorTools } from "./moderatorTools.js";

// WebCrypto-based encrypt/decrypt helpers for sensitive values
async function getKeyFromPassphrase(passphrase, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 50000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptData(plain, passphrase) {
  const encoder = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const key = await getKeyFromPassphrase(passphrase, salt);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plain)
  );
  // Return salt + iv + ciphertext as Base64
  const dataBuffer = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  dataBuffer.set(salt, 0);
  dataBuffer.set(iv, salt.length);
  dataBuffer.set(new Uint8Array(ciphertext), salt.length + iv.length);
  return btoa(String.fromCharCode.apply(null, dataBuffer));
}

async function decryptData(data_b64, passphrase) {
  const raw = Uint8Array.from(atob(data_b64), c => c.charCodeAt(0));
  const salt = raw.slice(0, 16);
  const iv = raw.slice(16, 28);
  const ciphertext = raw.slice(28);
  const key = await getKeyFromPassphrase(passphrase, salt);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}

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

    // Icon mappings for lucide
    this.icons = {
      'volume-2': Volume2,
      'volume-x': VolumeX,
      'search': Search,
      'reply': Reply,
      'trash-2': Trash2,
      'mail': Mail,
      'user-x': UserX,
      'ban': Ban,
      'x': X,
      'folder': Folder,
      'paperclip': Paperclip,
      'bell': Bell,
      'image': Image,
      'music': Music,
      'file-text': FileText,
      'settings': Settings
    };

    // Initialize managers
    this.soundManager = new SoundManager();
    this.messageRenderer = new MessageRenderer(this);
    this.pmManager = new PrivateMessageManager(this);
    this.fileManager = new FileUploadManager(this);
    this.searchManager = new SearchManager(this);
    this.notificationManager = new NotificationManager(this);
    this.contextMenu = new ContextMenuManager(this);
    this.modTools = new ModeratorTools(this);

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

  // Helper method to create lucide icons
  createIcon(iconName, options = {}) {
    const IconComponent = this.icons[iconName];
    if (!IconComponent) {
      console.warn(`Icon "${iconName}" not found`);
      return null;
    }

    const size = options.size || 16;
    const strokeWidth = options.strokeWidth || 2;

    // Create SVG element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', strokeWidth);
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    // Add paths from the icon component
    IconComponent.forEach(pathData => {
      if (pathData && pathData[0] === 'path') {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData[1].d || '');
        svg.appendChild(path);
      } else if (pathData && pathData[0] === 'circle') {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', pathData[1].cx || '');
        circle.setAttribute('cy', pathData[1].cy || '');
        circle.setAttribute('r', pathData[1].r || '');
        svg.appendChild(circle);
      } else if (pathData && pathData[0] === 'line') {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', pathData[1].x1 || '');
        line.setAttribute('y1', pathData[1].y1 || '');
        line.setAttribute('x2', pathData[1].x2 || '');
        line.setAttribute('y2', pathData[1].y2 || '');
        svg.appendChild(line);
      }
    });

    if (options.className) {
      svg.setAttribute('class', options.className);
    }

    if (options.style) {
      Object.assign(svg.style, options.style);
    }

    return svg;
  }

  // Security utility to escape HTML
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize all icons in the DOM
  initializeIcons() {
    // Find all elements with data-lucide attributes and replace them
    const elementsWithIcons = document.querySelectorAll('[data-lucide]');
    elementsWithIcons.forEach(element => {
      const iconName = element.getAttribute('data-lucide');
      const existingStyles = {
        width: element.style.width || '16px',
        height: element.style.height || '16px'
      };

      const iconElement = this.createIcon(iconName, {
        size: parseInt(existingStyles.width) || 16,
        className: element.className,
        style: existingStyles
      });

      if (iconElement) {
        element.parentNode.replaceChild(iconElement, element);
      }
    });
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
      } else if (this.user.toLowerCase() === 'nellowtcs') {
        // Try to load existing moderator token
        let passphrase = prompt("Enter passphrase to unlock moderator password:");
        this._authPassphrase = passphrase;
        if (passphrase) {
          this.authToken = await this.loadFromStorage("htmlchat_auth_token", passphrase);
          // Fallback: If not found or passphrase fails, allow prompt for token (+store new encrypted)
          if (!this.authToken) {
            let pw = prompt("Enter moderator password:");
            if (pw) {
              this.authToken = pw;
              await this.saveToStorage("htmlchat_auth_token", pw, passphrase);
            }
          }
        }
      }

      // Set up room
      const savedRoom = this.loadFromStorage("htmlchat_room") || "default";
      this.elements.roomSelect.value = savedRoom;

      this.updateWelcome();
      this.setupEventListeners();

      // Initialize managers
      await this.notificationManager.init();

      // Initialize Lucide icons (npm module)
      this.initializeIcons();

      // Set initial sound toggle state
      const soundsEnabled = this.soundManager.isSoundEnabled();
      const soundToggle = this.elements.soundToggle;

      // Wait a bit for icons to initialize, then set the state
      setTimeout(() => {
        const soundOnIcon = soundToggle.querySelector('.sound-on-icon');
        const soundOffIcon = soundToggle.querySelector('.sound-off-icon');

        console.log("Initial sound state:", soundsEnabled); // Debug
        console.log("Initial icons found:", { soundOnIcon, soundOffIcon }); // Debug

        if (soundsEnabled) {
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
      }, 100); // Small delay to ensure Lucide has initialized

      // Start the app
      await this.fetchMessages(true);
      this.scheduleNextRefresh(15000);
      this.elements.input.focus();

      // Set up activity tracking and heartbeat
      this.setupActivityTracking();
      setTimeout(() => this.scheduleHeartbeat(), 60000);
    }
  }

  setupEventListeners() {
    // Send message events
    this.elements.sendBtn.addEventListener("click", () => this.sendMessage());
    this.elements.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Room change
    this.elements.roomSelect.addEventListener("change", () =>
      this.changeRoom()
    );

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
        this.elements.input.focus();
      }
    });

    // Window unload
    window.addEventListener("beforeunload", () => this.leaveRoom());

    // Sound toggle
    this.elements.soundToggle.addEventListener("click", () =>
      this.toggleSounds()
    );
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

  attachMessageEventListeners() {
    // Add context menu event listeners for messages
    const messages = this.elements.chatBox.querySelectorAll('.msg');
    messages.forEach(msgEl => {
      msgEl.addEventListener('contextmenu', (e) => {
        this.contextMenu.show(e, msgEl);
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
    // Clear existing content
    this.elements.welcomeDiv.innerHTML = '';

    // Create text node with safe content
    const welcomeText = document.createTextNode('Welcome to HTMLChat, ');
    const userBold = document.createElement('b');
    userBold.textContent = this.user;
    const middleText = document.createTextNode('! You are now in room ');
    const roomBold = document.createElement('b');
    roomBold.textContent = this.elements.roomSelect.value;
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
      const fakeUsers = [this.user, "ChatBot", "Guest123"];
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
        if (cached && Array.isArray(cached)) {
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
      const lastMessageCount =
        this.loadFromStorage(
          `htmlchat_${this.elements.roomSelect.value}_count`
        ) || 0;
      if (
        messages.length > lastMessageCount &&
        !this.isVisible &&
        lastMessageCount > 0
      ) {
        const newMessages = messages.slice(lastMessageCount);
        newMessages.forEach((msg) => {
          if (msg.user !== this.user) {
            this.notificationManager.showNotification(msg.user, msg.text);
            this.soundManager.playSound("message");
          }
        });
      }
      this.saveToStorage(
        `htmlchat_${this.elements.roomSelect.value}_count`,
        messages.length
      );

      // Store messages with proper IDs for deletion
      this.elements.chatBox.innerHTML =
        this.messageRenderer.renderMessages(messages);
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
      if (e.message.includes('Failed to fetch')) {
        console.error('Network error - possible CORS or connectivity issue');
        console.error('Current URL:', `${this.baseURL}/chat/${this.elements.roomSelect.value}`);
        console.error('Expected Worker URL format: https://your-worker.your-subdomain.workers.dev');
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

      if (e.message.includes("403")) {
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

    console.log("Sound toggle clicked, enabled:", isEnabled); // Debug

    // Update icons 
    const soundOnIcon = soundToggle.querySelector('.sound-on-icon');
    const soundOffIcon = soundToggle.querySelector('.sound-off-icon');

    console.log("Found icons:", { soundOnIcon, soundOffIcon }); // Debug

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
      console.log("Showing sound ON icon"); // Debug
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
      console.log("Showing sound OFF icon"); // Debug
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
