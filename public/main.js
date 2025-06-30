 document.addEventListener('DOMContentLoaded', () => {
            // Configuration
            const API_BASE_URL = window.location.origin;
            const MESSAGE_LIMIT = 50;
            const TYPING_TIMEOUT = 2000; // 2 seconds
            
            // DOM Elements
            const DOM = {
                // Authentication
                authContainer: document.getElementById('auth-container'),
                appContainer: document.getElementById('app-container'),
                loginForm: document.getElementById('login-form'),
                registerForm: document.getElementById('register-form'),
                loginCard: document.getElementById('login-card'),
                registerCard: document.getElementById('register-card'),
                showRegister: document.getElementById('show-register'),
                showLogin: document.getElementById('show-login'),
                avatarInput: document.getElementById('avatar-input'),
                avatarPreview: document.getElementById('avatar-preview'),
                
                // Application
                sidebar: document.querySelector('.sidebar'),
                sidebarOverlay: document.querySelector('.sidebar-overlay'),
                menuBtn: document.querySelector('.menu-btn'),
                sidebarCloseBtn: document.querySelector('.sidebar-close-btn'),
                contactsList: document.getElementById('contacts-list'),
                newGroupBtn: document.getElementById('new-group-btn'),
                groupModal: document.getElementById('group-modal'),
                closeGroupModal: document.getElementById('close-group-modal'),
                createGroupForm: document.getElementById('create-group-form'),
                
                // User info
                userAvatar: document.getElementById('user-avatar'),
                userName: document.getElementById('user-name'),
                userUsername: document.getElementById('user-username'),
                
                // Chat
                messagesContainer: document.getElementById('messages-container'),
                chatForm: document.getElementById('chat-form'),
                messageInput: document.getElementById('message-input'),
                sendBtn: document.getElementById('send-btn'),
                attachBtn: document.getElementById('attach-btn'),
                fileInput: document.getElementById('file-input'),
                replyPreview: document.getElementById('reply-preview'),
                replySnippet: document.getElementById('reply-snippet'),
                cancelReply: document.getElementById('cancel-reply'),
                ttlSelect: document.getElementById('ttl-select'),
                
                // Partner info
                chatPartnerAvatar: document.getElementById('chat-partner-avatar'),
                chatPartnerName: document.getElementById('chat-partner-name'),
                chatPartnerStatus: document.getElementById('chat-partner-status'),
                chatPartnerStatusText: document.getElementById('chat-partner-status-text'),
                
                // Call UI
                callPreviewContainer: document.getElementById('call-preview-container'),
                callContainer: document.getElementById('call-container'),
                remoteVideo: document.getElementById('remote-video'),
                localVideo: document.getElementById('local-video'),
                previewVideo: document.getElementById('preview-video'),
                callPartnerName: document.getElementById('call-partner-name'),
                callStatus: document.getElementById('call-status'),
                muteBtn: document.getElementById('mute-btn'),
                videoBtn: document.getElementById('video-btn'),
                hangupBtn: document.getElementById('hangup-btn'),
                hangupPreviewBtn: document.getElementById('hangup-preview-btn'),
                
                // Audio
                messageSound: document.getElementById('message-sound'),
                callSound: document.getElementById('call-sound'),
                
                // Toast
                toastContainer: document.getElementById('toast-container')
            };
            
            // App State
            const AppState = {
                user: null,
                socket: null,
                currentChat: null,
                contacts: [],
                messages: {},
                typingUsers: {},
                peerConnection: null,
                localStream: null,
                remoteStream: null,
                iceServers: null,
                isCalling: false,
                isInCall: false,
                callType: null,
                callPartner: null,
                incomingOffer: null,
                isMuted: false,
                isVideoOff: false,
                replyTo: null,
                ttl: null,
                typingTimeout: null
            };
            
            // Initialize the app
            function init() {
                setupEventListeners();
                checkAuth();
            }
            
            // Check authentication status
            function checkAuth() {
                const token = localStorage.getItem('nexusToken');
                if (token) {
                    try {
                        const payload = JSON.parse(atob(token.split('.')[1]));
                        if (payload.userId) {
                            startApp();
                            return;
                        }
                    } catch (e) {
                        console.error('Invalid token:', e);
                        localStorage.removeItem('nexusToken');
                    }
                }
                
                DOM.authContainer.classList.remove('hidden');
                DOM.appContainer.classList.add('hidden');
            }
            
            // Setup event listeners
            function setupEventListeners() {
                // Authentication
                DOM.showRegister.addEventListener('click', showRegisterForm);
                DOM.showLogin.addEventListener('click', showLoginForm);
                DOM.loginForm.addEventListener('submit', handleLogin);
                DOM.registerForm.addEventListener('submit', handleRegister);
                DOM.avatarInput.addEventListener('change', handleAvatarUpload);
                
                // Navigation
                DOM.menuBtn.addEventListener('click', toggleSidebar);
                DOM.sidebarCloseBtn.addEventListener('click', toggleSidebar);
                DOM.sidebarOverlay.addEventListener('click', toggleSidebar);
                
                // Group modal
                DOM.newGroupBtn.addEventListener('click', () => DOM.groupModal.classList.add('active'));
                DOM.closeGroupModal.addEventListener('click', () => DOM.groupModal.classList.remove('active'));
                DOM.groupModal.addEventListener('click', (e) => {
                    if (e.target === DOM.groupModal) DOM.groupModal.classList.remove('active');
                });
                DOM.createGroupForm.addEventListener('submit', handleCreateGroup);
                
                // Chat
                DOM.chatForm.addEventListener('submit', sendMessage);
                DOM.messageInput.addEventListener('input', handleMessageInput);
                DOM.attachBtn.addEventListener('click', () => DOM.fileInput.click());
                DOM.cancelReply.addEventListener('click', () => setReply(null));
                DOM.ttlSelect.addEventListener('change', () => {
                    AppState.ttl = DOM.ttlSelect.value ? parseInt(DOM.ttlSelect.value, 10) : null;
                });
                
                // Calls
                document.querySelectorAll('.chat-action-btn.call').forEach(btn => {
                    btn.addEventListener('click', () => startCall('audio'));
                });
                
                document.querySelectorAll('.chat-action-btn.video').forEach(btn => {
                    btn.addEventListener('click', () => startCall('video'));
                });
                
                DOM.hangupBtn.addEventListener('click', endCall);
                DOM.hangupPreviewBtn.addEventListener('click', endCall);
                DOM.muteBtn.addEventListener('click', toggleMute);
                DOM.videoBtn.addEventListener('click', toggleVideo);
                
                // Contacts
                DOM.contactsList.addEventListener('click', (e) => {
                    const contactEl = e.target.closest('.contact');
                    if (contactEl) {
                        const id = contactEl.dataset.id;
                        if (id) switchChat(id);
                    }
                });
            }
            
            // Show register form
            function showRegisterForm(e) {
                e.preventDefault();
                DOM.loginCard.classList.add('hidden');
                DOM.registerCard.classList.remove('hidden');
            }
            
            // Show login form
            function showLoginForm(e) {
                e.preventDefault();
                DOM.registerCard.classList.add('hidden');
                DOM.loginCard.classList.remove('hidden');
            }
            
            // Handle login
            async function handleLogin(e) {
                e.preventDefault();
                const username = DOM.loginForm['login-username'].value;
                const password = DOM.loginForm['login-password'].value;
                
                try {
                    const response = await fetch(`${API_BASE_URL}/api/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password })
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok) {
                        localStorage.setItem('nexusToken', data.token);
                        startApp(data.user);
                    } else {
                        showToast(data.message || 'Identifiants invalides', 'error');
                    }
                } catch (err) {
                    showToast('Erreur de connexion au serveur', 'error');
                    console.error('Login error:', err);
                }
            }
            
            // Handle registration
            async function handleRegister(e) {
                e.preventDefault();
                const name = DOM.registerForm['register-name'].value;
                const username = DOM.registerForm['register-username'].value;
                const password = DOM.registerForm['register-password'].value;
                
                if (!name || !username || !password) {
                    return showToast('Tous les champs sont requis', 'error');
                }
                
                try {
                    const response = await fetch(`${API_BASE_URL}/api/register`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, username, password })
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok) {
                        localStorage.setItem('nexusToken', data.token);
                        
                        // Upload avatar if selected
                        const avatarFile = DOM.avatarInput.files[0];
                        if (avatarFile) {
                            await uploadAvatar(avatarFile, data.token);
                        }
                        
                        startApp(data.user);
                    } else {
                        showToast(data.message || 'Erreur lors de l\'inscription', 'error');
                    }
                } catch (err) {
                    showToast('Erreur de connexion au serveur', 'error');
                    console.error('Register error:', err);
                }
            }
            
            // Handle avatar upload
            function handleAvatarUpload(e) {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        DOM.avatarPreview.src = event.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            }
            
            // Upload avatar to server
            async function uploadAvatar(file, token) {
                const formData = new FormData();
                formData.append('avatar', file);
                
                try {
                    const response = await fetch(`${API_BASE_URL}/api/upload-avatar`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: formData
                    });
                    
                    if (!response.ok) throw new Error('Upload failed');
                    
                    const data = await response.json();
                    return data.avatar;
                } catch (err) {
                    console.error('Avatar upload error:', err);
                    showToast('Échec de l\'upload de l\'avatar', 'error');
                    return null;
                }
            }
            
            // Start the application
            async function startApp(userData) {
                AppState.user = userData;
                await loadWebRTCConfig();
                updateUserUI();
                
                DOM.authContainer.classList.add('hidden');
                DOM.appContainer.classList.remove('hidden');
                
                connectSocket();
                loadContacts();
            }
            
            // Update user UI
            function updateUserUI() {
                if (!AppState.user) return;

                DOM.userName.textContent = AppState.user.name;
                DOM.userUsername.textContent = `@${AppState.user.username}`;
                
                if (AppState.user.avatar) {
                    DOM.userAvatar.src = AppState.user.avatar;
                }
            }

            // Load WebRTC configuration
            async function loadWebRTCConfig() {
                try {
                    const response = await fetch(`${API_BASE_URL}/api/webrtc-config`);
                    if (response.ok) {
                        const data = await response.json();
                        AppState.iceServers = data.iceServers;
                    }
                } catch (err) {
                    console.error('WebRTC config error:', err);
                    AppState.iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
                }
            }
            
            // Connect to socket
            function connectSocket() {
                const token = localStorage.getItem('nexusToken');
                if (!token) {
                    showToast('Erreur d\'authentification', 'error');
                    return;
                }
                
                AppState.socket = io({
                    auth: { token }
                });
                
                setupSocketListeners();
            }
            
            // Setup socket listeners
            function setupSocketListeners() {
                const socket = AppState.socket;
                
                socket.on('connect', () => {
                    showToast('Connecté au chat', 'success');
                });
                
                socket.on('connect_error', (err) => {
                    console.error('Socket connection error:', err);
                    
                    if (err.message === 'Token invalide') {
                        localStorage.removeItem('nexusToken');
                        showToast('Session expirée, veuillez vous reconnecter', 'error');
                        setTimeout(() => window.location.reload(), 2000);
                    } else {
                        showToast('Erreur de connexion au serveur', 'error');
                    }
                });
                
                socket.on('disconnect', () => {
                    showToast('Déconnecté du serveur', 'warning');
                });
                
                socket.on('users-updated', (users) => {
                    updateOnlineStatus(users);
                });
                
                socket.on('new-message', (message) => {
                    handleNewMessage(message);
                });

                socket.on('message-edited', (data) => {
                    handleMessageEdited(data);
                });

                socket.on('message-deleted', (data) => {
                    handleMessageDeleted(data);
                });

                socket.on('reaction-updated', (data) => {
                    handleReactionUpdated(data);
                });
                
                socket.on('typing', (data) => {
                    handleTypingIndicator(data);
                });
                
                socket.on('stop-typing', (data) => {
                    handleStopTyping(data);
                });
                
                socket.on('webrtc-offer', (data) => {
                    handleWebRTCOffer(data);
                });
                
                socket.on('webrtc-answer', (data) => {
                    handleWebRTCAnswer(data);
                });
                
                socket.on('webrtc-ice-candidate', (data) => {
                    handleWebRTCCandidate(data);
                });
                
                socket.on('end-call', () => {
                    handleCallEnded();
                });
            }
            
            // Toggle sidebar
            function toggleSidebar() {
                DOM.sidebar.classList.toggle('active');
                DOM.sidebarOverlay.classList.toggle('active');
            }
            
            // Load contacts
            async function loadContacts() {
                try {
                    const token = localStorage.getItem('nexusToken');
                    const response = await fetch(`${API_BASE_URL}/api/users`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error('API error');

                    AppState.contacts = data.map(u => ({
                        id: u._id,
                        username: u.username,
                        name: u.name,
                        avatar: u.avatar,
                        lastMessage: '',
                        time: '',
                        unread: 0,
                        online: false
                    }));

                    renderContacts();

                    if (AppState.contacts.length > 0) {
                        switchChat(AppState.contacts[0].id);
                    }
                } catch (err) {
                    console.error('Error loading contacts:', err);
                    showToast('Erreur de chargement des contacts', 'error');
                }
            }
            
            // Render contacts
            function renderContacts() {
                DOM.contactsList.innerHTML = '';
                
                AppState.contacts.forEach(contact => {
                    const contactEl = document.createElement('div');
                    contactEl.className = 'contact';
                    contactEl.dataset.id = contact.id;
                    contactEl.tabIndex = 0;
                    contactEl.setAttribute('role', 'listitem');

                    if (AppState.currentChat === contact.id) {
                        contactEl.classList.add('active');
                    }
                    
                    contactEl.innerHTML = `
                        <div class="contact-avatar">
                            <img src="${contact.avatar}" alt="${contact.name}">
                            <span class="contact-status ${contact.online ? contact.typing ? 'typing' : 'online' : 'offline'}"></span>
                        </div>
                        <div class="contact-info">
                            <div class="contact-name">${contact.name}</div>
                            <div class="contact-last-msg">${contact.lastMessage}</div>
                        </div>
                        <div class="contact-time">${contact.time}</div>
                        ${contact.unread > 0 ? `<div class="unread-count">${contact.unread}</div>` : ''}
                    `;
                    
                    DOM.contactsList.appendChild(contactEl);
                });
            }
            
            // Update online status
            function updateOnlineStatus(onlineUsers) {
                AppState.contacts.forEach(contact => {
                    contact.online = onlineUsers.includes(contact.username);
                });
                
                renderContacts();
                
                if (AppState.currentChat) {
                    const currentContact = AppState.contacts.find(c => c.id === AppState.currentChat);
                    if (currentContact) {
                        updateChatPartnerStatus(currentContact);
                    }
                }
            }
            
            // Switch chat
            function switchChat(id) {
                if (AppState.currentChat === id) return;

                AppState.currentChat = id;
                const contact = AppState.contacts.find(c => c.id === id);
                
                if (contact) {
                    updateChatPartnerUI(contact);
                    
                    if (contact.unread > 0) {
                        contact.unread = 0;
                        renderContacts();
                    }
                }
                
                loadMessages(id);
            }
            
            // Update chat partner UI
            function updateChatPartnerUI(contact) {
                DOM.chatPartnerName.textContent = contact.name;
                DOM.chatPartnerAvatar.src = contact.avatar;
                updateChatPartnerStatus(contact);
            }
            
            // Update chat partner status
            function updateChatPartnerStatus(contact) {
                const statusDot = DOM.chatPartnerStatus;
                const statusText = DOM.chatPartnerStatusText;
                
                statusDot.className = 'contact-status';
                statusText.innerHTML = '';
                
                if (contact.typing) {
                    statusDot.classList.add('typing');
                    statusText.innerHTML = '<span class="status-dot typing"></span><span>Est en train d\'écrire...</span>';
                } else if (contact.online) {
                    statusDot.classList.add('online');
                    statusText.innerHTML = '<span class="status-dot online"></span><span>En ligne</span>';
                } else {
                    statusDot.classList.add('offline');
                    statusText.innerHTML = '<span class="status-dot offline"></span><span>Hors ligne</span>';
                }
            }
            
            // Load messages
            async function loadMessages(partnerId) {
                try {
                    const token = localStorage.getItem('nexusToken');
                    const response = await fetch(`${API_BASE_URL}/api/messages?partner=${partnerId}&limit=${MESSAGE_LIMIT}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error('API error');

                    AppState.messages[partnerId] = data;
                    renderMessages(data);
                    scrollToBottom();
                } catch (err) {
                    console.error('Error loading messages:', err);
                    showToast('Erreur de chargement des messages', 'error');
                }
            }
            
            // Render messages
            function renderMessages(messages) {
                DOM.messagesContainer.innerHTML = '';
                
                const groupedMessages = groupMessagesByDate(messages);
                
                for (const [date, msgs] of Object.entries(groupedMessages)) {
                    const dateSeparator = document.createElement('div');
                    dateSeparator.className = 'date-separator';
                    dateSeparator.textContent = formatDate(new Date(date));
                    DOM.messagesContainer.appendChild(dateSeparator);
                    
                    msgs.forEach(msg => {
                        const messageEl = createMessageElement(msg);
                        DOM.messagesContainer.appendChild(messageEl);
                    });
                }
            }
            
            // Group messages by date
            function groupMessagesByDate(messages) {
                return messages.reduce((groups, message) => {
                    const date = new Date(message.createdAt).toDateString();
                    if (!groups[date]) {
                        groups[date] = [];
                    }
                    groups[date].push(message);
                    return groups;
                }, {});
            }
            
            // Format date
            function formatDate(date) {
                const today = new Date();
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                
                if (date.toDateString() === today.toDateString()) {
                    return 'Aujourd\'hui';
                } else if (date.toDateString() === yesterday.toDateString()) {
                    return 'Hier';
                } else {
                    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
                }
            }
            
            // Format time
            function formatTime(date) {
                return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            }
            
            // Create message element
            function createMessageElement(message) {
                const isSent = message.sender === AppState.user.username;
                const messageEl = document.createElement('div');
                messageEl.className = `message ${isSent ? 'sent' : 'received'}`;
                messageEl.setAttribute('role', 'listitem');

                let contentHtml = message.deleted ? '<em>Message supprimé</em>' : message.content;

                if (!message.deleted && message.type === 'image') {
                    contentHtml += `<img class="msg-image" src="${message.fileUrl}" alt="Image partagée">`;
                } else if (!message.deleted && message.type === 'file') {
                    contentHtml += `
                        <a href="${message.fileUrl}" class="msg-file" download>
                            <i class="fas fa-file-pdf"></i>
                            <div class="message-file-info">
                                <div class="message-file-name">${message.fileInfo.name}</div>
                                <div class="message-file-size">${message.fileInfo.size}</div>
                            </div>
                        </a>
                    `;
                }

                let actionsHtml = '';
                if (!message.deleted) {
                    actionsHtml = `<div class="message-actions">` +
                        `<button class="message-action-btn" aria-label="Répondre" data-id="${message.id}"><i class="fas fa-reply"></i></button>` +
                        `<button class="message-action-btn" aria-label="Réaction" data-id="${message.id}"><i class="fas fa-smile"></i></button>`;
                    if (isSent) {
                        actionsHtml += `<button class="message-action-btn" aria-label="Modifier" data-id="${message.id}"><i class="fas fa-pen"></i></button>` +
                                       `<button class="message-action-btn" aria-label="Supprimer" data-id="${message.id}"><i class="fas fa-trash"></i></button>`;
                    }
                    actionsHtml += `</div>`;
                }

                const replyHtml = message.replySnippet ? `<div class="reply-indicator">En réponse à <em>${message.replySnippet}</em></div>` : '';
                const reactions = message.reactions ? Object.entries(message.reactions).map(([emo, users]) => 
                    `<span class="reaction">${emo} ${users.length}</span>`
                ).join('') : '';
                
                const ttl = message.expiresAt ? Math.max(0, Math.floor((new Date(message.expiresAt) - Date.now()) / 1000)) : null;
                
                messageEl.innerHTML = `
                    <div class="message-wrapper">
                        ${replyHtml}
                        <div class="message-content">${contentHtml} ${actionsHtml}</div>
                        <div class="message-info">
                            <span class="timestamp">${formatTime(new Date(message.createdAt))}</span>
                            ${message.edited ? '<span class="edited">(modifié)</span>' : ''}
                            ${isSent ? `<i class="fas fa-check read-receipt ${message.read ? 'read' : ''}"></i>` : ''}
                            ${ttl !== null ? `<span class="expires-in">${ttl}s</span>` : ''}
                        </div>
                        ${reactions ? `<div class="reactions">${reactions}</div>` : ''}
                    </div>
                `;

                // Add event listeners for message actions
                const editBtn = messageEl.querySelector('.fa-pen')?.closest('button');
                if (editBtn) editBtn.addEventListener('click', () => editMessage(message));
                
                const deleteBtn = messageEl.querySelector('.fa-trash')?.closest('button');
                if (deleteBtn) deleteBtn.addEventListener('click', () => deleteMessage(message.id));
                
                const replyBtn = messageEl.querySelector('.fa-reply')?.closest('button');
                if (replyBtn) replyBtn.addEventListener('click', () => setReply(message));
                
                const reactBtn = messageEl.querySelector('.fa-smile')?.closest('button');
                if (reactBtn) reactBtn.addEventListener('click', () => addReaction(message.id));

                return messageEl;
            }
            
            // Handle message input
            function handleMessageInput() {
                const text = DOM.messageInput.value.trim();
                DOM.sendBtn.disabled = text.length === 0;
                
                if (text.length > 0 && AppState.currentChat) {
                    if (!AppState.typingTimeout) {
                        AppState.socket.emit('typing', { recipient: AppState.currentChat });
                    }
                    
                    clearTimeout(AppState.typingTimeout);
                    AppState.typingTimeout = setTimeout(() => {
                        AppState.socket.emit('stop-typing', { recipient: AppState.currentChat });
                        AppState.typingTimeout = null;
                    }, TYPING_TIMEOUT);
                }
            }
            
            // Send message
            async function sendMessage(e) {
                e.preventDefault();
                const text = DOM.messageInput.value.trim();
                
                if (text.length === 0 || !AppState.currentChat) return;
                
                try {
                    const tempId = `temp-${Date.now()}`;
                    const tempMessage = {
                        id: tempId,
                        sender: AppState.user.username,
                        content: text,
                        type: 'text',
                        createdAt: new Date(),
                        read: false
                    };
                    
                    if (!AppState.messages[AppState.currentChat]) {
                        AppState.messages[AppState.currentChat] = [];
                    }
                    
                    AppState.messages[AppState.currentChat].push(tempMessage);
                    renderMessages(AppState.messages[AppState.currentChat]);
                    scrollToBottom();
                    
                    AppState.socket.emit('send-message', {
                        recipient: AppState.currentChat,
                        content: text,
                        type: 'text',
                        replyTo: AppState.replyTo,
                        expiresIn: AppState.ttl
                    }, (response) => {
                        if (response.success) {
                            const index = AppState.messages[AppState.currentChat].findIndex(m => m.id === tempId);
                            if (index !== -1) {
                                AppState.messages[AppState.currentChat][index] = {
                                    ...tempMessage,
                                    id: response.messageId,
                                    read: response.read
                                };
                                renderMessages(AppState.messages[AppState.currentChat]);
                            }
                        } else {
                            showToast('Échec de l\'envoi du message', 'error');
                        }
                    });
                    
                    DOM.messageInput.value = '';
                    DOM.sendBtn.disabled = true;
                    setReply(null);
                    DOM.ttlSelect.value = '';
                    AppState.ttl = null;
                    
                    if (AppState.typingTimeout) {
                        clearTimeout(AppState.typingTimeout);
                        AppState.typingTimeout = null;
                        AppState.socket.emit('stop-typing', { recipient: AppState.currentChat });
                    }
                } catch (err) {
                    console.error('Error sending message:', err);
                    showToast('Erreur d\'envoi du message', 'error');
                }
            }
            
            // Handle file upload
            DOM.fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file || !AppState.currentChat) return;

                const token = localStorage.getItem('nexusToken');
                const formData = new FormData();
                formData.append('file', file);
                formData.append('recipient', AppState.currentChat);

                try {
                    await fetch(`${API_BASE_URL}/api/upload-file`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: formData
                    });
                } catch (err) {
                    console.error('File upload error:', err);
                    showToast('Erreur lors de l\'envoi du fichier', 'error');
                } finally {
                    e.target.value = '';
                }
            });
            
            // Handle new message
            function handleNewMessage(message) {
                DOM.messageSound.play().catch(e => {
                    // On ignore les erreurs de lecture audio, souvent dues aux restrictions de l'autoplay ou à une source invalide.
                });
                
                const sender = message.sender;
                const contact = AppState.contacts.find(c => c.username === sender);
                const key = contact ? contact.id : sender;

                if (!AppState.messages[key]) {
                    AppState.messages[key] = [];
                }
                
                const exists = AppState.messages[key].some(m => m.id === message.id);
                if (exists) return;

                AppState.messages[key].push(message);
                
                if (contact) {
                    contact.lastMessage = message.type === 'text' ? message.content :
                                        message.type === 'image' ? 'Image' : 'Fichier';
                    contact.time = 'Maintenant';

                    if (AppState.currentChat !== key) {
                        contact.unread = (contact.unread || 0) + 1;
                    }
                }
                
                if (AppState.currentChat === key) {
                    renderMessages(AppState.messages[key]);
                    scrollToBottom();
                    markMessagesAsRead(key);
                } else {
                    renderContacts();
                }
            }
            
            // Mark messages as read
            function markMessagesAsRead(partnerId) {
                if (!AppState.socket || !partnerId) return;

                AppState.socket.emit('mark-messages-read', { sender: partnerId }, (response) => {
                    if (response.success) {
                        if (AppState.messages[partnerId]) {
                            AppState.messages[partnerId].forEach(msg => {
                                if (msg.sender !== AppState.user.username && !msg.read) {
                                    msg.read = true;
                                }
                            });
                        }
                        
                        document.querySelectorAll('.read-receipt').forEach(el => {
                            el.classList.add('read');
                        });
                    }
                });
            }
            
            // Handle typing indicator
            function handleTypingIndicator(data) {
                const contact = AppState.contacts.find(c => c.username === data.sender);
                if (contact && contact.id === AppState.currentChat) {
                    contact.typing = true;
                    updateChatPartnerStatus(contact);
                }
            }

            // Handle stop typing
            function handleStopTyping(data) {
                const contact = AppState.contacts.find(c => c.username === data.sender);
                if (contact && contact.id === AppState.currentChat) {
                    contact.typing = false;
                    updateChatPartnerStatus(contact);
                }
            }

            // Handle message edited
            function handleMessageEdited(data) {
                const msgs = AppState.messages[AppState.currentChat];
                if (!msgs) return;
                const msg = msgs.find(m => m.id === data.id);
                if (msg) {
                    msg.content = data.content;
                    msg.edited = data.edited;
                    renderMessages(msgs);
                }
            }

            // Handle message deleted
            function handleMessageDeleted(data) {
                const msgs = AppState.messages[AppState.currentChat];
                if (!msgs) return;
                const msg = msgs.find(m => m.id === data.id);
                if (msg) {
                    msg.deleted = true;
                    renderMessages(msgs);
                }
            }

            // Handle reaction updated
            function handleReactionUpdated(data) {
                const msgs = AppState.messages[AppState.currentChat];
                if (!msgs) return;
                const msg = msgs.find(m => m.id === data.id);
                if (msg) {
                    msg.reactions = data.reactions;
                    renderMessages(msgs);
                }
            }

            // Edit message
            async function editMessage(message) {
                const newContent = prompt('Modifier le message', message.content);
                if (newContent === null || newContent.trim() === '') return;
                try {
                    const token = localStorage.getItem('nexusToken');
                    const response = await fetch(`${API_BASE_URL}/api/messages/${message.id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ content: newContent })
                    });
                    if (response.ok) {
                        message.content = newContent;
                        message.edited = true;
                        renderMessages(AppState.messages[AppState.currentChat]);
                    } else {
                        showToast('Échec de la modification', 'error');
                    }
                } catch (err) {
                    console.error('Edit message error:', err);
                    showToast('Erreur lors de la modification', 'error');
                }
            }

            // Delete message
            async function deleteMessage(id) {
                if (!confirm('Supprimer ce message ?')) return;
                try {
                    const token = localStorage.getItem('nexusToken');
                    const response = await fetch(`${API_BASE_URL}/api/messages/${id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (response.ok) {
                        const msgs = AppState.messages[AppState.currentChat];
                        const msg = msgs.find(m => m.id === id);
                        if (msg) {
                            msg.deleted = true;
                        }
                        renderMessages(msgs);
                    } else {
                        showToast('Échec de la suppression', 'error');
                    }
                } catch (err) {
                    console.error('Delete message error:', err);
                    showToast('Erreur lors de la suppression', 'error');
                }
            }

            // Set reply
            function setReply(message) {
                AppState.replyTo = message ? message.id : null;
                if (message) {
                    DOM.replySnippet.textContent = message.content.slice(0, 50);
                    DOM.replyPreview.classList.remove('hidden');
                } else {
                    DOM.replyPreview.classList.add('hidden');
                }
            }

            // Add reaction
            function addReaction(messageId) {
                const emoji = prompt('Emoji');
                if (!emoji) return;
                AppState.socket.emit('add-reaction', { messageId, emoji }, (res) => {
                    if (!res.success) showToast(res.error || 'Erreur', 'error');
                });
            }
            
            // Scroll to bottom
            function scrollToBottom() {
                setTimeout(() => {
                    DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
                }, 100);
            }
            
            // Start call
            async function startCall(type) {
                if (!AppState.currentChat || AppState.isCalling || AppState.isInCall) return;
                
                AppState.isCalling = true;
                AppState.callType = type;
                AppState.callPartner = AppState.currentChat;
                
                try {
                    DOM.callPreviewContainer.classList.add('active');

                    const constraints = {
                        audio: true,
                        video: type === 'video'
                    };

                    AppState.localStream = await navigator.mediaDevices.getUserMedia(constraints);
                    await initWebRTC();

                    const partner = AppState.contacts.find(c => c.id === AppState.callPartner);
                    if (partner) {
                        DOM.callPartnerName.textContent = partner.name;
                    }
                    DOM.callStatus.textContent = 'En attente...';
                    DOM.previewVideo.srcObject = AppState.localStream;
                    DOM.callSound.play().catch(e => console.error('Call sound error:', e));

                    AppState.socket.emit('webrtc-offer', {
                        recipient: AppState.callPartner,
                        type: AppState.callType,
                        offer: AppState.peerConnection.localDescription
                    });
                    
                } catch (err) {
                    console.error('Error starting call:', err);
                    showToast('Erreur de démarrage de l\'appel', 'error');
                    endCall();
                }
            }
            
            // Handle WebRTC offer
            function handleWebRTCOffer(data) {
                if (AppState.isCalling || AppState.isInCall) return;

                AppState.incomingOffer = data.offer || null;
                DOM.callSound.play().catch(e => console.error('Call sound error:', e));
                showIncomingCallToast(data);
            }
            
            // Show incoming call toast
            function showIncomingCallToast(data) {
                const toast = document.createElement('div');
                toast.className = 'toast incoming-call';
                toast.innerHTML = `
                    <div class="toast-header">
                        <div class="toast-title">
                            <i class="fas fa-phone"></i>
                            Appel ${data.type === 'video' ? 'vidéo' : 'audio'} entrant
                        </div>
                        <button class="toast-close">&times;</button>
                    </div>
                    <div class="toast-body">${data.callerName} vous appelle</div>
                    <div class="toast-actions">
                        <button class="toast-btn accept">Accepter</button>
                        <button class="toast-btn decline">Refuser</button>
                    </div>
                `;
                
                DOM.toastContainer.appendChild(toast);
                
                const acceptBtn = toast.querySelector('.accept');
                const declineBtn = toast.querySelector('.decline');
                const closeBtn = toast.querySelector('.toast-close');
                
                acceptBtn.addEventListener('click', () => {
                    DOM.callSound.pause();
                    DOM.callSound.currentTime = 0;
                    toast.remove();
                    acceptIncomingCall(data);
                });
                
                declineBtn.addEventListener('click', () => {
                    DOM.callSound.pause();
                    DOM.callSound.currentTime = 0;
                    toast.remove();
                    declineIncomingCall(data);
                });
                
                closeBtn.addEventListener('click', () => {
                    DOM.callSound.pause();
                    DOM.callSound.currentTime = 0;
                    toast.remove();
                    declineIncomingCall(data);
                });
                
                setTimeout(() => {
                    if (toast.parentNode) {
                        DOM.callSound.pause();
                        DOM.callSound.currentTime = 0;
                        toast.remove();
                        declineIncomingCall(data);
                    }
                }, 30000);
            }
            
            // Accept incoming call
            async function acceptIncomingCall(data) {
                try {
                    AppState.isInCall = true;
                    AppState.callType = data.type;
                    AppState.callPartner = data.caller;
                    
                    const constraints = {
                        audio: true,
                        video: data.type === 'video'
                    };
                    
                    AppState.localStream = await navigator.mediaDevices.getUserMedia(constraints);
                    await initWebRTC(true);

                    if (AppState.incomingOffer) {
                        await AppState.peerConnection.setRemoteDescription(new RTCSessionDescription(AppState.incomingOffer));
                        const answer = await AppState.peerConnection.createAnswer();
                        await AppState.peerConnection.setLocalDescription(answer);
                    }
                    
                    DOM.callContainer.classList.add('active');
                    DOM.localVideo.srcObject = AppState.localStream;
                    DOM.callPartnerName.textContent = data.callerName;
                    DOM.callStatus.textContent = 'Appel en cours...';
                    
                    AppState.socket.emit('webrtc-answer', {
                        recipient: data.caller,
                        answer: AppState.peerConnection.localDescription
                    });
                } catch (err) {
                    console.error('Error accepting call:', err);
                    showToast('Erreur d\'acceptation de l\'appel', 'error');
                    endCall();
                }
            }
            
            // Decline incoming call
            function declineIncomingCall(data) {
                AppState.socket.emit('end-call', {
                    recipient: data.caller,
                    reason: 'declined'
                });
            }
            
            // Initialize WebRTC
            async function initWebRTC(isAnswer = false) {
                const configuration = { iceServers: AppState.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }] };
                
                AppState.peerConnection = new RTCPeerConnection(configuration);
                
                if (AppState.localStream) {
                    AppState.localStream.getTracks().forEach(track => {
                        AppState.peerConnection.addTrack(track, AppState.localStream);
                    });
                }
                
                AppState.peerConnection.onicecandidate = (event) => {
                    if (event.candidate && AppState.callPartner) {
                        AppState.socket.emit('webrtc-ice-candidate', {
                            recipient: AppState.callPartner,
                            candidate: event.candidate
                        });
                    }
                };
                
                AppState.peerConnection.ontrack = (event) => {
                    if (!AppState.remoteStream) {
                        AppState.remoteStream = new MediaStream();
                        DOM.remoteVideo.srcObject = AppState.remoteStream;
                    }
                    event.streams[0].getTracks().forEach(track => {
                        AppState.remoteStream.addTrack(track);
                    });
                };
                
                if (!isAnswer) {
                    const offer = await AppState.peerConnection.createOffer();
                    await AppState.peerConnection.setLocalDescription(offer);
                }
            }
            
            // Handle WebRTC answer
            function handleWebRTCAnswer(data) {
                if (!AppState.isCalling || !AppState.peerConnection) return;
                
                DOM.callPreviewContainer.classList.remove('active');
                DOM.callContainer.classList.add('active');
                AppState.isCalling = false;
                AppState.isInCall = true;
                DOM.callSound.pause();
                DOM.callSound.currentTime = 0;
                
                AppState.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer))
                    .catch(err => console.error('Error setting remote description:', err));

                const partner = AppState.contacts.find(c => c.id === AppState.callPartner);
                if (partner) {
                    DOM.callPartnerName.textContent = partner.name;
                }
                DOM.callStatus.textContent = 'Appel en cours...';
            }
            
            // Handle WebRTC candidate
            function handleWebRTCCandidate(data) {
                if (!AppState.peerConnection) return;
                
                try {
                    AppState.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
                        .catch(err => console.error('Error adding ICE candidate:', err));
                } catch (err) {
                    console.error('Error processing ICE candidate:', err);
                }
            }
            
            // Handle call ended
            function handleCallEnded() {
                endCall();
                showToast('L\'appel a été terminé', 'info');
            }
            
            // Toggle mute
            function toggleMute() {
                if (!AppState.localStream) return;
                
                AppState.isMuted = !AppState.isMuted;
                AppState.localStream.getAudioTracks().forEach(track => {
                    track.enabled = !AppState.isMuted;
                });
                
                DOM.muteBtn.classList.toggle('active', AppState.isMuted);
                DOM.muteBtn.innerHTML = AppState.isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
            }
            
            // Toggle video
            function toggleVideo() {
                if (!AppState.localStream || AppState.callType !== 'video') return;
                
                AppState.isVideoOff = !AppState.isVideoOff;
                AppState.localStream.getVideoTracks().forEach(track => {
                    track.enabled = !AppState.isVideoOff;
                });
                
                DOM.videoBtn.classList.toggle('active', AppState.isVideoOff);
                DOM.videoBtn.innerHTML = AppState.isVideoOff ? '<i class="fas fa-video-slash"></i>' : '<i class="fas fa-video"></i>';
            }
            
            // End call
            function endCall() {
                if (AppState.localStream) {
                    AppState.localStream.getTracks().forEach(track => track.stop());
                    AppState.localStream = null;
                }
                
                if (AppState.remoteStream) {
                    AppState.remoteStream.getTracks().forEach(track => track.stop());
                    AppState.remoteStream = null;
                }
                
                if (AppState.peerConnection) {
                    AppState.peerConnection.close();
                    AppState.peerConnection = null;
                }
                
                DOM.callSound.pause();
                DOM.callSound.currentTime = 0;
                DOM.callPreviewContainer.classList.remove('active');
                DOM.callContainer.classList.remove('active');
                
                AppState.isCalling = false;
                AppState.isInCall = false;
                AppState.callType = null;
                AppState.callPartner = null;
                AppState.isMuted = false;
                AppState.isVideoOff = false;
                
                if (AppState.callPartner && AppState.socket) {
                    AppState.socket.emit('end-call', { recipient: AppState.callPartner });
                }
            }

            // Handle create group
            async function handleCreateGroup(e) {
                e.preventDefault();
                const name = DOM.createGroupForm['group-name'].value.trim();
                const avatar = DOM.createGroupForm['group-avatar'].value.trim();
                const membersText = DOM.createGroupForm['group-members'].value.trim();
                if (!name) return;
                const members = membersText ? membersText.split(',').map(m => m.trim()).filter(Boolean) : [];
                const token = localStorage.getItem('nexusToken');
                try {
                    const response = await fetch(`${API_BASE_URL}/api/groups`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ name, avatar, members })
                    });
                    const data = await response.json();
                    if (response.ok) {
                        showToast('Groupe créé', 'success');
                        DOM.groupModal.classList.remove('active');
                        DOM.createGroupForm.reset();
                    } else {
                        showToast(data.error || 'Erreur', 'error');
                    }
                } catch (err) {
                    console.error('Create group error:', err);
                    showToast('Erreur serveur', 'error');
                }
            }

            // Show toast
            function showToast(message, type = 'info') {
                const toast = document.createElement('div');
                toast.className = `toast ${type}`;
                toast.innerHTML = `
                    <div class="toast-body">${message}</div>
                `;
                
                DOM.toastContainer.appendChild(toast);
                
                setTimeout(() => {
                    toast.style.animation = 'toastSlideOut 0.3s forwards';
                    toast.addEventListener('animationend', () => toast.remove());
                }, 4000);
            }
            
            // Initialize the application
            init();
        });