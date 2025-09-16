export class PrivateMessageManager {
  constructor(app) {
    this.app = app;
    this.windows = new Map();
    this.windowContainer = document.getElementById('pm-windows');
    this.windowZIndex = 1600;
  }
  
  openPrivateMessage(username) {
    if (username === this.app.user) return; // Can't PM yourself
    
    // Check if window already exists
    if (this.windows.has(username)) {
      this.bringToFront(username);
      return;
    }
    
    // Create new PM window
    const window = this.createPMWindow(username);
    this.windows.set(username, window);
    this.windowContainer.appendChild(window.element);
    
    // Load PM history
    this.loadPMHistory(username);
    
    // Focus input
    window.input.focus();
  }
  
  createPMWindow(username) {
    const windowId = `pm-${username}`;
    const windowElement = document.createElement('div');
    windowElement.className = 'pm-window';
    windowElement.id = windowId;
    windowElement.style.zIndex = this.windowZIndex++;
    
    // Position window (cascade effect)
    const offset = this.windows.size * 30;
    windowElement.style.left = `${100 + offset}px`;
    windowElement.style.top = `${100 + offset}px`;
    
    windowElement.innerHTML = `
      <div class="pm-header">
        <span>Private Message - ${username}</span>
        <button class="pm-close-btn" onclick="app.pmManager.closePMWindow('${username}')">×</button>
      </div>
      <div class="pm-chat" id="${windowId}-chat"></div>
      <div class="pm-input-area">
        <div class="pm-input-container">
          <input class="pm-input" id="${windowId}-input" placeholder="Type private message..." maxlength="1000">
          <button class="pm-send-btn" onclick="app.pmManager.sendPM('${username}')">Send</button>
        </div>
      </div>
    `;
    
    const chatArea = windowElement.querySelector('.pm-chat');
    const input = windowElement.querySelector('.pm-input');
    const sendBtn = windowElement.querySelector('.pm-send-btn');
    
    // Make window draggable
    this.makeDraggable(windowElement, windowElement.querySelector('.pm-header'));
    
    // Enter key to send
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendPM(username);
      }
    });
    
    // Click to bring to front
    windowElement.addEventListener('mousedown', () => {
      this.bringToFront(username);
    });
    
    return {
      element: windowElement,
      chat: chatArea,
      input: input,
      sendBtn: sendBtn,
      messages: []
    };
  }
  
  makeDraggable(element, handle) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    
    handle.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = parseInt(window.getComputedStyle(element).left, 10);
      startTop = parseInt(window.getComputedStyle(element).top, 10);
      
      document.addEventListener('mousemove', drag);
      document.addEventListener('mouseup', stopDrag);
      e.preventDefault();
    });
    
    function drag(e) {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      element.style.left = (startLeft + deltaX) + 'px';
      element.style.top = (startTop + deltaY) + 'px';
    }
    
    function stopDrag() {
      isDragging = false;
      document.removeEventListener('mousemove', drag);
      document.removeEventListener('mouseup', stopDrag);
    }
  }
  
  bringToFront(username) {
    const window = this.windows.get(username);
    if (window) {
      window.element.style.zIndex = this.windowZIndex++;
    }
  }
  
  closePMWindow(username) {
    const window = this.windows.get(username);
    if (window) {
      window.element.remove();
      this.windows.delete(username);
    }
  }
  
  async sendPM(username) {
    const window = this.windows.get(username);
    if (!window) return;
    
    const message = window.input.value.trim();
    if (!message) return;
    
    window.sendBtn.disabled = true;
    window.sendBtn.textContent = '...';
    
    try {
      // Store PM locally (since we don't have a PM backend yet)
      const pmData = {
        from: this.app.user,
        to: username,
        text: message,
        time: Date.now()
      };
      
      // Add to window messages
      window.messages.push(pmData);
      this.renderPMMessages(username);
      
      // Save to storage
      this.savePMHistory(username, window.messages);
      
      // Clear input
      window.input.value = '';
      
      // Play PM sound
      this.app.soundManager.playSound('pm');
      
      // Show notification to simulate receiving PM (for demo)
      setTimeout(() => {
        const response = {
          from: username,
          to: this.app.user,
          text: `Thanks for the message: "${message}"`,
          time: Date.now()
        };
        window.messages.push(response);
        this.renderPMMessages(username);
        this.savePMHistory(username, window.messages);
        this.app.soundManager.playSound('pm');
      }, 1000 + Math.random() * 2000);
      
    } catch(e) {
      console.error('PM send failed:', e);
      alert('Failed to send private message');
    } finally {
      window.sendBtn.disabled = false;
      window.sendBtn.textContent = 'Send';
      window.input.focus();
    }
  }
  
  renderPMMessages(username) {
    const window = this.windows.get(username);
    if (!window) return;
    
    const html = window.messages.map(msg => {
      const date = new Date(msg.time).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      const isFromMe = msg.from === this.app.user;
      const color = this.app.messageRenderer.getUserColor(msg.from);
      const processedText = this.app.messageRenderer.processText(msg.text);
      
      return `
        <div class="msg">
          <span class="time">[${date}]</span>
          <span class="user" style="color:${color}">&lt;${msg.from}&gt;</span>
          <span class="text">${processedText}</span>
        </div>
      `;
    }).join('');
    
    window.chat.innerHTML = html;
    window.chat.scrollTop = window.chat.scrollHeight;
  }
  
  loadPMHistory(username) {
    try {
      const history = this.app.loadFromStorage(`pm_history_${username}`) || [];
      const window = this.windows.get(username);
      if (window) {
        window.messages = history;
        this.renderPMMessages(username);
      }
    } catch(e) {
      console.warn('Failed to load PM history:', e);
    }
  }
  
  savePMHistory(username, messages) {
    try {
      // Keep only last 100 messages
      const messagesToSave = messages.slice(-100);
      this.app.saveToStorage(`pm_history_${username}`, messagesToSave);
    } catch(e) {
      console.warn('Failed to save PM history:', e);
    }
  }
  
  // Check if user has unread PMs (for future notification features)
  hasUnreadPMs(username) {
    // This would be implemented with proper backend support
    return false;
  }
  
  // Get all PM conversations
  getPMConversations() {
    const conversations = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('pm_history_')) {
        const username = key.replace('pm_history_', '');
        conversations.push(username);
      }
    }
    return conversations;
  }
}