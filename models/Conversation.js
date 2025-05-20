const mongoose = require('mongoose');

// Esquema para cada par de mensajes dentro de una conversación
const messageSchema = new mongoose.Schema({
  userInput: {
    type: String,
    required: true,
  },
  agentResponse: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
}, { _id: false }); // No necesitamos IDs individuales para cada mensaje en el array

// Esquema principal para la conversación
const conversationSchema = new mongoose.Schema({
  // MongoDB genera automáticamente un _id que usaremos como conversationId
  messages: {
    type: [messageSchema], // Un array de mensajes
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now, // Fecha de inicio de la conversación
  },
  // Podríamos añadir userId aquí en el futuro
});

// Índice para ordenar conversaciones por fecha de creación
conversationSchema.index({ createdAt: -1 });

// Especificar explícitamente el nombre de la colección como 'Consultas_realizadas'
const Conversation = mongoose.model('Conversation', conversationSchema, 'Consultas_realizadas');

module.exports = Conversation; 