const express = require('express');
const router = express.Router();
const Order = require('../models/order');
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const generarFacturaPDF = require('../utils/generarFactura');
const verifyToken = require('../middleware/verifyToken');
const mongoose = require('mongoose');
const haversine = require('haversine-distance'); // si quieres hacer el cálculo a mano

// Enmascara "Angel B." -> "A*** B***"
function maskName(fullName = 'Cliente') {
  try {
    const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'Cliente';
    if (parts.length === 1) {
      const n = parts[0];
      return n.length > 1 ? `${n[0]}${'*'.repeat(Math.max(1, n.length - 1))}` : n;
    }
    const first = parts[0], last = parts[parts.length - 1];
    const mask = s => (s.length > 1 ? `${s[0]}${'*'.repeat(Math.max(1, s.length - 1))}` : s);
    return `${mask(first)} ${mask(last)}`;
  } catch {
    return 'Cliente';
  }
}

// ✅ Guardar comentario de feedback (opcional, tras 'bien' o 'mal')
router.post('/comentario/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { comentario = '' } = req.body;
    const txt = (comentario || '').toString().trim();

    if (txt.length === 0) return res.status(400).json({ error: 'Comentario vacío' });
    if (txt.length > 500) return res.status(400).json({ error: 'Máximo 500 caracteres' });

    const orden = await Order.findById(id).populate({ path: 'clienteId', select: 'nombre' });
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });

    // Solo el cliente dueño puede comentar
    if (orden.clienteId._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    // Debe existir feedback previo (bien/mal)
    if (!orden.respuestaCliente) {
      return res.status(400).json({ error: 'Primero responde el feedback (bien/mal)' });
    }

    // Evitar dobles comentarios (si no deseas edición)
    if (orden.comentarioFeedback && orden.comentarioFeedback.trim().length > 0) {
      return res.status(409).json({ error: 'Ya existe un comentario para esta orden' });
    }

    orden.comentarioFeedback = txt;
    if (!orden.feedbackCreadoEn) orden.feedbackCreadoEn = new Date();
    await orden.save();

    return res.json({ ok: true });
  } catch (err) {
    console.error('POST comentario error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});


// ✅ Crear orden
router.post('/create', verifyToken, async (req, res) => {
  console.log('📥 POST /api/orders/create');
  console.log('📦 Body recibido:', req.body);

  try {
    const { profesionalId, clienteId, descripcion, precioProfesional, precioCliente } = req.body;

    if (!profesionalId || !clienteId || !descripcion || precioProfesional == null || precioCliente == null) {
      console.log('❌ Faltan datos');
      return res.status(400).json({ error: 'Faltan datos' });
    }

    const comision = +(precioCliente - precioProfesional).toFixed(2);
    console.log('💰 Comisión calculada:', comision);

    const nuevaOrden = new Order({
      profesionalId,
      clienteId,
      descripcion,
      precioProfesional,
      precioCliente,
      comision
    });

    console.log('📤 Guardando orden...');
    const ordenGuardada = await nuevaOrden.save();
    console.log('✅ Orden guardada con éxito:', ordenGuardada);

    res.status(201).json(ordenGuardada);
  } catch (err) {
    console.error('❌ Error al crear orden:', err);
    res.status(500).json({ error: 'Error al crear orden' });
  }
});

// ✅ Cliente pulsa “Pagar”
router.post('/pagar/:id', verifyToken, async (req, res) => {
  console.log('📥 POST /api/orders/pagar/' + req.params.id);
  try {
    const orden = await Order.findById(req.params.id);
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });

    orden.estado = 'pagada';
    orden.pagadoEn = new Date();
    await orden.save();

    const cliente = await User.findById(orden.clienteId);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    const nombreArchivo = `factura-${orden._id}.pdf`;
    const rutaFactura = await generarFacturaPDF(cliente, orden, nombreArchivo);
    console.log('📄 Factura generada:', rutaFactura);

    const nuevaFactura = new Invoice({
      clienteId: cliente._id,
      ordenId: orden._id,
      archivo: rutaFactura
    });
    await nuevaFactura.save();

    console.log('✅ Orden pagada con éxito');
    res.json({ message: 'Orden pagada con éxito y factura generada', orden, factura: nuevaFactura });
  } catch (err) {
    console.error('❌ Error al pagar orden:', err);
    res.status(500).json({ error: 'Error al pagar la orden' });
  }
});

