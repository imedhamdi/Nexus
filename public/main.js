/**
 * Nexus Chat - Client JavaScript
 * Application de messagerie sécurisée avec WebSocket et WebRTC
 */

// Configuration globale
const config = {
  apiBaseUrl: window.location.origin,
  socketOptions: {
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    auth: {
      token: localStorage.getItem('nexus_token')
    }
  },
  messageLimit: 50,
  typingTimeout: 2000,
  toastDuration: 5000
};

// Éléments DOM principaux
const dom = {
  authContainer: document.getElementById('auth-container'),
  appContainer: document.getElementById('app-container'),
  loginCard: document.getElementById('login-card'),
  registerCard: document.getElementById('register-card'),
  showRegister: document.getElementById('show-register'),
  showLogin: document.getElementById('show-login'),
  loginForm: document.getElementById('login-form'),
  registerForm: document.getElementById('register-form'),
  avatarInput: document.getElementById('avatar-input'),
  avatarPreview: document.getElementById('avatar-preview'),
  messageInput: document.getElementById('message-input'),
  messagesContainer: document.getElementById('messages-container'),
  contactsList: document.getElementById('contacts-list'),
  groupsList: document.getElementById('groups-list'),
  userAvatar: document.getElementById('user-avatar'),
  userName: document.getElementById('user-name'),
  userUsername: document.getElementById('user-username'),
  chatPartnerAvatar: document.getElementById('chat-partner-avatar'),
  chatPartnerName: document.getElementById('chat-partner-name'),
  chatPartnerStatus: document.getElementById('chat-partner-status-text'),
  sendBtn: document.getElementById('send-btn'),
  replyPreview: document.getElementById('reply-preview'),
  replySnippet: document.getElementById('reply-snippet'),
  cancelReply: document.getElementById('cancel-reply'),
  ttlSelect: document.getElementById('ttl-select'),
  menuBtn: document.querySelector('.menu-btn'),
  sidebar: document.querySelector('.sidebar'),
  sidebarOverlay: document.querySelector('.sidebar-overlay'),
  sidebarCloseBtn: document.querySelector('.sidebar-close-btn'),
  newGroupBtn: document.getElementById('new-group-btn'),
  groupModal: document.getElementById('group-modal'),
  closeGroupModal: document.getElementById('close-group-modal'),
  createGroupForm: document.getElementById('create-group-form'),
  attachBtn: document.getElementById('attach-btn'),
  fileInput: document.getElementById('file-input'),
  contactsModal: document.getElementById('contacts-modal'),
  closeContactsModal: document.getElementById('close-contacts-modal'),
  modalContactsList: document.getElementById('modal-contacts-list'),
  contactsLink: document.getElementById('contacts-link'),
  settingsLink: document.getElementById('settings-link'),
  callContainer: document.getElementById('call-container'),
  callPreviewContainer: document.getElementById('call-preview-container'),
  localVideo: document.getElementById('local-video'),
  remoteVideo: document.getElementById('remote-video'),
  previewVideo: document.getElementById('preview-video'),
  hangupBtn: document.getElementById('hangup-btn'),
  hangupPreviewBtn: document.getElementById('hangup-preview-btn'),
  muteBtn: document.getElementById('mute-btn'),
  videoBtn: document.getElementById('video-btn'),
  callPartnerName: document.getElementById('call-partner-name'),
  callStatus: document.getElementById('call-status'),
  toastContainer: document.getElementById('toast-container'),
  messageSound: document.getElementById('message-sound'),
  callSound: document.getElementById('call-sound')
};

/**
 * Joue un élément audio avec une solution de secours utilisant Web Audio API
 */
function playAudio(element) {
  if (!element) return;
  const playPromise = element.play();
  if (playPromise && playPromise.catch) {
    playPromise.catch(() => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 440;
        osc.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
        osc.onended = () => ctx.close();
      } catch (err) {
        console.error('Audio fallback error:', err);
      }
    });
  }
}

// État de l'application
const state = {
  currentUser: null,
  currentChat: null,
  currentGroup: null,
  contacts: [],
  groups: [],
  messages: [],
  typingUsers: new Set(),
  replyTo: null,
  socket: null,
  peerConnection: null,
  localStream: null,
  remoteStream: null,
  callData: null,
  isCaller: false,
  isMuted: false,
  isVideoOff: false,
  iceServers: []
};

/**
 * Initialisation de l'application
 */
function init() {
  // Vérifier l'authentification au chargement
  checkAuth();
  
  // Écouteurs d'événements pour l'authentification
  setupAuthListeners();
  
  // Écouteurs d'événements pour l'interface principale
  setupAppListeners();
  
  // Initialiser la configuration WebRTC
  fetchWebRTCConfig();
}

/**
 * Vérifie si l'utilisateur est authentifié et charge l'interface appropriée
 */
