// controllers/adminVerificacionesController.js
const User = require('../models/User');

// GET /api/admin/verifications/professionals?status=pending|verified|all&q=texto
exports.listarProfesionales = async (req, res) => {
  try {
    const { status = 'pending', q } = req.query;

    const filter = { role: 'profesional' };
    if (status === 'pending') filter.isVerified = false;
    else if (status === 'verified') filter.isVerified = true;
    // status === 'all' -> no añade isVerified

    if (q && q.trim()) {
      const rx = new RegExp(q.trim(), 'i');
      filter.$or = [
        { nombre: rx },
        { email: rx },
        { categorias: { $elemMatch: { $regex: rx } } },
      ];
    }

    // Orden: primero pendientes y luego verificados, y dentro de cada uno, más nuevos arriba
    const sort = status === 'all'
      ? { isVerified: 1, createdAt: -1 }
      : { createdAt: -1 };

    const pros = await User.find(filter)
      .sort(sort)
      .select('nombre email categorias isVerified createdAt updatedAt ubicacion hourlyRate basePrices fotoPerfil');

    res.json(pros);
  } catch (e) {
    console.error('listarProfesionales error:', e);
    res.status(500).json({ error: 'Error listando profesionales' });
  }
};

// PATCH /api/admin/verifications/professionals/:id/verify
exports.verificar = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await User.findByIdAndUpdate(
      id,
      { $set: { isVerified: true } },
      { new: true }
    ).select('nombre email categorias isVerified updatedAt');
    if (!updated) return res.status(404).json({ error: 'Profesional no encontrado' });
    res.json({ message: 'Profesional verificado', user: updated });
  } catch (e) {
    console.error('verificar error:', e);
    res.status(500).json({ error: 'No se pudo verificar' });
  }
};

// PATCH /api/admin/verifications/professionals/:id/unverify
exports.desverificar = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await User.findByIdAndUpdate(
      id,
      { $set: { isVerified: false } },
      { new: true }
    ).select('nombre email categorias isVerified updatedAt');
    if (!updated) return res.status(404).json({ error: 'Profesional no encontrado' });
    res.json({ message: 'Profesional desverificado', user: updated });
  } catch (e) {
    console.error('desverificar error:', e);
    res.status(500).json({ error: 'No se pudo desverificar' });
  }
};
