export class FileUploadManager {
  constructor(app) {
    this.app = app;
    this.modal = document.getElementById('upload-modal');
    this.uploadArea = document.getElementById('upload-area');
    this.fileInput = document.getElementById('file-input');
    this.preview = document.getElementById('upload-preview');
    this.selectedFiles = [];
    this.uploading = false; // Prevent multiple uploads
    
    this.setupEventListeners();
  }

  // Helper method to escape HTML to prevent injection
  escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Helper method to create lucide icons (delegates to app)
  createIcon(iconName, options = {}) {
    if (!this.app || typeof this.app.createIconHTML !== 'function') {
      console.warn('App.createIconHTML not available');
      return '';
    }
    return this.app.createIconHTML(iconName, options);
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
      const escapedName = this.escapeHtml(file.name);
      
      return `
        <div class="preview-item" data-file-index="${index}">
          <div class="preview-icon">${icon}</div>
          <div class="preview-info">
            <div class="preview-name">${escapedName}</div>
            <div class="preview-size">${size}</div>
          </div>
          <button class="preview-remove" data-file-index="${index}">Remove</button>
        </div>
      `;
    }).join('');
    
    const uploadBtn = `
      <div style="margin-top: 16px; text-align: center;">
        <button id="uploadBtn" style="
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
    
    // Add event listeners for remove buttons
    this.preview.querySelectorAll('.preview-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.getAttribute('data-file-index'));
        this.removeFile(index);
      });
    });
    
    // Add event listener for upload button
    const uploadButton = document.getElementById('uploadBtn');
    if (uploadButton) {
      uploadButton.addEventListener('click', () => {
        this.uploadFiles();
      });
    }
  }
  
  removeFile(index) {
    this.selectedFiles.splice(index, 1);
    this.updatePreview();
  }
  
  getFileIcon(mimeType) {
    if (mimeType.startsWith('image/')) return this.createIcon('image', { size: 24 });
    if (mimeType.startsWith('audio/')) return this.createIcon('music', { size: 24 });
    if (mimeType === 'application/pdf') return this.createIcon('file-text', { size: 24 });
    if (mimeType.includes('word')) return this.createIcon('file-text', { size: 24 });
    if (mimeType === 'text/plain') return this.createIcon('file-text', { size: 24 });
    return this.createIcon('paperclip', { size: 24 });
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
    
    // Prevent multiple uploads
    if (this.uploading) {
      console.warn('Upload already in progress');
      return;
    }
    
    this.uploading = true;
    
    try {
      // Show upload progress
      this.updatePreview();
      const uploadBtn = document.getElementById('uploadBtn');
      if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Uploading...';
      }
      
      // Upload each file to the server
      for (let i = 0; i < this.selectedFiles.length; i++) {
        const file = this.selectedFiles[i];
        
        try {
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
          
          // Update progress
          if (uploadBtn) {
            uploadBtn.textContent = `Uploaded ${i + 1}/${this.selectedFiles.length}...`;
          }
          
        } catch (fileError) {
          console.error(`Failed to upload ${file.name}:`, fileError);
          alert(`Failed to upload ${file.name}: ${fileError.message}`);
          // Continue with other files
        }
      }
      
      // Refresh messages to show uploaded files
      await this.app.fetchMessages(true);
      
      // Capture the number of processed files before closing modal
      const processedCount = this.selectedFiles.length;
      
      // Close modal
      this.closeModal();
      
      // Show success message
      alert(`Upload completed! ${processedCount} file(s) processed.`);
      
    } catch(e) {
      console.error('Upload failed:', e);
      alert('File upload failed: ' + e.message);
    } finally {
      this.uploading = false;
      
      // Reset upload button
      const uploadBtn = document.getElementById('uploadBtn');
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload Files';
      }
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