async function checkAuth() {
  const token = localStorage.getItem('nexus_token');
  if (!token) return;
  
  try {
    const response = await fetch(`${config.apiBaseUrl}/api/users/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      const user = await response.json();
      state.currentUser = user;
      showAppInterface();
      connectSocket();
    } else {
      localStorage.removeItem('nexus_token');
    }
  } catch (err) {
    console.error('Erreur de vérification du token:', err);
    localStorage.removeItem('nexus_token');
  }
}

/**
 * Configure les écouteurs d'événements pour l'authentification
 */
function setupAuthListeners() {
  // Basculer entre login et register
  dom.showRegister.addEventListener('click', (e) => {
    e.preventDefault();
    dom.loginCard.classList.add('hidden');
    dom.registerCard.classList.remove('hidden');
  });
  
  dom.showLogin.addEventListener('click', (e) => {
    e.preventDefault();
    dom.registerCard.classList.add('hidden');
    dom.loginCard.classList.remove('hidden');
  });
  
  // Gestion du formulaire de login
  dom.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    try {
      const response = await fetch(`${config.apiBaseUrl}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });
      
      if (response.ok) {
        const { token, user } = await response.json();
        localStorage.setItem('nexus_token', token);
        state.currentUser = user;
        showAppInterface();
        connectSocket();
      } else {
        const { error } = await response.json();
        showToast(error, 'error');
      }
    } catch (err) {
      showToast('Erreur de connexion', 'error');
      console.error('Login error:', err);
    }
  });
  
  // Gestion du formulaire d'inscription
  dom.registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('register-name').value;
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;

    const formData = new FormData();
    formData.append('name', name);
    formData.append('username', username);
    formData.append('password', password);
    if (dom.avatarInput.files[0]) {
      formData.append('avatar', dom.avatarInput.files[0]);
    }

    try {
      const response = await fetch(`${config.apiBaseUrl}/api/register`, {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        const { token, user } = await response.json();
        localStorage.setItem('nexus_token', token);
        state.currentUser = user;
        showAppInterface();
        connectSocket();
      } else {
        const { error } = await response.json();
        showToast(error, 'error');
      }
    } catch (err) {
      showToast('Erreur d\'inscription', 'error');
      console.error('Register error:', err);
    }
  });
  
  // Gestion de l'upload d'avatar
  dom.avatarInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      dom.avatarPreview.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Configure les écouteurs d'événements pour l'interface principale
 */
function setupAppListeners() {
  // Menu mobile
  dom.menuBtn.addEventListener('click', () => {
    dom.sidebar.classList.add('active');
    dom.sidebarOverlay.classList.add('active');
  });
  
  dom.sidebarCloseBtn.addEventListener('click', () => {
    dom.sidebar.classList.remove('active');
    dom.sidebarOverlay.classList.remove('active');
  });
  
  dom.sidebarOverlay.addEventListener('click', () => {
    dom.sidebar.classList.remove('active');
    dom.sidebarOverlay.classList.remove('active');
  });

  // Gestion de l'attachement de fichier
  dom.attachBtn.addEventListener('click', () => {
    dom.fileInput.click();
  });

  dom.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      uploadFile(file);
    }
    e.target.value = '';
  });

  // Ouverture de la modale des contacts
  dom.contactsLink.addEventListener('click', (e) => {
    e.preventDefault();
    dom.contactsModal.classList.add('active');
    dom.contactsModal.classList.remove('hidden');
  });

  dom.closeContactsModal.addEventListener('click', () => {
    dom.contactsModal.classList.remove('active');
    dom.contactsModal.classList.add('hidden');
  });

  dom.contactsModal.addEventListener('click', (e) => {
    if (e.target === dom.contactsModal) {
      dom.contactsModal.classList.remove('active');
      dom.contactsModal.classList.add('hidden');
    }
  });

  dom.settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    showToast('Fonctionnalité à venir');
  });
  
  // Gestion de l'envoi de message
  dom.messageInput.addEventListener('input', () => {
    const hasText = dom.messageInput.value.trim().length > 0;
    dom.sendBtn.disabled = !hasText;
    
    // Envoyer l'événement "typing"
    if (hasText && state.currentChat) {
      state.socket.emit('typing', { recipient: state.currentChat.id });
      clearTimeout(state.typingTimeout);
      state.typingTimeout = setTimeout(() => {
        state.socket.emit('stop-typing', { recipient: state.currentChat.id });
      }, config.typingTimeout);
    }
  });
  
  dom.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (dom.messageInput.value.trim() && !dom.sendBtn.disabled) {
        sendMessage();
      }
    }
  });
  
  dom.sendBtn.addEventListener('click', sendMessage);
  
  // Annuler la réponse à un message
  dom.cancelReply.addEventListener('click', () => {
    state.replyTo = null;
    dom.replyPreview.classList.add('hidden');
  });
  
  // Nouveau groupe
  dom.newGroupBtn.addEventListener('click', () => {
    dom.groupModal.classList.add('active');
  });
  
  dom.closeGroupModal.addEventListener('click', () => {
    dom.groupModal.classList.remove('active');
  });
  
  dom.createGroupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('group-name').value;
    const avatar = document.getElementById('group-avatar').value;
    const members = document.getElementById('group-members').value
      .split(',')
      .map(m => m.trim())
      .filter(m => m.length > 0);
    
    try {
      const response = await fetch(`${config.apiBaseUrl}/api/groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('nexus_token')}`
        },
        body: JSON.stringify({ name, avatar, usernames: members })
      });
      
      if (response.ok) {
        dom.groupModal.classList.remove('active');
        dom.createGroupForm.reset();
        showToast('Groupe créé avec succès', 'success');
        loadGroups();
      } else {
        const { error } = await response.json();
        showToast(error, 'error');
      }
    } catch (err) {
      showToast('Erreur lors de la création du groupe', 'error');
      console.error('Create group error:', err);
    }
  });
  
  // Appels WebRTC
  document.querySelector('.chat-action-btn.call').addEventListener('click', () => {
    startCall(false);
  });
  
  document.querySelector('.chat-action-btn.video').addEventListener('click', () => {
    startCall(true);
  });
  
  dom.hangupBtn.addEventListener('click', endCall);
  dom.hangupPreviewBtn.addEventListener('click', endCall);
  dom.muteBtn.addEventListener('click', toggleMute);
  dom.videoBtn.addEventListener('click', toggleVideo);
}