// ✅ Profesional solicita feedback
router.post('/solicitar-feedback/:id', verifyToken, async (req, res) => {
  try {
    const orden = await Order.findById(req.params.id);
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
    if (orden.estado !== 'pagada') return res.status(400).json({ error: 'La orden aún no ha sido pagada' });

    orden.revisadoEn = new Date();
    await orden.save();

    res.json({ message: 'Solicitud de feedback enviada', orden });
  } catch (err) {
    console.error('❌ Error al solicitar feedback:', err);
    res.status(500).json({ error: 'Error al solicitar feedback' });
  }
});

// ✅ Cliente responde feedback (bien/mal) + valoración
// ✅ Cliente responde feedback (bien/mal) + valoración
router.post('/responder-feedback/:id', verifyToken, async (req, res) => {
  console.log("📥 Feedback recibido:", req.body);
  const { respuesta, valoracion } = req.body;

  if (!['bien', 'mal'].includes(respuesta)) {
    return res.status(400).json({ error: 'Respuesta no válida' });
  }
  if (respuesta === 'bien' && (typeof valoracion !== 'number' || valoracion < 1 || valoracion > 5)) {
    return res.status(400).json({ error: 'Debe incluir una valoración de 1 a 5 estrellas' });
  }

  try {
    const orden = await Order.findById(req.params.id);
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
    if (orden.estado !== 'pagada') return res.status(400).json({ error: 'La orden aún no ha sido pagada' });

    // Solo el cliente puede responder
    if (orden.clienteId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    // Estado + feedback plano (modelo actualizado)
    orden.respuestaCliente = respuesta;
    orden.estado = respuesta === 'bien' ? 'completada' : 'conflicto';
    if (respuesta === 'bien') {
      orden.valoracion = valoracion;
    }
    // Marca de fecha del feedback (para ordenar/listar)
    orden.feedbackCreadoEn = new Date();

    if (respuesta === 'bien') {
      // Tu lógica existente: generar factura profesional
      const profesional = await User.findById(orden.profesionalId);
      if (profesional) {
        const nombreArchivo = `factura-pro-${orden._id}.pdf`;
        const rutaFactura = await generarFacturaPDF(profesional, orden, nombreArchivo);
        const nuevaFactura = new Invoice({
          clienteId: orden.profesionalId,
          ordenId: orden._id,
          archivo: rutaFactura
        });
        await nuevaFactura.save();
        console.log('📄 Factura para profesional generada');
      }
    } else {
      // Conflicto (ya lo hacías)
      orden.hayConflicto = true;
      orden.resueltoPorAdmin = false;
      orden.ganadorConflicto = '';
      console.log('⚠️ Conflicto registrado para revisión admin');
    }

    await orden.save();
    res.json({ message: 'Respuesta y valoración guardadas', orden });
  } catch (err) {
    console.error('❌ Error al guardar respuesta:', err);
    res.status(500).json({ error: 'Error al guardar respuesta' });
  }
});

// ✅ Obtener facturas del usuario autenticado
router.get('/facturas', verifyToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const facturas = await Order.find({
      $or: [
        { clienteId: userId },
        { profesionalId: userId }
      ],
      estado: { $in: ['pagada', 'completada', 'conflicto'] }
    }).sort({ pagadoEn: -1 });

    res.json(facturas);
  } catch (error) {
    console.error('❌ Error al obtener facturas:', error);
    res.status(500).json({ error: 'Error al obtener facturas' });
  }
});

