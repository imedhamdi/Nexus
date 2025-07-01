/**
 * Nexus Chat - Serveur Backend Complet
 * Version de production avec persistance, sécurité renforcée et gestion d'état
 */

require('dotenv').config();

// Vérification des variables d'environnement obligatoires
if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
  console.error('MONGODB_URI et JWT_SECRET doivent être définis dans le fichier .env');
  process.exit(1);
}
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Configuration des serveurs STUN/TURN pour WebRTC
const iceServers = process.env.ICE_SERVERS
  ? JSON.parse(process.env.ICE_SERVERS)
  : [{ urls: 'stun:stun.l.google.com:19302' }];

// Initialisation de l'application Express
const app = express();
const server = http.createServer(app);

// Liste des utilisateurs connectés (pour Socket.io)
const connectedUsers = {};

// Configuration des middlewares
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL,
}));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https://i.pravatar.cc"],
      fontSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      mediaSrc: ["'self'", "https://assets.mixkit.co"],
      connectSrc: ["'self'", "ws:", "wss:"]
    },
  }
}));

// Limiteur de débit pour les routes sensibles
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez plus tard.' }
});

// Configuration de Socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"],
  }
});

// Connexion à MongoDB avec gestion d'erreur
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('[MONGODB] Connecté avec succès');
  } catch (err) {
    console.error('[MONGODB] Erreur de connexion:', err.message);
    process.exit(1);
  }
};
connectDB();

// Schémas et modèles Mongoose
const UserSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    index: true,
    trim: true,
    minlength: 3,
    maxlength: 20,
    match: /^[a-zA-Z0-9_]+$/ // N'autorise que les caractères alphanumériques et underscores
  },
  password: { 
    type: String, 
    required: true,
    minlength: 6
  },
  name: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 50
  },
  avatar: {
    type: String,
    default: null
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

const GroupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  avatar: String,
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  pendingInvitations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  editHistory: [{
    name: String,
    avatar: String,
    members: [mongoose.Schema.Types.ObjectId],
    updatedAt: Date,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const MessageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() { return !this.group; }
  },
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: function() { return !this.recipient; }
  },
  content: {
    type: String,
    required: true,
    maxlength: 2000
  },
  type: { 
    type: String, 
    enum: ['text', 'image', 'file'], 
    default: 'text' 
  },
  fileUrl: {
    type: String
  },
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  replySnippet: String,
  reactions: {
    type: Map,
    of: [mongoose.Schema.Types.ObjectId],
    default: {}
  },
  expiresAt: Date,
  read: {
    type: Boolean,
    default: false
  },
  readBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readAt: Date
  }],
  edited: {
    type: Boolean,
    default: false
  },
  editHistory: [
    {
      content: String,
      editedAt: Date
    }
  ],
  deleted: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Index pour accélérer la recherche des messages par participants et date
MessageSchema.index({ sender: 1, recipient: 1, createdAt: 1 });
MessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const User = mongoose.model('User', UserSchema);
const Message = mongoose.model('Message', MessageSchema);
const Group = mongoose.model('Group', GroupSchema);

// Utilitaire pour valider les ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);


// Configuration Multer pour les uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;
    cb(null, filename);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 
    'image/png', 
    'image/gif',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non supporté. Seuls les images, PDF et documents texte sont autorisés.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1
  }
});

// Middleware d'authentification JWT
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentification requise' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ error: 'Utilisateur non trouvé' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expiré' });
    }
    return res.status(401).json({ error: 'Token invalide' });
  }
};

// Middleware d'authentification pour Socket.io
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentification requise'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return next(new Error('Utilisateur non trouvé'));
    }

    socket.user = {
      id: user._id,
      username: user.username,
      name: user.name,
      avatar: user.avatar
    };
    next();
  } catch (err) {
    next(new Error(err.message === 'jwt expired' ? 'Token expiré' : 'Token invalide'));
  }
});