/**
 * Affiche l'interface principale de l'application
 */
function showAppInterface() {
  dom.authContainer.classList.add('hidden');
  dom.appContainer.classList.remove('hidden');
  
  // Charger les données utilisateur
  loadUserData();
  
  // Charger les contacts et groupes
  loadContacts();
  loadGroups();
}

/**
 * Charge les données de l'utilisateur connecté
 */
async function loadUserData() {
  if (!state.currentUser) return;
  
  dom.userName.textContent = state.currentUser.name;
  dom.userUsername.textContent = `@${state.currentUser.username}`;
  dom.userAvatar.src = state.currentUser.avatar || 'https://i.pravatar.cc/150';
}

/**
 * Charge la liste des contacts
 */
async function loadContacts() {
  try {
    const response = await fetch(`${config.apiBaseUrl}/api/users`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('nexus_token')}`
      }
    });
    
    if (response.ok) {
      state.contacts = await response.json();
      renderContactsModal();
    }
  } catch (err) {
    console.error('Erreur de chargement des contacts:', err);
  }
}

/**
 * Affiche les conversations récentes dans la sidebar
 * (à implémenter ultérieurement)
 */
function renderSidebarConversations() {
  // Future implementation
}

function renderContactsModal() {
  dom.modalContactsList.innerHTML = '';
  if (!state.contacts || state.contacts.length === 0) {
    dom.modalContactsList.innerHTML = '<p>Aucun contact trouvé.</p>';
    return;
  }

  state.contacts.forEach(contact => {
    const contactEl = document.createElement('div');
    contactEl.className = 'modal-contact-item';
    contactEl.dataset.id = contact.id;

    contactEl.innerHTML = `
        <div class="contact-avatar">
            <img src="${contact.avatar || 'https://i.pravatar.cc/150'}" alt="Avatar de ${contact.name}">
        </div>
        <div class="contact-info">
            <div class="contact-name">${contact.name}</div>
            <div class="contact-username">@${contact.username}</div>
        </div>
        <div class="contact-status-indicator">
            <span class="status-dot ${contact.online ? 'online' : 'offline'}"></span>
            <span>${contact.online ? 'En ligne' : 'Hors ligne'}</span>
        </div>
    `;

    contactEl.addEventListener('click', () => {
      const selectedContact = state.contacts.find(c => c.id === contact.id);
      if (selectedContact) {
        selectChat(selectedContact);
        dom.contactsModal.classList.remove('active');
        dom.contactsModal.classList.add('hidden');
      }
    });

    dom.modalContactsList.appendChild(contactEl);
  });
}

/**
 * Charge la liste des groupes
 */
async function loadGroups() {
  try {
    const response = await fetch(`${config.apiBaseUrl}/api/groups`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('nexus_token')}`
      }
    });
    
    if (response.ok) {
      state.groups = await response.json();
      renderGroups();
    }
  } catch (err) {
    console.error('Erreur de chargement des groupes:', err);
  }
}

/**
 * Affiche la liste des groupes dans le DOM
 */
function renderGroups() {
  dom.groupsList.innerHTML = '';

  state.groups.forEach(group => {
    const groupEl = document.createElement('div');
    groupEl.className = 'contact';
    if (state.currentGroup && state.currentGroup.id === group.id) groupEl.classList.add('active');
    groupEl.dataset.id = group.id;
    groupEl.innerHTML = `
      <div class="contact-avatar">
        <img src="${group.avatar || 'https://i.pravatar.cc/150'}" alt="Avatar du groupe ${group.name}">
      </div>
      <div class="contact-info">
        <div class="contact-name">${group.name}</div>
        <div class="contact-last-msg">${group.lastMessage || ''}</div>
      </div>
      ${group.unreadCount ? `<div class="unread-count">${group.unreadCount}</div>` : ''}
    `;
    
    groupEl.addEventListener('click', () => {
      selectGroup(group);
    });
    
    dom.groupsList.appendChild(groupEl);
  });
}

/**
 * Sélectionne une conversation avec un contact
 */
async function selectChat(contact) {
  state.currentChat = contact;
  state.currentGroup = null;

  document.querySelectorAll('#groups-list .contact').forEach(c => c.classList.remove('active'));
  
  // Mettre à jour l'interface
  dom.chatPartnerName.textContent = contact.name;
  dom.chatPartnerAvatar.src = contact.avatar || 'https://i.pravatar.cc/150';
  dom.chatPartnerStatus.querySelector('span').textContent = contact.online ? 'En ligne' : 'Hors ligne';
  dom.chatPartnerStatus.querySelector('.status-dot').className = `status-dot ${contact.online ? 'online' : 'offline'}`;
  
  // Charger les messages
  await loadMessages(contact.id);
  
  // Marquer les messages comme lus
  if (state.socket) {
    state.socket.emit('mark-messages-read', { sender: contact.id });
  }
  
  // Fermer la sidebar sur mobile
  dom.sidebar.classList.remove('active');
  dom.sidebarOverlay.classList.remove('active');
}

/**
 * Sélectionne une conversation de groupe
 */
