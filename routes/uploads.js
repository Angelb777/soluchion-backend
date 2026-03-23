const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');

// ===== ASEGURAR CARPETAS =====
const ensureDir = (relativeFolder) => {
  const fullPath = path.join(__dirname, '..', relativeFolder);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`📂 Carpeta creada: ${relativeFolder}`);
  }
  return fullPath;
};

ensureDir('uploads');
ensureDir('uploads/professionals');
ensureDir('uploads/requests');

// ===== STORAGE =====
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      let folder = 'uploads/professionals';

      if (req.originalUrl.includes('upload-request-images')) {
        folder = 'uploads/requests';
      }

      const fullPath = ensureDir(folder);
      cb(null, fullPath);
    } catch (err) {
      console.error('❌ Error en destination de multer:', err);
      cb(err);
    }
  },

  filename: function (req, file, cb) {
    try {
      const safeOriginalName = file.originalname
        .replace(/\s+/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '');

      const uniqueName = `${Date.now()}-${safeOriginalName}`;
      cb(null, uniqueName);
    } catch (err) {
      console.error('❌ Error en filename de multer:', err);
      cb(err);
    }
  },
});

// ===== FILTRO DE ARCHIVOS =====
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error('Solo se permiten imágenes JPG, JPEG, PNG o WEBP'));
  }

  cb(null, true);
};

// ===== CONFIG MULTER =====
const upload = multer({
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
});

// ===== SUBIR PORTFOLIO PROFESIONAL =====
router.post(
  '/upload-portfolio/:userId',
  // verifyToken, // descomenta si quieres obligar token
  upload.array('fotos', 6),
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const files = req.files;

      console.log('📥 POST /upload-portfolio/:userId');
      console.log('👤 userId:', userId);
      console.log(
        '📎 files:',
        files?.map((f) => ({
          originalname: f.originalname,
          filename: f.filename,
          mimetype: f.mimetype,
          size: f.size,
          path: f.path,
        }))
      );

      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No se recibieron imágenes.' });
      }

      const urls = files.map((file) => `/uploads/professionals/${file.filename}`);
      console.log(`🖼️ Usuario ${userId} subió:`, urls);

      const user = await User.findById(userId);
      if (!user) {
        console.log('❌ Usuario no encontrado:', userId);
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      if (!Array.isArray(user.portfolioImages)) {
        user.portfolioImages = [];
      }

      user.portfolioImages = [...user.portfolioImages, ...urls];
      await user.save();

      return res.status(200).json({
        message: 'Fotos subidas correctamente',
        urls,
      });
    } catch (error) {
      console.error('❌ Error al guardar URLs en el usuario:', error);
      return res.status(500).json({
        error: 'Error al guardar imágenes del usuario',
        detalle: error.message,
      });
    }
  }
);

// ===== SUBIR IMÁGENES DE REQUEST =====
router.post(
  '/upload-request-images',
  upload.array('images', 3),
  (req, res) => {
    try {
      const files = req.files;

      console.log('📥 POST /upload-request-images');
      console.log(
        '📎 files:',
        files?.map((f) => ({
          originalname: f.originalname,
          filename: f.filename,
          mimetype: f.mimetype,
          size: f.size,
          path: f.path,
        }))
      );

      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No se recibieron imágenes.' });
      }

      const urls = files.map(
        (file) => `${req.protocol}://${req.get('host')}/uploads/requests/${file.filename}`
      );

      console.log('📎 Imágenes de solicitud recibidas:', urls);

      return res.status(200).json({
        message: 'Fotos subidas correctamente',
        urls,
      });
    } catch (error) {
      console.error('❌ Error al subir imágenes del request:', error);
      return res.status(500).json({
        error: 'Error al subir imágenes del request',
        detalle: error.message,
      });
    }
  }
);

// ===== MANEJO DE ERRORES DE MULTER =====
router.use((err, req, res, next) => {
  console.error('❌ Error en rutas de upload:', err);

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      error: 'Error de subida',
      detalle: err.message,
      codigo: err.code,
    });
  }

  return res.status(400).json({
    error: 'Error en la subida de archivos',
    detalle: err.message || 'Error desconocido',
  });
});

module.exports = router;