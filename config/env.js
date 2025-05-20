require('dotenv').config();

// Define todas las variables de entorno necesarias para la aplicación
module.exports = {
  port: process.env.PORT || 5001,
  jwtSecret: process.env.JWT_SECRET,
  
  // URI para MongoDB, debe ser configurada en el archivo .env
  mongoURI: process.env.MONGO_URI,
  
  // URI alternativa con formato local si la principal falla (opcional, considerar si es necesario para prod)
  // mongoURIFallback: process.env.MONGO_URI_FALLBACK || 'mongodb://localhost:27017/automatizacion_productos'
};