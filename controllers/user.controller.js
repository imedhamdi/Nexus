const User = require('../models/user.model');
const Message = require('../models/message.model');

exports.getContacts = async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } })
      .select('_id username name avatar');

    const enriched = await Promise.all(users.map(async (u) => {
      const lastMsg = await Message.findOne({
        $or: [
          { sender: req.user._id, recipient: u._id },
          { sender: u._id, recipient: req.user._id }
        ]
      }).sort({ createdAt: -1 }).select('content');

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
        online: false,
        lastMessage: lastMsg ? lastMsg.content : null,
        unreadCount
      };
    }));

    res.json(enriched);
  } catch (err) {
    console.error('[GET USERS] Erreur:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs' });
  }
};

exports.getMe = (req, res) => {
  res.json(req.user);
};
