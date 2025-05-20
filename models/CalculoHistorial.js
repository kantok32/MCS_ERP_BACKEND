const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ProductoSchema = new Schema({
    codigo_producto: String,
    nombre_del_producto: String,
    Descripcion: String,
    Modelo: String,
    categoria: String,
    pf_eur: Schema.Types.Mixed, // Puede ser string o number
    datos_contables: {
        costo_fabrica: Number,
        divisa_costo: String,
        fecha_cotizacion: String,
        // Podríamos querer definir más explícitamente si conocemos más campos
    }
}, { _id: false });

const ProductoConOpcionalesSchema = new Schema({
    principal: ProductoSchema,
    opcionales: [ProductoSchema]
}, { _id: false });

// Definición más explícita y anidada para GroupedPruebaResultsSchema
const CostoProductoDetalleSchema = new Schema({
    factorActualizacion: Number,
    costoFabricaActualizadoEUR: Number,
    costoFinalFabricaEUR_EXW: Number,
    tipoCambioEurUsdAplicado: Number,
    costoFinalFabricaUSD_EXW: Number
}, { _id: false });

const LogisticaSeguroDetalleSchema = new Schema({
    costosOrigenUSD: Number,
    costoTotalFleteManejosUSD: Number,
    baseParaSeguroUSD: Number,
    primaSeguroUSD: Number,
    totalTransporteSeguroEXW_USD: Number
}, { _id: false });

const ImportacionDetalleSchema = new Schema({
    valorCIF_USD: Number,
    derechoAdvaloremUSD: Number,
    baseIvaImportacionUSD: Number,
    ivaImportacionUSD: Number,
    totalCostosImportacionDutyFeesUSD: Number
}, { _id: false });

const LandedCostDetalleSchema = new Schema({
    transporteNacionalUSD: Number,
    precioNetoCompraBaseUSD_LandedCost: Number
}, { _id: false });

const ConversionMargenDetalleSchema = new Schema({
    tipoCambioUsdClpAplicado: Number,
    precioNetoCompraBaseCLP: Number,
    margenCLP: Number,
    precioVentaNetoCLP: Number
}, { _id: false });

const PreciosClienteDetalleSchema = new Schema({
    precioNetoVentaFinalCLP: Number,
    ivaVentaCLP: Number,
    precioVentaTotalClienteCLP: Number
}, { _id: false });


const GroupedPruebaResultsSchema = new Schema({
    costo_producto: CostoProductoDetalleSchema,
    logistica_seguro: LogisticaSeguroDetalleSchema,
    importacion: ImportacionDetalleSchema,
    landed_cost: LandedCostDetalleSchema,
    conversion_margen: ConversionMargenDetalleSchema,
    precios_cliente: PreciosClienteDetalleSchema,
}, { _id: false });

const CalculationResultSchema = new Schema({
    inputs: Schema.Types.Mixed, // Objeto flexible, considerar definir si es estable
    calculados: GroupedPruebaResultsSchema,
    error: String
}, { _id: false });

// Sub-esquema para los detalles de la cotización
const CotizacionDetailsSchema = new Schema({
  clienteNombre: {
    type: String,
    default: null
  },
  emisorNombre: {
    type: String,
    default: null
  },
  empresaQueCotiza: {
    type: String,
    default: null
  },
  // Puedes añadir más campos aquí si son necesarios para cotizacionDetails
}, { _id: false }); // _id: false para no crear IDs para este subdocumento si no es necesario

const CalculoHistorialSchema = new Schema({
  itemsParaCotizar: {
    type: [Schema.Types.Mixed], // Array de objetos con estructura variable
    required: true
  },
  resultadosCalculados: {
    type: Schema.Types.Mixed, // Objeto con estructura variable
    required: true
  },
  cotizacionDetails: {
    type: CotizacionDetailsSchema,
    required: false // O true, según tu lógica
  },
  nombreReferencia: {
    type: String,
    trim: true,
    default: null
  },
  numeroConfiguracion: {
    type: Number,
    required: true, // Hacerlo requerido para asegurar que siempre exista
    // unique: true, // Descomentar si quieres forzar unicidad a nivel de DB, pero la lógica de incremento debería asegurarlo
  },
  nombrePerfil: {
    type: String,
    trim: true,
    default: null
  },
  // Considerar añadir un ID de usuario si tienes autenticación
  // userId: {
  //   type: mongoose.Schema.Types.ObjectId,
  //   ref: 'User', // Asumiendo que tienes un modelo User
  //   required: false // o true si siempre debe estar asociado a un usuario
  // },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('CalculoHistorial', CalculoHistorialSchema); 