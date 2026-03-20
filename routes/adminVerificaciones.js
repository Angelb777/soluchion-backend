// routes/adminVerificaciones.js
'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User'); // Ajusta el path si tu modelo está en otro sitio

/**
 * GET /admin/verificaciones/professionals
 * Query params:
 *  - status: 'pending' | 'verified' | 'all'  (default: 'pending')
 *  - q: texto libre (nombre, email, categorias)
 *  - page: número de página (1..n) (default: 1)
 *  - limit: resultados por página (1..100) (default: 20)
 *  - sort: campo para ordenar (default: -createdAt)
 *
 * ⚠️ IMPORTANTE: Devolvemos **un array** para que el dashboard no rompa (items.map).
 */
router.get('/professionals', async (req, res) => {
  try {
    const {
      status = 'pending',
      q = '',
      page = '1',
      limit = '20',
      sort = '-createdAt',
    } = req.query;

    const numericLimit = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));
    const numericPage = Math.max(1, parseInt(page, 10) || 1);
    const skip = (numericPage - 1) * numericLimit;

    // Siempre filtramos a role profesional
    const baseFilter = { role: 'profesional' };

    // Filtro por estado de verificación
    let statusFilter = {};
    if (status === 'pending') statusFilter = { isVerified: { $ne: true } };
    else if (status === 'verified') statusFilter = { isVerified: true };
    // 'all' -> sin filtro extra

    // Búsqueda por texto
    const text = q.trim();
    let search = {};
    if (text) {
      const safe = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      search = {
        $or: [
          { nombre: safe },
          { email: safe },
          { categorias: { $elemMatch: safe } }, // si categorias es [String]
        ],
      };
    }

    const filter = { ...baseFilter, ...statusFilter, ...search };

    const [items] = await Promise.all([
      User.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(numericLimit)
        .select('nombre email categorias isVerified verifiedAt createdAt') // solo campos existentes
        .lean(),
      // Si algún día quieres paginación/summary, añade aquí los counts y cambia el res.json de abajo
    ]);

    // 🔥 Devolvemos SOLO el array para que el frontend pueda hacer items.map(...)
    res.json(items);
  } catch (e) {
    console.error('❌ Error listando verificaciones:', e);
    res.status(500).json({ error: 'Error listando verificaciones' });
  }
});

/**
 * PATCH /admin/verificaciones/professionals/:id/verify
 * Marca un profesional como verificado y setea verifiedAt/verifiedBy
 */
router.patch('/professionals/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const setData = { isVerified: true, verifiedAt: new Date() };
    if (req.user && req.user._id) setData.verifiedBy = req.user._id;

    const u = await User.findOneAndUpdate(
      { _id: id, role: 'profesional' },
      { $set: setData },
      {
        new: true,
        projection: 'nombre email categorias isVerified verifiedAt',
      }
    ).lean();

    if (!u) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true, user: u });
  } catch (e) {
    console.error('❌ Error verificando:', e);
    res.status(500).json({ error: 'Error verificando' });
  }
});

/**
 * PATCH /admin/verificaciones/professionals/:id/unverify
 * Quita la verificación
 */
router.patch('/professionals/:id/unverify', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const setData = { isVerified: false, verifiedAt: null };
    if (req.user && req.user._id) setData.verifiedBy = req.user._id;

    const u = await User.findOneAndUpdate(
      { _id: id, role: 'profesional' },
      { $set: setData },
      {
        new: true,
        projection: 'nombre email categorias isVerified verifiedAt',
      }
    ).lean();

    if (!u) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true, user: u });
  } catch (e) {
    console.error('❌ Error desverificando:', e);
    res.status(500).json({ error: 'Error desverificando' });
  }
});

module.exports = router;
