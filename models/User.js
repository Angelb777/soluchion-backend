const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  nombre: String,

  email: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // 🔥 NUEVO
  nickname: {
    type: String,
    required: true,
    unique: true,
    lowercase: true, // 👈 ESTO ES CLAVE (auto minúsculas)
    trim: true,
    index: true
  },

  password: String,

  role: { 
    type: String, 
    enum: ['cliente', 'profesional', 'admin'], 
    default: 'cliente', 
    index: true 
  },

  // ✅ Verificación manual por admin
  isVerified: { type: Boolean, default: false, index: true },
  verifiedAt: { type: Date, default: null },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  ubicacion: {
    lat: Number,
    lng: Number
  },

  categorias: [String],

  portfolioImages: [String],

  hourlyRate: Number,

  basePrices: [
    {
      service: String,
      price: Number
    }
  ],

  fotoPerfil: String

}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);