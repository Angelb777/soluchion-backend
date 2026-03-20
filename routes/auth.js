// routes/auth.js
'use strict';
const router = require('express').Router();
const authController = require('../controllers/authController');
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/User');

router.post('/login', authController.login);

// ✅ Nuevo: valida el token guardado y devuelve los datos del usuario
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ msg: 'Usuario no encontrado' });

    // Reusa la misma “shape” que envías en /login
    res.json({
      user: {
        _id: user._id,
        nombre: user.nombre,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        fotoPerfil: user.fotoPerfil,
      }
    });
  } catch (e) {
    console.error('❌ /auth/me:', e);
    res.status(500).json({ msg: 'Error' });
  }
});

module.exports = router;
