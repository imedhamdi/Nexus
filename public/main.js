// Variables globales
let currentUser = null;
let currentChat = null;
let socket = null;
let peerConnection = null;
let localStream = null;
let callData = null;
let callInterval = null;

// DOM Elements
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const showSignup = document.getElementById('show-signup');
const showLogin = document.getElementById('show-login');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const logoutBtn = document.getElementById('logout-btn');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const messagesList = document.getElementById('messages-list');
const contactsList = document.getElementById('contacts-list');
const groupsList = document.getElementById('groups-list');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const chatName = document.getElementById('chat-name');
const chatAvatar = document.getElementById('chat-avatar');
const typingIndicator = document.getElementById('typing-indicator');
const replyPreview = document.getElementById('reply-preview');
const createGroupBtn = document.getElementById('create-group-btn');
const groupModal = document.getElementById('group-modal');
const closeGroupModal = document.getElementById('close-group-modal');
const createGroupSubmit = document.getElementById('create-group-submit');
const callModal = document.getElementById('call-modal');
const incomingCallModal = document.getElementById('incoming-call-modal');
const acceptCallBtn = document.getElementById('accept-call-btn');
const declineCallBtn = document.getElementById('decline-call-btn');
const endCallBtn = document.getElementById('end-call-btn');
const muteBtn = document.getElementById('mute-btn');
const videoBtn = document.getElementById('video-btn');
const remoteVideo = document.getElementById('remote-video');
const localVideo = document.getElementById('local-video');
const audioCallBtn = document.getElementById('audio-call-btn');
const videoCallBtn = document.getElementById('video-call-btn');
const toastContainer = document.getElementById('toast-container');
const searchInput = document.querySelector('.sidebar-search input');

// Événements
document.addEventListener('DOMContentLoaded', initApp);
showSignup.addEventListener('click', toggleAuthForms);
showLogin.addEventListener('click', toggleAuthForms);
loginBtn.addEventListener('click', handleLogin);
signupBtn.addEventListener('click', handleSignup);
logoutBtn.addEventListener('click', handleLogout);
messageInput.addEventListener('input', handleTyping);
messageInput.addEventListener('input', () => {
    if (messageInput.value.trim() !== '') {
        sendBtn.disabled = false;
    } else {
        sendBtn.disabled = true;
    }
});
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});
sendBtn.addEventListener('click', sendMessage);
createGroupBtn.addEventListener('click', () => groupModal.style.display = 'flex');
closeGroupModal.addEventListener('click', () => groupModal.style.display = 'none');
createGroupSubmit.addEventListener('click', createGroup);
audioCallBtn.addEventListener('click', () => startCall(false));
videoCallBtn.addEventListener('click', () => startCall(true));
acceptCallBtn.addEventListener('click', acceptCall);
declineCallBtn.addEventListener('click', declineCall);
endCallBtn.addEventListener('click', endCall);
muteBtn.addEventListener('click', toggleMute);
videoBtn.addEventListener('click', toggleVideo);
searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    document.querySelectorAll('.contact-list .contact-item').forEach(item => {
        const name = item.querySelector('.contact-info h3').textContent.toLowerCase();
        if (name.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
});

// Initialisation de l'application
function initApp() {
    const token = localStorage.getItem('nexus-chat-token');
    
    if (token) {
        validateToken(token);
    } else {
        authContainer.style.display = 'flex';
        appContainer.style.display = 'none';
    }
    
    // Gestion de l'avatar pour l'inscription
    const avatarInput = document.getElementById('signup-avatar');
    const avatarPreview = document.getElementById('avatar-preview');
    
    avatarInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                avatarPreview.innerHTML = `<img src="${event.target.result}" alt="Avatar preview">`;
            };
            reader.readAsDataURL(file);
        }
    });
    
    // Gestion de l'avatar pour les groupes
    const groupAvatarInput = document.getElementById('group-avatar');
    const groupAvatarPreview = document.getElementById('group-avatar-preview');
    
    groupAvatarInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                groupAvatarPreview.innerHTML = `<img src="${event.target.result}" alt="Group avatar preview">`;
            };
            reader.readAsDataURL(file);
        }
    });
}

// Basculer entre les formulaires de connexion et d'inscription
function toggleAuthForms(e) {
    e.preventDefault();
    loginForm.style.display = loginForm.style.display === 'none' ? 'block' : 'none';
    signupForm.style.display = signupForm.style.display === 'none' ? 'block' : 'none';
}

