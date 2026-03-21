const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  profesionalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function () {
      return !this.urgente;
    }
  },
  clienteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // 🔥 NUEVO (referidos)
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  descripcion: String,

  // ✅ Añadido para filtrar llamadas urgentes por gremio
  categoria: { type: String },

  // Para órdenes normales
  precioProfesional: Number,
  precioCliente: Number,
  comision: Number,

  // Estado general de la orden
  estado: {
    type: String,
    enum: ['pendiente', 'pagada', 'completada', 'conflicto', 'cancelada', 'llamadaEnCurso', 'llamadaAtendida'],
    default: 'pendiente'
  },

  // Feedback del cliente (estado y rating)
  respuestaCliente: {
    type: String,
    enum: ['bien', 'mal', 'no_respondio'],
    default: null
  },
  valoracion: {
    type: Number,
    min: 1,
    max: 5
  },

  // 🗣️ Comentario opcional de feedback (NUEVO)
  comentarioFeedback: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },

  // Fecha/hora en que se registró el feedback/comentario (NUEVO)
  feedbackCreadoEn: { type: Date },

  // Campos de control temporal
  creado: { type: Date, default: Date.now },
  pagadoEn: Date,
  revisadoEn: Date,

  // Campos específicos para llamadas urgentes
  urgente: { type: Boolean, default: false },
  llamadaEnCurso: { type: Boolean, default: false },
  llamadaAceptadaEn: Date,

  // Información adicional de facturación y dirección
  direccion: String,
  nombreFacturacion: String,
  direccionFacturacion: String,
  imagenes: [String],

  // 🔥 NUEVO: Conflictos
  hayConflicto: { type: Boolean, default: false },
  resueltoPorAdmin: { type: Boolean, default: false },
  ganadorConflicto: { type: String, enum: ['cliente', 'profesional', ''], default: '' }
});

// Índices útiles para listados por profesional y fecha de feedback
orderSchema.index({ profesionalId: 1, feedbackCreadoEn: -1 });

module.exports = mongoose.model('Order', orderSchema);