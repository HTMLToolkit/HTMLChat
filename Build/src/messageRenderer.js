import { marked } from 'marked';
import DOMPurify from 'dompurify';

export class MessageRenderer {
  constructor(app) {
    this.app = app;
    this.userColors = [
      '#cc0000', '#00cc00', '#0000cc', '#cc6600', '#cc00cc', 
      '#006666', '#990099', '#009900', '#990000', '#000099'
    ];
  }
  
  // Security utility to escape HTML
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Escape for attribute contexts (adds quote escaping)
  escapeAttr(s) {
    return this.escapeHtml(String(s))
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  
  // Helper method to create lucide icons (delegates to app)
  createIcon(iconName, options = {}) {
    // Return HTML string (outerHTML) for convenient insertion into innerHTML
    if (!this.app || typeof this.app.createIconHTML !== 'function') {
      console.warn('App.createIconHTML not available');
      return '';
    }
    return this.app.createIconHTML(iconName, options);
  }

  getUserColor(user) {
    let hash = 0;
    for (let i = 0; i < user.length; i++) {
      hash = user.charCodeAt(i) + ((hash << 5) - hash);
    }
    return this.userColors[Math.abs(hash) % this.userColors.length];
  }
  
  processText(text) {
    // Handle reply references
    let processedText = text;
    const replyMatch = text.match(/^@reply:(\d+):([^:]+):\s*(.*)/);
    
    if (replyMatch) {
      const [, messageId, replyUser, actualMessage] = replyMatch;
      processedText = actualMessage;
      // We'll handle the reply display in renderMessages
    }
    
    // 1. Convert Markdown to HTML
    let html = marked.parse(processedText);

    // 2. Sanitize the HTML to prevent XSS
    html = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'b','i','em','strong','u','a','p','ul','ol','li','code',
        'pre','img','h1','h2','h3','h4','h5','h6','br','span','div'
      ],
      ALLOWED_ATTR: ['href','src','alt','title','target','style','rel']
    });

    // 3. Convert remaining plain URLs into clickable links
    html = html.replace(/(?<!["'>])\bhttps?:\/\/[^\s<]+/g, (url) => {
      const safeHref = this.escapeAttr(url);
      const safeText = this.escapeHtml(url);
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="color:#0066cc">${safeText}</a>`;
    });
    // Defense-in-depth: sanitize again
    html = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['b','i','em','strong','u','a','p','ul','ol','li','code','pre','img','h1','h2','h3','h4','h5','h6','br','span','div'],
      ALLOWED_ATTR: ['href','src','alt','title','target','style','rel']
    });

    return html;
  }
  
  renderMessages(messages) {
    if (!Array.isArray(messages)) {
      console.error('renderMessages expects an array, got:', typeof messages);
      return '<div class="msg system"><span class="time">[--:--]</span><span class="user">*** System ***</span><span class="text">Error loading messages.</span></div>';
    }

    return messages.map((message, index) => {
      const { user, text, time } = message;
      const color = this.getUserColor(user);
      const date = new Date(time).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      // Check if this is a reply and extract the actual message
      const replyMatch = text.match(/^@reply:([^:]+):([^:]+):\s*(.*)/);
      let replyInfo = null;
      let actualText = text;
      
      if (replyMatch) {
        const [fullMatch, messageId, replyUser, messageText] = replyMatch;
        replyInfo = { messageId, replyUser };
        actualText = messageText.trim();
      }
      
      // Check for file attachments
      let fileAttachment = null;
      if (actualText.startsWith('FILE:')) {
        try {
          const fileData = JSON.parse(actualText.substring(5));
          fileAttachment = fileData;
          // Use appropriate icon based on file type
          const iconName = this.getFileIconName(fileData.type);
          const iconHtml = this.createIcon(iconName, { 
            style: { width: '16px', height: '16px', display: 'inline' }
          });
          actualText = `${iconHtml} ${fileData.name}`;
        } catch(e) {
          // Not a valid file attachment
        }
      }
      
      const processedText = this.processText(actualText);
      const messageId = message.id || `msg-${time}-${index}`;
      const isModerator = this.app.modTools.isModerator(user);
      
      let messageClass = 'msg';
      if (replyInfo) messageClass += ' reply-msg';
      if (message.system) messageClass += ' system';
      if (message.system) messageClass += ' system';
      
      let messageHtml = `
        <div class="${messageClass}" id="${this.escapeAttr(messageId)}"
             data-user="${this.escapeAttr(user)}"
             data-time="${this.escapeAttr(String(time))}"
             data-message-id="${this.escapeAttr(messageId)}">
      `;
      
      // Add reply reference if this is a reply (before timestamp and user)
      if (replyInfo) {
        messageHtml += `
          <div class="reply-reference" data-message-id="${this.escapeAttr(replyInfo.messageId)}">
            ↳ Replying to ${this.escapeHtml(replyInfo.replyUser)}
          </div>
        `;
      }
      
      messageHtml += `
          <span class="time">[${this.escapeHtml(date)}]</span>
          <span class="user${isModerator ? ' moderator' : ''}"
                style="color:${this.escapeAttr(color)}"
                data-user="${this.escapeAttr(user)}">&lt;${this.escapeHtml(user)}&gt;</span>
      `;
      
      // Add the message content
      if (fileAttachment) {
        if (fileAttachment.type.startsWith('image/')) {
          const imageUrl = this.escapeAttr(fileAttachment.url || fileAttachment.data);
          const imageName = this.escapeAttr(fileAttachment.name);
          const uploadedBy = this.escapeHtml(fileAttachment.uploadedBy || 'Unknown');
          const uploadedAt = fileAttachment.uploadedAt ? this.escapeHtml(new Date(fileAttachment.uploadedAt).toLocaleString()) : '';
          const titleText = `Uploaded by ${uploadedBy}${uploadedAt ? ' on ' + uploadedAt : ''}`;
          
          messageHtml += `
            <span class="text">
              <img src="${imageUrl}"
                   alt="${imageName}"
                   class="image-attachment clickable-image"
                   data-url="${imageUrl}"
                   title="${this.escapeAttr(titleText)}">
            </span>
          `;
        } else {
          const iconName = this.getFileIconName(fileAttachment.type);
          const iconHtml = this.createIcon(iconName, { 
            style: { width: '16px', height: '16px', marginRight: '4px' }
          });
          const fileUrl = this.escapeAttr(fileAttachment.url || fileAttachment.data);
          const fileName = this.escapeHtml(fileAttachment.name);
          const uploadedBy = this.escapeHtml(fileAttachment.uploadedBy || 'Unknown');
          const uploadedAt = fileAttachment.uploadedAt ? this.escapeHtml(new Date(fileAttachment.uploadedAt).toLocaleString()) : '';
          const titleText = `Uploaded by ${uploadedBy}${uploadedAt ? ' on ' + uploadedAt : ''}`;
          const fileSize = this.formatFileSize(fileAttachment.size);
          
          messageHtml += `
            <span class="text">
              <a href="${fileUrl}"
                 ${fileAttachment.filename ? `download="${this.escapeAttr(fileName)}"` : 'target="_blank" rel="noopener noreferrer"'}
                 class="file-attachment"
                 title="${this.escapeAttr(titleText)}">
                ${iconHtml}
                ${this.escapeHtml(fileName)} (${this.escapeHtml(fileSize)})
              </a>
            </span>
          `;
        }
      } else {
        messageHtml += `<span class="text">${processedText}</span>`;
      }
      
      messageHtml += '</div>';
      
      return messageHtml;
    }).join('');
  }
  
  getFileIconName(mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'music';
    if (mimeType === 'application/pdf') return 'file-text';
    if (mimeType.includes('word')) return 'file-text';
    if (mimeType === 'text/plain') return 'file-text';
    return 'paperclip';
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  highlightMessage(messageId) {
    const element = document.getElementById(messageId);
    if (element) {
      element.classList.add('highlighted');
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      setTimeout(() => {
        element.classList.remove('highlighted');
      }, 3000);
    }
  }
  
  jumpToMessage(messageId) {
    this.highlightMessage(messageId);
  }
}