// Valider le token JWT
async function validateToken(token) {
    try {
        const response = await fetch('/api/users/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const user = await response.json();
            currentUser = user;
            setupApp(user);
            connectSocket(token);
        } else {
            localStorage.removeItem('nexus-chat-token');
            authContainer.style.display = 'flex';
            appContainer.style.display = 'none';
        }
    } catch (error) {
        console.error('Error validating token:', error);
        localStorage.removeItem('nexus-chat-token');
        authContainer.style.display = 'flex';
        appContainer.style.display = 'none';
    }
}

// Gérer la connexion
async function handleLogin() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    if (!username || !password) {
        showToast('Veuillez remplir tous les champs');
        return;
    }
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('nexus-chat-token', data.token);
            currentUser = data.user;
            setupApp(data.user);
            connectSocket(data.token);
        } else {
            showToast(data.message || 'Échec de la connexion');
        }
    } catch (error) {
        console.error('Login error:', error);
        showToast('Erreur lors de la connexion');
    }
}

// Gérer l'inscription
async function handleSignup() {
    const name = document.getElementById('signup-name').value;
    const username = document.getElementById('signup-username').value;
    const password = document.getElementById('signup-password').value;
    const avatarInput = document.getElementById('signup-avatar');
    
    if (!name || !username || !password) {
        showToast('Veuillez remplir tous les champs obligatoires');
        return;
    }
    
    if (password.length < 6) {
        showToast('Le mot de passe doit contenir au moins 6 caractères');
        return;
    }
    
    const formData = new FormData();
    formData.append('name', name);
    formData.append('username', username);
    formData.append('password', password);
    
    if (avatarInput.files[0]) {
        formData.append('avatar', avatarInput.files[0]);
    }
    
    try {
        const response = await fetch('/api/auth/signup', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('nexus-chat-token', data.token);
            currentUser = data.user;
            setupApp(data.user);
            connectSocket(data.token);
            showToast('Inscription réussie!');
        } else {
            showToast(data.message || 'Échec de l\'inscription');
        }
    } catch (error) {
        console.error('Signup error:', error);
        showToast('Erreur lors de l\'inscription');
    }
}