// Routes API
app.post('/api/register', authLimiter, upload.single('avatar'), async (req, res) => {
  const { username, password, name } = req.body;

  if (!username || !password || !name) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ error: 'Nom d\'utilisateur invalide (3-20 caractères alphanumériques ou underscores)' });
  }
  if (name.trim().length === 0 || name.length > 50) {
    return res.status(400).json({ error: 'Le nom doit contenir entre 1 et 50 caractères' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
  }
  try {

    // Vérification de l'unicité du username
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Nom d\'utilisateur déjà pris' });
    }

    // Hachage du mot de passe
    const hashedPassword = await bcrypt.hash(password, 12);

    const avatar = req.file ? `/uploads/${req.file.filename}` : null;

    // Création de l'utilisateur
    const user = new User({
      username,
      password: hashedPassword,
      name,
      avatar
    });
    await user.save();

    // Génération du token JWT
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Réponse sans le mot de passe
    const userResponse = {
      id: user._id,
      username: user.username,
      name: user.name,
      avatar: user.avatar,
      createdAt: user.createdAt
    };

    res.status(201).json({ 
      token, 
      user: userResponse 
    });
  } catch (err) {
    console.error('[REGISTER] Erreur:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Erreur lors de l\'inscription' });
  }
});

app.post('/api/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validation des entrées
    if (!username || !password) {
      return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
    }

    // Recherche de l'utilisateur
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    // Vérification du mot de passe
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    // Génération du token JWT
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Réponse sans le mot de passe
    const userResponse = {
      id: user._id,
      username: user.username,
      name: user.name,
      avatar: user.avatar,
      createdAt: user.createdAt
    };

    res.json({ 
      token, 
      user: userResponse 
    });
  } catch (err) {
    console.error('[LOGIN] Erreur:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
});

// Liste des utilisateurs (contacts)
app.get('/api/users', authenticate, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } })
      .select('_id username name avatar');

    const enriched = await Promise.all(users.map(async (u) => {
      const lastMsg = await Message.findOne({
        $or: [
          { sender: req.user._id, recipient: u._id },
          { sender: u._id, recipient: req.user._id }
        ]
      })
        .sort({ createdAt: -1 })
        .select('content');

      const unreadCount = await Message.countDocuments({
        sender: u._id,
        recipient: req.user._id,
        read: false
      });

      return {
        id: u._id,
        username: u.username,
        name: u.name,
        avatar: u.avatar,
        online: Boolean(connectedUsers[u.username]),
        lastMessage: lastMsg ? lastMsg.content : null,
        unreadCount
      };
    }));

    res.json(enriched);
  } catch (err) {
    console.error('[GET USERS] Erreur:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs' });
  }
});

app.get('/api/users/me', authenticate, (req, res) => {
  res.json(req.user);
});

app.post('/api/upload-avatar', authenticate, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier uploadé' });
    }

    // Mise à jour de l'avatar de l'utilisateur
    req.user.avatar = `/uploads/${req.file.filename}`;
    await req.user.save();

    res.json({ 
      success: true, 
      avatar: req.user.avatar 
    });
  } catch (err) {
    console.error('[UPLOAD AVATAR] Erreur:', err);
    res.status(500).json({ error: 'Erreur lors de l\'upload de l\'avatar' });
  }
});