// ✅ Obtener facturas SOLO del profesional autenticado
router.get('/facturas-profesional', verifyToken, async (req, res) => {
  try {
    const profesionalId = req.user.id;

    const facturas = await Invoice.find({ clienteId: profesionalId }).sort({ createdAt: -1 });

    const facturasFormateadas = await Promise.all(
      facturas.map(async (factura) => {
        const orden = await Order.findById(factura.ordenId);
        return {
          descripcion: orden?.descripcion || 'Sin descripción',
          estado: orden?.estado || 'desconocido',
          urlPDF: factura.archivo
        };
      })
    );

    res.json(facturasFormateadas);
  } catch (error) {
    console.error('❌ Error al cargar facturas del profesional:', error);
    res.status(500).json({ error: 'Error al obtener facturas del profesional' });
  }
});

// ✅ Obtener valoraciones de un profesional
// ✅ Obtener valoraciones (y comentarios) de un profesional
router.get('/valoraciones/:profesionalId', async (req, res) => {
  try {
    const { profesionalId } = req.params;

    // Trae todas las órdenes del pro que tengan feedback respondido (bien/mal)
    const ordenes = await Order.find({
      profesionalId,
      respuestaCliente: { $in: ['bien', 'mal'] }
    })
    .select('descripcion valoracion comentarioFeedback feedbackCreadoEn clienteId pagadoEn creado')
    .populate({ path: 'clienteId', select: 'nombre' })
    .sort({ feedbackCreadoEn: -1, pagadoEn: -1, creado: -1 });

    const valoraciones = ordenes.map(o => ({
      descripcion: o.descripcion,
      valoracion: typeof o.valoracion === 'number' ? o.valoracion : null,
      comentario: o.comentarioFeedback || null,
      clienteNombreParcial: maskName(o.clienteId?.nombre || 'Cliente'),
      createdAt: (o.feedbackCreadoEn || o.pagadoEn || o.creado || new Date()).toISOString()
    }));

    res.json(valoraciones);
  } catch (err) {
    console.error('❌ Error al obtener valoraciones:', err);
    res.status(500).json({ error: 'Error al obtener valoraciones' });
  }
});


// ✅ Crear Llamada Urgente
// ✅ Crear Llamada Urgente (solo notifica a profesionales VERIFICADOS y a ≤10 km)
router.post('/urgent', verifyToken, async (req, res) => {
  console.log('📥 POST /api/orders/urgent');
  try {
    const {
      clienteId,
      direccion,
      nombreFacturacion,
      direccionFacturacion,
      descripcion,
      imagenes,
      categoria
    } = req.body;

    if (!clienteId || !descripcion || !direccion || !categoria) {
      return res.status(400).json({ error: 'Faltan datos necesarios' });
    }

    // Obtener datos del cliente (ubicación)
    const cliente = await User.findById(clienteId).select('ubicacion').lean();
    if (!cliente || !cliente.ubicacion?.lat || !cliente.ubicacion?.lng) {
      return res.status(404).json({ error: 'Cliente no encontrado o sin ubicación' });
    }

    // Candidatos: profesionales verificados del gremio con ubicación
    const prosCandidatos = await User.find({
      role: 'profesional',
      isVerified: true,                            // ⬅️ SOLO VERIFICADOS
      categorias: { $in: [categoria] },
      'ubicacion.lat': { $exists: true, $ne: null },
      'ubicacion.lng': { $exists: true, $ne: null }
    })
      .select('nombre ubicacion categorias')
      .lean();

    // Filtrar por distancia (≤ 10 km)
    const origen = {
      latitude: Number(cliente.ubicacion.lat),
      longitude: Number(cliente.ubicacion.lng),
    };

    const profesionalesCercanos = prosCandidatos.filter(p => {
      const destino = {
        latitude: Number(p.ubicacion.lat),
        longitude: Number(p.ubicacion.lng),
      };
      const metros = haversine(origen, destino);
      return metros <= 10000; // 10 km
    });

    console.log(`📡 Profesionales verificados en 10km: ${profesionalesCercanos.length}`);

    // Crear orden con estado "llamadaEnCurso"
    const nuevaOrden = new Order({
      clienteId,
      profesionalId: null,
      descripcion,
      direccion,
      nombreFacturacion,
      direccionFacturacion,
      imagenes,
      urgente: true,
      llamadaEnCurso: true,
      estado: 'llamadaEnCurso',
      categoria
    });

    await nuevaOrden.save();

    // Enviar notificación a cada profesional cercano del gremio
    for (const p of profesionalesCercanos) {
      console.log(`📲 Notificar a profesional ${p.nombre} (${p._id})`);
      // TODO: emitir por socket/push aquí
    }

    return res.status(201).json({ message: 'Llamada urgente creada', orden: nuevaOrden });
  } catch (err) {
    console.error('❌ Error en llamada urgente:', err);
    return res.status(500).json({ error: 'Error al crear llamada urgente' });
  }
});