async function selectGroup(group) {
  state.currentGroup = group;
  state.currentChat = null;

  document.querySelectorAll('#groups-list .contact').forEach(c => c.classList.remove('active'));
  const active = dom.groupsList.querySelector(`[data-id="${group.id}"]`);
  if (active) active.classList.add('active');

  
  // Mettre à jour l'interface
  dom.chatPartnerName.textContent = group.name;
  dom.chatPartnerAvatar.src = group.avatar || 'https://i.pravatar.cc/150';
  dom.chatPartnerStatus.querySelector('span').textContent = `${group.memberCount} membres`;
  dom.chatPartnerStatus.querySelector('.status-dot').className = 'status-dot';
  
  // Charger les messages
  await loadMessages(group.id, true);
  
  // Marquer les messages comme lus
  if (state.socket) {
    state.socket.emit('mark-group-messages-read', { groupId: group.id });
  }
  
  // Fermer la sidebar sur mobile
  dom.sidebar.classList.remove('active');
  dom.sidebarOverlay.classList.remove('active');
}

/**
 * Charge les messages pour une conversation
 */
async function loadMessages(partnerId, isGroup = false) {
  try {
    const url = isGroup 
      ? `${config.apiBaseUrl}/api/groups/${partnerId}/messages`
      : `${config.apiBaseUrl}/api/messages?partner=${partnerId}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('nexus_token')}`
      }
    });
    
    if (response.ok) {
      const messages = await response.json();
      state.messages = messages;
      renderMessages();
      scrollToBottom();
    }
  } catch (err) {
    console.error('Erreur de chargement des messages:', err);
  }
}

/**
 * Affiche les messages dans le DOM
 */
function renderMessages() {
  dom.messagesContainer.innerHTML = '';
  
  if (state.messages.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'empty-messages';
    emptyMsg.textContent = 'Aucun message pour le moment. Envoyez le premier message !';
    dom.messagesContainer.appendChild(emptyMsg);
    return;
  }
  
  let currentDate = null;
  
  state.messages.forEach((message, index) => {
    // Ajouter un séparateur de date si nécessaire
    const messageDate = new Date(message.createdAt).toDateString();
    if (messageDate !== currentDate) {
      currentDate = messageDate;
      const dateSeparator = document.createElement('div');
      dateSeparator.className = 'date-separator';
      dateSeparator.textContent = formatDate(message.createdAt);
      dom.messagesContainer.appendChild(dateSeparator);
    }
    
    const messageEl = document.createElement('div');
    messageEl.className = `message ${message.sender === state.currentUser.username ? 'sent' : 'received'}`;
    messageEl.setAttribute('role', 'listitem');
    messageEl.dataset.id = message.id;
    
    let contentHTML = '';
    if (message.deleted) {
      contentHTML = '<div class="message-content deleted">Message supprimé</div>';
    } else if (message.type === 'text') {
      contentHTML = `<div class="message-content">${escapeHtml(message.content)}</div>`;
    } else if (message.type === 'image') {
      contentHTML = `
        <div class="message-content">
          <img src="${message.fileUrl}" alt="Image envoyée" class="message-image">
        </div>
      `;
    } else {
      contentHTML = `
        <div class="message-content">
          <div class="message-file">
            <i class="fas fa-file-alt"></i>
            <a href="${message.fileUrl}" download>${message.content}</a>
          </div>
        </div>
      `;
    }
    
    // Ajouter la réponse si elle existe
    if (message.replyTo && !message.deleted) {
      contentHTML = `
        <div class="reply-indicator">En réponse à: ${message.replySnippet || ''}</div>
        ${contentHTML}
      `;
    }
    
    // Ajouter les réactions si elles existent
    if (message.reactions && Object.keys(message.reactions).length > 0) {
      const reactionsHTML = Object.entries(message.reactions)
        .map(([emoji, users]) => {
          const userReacted = users.includes(state.currentUser.id);
          return `<span class="reaction ${userReacted ? 'user-reacted' : ''}" data-emoji="${emoji}">${emoji} ${users.length}</span>`;
        })
        .join('');
      
      contentHTML += `<div class="reactions">${reactionsHTML}</div>`;
    }
    
    messageEl.innerHTML = `
      <div class="message-wrapper">
        ${contentHTML}
        <div class="message-info">
          <span class="timestamp">${formatTime(message.createdAt)}</span>
          ${message.edited ? '<span class="edited">(modifié)</span>' : ''}
          ${message.sender === state.currentUser.username ? `<i class="fas fa-check read-receipt ${message.read ? 'read' : ''}"></i>` : ''}
        </div>
      </div>
    `;
    
    // Ajouter les actions pour les messages envoyés
    if (message.sender === state.currentUser.username && !message.deleted) {
      const actions = document.createElement('div');
      actions.className = 'message-actions';
      actions.innerHTML = `
        <button class="message-action-btn" aria-label="Répondre" data-action="reply">
          <i class="fas fa-reply"></i>
        </button>
        <button class="message-action-btn" aria-label="Réaction" data-action="react">
          <i class="fas fa-smile"></i>
        </button>
        ${message.type === 'text' ? `
          <button class="message-action-btn" aria-label="Modifier" data-action="edit">
            <i class="fas fa-edit"></i>
          </button>
        ` : ''}
        <button class="message-action-btn" aria-label="Supprimer" data-action="delete">
          <i class="fas fa-trash"></i>
        </button>
      `;
      
      actions.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleMessageAction(message, btn.dataset.action, btn);
        });
      });
      
      messageEl.querySelector('.message-wrapper').appendChild(actions);
    }
    
    // Gérer les réactions pour les messages reçus
    if (message.sender !== state.currentUser.username && !message.deleted) {
      messageEl.addEventListener('click', (e) => {
        if (e.target.classList.contains('reaction')) {
          const emoji = e.target.dataset.emoji;
          state.socket.emit('add-reaction', { messageId: message.id, emoji });
        }
      });
    }
    
    dom.messagesContainer.appendChild(messageEl);
  });
}

