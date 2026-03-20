const express = require('express');
const router = express.Router();
const Invoice = require('../models/Invoice');
const verifyToken = require('../middleware/verifyToken'); // ✅ FALTABA ESTO

router.get('/:clienteId', verifyToken, async (req, res) => {
  console.log('📥 GET /api/facturas/:id', req.params.clienteId);

  try {
    const facturas = await Invoice.find({ clienteId: req.params.clienteId }).sort({ fecha: -1 });
    res.json(facturas);
  } catch (err) {
    console.error('❌ Error al obtener facturas:', err);
    res.status(500).json({ error: 'Error al obtener facturas' });
  }
});

module.exports = router;
