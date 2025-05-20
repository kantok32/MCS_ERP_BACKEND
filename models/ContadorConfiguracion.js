const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ContadorConfiguracionSchema = new Schema({
    _id: { type: String, required: true }, // Un ID fijo para el documento contador, ej: 'configuracionCounter'
    secuencia: { type: Number, default: 0 } // El valor actual de la secuencia
});

// Asegurarse de que el contador se inicialice si no existe la primera vez.
// mongoose.model ya maneja la no recompilación del modelo.
// No se necesita una función de inicialización explícita aquí si se usa upsert:true y setDefaultsOnInsert:true en findOneAndUpdate.

module.exports = mongoose.model('ContadorConfiguracion', ContadorConfiguracionSchema); 