/**
 * Gère les actions sur les messages (répondre, modifier, supprimer, etc.)
 */
function handleMessageAction(message, action, btn) {
  switch (action) {
    case 'reply':
      state.replyTo = message.id;
      dom.replySnippet.textContent = message.content.substring(0, 50) + (message.content.length > 50 ? '...' : '');
      dom.replyPreview.classList.remove('hidden');
      dom.messageInput.focus();
      break;
      
    case 'react':
      const picker = document.createElement('div');
      picker.className = 'reaction-picker';
      picker.style.background = '#333';
      picker.style.padding = '4px';
      picker.style.borderRadius = '6px';
      picker.style.display = 'flex';
      picker.style.gap = '4px';
      ['👍','❤️','😂','😢','😮'].forEach(em => {
        const span = document.createElement('span');
        span.className = 'reaction-option';
        span.textContent = em;
        span.style.cursor = 'pointer';
        span.addEventListener('click', () => {
          state.socket.emit('add-reaction', { messageId: message.id, emoji: em });
          picker.remove();
        });
        picker.appendChild(span);
      });
      document.body.appendChild(picker);
      const rect = btn.getBoundingClientRect();
      picker.style.position = 'absolute';
      picker.style.left = `${rect.left}px`;
      picker.style.top = `${rect.top - 40}px`;
      const remove = (e) => {
        if (!picker.contains(e.target)) {
          picker.remove();
          document.removeEventListener('click', remove);
        }
      };
      setTimeout(() => document.addEventListener('click', remove));
      break;
      
    case 'edit':
      const messageEl = document.querySelector(`.message[data-id="${message.id}"]`);
      const contentEl = messageEl.querySelector('.message-content');
      
      const input = document.createElement('textarea');
      input.className = 'message-edit-input';
      input.value = message.content;
      
      contentEl.innerHTML = '';
      contentEl.appendChild(input);
      input.focus();
      
      const saveEdit = () => {
        const newContent = input.value.trim();
        if (newContent && newContent !== message.content) {
          state.socket.emit('edit-message', { 
            messageId: message.id, 
            content: newContent 
          });
        } else {
          renderMessages();
        }
      };
      
      input.addEventListener('blur', saveEdit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          saveEdit();
        }
      });
      break;
      
    case 'delete':
      if (confirm('Voulez-vous vraiment supprimer ce message ?')) {
        state.socket.emit('delete-message', { messageId: message.id });
      }
      break;
  }
}

/**
 * Envoie un message
 */
function sendMessage() {
  const content = dom.messageInput.value.trim();
  if (!content || (!state.currentChat && !state.currentGroup)) return;
  
  const expiresIn = dom.ttlSelect.value ? parseInt(dom.ttlSelect.value) : null;
  
  if (state.currentChat) {
    // Message privé
    state.socket.emit('send-message', {
      recipient: state.currentChat.id,
      content,
      replyTo: state.replyTo,
      expiresIn
    });
  } else if (state.currentGroup) {
    // Message de groupe
    state.socket.emit('send-group-message', {
      groupId: state.currentGroup.id,
      content,
      replyTo: state.replyTo,
      expiresIn
    });
  }
  
  // Réinitialiser l'interface
  dom.messageInput.value = '';
  dom.sendBtn.disabled = true;
  state.replyTo = null;
  dom.replyPreview.classList.add('hidden');
}

/**
 * Upload un fichier dans la conversation courante
 */
