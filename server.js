require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const http = require('http');
const socketio = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketio(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Configuration
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/nexus-chat';

// Middleware
app.use(cors({
    origin: ['http://localhost:5000', 'votre-domaine.com'],
    credentials: true
}));
app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connexion à MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Connecté à MongoDB Atlas'))
.catch(err => {
    console.error('Erreur de connexion à MongoDB:', err);
    process.exit(1); // Quitte l'application en cas d'erreur
});

// Modèles
const User = require('./models/User');
const Message = require('./models/Message');
const Group = require('./models/Group');

// Configuration de Multer pour le stockage des fichiers
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

// Routes d'authentification
app.post('/api/auth/signup', upload.single('avatar'), async (req, res) => {
    try {
        const { name, username, password } = req.body;
        
        // Vérifier si l'utilisateur existe déjà
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Ce nom d\'utilisateur est déjà pris' });
        }
        
        // Hacher le mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Créer un nouvel utilisateur
        const user = new User({
            name,
            username,
            password: hashedPassword,
            online: false
        });
        
        // Si un avatar a été uploadé
        if (req.file) {
            user.avatar = `/uploads/${req.file.filename}`;
        }
        
        await user.save();
        
        // Générer un token JWT
        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
        
        res.status(201).json({ token, user });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Erreur lors de l\'inscription' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Trouver l'utilisateur
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Nom d\'utilisateur ou mot de passe incorrect' });
        }
        
        // Vérifier le mot de passe
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Nom d\'utilisateur ou mot de passe incorrect' });
        }
        
        // Générer un token JWT
        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({ token, user });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Erreur lors de la connexion' });
    }
});

// Middleware d'authentification
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ message: 'Authentification requise' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({ message: 'Authentification requise' });
        }
        
        req.user = user;
        req.token = token;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(401).json({ message: 'Authentification requise' });
    }
};

// Routes protégées
app.get('/api/users/me', authMiddleware, async (req, res) => {
    res.json(req.user);
});

app.get('/api/users/contacts', authMiddleware, async (req, res) => {
    try {
        // Récupérer tous les utilisateurs sauf l'utilisateur actuel
        const users = await User.find({ _id: { $ne: req.user._id } });
        
        // Pour chaque utilisateur, récupérer le dernier message et le nombre de messages non lus
        const contacts = await Promise.all(users.map(async user => {
            const lastMessage = await Message.findOne({
                $or: [
                    { sender: req.user._id, receiver: user._id },
                    { sender: user._id, receiver: req.user._id }
                ]
            }).sort({ createdAt: -1 }).populate('sender', 'name avatar');
            
            const unreadCount = await Message.countDocuments({
                sender: user._id,
                receiver: req.user._id,
                read: false
            });
            
            return {
                ...user.toObject(),
                lastMessage,
                unreadCount
            };
        }));
        
        res.json(contacts);
    } catch (error) {
        console.error('Error fetching contacts:', error);
        res.status(500).json({ message: 'Erreur lors de la récupération des contacts' });
    }
});

app.get('/api/messages/private/:userId', authMiddleware, async (req, res) => {
    try {
        const messages = await Message.find({
            $or: [
                { sender: req.user._id, receiver: req.params.userId },
                { sender: req.params.userId, receiver: req.user._id }
            ]
        })
        .sort({ createdAt: 1 })
        .populate('sender', 'name avatar')
        .populate('replyTo');
        
        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ message: 'Erreur lors de la récupération des messages' });
    }
});

app.get('/api/messages/group/:groupId', authMiddleware, async (req, res) => {
    try {
        // Vérifier que l'utilisateur fait partie du groupe
        const group = await Group.findById(req.params.groupId);
        if (!group.members.includes(req.user._id)) {
            return res.status(403).json({ message: 'Accès non autorisé' });
        }
        
        const messages = await Message.find({
            group: req.params.groupId
        })
        .sort({ createdAt: 1 })
        .populate('sender', 'name avatar')
        .populate('replyTo')
        .populate('group', 'name avatar');
        
        res.json(messages);
    } catch (error) {
        console.error('Error fetching group messages:', error);
        res.status(500).json({ message: 'Erreur lors de la récupération des messages de groupe' });
    }
});

