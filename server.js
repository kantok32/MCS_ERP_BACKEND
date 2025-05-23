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

// Inicialización extendida con configuración de modelos
const initializeServer = async () => {
  try {
    // Conectar a la base de datos
    await connectDB();
    
    // Inicializar modelos llamando al método estático en el MODELO
    console.log('[Server] Initializing data models...');
    // await PricingOverride.initializeDefaults(); // REMOVE THIS LINE
    console.log('[Server] Models initialization complete.');
    
    // Configuración de Express
    const app = express();

    // Configuración de CORS
    const allowedOriginsEnv = process.env.CORS_ALLOWED_ORIGINS;
    const allowedOrigins = allowedOriginsEnv ? allowedOriginsEnv.split(',') : [
      'https://mcs-erp-frontend.web.app', // Frontend en Firebase Hosting
      'http://localhost:5173',            // Desarrollo local
    ];

    if (allowedOrigins.length > 0) {
      app.use(cors({
        origin: function (origin, callback) {
          // Permite solicitudes sin 'origin' (como mobile apps o curl requests) o si el origen está en la lista
          if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        }
      }));
    } else {
      // Si no se especifican orígenes, permitir todos (comportamiento por defecto de cors())
      // Considerar si esto es adecuado para producción o si se debe tener una lista por defecto más restrictiva.
      app.use(cors()); 
      console.warn('[Server] CORS está configurado para permitir todos los orígenes. Define CORS_ALLOWED_ORIGINS en tu .env para producción.');
    }

    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));
    
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
    
    // --- NUEVA RUTA RAIZ DE LA API para listar endpoints ---
    app.get('/api', (req, res) => {
      res.status(200).json({
        message: 'Bienvenido a la API de MCS ERP Backend',
        // Formato mejorado para listar los endpoints principales
        availableEndpointsOverview: {
          '/api/users': 'Gestión de usuarios (registro, login)',
          '/api/products': 'Gestión de productos (obtener, filtrar, opcionales, caché, etc.)',
          '/api/currency': 'Obtener valores de divisas (dólar, euro)',
          '/api/costo-perfiles': 'Gestión de perfiles de costo',
          '/api/langchain': 'Funcionalidades de Langchain (procesamiento de lenguaje, etc.)',
          '/api/calculo-historial': 'Historial de cálculos y operaciones guardadas',
          // Añadir aquí otros grupos de rutas principales según se agreguen
        },
        documentation: '[Considera añadir un enlace a la documentación detallada aquí si existe]', // Mantén o mejora este enlace
        note: 'Esta es una lista de los principales grupos de endpoints. Para detalles específicos (métodos GET, POST, PUT, DELETE, parámetros, etc.), por favor consulte la documentación completa de la API.'
      });
    });
    // -----------------------------------------------------
    
    // Inicializar caché
    console.log('[Server] Initializing cache...');
    await initializeCache();
    console.log('[Server] Cache initialization complete.');
    
    // Iniciar el servidor
    const PORT = process.env.PORT || port || 5001;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n---- Server running on 0.0.0.0:${PORT} ----`);
      console.log(`Backend API accessible at: http://localhost:${PORT}/api`);
      console.log(`Admin panel accessible at: http://localhost:5173/admin\n`);
    }).on('error', (err) => {
      console.error("[Server] Server startup error:", err);
      process.exit(1);
    });
  } catch (error) {
    console.error('[Server] Error during initialization:', error);
    process.exit(1);
  }
};

// Initialize cache on startup
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

// Iniciar el servidor
initializeServer();