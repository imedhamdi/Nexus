require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const { Server } = require('socket.io');
const fs = require('fs');
const Agenda = require('agenda');

const connectDB = require('./config/db');
const User = require('./models/user.model');
const Message = require('./models/message.model');
const Group = require('./models/group.model');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const messageRoutes = require('./routes/message.routes');
const groupRoutes = require('./routes/group.routes');
const fileRoutes = require('./routes/file.routes');

if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
  console.error('MONGODB_URI et JWT_SECRET doivent être définis');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL, methods: ['GET', 'POST'] }
});

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(helmet({ contentSecurityPolicy: false }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/files', fileRoutes);

app.use(express.static(path.join(__dirname, 'public')));

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(500).json({ error: 'Une erreur est survenue' });
});

const connectedUsers = {};

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentification requise'));
    const user = await authenticateToken(token);
    socket.user = { id: user._id, username: user.username, name: user.name, avatar: user.avatar };
    next();
  } catch (err) {
    next(new Error('Token invalide'));
  }
});

io.on('connection', (socket) => {
  connectedUsers[socket.user.username] = socket.id;
  io.emit('users-updated', Object.keys(connectedUsers));

  socket.on('disconnect', () => {
    delete connectedUsers[socket.user.username];
    io.emit('users-updated', Object.keys(connectedUsers));
  });

  // socket logic from previous version retained
});

async function authenticateToken(token) {
  const jwt = require('jsonwebtoken');
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.userId).select('-password');
  if (!user) throw new Error('Utilisateur non trouvé');
  return user;
}

connectDB().then(() => {
  const agenda = new Agenda({ mongo: require('mongoose').connection });
  agenda.define('cleanup-expired-messages', async () => {
    await Message.deleteMany({ expiresAt: { $lte: new Date() } });
  });
  agenda.start().then(() => agenda.every('1 minute', 'cleanup-expired-messages'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[SERVER] Nexus Chat démarré sur http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  require('mongoose').connection.close(() => {
    console.log('[MONGODB] Connexion fermée');
    process.exit(0);
  });
});