async function uploadFile(file) {
  if (!state.currentChat && !state.currentGroup) {
    showToast('Sélectionnez une conversation', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  if (state.currentChat) {
    formData.append('chatId', state.currentChat.id);
    formData.append('chatType', 'private');
  } else {
    formData.append('chatId', state.currentGroup.id);
    formData.append('chatType', 'group');
  }

  showToast('Envoi du fichier...');
  try {
    const response = await fetch(`${config.apiBaseUrl}/api/upload-file`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('nexus_token')}`
      },
      body: formData
    });
    if (response.ok) {
      showToast('Fichier envoyé', 'success');
    } else {
      const { error } = await response.json();
      showToast(error || 'Erreur lors de l\'envoi', 'error');
    }
  } catch (err) {
    console.error('Upload error:', err);
    showToast('Erreur lors de l\'envoi du fichier', 'error');
  }
}

/**
 * Connecte le client au serveur Socket.IO
 */
function connectSocket() {
  if (state.socket) return;

  // Toujours récupérer le token courant depuis le stockage pour gérer
  // les connexions établies après un login sans rechargement de la page
  const token = localStorage.getItem('nexus_token');
  state.socket = io({
    ...config.socketOptions,
    auth: { token }
  });
  
  // Gestion des erreurs de connexion
  state.socket.on('connect_error', (err) => {
    console.error('Erreur de connexion Socket.IO:', err);
    if (err.message === 'Token expiré' || err.message === 'Token invalide') {
      localStorage.removeItem('nexus_token');
      window.location.reload();
    }
  });
  
  // Écoute des événements Socket.IO
  state.socket.on('new-message', handleNewMessage);
  state.socket.on('new-group-message', handleNewGroupMessage);
  state.socket.on('message-edited', handleMessageEdited);
  state.socket.on('message-deleted', handleMessageDeleted);
  state.socket.on('reaction-updated', handleReactionUpdated);
  state.socket.on('typing', handleTyping);
  state.socket.on('stop-typing', handleStopTyping);
  state.socket.on('users-updated', handleUsersUpdated);
  state.socket.on('group-invitation', handleGroupInvitation);
  state.socket.on('webrtc-offer', handleWebRTCOffer);
  state.socket.on('webrtc-answer', handleWebRTCAnswer);
  state.socket.on('webrtc-ice-candidate', handleWebRTCICECandidate);
  state.socket.on('end-call', handleEndCall);
}

/**
 * Gère la réception d'un nouveau message
 */
function handleNewMessage(message) {
  // Jouer le son de notification
  playAudio(dom.messageSound);
  
  // Si le message est pour la conversation actuelle
  if (state.currentChat && message.sender === state.currentChat.username) {
    state.messages.push(message);
    renderMessages();
    scrollToBottom();
    
    // Marquer comme lu
    state.socket.emit('mark-messages-read', { sender: state.currentChat.id });
  } else {
    // Mettre à jour le compteur de messages non lus
    const contact = state.contacts.find(c => c.username === message.sender);
    if (contact) {
      contact.unreadCount = (contact.unreadCount || 0) + 1;
      renderContactsModal();
    }
    
    // Afficher une notification
    showToast(`Nouveau message de ${message.senderName}`, 'info');
  }
}

/**
 * Gère la réception d'un nouveau message de groupe
 */
function handleNewGroupMessage(message) {
  playAudio(dom.messageSound);
  
  if (state.currentGroup && message.group === state.currentGroup.id) {
    state.messages.push(message);
    renderMessages();
    scrollToBottom();
    
    // Marquer comme lu
    state.socket.emit('mark-group-messages-read', { groupId: state.currentGroup.id });
  } else {
    const group = state.groups.find(g => g.id === message.group);
    if (group) {
      group.unreadCount = (group.unreadCount || 0) + 1;
      renderGroups();
    }
    
    showToast(`Nouveau message dans ${group?.name || 'groupe'}`, 'info');
  }
}

/**
 * Gère la modification d'un message
 */
function handleMessageEdited({ id, content, edited }) {
  const message = state.messages.find(m => m.id === id);
  if (message) {
    message.content = content;
    message.edited = edited;
    renderMessages();
  }
}

/**
 * Gère la suppression d'un message
 */
function handleMessageDeleted({ id }) {
  const message = state.messages.find(m => m.id === id);
  if (message) {
    message.deleted = true;
    renderMessages();
  }
}

/**
 * Gère la mise à jour des réactions
 */
function handleReactionUpdated({ id, reactions }) {
  const message = state.messages.find(m => m.id === id);
  if (message) {
    message.reactions = reactions;
    renderMessages();
  }
}

/**
 * Gère l'indicateur de frappe
 */
function handleTyping({ sender }) {
  if (state.currentChat && sender === state.currentChat.id) {
    state.typingUsers.add(sender);
    updateTypingIndicator();
  }
}

/**
 * Gère l'arrêt de l'indicateur de frappe
 */
function handleStopTyping({ sender }) {
  if (state.currentChat && sender === state.currentChat.id) {
    state.typingUsers.delete(sender);
    updateTypingIndicator();
  }
}

/**
 * Met à jour l'indicateur de frappe dans l'interface
 */
function updateTypingIndicator() {
  const typingIndicator = document.querySelector('.typing-indicator');
  
  if (state.typingUsers.size > 0) {
    if (!typingIndicator) {
      const indicator = document.createElement('div');
      indicator.className = 'typing-indicator';
      indicator.innerHTML = `
        <span class="status-dot typing"></span>
        <span>${state.currentChat.name} est en train d'écrire...</span>
      `;
      dom.messagesContainer.appendChild(indicator);
    }
    scrollToBottom();
  } else if (typingIndicator) {
    typingIndicator.remove();
  }
}

/**
 * Gère la mise à jour de la liste des utilisateurs en ligne
 */
function handleUsersUpdated(usernames) {
  state.contacts.forEach(contact => {
    contact.online = usernames.includes(contact.username);
  });
  
  if (state.currentChat) {
    const contact = state.contacts.find(c => c.id === state.currentChat.id);
    if (contact) {
      dom.chatPartnerStatus.querySelector('span').textContent = contact.online ? 'En ligne' : 'Hors ligne';
      dom.chatPartnerStatus.querySelector('.status-dot').className = `status-dot ${contact.online ? 'online' : 'offline'}`;
    }
  }
  
  renderContactsModal();
}

/**
 * Gère la réception d'une invitation de groupe
 */
function handleGroupInvitation({ id, name }) {
  showGroupInvitationToast(id, name);
}

/**
 * Fait défiler la conversation vers le bas
 */
function scrollToBottom() {
  setTimeout(() => {
    dom.messagesContainer.scrollTop = dom.messagesContainer.scrollHeight;
  }, 100);
}

/**
 * Affiche une notification toast
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-body">${message}</div>
    <button class="toast-close">&times;</button>
  `;
  
  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.classList.add('slide-out');
    setTimeout(() => toast.remove(), 300);
  });
  
  dom.toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('slide-out');
    setTimeout(() => toast.remove(), 300);
  }, config.toastDuration);
}

