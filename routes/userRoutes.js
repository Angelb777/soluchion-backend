const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Order = require('../models/order'); // ✅ IMPORTADO para calcular valoraciones
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const verifyToken = require('../middleware/verifyToken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const profileDir = path.join(__dirname, '..', 'uploads', 'profiles');
if (!fs.existsSync(profileDir)) {
  fs.mkdirSync(profileDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/profiles/');
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${req.params.id}-${Date.now()}${ext}`);
  }
});

const upload = multer({ storage });


// REGISTRO
router.post('/register', async (req, res) => {
  const {
    nombre,
    email,
    role,
    ubicacion,
    password,
    categorias,
    hourlyRate,
    basePrices,
    nickname // ✅ NUEVO
  } = req.body;

  try {
    // ❌ EMAIL DUPLICADO
    const existenteEmail = await User.findOne({ email });
    if (existenteEmail) {
      return res.status(400).json({ error: '❌ Ya existe un usuario con ese correo' });
    }

    // ❌ NICKNAME DUPLICADO
    const existenteNick = await User.findOne({ nickname: nickname.toLowerCase() });
    if (existenteNick) {
      return res.status(400).json({ error: '❌ Este nickname ya está en uso' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const nuevo = new User({
  nombre,
  email,
  nickname: nickname.toLowerCase(), // 👈 AQUÍ EXACTAMENTE
  role,
  ubicacion,
  categorias,
  hourlyRate,
  basePrices,
  password: hashedPassword,
  portfolioImages: []
   });

    await nuevo.save();

    const token = jwt.sign(
      { id: nuevo._id, role: nuevo.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ message: '✅ Usuario registrado', user: nuevo, token });

  } catch (error) {
    console.error('❌ Error al registrar usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 🔍 Buscar usuario por nickname
router.get('/nickname/:nickname', async (req, res) => {
  try {
    const user = await User.findOne({ 
    nickname: req.params.nickname.toLowerCase() 
    }).select('_id nombre nickname');

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(user);

  } catch (error) {
    console.error('❌ Error buscando nickname:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/:id/foto', verifyToken, upload.single('foto'), async (req, res) => {
  console.log('🧪 Entró a ruta /users/:id/foto');
  console.log('🧪 req.file:', req.file);
  console.log('🧪 Headers:', req.headers);
  console.log('🧪 req.file:', req.file);
  console.log('🧪 req.body:', req.body);

  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo no recibido' });

    if (req.user.id !== req.params.id) {
      return res.status(403).json({ error: 'No autorizado para modificar este perfil' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).send('Usuario no encontrado');

    user.fotoPerfil = `/uploads/profiles/${req.file.filename}`;
    await user.save();

    res.json({ url: user.fotoPerfil });
  } catch (error) {
    console.error('❌ Error en upload:', error);
    res.status(500).send('Error al subir la foto');
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: '❌ Usuario no encontrado' });

    if (!user.password) return res.status(401).json({ error: '❌ Usuario mal creado (sin contraseña)' });

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) return res.status(401).json({ error: '❌ Contraseña incorrecta' });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user });
  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// GET /me
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  } catch (error) {
    console.error("❌ Error al obtener /me:", error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// LISTAR TODOS LOS USUARIOS
router.get('/', async (req, res) => {
  const adminToken = req.headers.authorization;

  if (adminToken !== 'Bearer MI_CLAVE_SECRETA_ADMIN') {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const usuarios = await User.find().select('-password');
    res.json(usuarios);
  } catch (error) {
    console.error("❌ Error al listar usuarios:", error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// OBTENER PROFESIONALES (con media valoraciones y portfolio)
// OBTENER PROFESIONALES (con media valoraciones y portfolio)
router.get('/profesionales', async (req, res) => {
  try {
    const { lat: latCliente, lng: lngCliente } = req.query;

    if (!latCliente || !lngCliente) {
      return res.status(400).json({ error: 'Faltan coordenadas del cliente' });
    }

    // ✅ Solo profesionales verificados y con ubicación registrada
    const profesionales = await User.find({
      role: 'profesional',
      isVerified: true,
      'ubicacion.lat': { $exists: true, $ne: null },
      'ubicacion.lng': { $exists: true, $ne: null }
    }).select('-password');

    const resultados = await Promise.all(
      profesionales.map(async (pro) => {
        const distancia = calcularDistanciaKm(
          parseFloat(latCliente),
          parseFloat(lngCliente),
          pro.ubicacion.lat,
          pro.ubicacion.lng
        );

        if (distancia > 10) return null; // ❌ Más de 10 km

        const valoraciones = await Order.find({
          profesionalId: pro._id,
          valoracion: { $exists: true }
        }).select('valoracion');

        let media = 0;
        let total = 0;

        if (valoraciones.length > 0) {
          const sum = valoraciones.reduce((acc, v) => acc + (v.valoracion || 0), 0);
          media = parseFloat((sum / valoraciones.length).toFixed(1));
          total = valoraciones.length;
        }

        return {
          _id: pro._id,
          nombre: pro.nombre,
          email: pro.email,
          categorias: pro.categorias,
          ubicacion: pro.ubicacion,
          hourlyRate: pro.hourlyRate,
          basePrices: pro.basePrices,
          portfolioImages: pro.portfolioImages || [],
          isVerified: pro.isVerified,
          mediaValoracion: media,
          totalValoraciones: total,
          distancia: distancia.toFixed(1)
        };
      })
    );

    res.json(resultados.filter(p => p !== null));
  } catch (error) {
    console.error("❌ Error al obtener profesionales:", error);
    res.status(500).json({ error: 'Error al obtener profesionales' });
  }
});


// Obtener todos los usuarios para el dashboard
router.get('/usuarios/lista', async (req, res) => {
  if (!req.session?.isAdmin) return res.status(401).json({ error: 'No autorizado' });

  try {
    const usuarios = await User.find().select('-password');
    res.json(usuarios);
  } catch (err) {
    console.error('❌ Error al obtener usuarios:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Eliminar usuario por ID
router.delete('/usuarios/:id', async (req, res) => {
  if (!req.session?.isAdmin) return res.status(401).json({ error: 'No autorizado' });

  try {
    const result = await User.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({ message: '✅ Usuario eliminado' });
  } catch (err) {
    console.error('❌ Error al eliminar usuario:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Actualizar datos del profesional
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const userId = req.params.id;

    // Solo puede actualizarse a sí mismo
    if (req.user.id !== userId) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { nombre, hourlyRate, basePrices, portfolioImages } = req.body;

    const actualizado = await User.findByIdAndUpdate(
      userId,
      {
        nombre,
        hourlyRate,
        basePrices,
        portfolioImages,
      },
      { new: true }
    ).select('-password');

    if (!actualizado) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json(actualizado);
  } catch (error) {
    console.error('❌ Error al actualizar usuario:', error);
    res.status(500).json({ error: 'Error al actualizar los datos' });
  }
});

// ⬇️ Añade esto antes del export
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  } catch (error) {
    console.error('❌ Error al obtener usuario por ID:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ✅ Actualizar ubicación del usuario (cliente o profesional)
// ✅ Actualizar ubicación del usuario (cliente o profesional)
router.put('/:id/ubicacion', verifyToken, async (req, res) => {
  try {
    // Fuerza a número por si llegan como string
    const latN = Number(req.body.lat);
    const lngN = Number(req.body.lng);

    if (req.user.id !== req.params.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { ubicacion: { lat: latN, lng: lngN } },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({ success: true, user });
  } catch (err) {
    console.error('❌ Error al actualizar ubicación:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


module.exports = router;
