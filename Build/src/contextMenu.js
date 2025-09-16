export class ContextMenuManager {
  constructor(app) {
    this.app = app;
    this.menu = document.getElementById('context-menu');
    this.currentMessage = null;
    
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    // Hide menu on click outside
    document.addEventListener('click', (e) => {
      if (!this.menu.contains(e.target)) {
        this.hide();
      }
    });
    
    // Menu item clicks
    this.menu.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action && this.currentMessage) {
        this.handleAction(action);
      }
    });
    
    // Hide on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    });
  }
  
  show(event, messageElement) {
    event.preventDefault();
    
    // Get message ID from multiple sources for reliability
    const messageId = messageElement.dataset.messageId || 
                     messageElement.id || 
                     messageElement.getAttribute('data-message-id');
    
    console.log('Context menu - found message ID:', messageId); // Debug
    
    this.currentMessage = {
      element: messageElement,
      user: messageElement.dataset.user,
      time: messageElement.dataset.time,
      id: messageId,
      text: messageElement.querySelector('.text').textContent
    };
    
    console.log('Context menu - current message:', this.currentMessage); // Debug
    
    // Update menu items based on context
    this.updateMenuItems();
    
    // Position menu
    const rect = this.menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let x = event.clientX;
    let y = event.clientY;
    
    // Adjust position if menu would go off-screen
    if (x + rect.width > viewportWidth) {
      x = viewportWidth - rect.width - 10;
    }
    if (y + rect.height > viewportHeight) {
      y = viewportHeight - rect.height - 10;
    }
    
    this.menu.style.left = x + 'px';
    this.menu.style.top = y + 'px';
    this.menu.style.display = 'block';
  }
  
  hide() {
    this.menu.style.display = 'none';
    this.currentMessage = null;
  }
  
  updateMenuItems() {
    if (!this.currentMessage) return;
    
    const items = this.menu.querySelectorAll('.context-item');
    
    items.forEach(item => {
      const action = item.dataset.action;
      let show = true;
      
      switch (action) {
        case 'reply':
          show = true; // Always show reply
          break;
        case 'delete':
          show = this.canDeleteMessage();
          break;
        case 'pm':
          show = this.currentMessage.user !== this.app.user;
          break;
        case 'kick':
        case 'ban':
          show = this.canModerateUser();
          break;
      }
      
      item.style.display = show ? 'block' : 'none';
    });
  }
  
  canDeleteMessage() {
    // Can delete own messages or if moderator
    return this.currentMessage.user === this.app.user || 
           this.app.modTools.isModerator(this.app.user);
  }
  
  canModerateUser() {
    // Can moderate if user is moderator and target is not self or another moderator
    return this.app.modTools.isModerator(this.app.user) &&
           this.currentMessage.user !== this.app.user &&
           !this.app.modTools.isModerator(this.currentMessage.user);
  }
  
  handleAction(action) {
    if (!this.currentMessage) return;
    
    switch (action) {
      case 'reply':
        this.replyToMessage();
        break;
      case 'delete':
        this.deleteMessage();
        break;
      case 'pm':
        this.openPrivateMessage();
        break;
      case 'kick':
        this.kickUser();
        break;
      case 'ban':
        this.banUser();
        break;
    }
    
    this.hide();
  }
  
  replyToMessage() {
    this.app.setReplyTo(
      this.currentMessage.id,
      this.currentMessage.user,
      this.currentMessage.text
    );
  }
  
  async deleteMessage() {
    if (!this.canDeleteMessage()) return;
    
    const confirmMsg = this.currentMessage.user === this.app.user 
      ? 'Delete your message?' 
      : `Delete message from ${this.currentMessage.user}?`;
      
    if (confirm(confirmMsg)) {
      try {
        const room = this.app.elements.roomSelect.value;
        const messageId = this.currentMessage.id;
        
        console.log('Deleting message:', messageId); // Debug log
        
        const res = await fetch(
          `${this.app.baseURL}/chat/${room}?user=${encodeURIComponent(this.app.user)}&messageId=${encodeURIComponent(messageId)}`,
          { 
            method: "DELETE",
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`${res.status}: ${errorText}`);
        }
        
        const result = await res.json();
        console.log('Delete result:', result); // Debug log
        
        // Refresh messages to show deletion
        await this.app.fetchMessages(true);
        
      } catch(e) {
        console.error('Delete failed:', e);
        alert('Failed to delete message: ' + e.message);
      }
    }
  }
  
  openPrivateMessage() {
    this.app.pmManager.openPrivateMessage(this.currentMessage.user);
  }
  
  async kickUser() {
    if (!this.canModerateUser()) return;
    
    const reason = prompt(`Kick ${this.currentMessage.user}? Enter reason (optional):`);
    if (reason !== null) { // null means cancelled
      try {
        const res = await fetch(`${this.app.baseURL}/mod/${this.app.elements.roomSelect.value}?user=${encodeURIComponent(this.app.user)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: 'kick',
            targetUser: this.currentMessage.user,
            reason: reason
          })
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText);
        }
        
        // Refresh messages and users
        await this.app.fetchMessages(true);
        
      } catch(e) {
        console.error('Kick failed:', e);
        alert('Failed to kick user: ' + e.message);
      }
    }
  }
  
  async banUser() {
    if (!this.canModerateUser()) return;
    
    const reason = prompt(`Ban ${this.currentMessage.user}? Enter reason (optional):`);
    if (reason !== null) {
      const duration = prompt('Ban duration (minutes, or leave empty for permanent):');
      
      try {
        const res = await fetch(`${this.app.baseURL}/mod/${this.app.elements.roomSelect.value}?user=${encodeURIComponent(this.app.user)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: 'ban',
            targetUser: this.currentMessage.user,
            reason: reason,
            duration: duration ? parseInt(duration) : null
          })
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText);
        }
        
        // Refresh messages and users
        await this.app.fetchMessages(true);
        
      } catch(e) {
        console.error('Ban failed:', e);
        alert('Failed to ban user: ' + e.message);
      }
    }
  }
}