const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  clienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ordenId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  archivo: { type: String, required: true }, // ruta del PDF
  fecha: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