// Gérer la déconnexion
function handleLogout() {
    if (socket) {
        socket.disconnect();
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    localStorage.removeItem('nexus-chat-token');
    currentUser = null;
    currentChat = null;
    
    authContainer.style.display = 'flex';
    appContainer.style.display = 'none';
    
    // Réinitialiser les formulaires
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('signup-name').value = '';
    document.getElementById('signup-username').value = '';
    document.getElementById('signup-password').value = '';
    document.getElementById('signup-avatar').value = '';
    document.getElementById('avatar-preview').innerHTML = '';
}

// Configurer l'application après connexion
function setupApp(user) {
    authContainer.style.display = 'none';
    appContainer.style.display = 'flex';
    
    // Mettre à jour les informations de l'utilisateur
    userName.textContent = user.name;
    
    if (user.avatar) {
        userAvatar.innerHTML = `<img src="${user.avatar}" alt="${user.name}">`;
    } else {
        userAvatar.textContent = user.name.charAt(0).toUpperCase();
    }
    
    // Charger les contacts et les groupes
    loadContacts();
    loadGroups();

    showWelcomeScreen();
}

// Connecter le socket
function connectSocket(token) {
    socket = io({
        auth: {
            token: token
        }
    });
    
    // Écouter les événements du socket
    socket.on('connect', () => {
        console.log('Connecté au serveur Socket.IO');
    });
    
    socket.on('disconnect', () => {
        console.log('Déconnecté du serveur Socket.IO');
    });
    
    socket.on('error', (error) => {
        console.error('Erreur Socket.IO:', error);
    });
    
    socket.on('new-message', (message) => {
        if (currentChat &&
            ((message.sender._id === currentChat._id && message.receiver === currentUser._id) ||
             (message.receiver._id === currentChat._id && message.sender._id === currentUser._id) ||
             (message.group && message.group._id === currentChat._id))) {
            // Ajouter le message à la discussion actuelle
            appendMessage(message);
        } else {
            // Afficher une notification
            showNewMessageNotification(message);
        }

        // Mettre à jour la liste des contacts/groups
        if (message.group) {
            loadGroups();
        } else {
            loadContacts();
        }
    });

    socket.on('message-updated', (updatedMessage) => {
        const messageElement = document.querySelector(`[data-message-id='${updatedMessage._id}']`);
        if (messageElement) {
            const contentDiv = messageElement.querySelector('.message-content');
            const editedLabel = messageElement.querySelector('.edited-label');
            contentDiv.textContent = updatedMessage.content;
            if (!editedLabel) {
                const newEditedLabel = document.createElement('span');
                newEditedLabel.className = 'edited-label';
                newEditedLabel.textContent = '(modifié)';
                contentDiv.insertAdjacentElement('afterend', newEditedLabel);
            }
        }
    });
    
    socket.on('typing', ({ from, isTyping }) => {
        if (currentChat && from === currentChat._id) {
            typingIndicator.textContent = isTyping ? `${currentChat.name} est en train d'écrire...` : '';
            typingIndicator.style.display = isTyping ? 'block' : 'none';
        }
    });
    
    socket.on('presence', ({ userId, isOnline }) => {
        updateUserStatus(userId, isOnline);
    });
    
    socket.on('call-request', ({ from, name, avatar, isVideo }) => {
        showIncomingCall(from, name, avatar, isVideo);
    });
    
    socket.on('call-accepted', async ({ answer }) => {
        try {
            await peerConnection.setRemoteDescription(answer);
            console.log('Call accepted - remote description set');
        } catch (error) {
            console.error('Error setting remote description:', error);
            endCall();
        }
    });
    
    socket.on('ice-candidate', ({ candidate }) => {
        if (peerConnection && candidate) {
            peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
                .catch(error => console.error('Error adding ICE candidate:', error));
        }
    });
    
    socket.on('call-ended', () => {
        endCall();
    });
}

// Charger les contacts
async function loadContacts() {
    try {
        const response = await fetch('/api/users/contacts', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('nexus-chat-token')}`
            }
        });
        
        if (response.ok) {
            const contacts = await response.json();
            renderContacts(contacts);
        } else {
            console.error('Failed to load contacts');
        }
    } catch (error) {
        console.error('Error loading contacts:', error);
    }
}

// Afficher les contacts
function renderContacts(contacts) {
    contactsList.innerHTML = '';

    if (contacts.length === 0) {
        contactsList.innerHTML = `<li class="empty-state">Aucun contact trouvé.</li>`;
        return;
    }

    contacts.forEach(contact => {
        const lastMessage = contact.lastMessage ? 
            (contact.lastMessage.sender._id === currentUser._id ? 
             `Vous: ${contact.lastMessage.content}` : 
             contact.lastMessage.content) : 
            'Aucun message';
        
        const contactItem = document.createElement('li');
        contactItem.className = `contact-item ${currentChat?._id === contact._id ? 'active' : ''}`;
        contactItem.innerHTML = `
            <div class="contact-avatar">
                ${contact.avatar ? `<img src="${contact.avatar}" alt="${contact.name}">` : contact.name.charAt(0).toUpperCase()}
                ${contact.online ? '<span class="online-dot"></span>' : ''}
            </div>
            <div class="contact-info">
                <h3>${contact.name}</h3>
                <p>${lastMessage}</p>
            </div>
            <div class="contact-meta">
                ${contact.lastMessage ? `<span class="time">${formatTime(contact.lastMessage.createdAt)}</span>` : ''}
                ${contact.unreadCount > 0 ? `<span class="badge">${contact.unreadCount}</span>` : ''}
            </div>
        `;
        
        contactItem.addEventListener('click', () => openChat(contact, false));
        contactsList.appendChild(contactItem);
    });
}

// Charger les groupes
async function loadGroups() {
    try {
        const response = await fetch('/api/groups', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('nexus-chat-token')}`
            }
        });
        
        if (response.ok) {
            const groups = await response.json();
            renderGroups(groups);
        } else {
            console.error('Failed to load groups');
        }
    } catch (error) {
        console.error('Error loading groups:', error);
    }
}