app.post('/api/upload-file', authenticate, upload.single('file'), async (req, res) => {
  try {
    const { chatId, chatType } = req.body;

    if (!chatId || !chatType) {
      return res.status(400).json({ error: 'chatId et chatType requis' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier uploadé' });
    }

    let recipientUser = null;
    let group = null;

    if (chatType === 'private') {
      recipientUser = await User.findById(chatId);
      if (!recipientUser) {
        return res.status(404).json({ error: 'Destinataire non trouvé' });
      }
    } else if (chatType === 'group') {
      group = await Group.findById(chatId);
      if (!group) {
        return res.status(404).json({ error: 'Groupe non trouvé' });
      }
      if (!group.members.some(m => m.equals(req.user._id))) {
        return res.status(403).json({ error: 'Action non autorisée' });
      }
    } else {
      return res.status(400).json({ error: 'chatType invalide' });
    }

    // Détermination du type de fichier
    const fileType = req.file.mimetype.startsWith('image/') ? 'image' : 'file';
    const fileUrl = `/uploads/${req.file.filename}`;

    // Création du message
    const message = new Message({
      sender: req.user._id,
      content: req.file.originalname,
      type: fileType,
      fileUrl,
      ...(chatType === 'private' ? { recipient: recipientUser._id } : { group: group._id })
    });
    await message.save();

    const payload = {
      id: message._id,
      sender: req.user.username,
      senderName: req.user.name,
      senderAvatar: req.user.avatar,
      content: req.file.originalname,
      type: fileType,
      fileUrl,
      createdAt: message.createdAt,
      read: false,
      ...(chatType === 'group' ? { group: group._id.toString() } : { recipient: recipientUser.username })
    };

    if (chatType === 'private') {
      const recipientSocketId = connectedUsers[recipientUser.username];
      const senderSocketId = connectedUsers[req.user.username];
      if (recipientSocketId) io.to(recipientSocketId).emit('new-message', payload);
      if (senderSocketId) io.to(senderSocketId).emit('new-message', payload);
    } else {
      const members = await User.find({ _id: { $in: group.members } }).select('username');
      members.forEach(u => {
        const sid = connectedUsers[u.username];
        if (sid) io.to(sid).emit('new-group-message', payload);
      });
    }

    res.status(200).json({ success: true, messageId: message._id });
  } catch (err) {
    console.error('[UPLOAD FILE] Erreur:', err);
    res.status(500).json({ error: 'Erreur lors de l\'upload du fichier' });
  }
});

// Créer un groupe
app.post('/api/groups', authenticate, async (req, res) => {
  try {
    const { name, avatar, usernames } = req.body;

    if (!name || !Array.isArray(usernames)) {
      return res.status(400).json({ error: 'Nom et membres requis' });
    }

    if (usernames.includes(req.user.username)) {
      return res.status(400).json({ error: 'Ne vous ajoutez pas vous-même' });
    }

    if (name.length < 3 || name.length > 50) {
      return res.status(400).json({ error: 'Le nom doit contenir entre 3 et 50 caractères' });
    }

    const uniqueUsernames = [...new Set(usernames)];
    if (uniqueUsernames.length !== usernames.length) {
      return res.status(400).json({ error: 'La liste des utilisateurs contient des doublons' });
    }

    const users = await User.find({ username: { $in: uniqueUsernames } });
    if (users.length !== uniqueUsernames.length) {
      return res.status(400).json({ error: 'Certains membres sont introuvables' });
    }

    const invitedIds = users.map(u => u._id);

    const group = new Group({
      name,
      avatar,
      members: [req.user._id],
      pendingInvitations: invitedIds,
      createdBy: req.user._id
    });
    await group.save();

    // Notifier les utilisateurs invités
    users.forEach(u => {
      const sid = connectedUsers[u.username];
      if (sid) {
        io.to(sid).emit('group-invitation', { id: group._id, name: group.name });
      }
    });

    res.status(201).json({ success: true, groupId: group._id });
  } catch (err) {
    console.error('[CREATE GROUP] Erreur:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Erreur lors de la création du groupe' });
  }
});

// Modifier un groupe
app.patch('/api/groups/:id', authenticate, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'ID invalide' });
    }

    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ error: 'Groupe non trouvé' });
    }

    if (!group.members.some(m => m.equals(req.user._id))) {
      return res.status(403).json({ error: 'Action non autorisée' });
    }

    const { name, avatar, members } = req.body;
    const updates = {};

    if (name) {
      if (name.length < 3 || name.length > 50) {
        return res.status(400).json({ error: 'Le nom doit contenir entre 3 et 50 caractères' });
      }
      updates.name = name;
    }

    if (avatar) updates.avatar = avatar;

    if (Array.isArray(members)) {
      const uniqueMembers = Array.from(new Set(members));
      if (uniqueMembers.length < 2 || uniqueMembers.length > 100) {
        return res.status(400).json({ error: 'Le groupe doit avoir entre 2 et 100 membres' });
      }
      const users = await User.find({ _id: { $in: uniqueMembers } });
      if (users.length !== uniqueMembers.length) {
        return res.status(400).json({ error: 'Certains membres sont introuvables' });
      }
      updates.members = uniqueMembers;
    }

    const historyEntry = {
      name: group.name,
      avatar: group.avatar,
      members: group.members,
      updatedAt: new Date(),
      updatedBy: req.user._id
    };
    group.editHistory.push(historyEntry);
    Object.assign(group, updates, { updatedAt: new Date() });
    await group.save();

    res.json({ success: true });
  } catch (err) {
    console.error('[EDIT GROUP] Erreur:', err);
    res.status(500).json({ error: 'Erreur lors de la modification du groupe' });
  }
});

// Lister les groupes de l'utilisateur
app.get('/api/groups', authenticate, async (req, res) => {
  try {
    const groups = await Group.find({ members: req.user._id }).select('_id name avatar members updatedAt');
    res.json(groups);
  } catch (err) {
    console.error('[GET GROUPS] Erreur:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des groupes' });
  }
});

