require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const socketio = require('socket.io');
const http = require('http');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketio(server, {
cors: {
origin: "*",
methods: ["GET", "POST"]
}
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
useNewUrlParser: true,
useUnifiedTopology: true
}).then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Models
const UserSchema = new mongoose.Schema({
username: {
type: String,
required: true,
unique: true,
match: /^[a-zA-Z0-9_]{3,20}$/
},
password: {
type: String,
required: true,
minlength: 6
},
name: {
type: String,
required: true,
maxlength: 50
},
avatar: {
type: String
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
minlength: 3,
maxlength: 50
},
avatar: {
type: String
},
members: [{
type: mongoose.Schema.Types.ObjectId,
ref: 'User'
}],
pendingInvitations: [{
type: mongoose.Schema.Types.ObjectId,
ref: 'User'
}],
createdBy: {
type: mongoose.Schema.Types.ObjectId,
ref: 'User',
required: true
},
editHistory: [{
field: String,
oldValue: mongoose.Schema.Types.Mixed,
newValue: mongoose.Schema.Types.Mixed,
changedBy: {
type: mongoose.Schema.Types.ObjectId,
ref: 'User'
},
changedAt: {
type: Date,
default: Date.now
}
}],
createdAt: {
type: Date,
default: Date.now
},
updatedAt: {
type: Date,
default: Date.now
}
});

const MessageSchema = new mongoose.Schema({
sender: {
type: mongoose.Schema.Types.ObjectId,
ref: 'User',
required: true
},
recipient: {
type: mongoose.Schema.Types.ObjectId,
ref: 'User'
},
group: {
type: mongoose.Schema.Types.ObjectId,
ref: 'Group'
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
replyTo: {
type: mongoose.Schema.Types.ObjectId,
ref: 'Message'
},
replySnippet: {
type: String
},
reactions: {
type: Map,
of: [{
type: mongoose.Schema.Types.ObjectId,
ref: 'User'
}]
},
expiresAt: {
type: Date,
index: { expires: 0 }
},
read: {
type: Boolean,
default: false
},
readBy: [{
user: {
type: mongoose.Schema.Types.ObjectId,
ref: 'User'
},
readAt: {
type: Date,
default: Date.now
}
}],
edited: {
type: Boolean,
default: false
},
editHistory: [{
content: String,
editedAt: {
type: Date,
default: Date.now
}
}],
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

const User = mongoose.model('User', UserSchema);
const Group = mongoose.model('Group', GroupSchema);
const Message = mongoose.model('Message', MessageSchema);

// File upload configuration
const storage = multer.diskStorage({
destination: (req, file, cb) => {
cb(null, 'uploads/');
},
filename: (req, file, cb) => {
cb(null, Date.now() + path.extname(file.originalname));
}
});

const upload = multer({
storage: storage,
limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Authentication middleware
const authenticate = async (req, res, next) => {
try {
const token = req.header('Authorization')?.replace('Bearer ', '');
if (!token) {
return res.status(401).send({ error: 'Authentication required' });
}
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded._id);
    if (!user) {
        return res.status(401).send({ error: 'User not found' });
    }

    req.token = token;
    req.user = user;
    next();
} catch (error) {
    res.status(401).send({ error: 'Please authenticate' });
}
};

// Socket.IO authentication middleware
io.use((socket, next) => {
const token = socket.handshake.auth.token;
if (!token) {
return next(new Error('Authentication error'));
}
jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
        return next(new Error('Authentication error'));
    }

    const user = await User.findById(decoded._id);
    if (!user) {
        return next(new Error('User not found'));
    }

    socket.user = user;
    next();
});
});

// Track connected users
const connectedUsers = new Map();

io.on('connection', (socket) => {
console.log('New client connected:', socket.user.username);
connectedUsers.set(socket.user._id.toString(), socket);
// Broadcast updated user list
const onlineUsers = Array.from(connectedUsers.keys());
io.emit('users-updated', onlineUsers);

socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.user.username);
    connectedUsers.delete(socket.user._id.toString());

    // Broadcast updated user list
    const updatedOnlineUsers = Array.from(connectedUsers.keys());
    io.emit('users-updated', updatedOnlineUsers);
});

