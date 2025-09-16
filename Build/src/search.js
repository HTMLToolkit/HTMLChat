export class SearchManager {
  constructor(app) {
    this.app = app;
    this.modal = document.getElementById('search-modal');
    this.searchInput = document.getElementById('search-input');
    this.searchResults = document.getElementById('search-results');
    this.userFilter = document.getElementById('search-user');
    this.usernameFilter = document.getElementById('search-username');
    
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    // Search input
    this.searchInput.addEventListener('input', () => {
      this.performSearch();
    });
    
    // User filter checkbox
    this.userFilter.addEventListener('change', () => {
      this.usernameFilter.disabled = !this.userFilter.checked;
      if (!this.userFilter.checked) {
        this.usernameFilter.value = '';
      }
      this.performSearch();
    });
    
    // Username filter
    this.usernameFilter.addEventListener('input', () => {
      if (this.userFilter.checked) {
        this.performSearch();
      }
    });
    
    // Enter key to search
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.performSearch();
      }
    });
    
    // Modal background click to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeModal();
      }
    });
    
    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal.style.display === 'block') {
        this.closeModal();
      }
    });
  }
  
  openModal() {
    this.modal.style.display = 'block';
    this.searchInput.focus();
    this.searchResults.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">Enter search terms above</div>';
  }
  
  closeModal() {
    this.modal.style.display = 'none';
    this.searchInput.value = '';
    this.usernameFilter.value = '';
    this.userFilter.checked = false;
    this.usernameFilter.disabled = true;
    this.searchResults.innerHTML = '';
  }
  
  performSearch() {
    const query = this.searchInput.value.trim().toLowerCase();
    if (!query) {
      this.searchResults.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">Enter search terms above</div>';
      return;
    }
    
    // Get all messages from current room
    const currentRoom = this.app.elements.roomSelect.value;
    const messages = this.app.loadFromStorage(`htmlchat_${currentRoom}`) || [];
    
    // Filter messages
    let filteredMessages = messages.filter(msg => {
      // Text search
      const textMatch = msg.text.toLowerCase().includes(query) || 
                       msg.user.toLowerCase().includes(query);
      
      // User filter
      if (this.userFilter.checked && this.usernameFilter.value.trim()) {
        const userMatch = msg.user.toLowerCase().includes(this.usernameFilter.value.trim().toLowerCase());
        return textMatch && userMatch;
      }
      
      return textMatch;
    });
    
    // Sort by time (most recent first)
    filteredMessages = filteredMessages.sort((a, b) => b.time - a.time);
    
    // Limit results
    filteredMessages = filteredMessages.slice(0, 50);
    
    this.displayResults(filteredMessages, query);
  }
  
  displayResults(messages, query) {
    if (messages.length === 0) {
      this.searchResults.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">No messages found</div>';
      return;
    }
    
    const html = messages.map((msg, index) => {
      const date = new Date(msg.time).toLocaleString();
      const color = this.app.messageRenderer.getUserColor(msg.user);
      
      // Highlight search terms
      let highlightedText = this.highlightSearchTerms(msg.text, query);
      let highlightedUser = this.highlightSearchTerms(msg.user, query);
      
      const messageId = `msg-${msg.time}-${index}`;
      
      return `
        <div class="search-result-item" onclick="app.searchManager.jumpToMessage('${messageId}', ${msg.time})">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="color: ${color}; font-weight: bold;">${highlightedUser}</span>
            <span style="color: #666; font-size: 12px;">${date}</span>
          </div>
          <div>${highlightedText}</div>
        </div>
      `;
    }).join('');
    
    const headerHtml = `
      <div style="padding: 8px; background: #f0f0f0; border-bottom: 1px solid #ddd; font-weight: bold;">
        Found ${messages.length} message${messages.length === 1 ? '' : 's'}
      </div>
    `;
    
    this.searchResults.innerHTML = headerHtml + html;
  }
  
  highlightSearchTerms(text, query) {
    if (!query) return text;
    
    // Escape special regex characters
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    
    return text.replace(regex, '<span style="background: yellow; color: black;">$1</span>');
  }
  
  jumpToMessage(messageId, timestamp) {
    // Close search modal
    this.closeModal();
    
    // Try to find the message in current chat
    const existingMessage = document.getElementById(messageId);
    if (existingMessage) {
      this.app.messageRenderer.highlightMessage(messageId);
      return;
    }
    
    // If not found, refresh messages and then try to highlight
    this.app.fetchMessages(true).then(() => {
      setTimeout(() => {
        // Generate the message ID that would be created
        const messages = this.app.loadFromStorage(`htmlchat_${this.app.elements.roomSelect.value}`) || [];
        const messageIndex = messages.findIndex(msg => msg.time === timestamp);
        if (messageIndex !== -1) {
          const generatedId = `msg-${timestamp}-${messageIndex}`;
          this.app.messageRenderer.highlightMessage(generatedId);
        }
      }, 500);
    });
  }
  
  // Search within specific time range (future feature)
  searchByTimeRange(startDate, endDate) {
    // This could be implemented for advanced search features
    console.log('Time range search not implemented yet');
  }
  
  // Search by message type (future feature)
  searchByType(type) {
    // Could search for files, images, URLs, etc.
    console.log('Type search not implemented yet');
  }
  
  // Export search results
  exportSearchResults(messages, query) {
    const exportData = {
      query: query,
      room: this.app.elements.roomSelect.value,
      searchDate: new Date().toISOString(),
      resultCount: messages.length,
      results: messages
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `search-results-${query.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}