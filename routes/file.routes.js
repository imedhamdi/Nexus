const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth.middleware');
const { getFile } = require('../controllers/file.controller');

router.get('/:filename', authenticate, getFile);

module.exports = router;