// Accepter une invitation de groupe
app.post('/api/groups/:groupId/invitations/accept', authenticate, async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!isValidObjectId(groupId)) {
      return res.status(400).json({ error: 'ID invalide' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Groupe non trouvé' });
    }

    const userId = req.user._id;
    if (!group.pendingInvitations.some(id => id.equals(userId))) {
      return res.status(400).json({ error: 'Invitation introuvable' });
    }

    group.pendingInvitations = group.pendingInvitations.filter(id => !id.equals(userId));
    if (!group.members.some(id => id.equals(userId))) {
      group.members.push(userId);
    }
    await group.save();

    res.json({ success: true });
  } catch (err) {
    console.error('[ACCEPT INVITATION] Erreur:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Erreur lors de l\'acceptation de l\'invitation' });
  }
});

// Refuser une invitation de groupe
app.post('/api/groups/:groupId/invitations/decline', authenticate, async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!isValidObjectId(groupId)) {
      return res.status(400).json({ error: 'ID invalide' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Groupe non trouvé' });
    }

    const userId = req.user._id;
    if (!group.pendingInvitations.some(id => id.equals(userId))) {
      return res.status(400).json({ error: 'Invitation introuvable' });
    }

    group.pendingInvitations = group.pendingInvitations.filter(id => !id.equals(userId));
    await group.save();

    res.json({ success: true });
  } catch (err) {
    console.error('[DECLINE INVITATION] Erreur:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Erreur lors du refus de l\'invitation' });
  }
});


app.get('/api/messages', authenticate, async (req, res) => {
  try {
    const { partner, page = 1, limit = 50 } = req.query; // partner est l'ID du correspondant

    if (!partner) {
      return res.status(400).json({ error: 'Paramètre partner manquant' });
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const maxLimit = Math.min(parseInt(limit, 10), 100);

    // Récupération des messages entre les deux utilisateurs
    const rawMessages = await Message.find({
      $or: [
        { sender: req.user._id, recipient: partner },
        { sender: partner, recipient: req.user._id }
      ]
    })
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(maxLimit)
    .populate('sender', 'username');

    const messages = rawMessages.map(m => ({
      id: m._id,
      sender: m.sender.username,
      content: m.content,
      type: m.type,
      fileUrl: m.fileUrl,
      replyTo: m.replyTo,
      replySnippet: m.replySnippet,
      reactions: Object.fromEntries(m.reactions),
      expiresAt: m.expiresAt,
      createdAt: m.createdAt,
      read: m.read,
      edited: m.edited,
      deleted: m.deleted
    }));

    res.json(messages);
  } catch (err) {
    console.error('[GET MESSAGES] Erreur:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des messages' });
  }
});

// Récupérer les messages d'un groupe
app.get('/api/groups/:id/messages', authenticate, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'ID invalide' });
    }

    const { page = 1, limit = 50 } = req.query;
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ error: 'Groupe non trouvé' });
    }
    if (!group.members.some(m => m.equals(req.user._id))) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const maxLimit = Math.min(parseInt(limit, 10), 100);

    const rawMessages = await Message.find({ group: group._id })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(maxLimit)
      .populate('sender', 'username');

    const messages = rawMessages.map(m => ({
      id: m._id,
      sender: m.sender.username,
      content: m.content,
      type: m.type,
      fileUrl: m.fileUrl,
      replyTo: m.replyTo,
      replySnippet: m.replySnippet,
      reactions: Object.fromEntries(m.reactions),
      expiresAt: m.expiresAt,
      createdAt: m.createdAt,
      readBy: m.readBy,
      edited: m.edited,
      deleted: m.deleted
    }));

    res.json(messages);
  } catch (err) {
    console.error('[GET GROUP MESSAGES] Erreur:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des messages de groupe' });
  }
});

// Modifier un message existant
app.put('/api/messages/:id', authenticate, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'ID invalide' });
    }

    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'Contenu manquant' });
    }

    const message = await Message.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Message non trouvé' });
    }

    if (!message.sender.equals(req.user._id)) {
      return res.status(403).json({ error: 'Action non autorisée' });
    }

    message.editHistory.push({ content: message.content, editedAt: new Date() });
    message.content = content;
    message.edited = true;
    await message.save();

    const recipientUser = await User.findById(message.recipient);
    const recipientSocketId = connectedUsers[recipientUser.username];
    const senderSocketId = connectedUsers[req.user.username];
    const payload = {
      id: message._id,
      content: message.content,
      edited: message.edited
    };
    if (recipientSocketId) io.to(recipientSocketId).emit('message-edited', payload);
    if (senderSocketId) io.to(senderSocketId).emit('message-edited', payload);

    res.json({ success: true });
  } catch (err) {
    console.error('[EDIT MESSAGE] Erreur:', err);
    res.status(500).json({ error: 'Erreur lors de la modification du message' });
  }
});

