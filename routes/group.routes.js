const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth.middleware');
const { createGroup, updateGroup, listGroups } = require('../controllers/group.controller');

router.post('/', authenticate, createGroup);
router.patch('/:id', authenticate, updateGroup);
router.get('/', authenticate, listGroups);

module.exports = router;
