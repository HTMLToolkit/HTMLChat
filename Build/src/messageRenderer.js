export class MessageRenderer {
  constructor(app) {
    this.app = app;
    this.userColors = [
      '#cc0000', '#00cc00', '#0000cc', '#cc6600', '#cc00cc',
      '#006666', '#990099', '#009900', '#990000', '#000099'
    ];
  }

  getUserColor(user) {
    let hash = 0;
    for (let i = 0; i < user.length; i++) {
      hash = user.charCodeAt(i) + ((hash << 5) - hash);
    }
    return this.userColors[Math.abs(hash) % this.userColors.length];
  }

  processText(text) {
    let html = marked.parse(text);
    html = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'b', 'i', 'em', 'strong', 'u', 'a', 'p', 'ul', 'ol', 'li', 'code',
        'pre', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'span', 'div'
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'style']
    });
    html = html.replace(/(?<!["'>])\bhttps?:\/\/[^\s<]+/g,
      '<a href="$&" target="_blank" style="color:#0066cc">$&</a>');
    return html;
  }

  renderMessages(messages) {
    if (!Array.isArray(messages)) {
      console.error('renderMessages expects an array, got:', typeof messages);
      return '<div class="msg system"><span class="time">[--:--]</span><span class="user">*** System ***</span><span class="text">Error loading messages.</span></div>';
    }

    return messages.map((message, index) => {
      const { user, text: rawText, time } = message;
      const color = this.getUserColor(user);
      const date = new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Normalize text
      let text = rawText.replace(/^\s+|\s+$/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '');

      console.log("Renderer got rawText:", JSON.stringify(text));

      let replyInfo = null;
      let actualText = text;
      let displayText = text;

      // Match reply: @reply:msgId:replyUser:text OR @reply:msgId:text
      const replyMatch = text.match(/^@reply:([^:]+)(?::([^:]+))?:(.*)$/);
      if (replyMatch) {
        const [, messageId, maybeUser, messageText] = replyMatch;

        // Look up original message user if maybeUser is missing
        let replyUser = maybeUser;
        if (!replyUser) {
          const originalMsg = this.app.messages?.find(m => m.id === messageId);
          replyUser = originalMsg?.user || "Unknown";
        }

        replyInfo = { messageId, replyUser };
        actualText = messageText.trim();
        displayText = `↳ Replying to ${replyUser}: ${actualText}`;
        console.log('Reply detected:', { messageId, replyUser, messageText });
      }


      // Check for file attachments
      let fileAttachment = null;
      if (actualText.startsWith('FILE:')) {
        try {
          const fileData = JSON.parse(actualText.substring(5));
          fileAttachment = fileData;
          displayText = `📎 ${fileData.name}`;
        } catch (e) {
          console.error('Failed to parse file attachment:', e);
        }
      }

      const processedText = this.processText(displayText);
      const messageId = message.id || `msg-${time}-${index}`;
      const isModerator = this.app.modTools.isModerator(user);

      let messageClass = 'msg';
      if (replyInfo) messageClass += ' reply-msg';
      if (message.system) messageClass += ' system';

      let messageHtml = `
        <div class="${messageClass}" id="${messageId}" 
             data-user="${user}" 
             data-time="${time}"
             data-message-id="${messageId}"
             oncontextmenu="app.contextMenu.show(event, this)">
      `;

      if (replyInfo) {
        messageHtml += `
          <div class="reply-reference" onclick="app.messageRenderer.jumpToMessage('${replyInfo.messageId}')">
            ↳ Jump to ${replyInfo.replyUser}'s message
          </div>
        `;
      }

      messageHtml += `
        <span class="time">[${date}]</span>
        <span class="user${isModerator ? ' moderator' : ''}" 
              style="color:${color}"
              ondblclick="app.pmManager.openPrivateMessage('${user}')">&lt;${user}&gt;</span>
      `;

      if (fileAttachment) {
        if (fileAttachment.type.startsWith('image/')) {
          messageHtml += `
            <span class="text">
              <img src="${fileAttachment.url || fileAttachment.data}" 
                   alt="${fileAttachment.name}" 
                   class="image-attachment"
                   onclick="window.open('${fileAttachment.url || fileAttachment.data}', '_blank')"
                   title="Uploaded by ${fileAttachment.uploadedBy || 'Unknown'} ${fileAttachment.uploadedAt ? 'on ' + new Date(fileAttachment.uploadedAt).toLocaleString() : ''}">
            </span>
          `;
        } else {
          messageHtml += `
            <span class="text">
              <a href="${fileAttachment.url || fileAttachment.data}" 
                 ${fileAttachment.filename ? `download="${fileAttachment.name}"` : 'target="_blank"'}
                 class="file-attachment"
                 title="Uploaded by ${fileAttachment.uploadedBy || 'Unknown'} ${fileAttachment.uploadedAt ? 'on ' + new Date(fileAttachment.uploadedAt).toLocaleString() : ''}">
                📄 ${fileAttachment.name} (${this.formatFileSize(fileAttachment.size)})
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
      setTimeout(() => { element.classList.remove('highlighted'); }, 3000);
    }
  }

  jumpToMessage(messageId) {
    this.highlightMessage(messageId);
  }
}
