const mongoose = require('mongoose');

const costoPerfilSchema = new mongoose.Schema({
  nombre_perfil: {
    type: String,
    required: [true, 'El nombre del perfil es obligatorio.'],
    unique: true,
    trim: true
  },
  descripcion: {
    type: String,
    trim: true
  },

  // --- Seccion: Descuentos y Buffers (%) ---
  descuento_fabrica_pct: {
    type: Number,
    required: true,
    default: 0
  },
  buffer_eur_usd_pct: {
    type: Number,
    required: true,
    default: 0
  },
  buffer_usd_clp_pct: {
    type: Number,
    required: true,
    default: 0
  },
  tasa_seguro_pct: {
    type: Number,
    required: true,
    default: 0
  },
  margen_adicional_pct: {
    type: Number,
    required: true,
    default: 0
  },
  descuento_cliente_pct: {
    type: Number,
    required: true,
    default: 0
  },

  // --- Seccion: Costos Operacionales (Valores Fijos) ---
  costo_logistica_origen_eur: {
    type: Number,
    required: true,
    default: 0
  },
  flete_maritimo_usd: {
    type: Number,
    required: true,
    default: 0
  },
  recargos_destino_usd: {
    type: Number,
    required: true,
    default: 0
  },
  costo_agente_aduana_usd: {
    type: Number,
    required: true,
    default: 0
  },
  gastos_portuarios_otros_usd: {
    type: Number,
    required: true,
    default: 0
  },
  transporte_nacional_clp: {
    type: Number,
    required: true,
    default: 0
  },

  // --- Seccion: Impuestos (%) ---
  derecho_advalorem_pct: {
    type: Number,
    required: true,
    default: 0.06
  },
  iva_pct: {
    type: Number,
    required: true,
    default: 0.19
  }

}, {
  timestamps: true
});

// Índices para consultas comunes (opcional pero recomendado para rendimiento)
costoPerfilSchema.index({ nombre_perfil: 1 });


const CostoPerfil = mongoose.model('CostoPerfil', costoPerfilSchema);

module.exports = CostoPerfil; 