/**
 * Affiche une notification d'appel entrant
 */
function showIncomingCall(caller, callerName, callerAvatar, isVideo) {
  const toast = document.createElement('div');
  toast.className = 'toast incoming-call';
  toast.innerHTML = `
    <div class="toast-header">
      <div class="toast-title">
        <i class="fas fa-phone"></i>
        Appel ${isVideo ? 'vidéo' : 'audio'} entrant
      </div>
    </div>
    <div class="toast-body">
      <div class="caller-info">
        <img src="${callerAvatar}" alt="${callerName}" class="caller-avatar">
        <div class="caller-name">${callerName}</div>
      </div>
    </div>
    <div class="toast-actions">
      <button class="toast-btn accept">Accepter</button>
      <button class="toast-btn decline">Refuser</button>
    </div>
  `;
  
  toast.querySelector('.accept').addEventListener('click', () => {
    acceptCall(caller, isVideo);
    toast.remove();
  });
  
  toast.querySelector('.decline').addEventListener('click', () => {
    state.socket.emit('end-call', { recipient: caller });
    toast.remove();
  });
  
  dom.toastContainer.appendChild(toast);
  
  // Jouer la sonnerie
  playAudio(dom.callSound);
  
  return toast;
}

/**
 * Affiche une invitation de groupe avec actions
 */
function showGroupInvitationToast(groupId, groupName) {
  const toast = document.createElement('div');
  toast.className = 'toast group-invite';
  toast.innerHTML = `
    <div class="toast-body">Vous avez été invité à rejoindre le groupe <strong>${groupName}</strong></div>
    <div class="toast-actions">
      <button class="toast-btn accept">Accepter</button>
      <button class="toast-btn decline">Refuser</button>
    </div>
  `;

  toast.querySelector('.accept').addEventListener('click', async () => {
    await fetch(`${config.apiBaseUrl}/api/groups/${groupId}/invitations/accept`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('nexus_token')}` }
    });
    toast.remove();
    loadGroups();
  });

  toast.querySelector('.decline').addEventListener('click', async () => {
    await fetch(`${config.apiBaseUrl}/api/groups/${groupId}/invitations/decline`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('nexus_token')}` }
    });
    toast.remove();
    loadGroups();
  });

  dom.toastContainer.appendChild(toast);
  return toast;
}

/**
 * Récupère la configuration WebRTC
 */
async function fetchWebRTCConfig() {
  try {
    const response = await fetch(`${config.apiBaseUrl}/api/webrtc-config`);
    if (response.ok) {
      const { iceServers } = await response.json();
      state.iceServers = iceServers;
    }
  } catch (err) {
    console.error('Erreur de récupération de la config WebRTC:', err);
  }
}

/**
 * Démarre un appel (audio ou vidéo)
 */
async function startCall(isVideo) {
  if (!state.currentChat) return;
  
  try {
    state.isCaller = true;
    state.callData = {
      recipient: state.currentChat.username,
      isVideo
    };
    
    // Démarrer la preview locale
    state.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo
    });
    
    dom.previewVideo.srcObject = state.localStream;
    dom.callPreviewContainer.style.display = 'flex';
    dom.callPartnerName.textContent = `Appel à ${state.currentChat.name}`;
    dom.callStatus.textContent = 'Appel en cours...';
    
    // Initialiser la connexion WebRTC
    initPeerConnection();
    
    // Envoyer l'offre au destinataire
    const offer = await state.peerConnection.createOffer();
    await state.peerConnection.setLocalDescription(offer);
    
    state.socket.emit('webrtc-offer', {
      recipient: state.currentChat.username,
      offer,
      isVideo
    });
    
  } catch (err) {
    console.error('Erreur de démarrage de l\'appel:', err);
    showToast('Erreur de démarrage de l\'appel', 'error');
    endCall();
  }
}

/**
 * Accepte un appel entrant
 */
async function acceptCall(caller, isVideo) {
  try {
    state.isCaller = false;
    state.callData = {
      caller,
      isVideo
    };
    
    // Démarrer la preview locale
    state.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo
    });
    
    dom.previewVideo.srcObject = state.localStream;
    dom.callPreviewContainer.style.display = 'flex';
    dom.callPartnerName.textContent = `Appel avec ${caller}`;
    dom.callStatus.textContent = 'Appel en cours...';
    
    // Initialiser la connexion WebRTC
    initPeerConnection();
    await state.peerConnection.setRemoteDescription(new RTCSessionDescription(state.pendingOffer.offer));

    const answer = await state.peerConnection.createAnswer();
    await state.peerConnection.setLocalDescription(answer);
    
    state.socket.emit('webrtc-answer', {
      recipient: caller,
      answer
    });

    state.pendingOffer = null;
    
    // Arrêter la sonnerie
    dom.callSound.pause();
    dom.callSound.currentTime = 0;
    
  } catch (err) {
    console.error('Erreur d\'acceptation de l\'appel:', err);
    showToast('Erreur d\'acceptation de l\'appel', 'error');
    endCall();
  }
}

/**
 * Initialise la connexion WebRTC
 */
