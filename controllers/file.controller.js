const path = require('path');
const fs = require('fs');
const Message = require('../models/message.model');

exports.getFile = async (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '..', 'uploads', filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Fichier introuvable' });
  }
  try {
    const msg = await Message.findOne({ fileUrl: `/uploads/${filename}` });
    if (!msg) return res.status(403).json({ error: 'Accès refusé' });
    const allowed = msg.sender.equals(req.user._id) ||
      (msg.recipient && msg.recipient.equals(req.user._id)) ||
      (msg.group && msg.readBy.some(r => r.user.equals(req.user._id)));
    if (!allowed) return res.status(403).json({ error: 'Accès refusé' });
    res.sendFile(filePath);
  } catch (err) {
    console.error('[GET FILE] Erreur:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération du fichier' });
  }
};
