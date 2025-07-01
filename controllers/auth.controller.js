const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

exports.register = async (req, res) => {
  const { username, password, name } = req.body;
  if (!username || !password || !name) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
  }
  try {
    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(400).json({ error: 'Nom d\'utilisateur déjà pris' });
    }
    const hashed = await bcrypt.hash(password, 12);
    const avatar = req.file ? `/uploads/${req.file.filename}` : null;
    const user = await User.create({ username, password: hashed, name, avatar });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '24h' });
    const userRes = { id: user._id, username: user.username, name: user.name, avatar: user.avatar, createdAt: user.createdAt };
    res.status(201).json({ token, user: userRes });
  } catch (err) {
    console.error('[REGISTER] Erreur:', err);
    res.status(500).json({ error: 'Erreur lors de l\'inscription' });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
    }
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '24h' });
    const userRes = { id: user._id, username: user.username, name: user.name, avatar: user.avatar, createdAt: user.createdAt };
    res.json({ token, user: userRes });
  } catch (err) {
    console.error('[LOGIN] Erreur:', err);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
};
