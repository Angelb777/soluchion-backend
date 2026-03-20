const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Message = require('../models/Message');
const User = require('../models/User'); // Para /todos/:userId

// Enviar mensaje
router.post('/send', async (req, res) => {
  try {
    const { de, para, mensaje } = req.body;

    if (!de || !para || !mensaje) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    console.log('📨 Mensaje recibido:', { de, para, mensaje });

    const nuevo = new Message({
      de: new mongoose.Types.ObjectId(de),
      para: new mongoose.Types.ObjectId(para),
      mensaje,
      timestamp: new Date() // si tu modelo lo tiene
    });

    await nuevo.save();

    res.status(201).json({ message: '✅ Mensaje enviado', data: nuevo });
  } catch (error) {
    console.error('❌ Error al enviar mensaje:', error);
    res.status(500).json({ error: 'Error interno al guardar mensaje' });
  }
});

// Obtener conversación entre dos usuarios
router.get('/conversacion/:id1/:id2', async (req, res) => {
  const { id1, id2 } = req.params;

  try {
    const mensajes = await Message.find({
      $or: [
        { de: id1, para: id2 },
        { de: id2, para: id1 }
      ]
    }).sort({ timestamp: 1 });

    res.json(mensajes);
  } catch (error) {
    console.error('❌ Error al obtener conversación:', error);
    res.status(500).json({ error: 'Error interno al obtener conversación' });
  }
});

// Obtener todos los usuarios con los que ha conversado un usuario
router.get('/todos/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const mensajes = await Message.find({
      $or: [{ de: userId }, { para: userId }]
    });

    const idsConversaciones = new Set();

    mensajes.forEach(msg => {
      if (msg.de.toString() !== userId) idsConversaciones.add(msg.de.toString());
      if (msg.para.toString() !== userId) idsConversaciones.add(msg.para.toString());
    });

    const usuarios = await User.find({ _id: { $in: Array.from(idsConversaciones) } }).select('nombre _id fotoPerfil');

    res.json(usuarios);
  } catch (error) {
    console.error('❌ Error al obtener conversaciones:', error);
    res.status(500).json({ error: 'Error interno al buscar chats' });
  }
});

// Obtener todos los mensajes entre cliente y profesional de una orden
router.get('/orden/:orderId', async (req, res) => {
  const { orderId } = req.params;

  try {
    const Order = require('../models/order'); // importar aquí para evitar bucles circulares si lo haces arriba
    const orden = await Order.findById(orderId);
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });

    const clienteId = orden.clienteId;
    const profesionalId = orden.profesionalId;
    if (!clienteId || !profesionalId) return res.status(400).json({ error: 'Orden incompleta' });

    const mensajes = await Message.find({
      $or: [
        { de: clienteId, para: profesionalId },
        { de: profesionalId, para: clienteId }
      ]
    }).sort({ timestamp: 1 });

    res.json(mensajes);
  } catch (error) {
    console.error('❌ Error al obtener mensajes de la orden:', error);
    res.status(500).json({ error: 'Error interno al obtener mensajes' });
  }
});

module.exports = router;
