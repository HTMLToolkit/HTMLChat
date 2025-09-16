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
    
    this.currentMessage = {
      element: messageElement,
      user: messageElement.dataset.user,
      time: messageElement.dataset.time,
      id: messageElement.id,
      text: messageElement.querySelector('.text').textContent
    };
    
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
  
  deleteMessage() {
    if (!this.canDeleteMessage()) return;
    
    const confirmMsg = this.currentMessage.user === this.app.user 
      ? 'Delete your message?' 
      : `Delete message from ${this.currentMessage.user}?`;
      
    if (confirm(confirmMsg)) {
      // Since we don't have server-side delete, just hide the message locally
      this.currentMessage.element.style.display = 'none';
      
      // In a real implementation, you'd send a DELETE request to the server
      console.log('Message deleted locally:', this.currentMessage.id);
      
      // Show feedback
      this.app.elements.chatBox.insertAdjacentHTML('beforeend', `
        <div class="msg system">
          <span class="time">[${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]</span>
          <span class="user">*** System ***</span>
          <span class="text">Message deleted by ${this.app.user}</span>
        </div>
      `);
      
      this.app.scrollToBottom();
    }
  }
  
  openPrivateMessage() {
    this.app.pmManager.openPrivateMessage(this.currentMessage.user);
  }
  
  kickUser() {
    if (!this.canModerateUser()) return;
    
    const reason = prompt(`Kick ${this.currentMessage.user}? Enter reason (optional):`);
    if (reason !== null) { // null means cancelled
      // In real implementation, send kick request to server
      console.log(`Kicking user ${this.currentMessage.user}, reason: ${reason}`);
      
      // Show mod action in chat
      this.app.elements.chatBox.insertAdjacentHTML('beforeend', `
        <div class="msg system">
          <span class="time">[${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]</span>
          <span class="user">*** ${this.app.user} ***</span>
          <span class="text">kicked ${this.currentMessage.user}${reason ? ` (${reason})` : ''}</span>
        </div>
      `);
      
      this.app.scrollToBottom();
    }
  }
  
  banUser() {
    if (!this.canModerateUser()) return;
    
    const reason = prompt(`Ban ${this.currentMessage.user}? Enter reason (optional):`);
    if (reason !== null) {
      const duration = prompt('Ban duration (minutes, or leave empty for permanent):');
      
      // In real implementation, send ban request to server
      console.log(`Banning user ${this.currentMessage.user}, reason: ${reason}, duration: ${duration || 'permanent'}`);
      
      // Show mod action in chat
      const durationText = duration ? ` for ${duration} minutes` : ' permanently';
      this.app.elements.chatBox.insertAdjacentHTML('beforeend', `
        <div class="msg system">
          <span class="time">[${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]</span>
          <span class="user">*** ${this.app.user} ***</span>
          <span class="text">banned ${this.currentMessage.user}${durationText}${reason ? ` (${reason})` : ''}</span>
        </div>
      `);
      
      this.app.scrollToBottom();
    }
  }
}