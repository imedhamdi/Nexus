const express = require('express');
const multer = require('multer');
const router = express.Router();
const { register, login } = require('../controllers/auth.controller');

const uploadsDir = require('path').join(__dirname, '..', 'uploads');
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = require('path').extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).substring(2,9)}${ext}`;
    cb(null, name);
  }
});
const upload = multer({ storage });

router.post('/register', upload.single('avatar'), register);
router.post('/login', login);

module.exports = router;
