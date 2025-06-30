/**
 * Nexus Chat - Serveur Backend Complet
 * Version améliorée avec authentification, base de données et sécurité renforcée
 */

require('dotenv').config();
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

// Configuration et middleware
const app = express();
app.use(express.json());
app.use(cors());

// Utiliser Helmet pour définir des en-têtes de sécurité, y compris la Content-Security-Policy
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // 'unsafe-inline' est nécessaire pour les scripts et styles directement dans index.html
        // Idéalement, déplacez-les dans des fichiers .js et .css séparés à l'avenir.
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
        // data: est pour l'aperçu de l'avatar, https://i.pravatar.cc est l'avatar par défaut
        imgSrc: ["'self'", "data:", "https://i.pravatar.cc"],
        fontSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
        // Pour les sons de notification et d'appel
        mediaSrc: ["'self'", "https://assets.mixkit.co"],
        // Pour les connexions WebSocket de Socket.IO
        connectSrc: ["'self'", "ws:", "wss:"]
      },
    },
  })
);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Connexion à MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://imedhamdi007:imed25516242@api-nodejs.lpnpgx4.mongodb.net/?retryWrites=true&w=majority&appName=API-NodeJS');

// Modèles Mongoose
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  avatar: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  recipient: { type: String, required: true },
  content: { type: String, required: true },
  type: { type: String, enum: ['text', 'image', 'file'], default: 'text' },
  fileUrl: { type: String },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Message = mongoose.model('Message', MessageSchema);

// Configuration Multer sécurisée
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non supporté'), false);
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// Middleware d'authentification
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).send('Accès non autorisé');

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'nexus-secret');
    req.user = await User.findById(decoded.userId);
    if (!req.user) return res.status(401).send('Utilisateur non trouvé');

    next();
  } catch (err) {
    res.status(401).send('Token invalide');
  }
};

// Routes API
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, name } = req.body;
    if (!username || !password || !name) {
      return res.status(400).send('Tous les champs sont requis');
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).send('Nom d\'utilisateur déjà pris');

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword, name });
    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'nexus-secret', { expiresIn: '30d' });
    res.status(201).json({ token, user: { id: user._id, username: user.username, name: user.name } });
  } catch (err) {
    res.status(500).send('Erreur lors de l\'inscription');
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(401).send('Identifiants invalides');

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).send('Identifiants invalides');

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'nexus-secret', { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, username: user.username, name: user.name, avatar: user.avatar } });
  } catch (err) {
    res.status(500).send('Erreur lors de la connexion');
  }
});

app.post('/api/upload-avatar', authenticate, upload.single('avatar'), async (req, res) => {
  try {
    const user = req.user;
    user.avatar = `/uploads/${req.file.filename}`;
    await user.save();
    res.json({ avatar: user.avatar });
  } catch (err) {
    res.status(500).send('Erreur lors de l\'upload de l\'avatar');
  }
});

app.post('/api/upload-file', authenticate, upload.single('file'), async (req, res) => {
  try {
    const recipient = req.body.recipient;
    const fileUrl = `/uploads/${req.file.filename}`;
    
    // Sauvegarder le message en base
    const message = new Message({
      sender: req.user.username,
      recipient,
      content: req.file.originalname,
      type: req.file.mimetype.startsWith('image/') ? 'image' : 'file',
      fileUrl
    });
    await message.save();

    res.json({ success: true, url: fileUrl, messageId: message._id });
  } catch (err) {
    res.status(500).send('Erreur lors de l\'upload du fichier');
  }
});

app.get('/api/messages', authenticate, async (req, res) => {
  try {
    const { partner } = req.query;
    const messages = await Message.find({
      $or: [
        { sender: req.user.username, recipient: partner },
        { sender: partner, recipient: req.user.username }
      ]
    }).sort('createdAt');
    
    res.json(messages);
  } catch (err) {
    res.status(500).send('Erreur lors de la récupération des messages');
  }
});

// Serveur de fichiers statiques
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'public')));

// Gestion des connexions Socket.io
const connectedUsers = {};

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentification requise'));

  jwt.verify(token, process.env.JWT_SECRET || 'nexus-secret', async (err, decoded) => {
    if (err) return next(new Error('Token invalide'));
    
    try {
      const user = await User.findById(decoded.userId);
      if (!user) return next(new Error('Utilisateur non trouvé'));
      
      socket.user = {
        id: user._id,
        username: user.username,
        name: user.name,
        avatar: user.avatar
      };
      next();
    } catch (error) {
      next(new Error('Erreur d\'authentification'));
    }
  });
});

io.on('connection', (socket) => {
  console.log(`[CONNEXION] ${socket.user.username} connecté`);
  connectedUsers[socket.user.username] = socket.id;

  // Diffuser la liste des utilisateurs connectés
  io.emit('users-updated', Object.keys(connectedUsers));

  socket.on('disconnect', () => {
    console.log(`[DÉCONNEXION] ${socket.user.username} déconnecté`);
    delete connectedUsers[socket.user.username];
    io.emit('users-updated', Object.keys(connectedUsers));
  });

  // Gestion des messages
  socket.on('send-message', async ({ recipient, content, type = 'text' }, callback) => {
    try {
      const message = new Message({
        sender: socket.user.username,
        recipient,
        content,
        type
      });
      await message.save();

      const recipientSocketId = connectedUsers[recipient];
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('new-message', {
          id: message._id,
          sender: socket.user.username,
          content,
          type,
          createdAt: message.createdAt
        });
      }

      callback({ success: true, messageId: message._id });
    } catch (err) {
      callback({ success: false, error: 'Erreur d\'envoi du message' });
    }
  });

  // Gestion des appels WebRTC
  socket.on('webrtc-offer', (data) => {
    const recipientSocketId = connectedUsers[data.recipient];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('webrtc-offer', {
        ...data,
        caller: socket.user.username,
        callerName: socket.user.name
      });
    }
  });

  socket.on('webrtc-answer', (data) => {
    const recipientSocketId = connectedUsers[data.recipient];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('webrtc-answer', data);
    }
  });

  socket.on('webrtc-ice-candidate', (data) => {
    const recipientSocketId = connectedUsers[data.recipient];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('webrtc-ice-candidate', data);
    }
  });

  socket.on('end-call', (data) => {
    const recipientSocketId = connectedUsers[data.recipient];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('end-call', data);
    }
  });
});

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[SERVEUR] Nexus Chat démarré sur http://localhost:${PORT}`);
});