// Routes pour les groupes
app.get('/api/groups', authMiddleware, async (req, res) => {
    try {
        const groups = await Group.find({ members: req.user._id });
        
        // Pour chaque groupe, récupérer le dernier message et le nombre de messages non lus
        const groupsWithMessages = await Promise.all(groups.map(async group => {
            const lastMessage = await Message.findOne({ group: group._id })
                .sort({ createdAt: -1 })
                .populate('sender', 'name avatar');
            
            const unreadCount = await Message.countDocuments({
                group: group._id,
                sender: { $ne: req.user._id },
                readBy: { $ne: req.user._id }
            });
            
            return {
                ...group.toObject(),
                lastMessage,
                unreadCount
            };
        }));
        
        res.json(groupsWithMessages);
    } catch (error) {
        console.error('Error fetching groups:', error);
        res.status(500).json({ message: 'Erreur lors de la récupération des groupes' });
    }
});

app.post('/api/groups', authMiddleware, upload.single('avatar'), async (req, res) => {
    try {
        const { name, members } = req.body;
        
        if (!name) {
            return res.status(400).json({ message: 'Le nom du groupe est requis' });
        }
        
        // Convertir la chaîne de membres en tableau
        let membersArray = [];
        if (members) {
            try {
                membersArray = JSON.parse(members);
            } catch (e) {
                return res.status(400).json({ message: 'Format des membres invalide' });
            }
        }
        
        // Ajouter l'utilisateur actuel aux membres
        membersArray.push(req.user._id);
        
        // Vérifier que tous les membres existent
        const existingUsers = await User.find({ _id: { $in: membersArray } });
        if (existingUsers.length !== membersArray.length) {
            return res.status(400).json({ message: 'Un ou plusieurs membres n\'existent pas' });
        }
        
        // Créer le groupe
        const group = new Group({
            name,
            members: membersArray,
            createdBy: req.user._id
        });
        
        // Si un avatar a été uploadé
        if (req.file) {
            group.avatar = `/uploads/${req.file.filename}`;
        }
        
        await group.save();
        
        res.status(201).json(group);
    } catch (error) {
        console.error('Error creating group:', error);
        res.status(500).json({ message: 'Erreur lors de la création du groupe' });
    }
});

// Gestion des sockets
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
        return next(new Error('Authentification requise'));
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.userId = decoded.userId;
        next();
    } catch (error) {
        next(new Error('Authentification invalide'));
    }
});

const onlineUsers = new Map();

