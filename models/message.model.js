const mongoose = require('mongoose');

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
  fileUrl: String,
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  replySnippet: String,
  reactions: {
    type: Map,
    of: [mongoose.Schema.Types.ObjectId],
    default: {}
  },
  expiresAt: Date,
  read: { type: Boolean, default: false },
  readBy: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, readAt: Date }],
  edited: { type: Boolean, default: false },
  editHistory: [{ content: String, editedAt: Date }],
  deleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, index: true }
});

MessageSchema.index({ sender: 1, recipient: 1, createdAt: 1 });
MessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Message', MessageSchema);