// Message events
socket.on('send-message', async ({ recipient, content, replyTo, expiresIn }, callback) => {
    try {
        const recipientUser = await User.findById(recipient);
        if (!recipientUser) {
            return callback({ error: 'Recipient not found' });
        }

        let replyMessage = null;
        if (replyTo) {
            replyMessage = await Message.findById(replyTo);
            if (!replyMessage) {
                return callback({ error: 'Original message not found' });
            }
        }

        const message = new Message({
            sender: socket.user._id,
            recipient,
            content,
            replyTo: replyTo || undefined,
            replySnippet: replyMessage ? replyMessage.content.substring(0, 50) : undefined,
            expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined
        });

        await message.save();

        // Emit to recipient if online
        const recipientSocket = connectedUsers.get(recipient);
        if (recipientSocket) {
            recipientSocket.emit('new-message', message);
        }

        callback({ success: true, message });
    } catch (error) {
        console.error('Error sending message:', error);
        callback({ error: 'Error sending message' });
    }
});

socket.on('send-group-message', async ({ groupId, content, replyTo, expiresIn }, callback) => {
    try {
        const group = await Group.findById(groupId);
        if (!group) {
            return callback({ error: 'Group not found' });
        }

        if (!group.members.includes(socket.user._id)) {
            return callback({ error: 'Not a member of this group' });
        }

        let replyMessage = null;
        if (replyTo) {
            replyMessage = await Message.findById(replyTo);
            if (!replyMessage) {
                return callback({ error: 'Original message not found' });
            }
        }

        const message = new Message({
            sender: socket.user._id,
            group: groupId,
            content,
            replyTo: replyTo || undefined,
            replySnippet: replyMessage ? replyMessage.content.substring(0, 50) : undefined,
            expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined
        });

        await message.save();

        // Emit to all group members who are online
        group.members.forEach(memberId => {
            if (memberId.toString() !== socket.user._id.toString()) {
                const memberSocket = connectedUsers.get(memberId.toString());
                if (memberSocket) {
                    memberSocket.emit('new-group-message', message);
                }
            }
        });

        callback({ success: true, message });
    } catch (error) {
        console.error('Error sending group message:', error);
        callback({ error: 'Error sending group message' });
    }
});

socket.on('typing', ({ recipient, groupId }) => {
    if (recipient) {
        const recipientSocket = connectedUsers.get(recipient);
        if (recipientSocket) {
            recipientSocket.emit('typing', { sender: socket.user._id });
        }
    } else if (groupId) {
        // Emit to all group members except sender
        Group.findById(groupId).then(group => {
            group.members.forEach(memberId => {
                if (memberId.toString() !== socket.user._id.toString()) {
                    const memberSocket = connectedUsers.get(memberId.toString());
                    if (memberSocket) {
                        memberSocket.emit('typing', { sender: socket.user._id, groupId });
                    }
                }
            });
        });
    }
});

socket.on('stop-typing', ({ recipient, groupId }) => {
    if (recipient) {
        const recipientSocket = connectedUsers.get(recipient);
        if (recipientSocket) {
            recipientSocket.emit('stop-typing', { sender: socket.user._id });
        }
    } else if (groupId) {
        // Emit to all group members except sender
        Group.findById(groupId).then(group => {
            group.members.forEach(memberId => {
                if (memberId.toString() !== socket.user._id.toString()) {
                    const memberSocket = connectedUsers.get(memberId.toString());
                    if (memberSocket) {
                        memberSocket.emit('stop-typing', { sender: socket.user._id, groupId });
                    }
                }
            });
        });
    }
});

socket.on('add-reaction', async ({ messageId, emoji }, callback) => {
    try {
        const message = await Message.findById(messageId);
        if (!message) {
            return callback({ error: 'Message not found' });
        }

        // Check if user is allowed to see this message
        if (message.recipient && 
            ![message.sender.toString(), message.recipient.toString()].includes(socket.user._id.toString())) {
            return callback({ error: 'Not authorized' });
        }

        if (message.group) {
            const group = await Group.findById(message.group);
            if (!group.members.includes(socket.user._id)) {
                return callback({ error: 'Not a member of this group' });
            }
        }

        // Initialize reactions map if not exists
        if (!message.reactions) {
            message.reactions = new Map();
        }

        // Toggle reaction
        const reactionUsers = message.reactions.get(emoji) || [];
        const userIndex = reactionUsers.findIndex(id => id.toString() === socket.user._id.toString());

        if (userIndex === -1) {
            reactionUsers.push(socket.user._id);
        } else {
            reactionUsers.splice(userIndex, 1);
        }

        if (reactionUsers.length > 0) {
            message.reactions.set(emoji, reactionUsers);
        } else {
            message.reactions.delete(emoji);
        }

        await message.save();

        // Broadcast update
        if (message.recipient) {
            // Private message
            const recipientSocket = connectedUsers.get(message.recipient.toString());
            if (recipientSocket) {
                recipientSocket.emit('reaction-updated', { 
                    messageId: message._id, 
                    reactions: Object.fromEntries(message.reactions) 
                });
            }
        } else if (message.group) {
            // Group message
            const group = await Group.findById(message.group);
            group.members.forEach(memberId => {
                if (memberId.toString() !== socket.user._id.toString()) {
                    const memberSocket = connectedUsers.get(memberId.toString());
                    if (memberSocket) {
                        memberSocket.emit('reaction-updated', { 
                            messageId: message._id, 
                            reactions: Object.fromEntries(message.reactions) 
                        });
                    }
                }
            });
        }

        callback({ success: true, reactions: Object.fromEntries(message.reactions) });
    } catch (error) {
        console.error('Error adding reaction:', error);
        callback({ error: 'Error adding reaction' });
    }
});

socket.on('edit-message', async ({ messageId, content }, callback) => {
    try {
        const message = await Message.findById(messageId);
        if (!message) {
            return callback({ error: 'Message not found' });
        }

        // Check if user is the sender
        if (message.sender.toString() !== socket.user._id.toString()) {
            return callback({ error: 'Not authorized' });
        }

        // Save edit history
        message.editHistory.push({
            content: message.content
        });

        message.content = content;
        message.edited = true;
        await message.save();

        // Broadcast update
        if (message.recipient) {
            // Private message
            const recipientSocket = connectedUsers.get(message.recipient.toString());
            if (recipientSocket) {
                recipientSocket.emit('message-edited', { 
                    messageId: message._id, 
                    content: message.content 
                });
            }
        } else if (message.group) {
            // Group message
            const group = await Group.findById(message.group);
            group.members.forEach(memberId => {
                if (memberId.toString() !== socket.user._id.toString()) {
                    const memberSocket = connectedUsers.get(memberId.toString());
                    if (memberSocket) {
                        memberSocket.emit('message-edited', { 
                            messageId: message._id, 
                            content: message.content 
                        });
                    }
                }
            });
        }

        callback({ success: true, message });
    } catch (error) {
        console.error('Error editing message:', error);
        callback({ error: 'Error editing message' });
    }
});

socket.on('delete-message', async ({ messageId }, callback) => {
    try {
        const message = await Message.findById(messageId);
        if (!message) {
            return callback({ error: 'Message not found' });
        }

        // Check if user is the sender
        if (message.sender.toString() !== socket.user._id.toString()) {
            return callback({ error: 'Not authorized' });
        }

        message.deleted = true;
        await message.save();

        // Broadcast update
        if (message.recipient) {
            // Private message
            const recipientSocket = connectedUsers.get(message.recipient.toString());
            if (recipientSocket) {
                recipientSocket.emit('message-deleted', { 
                    messageId: message._id
                });
            }
        } else if (message.group) {
            // Group message
            const group = await Group.findById(message.group);
            group.members.forEach(memberId => {
                if (memberId.toString() !== socket.user._id.toString()) {
                    const memberSocket = connectedUsers.get(memberId.toString());
                    if (memberSocket) {
                        memberSocket.emit('message-deleted', { 
                            messageId: message._id
                        });
                    }
                }
            });
        }

        callback({ success: true });
    } catch (error) {
        console.error('Error deleting message:', error);
        callback({ error: 'Error deleting message' });
    }
});

