const mongoose = require('mongoose');

module.exports = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('[MONGODB] Connecté avec succès');
  } catch (err) {
    console.error('[MONGODB] Erreur de connexion:', err.message);
    process.exit(1);
  }
};
