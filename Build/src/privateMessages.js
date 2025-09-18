import { X } from 'lucide';

export class PrivateMessageManager {
  constructor(app) {
    this.app = app;
    this.windows = new Map();
    this.windowContainer = document.getElementById('pm-windows');
    this.windowZIndex = 1600;
  }
  
  // Security utility to escape HTML
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
    
    // Create close icon
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '12');
    svg.setAttribute('height', '12');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    
    // Add paths from X icon
    X.forEach(pathData => {
      if (pathData && pathData[0] === 'path') {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData[1].d || '');
        svg.appendChild(path);
      } else if (pathData && pathData[0] === 'line') {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', pathData[1].x1 || '');
        line.setAttribute('y1', pathData[1].y1 || '');
        line.setAttribute('x2', pathData[1].x2 || '');
        line.setAttribute('y2', pathData[1].y2 || '');
        svg.appendChild(line);
      }
    });
    
    const closeIconHtml = svg.outerHTML;
    
    // Create header
    const header = document.createElement('div');
    header.className = 'pm-header';
    
    const headerSpan = document.createElement('span');
    headerSpan.textContent = `Private Message - ${username}`;
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'pm-close-btn';
    closeBtn.innerHTML = closeIconHtml;
    closeBtn.addEventListener('click', () => this.closePMWindow(username));
    
    header.appendChild(headerSpan);
    header.appendChild(closeBtn);
    
    // Create chat area
    const chatArea = document.createElement('div');
    chatArea.className = 'pm-chat';
    chatArea.id = `${windowId}-chat`;
    
    // Create input area
    const inputArea = document.createElement('div');
    inputArea.className = 'pm-input-area';
    
    const inputContainer = document.createElement('div');
    inputContainer.className = 'pm-input-container';
    
    const input = document.createElement('input');
    input.className = 'pm-input';
    input.id = `${windowId}-input`;
    input.placeholder = 'Type private message...';
    input.maxLength = 1000;
    
    const sendBtn = document.createElement('button');
    sendBtn.className = 'pm-send-btn';
    sendBtn.textContent = 'Send';
    sendBtn.addEventListener('click', () => this.sendPM(username));
    
    inputContainer.appendChild(input);
    inputContainer.appendChild(sendBtn);
    inputArea.appendChild(inputContainer);
    
    // Clear and assemble window
    windowElement.innerHTML = '';
    windowElement.appendChild(header);
    windowElement.appendChild(chatArea);
    windowElement.appendChild(inputArea);
    
    // Make window draggable
    this.makeDraggable(windowElement, header);
    
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
      // Generate conversation ID (sorted usernames for consistency)
      const conversationId = [this.app.user, username].sort().join('_');
      
      // Send PM to server - encode conversationId to handle special characters
      const res = await fetch(`${this.app.baseURL}/pm/${encodeURIComponent(conversationId)}?user=${encodeURIComponent(this.app.user)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message, to: username })
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText);
      }
      
      // Clear input
      window.input.value = '';
      
      // Play PM sound
      this.app.soundManager.playSound('pm');
      
      // Refresh PM messages
      await this.loadPMHistory(username);
      
    } catch(e) {
      console.error('PM send failed:', e);
      alert('Failed to send private message: ' + e.message);
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
          <span class="time">[${this.escapeHtml(date)}]</span>
          <span class="user" style="color:${this.escapeHtml(color)}">&lt;${this.escapeHtml(msg.from)}&gt;</span>
          <span class="text">${processedText}</span>
        </div>
      `;
    }).join('');
    
    window.chat.innerHTML = html;
    window.chat.scrollTop = window.chat.scrollHeight;
  }
  
  async loadPMHistory(username) {
    try {
      // Generate conversation ID (sorted usernames for consistency)
      const conversationId = [this.app.user, username].sort().join('_');
      
      // Fetch from server - encode conversationId to handle special characters
      const res = await fetch(`${this.app.baseURL}/pm/${encodeURIComponent(conversationId)}?user=${encodeURIComponent(this.app.user)}`);
      
      if (res.ok) {
        const data = await res.json();
        const window = this.windows.get(username);
        if (window) {
          window.messages = data.messages || [];
          this.renderPMMessages(username);
        }
      } else {
        console.warn('Failed to load PM history:', res.status);
        // Fallback to local storage
        const history = this.app.loadFromStorage(`pm_history_${username}`) || [];
        const window = this.windows.get(username);
        if (window) {
          window.messages = history;
          this.renderPMMessages(username);
        }
      }
    } catch(e) {
      console.warn('Failed to load PM history:', e);
      // Fallback to local storage
      const history = this.app.loadFromStorage(`pm_history_${username}`) || [];
      const window = this.windows.get(username);
      if (window) {
        window.messages = history;
        this.renderPMMessages(username);
      }
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