// ✅ Profesional acepta llamada urgente
router.post('/aceptar-llamada/:orderId', verifyToken, async (req, res) => {
  const profesionalId = req.user.id;
  const orderId = req.params.orderId;

  try {
    // ⛔ Solo profesionales verificados pueden aceptar
    const pro = await User.findById(profesionalId).select('role isVerified').lean();
    if (!pro || pro.role !== 'profesional') {
      return res.status(403).json({ error: 'No autorizado' });
    }
    if (!pro.isVerified) {
      return res.status(403).json({ error: 'Tu cuenta profesional aún no está verificada' });
    }

    const orden = await Order.findById(orderId);
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });

    if (orden.estado !== 'llamadaEnCurso' || !orden.urgente || orden.profesionalId) {
      return res.status(400).json({ error: 'La llamada ya fue atendida o no está activa' });
    }

    orden.profesionalId = profesionalId;
    orden.estado = 'llamadaAtendida';
    orden.llamadaEnCurso = false;
    orden.llamadaAceptadaEn = new Date();

    await orden.save();

    console.log(`🟢 Profesional ${profesionalId} ha aceptado la llamada urgente`);

    res.json({ message: 'Llamada aceptada con éxito', orden });
  } catch (err) {
    console.error('❌ Error al aceptar llamada urgente:', err);
    res.status(500).json({ error: 'Error al aceptar llamada' });
  }
});


// ✅ Obtener llamadas urgentes disponibles para un profesional
router.get('/urgent/:profesionalId', verifyToken, async (req, res) => {
  const { profesionalId } = req.params;

  try {
    const profesional = await User.findById(profesionalId)
      .select('isVerified categorias ubicacion role')
      .lean();

    if (!profesional || profesional.role !== 'profesional') {
      return res.status(404).json({ error: 'Profesional no encontrado' });
    }

    // ⛔ No verificado -> no ve nada
    if (!profesional.isVerified) {
      return res.json([]); // ⬅️ lista vacía
    }

    // (Opcional) Si quieres filtrar también por distancia al pro:
    // Trae órdenes urgentes activas de sus categorías
    const ordenes = await Order.find({
      urgente: true,
      llamadaEnCurso: true,
      estado: 'llamadaEnCurso',
      categoria: { $in: profesional.categorias }
    }).lean();

    // Si NO quieres filtrar por distancia, responde ordenes tal cual:
    // return res.json(ordenes);

    // Filtra por distancia <= 10 km al profesional
    if (!profesional.ubicacion?.lat || !profesional.ubicacion?.lng) {
      return res.json([]); // sin ubicación -> no ve nada
    }

    const origen = {
      latitude: Number(profesional.ubicacion.lat),
      longitude: Number(profesional.ubicacion.lng)
    };

    const ordenesCercanas = ordenes.filter(o => {
      // Necesitas tener guardada ubicación del cliente en la orden
      // Si no la tienes, puedes leerla del usuario cliente:
      // (esto evita múltiples queries si la guardas en la orden al crearla)
      if (!o.clienteId) return false;
      return true; // si no quieres distancia, deja esto en true y quita todo lo de abajo
    });

    // Si quieres filtrar por distancia real, obtén la ubicación del cliente:
    // ⚠️ Solo si necesitas distancia. Si no, comenta este bloque y responde ordenes.
    for (let i = ordenesCercanas.length - 1; i >= 0; i--) {
      const o = ordenesCercanas[i];
      const cliente = await User.findById(o.clienteId).select('ubicacion').lean();
      if (!cliente?.ubicacion?.lat || !cliente?.ubicacion?.lng) {
        ordenesCercanas.splice(i, 1);
        continue;
      }
      const destino = {
        latitude: Number(cliente.ubicacion.lat),
        longitude: Number(cliente.ubicacion.lng)
      };
      const metros = haversine(origen, destino);
      if (metros > 10000) ordenesCercanas.splice(i, 1);
    }

    return res.json(ordenesCercanas);
  } catch (err) {
    console.error('❌ Error al obtener llamadas urgentes:', err);
    res.status(500).json({ error: 'Error al obtener llamadas urgentes' });
  }
});


