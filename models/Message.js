const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  de: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  para: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mensaje: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema);