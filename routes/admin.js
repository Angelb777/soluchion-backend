// ✅ routes/admin.js COMPLETO con soporte para listado, conflictos y eliminación de usuarios + sesión
const express = require('express');
const router = express.Router();
const path = require('path');
const User = require('../models/User');
const Order = require('../models/order'); // ✅ necesario para conflictos
const multer = require('multer');
const fs = require('fs'); // para eliminar archivos físicos

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/professionals/');
  },
  filename: function (req, file, cb) {
    const ext = file.originalname.split('.').pop();
    cb(null, Date.now() + '-' + file.fieldname + '.' + ext);
  }
});
const upload = multer({ storage });


// ✅ Middleware para verificar admin
const verifyAdmin = (req, res, next) => {
  if (req.session?.isAdmin) return next();
  return res.status(403).json({ error: 'No autorizado' });
};

// Login
router.get('/login', (req, res) => {
  res.sendFile('login.html', { root: path.join(__dirname, '../Frontend') });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (email === adminEmail && password === adminPassword) {
    req.session.isAdmin = true;
    res.redirect('/admin/dashboard');
  } else {
    res.send(`<p>❌ Acceso denegado. <a href="/admin/login">Intentar otra vez</a></p>`);
  }
});

// Dashboard principal
router.get('/dashboard', (req, res) => {
  if (req.session?.isAdmin) {
    res.sendFile('dashboard.html', { root: path.join(__dirname, '../Frontend') });
  } else {
    res.redirect('/admin/login');
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// API interna: Listar todos los usuarios
router.get('/usuarios/lista', async (req, res) => {
  if (!req.session?.isAdmin) return res.status(401).json({ error: 'No autorizado' });

  try {
    const usuarios = await User.find().select('-password -__v');
    res.json(usuarios);
  } catch (err) {
    console.error('❌ Error al obtener usuarios:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Eliminar usuario
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

// Obtener todos los conflictos activos
router.get('/conflictos', verifyAdmin, async (req, res) => {
  try {
    const conflictos = await Order.find({ estado: 'conflicto' })
      .populate('clienteId', 'nombre email')
      .populate('profesionalId', 'nombre email');

    const resultado = conflictos
  .filter(c => c.clienteId && c.profesionalId)
  .map(c => ({
    _id: c._id,
    clienteId: c.clienteId._id,
    clienteNombre: c.clienteId.nombre,
    clienteEmail: c.clienteId.email,
    profesionalId: c.profesionalId._id,
    profesionalNombre: c.profesionalId.nombre,
    profesionalEmail: c.profesionalId.email,
    descripcion: c.descripcion
  }));

    res.json(resultado);
  } catch (err) {
    console.error('❌ Error al obtener conflictos:', err);
    res.status(500).json({ error: 'Error al obtener conflictos' });
  }
});

const Invoice = require('../models/Invoice'); // ⬅️ Asegúrate de tenerlo al principio

// Obtener todas las facturas
router.get('/facturas', verifyAdmin, async (req, res) => {
  try {
    const facturas = await Invoice.find()
      .populate('clienteId', 'nombre email')
      .populate('ordenId', 'descripcion estado')
      .sort({ createdAt: -1 });

    const resultado = facturas.map(f => ({
      _id: f._id,
      descripcion: f.ordenId?.descripcion || 'Sin descripción',
      estado: f.ordenId?.estado || 'desconocido',
      cliente: f.clienteId?.nombre || 'Desconocido',
      email: f.clienteId?.email || '',
      urlPDF: f.archivo,
    }));

    res.json(resultado);
  } catch (err) {
    console.error('❌ Error al obtener facturas:', err);
    res.status(500).json({ error: 'Error al obtener facturas' });
  }
});

// Eliminar factura individual
router.delete('/facturas/:id', verifyAdmin, async (req, res) => {
  try {
    const result = await Invoice.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Factura no encontrada' });
    res.json({ message: '✅ Factura eliminada correctamente' });
  } catch (err) {
    console.error('❌ Error al eliminar factura:', err);
    res.status(500).json({ error: 'Error al eliminar factura' });
  }
});

router.delete('/debug/ordenes-huerfanas', verifyAdmin, async (req, res) => {
  const eliminadas = await Order.deleteMany({
    estado: 'conflicto',
    $or: [
      { clienteId: null },
      { profesionalId: null }
    ]
  });

  res.json({ eliminadas: eliminadas.deletedCount });
});

// ✅ Obtener todas las órdenes pagadas
router.get('/pagos', verifyAdmin, async (req, res) => {
  try {
    const pagos = await Order.find({ estado: { $in: ['pagada', 'completada'] } })
      .populate('clienteId', 'nombre email')
      .populate('profesionalId', 'nombre email')
      .sort({ pagadoEn: -1 });

    const resultado = pagos.map(p => ({
      _id: p._id,
      descripcion: p.descripcion,
      precioCliente: p.precioCliente,
      precioProfesional: p.precioProfesional,
      comision: p.comision,
      estado: p.estado,
      fecha: p.pagadoEn,
      cliente: p.clienteId?.nombre || 'Desconocido',
      clienteEmail: p.clienteId?.email || '',
      profesional: p.profesionalId?.nombre || 'Desconocido',
      profesionalEmail: p.profesionalId?.email || '',
    }));

    res.json(resultado);
  } catch (err) {
    console.error('❌ Error al obtener pagos:', err);
    res.status(500).json({ error: 'Error al obtener pagos' });
  }
});

// 📊 Obtener métricas del negocio
router.get('/metrics', verifyAdmin, async (req, res) => {
  try {
    const totalUsuarios = await User.countDocuments();
    const ordenes = await Order.find({ estado: { $in: ['pagada', 'completada', 'conflicto'] } });

    if (!ordenes.length) {
      return res.json({
        ingresosTotales: 0,
        comisionSoluchion: 0,
        ticketMedio: 0,
        totalUsuarios,
        totalGastadores: 0,
        porcentajeGastadores: 0
      });
    }

    // Total gastado por clientes
    const sumaTotalPagos = ordenes.reduce((sum, o) => sum + (o.precioCliente || 0), 0);

    // Comisión del 20%
    const comision = +(sumaTotalPagos * 0.2).toFixed(2);

    // Ticket medio por cliente
    const ticketMedio = +(sumaTotalPagos / ordenes.length).toFixed(2);

    // Total de clientes únicos que han pagado
    const clientesUnicos = [...new Set(ordenes.map(o => o.clienteId?.toString()).filter(Boolean))];
    const totalGastadores = clientesUnicos.length;

    const porcentajeGastadores = totalUsuarios > 0
      ? Math.round((totalGastadores / totalUsuarios) * 100)
      : 0;

    res.json({
      ingresosTotales: sumaTotalPagos.toFixed(2),
      comisionSoluchion: comision.toFixed(2),
      ticketMedio,
      totalUsuarios,
      totalGastadores,
      porcentajeGastadores
    });
  } catch (err) {
    console.error("❌ Error al calcular métricas:", err);
    res.status(500).json({ error: 'Error al obtener métricas del negocio' });
  }
});

router.post('/usuarios/:id/foto', verifyAdmin, upload.single('foto'), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const fileUrl = `/uploads/professionals/${req.file.filename}`;
  user.portfolioImages.push(fileUrl);
  await user.save();

  res.json({ message: '✅ Imagen añadida', url: fileUrl });
});

router.delete('/usuarios/:id/foto', verifyAdmin, async (req, res) => {
  const { imageUrl } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  user.portfolioImages = user.portfolioImages.filter(url => url !== imageUrl);
  await user.save();

  // Eliminar archivo físico del disco
  const filePath = path.join(__dirname, '..', imageUrl);
  fs.unlink(filePath, err => {
    if (err) console.warn('⚠️ No se pudo eliminar físicamente:', err.message);
  });

  res.json({ message: '✅ Imagen eliminada del portfolio' });
});


module.exports = router;
