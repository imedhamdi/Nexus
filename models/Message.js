const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
    emoji: String,
    count: { type: Number, default: 1 },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});

const messageSchema = new mongoose.Schema({
    content: { type: String, required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
    read: { type: Boolean, default: false },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    deleted: { type: Boolean, default: false },
    edited: { type: Boolean, default: false },
    ephemeral: { type: Number, default: 0 }, // en secondes
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    reactions: [reactionSchema],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema);