const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth.middleware');
const { getMessages, getGroupMessages, editMessage, deleteMessage } = require('../controllers/message.controller');

router.get('/', authenticate, getMessages);
router.get('/groups/:id', authenticate, getGroupMessages);
router.put('/:id', authenticate, editMessage);
router.delete('/:id', authenticate, deleteMessage);

module.exports = router;