// Afficher les groupes
function renderGroups(groups) {
    groupsList.innerHTML = '';

    if (groups.length === 0) {
        groupsList.innerHTML = `<li class="empty-state">Vous n'êtes dans aucun groupe.</li>`;
        return;
    }

    groups.forEach(group => {
        const lastMessage = group.lastMessage ? 
            (group.lastMessage.sender._id === currentUser._id ? 
             `Vous: ${group.lastMessage.content}` : 
             `${group.lastMessage.sender.name}: ${group.lastMessage.content}`) : 
            'Aucun message';
        
        const groupItem = document.createElement('li');
        groupItem.className = `contact-item ${currentChat?._id === group._id ? 'active' : ''}`;
        groupItem.innerHTML = `
            <div class="contact-avatar">
                ${group.avatar ? `<img src="${group.avatar}" alt="${group.name}">` : group.name.charAt(0).toUpperCase()}
            </div>
            <div class="contact-info">
                <h3>${group.name}</h3>
                <p>${lastMessage}</p>
            </div>
            <div class="contact-meta">
                ${group.lastMessage ? `<span class="time">${formatTime(group.lastMessage.createdAt)}</span>` : ''}
                ${group.unreadCount > 0 ? `<span class="badge">${group.unreadCount}</span>` : ''}
            </div>
        `;
        
        groupItem.addEventListener('click', () => openChat(group, true));
        groupsList.appendChild(groupItem);
    });
}

// Ouvrir une discussion
async function openChat(chat, isGroup) {
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('chat-container').style.display = 'flex';
    currentChat = { ...chat, isGroup };
    
    // Mettre à jour l'interface
    chatName.textContent = chat.name;
    
    if (chat.avatar) {
        chatAvatar.innerHTML = `<img src="${chat.avatar}" alt="${chat.name}">`;
    } else {
        chatAvatar.textContent = chat.name.charAt(0).toUpperCase();
    }
    
    // Charger les messages
    try {
        const endpoint = isGroup ? `/api/messages/group/${chat._id}` : `/api/messages/private/${chat._id}`;
        const response = await fetch(endpoint, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('nexus-chat-token')}`
            }
        });
        
        if (response.ok) {
            const messages = await response.json();
            renderMessages(messages);
            
            // Marquer les messages comme lus
            if (messages.length > 0) {
                const lastMessage = messages[messages.length - 1];
                if (isGroup) {
                    socket.emit('read-group-messages', { groupId: chat._id });
                } else {
                    socket.emit('read-messages', { senderId: chat._id });
                }
            }
        } else {
            console.error('Failed to load messages');
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
    
    // Mettre à jour la sélection dans la liste
    updateChatSelection();
}

// Afficher les messages
function renderMessages(messages) {
    messagesList.innerHTML = '';
    
    messages.forEach(message => {
        appendMessage(message);
    });
    
    // Faire défiler vers le bas
    scrollToBottom();
}

// Ajouter un message à la discussion
function appendMessage(message) {
    const isSent = message.sender._id === currentUser._id;
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isSent ? 'sent' : 'received'}`;
    
    let content = message.content;
    if (message.deleted) {
        content = '<em>Message supprimé</em>';
    }
    
    messageElement.innerHTML = `
        <div class="message-info">
            <span>${isSent ? 'Vous' : message.sender.name}</span>
            <span>${formatTime(message.createdAt)}</span>
        </div>
        ${message.replyTo ? `
            <div class="reply-message">
                ${message.replyTo.sender._id === currentUser._id ? 'Vous' : message.replyTo.sender.name}: 
                ${message.replyTo.content}
            </div>
        ` : ''}
        <div class="message-content">${content}</div>
        ${message.edited ? '<span class="edited-label">(modifié)</span>' : ''}
        <div class="message-actions">
            <button class="message-action" data-action="reply" data-id="${message._id}">
                <i class="fas fa-reply"></i>
            </button>
            ${isSent ? `
                <button class="message-action" data-action="edit" data-id="${message._id}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="message-action" data-action="delete" data-id="${message._id}">
                    <i class="fas fa-trash"></i>
                </button>
            ` : ''}
            <button class="message-action" data-action="react" data-id="${message._id}">
                <i class="far fa-smile"></i>
            </button>
        </div>
        ${message.reactions && message.reactions.length > 0 ? `
            <div class="message-reactions">
                ${message.reactions.map(reaction => `
                    <span class="reaction">${reaction.emoji} ${reaction.count > 1 ? reaction.count : ''}</span>
                `).join('')}
            </div>
        ` : ''}
    `;
    
    messagesList.appendChild(messageElement);
    
    // Faire défiler vers le bas
    scrollToBottom();
    
    // Ajouter les événements aux actions
    addMessageActions(messageElement, message);
}

// Ajouter des événements aux actions des messages
function addMessageActions(element, message) {
    element.dataset.messageId = message._id;
    const replyBtn = element.querySelector('[data-action="reply"]');
    const editBtn = element.querySelector('[data-action="edit"]');
    const deleteBtn = element.querySelector('[data-action="delete"]');
    const reactBtn = element.querySelector('[data-action="react"]');
    
    if (replyBtn) {
        replyBtn.addEventListener('click', () => replyToMessage(message));
    }
    
    if (editBtn) {
        editBtn.addEventListener('click', () => editMessage(message));
    }
    
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => deleteMessage(message._id));
    }
    
    if (reactBtn) {
        reactBtn.addEventListener('click', () => reactToMessage(message._id));
    }
}