socket.on('mark-messages-read', async ({ sender }, callback) => {
    try {
        await Message.updateMany(
            { 
                sender, 
                recipient: socket.user._id,
                read: false 
            },
            { 
                $set: { read: true } 
            }
        );

        callback({ success: true });
    } catch (error) {
        console.error('Error marking messages as read:', error);
        callback({ error: 'Error marking messages as read' });
    }
});

socket.on('mark-group-messages-read', async ({ groupId }, callback) => {
    try {
        const group = await Group.findById(groupId);
        if (!group || !group.members.includes(socket.user._id)) {
            return callback({ error: 'Not authorized' });
        }

        await Message.updateMany(
            { 
                group: groupId,
                'readBy.user': { $ne: socket.user._id }
            },
            { 
                $push: { 
                    readBy: { 
                        user: socket.user._id 
                    } 
                } 
            }
        );

        callback({ success: true });
    } catch (error) {
        console.error('Error marking group messages as read:', error);
        callback({ error: 'Error marking group messages as read' });
    }
});

// WebRTC signaling
socket.on('webrtc-offer', ({ recipient, offer, isVideo }) => {
    const recipientSocket = connectedUsers.get(recipient);
    if (recipientSocket) {
        recipientSocket.emit('webrtc-offer', { 
            sender: socket.user._id, 
            offer, 
            isVideo 
        });
    }
});

socket.on('webrtc-answer', ({ recipient, answer }) => {
    const recipientSocket = connectedUsers.get(recipient);
    if (recipientSocket) {
        recipientSocket.emit('webrtc-answer', { 
            sender: socket.user._id, 
            answer 
        });
    }
});

socket.on('webrtc-ice-candidate', ({ recipient, candidate }) => {
    const recipientSocket = connectedUsers.get(recipient);
    if (recipientSocket) {
        recipientSocket.emit('webrtc-ice-candidate', { 
            sender: socket.user._id, 
            candidate 
        });
    }
});

socket.on('end-call', ({ recipient }) => {
    const recipientSocket = connectedUsers.get(recipient);
    if (recipientSocket) {
        recipientSocket.emit('end-call', { 
            sender: socket.user._id 
        });
    }
});
});

