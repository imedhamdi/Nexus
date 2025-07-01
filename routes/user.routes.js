const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth.middleware');
const { getContacts, getMe } = require('../controllers/user.controller');

router.get('/', authenticate, getContacts);
router.get('/me', authenticate, getMe);

module.exports = router;