// Répondre à un message
function replyToMessage(message) {
    replyPreview.style.display = 'block';
    replyPreview.innerHTML = `
        <div class="reply-preview-content">
            En réponse à ${message.sender._id === currentUser._id ? 'vous' : message.sender.name}: 
            ${message.content}
        </div>
        <button class="close-reply">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    replyPreview.dataset.replyTo = message._id;
    
    replyPreview.querySelector('.close-reply').addEventListener('click', () => {
        replyPreview.style.display = 'none';
        delete replyPreview.dataset.replyTo;
    });
    
    messageInput.focus();
}

// Modifier un message
function editMessage(message) {
    messageInput.value = message.content;
    messageInput.focus();
    messageInput.dataset.editId = message._id;
    
    // Changer le bouton d'envoi pour "Modifier"
    sendBtn.innerHTML = '<i class="fas fa-save"></i>';
    sendBtn.dataset.action = 'edit';
}

// Supprimer un message
function deleteMessage(messageId) {
    if (confirm('Voulez-vous vraiment supprimer ce message ?')) {
        socket.emit('delete-message', { messageId });
    }
}

// Réagir à un message
function reactToMessage(messageId) {
    const emoji = prompt("Quel emoji voulez-vous utiliser pour réagir ?");
    if (!emoji) return;
    socket.emit('react-to-message', { messageId, emoji });
}

// Envoyer un message
function sendMessage() {
    const content = messageInput.value.trim();
    if (!content || !currentChat) return;

    const editId = messageInput.dataset.editId;
    if (editId) {
        socket.emit('edit-message', { messageId: editId, newContent: content });

        // Réinitialiser l'interface après édition
        messageInput.value = '';
        replyPreview.style.display = 'none';
        delete replyPreview.dataset.replyTo;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        delete messageInput.dataset.editId;
        delete sendBtn.dataset.action;
        sendBtn.disabled = true;
        return;
    }
    
    const ephemeral = document.getElementById('ephemeral-select').value;
    const replyTo = replyPreview.dataset.replyTo;
    
    const messageData = {
        content,
        ephemeral: parseInt(ephemeral),
        replyTo
    };
    
    if (currentChat.isGroup) {
        messageData.groupId = currentChat._id;
        socket.emit('send-group-message', messageData);
    } else {
        messageData.receiverId = currentChat._id;
        socket.emit('send-message', messageData);
    }

    // Réinitialiser l'interface
    messageInput.value = '';
    replyPreview.style.display = 'none';
    delete replyPreview.dataset.replyTo;

    // Remettre le bouton d'envoi normal
    sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
    delete messageInput.dataset.editId;
    delete sendBtn.dataset.action;
    sendBtn.disabled = true;
}

// Gérer la saisie (indicateur "en train d'écrire")
let typingTimeout;
function handleTyping() {
    if (!currentChat || !socket) return;
    
    // Activer l'indicateur
    socket.emit('typing', { 
        to: currentChat._id, 
        isTyping: true,
        isGroup: currentChat.isGroup
    });
    
    // Désactiver après un délai
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('typing', { 
            to: currentChat._id, 
            isTyping: false,
            isGroup: currentChat.isGroup
        });
    }, 2000);
}

// Créer un groupe
async function createGroup() {
    const name = document.getElementById('group-name').value;
    const membersInput = document.getElementById('group-members').value;
    const avatarInput = document.getElementById('group-avatar');
    
    if (!name) {
        showToast('Veuillez entrer un nom pour le groupe');
        return;
    }
    
    const members = membersInput.split(',').map(m => m.trim()).filter(m => m);
    
    const formData = new FormData();
    formData.append('name', name);
    formData.append('members', JSON.stringify(members));
    
    if (avatarInput.files[0]) {
        formData.append('avatar', avatarInput.files[0]);
    }
    
    try {
        const response = await fetch('/api/groups', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('nexus-chat-token')}`
            },
            body: formData
        });
        
        if (response.ok) {
            const group = await response.json();
            loadGroups();
            groupModal.style.display = 'none';
            showToast('Groupe créé avec succès');
            
            // Réinitialiser le formulaire
            document.getElementById('group-name').value = '';
            document.getElementById('group-members').value = '';
            document.getElementById('group-avatar').value = '';
            document.getElementById('group-avatar-preview').innerHTML = '';
        } else {
            const error = await response.json();
            showToast(error.message || 'Erreur lors de la création du groupe');
        }
    } catch (error) {
        console.error('Error creating group:', error);
        showToast('Erreur lors de la création du groupe');
    }
}