function initPeerConnection() {
  state.peerConnection = new RTCPeerConnection({
    iceServers: state.iceServers
  });
  
  // Gérer les flux média
  state.localStream.getTracks().forEach(track => {
    state.peerConnection.addTrack(track, state.localStream);
  });
  
  state.peerConnection.ontrack = (event) => {
    if (!state.remoteStream) {
      state.remoteStream = new MediaStream();
      dom.remoteVideo.srcObject = state.remoteStream;
    }
    event.streams[0].getTracks().forEach(track => {
      state.remoteStream.addTrack(track);
    });
  };
  
  state.peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      state.socket.emit('webrtc-ice-candidate', {
        recipient: state.isCaller ? state.callData.recipient : state.callData.caller,
        candidate: event.candidate
      });
    }
  };
  
  state.peerConnection.onconnectionstatechange = () => {
    const stateStr = state.peerConnection.connectionState;
    if (stateStr === 'connected') {
      dom.callPreviewContainer.style.display = 'none';
      dom.callContainer.style.display = 'flex';
    } else if (stateStr === 'disconnected' || stateStr === 'failed' || stateStr === 'closed') {
      endCall();
    }
  };
}

/**
 * Gère une offre WebRTC entrante
 */
async function handleWebRTCOffer({ caller, callerName, callerAvatar, offer, isVideo }) {
  // Si déjà en appel, refuser automatiquement
  if (state.peerConnection) {
    state.socket.emit('end-call', { recipient: caller });
    return;
  }
  
  const toast = showIncomingCall(caller, callerName, callerAvatar, isVideo);
  
  // Timeout pour l'appel entrant (30s)
  setTimeout(() => {
    if (!state.peerConnection && toast.parentNode) {
      toast.remove();
      state.socket.emit('end-call', { recipient: caller });
      dom.callSound.pause();
      dom.callSound.currentTime = 0;
    }
  }, 30000);
  
  // Sauvegarder l'offre pour plus tard
  state.pendingOffer = { offer, caller, isVideo };
}

/**
 * Gère une réponse WebRTC entrante
 */
async function handleWebRTCAnswer({ answer }) {
  if (!state.peerConnection) return;
  
  try {
    await state.peerConnection.setRemoteDescription(answer);
  } catch (err) {
    console.error('Erreur de traitement de la réponse:', err);
    endCall();
  }
}

/**
 * Gère un candidat ICE entrant
 */
async function handleWebRTCICECandidate({ candidate }) {
  if (!state.peerConnection) return;
  
  try {
    await state.peerConnection.addIceCandidate(candidate);
  } catch (err) {
    console.error('Erreur d\'ajout du candidat ICE:', err);
  }
}

/**
 * Passe de la preview à l'appel complet
 */
function startCallComplete() {
  if (!state.peerConnection) return;
  
  dom.callPreviewContainer.style.display = 'none';
  dom.callContainer.style.display = 'flex';
  
  // Mettre à jour l'interface
  const partner = state.isCaller ? state.currentChat : state.contacts.find(c => c.username === state.callData.caller);
  dom.callPartnerName.textContent = partner.name;
  dom.callStatus.textContent = state.callData.isVideo ? 'Appel vidéo en cours' : 'Appel audio en cours';
  
  // Activer/désactiver les boutons selon le type d'appel
  dom.videoBtn.style.display = state.callData.isVideo ? 'flex' : 'none';
}

/**
 * Termine l'appel en cours
 */
function endCall() {
  // Arrêter les flux média
  if (state.localStream) {
    state.localStream.getTracks().forEach(track => track.stop());
    state.localStream = null;
  }
  
  if (state.remoteStream) {
    state.remoteStream.getTracks().forEach(track => track.stop());
    state.remoteStream = null;
  }
  
  // Fermer la connexion WebRTC
  if (state.peerConnection) {
    state.peerConnection.close();
    state.peerConnection = null;
  }
  
  // Réinitialiser les éléments vidéo
  dom.previewVideo.srcObject = null;
  dom.localVideo.srcObject = null;
  dom.remoteVideo.srcObject = null;
  
  // Cacher les interfaces d'appel
  dom.callPreviewContainer.style.display = 'none';
  dom.callContainer.style.display = 'none';
  
  // Arrêter la sonnerie
  dom.callSound.pause();
  dom.callSound.currentTime = 0;
  
  // Informer l'autre partie si nous étions l'appelant
  if (state.isCaller && state.callData) {
    state.socket.emit('end-call', { recipient: state.callData.recipient });
  }
  
  state.callData = null;
  state.isCaller = false;
}

/**
 * Gère la fin d'appel par l'autre partie
 */
function handleEndCall() {
  showToast('L\'appel a été terminé', 'info');
  endCall();
}

/**
 * Active/désactive le micro
 */
function toggleMute() {
  if (!state.localStream) return;
  
  state.isMuted = !state.isMuted;
  state.localStream.getAudioTracks().forEach(track => {
    track.enabled = !state.isMuted;
  });
  
  dom.muteBtn.classList.toggle('active', state.isMuted);
}

/**
 * Active/désactive la vidéo
 */
function toggleVideo() {
  if (!state.localStream || !state.callData.isVideo) return;
  
  state.isVideoOff = !state.isVideoOff;
  state.localStream.getVideoTracks().forEach(track => {
    track.enabled = !state.isVideoOff;
  });
  
  dom.videoBtn.classList.toggle('active', state.isVideoOff);
}

/**
 * Échappe les caractères HTML pour éviter les injections
 */
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Formate une date pour l'affichage
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return 'Aujourd\'hui';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Hier';
  } else {
    return date.toLocaleDateString('fr-FR', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });
  }
}

/**
 * Formate une heure pour l'affichage
 */
function formatTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString('fr-FR', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

// Démarrer l'application
document.addEventListener('DOMContentLoaded', init);
