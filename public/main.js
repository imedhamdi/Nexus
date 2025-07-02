class NexusChat {
  constructor() {
    this.currentUser = null;
    this.currentChat = null;
    this.socket = null;
    this.peerConnection = null;
    this.localStream = null;
    this.initialize();
  }
  initialize() {
    this.checkAuth();
    this.setupEventListeners();
    this.setupSocket();
  }

  checkAuth() {
    const token = localStorage.getItem('nexus_chat_token');
    if (token) {
      this.validateToken(token);
    } else {
      this.showLoginModal();
    }
  }

  async validateToken(token) {
    try {
      const response = await fetch('/api/users/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        this.currentUser = await response.json();
        this.setupUI();
        this.connectSocket(token);
      } else {
        localStorage.removeItem('nexus_chat_token');
        this.showLoginModal();
      }
    } catch (error) {
      console.error('Token validation error:', error);
      this.showLoginModal();
    }
  }

  showLoginModal() {
    document.getElementById('login-modal').classList.add('active');
  }

  hideLoginModal() {
    document.getElementById('login-modal').classList.remove('active');
  }

  showRegisterModal() {
    document.getElementById('register-modal').classList.add('active');
    document.getElementById('login-modal').classList.remove('active');
  }

  hideRegisterModal() {
    document.getElementById('register-modal').classList.remove('active');
  }

  setupEventListeners() {
    // Auth modals
    document.getElementById('show-register').addEventListener('click', (e) => {
      e.preventDefault();
      this.showRegisterModal();
    });

    document.getElementById('show-login').addEventListener('click', (e) => {
      e.preventDefault();
      this.hideRegisterModal();
      this.showLoginModal();
    });

    // Login form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value;
      const password = document.getElementById('login-password').value;

      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ username, password })
        });

        if (response.ok) {
          const { token } = await response.json();
          localStorage.setItem('nexus_chat_token', token);
          this.hideLoginModal();
          this.validateToken(token);
        } else {
          const error = await response.json();
          this.showToast('Erreur', error.message || 'Échec de la connexion');
        }
      } catch (error) {
        this.showToast('Erreur', 'Une erreur est survenue lors de la connexion');
      }
    });

    // Register form
    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('register-name').value;
      const username = document.getElementById('register-username').value;
      const password = document.getElementById('register-password').value;
      const avatarFile = document.getElementById('avatar-upload').files[0];

      const formData = new FormData();
      formData.append('name', name);
      formData.append('username', username);
      formData.append('password', password);
      if (avatarFile) formData.append('avatar', avatarFile);

      try {
        const response = await fetch('/api/register', {
          method: 'POST',
          body: formData
        });

        if (response.ok) {
          const { token } = await response.json();
          localStorage.setItem('nexus_chat_token', token);
          this.hideRegisterModal();
          this.validateToken(token);
        } else {
          const error = await response.json();
          this.showToast('Erreur', error.message || 'Échec de l\'inscription');
        }
      } catch (error) {
        this.showToast('Erreur', 'Une erreur est survenue lors de l\'inscription');
      }
    });

    // Avatar preview
    document.getElementById('avatar-upload').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const preview = document.getElementById('avatar-preview');
          preview.innerHTML = `<img src="${event.target.result}" alt="Avatar Preview">`;
        };
        reader.readAsDataURL(file);
      }
    });

    // Chat tabs
    document.getElementById('private-tab').addEventListener('click', () => {
      document.getElementById('private-tab').classList.add('active');
      document.getElementById('group-tab').classList.remove('active');
      document.getElementById('private-conversations').classList.remove('hidden');
      document.getElementById('group-conversations').classList.add('hidden');
    });

    document.getElementById('group-tab').addEventListener('click', () => {
      document.getElementById('group-tab').classList.add('active');
      document.getElementById('private-tab').classList.remove('active');
      document.getElementById('group-conversations').classList.remove('hidden');
      document.getElementById('private-conversations').classList.add('hidden');
    });

    // Message input
    document.getElementById('message-input').addEventListener('input', (e) => {
      const sendButton = document.getElementById('send-message');
      sendButton.disabled = e.target.value.trim() === '';
    });

    document.getElementById('message-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (e.target.value.trim() !== '') {
          this.sendMessage();
        }
      }
    });

    document.getElementById('send-message').addEventListener('click', () => {
      this.sendMessage();
    });

    // Call controls
    document.getElementById('end-call').addEventListener('click', () => {
      this.endCall();
    });

    document.getElementById('toggle-mic').addEventListener('click', () => {
      this.toggleMic();
    });

    document.getElementById('toggle-camera').addEventListener('click', () => {
      this.toggleCamera();
    });

    // Incoming call
    document.getElementById('accept-call').addEventListener('click', () => {
      this.acceptCall();
    });

    document.getElementById('reject-call').addEventListener('click', () => {
      this.rejectCall();
    });

    // Cancel reply
    document.getElementById('cancel-reply').addEventListener('click', () => {
      this.cancelReply();
    });
  }

  setupUI() {
    // Set user profile
    document.getElementById('username-display').textContent = this.currentUser.name;
    document.getElementById('user-avatar').src = this.currentUser.avatar || '/images/default-avatar.jpg';

    // Load conversations
    this.loadConversations();

    // Show main UI
    document.querySelector('.app-container').classList.remove('hidden');
  }

  async loadConversations() {
    try {
      // Load private conversations
      const privateResponse = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('nexus_chat_token')}`
        }
      });

      if (privateResponse.ok) {
        const users = await privateResponse.json();
        this.renderPrivateConversations(users);
      }

      // Load group conversations
      const groupResponse = await fetch('/api/groups', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('nexus_chat_token')}`
        }
      });

      if (groupResponse.ok) {
        const groups = await groupResponse.json();
        this.renderGroupConversations(groups);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  }

  renderPrivateConversations(users) {
    const container = document.getElementById('private-conversations');
    container.innerHTML = '';

    users.forEach(user => {
      const conversation = document.createElement('div');
      conversation.className = 'conversation';
      conversation.dataset.userId = user._id;
      conversation.innerHTML = `
            <img src="${user.avatar || '/images/default-avatar.jpg'}" alt="${user.name}" class="conversation-avatar">
            <div class="conversation-info">
                <div class="conversation-name">${user.name}</div>
                <div class="conversation-last-message">${user.lastMessage || ''}</div>
            </div>
            ${user.unreadCount > 0 ? `<div class="conversation-unread">${user.unreadCount}</div>` : ''}
        `;
      conversation.addEventListener('click', () => this.openPrivateChat(user));
      container.appendChild(conversation);
    });
  }

  renderGroupConversations(groups) {
    const container = document.getElementById('group-conversations');
    container.innerHTML = '';

    groups.forEach(group => {
      const conversation = document.createElement('div');
      conversation.className = 'conversation';
      conversation.dataset.groupId = group._id;
      conversation.innerHTML = `
            <img src="${group.avatar || '/images/default-group.jpg'}" alt="${group.name}" class="conversation-avatar">
            <div class="conversation-info">
                <div class="conversation-name">${group.name}</div>
                <div class="conversation-last-message">${group.lastMessage || ''}</div>
            </div>
            ${group.unreadCount > 0 ? `<div class="conversation-unread">${group.unreadCount}</div>` : ''}
        `;
      conversation.addEventListener('click', () => this.openGroupChat(group));
      container.appendChild(conversation);
    });
  }

  openPrivateChat(user) {
    this.currentChat = { type: 'private', id: user._id, name: user.name, avatar: user.avatar };
    this.updateChatHeader();
    this.loadMessages();
  }

  openGroupChat(group) {
    this.currentChat = { type: 'group', id: group._id, name: group.name, avatar: group.avatar };
    this.updateChatHeader();
    this.loadMessages();
  }

  updateChatHeader() {
    const chatHeader = document.querySelector('.chat-header');
    chatHeader.querySelector('#chat-name').textContent = this.currentChat.name;
    chatHeader.querySelector('#chat-avatar').src = this.currentChat.avatar ||
      (this.currentChat.type === 'private' ? '/images/default-avatar.jpg' : '/images/default-group.jpg');

    // Show/hide call buttons
    const audioCallBtn = document.getElementById('audio-call-btn');
    const videoCallBtn = document.getElementById('video-call-btn');

    if (this.currentChat.type === 'private') {
      audioCallBtn.classList.remove('hidden');
      videoCallBtn.classList.remove('hidden');
    } else {
      audioCallBtn.classList.add('hidden');
      videoCallBtn.classList.add('hidden');
    }

    // Show message area
    document.getElementById('welcome-screen').classList.add('hidden');
    document.getElementById('messages-container').classList.remove('hidden');
    document.querySelector('.message-input-container').classList.remove('hidden');
  }

  async loadMessages() {
    try {
      let response;
      if (this.currentChat.type === 'private') {
        response = await fetch(`/api/messages?partner=${this.currentChat.id}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('nexus_chat_token')}`
          }
        });
      } else {
        response = await fetch(`/api/groups/${this.currentChat.id}/messages`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('nexus_chat_token')}`
          }
        });
      }

      if (response.ok) {
        const messages = await response.json();
        this.renderMessages(messages);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }

  renderMessages(messages) {
    const container = document.getElementById('messages-container');
    container.innerHTML = '';

    let lastSender = null;
    let lastMessageTime = null;

    messages.forEach((message, index) => {
      const isGrouped = lastSender === message.sender._id &&
        new Date(message.createdAt) - lastMessageTime < 5 * 60 * 1000;

      const messageElement = document.createElement('div');
      messageElement.className = `message ${message.sender._id === this.currentUser._id ? 'message-sent' : 'message-received'} ${isGrouped ? 'message-grouped' : ''}`;

      if (!isGrouped && message.sender._id !== this.currentUser._id && this.currentChat.type === 'group') {
        messageElement.innerHTML += `<div class="message-sender">${message.sender.name}</div>`;
      }

      if (message.replyTo) {
        messageElement.innerHTML += `<div class="reply-indicator">Réponse à: ${message.replySnippet}</div>`;
      }

      messageElement.innerHTML += `
            <div class="message-content">${message.content}</div>
            <div class="message-time">${new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            <div class="message-actions">
                <button class="message-action" data-action="reply"><i class="fas fa-reply"></i></button>
                ${message.sender._id === this.currentUser._id ? `
                    <button class="message-action" data-action="edit"><i class="fas fa-edit"></i></button>
                    <button class="message-action" data-action="delete"><i class="fas fa-trash"></i></button>
                ` : ''}
                <button class="message-action" data-action="react"><i class="fas fa-smile"></i></button>
            </div>
        `;

      if (message.reactions && Object.keys(message.reactions).length > 0) {
        let reactionsHTML = '<div class="reactions-container">';
        Object.entries(message.reactions).forEach(([emoji, users]) => {
          reactionsHTML += `<div class="reaction">${emoji} ${users.length}</div>`;
        });
        reactionsHTML += '</div>';
        messageElement.innerHTML += reactionsHTML;
      }

      container.appendChild(messageElement);

      // Set up message action listeners
      messageElement.querySelectorAll('.message-action').forEach(button => {
        button.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = button.dataset.action;
          this.handleMessageAction(action, message._id);
        });
      });

      lastSender = message.sender._id;
      lastMessageTime = new Date(message.createdAt);
    });

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  handleMessageAction(action, messageId) {
    switch (action) {
      case 'reply':
        this.prepareReply(messageId);
        break;
      case 'edit':
        this.editMessage(messageId);
        break;
      case 'delete':
        this.deleteMessage(messageId);
        break;
      case 'react':
        this.addReaction(messageId);
        break;
    }
  }

  prepareReply(messageId) {
    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (!messageElement) return;

    const content = messageElement.querySelector('.message-content').textContent;
    const preview = document.getElementById('reply-preview');
    preview.querySelector('.reply-content').textContent = content.length > 50 ? content.substring(0, 50) + '...' : content;
    preview.dataset.messageId = messageId;
    preview.classList.remove('hidden');
    document.getElementById('message-input').focus();
  }

  cancelReply() {
    const preview = document.getElementById('reply-preview');
    preview.classList.add('hidden');
    delete preview.dataset.messageId;
  }

  editMessage(messageId) {
    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (!messageElement) return;

    const content = messageElement.querySelector('.message-content').textContent;
    const input = document.getElementById('message-input');
    input.value = content;
    input.focus();
    input.dataset.editingMessageId = messageId;
  }

  deleteMessage(messageId) {
    if (confirm('Voulez-vous vraiment supprimer ce message ?')) {
      this.socket.emit('delete-message', { messageId });
    }
  }

  addReaction(messageId) {
    const emoji = prompt('Entrez un emoji:');
    if (emoji) {
      this.socket.emit('add-reaction', { messageId, emoji });
    }
  }

  sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();
    if (!content) return;

    const replyPreview = document.getElementById('reply-preview');
    const replyTo = replyPreview.classList.contains('hidden') ? null : replyPreview.dataset.messageId;

    if (this.currentChat.type === 'private') {
      this.socket.emit('send-message', {
        recipient: this.currentChat.id,
        content,
        replyTo
      });
    } else {
      this.socket.emit('send-group-message', {
        groupId: this.currentChat.id,
        content,
        replyTo
      });
    }

    // Clear input
    input.value = '';
    input.dataset.editingMessageId = '';
    document.getElementById('send-message').disabled = true;
    this.cancelReply();
  }

  setupSocket() {
    // Socket will be connected after auth
  }

  connectSocket(token) {
    this.socket = io({
      auth: {
        token: token
      }
    });

    this.socket.on('connect', () => {
      console.log('Connected to Socket.IO server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from Socket.IO server');
    });

    this.socket.on('new-message', (message) => {
      if (this.currentChat && (
        (this.currentChat.type === 'private' && message.sender._id === this.currentChat.id) ||
        (this.currentChat.type === 'group' && message.group._id === this.currentChat.id)
      )) {
        // Add message to current chat
        this.appendMessage(message);
      } else {
        // Show notification
        this.showMessageNotification(message);
      }
    });

    this.socket.on('new-group-message', (message) => {
      if (this.currentChat && this.currentChat.type === 'group' && message.group._id === this.currentChat.id) {
        // Add message to current chat
        this.appendMessage(message);
      } else {
        // Show notification
        this.showMessageNotification(message);
      }
    });

    this.socket.on('message-edited', ({ messageId, content }) => {
      this.updateMessageContent(messageId, content);
    });

    this.socket.on('message-deleted', (messageId) => {
      this.removeMessage(messageId);
    });

    this.socket.on('reaction-updated', ({ messageId, reactions }) => {
      this.updateMessageReactions(messageId, reactions);
    });

    this.socket.on('users-updated', (onlineUsers) => {
      this.updateOnlineStatus(onlineUsers);
    });

    this.socket.on('group-invitation', (group) => {
      this.showGroupInvitation(group);
    });

    this.socket.on('typing', ({ sender }) => {
      this.showTypingIndicator(sender);
    });

    this.socket.on('stop-typing', ({ sender }) => {
      this.hideTypingIndicator(sender);
    });

    this.socket.on('webrtc-offer', ({ sender, offer, isVideo }) => {
      this.handleWebRTCOffer(sender, offer, isVideo);
    });

    this.socket.on('webrtc-answer', ({ sender, answer }) => {
      this.handleWebRTCAnswer(sender, answer);
    });

    this.socket.on('webrtc-ice-candidate', ({ sender, candidate }) => {
      this.handleWebRTCCandidate(sender, candidate);
    });

    this.socket.on('end-call', ({ sender }) => {
      this.endCall();
    });
  }

  appendMessage(message) {
    const container = document.getElementById('messages-container');

    // Play message sound if not from current user
    if (message.sender._id !== this.currentUser._id) {
      document.getElementById('message-sound').play();
    }

    // Check if we should group with previous message
    const lastMessage = container.lastElementChild;
    let isGrouped = false;

    if (lastMessage && lastMessage.classList.contains('message-received') &&
      message.sender._id === lastMessage.dataset.senderId) {
      const lastTime = new Date(lastMessage.dataset.timestamp);
      const currentTime = new Date(message.createdAt);
      isGrouped = (currentTime - lastTime) < 5 * 60 * 1000; // 5 minutes
    }

    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.sender._id === this.currentUser._id ? 'message-sent' : 'message-received'} ${isGrouped ? 'message-grouped' : ''}`;
    messageElement.dataset.messageId = message._id;
    messageElement.dataset.senderId = message.sender._id;
    messageElement.dataset.timestamp = message.createdAt;

    if (!isGrouped && message.sender._id !== this.currentUser._id && this.currentChat.type === 'group') {
      messageElement.innerHTML += `<div class="message-sender">${message.sender.name}</div>`;
    }

    if (message.replyTo) {
      messageElement.innerHTML += `<div class="reply-indicator">Réponse à: ${message.replySnippet}</div>`;
    }

    messageElement.innerHTML += `
        <div class="message-content">${message.content}</div>
        <div class="message-time">${new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        <div class="message-actions">
            <button class="message-action" data-action="reply"><i class="fas fa-reply"></i></button>
            ${message.sender._id === this.currentUser._id ? `
                <button class="message-action" data-action="edit"><i class="fas fa-edit"></i></button>
                <button class="message-action" data-action="delete"><i class="fas fa-trash"></i></button>
            ` : ''}
            <button class="message-action" data-action="react"><i class="fas fa-smile"></i></button>
        </div>
    `;

    if (message.reactions && Object.keys(message.reactions).length > 0) {
      let reactionsHTML = '<div class="reactions-container">';
      Object.entries(message.reactions).forEach(([emoji, users]) => {
        reactionsHTML += `<div class="reaction">${emoji} ${users.length}</div>`;
      });
      reactionsHTML += '</div>';
      messageElement.innerHTML += reactionsHTML;
    }

    container.appendChild(messageElement);

    // Set up message action listeners
    messageElement.querySelectorAll('.message-action').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = button.dataset.action;
        this.handleMessageAction(action, message._id);
      });
    });

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  updateMessageContent(messageId, content) {
    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (messageElement) {
      messageElement.querySelector('.message-content').textContent = content;
      messageElement.classList.add('message-edited');
    }
  }

  removeMessage(messageId) {
    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (messageElement) {
      messageElement.remove();
    }
  }

  updateMessageReactions(messageId, reactions) {
    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (!messageElement) return;

    let reactionsContainer = messageElement.querySelector('.reactions-container');
    if (!reactionsContainer) {
      reactionsContainer = document.createElement('div');
      reactionsContainer.className = 'reactions-container';
      messageElement.appendChild(reactionsContainer);
    } else {
      reactionsContainer.innerHTML = '';
    }

    Object.entries(reactions).forEach(([emoji, users]) => {
      const reaction = document.createElement('div');
      reaction.className = 'reaction';
      reaction.textContent = `${emoji} ${users.length}`;
      reactionsContainer.appendChild(reaction);
    });
  }

  showMessageNotification(message) {
    // Play sound
    document.getElementById('message-sound').play();

    // Create toast
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <img src="${message.sender.avatar || '/images/default-avatar.jpg'}" alt="${message.sender.name}" class="toast-avatar">
        <div class="toast-content">
            <div class="toast-title">${message.sender.name}</div>
            <div class="toast-message">${message.content.length > 50 ? message.content.substring(0, 50) + '...' : message.content}</div>
        </div>
        <button class="toast-close"><i class="fas fa-times"></i></button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    toast.addEventListener('click', () => {
      if (message.recipient) {
        this.openPrivateChat(message.sender);
      } else if (message.group) {
        this.openGroupChat(message.group);
      }
      toast.remove();
    });

    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  updateOnlineStatus(onlineUsers) {
    // Update status indicators in conversation list
    document.querySelectorAll('.conversation').forEach(conversation => {
      const userId = conversation.dataset.userId;
      if (userId && onlineUsers.includes(userId)) {
        conversation.classList.add('online');
      } else {
        conversation.classList.remove('online');
      }
    });
  }

  showGroupInvitation(group) {
    if (confirm(`Vous avez été invité à rejoindre le groupe "${group.name}". Acceptez-vous l'invitation ?`)) {
      fetch(`/api/groups/${group._id}/invitations/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('nexus_chat_token')}`,
          'Content-Type': 'application/json'
        }
      }).then(() => {
        this.loadConversations();
      });
    } else {
      fetch(`/api/groups/${group._id}/invitations/decline`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('nexus_chat_token')}`,
          'Content-Type': 'application/json'
        }
      });
    }
  }

  showTypingIndicator(senderId) {
    if (this.currentChat && this.currentChat.type === 'private' && this.currentChat.id === senderId) {
      const status = document.getElementById('chat-status');
      status.textContent = 'en train d\'écrire...';
    }
  }

  hideTypingIndicator(senderId) {
    if (this.currentChat && this.currentChat.type === 'private' && this.currentChat.id === senderId) {
      const status = document.getElementById('chat-status');
      status.textContent = '';
    }
  }

  showToast(title, message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close"><i class="fas fa-times"></i></button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  // WebRTC functions
  async startCall(isVideo) {
    if (!this.currentChat || this.currentChat.type !== 'private') return;

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo
      });

      document.getElementById('local-video').srcObject = this.localStream;
      if (isVideo) {
        document.getElementById('local-video').style.display = 'block';
      }

      this.peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.emit('webrtc-ice-candidate', {
            recipient: this.currentChat.id,
            candidate: event.candidate
          });
        }
      };

      this.peerConnection.ontrack = (event) => {
        document.getElementById('remote-video').srcObject = event.streams[0];
      };

      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      this.socket.emit('webrtc-offer', {
        recipient: this.currentChat.id,
        offer,
        isVideo
      });

      document.getElementById('call-modal').classList.add('active');
    } catch (error) {
      console.error('Error starting call:', error);
      this.showToast('Erreur', 'Impossible de démarrer l\'appel');
    }
  }

  async handleWebRTCOffer(senderId, offer, isVideo) {
    if (!this.currentChat || this.currentChat.id !== senderId) {
      // Show incoming call notification
      document.getElementById('caller-name').textContent = this.currentChat.name;
      document.getElementById('incoming-call-modal').classList.add('active');
      document.getElementById('call-sound').play();
      return;
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo
      });

      document.getElementById('local-video').srcObject = this.localStream;
      if (isVideo) {
        document.getElementById('local-video').style.display = 'block';
      }

      this.peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.emit('webrtc-ice-candidate', {
            recipient: senderId,
            candidate: event.candidate
          });
        }
      };

      this.peerConnection.ontrack = (event) => {
        document.getElementById('remote-video').srcObject = event.streams[0];
      };

      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this.socket.emit('webrtc-answer', {
        recipient: senderId,
        answer
      });

      document.getElementById('call-modal').classList.add('active');
    } catch (error) {
      console.error('Error handling offer:', error);
      this.showToast('Erreur', 'Impossible de répondre à l\'appel');
    }
  }

  async handleWebRTCAnswer(senderId, answer) {
    if (!this.peerConnection) return;
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async handleWebRTCCandidate(senderId, candidate) {
    if (!this.peerConnection) return;
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }

  async acceptCall() {
    document.getElementById('incoming-call-modal').classList.remove('active');
    document.getElementById('call-sound').pause();
    document.getElementById('call-sound').currentTime = 0;

    const offer = this.pendingOffer;
    const isVideo = this.pendingIsVideo;
    this.pendingOffer = null;
    this.pendingIsVideo = false;

    await this.handleWebRTCOffer(this.pendingCaller, offer, isVideo);
  }

  async rejectCall() {
    document.getElementById('incoming-call-modal').classList.remove('active');
    document.getElementById('call-sound').pause();
    document.getElementById('call-sound').currentTime = 0;
    this.socket.emit('end-call', { recipient: this.pendingCaller });
    this.pendingCaller = null;
    this.pendingOffer = null;
    this.pendingIsVideo = false;
  }

  endCall() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    document.getElementById('remote-video').srcObject = null;
    document.getElementById('local-video').srcObject = null;
    document.getElementById('call-modal').classList.remove('active');
    document.getElementById('incoming-call-modal').classList.remove('active');
    document.getElementById('call-sound').pause();
    document.getElementById('call-sound').currentTime = 0;

    if (this.currentChat) {
      this.socket.emit('end-call', { recipient: this.currentChat.id });
    }
  }

  toggleMic() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const button = document.getElementById('toggle-mic');
        button.innerHTML = audioTrack.enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
      }
    }
  }

  toggleCamera() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const button = document.getElementById('toggle-camera');
        button.innerHTML = videoTrack.enabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
        document.getElementById('local-video').style.display = videoTrack.enabled ? 'block' : 'none';
      }
    }
  }
  }

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
new NexusChat();
});