// Mettre à jour le statut d'un utilisateur
function updateUserStatus(userId, isOnline) {
    const contactItems = document.querySelectorAll('.contact-item');
    
    contactItems.forEach(item => {
        const avatar = item.querySelector('.contact-avatar');
        if (avatar && avatar.dataset.userId === userId) {
            const onlineDot = avatar.querySelector('.online-dot');
            
            if (isOnline) {
                if (!onlineDot) {
                    const dot = document.createElement('span');
                    dot.className = 'online-dot';
                    avatar.appendChild(dot);
                }
            } else if (onlineDot) {
                avatar.removeChild(onlineDot);
            }
        }
    });
}

// Afficher une notification de nouveau message
function showNewMessageNotification(message) {
    const senderName = message.sender._id === currentUser._id ? 'Vous' : message.sender.name;
    const chatName = message.group ? message.group.name : senderName;
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <div class="toast-avatar">
            ${message.sender.avatar ? 
              `<img src="${message.sender.avatar}" alt="${senderName}">` : 
              senderName.charAt(0).toUpperCase()}
        </div>
        <div class="toast-content">
            <h4>${chatName}</h4>
            <p>${message.content}</p>
        </div>
        <button class="close-toast">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    toastContainer.appendChild(toast);
    
    // Fermer la notification après 5 secondes
    setTimeout(() => {
        toast.remove();
    }, 5000);
    
    // Fermer la notification au clic
    toast.querySelector('.close-toast').addEventListener('click', () => {
        toast.remove();
    });
    
    // Ouvrir la discussion au clic
    toast.addEventListener('click', () => {
        if (message.group) {
            openChat(message.group, true);
        } else {
            openChat(message.sender._id === currentUser._id ? message.receiver : message.sender, false);
        }
        toast.remove();
    });
}

// Afficher une notification toast
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Formater l'heure
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Faire défiler vers le bas de la discussion
function scrollToBottom() {
    messagesList.scrollTop = messagesList.scrollHeight;
}

// Mettre à jour la sélection dans la liste des contacts/groupes
function updateChatSelection() {
    const contactItems = document.querySelectorAll('.contact-item');
    contactItems.forEach(item => {
        item.classList.remove('active');
        
        if (currentChat && item.dataset.chatId === currentChat._id) {
            item.classList.add('active');
        }
    });
}

function showWelcomeScreen() {
    document.getElementById('welcome-screen').style.display = 'flex';
    document.getElementById('chat-container').style.display = 'none';
}

// Démarrer un appel
async function startCall(isVideo) {
    if (!currentChat || currentChat.isGroup) {
        showToast('Les appels de groupe ne sont pas encore supportés');
        return;
    }
    
    try {
        // Demander l'accès au média
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: isVideo
        });
        
        // Configurer la connexion WebRTC
        peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        });
        
        // Ajouter le flux local
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Configurer les événements ICE
        peerConnection.onicecandidate = ({ candidate }) => {
            if (candidate) {
                socket.emit('ice-candidate', {
                    to: currentChat._id,
                    candidate
                });
            }
        };
        
        peerConnection.oniceconnectionstatechange = () => {
            if (peerConnection.iceConnectionState === 'disconnected' ||
                peerConnection.iceConnectionState === 'failed') {
                endCall();
            }
        };
        
        // Créer une offre
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // Envoyer l'offre
        callData = {
            from: currentUser._id,
            to: currentChat._id,
            offer,
            isVideo
        };
        
        socket.emit('call-request', callData);
        
        // Afficher l'interface d'appel
        showCallInterface(isVideo);
        
    } catch (error) {
        console.error('Error starting call:', error);
        showToast('Erreur lors du démarrage de l\'appel');
        endCall();
    }
}

