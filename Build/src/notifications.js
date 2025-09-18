export class NotificationManager {
  constructor(app) {
    this.app = app;
    this.permission = Notification.permission;
    this.enabled = this.loadSetting('notifications_enabled', true);
    this.showDesktop = this.loadSetting('desktop_notifications', true);
    this.playSound = this.loadSetting('notification_sounds', true);
    this.banner = document.getElementById('notification-banner');
    this.settingsModal = null;
  }
  
  loadSetting(key, defaultValue) {
    try {
      const saved = localStorage.getItem(`htmlchat_${key}`);
      return saved !== null ? JSON.parse(saved) : defaultValue;
    } catch(e) {
      return defaultValue;
    }
  }
  
  saveSetting(key, value) {
    try {
      localStorage.setItem(`htmlchat_${key}`, JSON.stringify(value));
    } catch(e) {
      console.warn('Failed to save notification setting:', e);
    }
  }
  
  async init() {
    // Check if notifications are supported
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return;
    }
    
    // Show banner if permission not granted and user hasn't dismissed it
    if (this.permission !== 'granted' && !this.loadSetting('banner_dismissed', false)) {
      this.showBanner();
    }
    
    // Update permission status
    this.permission = Notification.permission;
    
    // Initialize settings modal
    this.initializeSettingsModal();
  }
  
  initializeSettingsModal() {
    this.settingsModal = document.getElementById('settings-modal');
    
    // Get toggle elements
    const desktopToggle = document.getElementById('desktop-notifications-toggle');
    const soundsToggle = document.getElementById('notification-sounds-toggle');
    const allNotificationsToggle = document.getElementById('all-notifications-toggle');
    const messageSoundsToggle = document.getElementById('message-sounds-toggle');
    const permissionBtn = document.getElementById('request-permission-btn');
    
    // Set initial states
    if (desktopToggle) {
      desktopToggle.checked = this.showDesktop;
      desktopToggle.addEventListener('change', () => {
        this.toggleDesktopNotifications();
        this.updatePermissionStatus();
      });
    }
    
    if (soundsToggle) {
      soundsToggle.checked = this.playSound;
      soundsToggle.addEventListener('change', () => {
        this.toggleNotificationSounds();
      });
    }
    
    if (allNotificationsToggle) {
      allNotificationsToggle.checked = this.enabled;
      allNotificationsToggle.addEventListener('change', () => {
        this.toggleAllNotifications();
        this.updateToggleStates();
      });
    }
    
    if (messageSoundsToggle) {
      messageSoundsToggle.checked = this.app.soundManager.isSoundEnabled();
      messageSoundsToggle.addEventListener('change', () => {
        this.app.soundManager.toggleSounds();
      });
    }
    
    if (permissionBtn) {
      permissionBtn.addEventListener('click', () => {
        this.requestPermission();
      });
    }
    
    this.updatePermissionStatus();
    this.updateToggleStates();
  }
  
  updatePermissionStatus() {
    const statusText = document.getElementById('permission-status-text');
    const requestBtn = document.getElementById('request-permission-btn');
    
    if (statusText) {
      statusText.className = '';
      
      switch (this.permission) {
        case 'granted':
          statusText.textContent = 'Granted';
          statusText.classList.add('granted');
          if (requestBtn) requestBtn.style.display = 'none';
          break;
        case 'denied':
          statusText.textContent = 'Denied';
          statusText.classList.add('denied');
          if (requestBtn) requestBtn.style.display = 'none';
          break;
        default:
          statusText.textContent = 'Not requested';
          statusText.classList.add('default');
          if (requestBtn) requestBtn.style.display = 'inline-block';
          break;
      }
    }
  }
  
  updateToggleStates() {
    const desktopToggle = document.getElementById('desktop-notifications-toggle');
    const soundsToggle = document.getElementById('notification-sounds-toggle');
    
    // Disable individual toggles if all notifications are disabled
    if (desktopToggle) {
      desktopToggle.disabled = !this.enabled;
    }
    if (soundsToggle) {
      soundsToggle.disabled = !this.enabled;
    }
  }
  
  showBanner() {
    if (this.banner) {
      this.banner.style.display = 'flex';
    }
  }
  
  dismissBanner() {
    if (this.banner) {
      this.banner.style.display = 'none';
      this.saveSetting('banner_dismissed', true);
    }
  }
  
  async requestPermission() {
    if (!('Notification' in window)) {
      alert('This browser does not support notifications');
      return false;
    }
    
    try {
      const permission = await Notification.requestPermission();
      this.permission = permission;
      
      if (permission === 'granted') {
        this.dismissBanner();
        this.showTestNotification();
        this.updatePermissionStatus();
        return true;
      } else {
        alert('Notifications were denied. You can enable them later in your browser settings.');
        this.updatePermissionStatus();
        return false;
      }
    } catch(e) {
      console.error('Error requesting notification permission:', e);
      return false;
    }
  }
  
  showTestNotification() {
    this.showNotification('HTMLChat', 'Notifications are now enabled!', {
      icon: 'icons/icon-512x512.png',
      tag: 'test-notification'
    });
  }
  
  showNotification(title, body, options = {}) {
    if (!this.enabled || !this.showDesktop) return;
    
    // If tab is visible, show in-page notification instead
    if (this.app.isVisible) {
      this.showInPageNotification(title, body);
      return;
    }
    
    if (this.permission === 'granted') {
      try {
        const defaultOptions = {
          body: body,
          icon: 'icons/icon-512x512.png',
          tag: 'htmlchat-message',
          requireInteraction: false,
          silent: !this.playSound
        };
        
        const notification = new Notification(title, { ...defaultOptions, ...options });
        
        // Auto-close after 5 seconds
        setTimeout(() => {
          notification.close();
        }, 5000);
        
        // Click to focus window
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
        
      } catch(e) {
        console.error('Error showing notification:', e);
        this.showInPageNotification(title, body);
      }
    } else {
      // Fallback to in-page notification
      this.showInPageNotification(title, body);
    }
  }
  
  showInPageNotification(title, body) {
    // Create temporary in-page notification
    const notification = document.createElement('div');
    notification.className = 'desktop-notification';
    notification.innerHTML = `
      <div class="notification-title">${this.escapeHtml(title)}</div>
      <div class="notification-body">${this.escapeHtml(body)}</div>
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    
    setTimeout(() => {
      notification.style.transition = 'all 0.3s ease';
      notification.style.opacity = '1';
      notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 4000);
    
    // Click to remove
    notification.addEventListener('click', () => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    });
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  showSettings() {
    if (this.settingsModal) {
      this.settingsModal.style.display = 'flex';
      this.updatePermissionStatus();
      this.updateToggleStates();
      
      // Update message sounds toggle to reflect current state
      const messageSoundsToggle = document.getElementById('message-sounds-toggle');
      if (messageSoundsToggle) {
        messageSoundsToggle.checked = this.app.soundManager.isSoundEnabled();
      }
      
      // Re-initialize icons in the modal
      this.app.initializeIcons();
    }
  }
  
  closeSettings() {
    if (this.settingsModal) {
      this.settingsModal.style.display = 'none';
    }
  }
  
  // Notification for new messages
  notifyNewMessage(username, message) {
    if (username === this.app.user) return; // Don't notify for own messages
    
    const truncatedMessage = message.length > 50 ? message.substring(0, 50) + '...' : message;
    this.showNotification(`${username} in ${this.app.elements.roomSelect.value}`, truncatedMessage);
  }
  
  // Notification for private messages
  notifyPrivateMessage(username, message) {
    if (username === this.app.user) return;
    
    const truncatedMessage = message.length > 50 ? message.substring(0, 50) + '...' : message;
    this.showNotification(`Private message from ${username}`, truncatedMessage, {
      tag: 'private-message',
      requireInteraction: true
    });
  }
  
  // Notification for user join/leave
  notifyUserActivity(username, action) {
    if (username === this.app.user) return;
    
    const message = action === 'join' ? 'joined the room' : 'left the room';
    this.showNotification('User Activity', `${username} ${message}`, {
      tag: 'user-activity',
      silent: true // Less intrusive for user activity
    });
  }
  
  // Toggle notification settings
  toggleDesktopNotifications() {
    this.showDesktop = !this.showDesktop;
    this.saveSetting('desktop_notifications', this.showDesktop);
    
    // If enabling desktop notifications, check for permission
    if (this.showDesktop && this.permission !== 'granted') {
      this.requestPermission();
    }
    
    return this.showDesktop;
  }
  
  toggleNotificationSounds() {
    this.playSound = !this.playSound;
    this.saveSetting('notification_sounds', this.playSound);
    return this.playSound;
  }
  
  toggleAllNotifications() {
    this.enabled = !this.enabled;
    this.saveSetting('notifications_enabled', this.enabled);
    return this.enabled;
  }
}