// GET /admin/conflictos
router.get('/conflictos', async (req, res) => {
  if (!req.session?.isAdmin) return res.status(401).json({ error: 'No autorizado' });

  try {
    const conflictos = await Order.find({ hayConflicto: true })
      .populate('clienteId', 'nombre email')
      .populate('profesionalId', 'nombre email')
      .lean();

    res.json(conflictos);
  } catch (err) {
    console.error("❌ Error al obtener conflictos:", err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener info de orden urgente aceptada para un cliente
router.get('/llamada-urgente/:otroUsuarioId', verifyToken, async (req, res) => {
  try {
    const clienteId = req.user.id;
    const profesionalId = req.params.otroUsuarioId;

    const orden = await Order.findOne({
      clienteId,
      profesionalId,
      urgente: true,
      estado: { $in: ['llamadaAtendida', 'pagada', 'completada'] } // 🔧 AÑADIDO
    }).sort({ llamadaAceptadaEn: -1 });

    if (!orden || !orden.llamadaAceptadaEn) {
      return res.status(404).json({ error: 'No hay orden activa' });
    }

    res.json({
      llamadaAceptadaEn: orden.llamadaAceptadaEn.toISOString()
    });
  } catch (err) {
    console.error('❌ Error al buscar llamada urgente:', err);
    res.status(500).json({ error: 'Error al buscar llamada' });
  }
});

router.get('/llamada-urgente/:id', verifyToken, async (req, res) => {
  try {
    const profesionalId = req.params.id;

    const orden = await Order.findOne({
      profesionalId,
      urgente: true,
      estado: 'aceptada',
    });

    if (!orden) {
      return res.status(404).json({ mensaje: 'No hay llamada urgente activa' });
    }

    res.json({
      llamadaAceptadaEn: orden.llamadaAceptadaEn,
      servicio: orden.servicio,
      descripcion: orden.descripcion,
      direccion: orden.direccion,
      ordenId: orden._id
    });
  } catch (error) {
    console.error("Error en /llamada-urgente:", error);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.get('/llamada-urgente/chat/:otroUsuarioId', verifyToken, async (req, res) => {
  try {
    const miId = req.user.id;
    const otroId = req.params.otroUsuarioId;

    const orden = await Order.findOne({
      $or: [
        { clienteId: miId, profesionalId: otroId },
        { clienteId: otroId, profesionalId: miId }
      ],
      urgente: true,
      estado: { $in: ['llamadaAtendida', 'pagada', 'completada'] }
    }).sort({ llamadaAceptadaEn: -1 });

    if (!orden || !orden.llamadaAceptadaEn) {
      return res.status(404).json({ error: 'No hay orden activa' });
    }

    res.json({
      llamadaAceptadaEn: orden.llamadaAceptadaEn.toISOString(),
      servicio: orden.servicio,
      descripcion: orden.descripcion,
      direccion: orden.direccion,
      ordenId: orden._id
    });
  } catch (err) {
    console.error('❌ Error al buscar llamada urgente para chat:', err);
    res.status(500).json({ error: 'Error al buscar llamada' });
  }
});

module.exports = router;
