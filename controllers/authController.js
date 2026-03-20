// controllers/authController.js
'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.login = async function login(req, res) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).lean();
    if (!user) return res.status(400).json({ msg: 'Usuario no encontrado' });

    const ok = await bcrypt.compare(password || '', user.password || '');
    if (!ok) return res.status(400).json({ msg: 'Credenciales inválidas' });

    // ⛔ Bloquear profesionales no verificados
    if (user.role === 'profesional' && !user.isVerified) {
      return res.status(403).json({ msg: 'Tu cuenta aún no ha sido verificada por el admin.' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
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
    console.error('❌ Error en login:', e);
    res.status(500).json({ msg: 'Error en login' });
  }
};