// Supprimer un message (soft delete)
app.delete('/api/messages/:id', authenticate, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'ID invalide' });
    }

    const message = await Message.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Message non trouvé' });
    }

    if (!message.sender.equals(req.user._id)) {
      return res.status(403).json({ error: 'Action non autorisée' });
    }

    message.deleted = true;
    await message.save();

    const recipientUser = await User.findById(message.recipient);
    const recipientSocketId = connectedUsers[recipientUser.username];
    const senderSocketId = connectedUsers[req.user.username];
    const payload = { id: message._id };
    if (recipientSocketId) io.to(recipientSocketId).emit('message-deleted', payload);
    if (senderSocketId) io.to(senderSocketId).emit('message-deleted', payload);

    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE MESSAGE] Erreur:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression du message' });
  }
});

// Renvoyer la configuration WebRTC côté client
app.get('/api/webrtc-config', (req, res) => {
  res.json({ iceServers });
});

// Serveur de fichiers statiques
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'public')));

// Gestion des connexions Socket.io

io.on('connection', (socket) => {
  console.log(`[SOCKET] ${socket.user.username} connecté (ID: ${socket.id})`);
  
  // Ajout de l'utilisateur à la liste des connectés
  connectedUsers[socket.user.username] = socket.id;
  io.emit('users-updated', Object.keys(connectedUsers));

  // Gestion de la déconnexion
  socket.on('disconnect', () => {
    console.log(`[SOCKET] ${socket.user.username} déconnecté`);
    delete connectedUsers[socket.user.username];
    io.emit('users-updated', Object.keys(connectedUsers));
  });

  // Indicateur de frappe
  socket.on('typing', ({ recipient }) => {
    const sid = connectedUsers[recipient];
    if (sid) {
      io.to(sid).emit('typing', { sender: socket.user.username });
    }
  });

  socket.on('stop-typing', ({ recipient }) => {
    const sid = connectedUsers[recipient];
    if (sid) {
      io.to(sid).emit('stop-typing', { sender: socket.user.username });
    }
  });

  // Gestion des messages
  socket.on('send-message', async ({ recipient, content, type = 'text', replyTo, expiresIn }, callback) => {
    try {
      // Validation des données
      if (!recipient || !content) {
        if (typeof callback === 'function') {
          return callback({ success: false, error: 'Destinataire et contenu requis' });
        }
        return;
      }

      // Vérification que le destinataire existe
      const recipientUser = await User.findById(recipient);
      if (!recipientUser) {
        if (typeof callback === 'function') {
          return callback({ success: false, error: 'Destinataire non trouvé' });
        }
        return;
      }

      // Création et sauvegarde du message
      let replySnippet;
      if (replyTo) {
        const original = await Message.findById(replyTo);
        if (original) {
          replySnippet = original.content.substring(0, 50);
        }
      }

      const message = new Message({
        sender: socket.user.id,
        recipient: recipientUser._id,
        content,
        type,
        replyTo: replyTo || undefined,
        replySnippet,
        expiresAt: expiresIn ? new Date(Date.now() + expiresIn) : undefined
      });
      await message.save();

      // Envoi en temps réel si le destinataire est connecté
      const recipientSocketId = connectedUsers[recipientUser.username];
      const senderSocketId = connectedUsers[socket.user.username];
      const payload = {
        id: message._id,
        sender: socket.user.username,
        senderName: socket.user.name,
        senderAvatar: socket.user.avatar,
        content,
        type,
        replyTo: message.replyTo,
        replySnippet: message.replySnippet,
        reactions: Object.fromEntries(message.reactions),
        expiresAt: message.expiresAt,
        createdAt: message.createdAt,
        read: false
      };
      if (recipientSocketId) io.to(recipientSocketId).emit('new-message', payload);
      if (senderSocketId) io.to(senderSocketId).emit('new-message', payload);

      if (typeof callback === 'function') {
        callback({
          success: true,
          messageId: message._id
        });
      }
    } catch (err) {
      console.error('[SEND MESSAGE] Erreur:', err);
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Erreur d\'envoi du message' });
      }
    }
  });

  // Gestion des messages de groupe
  socket.on('send-group-message', async ({ groupId, content, type = 'text', replyTo, expiresIn }, callback) => {
    try {
      if (!groupId || !content) {
        if (typeof callback === 'function') {
          return callback({ success: false, error: 'Groupe et contenu requis' });
        }
        return;
      }

      const group = await Group.findById(groupId);
      if (!group) {
        if (typeof callback === 'function') {
          return callback({ success: false, error: 'Groupe non trouvé' });
        }
        return;
      }

      if (!group.members.some(m => m.equals(socket.user.id))) {
        if (typeof callback === 'function') {
          return callback({ success: false, error: 'Action non autorisée' });
        }
        return;
      }

      let replySnippet;
      if (replyTo) {
        const original = await Message.findById(replyTo);
        if (original) {
          replySnippet = original.content.substring(0, 50);
        }
      }

      const message = new Message({
        sender: socket.user.id,
        group: group._id,
        content,
        type,
        replyTo: replyTo || undefined,
        replySnippet,
        expiresAt: expiresIn ? new Date(Date.now() + expiresIn) : undefined
      });
      await message.save();

      const payload = {
        id: message._id,
        group: group._id.toString(),
        sender: socket.user.username,
        senderName: socket.user.name,
        senderAvatar: socket.user.avatar,
        content,
        type,
        replyTo: message.replyTo,
        replySnippet: message.replySnippet,
        reactions: Object.fromEntries(message.reactions),
        expiresAt: message.expiresAt,
        createdAt: message.createdAt
      };

      const members = await User.find({ _id: { $in: group.members } }).select('username');
      members.forEach(u => {
        const sid = connectedUsers[u.username];
        if (sid) io.to(sid).emit('new-group-message', payload);
      });

      if (typeof callback === 'function') {
        callback({ success: true, messageId: message._id });
      }

    } catch (err) {
      console.error('[SEND GROUP MESSAGE] Erreur:', err);
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Erreur lors de l\'envoi du message' });
      }
    }
  });

  // Ajouter ou retirer une réaction
  socket.on('add-reaction', async ({ messageId, emoji }, callback) => {
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        if (typeof callback === 'function') {
          return callback({ success: false, error: 'Message non trouvé' });
        }
        return;
      }

      const userId = socket.user.id.toString();
      const list = message.reactions.get(emoji) || [];
      const index = list.findIndex(id => id.toString() === userId);
      if (index !== -1) {
        list.splice(index, 1);
      } else {
        if (list.length >= 5) {
          if (typeof callback === 'function') {
            return callback({ success: false, error: 'Limite atteinte' });
          }
          return;
        }
        list.push(socket.user.id);
      }
      message.reactions.set(emoji, list);
      await message.save();

      const recipientId = message.recipient || message.group;
      const payload = { id: message._id, reactions: Object.fromEntries(message.reactions) };

      if (message.recipient) {
        const targetUser = await User.findById(message.recipient);
        const sid = connectedUsers[targetUser.username];
        if (sid) io.to(sid).emit('reaction-updated', payload);
      } else if (message.group) {
        const group = await Group.findById(message.group).populate('members', 'username');
        group.members.forEach(m => {
          const sid = connectedUsers[m.username];
          if (sid) io.to(sid).emit('reaction-updated', payload);
        });
      }

      const senderSid = connectedUsers[socket.user.username];
      if (senderSid) io.to(senderSid).emit('reaction-updated', payload);

      if (typeof callback === 'function') {
        callback({ success: true });
      }
    } catch (err) {
      console.error('[ADD REACTION] Erreur:', err);
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Erreur lors de la réaction' });
      }
    }
  });

  // Modifier un message en temps réel
  socket.on('edit-message', async ({ messageId, content }, callback) => {
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        if (typeof callback === 'function') {
          return callback({ success: false, error: 'Message non trouvé' });
        }
        return;
      }

      if (message.sender.toString() !== socket.user.id) {
        if (typeof callback === 'function') {
          return callback({ success: false, error: 'Action non autorisée' });
        }
        return;
      }

      message.editHistory.push({ content: message.content, editedAt: new Date() });
      message.content = content;
      message.edited = true;
      await message.save();

      const payload = { id: message._id, content: message.content, edited: message.edited };

      if (message.recipient) {
        const target = await User.findById(message.recipient);
        const sid = connectedUsers[target.username];
        if (sid) io.to(sid).emit('message-edited', payload);
        const senderSid = connectedUsers[socket.user.username];
        if (senderSid) io.to(senderSid).emit('message-edited', payload);
      } else if (message.group) {
        const group = await Group.findById(message.group).populate('members', 'username');
        group.members.forEach(m => {
          const sid = connectedUsers[m.username];
          if (sid) io.to(sid).emit('message-edited', payload);
        });
      }

      if (typeof callback === 'function') {
        callback({ success: true });
      }
    } catch (err) {
      console.error('[EDIT MESSAGE SOCKET] Erreur:', err);
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Erreur lors de la modification du message' });
      }
    }
  });

  // Supprimer un message en temps réel
  socket.on('delete-message', async ({ messageId }, callback) => {
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        if (typeof callback === 'function') {
          return callback({ success: false, error: 'Message non trouvé' });
        }
        return;
      }

      if (message.sender.toString() !== socket.user.id) {
        if (typeof callback === 'function') {
          return callback({ success: false, error: 'Action non autorisée' });
        }
        return;
      }

      message.deleted = true;
      await message.save();

      const payload = { id: message._id };

      if (message.recipient) {
        const target = await User.findById(message.recipient);
        const sid = connectedUsers[target.username];
        if (sid) io.to(sid).emit('message-deleted', payload);
        const senderSid = connectedUsers[socket.user.username];
        if (senderSid) io.to(senderSid).emit('message-deleted', payload);
      } else if (message.group) {
        const group = await Group.findById(message.group).populate('members', 'username');
        group.members.forEach(m => {
          const sid = connectedUsers[m.username];
          if (sid) io.to(sid).emit('message-deleted', payload);
        });
      }

      if (typeof callback === 'function') {
        callback({ success: true });
      }
    } catch (err) {
      console.error('[DELETE MESSAGE SOCKET] Erreur:', err);
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Erreur lors de la suppression du message' });
      }
    }
  });

  // Gestion des appels WebRTC
  socket.on('webrtc-offer', (data) => {
    const { recipient } = data;
    if (!recipient) return;

    const recipientSocketId = connectedUsers[recipient];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('webrtc-offer', {
        ...data,
        caller: socket.user.username,
        callerName: socket.user.name,
        callerAvatar: socket.user.avatar
      });
    }
  });

  socket.on('webrtc-answer', (data) => {
    const { recipient } = data;
    if (!recipient) return;

    const recipientSocketId = connectedUsers[recipient];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('webrtc-answer', data);
    }
  });

  socket.on('webrtc-ice-candidate', (data) => {
    const { recipient } = data;
    if (!recipient) return;

    const recipientSocketId = connectedUsers[recipient];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('webrtc-ice-candidate', data);
    }
  });

  socket.on('end-call', (data) => {
    const { recipient } = data;
    if (!recipient) return;

    const recipientSocketId = connectedUsers[recipient];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('end-call', data);
    }
  });

  // Marquer les messages comme lus
  socket.on('mark-messages-read', async ({ sender }, callback) => {
    try {
      await Message.updateMany(
        { sender, recipient: socket.user.id, read: false },
        { $set: { read: true } }
      );
      if (typeof callback === 'function') {
        callback({ success: true });
      }
    } catch (err) {
      console.error('[MARK READ] Erreur:', err);
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Erreur lors du marquage des messages comme lus' });
      }
    }
  });

  socket.on('mark-group-messages-read', async ({ groupId }, callback) => {
    try {
      await Message.updateMany(
        { group: groupId, 'readBy.user': { $ne: socket.user.id } },
        { $push: { readBy: { user: socket.user.id, readAt: new Date() } } }
      );
      if (typeof callback === 'function') {
        callback({ success: true });
      }
    } catch (err) {
      console.error('[MARK GROUP READ] Erreur:', err);
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Erreur lors du marquage des messages' });
      }
    }
  });
});

// Gestion des erreurs globales
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(500).json({ error: 'Une erreur est survenue' });
});

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[SERVER] Nexus Chat démarré sur http://localhost:${PORT}`);
});

// Gestion propre des arrêts
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('[MONGODB] Connexion fermée');
    process.exit(0);
  } catch (err) {
    console.error('[MONGODB] Erreur lors de la fermeture de la connexion:', err);
    process.exit(1);
  }
});
