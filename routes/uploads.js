const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');

// === STORAGE GENERAL CONFIG ===

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let folder = 'uploads/professionals/';

    if (req.originalUrl.includes('upload-request-images')) {
      folder = 'uploads/requests/';
    }

    // Asegurar que la carpeta exista
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }

    cb(null, folder);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + file.originalname.replace(/\s+/g, '');
    cb(null, uniqueName);
  },
});

const upload = multer({ storage: storage });

// ✅ Ruta existente para subir hasta 6 fotos del portfolio profesional
router.post('/upload-portfolio/:userId', upload.array('fotos', 6), async (req, res) => {
  const userId = req.params.userId;
  const files = req.files;

  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No se recibieron imágenes.' });
  }

  const urls = files.map(file => `/uploads/professionals/${file.filename}`);
  console.log(`🖼️ Usuario ${userId} subió:`, urls);

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    user.portfolioImages = [...user.portfolioImages, ...urls];
    await user.save();

    res.status(200).json({ message: 'Fotos subidas correctamente', urls });
  } catch (error) {
    console.error("❌ Error al guardar URLs en el usuario:", error);
    res.status(500).json({ error: 'Error al guardar imágenes del usuario' });
  }
});

// ✅ Nueva ruta para subir fotos del request del cliente (hasta 3 fotos)
router.post('/upload-request-images', upload.array('images', 3), (req, res) => {
  const files = req.files;

  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No se recibieron imágenes.' });
  }

  const urls = files.map(file => `${req.protocol}://${req.get('host')}/uploads/requests/${file.filename}`);
  console.log('📎 Imágenes de solicitud recibidas:', urls);

  res.status(200).json({ message: 'Fotos subidas correctamente', urls });
});

module.exports = router;
