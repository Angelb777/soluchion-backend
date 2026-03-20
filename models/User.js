const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  nombre: String,
  email: String,
  password: String,
  role: { type: String, enum: ['cliente', 'profesional', 'admin'], default: 'cliente', index: true },

  // ✅ Verificación manual por admin
  isVerified: { type: Boolean, default: false, index: true },
  verifiedAt: { type: Date, default: null }, // ⬅️ NUEVO
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // ⬅️ NUEVO

  ubicacion: {
    lat: Number,
    lng: Number
  },
  categorias: [String],
  portfolioImages: [String], // ✅ Fotos del profesional
  hourlyRate: Number,        // ✅ Precio por hora
  basePrices: [              // ✅ Lista de precios base por servicio
    {
      service: String,
      price: Number
    }
  ],
  fotoPerfil: String // ✅ URL del selfie
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
