const Order = require('../models/order');
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const generarFacturaPDF = require('../utils/generarFactura');

const ejecutarFeedbackAutomatico = async () => {
  const hace24Horas = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const ordenes = await Order.find({
    estado: 'pagada',
    revisadoEn: { $lte: hace24Horas },
    respuestaCliente: null,
  });

  for (const orden of ordenes) {
    orden.estado = 'completada';
    orden.respuestaCliente = 'no_respondio';

    // Generar factura para profesional
    const profesional = await User.findById(orden.profesionalId);
    if (profesional) {
      const nombreArchivo = `factura-${orden._id}-profesional.pdf`;
      const rutaFactura = await generarFacturaPDF(profesional, orden, nombreArchivo);

      const nuevaFactura = new Invoice({
        clienteId: orden.clienteId,
        ordenId: orden._id,
        archivo: rutaFactura,
      });

      await nuevaFactura.save();
    }

    await orden.save();
    console.log(`✅ Feedback automático aplicado a orden ${orden._id}`);
  }
};

module.exports = ejecutarFeedbackAutomatico;
