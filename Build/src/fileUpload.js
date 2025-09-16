export class FileUploadManager {
  constructor(app) {
    this.app = app;
    this.modal = document.getElementById('upload-modal');
    this.uploadArea = document.getElementById('upload-area');
    this.fileInput = document.getElementById('file-input');
    this.preview = document.getElementById('upload-preview');
    this.selectedFiles = [];
    
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    // File input change
    this.fileInput.addEventListener('change', (e) => {
      this.handleFiles(e.target.files);
    });
    
    // Drag and drop
    this.uploadArea.addEventListener('click', () => {
      this.fileInput.click();
    });
    
    this.uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.uploadArea.classList.add('drag-over');
    });
    
    this.uploadArea.addEventListener('dragleave', (e) => {
      e.preventDefault();
      this.uploadArea.classList.remove('drag-over');
    });
    
    this.uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      this.uploadArea.classList.remove('drag-over');
      this.handleFiles(e.dataTransfer.files);
    });
    
    // Modal background click to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeModal();
      }
    });
  }
  
  openModal() {
    this.modal.style.display = 'block';
    this.selectedFiles = [];
    this.updatePreview();
  }
  
  closeModal() {
    this.modal.style.display = 'none';
    this.selectedFiles = [];
    this.fileInput.value = '';
    this.updatePreview();
  }
  
  handleFiles(fileList) {
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'audio/mpeg', 'audio/wav', 'audio/ogg',
      'application/pdf', 'text/plain',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    for (const file of fileList) {
      if (file.size > maxSize) {
        alert(`File "${file.name}" is too large. Maximum size is 5MB.`);
        continue;
      }
      
      if (!allowedTypes.includes(file.type)) {
        alert(`File type "${file.type}" is not supported.`);
        continue;
      }
      
      // Check if file already selected
      if (this.selectedFiles.find(f => f.name === file.name && f.size === file.size)) {
        continue;
      }
      
      this.selectedFiles.push(file);
    }
    
    this.updatePreview();
  }
  
  updatePreview() {
    if (this.selectedFiles.length === 0) {
      this.preview.style.display = 'none';
      return;
    }
    
    this.preview.style.display = 'block';
    
    const html = this.selectedFiles.map((file, index) => {
      const icon = this.getFileIcon(file.type);
      const size = this.formatFileSize(file.size);
      
      return `
        <div class="preview-item">
          <div class="preview-icon">${icon}</div>
          <div class="preview-info">
            <div class="preview-name">${file.name}</div>
            <div class="preview-size">${size}</div>
          </div>
          <button class="preview-remove" onclick="app.fileManager.removeFile(${index})">Remove</button>
        </div>
      `;
    }).join('');
    
    const uploadBtn = `
      <div style="margin-top: 16px; text-align: center;">
        <button onclick="app.fileManager.uploadFiles()" style="
          background: linear-gradient(90deg, #2196F3, #21CBF3);
          color: white;
          border: 1px outset #2196F3;
          padding: 8px 16px;
          cursor: pointer;
          font-size: 14px;
        ">Upload Files</button>
      </div>
    `;
    
    this.preview.innerHTML = html + uploadBtn;
  }
  
  removeFile(index) {
    this.selectedFiles.splice(index, 1);
    this.updatePreview();
  }
  
  getFileIcon(mimeType) {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.includes('word')) return '📝';
    if (mimeType === 'text/plain') return '📄';
    return '📎';
  }
  
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  async uploadFiles() {
    if (this.selectedFiles.length === 0) return;
    
    try {
      // Upload each file to the server
      for (const file of this.selectedFiles) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('user', this.app.user);
        formData.append('room', this.app.elements.roomSelect.value);
        
        // Upload to server
        const uploadRes = await fetch(`${this.app.baseURL}/upload`, {
          method: 'POST',
          body: formData
        });
        
        if (!uploadRes.ok) {
          const error = await uploadRes.json();
          throw new Error(error.error || 'Upload failed');
        }
        
        const uploadData = await uploadRes.json();
        
        // Create file message data
        const fileData = {
          name: uploadData.originalName || file.name,
          type: file.type,
          size: file.size,
          url: uploadData.url,
          filename: uploadData.filename,
          uploadedBy: this.app.user,
          uploadedAt: uploadData.uploadedAt
        };
        
        // Send as special FILE message
        const fileMessage = `FILE:${JSON.stringify(fileData)}`;
        
        const room = this.app.elements.roomSelect.value;
        const res = await fetch(`${this.app.baseURL}/chat/${room}?user=${encodeURIComponent(this.app.user)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: fileMessage }),
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Failed to send file message: ${errorText}`);
        }
      }
      
      // Refresh messages to show uploaded files
      await this.app.fetchMessages(true);
      
      // Close modal
      this.closeModal();
      
      // Show success message
      alert(`${this.selectedFiles.length} file(s) uploaded successfully!`);
      
    } catch(e) {
      console.error('Upload failed:', e);
      alert('File upload failed: ' + e.message);
    }
  }
  
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
  
  // Handle dropped files in chat area (drag & drop anywhere)
  setupChatDropZone() {
    const chatBox = this.app.elements.chatBox;
    
    chatBox.addEventListener('dragover', (e) => {
      e.preventDefault();
      chatBox.style.background = '#f0f8ff';
    });
    
    chatBox.addEventListener('dragleave', (e) => {
      e.preventDefault();
      chatBox.style.background = '';
    });
    
    chatBox.addEventListener('drop', (e) => {
      e.preventDefault();
      chatBox.style.background = '';
      
      if (e.dataTransfer.files.length > 0) {
        this.openModal();
        setTimeout(() => {
          this.handleFiles(e.dataTransfer.files);
        }, 100);
      }
    });
  }
}