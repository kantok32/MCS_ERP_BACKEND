const mongoose = require('mongoose');

const CalculoHistorialSchema = new mongoose.Schema({
  productos: [DetalleProductoSchema],
  opcionales: [DetalleOpcionalSchema],
  subtotalNeto: Number,
  iva: Number,
  totalGeneral: Number,
  fechaCreacion: {
    type: Date,
    default: Date.now,
  },
  empresaQueCotiza: { type: String, default: 'Mi Empresa' },
  nombreCliente: { type: String, required: false },
  numeroCliente: { type: String, required: false },
  emailCliente: { type: String, required: false },
  comentariosAdicionales: { type: String, required: false },
});

const CalculoHistorial = mongoose.model('CalculoHistorial', CalculoHistorialSchema);

module.exports = CalculoHistorial; 