// server.js
'use strict';

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const fs = require('fs');
require('dotenv').config();

console.log('🧪 JWT_SECRET en uso:', process.env.JWT_SECRET);

const app = express();

// ===== Middlewares base =====
app.use(cors());

// Solo parsea JSON si NO es multipart
app.use((req, res, next) => {
  const isMultipart = req.headers['content-type']?.includes('multipart/form-data');
  if (!isMultipart) return express.json()(req, res, next);
  next();
});
app.use(express.urlencoded({ extended: true }));

// ⚠️ Sesión SIEMPRE antes de montar rutas
app.use(
  session({
    secret: 'soluchion-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // secure: true, // solo si usas HTTPS
    },
  })
);

// ===== FS: asegurar carpetas =====
['uploads/professionals', 'uploads/invoices', 'uploads/profiles'].forEach((folder) => {
  const dir = path.join(__dirname, folder);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📂 Carpeta creada: ${folder}`);
    } else {
      fs.accessSync(dir, fs.constants.W_OK);
      console.log(`✅ Carpeta accesible: ${folder}`);
    }
  } catch (err) {
    console.error(`❌ Error con la carpeta ${folder}:`, err.message);
  }
});

// ===== estáticos =====
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads/invoices', (req, res, next) => {
  console.log('📥 PDF:', req.ip, req.url);
  next();
});

// ===== Rutas API =====
const userRoutes = require('./routes/userRoutes');
const messageRoutes = require('./routes/messageRoutes');
const orderRoutes = require('./routes/orders');
const uploadRoutes = require('./routes/uploads');
const invoiceRoutes = require('./routes/invoices');
const adminRoutes = require('./routes/admin');

// ✅ Nuevos routers
const publicProfessionalsRoutes = require('./routes/publicProfessionals');
const authRoutes = require('./routes/auth');

// ❗️IMPORTANTE: bajo /api/*
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/facturas', invoiceRoutes);

// ✅ Coincide con Flutter: /api/public/profesionales
app.use('/api/public', publicProfessionalsRoutes);
app.use('/api/auth', authRoutes);

// ===== Verificaciones/Admin =====
const verifyToken = require('./middleware/verifyToken');
const requireAdmin = require('./middleware/requireAdmin');
const requireAdminSession = require('./middleware/requireAdminSession');
const adminVerificaciones = require('./routes/adminVerificaciones');

// Helpers de sesión (dashboard)
app.get('/admin/whoami', (req, res) => res.json(req.session?.user || null));
app.get('/admin/fake-login', (req, res) => {
  req.session.user = { _id: 'admin-dev', nombre: 'Admin Dev', email: 'admin@soluchion.local', role: 'admin' };
  res.json({ ok: true });
});

// a) API móvil con JWT
app.use('/api/admin/verifications', verifyToken, requireAdmin, adminVerificaciones);

// b) Dashboard con sesión
app.use('/admin/verificaciones', requireAdminSession, adminVerificaciones);

// Rutas del dashboard
app.use('/admin', adminRoutes);

// Frontend estático (si lo usas)
app.use('/', express.static(path.join(__dirname, 'Frontend')));

// ===== ENDPOINTS DE DEBUG =====
const User = require('./models/User');

// Lista TODOS los profesionales con isVerified y ubicacion
app.get('/api/debug/pros', async (req, res) => {
  const pros = await User.find({ role: 'profesional' })
    .select('nombre email role isVerified ubicacion')
    .lean();
  res.json(pros);
});

// Verifica manualmente un profesional por ID (temporal)
app.patch('/api/debug/pros/:id/verify', async (req, res) => {
  const u = await User.findByIdAndUpdate(
    req.params.id,
    { isVerified: true, verifiedAt: new Date(), verifiedBy: null },
    { new: true }
  ).select('nombre isVerified ubicacion');
  res.json(u);
});

app.get('/test', (req, res) => res.send('✅ Acceso OK'));

// 404
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ===== Mongo + Cron =====
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Conectado a MongoDB');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Servidor en puerto ${PORT}`);
    });

    const ejecutarFeedbackAutomatico = require('./cron/feedbackAuto');
    setInterval(() => {
      console.log('⏰ Ejecutando verificación de feedback automático...');
      ejecutarFeedbackAutomatico();
    }, 60 * 60 * 1000);
  })
  .catch((err) => console.error('❌ Error de conexión:', err));