// API Routes
app.post('/api/register', upload.single('avatar'), async (req, res) => {
try {
const { name, username, password } = req.body;
    // Check if username exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
        return res.status(400).send({ error: 'Username already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 8);

    // Create user
    const user = new User({
        name,
        username,
        password: hashedPassword,
        avatar: req.file ? `/uploads/${req.file.filename}` : undefined
    });

    await user.save();

    // Generate auth token
    const token = jwt.sign({ _id: user._id.toString() }, process.env.JWT_SECRET);

    res.status(201).send({ user, token });
} catch (error) {
    res.status(400).send({ error: error.message });
}
});

app.post('/api/login', async (req, res) => {
try {
const { username, password } = req.body;
    // Find user
    const user = await User.findOne({ username });
    if (!user) {
        return res.status(401).send({ error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        return res.status(401).send({ error: 'Invalid credentials' });
    }

    // Generate auth token
    const token = jwt.sign({ _id: user._id.toString() }, process.env.JWT_SECRET);

    res.send({ user, token });
} catch (error) {
    res.status(400).send({ error: error.message });
}
});

app.get('/api/users/me', authenticate, async (req, res) => {
res.send(req.user);
});

app.get('/api/users', authenticate, async (req, res) => {
try {
const users = await User.find({ _id: { $ne: req.user._id } }).lean();
    // Enrich with last message and unread count
    const enrichedUsers = await Promise.all(users.map(async user => {
        const lastMessage = await Message.findOne({
            $or: [
                { sender: req.user._id, recipient: user._id },
                { sender: user._id, recipient: req.user._id }
            ]
        }).sort({ createdAt: -1 });

        const unreadCount = await Message.countDocuments({
            sender: user._id,
            recipient: req.user._id,
            read: false
        });

        return {
            ...user,
            lastMessage: lastMessage ? lastMessage.content : null,
            unreadCount
        };
    }));

    res.send(enrichedUsers);
} catch (error) {
    res.status(500).send({ error: error.message });
}
});

app.post('/api/upload-file', authenticate, upload.single('file'), async (req, res) => {
try {
if (!req.file) {
return res.status(400).send({ error: 'No file uploaded' });
}
    const fileUrl = `/uploads/${req.file.filename}`;
    res.send({ fileUrl });
} catch (error) {
    res.status(500).send({ error: error.message });
}
});

app.get('/api/webrtc-config', (req, res) => {
res.send({
iceServers: [
{ urls: 'stun:stun.l.google.com:19302' }
]
});
});


app.post('/api/groups', authenticate, async (req, res) => {
try {
const { name, members } = req.body;
    // Create group
    const group = new Group({
        name,
        members: [req.user._id, ...members],
        createdBy: req.user._id
    });

    await group.save();

    // Notify invited members
    members.forEach(memberId => {
        const memberSocket = connectedUsers.get(memberId);
        if (memberSocket) {
            memberSocket.emit('group-invitation', {
                id: group._id,
                name: group.name
            });
        }
    });

    res.status(201).send(group);
} catch (error) {
    res.status(400).send({ error: error.message });
}
});

app.get('/api/groups', authenticate, async (req, res) => {
try {
const groups = await Group.find({ members: req.user._id }).lean();
    // Enrich with last message and unread count
    const enrichedGroups = await Promise.all(groups.map(async group => {
        const lastMessage = await Message.findOne({ group: group._id })
            .sort({ createdAt: -1 });

        const unreadCount = await Message.countDocuments({
            group: group._id,
            'readBy.user': { $ne: req.user._id },
            sender: { $ne: req.user._id }
        });

        return {
            ...group,
            lastMessage: lastMessage ? lastMessage.content : null,
            unreadCount
        };
    }));

    res.send(enrichedGroups);
} catch (error) {
    res.status(500).send({ error: error.message });
}
});

app.post('/api/groups/:groupId/invitations/accept', authenticate, async (req, res) => {
try {
const group = await Group.findById(req.params.groupId);
if (!group) {
return res.status(404).send({ error: 'Group not found' });
}
    // Check if user is invited
    if (!group.pendingInvitations.includes(req.user._id)) {
        return res.status(403).send({ error: 'No invitation found' });
    }

    // Add user to members and remove from pending
    group.members.push(req.user._id);
    group.pendingInvitations = group.pendingInvitations.filter(id => id.toString() !== req.user._id.toString());
    await group.save();

    res.send(group);
} catch (error) {
    res.status(400).send({ error: error.message });
}
});

app.post('/api/groups/:groupId/invitations/decline', authenticate, async (req, res) => {
try {
const group = await Group.findById(req.params.groupId);
if (!group) {
return res.status(404).send({ error: 'Group not found' });
}
    // Check if user is invited
    if (!group.pendingInvitations.includes(req.user._id)) {
        return res.status(403).send({ error: 'No invitation found' });
    }

    // Remove user from pending
    group.pendingInvitations = group.pendingInvitations.filter(id => id.toString() !== req.user._id.toString());
    await group.save();

    res.send({ success: true });
} catch (error) {
    res.status(400).send({ error: error.message });
}
});

app.get('/api/messages', authenticate, async (req, res) => {
try {
const partner = req.query.partner;
if (!partner) {
return res.status(400).send({ error: 'Partner ID is required' });
}
    const messages = await Message.find({
        $or: [
            { sender: req.user._id, recipient: partner },
            { sender: partner, recipient: req.user._id }
        ],
        deleted: false
    })
    .sort({ createdAt: 1 })
    .populate('sender', 'name avatar');

    res.send(messages);
} catch (error) {
    res.status(500).send({ error: error.message });
}
});

app.get('/api/groups/:id/messages', authenticate, async (req, res) => {
try {
// Check if user is member of the group
const group = await Group.findById(req.params.id);
if (!group || !group.members.includes(req.user._id)) {
return res.status(403).send({ error: 'Not a member of this group' });
}
    const messages = await Message.find({
        group: req.params.id,
        deleted: false
    })
    .sort({ createdAt: 1 })
    .populate('sender', 'name avatar');

    res.send(messages);
} catch (error) {
    res.status(500).send({ error: error.message });
}
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
console.log(`Server running on port ${PORT}`);
});