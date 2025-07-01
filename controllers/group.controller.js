const Group = require('../models/group.model');
const User = require('../models/user.model');

exports.createGroup = async (req, res) => {
  try {
    const { name, avatar, usernames } = req.body;
    if (!name || !Array.isArray(usernames)) {
      return res.status(400).json({ error: 'Nom et membres requis' });
    }
    if (name.length < 3 || name.length > 50) {
      return res.status(400).json({ error: 'Le nom doit contenir entre 3 et 50 caractères' });
    }
    const users = await User.find({ username: { $in: usernames } });
    if (users.length !== usernames.length) {
      return res.status(400).json({ error: 'Certains membres sont introuvables' });
    }
    const memberIds = users.map(u => u._id).concat(req.user._id);
    const uniqueMembers = Array.from(new Set(memberIds.map(id => id.toString())));
    if (uniqueMembers.length < 2 || uniqueMembers.length > 100) {
      return res.status(400).json({ error: 'Le groupe doit avoir entre 2 et 100 membres' });
    }
    const group = await Group.create({ name, avatar, members: uniqueMembers, createdBy: req.user._id });
    res.status(201).json({ success: true, groupId: group._id });
  } catch (err) {
    console.error('[CREATE GROUP] Erreur:', err);
    res.status(500).json({ error: 'Erreur lors de la création du groupe' });
  }
};

exports.updateGroup = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Groupe non trouvé' });
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
};

exports.listGroups = async (req, res) => {
  try {
    const groups = await Group.find({ members: req.user._id }).select('_id name avatar members updatedAt');
    res.json(groups);
  } catch (err) {
    console.error('[GET GROUPS] Erreur:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des groupes' });
  }
};
