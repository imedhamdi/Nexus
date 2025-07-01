const Message = require('../models/message.model');
const User = require('../models/user.model');

exports.getMessages = async (req, res) => {
  try {
    const { partner, page = 1, limit = 50 } = req.query;
    if (!partner) return res.status(400).json({ error: 'Paramètre partner manquant' });
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const maxLimit = Math.min(parseInt(limit, 10), 100);

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
};

exports.getGroupMessages = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const group = await require('../models/group.model').findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Groupe non trouvé' });
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
};

exports.editMessage = async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Contenu manquant' });
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ error: 'Message non trouvé' });
    if (!message.sender.equals(req.user._id)) {
      return res.status(403).json({ error: 'Action non autorisée' });
    }
    message.editHistory.push({ content: message.content, editedAt: new Date() });
    message.content = content;
    message.edited = true;
    await message.save();
    res.json({ success: true });
  } catch (err) {
    console.error('[EDIT MESSAGE] Erreur:', err);
    res.status(500).json({ error: 'Erreur lors de la modification du message' });
  }
};

exports.deleteMessage = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ error: 'Message non trouvé' });
    if (!message.sender.equals(req.user._id)) {
      return res.status(403).json({ error: 'Action non autorisée' });
    }
    message.deleted = true;
    await message.save();
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE MESSAGE] Erreur:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression du message' });
  }
};
