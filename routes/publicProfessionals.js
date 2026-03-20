const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Order = require('../models/order');

function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLon/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// GET /api/public/profesionales?lat=...&lng=...
router.get('/profesionales', async (req, res) => {
  try {
    const latC = Number(req.query.lat);
    const lngC = Number(req.query.lng);

    console.log('🔎 [/public/profesionales] query:', req.query);

    if (Number.isNaN(latC) || Number.isNaN(lngC)) {
      console.log('⛔ Coordenadas inválidas');
      return res.status(400).json({ error: 'Faltan o son inválidas las coordenadas del cliente' });
    }

    const profesionales = await User.find({
      role: 'profesional',
      isVerified: true,
      'ubicacion.lat': { $exists: true, $ne: null },
      'ubicacion.lng': { $exists: true, $ne: null }
    })
      .select('nombre email categorias ubicacion hourlyRate basePrices portfolioImages isVerified')
      .lean();

    console.log(`📦 Candidatos (verificados con ubicación): ${profesionales.length}`);

    const resultados = await Promise.all(
      profesionales.map(async (pro) => {
        const plat = Number(pro.ubicacion?.lat);
        const plng = Number(pro.ubicacion?.lng);
        if (Number.isNaN(plat) || Number.isNaN(plng)) {
          console.log(`⚠️ ${pro.nombre} excluido: lat/lng NaN`, pro.ubicacion);
          return null;
        }

        const distancia = calcularDistanciaKm(latC, lngC, plat, plng);
        if (distancia > 10) {
          console.log(`📏 ${pro.nombre} fuera de 10km: ${distancia.toFixed(2)}km`);
          return null;
        }

        const valoraciones = await Order.find({
          profesionalId: pro._id,
          valoracion: { $exists: true }
        }).select('valoracion');

        let media = 0;
        let total = 0;
        if (valoraciones.length > 0) {
          const sum = valoraciones.reduce((acc, v) => acc + (v.valoracion || 0), 0);
          media = Number((sum / valoraciones.length).toFixed(1));
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

    const filtrados = resultados.filter(Boolean);
    console.log(`✅ Devueltos al cliente: ${filtrados.length}`);
    res.json(filtrados);
  } catch (error) {
    console.error('❌ Error en /public/profesionales:', error);
    res.status(500).json({ error: 'Error al obtener profesionales' });
  }
});

module.exports = router;
