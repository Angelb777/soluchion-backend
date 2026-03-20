const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const generarFacturaPDF = (cliente, orden, nombreArchivo) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const outputPath = path.join(__dirname, `../uploads/invoices/${nombreArchivo}`);
    const stream = fs.createWriteStream(outputPath);
    
    doc.pipe(stream);

    doc.fontSize(20).text('FACTURA SOLUCHION', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Cliente: ${cliente.nombre}`);
    doc.text(`Email: ${cliente.email}`);
    doc.text(`Servicio: ${orden.descripcion}`);
    doc.text(`Precio: $${orden.precio}`);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`);
    doc.moveDown();
    doc.text(`Empresa: Soluchion S.A.`);
    doc.text(`RUC: 123456-7890`);
    doc.text(`Dirección: Panamá, República de Panamá`);

    doc.end();

    stream.on('finish', () => resolve(`uploads/invoices/${nombreArchivo}`));
    stream.on('error', reject);
  });
};

module.exports = generarFacturaPDF;