// Afficher l'interface d'appel
function showCallInterface(isVideo) {
    callModal.style.display = 'flex';
    document.getElementById('call-title').textContent = `Appel avec ${currentChat.name}`;
    document.getElementById('call-type').textContent = isVideo ? 'Appel vidéo' : 'Appel audio';
    
    // Afficher le flux local
    if (localStream) {
        localVideo.srcObject = localStream;
        
        if (!isVideo) {
            localVideo.style.display = 'none';
        }
    }
    
    // Démarrer le chronomètre
    let seconds = 0;
    callInterval = setInterval(() => {
        seconds++;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        document.getElementById('call-duration').textContent = 
            `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }, 1000);
}

// Afficher l'interface d'appel entrant
function showIncomingCall(from, name, avatar, isVideo) {
    // Si déjà en appel, refuser automatiquement
    if (peerConnection) {
        socket.emit('call-response', { 
            to: from, 
            accepted: false 
        });
        return;
    }
    
    callData = {
        from,
        isVideo
    };
    
    incomingCallModal.style.display = 'flex';
    document.getElementById('caller-name').textContent = name;
    document.getElementById('call-type').textContent = isVideo ? 'Appel vidéo entrant' : 'Appel audio entrant';
    
    if (avatar) {
        document.getElementById('caller-avatar').innerHTML = `<img src="${avatar}" alt="${name}">`;
    } else {
        document.getElementById('caller-avatar').textContent = name.charAt(0).toUpperCase();
    }
}

// Accepter un appel
async function acceptCall() {
    if (!callData) return;
    
    incomingCallModal.style.display = 'none';
    
    try {
        // Demander l'accès au média
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: callData.isVideo
        });
        
        // Configurer la connexion WebRTC
        peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        });
        
        // Ajouter le flux local
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Configurer les événements ICE
        peerConnection.onicecandidate = ({ candidate }) => {
            if (candidate) {
                socket.emit('ice-candidate', {
                    to: callData.from,
                    candidate
                });
            }
        };
        
        peerConnection.oniceconnectionstatechange = () => {
            if (peerConnection.iceConnectionState === 'disconnected' ||
                peerConnection.iceConnectionState === 'failed') {
                endCall();
            }
        };
        
        // Lorsqu'un flux distant est reçu
        peerConnection.ontrack = ({ streams }) => {
            remoteVideo.srcObject = streams[0];
        };
        
        // Définir l'offre distante
        await peerConnection.setRemoteDescription(callData.offer);
        
        // Créer une réponse
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        // Envoyer la réponse
        socket.emit('call-response', {
            to: callData.from,
            accepted: true,
            answer
        });
        
        // Afficher l'interface d'appel
        showCallInterface(callData.isVideo);
        
    } catch (error) {
        console.error('Error accepting call:', error);
        showToast('Erreur lors de l\'acceptation de l\'appel');
        endCall();
    }
}

// Refuser un appel
function declineCall() {
    if (!callData) return;
    
    socket.emit('call-response', { 
        to: callData.from, 
        accepted: false 
    });
    
    incomingCallModal.style.display = 'none';
    callData = null;
}

// Terminer un appel
function endCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (callInterval) {
        clearInterval(callInterval);
        callInterval = null;
    }
    
    callModal.style.display = 'none';
    incomingCallModal.style.display = 'none';
    
    // Notifier l'autre utilisateur
    if (callData) {
        socket.emit('end-call', { to: callData.from || callData.to });
        callData = null;
    }
    
    // Réinitialiser les éléments vidéo
    remoteVideo.srcObject = null;
    localVideo.srcObject = null;
    localVideo.style.display = 'block';
}

// Activer/désactiver le micro
function toggleMute() {
    if (!localStream) return;
    
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        muteBtn.classList.toggle('active', !audioTrack.enabled);
    }
}

// Activer/désactiver la vidéo
function toggleVideo() {
    if (!localStream) return;
    
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        videoBtn.classList.toggle('active', !videoTrack.enabled);
        localVideo.style.display = videoTrack.enabled ? 'block' : 'none';
    }
}