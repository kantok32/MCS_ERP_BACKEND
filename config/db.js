const mongoose = require('mongoose');
const { mongoURI, mongoURIFallback } = require('./env');

// URI directa por si fallan las otras opciones
const lastResortURI = 'mongodb://localhost:27017/automatizacion';
// URI para base de datos en memoria como último recurso (requiere mongodb-memory-server instalada)
const inMemoryOption = process.env.NODE_ENV === 'development';

const connectDB = async () => {
  // Intentar conexión con URI principal
  try {
    // Imprimir la URI (sin mostrar la contraseña completa por seguridad)
    const safeURI = mongoURI.replace(/:([^:@]+)@/, ':****@');
    console.log(`[MongoDB] Trying to connect to primary MongoDB: ${safeURI}`);
    
    const conn = await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Configurar opciones para todos los esquemas a nivel global
    mongoose.set('strictQuery', false);
    mongoose.set('debug', process.env.NODE_ENV === 'development');
    
    console.log(`[MongoDB] Connected to primary MongoDB: ${conn.connection.host}`);
    
    // Devolver la conexión
    return conn;
  } catch (primaryError) {
    console.error(`[MongoDB] Error connecting to primary MongoDB: ${primaryError.message}`);
    console.log('[MongoDB] Attempting to connect to fallback MongoDB...');
    
    // Intentar conexión con URI de fallback
    try {
      const conn = await mongoose.connect(mongoURIFallback, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      
      console.log(`[MongoDB] Connected to fallback MongoDB: ${conn.connection.host}`);
      return conn;
    } catch (fallbackError) {
      console.error(`[MongoDB] Error connecting to fallback MongoDB: ${fallbackError.message}`);
      console.log('[MongoDB] Attempting to connect with last resort local URI...');
      
      // Último intento con URI directa local
      try {
        const conn = await mongoose.connect(lastResortURI, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
        });
        
        console.log(`[MongoDB] Connected to last resort MongoDB: ${conn.connection.host}`);
        return conn;
      } catch (lastError) {
        console.error(`[MongoDB] All connection attempts failed. Final error: ${lastError.message}`);
        
        // Si estamos en desarrollo, intentar crear una base de datos en memoria
        if (inMemoryOption) {
          try {
            console.log('[MongoDB] Development environment detected. Creating in-memory database...');
            // Crear una conexión a una base de datos en memoria
            const conn = await mongoose.connect('mongodb://127.0.0.1:27017/test-db', {
              useNewUrlParser: true,
              useUnifiedTopology: true,
            });
            console.log('[MongoDB] Connected to in-memory database for development');
            console.warn('[WARNING] Using in-memory database - all data will be lost when server stops');
            return conn;
          } catch (memoryError) {
            console.error(`[MongoDB] In-memory database creation failed: ${memoryError.message}`);
          }
        }
        
        console.error('[MongoDB] Application cannot start without database. Exiting...');
        process.exit(1);
      }
    }
  }
};

module.exports = connectDB; 