io.on('connection', async (socket) => {
    console.log(`Nouvelle connexion: ${socket.id}`);
    
    // Mettre à jour le statut de l'utilisateur
    await User.findByIdAndUpdate(socket.userId, { online: true });
    onlineUsers.set(socket.userId, socket.id);
    
    // Notifier les autres utilisateurs
    socket.broadcast.emit('presence', { 
        userId: socket.userId, 
        isOnline: true 
    });
    
    // Événements de messagerie
    socket.on('send-message', async ({ content, receiverId, ephemeral = 0, replyTo }) => {
        try {
            const message = new Message({
                content,
                sender: socket.userId,
                receiver: receiverId,
                ephemeral,
                replyTo
            });
            
            await message.save();
            
            // Populer les données pour l'envoyer aux clients
            const populatedMessage = await Message.populate(message, [
                { path: 'sender', select: 'name avatar' },
                { path: 'receiver', select: 'name avatar' },
                { path: 'replyTo', populate: { path: 'sender', select: 'name' } }
            ]);
            
            // Envoyer au destinataire
            const receiverSocketId = onlineUsers.get(receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('new-message', populatedMessage);
            }
            
            // Envoyer aussi à l'expéditeur (pour une mise à jour en temps réel)
            socket.emit('new-message', populatedMessage);
            
            // Si le message est éphémère, programmer sa suppression
            if (ephemeral > 0) {
                setTimeout(async () => {
                    await Message.findByIdAndDelete(message._id);
                    
                    // Notifier les clients
                    io.emit('delete-message', { messageId: message._id });
                }, ephemeral * 1000);
            }
        } catch (error) {
            console.error('Error sending message:', error);
        }
    });
    
    socket.on('send-group-message', async ({ content, groupId, ephemeral = 0, replyTo }) => {
        try {
            // Vérifier que l'utilisateur fait partie du groupe
            const group = await Group.findById(groupId);
            if (!group.members.includes(socket.userId)) {
                return;
            }
            
            const message = new Message({
                content,
                sender: socket.userId,
                group: groupId,
                ephemeral,
                replyTo
            });
            
            await message.save();
            
            // Populer les données pour l'envoyer aux clients
            const populatedMessage = await Message.populate(message, [
                { path: 'sender', select: 'name avatar' },
                { path: 'group', select: 'name avatar' },
                { path: 'replyTo', populate: { path: 'sender', select: 'name' } }
            ]);
            
            // Envoyer à tous les membres du groupe en ligne
            group.members.forEach(memberId => {
                if (memberId.toString() !== socket.userId.toString()) {
                    const memberSocketId = onlineUsers.get(memberId.toString());
                    if (memberSocketId) {
                        io.to(memberSocketId).emit('new-message', populatedMessage);
                    }
                }
            });
            
            // Envoyer aussi à l'expéditeur
            socket.emit('new-message', populatedMessage);
            
            // Si le message est éphémère, programmer sa suppression
            if (ephemeral > 0) {
                setTimeout(async () => {
                    await Message.findByIdAndDelete(message._id);
                    
                    // Notifier les clients
                    io.emit('delete-message', { messageId: message._id });
                }, ephemeral * 1000);
            }
        } catch (error) {
            console.error('Error sending group message:', error);
        }
    });
    
    socket.on('typing', async ({ to, isTyping, isGroup }) => {
        try {
            if (isGroup) {
                // Vérifier que l'utilisateur fait partie du groupe
                const group = await Group.findById(to);
                if (!group.members.includes(socket.userId)) {
                    return;
                }
                
                // Envoyer à tous les membres du groupe sauf l'expéditeur
                group.members.forEach(memberId => {
                    if (memberId.toString() !== socket.userId.toString()) {
                        const memberSocketId = onlineUsers.get(memberId.toString());
                        if (memberSocketId) {
                            io.to(memberSocketId).emit('typing', { 
                                from: socket.userId, 
                                isTyping 
                            });
                        }
                    }
                });
            } else {
                // Vérifier que le destinataire existe
                const receiver = await User.findById(to);
                if (!receiver) {
                    return;
                }
                
                // Envoyer au destinataire
                const receiverSocketId = onlineUsers.get(to);
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('typing', { 
                        from: socket.userId, 
                        isTyping 
                    });
                }
            }
        } catch (error) {
            console.error('Error handling typing event:', error);
        }
    });
    
    socket.on('read-messages', async ({ senderId }) => {
        try {
            await Message.updateMany(
                { sender: senderId, receiver: socket.userId, read: false },
                { $set: { read: true } }
            );
            
            // Notifier l'expéditeur que ses messages ont été lus
            const senderSocketId = onlineUsers.get(senderId);
            if (senderSocketId) {
                io.to(senderSocketId).emit('messages-read', { 
                    readerId: socket.userId 
                });
            }
        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    });
    
    socket.on('read-group-messages', async ({ groupId }) => {
        try {
            await Message.updateMany(
                { group: groupId, sender: { $ne: socket.userId }, readBy: { $ne: socket.userId } },
                { $addToSet: { readBy: socket.userId } }
            );
        } catch (error) {
            console.error('Error marking group messages as read:', error);
        }
    });

    socket.on('edit-message', async ({ messageId, newContent }) => {
        try {
            const message = await Message.findById(messageId);
            if (!message || message.sender.toString() !== socket.userId) {
                return;
            }

            message.content = newContent;
            message.edited = true;
            await message.save();

            const populatedMessage = await Message.populate(message, [
                { path: 'sender', select: 'name avatar' },
                { path: 'receiver', select: 'name avatar' },
                { path: 'group', select: 'name avatar' }
            ]);

            if (message.group) {
                const group = await Group.findById(message.group);
                group.members.forEach(memberId => {
                    const memberSocketId = onlineUsers.get(memberId.toString());
                    if (memberSocketId) io.to(memberSocketId).emit('message-updated', populatedMessage);
                });
            } else {
                const receiverSocketId = onlineUsers.get(message.receiver.toString());
                if (receiverSocketId) io.to(receiverSocketId).emit('message-updated', populatedMessage);
                socket.emit('message-updated', populatedMessage);
            }
        } catch (error) {
            console.error('Error editing message:', error);
        }
    });
    
    socket.on('delete-message', async ({ messageId }) => {
        try {
            const message = await Message.findById(messageId);
            
            // Vérifier que l'utilisateur est l'expéditeur
            if (message.sender.toString() !== socket.userId.toString()) {
                return;
            }
            
            // Marquer comme supprimé plutôt que de supprimer réellement
            message.deleted = true;
            await message.save();
            
            // Diffuser la suppression
            if (message.group) {
                // Message de groupe
                const group = await Group.findById(message.group);
                group.members.forEach(memberId => {
                    const memberSocketId = onlineUsers.get(memberId.toString());
                    if (memberSocketId) {
                        io.to(memberSocketId).emit('delete-message', { messageId });
                    }
                });
            } else {
                // Message privé
                const receiverSocketId = onlineUsers.get(message.receiver.toString());
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('delete-message', { messageId });
                }
                socket.emit('delete-message', { messageId });
            }
        } catch (error) {
            console.error('Error deleting message:', error);
        }
    });
    
    socket.on('react-to-message', async ({ messageId, emoji }) => {
        try {
            const message = await Message.findById(messageId);
            
            // Vérifier que l'utilisateur a le droit de réagir (fait partie de la conversation)
            let hasAccess = false;
            
            if (message.group) {
                const group = await Group.findById(message.group);
                hasAccess = group.members.includes(socket.userId);
            } else {
                hasAccess = message.sender.equals(socket.userId) || message.receiver.equals(socket.userId);
            }
            
            if (!hasAccess) {
                return;
            }
            
            // Ajouter ou mettre à jour la réaction
            const existingReaction = message.reactions.find(r => r.emoji === emoji);
            
            if (existingReaction) {
                // Incrémenter le compteur si l'utilisateur n'a pas déjà réagi avec cet emoji
                if (!existingReaction.users.includes(socket.userId)) {
                    existingReaction.count += 1;
                    existingReaction.users.push(socket.userId);
                }
            } else {
                message.reactions.push({
                    emoji,
                    count: 1,
                    users: [socket.userId]
                });
            }
            
            await message.save();
            
            // Diffuser la réaction
            if (message.group) {
                // Message de groupe
                const group = await Group.findById(message.group);
                group.members.forEach(memberId => {
                    const memberSocketId = onlineUsers.get(memberId.toString());
                    if (memberSocketId) {
                        io.to(memberSocketId).emit('message-reaction', { 
                            messageId, 
                            reactions: message.reactions 
                        });
                    }
                });
            } else {
                // Message privé
                const receiverSocketId = onlineUsers.get(message.receiver.toString());
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('message-reaction', { 
                        messageId, 
                        reactions: message.reactions 
                    });
                }
                socket.emit('message-reaction', { 
                    messageId, 
                    reactions: message.reactions 
                });
            }
        } catch (error) {
            console.error('Error adding reaction:', error);
        }
    });
    
    // Gestion des appels WebRTC
    socket.on('call-request', ({ to, offer, isVideo }) => {
        // Vérifier que le destinataire est en ligne
        const receiverSocketId = onlineUsers.get(to);
        
        if (receiverSocketId) {
            // Récupérer les informations de l'appelant
            User.findById(socket.userId)
                .then(caller => {
                    // Envoyer la demande d'appel au destinataire
                    io.to(receiverSocketId).emit('call-request', {
                        from: socket.userId,
                        name: caller.name,
                        avatar: caller.avatar,
                        offer,
                        isVideo
                    });
                })
                .catch(error => {
                    console.error('Error fetching caller info:', error);
                });
        }
    });
    
    socket.on('call-response', ({ to, accepted, answer }) => {
        const receiverSocketId = onlineUsers.get(to);
        
        if (receiverSocketId) {
            io.to(receiverSocketId).emit(accepted ? 'call-accepted' : 'call-ended', {
                answer
            });
        }
    });
    
    socket.on('ice-candidate', ({ to, candidate }) => {
        const receiverSocketId = onlineUsers.get(to);
        
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('ice-candidate', { candidate });
        }
    });
    
    socket.on('end-call', ({ to }) => {
        const receiverSocketId = onlineUsers.get(to);
        
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('call-ended');
        }
    });
    
    // Déconnexion
    socket.on('disconnect', async () => {
        console.log(`Déconnexion: ${socket.id}`);
        
        // Vérifier si l'utilisateur n'a pas d'autres connexions actives
        const otherSockets = Array.from(onlineUsers.entries())
            .filter(([userId, socketId]) => 
                userId === socket.userId && socketId !== socket.id);
        
        if (otherSockets.length === 0) {
            // Mettre à jour le statut de l'utilisateur
            await User.findByIdAndUpdate(socket.userId, { online: false });
            onlineUsers.delete(socket.userId);
            
            // Notifier les autres utilisateurs
            socket.broadcast.emit('presence', { 
                userId: socket.userId, 
                isOnline: false 
            });
        }
    });
});
// Route pour servir l'application frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// Démarrer le serveur
server.listen(PORT, () => {
    console.log(`Serveur en écoute sur le port ${PORT}`);
});