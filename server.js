const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
// const pricingOverridesRoutes = require('./routes/pricingOverridesRoutes');
// Importar la ruta correcta para perfiles
// const perfilesRoutes = require('./routes/perfilesRoutes.js');
// Importar la nueva ruta para perfiles de costo
const costoPerfilRoutes = require('./routes/costoPerfilRoutes');
// Eliminar imports de rutas obsoletas
// const overridesRoutes = require('./routes/overridesRoutes');
// const categoryOverridesRoutes = require('./routes/categoryOverridesRoutes');
// const perfilRoutes = require('./routes/perfilRoutes'); 
// const pricingOverridesRoutes = require('./routes/pricingOverridesRoutes'); // Ya estaba comentado
// Importar las nuevas rutas de Langchain
const langchainRoutes = require('./routes/langchainRoutes');
// Importar webhookRoutes si se usa
// const webhookRoutes = require('./routes/webhookRoutes'); // <-- Comentar ya que no existe
const { fetchCurrencyValuesController, fetchProducts } = require('./controllers/productController');
const { port } = require('./config/env');
// const PricingOverride = require('./models/PricingOverride'); // REMOVE THIS LINE
const { errorHandler, notFound } = require('./middleware/errorMiddleware');
const calculoHistorialRoutes = require('./routes/calculoHistorialRoutes');
const currencyRoutes = require('./routes/currencyRoutes');

dotenv.config();

// Imprimir un mensaje de inicio para informar al usuario del proceso
console.log('\n========== INICIANDO SERVIDOR BACKEND ==========');
console.log('Por favor espere mientras se preparan las bases de datos y modelos...');
console.log('Esto podría tardar unos segundos...');
console.log('================================================\n');

// Configuración de Express
const app = express();

// Configuración básica de CORS para permitir cualquier origen
app.use(cors());

// Middleware para parsear JSON y URL-encoded
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Ruta de health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Ruta raíz
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Server is running' });
});

console.log('[Server] Registering routes...');
// Configuración de rutas
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/currency', currencyRoutes);
// Usar la ruta correcta para perfiles
// app.use('/api/perfiles', perfilesRoutes);
// Registrar la nueva ruta para perfiles de costo
app.use('/api/costo-perfiles', costoPerfilRoutes);
// Eliminar uso de rutas obsoletas
// app.use('/api/overrides', overridesRoutes);
// app.use('/api/category-overrides', categoryOverridesRoutes);
// app.use('/api', costosRoutes); // REMOVE THIS LINE
// Registrar las nuevas rutas de Langchain
app.use('/api/langchain', langchainRoutes);
app.use('/api/calculo-historial', calculoHistorialRoutes);
// app.use('/api/webhook', webhookRoutes); // <-- Comentar ya que no existe

// Ruta raíz de la API
app.get('/api', (req, res) => {
  res.status(200).json({
    message: 'Bienvenido a la API de MCS ERP Backend',
    availableEndpointsOverview: {
      '/api/users': 'Gestión de usuarios',
      '/api/products': 'Gestión de productos',
      '/api/currency': 'Valores de divisas',
      '/api/costo-perfiles': 'Perfiles de costo',
      '/api/langchain': 'Funcionalidades Langchain',
      '/api/calculo-historial': 'Historial de cálculos'
    }
  });
});

// Middleware de manejo de errores global
app.use((err, req, res, next) => {
  console.error('[Server] Error:', err);
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(err.status || 500).json({ 
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Iniciar el servidor
const PORT = process.env.PORT || 5001;
console.log(`Server running on port ${PORT}`);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n---- Server running on 0.0.0.0:${PORT} ----`);
  console.log(`Backend API accessible at: http://localhost:${PORT}/api`);
});

// Manejo de errores del servidor
server.on('error', (err) => {
  console.error("[Server] Server startup error:", err);
  process.exit(1);
});

// Manejo de señales de terminación
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

// Inicialización asíncrona
const initialize = async () => {
  try {
    console.log('[Server] Starting initialization...');
    
    // Conectar a la base de datos
    console.log('[Server] Connecting to database...');
    await connectDB();
    console.log('[Server] Database connected successfully');

    // Inicializar caché
    console.log('[Server] Initializing cache...');
    await initializeCache();
    console.log('[Server] Cache initialization complete');

  } catch (error) {
    console.error('[Server] Error during initialization:', error);
    process.exit(1);
  }
};

// Función para inicializar caché
const initializeCache = async () => {
  try {
    // Inicializar caché de divisas
    await fetchCurrencyValuesController(
      { }, // req mock
      {   // res mock
        status: (code) => ({
          json: (data) => {
            console.log('Currency cache initialized with:', data);
          }
        })
      }
    );

    // Inicializar caché de productos
    await fetchProducts(
      { }, // req mock
      {   // res mock
        status: (code) => ({
          json: (data) => {
            console.log('Products cache initialized with:', data);
          }
        })
      }
    );
    
    console.log('Cache initialized successfully');
  } catch (error) {
    console.error('Failed to initialize cache:', error.message);
  }
};

// Iniciar la inicialización
initialize();