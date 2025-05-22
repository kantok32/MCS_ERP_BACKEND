const { fetchFilteredProducts, fetchCurrencyValues } = require('../utils/fetchProducts');
const { fetchBaseProductsFromDB, createProductInDB, getProductByCodeFromDB, updateProductInDB, deleteProductFromDB } = require('../utils/mongoDataService');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');
const xlsx = require('xlsx');
const Producto = require('../models/Producto.js');
const asyncHandler = require('express-async-handler');

let cachedProducts = [];
let currencyCache = {
  dollar: {
    value: null,
    last_update: null,
    fecha: null
  },
  euro: {
    value: null,
    last_update: null,
    fecha: null
  }
};

// Modificar la ruta para apuntar al nuevo archivo en la carpeta data
const CACHE_FILE = path.join(__dirname, '../data/productsCache.json');

// Cargar cache desde disco al iniciar
if (fs.existsSync(CACHE_FILE)) {
  try {
    let data = fs.readFileSync(CACHE_FILE, 'utf-8');
    
    // Eliminar BOM (Byte Order Mark) si existe
    if (data.charCodeAt(0) === 0xFEFF) {
      data = data.substring(1);
      console.log('BOM detectado y eliminado del archivo JSON al iniciar');
    }
    
    // Otra forma de eliminar posibles caracteres problemáticos
    data = data.replace(/^\uFEFF/, '');
    data = data.trim();
    
    try {
      cachedProducts = JSON.parse(data);
      console.log(`Cache de productos cargado desde disco. ${cachedProducts.length} productos encontrados.`);
    } catch (parseError) {
      console.error(`Error al parsear JSON al iniciar: ${parseError.message}`);
      console.error(`Contenido problemático: "${data.substring(0, 50)}..."`);
      cachedProducts = [];
    }
  } catch (err) {
    console.error('Error al leer el cache de productos:', err);
    cachedProducts = [];
  }
}

// Función para actualizar automáticamente los valores de las divisas
const updateCurrencyValues = async () => {
  try {
    // fetchCurrencyValues devuelve un objeto
    const currencyData = await fetchCurrencyValues();
    
    // Verificar que el objeto y las propiedades existan
    if (currencyData && currencyData.Valor_Dolar !== undefined && currencyData.Valor_Euro !== undefined && currencyData.Fecha !== undefined) {
      // Acceder directamente a las propiedades del objeto
      currencyCache.dollar.value = currencyData.Valor_Dolar;
      currencyCache.euro.value = currencyData.Valor_Euro;
      currencyCache.dollar.fecha = currencyData.Fecha;
      currencyCache.euro.fecha = currencyData.Fecha;
      currencyCache.dollar.last_update = new Date().toISOString();
      currencyCache.euro.last_update = new Date().toISOString();
      
      console.log('Internal currency cache updated automatically at:', new Date().toISOString());
    } else {
       console.error('Invalid currency data received during automatic update:', currencyData);
    }
  } catch (error) {
    console.error('Error in automatic currency update:', error.message);
  }
};

// Configurar actualización automática cada 24 horas
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
setInterval(updateCurrencyValues, TWENTY_FOUR_HOURS);

// Ejecutar la primera actualización inmediatamente
updateCurrencyValues();

const saveCacheToDisk = () => {
  try {
    // Siempre escribir/sobrescribir el archivo de caché con el contenido actual de cachedProducts
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cachedProducts, null, 2), 'utf-8');
    console.log('Cache de productos guardado/actualizado en disco.');
  } catch (err) {
    console.error('Error al guardar el cache de productos:', err);
  }
};

// @desc    Fetch products from DB and cache them
// @route   GET /api/products/fetch
// @access  Public
const fetchProducts = async (req, res) => {
  try {
    const products = await fetchBaseProductsFromDB();
    
    cachedProducts = products; // Cache the products
    saveCacheToDisk();
    
    res.status(200).json({ 
      message: 'Products fetched from DB and cached successfully',
      count: products.length,
      products 
    });
  } catch (error) {
    console.error('Error in fetchProducts controller:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch and cache products' });
  }
};

// @desc    Get cached products
// @route   GET /api/products
// @access  Public
const getCachedProducts = (req, res) => {
  res.status(200).json(cachedProducts);
};

// @desc    Fetch filtered products from webhook
// @route   GET /api/products/filter
// @access  Public
const fetchFilteredProductsController = async (req, res) => {
  try {
    const { codigo, modelo, categoria } = req.query;
    const query = { codigo, modelo, categoria };
    const products = await fetchFilteredProducts(query);
    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Fetch currency values from webhook and cache them
// @route   GET /api/currency/fetch
// @access  Public
const fetchCurrencyValuesController = async (req, res) => {
  try {
    // fetchCurrencyValues ahora devuelve un objeto directamente
    const currencyData = await fetchCurrencyValues(); 
    
    // Verificar que el objeto y las propiedades existan
    if (currencyData && currencyData.Valor_Dolar !== undefined && currencyData.Valor_Euro !== undefined && currencyData.Fecha !== undefined) {
      // Acceder directamente a las propiedades del objeto
      currencyCache.dollar.value = currencyData.Valor_Dolar;
      currencyCache.euro.value = currencyData.Valor_Euro;
      currencyCache.dollar.fecha = currencyData.Fecha;
      currencyCache.euro.fecha = currencyData.Fecha;
      currencyCache.dollar.last_update = new Date().toISOString();
      currencyCache.euro.last_update = new Date().toISOString();

      res.status(200).json({ 
        message: 'Currency values fetched and cached successfully', 
        currencies: currencyCache 
      });
    } else {
      // Si el objeto o las propiedades faltan
      console.error('Invalid currency data received from fetchCurrencyValues:', currencyData);
      res.status(404).json({ message: 'Invalid or incomplete currency data received' });
    }
  } catch (error) {
    console.error('Error fetching currency values:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get cached dollar value
// @route   GET /api/currency/dollar
// @access  Public
const getCachedDollarValue = (req, res) => {
  if (currencyCache.dollar.value) {
    res.status(200).json({
      value: currencyCache.dollar.value,
      fecha: currencyCache.dollar.fecha,
      last_update: currencyCache.dollar.last_update
    });
  } else {
    res.status(404).json({ message: 'Dollar value not cached yet' });
  }
};

// @desc    Get cached euro value
// @route   GET /api/currency/euro
// @access  Public
const getCachedEuroValue = (req, res) => {
  if (currencyCache.euro.value) {
    res.status(200).json({
      value: currencyCache.euro.value,
      fecha: currencyCache.euro.fecha,
      last_update: currencyCache.euro.last_update
    });
  } else {
    res.status(404).json({ message: 'Euro value not cached yet' });
  }
};

// @desc    Get all products from cached memory (was getAllProductsAndCache)
// @route   GET /api/products/cache/all
// @access  Public
const getAllProductsAndCache = (req, res) => { // Ya no necesita ser async
  try {
    // Servir directamente desde el caché en memoria
    // El caché en memoria (cachedProducts) se actualiza al inicio y por /api/products/fetch o /reset
    const response = {
      success: true,
      data: {
        currencies: currencyCache, // currencyCache se actualiza por su propio mecanismo
        products: {
          total: cachedProducts.length,
          data: cachedProducts // Usar la variable cachedProducts
        }
      },
      timestamp: new Date().toISOString()
    };
    
    console.log(`Servido /api/products/cache/all con ${cachedProducts.length} productos desde caché en memoria.`);
    res.status(200).json(response);
  } catch (error) {
    console.error('Error en getAllProductsAndCache (sirviendo desde memoria):', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener todos los productos del caché de memoria',
      message: error.message
    });
  }
};

// @desc    Reset all cache and fetch fresh data
// @route   POST /api/products/cache/reset
// @access  Public
const resetCache = async (req, res) => {
  try {
    // Limpiar caché actual en memoria
    cachedProducts = [];
    currencyCache = {
      dollar: { value: null, last_update: null, fecha: null },
      euro: { value: null, last_update: null, fecha: null }
    };
    console.log('In-memory cache and currency cache cleared.');

    // Obtener nuevos datos de divisas
    try {
      const currencyData = await fetchCurrencyValues(); // fetchCurrencyValues devuelve un objeto
      if (currencyData && currencyData.Valor_Dolar !== undefined && currencyData.Valor_Euro !== undefined) {
        currencyCache.dollar.value = currencyData.Valor_Dolar;
        currencyCache.euro.value = currencyData.Valor_Euro;
        currencyCache.dollar.fecha = currencyData.Fecha || null; // Asegurar que fecha existe
        currencyCache.euro.fecha = currencyData.Fecha || null;   // Asegurar que fecha existe
        currencyCache.dollar.last_update = new Date().toISOString();
        currencyCache.euro.last_update = new Date().toISOString();
        console.log('Currency cache updated from source.');
      } else {
        console.warn('Could not update currency cache, source did not return expected data.');
      }
    } catch (currencyError) {
      console.error('Error fetching currency values during cache reset:', currencyError.message);
      // Continuar con el reseteo del caché de productos de todas formas
    }

    // Obtener nuevos datos de productos desde la DB
    const productsFromDB = await fetchBaseProductsFromDB(); // Esta función ya transforma los datos
    cachedProducts = productsFromDB; // Actualizar caché en memoria con datos frescos de la DB
    console.log(`Products cache updated from DB. Found ${cachedProducts.length} products.`);
    
    saveCacheToDisk();    // Guardar el nuevo caché (potencialmente vacío si la DB está vacía) en disco

    res.status(200).json({
      message: 'Cache reset successfully. Data reloaded from database.',
      cache: {
        currencies: currencyCache,
        products: {
          total: cachedProducts.length,
          data: cachedProducts
        }
      }
    });
  } catch (error) {
    // Si hay un error (ej. DB no accesible después de borrarla y antes de recargar)
    // Asegurar que el caché de productos se limpie.
    cachedProducts = []; // Limpiar caché en memoria
    console.error('Error during product fetch in cache reset. Product cache force-cleared. Error:', error.message);
    saveCacheToDisk(); // Intenta guardar el caché de productos vacío
    
    // Devolver un error, pero indicar que el caché de productos se limpió.
    // El caché de divisas podría o no haberse actualizado dependiendo de dónde ocurrió el error.
    res.status(500).json({ 
        message: `Error resetting product cache: ${error.message}. Product cache has been cleared. Currency cache status may vary.`,
        cache: {
            currencies: currencyCache, // Devuelve el estado actual del caché de divisas
            products: {
                total: cachedProducts.length,
                data: cachedProducts
            }
        }
    });
  }
};

// @desc    Clear all cache
// @route   DELETE /api/products/cache
// @access  Public
const clearCache = async (req, res) => {
  try {
    cachedProducts = [];
    currencyCache = {
      dollar: { value: null, last_update: null, fecha: null },
      euro: { value: null, last_update: null, fecha: null }
    };
    saveCacheToDisk();
    res.status(200).json({
      message: 'Cache cleared successfully',
      cache: {
        currencies: currencyCache,
        products: {
          total: 0,
          data: []
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get product detail from cache or webhook
// @route   GET /api/products/detail
// @access  Public
const getProductDetail = async (req, res) => {
  try {
    const { codigo, modelo, categoria } = req.query;

    if (!codigo) {
      return res.status(400).json({
        success: false,
        error: 'Parámetros inválidos',
        message: 'El código del producto es requerido'
      });
    }

    // Primero buscar en el caché
    const productsFromCache = cachedProducts;
    const productFromCache = productsFromCache.find(p => p.codigo_producto === codigo);

    if (productFromCache) {
      console.log(`Producto encontrado en caché: ${codigo}`);
      return res.status(200).json({
        success: true,
        data: {
          source: 'cache',
          product: productFromCache
        },
        timestamp: new Date().toISOString()
      });
    }

    // Si no está en caché, consultar al webhook
    console.log(`Producto no encontrado en caché, consultando webhook: ${codigo}`);
    const query = { codigo, modelo, categoria };
    const products = await fetchFilteredProducts(query);

    if (products && products.length > 0) {
      const product = products[0];
      return res.status(200).json({
        success: true,
        data: {
          source: 'webhook',
          product
        },
        timestamp: new Date().toISOString()
      });
    }

    return res.status(404).json({
      success: false,
      error: 'Producto no encontrado',
      message: `No se encontró el producto con código ${codigo}`
    });

  } catch (error) {
    console.error('Error al obtener detalle del producto:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener detalle del producto',
      message: error.message
    });
  }
};

// @desc    Get optional products based on new logic
// @route   GET /api/products/opcionales
// @access  Public
const getOptionalProducts = async (req, res) => {
  try {
    const { codigo: codigoPrincipal } = req.query;

    if (!codigoPrincipal) {
      return res.status(400).json({
        success: false,
        error: 'Parámetro inválido',
        message: 'Se requiere el código del producto principal (param: codigo)'
      });
    }

    const productoPrincipal = await Producto.findOne({ Codigo_Producto: codigoPrincipal }).lean();

    if (!productoPrincipal) {
      return res.status(404).json({
        success: false,
        error: 'No encontrado',
        message: `Producto principal con código ${codigoPrincipal} no encontrado.`
      });
    }

    // Validaciones de datos del producto principal
    if (!productoPrincipal.caracteristicas || !productoPrincipal.caracteristicas.modelo) {
        return res.status(400).json({
            success: false,
            error: 'Datos incompletos en producto principal',
            message: 'El producto principal no tiene "caracteristicas.modelo" definido.'
        });
    }
    if (!productoPrincipal.producto) { // Necesario para el nuevo filtro de tipo de chipeadora
        return res.status(400).json({
            success: false,
            error: 'Datos incompletos en producto principal',
            message: 'El producto principal no tiene el campo "producto" definido.'
        });
    }

    const modeloPrincipalString = productoPrincipal.caracteristicas.modelo.toLowerCase();
    const tipoChipeadoraPrincipal = productoPrincipal.producto.toLowerCase(); // Ej: "chipeadora motor", "chipeadora pto"

    // Paso 1: Búsqueda inicial de candidatos
    const candidatosOpcionales = await Producto.find({
      Codigo_Producto: { $ne: codigoPrincipal },
      $or: [
        { tipo: { $regex: /^opcional$/i } },
        { 'caracteristicas.nombre_del_producto': { $regex: 'opcional', $options: 'i' } }
      ]
    }).lean();

    console.log(`Encontrados ${candidatosOpcionales.length} productos candidatos iniciales (tipo:"opcional" o nombre contiene "opcional").`);

    // Paso 2 y 3: Filtrar por coincidencia de modelo Y tipo de chipeadora
    const opcionalesFiltrados = candidatosOpcionales.filter(opcional => {
      // Validaciones de datos del opcional
      if (!opcional.caracteristicas || !opcional.caracteristicas.modelo) {
        console.log(`Opcional ${opcional.Codigo_Producto} descartado por no tener caracteristicas.modelo.`);
        return false;
      }
      if (!opcional.producto) { // Necesario para el nuevo filtro
        console.log(`Opcional ${opcional.Codigo_Producto} descartado por no tener el campo "producto".`);
        return false;
      }

      const modeloOpcionalString = opcional.caracteristicas.modelo.toLowerCase();
      const tipoChipeadoraOpcional = opcional.producto.toLowerCase();

      // Condición de Modelo
      const coincideModelo = modeloPrincipalString.includes(modeloOpcionalString);
      if (!coincideModelo) {
        console.log(`Opcional ${opcional.Codigo_Producto} (${opcional.caracteristicas.nombre_del_producto || opcional.nombre_del_producto || 'Nombre no disponible'}) DESCARTADO. Modelo principal "${modeloPrincipalString}" no contiene modelo opcional "${modeloOpcionalString}".`);
        return false;
      }

      // NUEVA Condición: Tipo de Chipeadora (Motor vs PTO)
      const esPrincipalMotor = tipoChipeadoraPrincipal.includes("motor");
      const esPrincipalPTO = tipoChipeadoraPrincipal.includes("pto");
      
      const esOpcionalMotor = tipoChipeadoraOpcional.includes("motor");
      const esOpcionalPTO = tipoChipeadoraOpcional.includes("pto");

      let coincideTipoChipeadora;

      if (esPrincipalMotor) { // Principal es de tipo MOTOR
        coincideTipoChipeadora = esOpcionalMotor && !esOpcionalPTO; // Opcional debe ser MOTOR y no PTO
      } else if (esPrincipalPTO) { // Principal es de tipo PTO
        coincideTipoChipeadora = esOpcionalPTO && !esOpcionalMotor; // Opcional debe ser PTO y no MOTOR
      } else { 
        // Principal NO es ni MOTOR ni PTO (es genérico o un tipo diferente)
        // En este caso, el opcional TAMPOCO debe ser MOTOR ni PTO para ser compatible
        coincideTipoChipeadora = !esOpcionalMotor && !esOpcionalPTO;
      }

      if (!coincideTipoChipeadora) {
        console.log(`Opcional ${opcional.Codigo_Producto} (${opcional.caracteristicas.nombre_del_producto || opcional.nombre_del_producto || 'Nombre no disponible'}) DESCARTADO. Tipo de chipeadora no coincide. Principal: "${tipoChipeadoraPrincipal}", Opcional: "${tipoChipeadoraOpcional}".`);
        return false;
      }
      
      console.log(`Opcional ${opcional.Codigo_Producto} (${opcional.caracteristicas.nombre_del_producto || opcional.nombre_del_producto || 'Nombre no disponible'}) COINCIDE POR MODELO Y TIPO DE CHIPEADORA.`);
      return true;
    });

    console.log(`Encontrados ${opcionalesFiltrados.length} opcionales filtrados finales.`);

    const opcionalesParaFrontend = opcionalesFiltrados.map(op => {
      const mapped = {
        ...op,
        codigo_producto: op.Codigo_Producto,
        nombre_del_producto: op.caracteristicas?.nombre_del_producto || op.nombre_del_producto,
        Descripcion: op.caracteristicas?.descripcion || op.descripcion || op.Descripcion,
        Modelo: op.caracteristicas?.modelo || op.modelo || op.Modelo,
      };
      if (op.hasOwnProperty('Codigo_Producto') && mapped.codigo_producto !== undefined) {
        delete mapped.Codigo_Producto;
      }
      return mapped;
    });

    res.status(200).json({
      success: true,
      data: {
        total: opcionalesParaFrontend.length,
        products: opcionalesParaFrontend
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error al obtener productos opcionales (lógica con tipo de chipeadora):', error);
    return res.status(500).json({
      success: false,
      error: 'Error al obtener productos opcionales (lógica con tipo de chipeadora)',
      message: (error instanceof Error) ? error.message : String(error),
    });
  }
};

// @desc    Get raw optional products (containing "opcional" in name)
// @route   GET /api/products/opcionales/raw
// @access  Public
const getRawOptionalProducts = async (req, res) => {
  try {
    const { codigoPrincipal } = req.query; // Opcional, para excluir el producto principal si se proporciona su código

    const findQuery = {
      'caracteristicas.nombre_del_producto': { $regex: 'opcional', $options: 'i' }
    };

    if (codigoPrincipal) {
      findQuery.Codigo_Producto = { $ne: codigoPrincipal };
    }

    const rawOpcionales = await Producto.find(findQuery).lean();

    // Mapeo similar al de getOptionalProducts para mantener consistencia si es necesario
    const opcionalesParaFrontend = rawOpcionales.map(op => {
      const mapped = {
        ...op,
        codigo_producto: op.Codigo_Producto,
        nombre_del_producto: op.caracteristicas?.nombre_del_producto,
        Descripcion: op.caracteristicas?.descripcion || op.descripcion || op.Descripcion,
        Modelo: op.caracteristicas?.modelo || op.modelo || op.Modelo,
      };
      if (op.hasOwnProperty('Codigo_Producto') && mapped.codigo_producto !== undefined) {
        delete mapped.Codigo_Producto;
      }
      return mapped;
    });

    res.status(200).json({
      success: true,
      data: {
        total: opcionalesParaFrontend.length,
        products: opcionalesParaFrontend
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error al obtener productos opcionales sin procesar:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al obtener productos opcionales sin procesar',
      message: (error instanceof Error) ? error.message : String(error),
    });
  }
};

// @desc    Create a new product
// @route   POST /api/products
// @access  Public (o Private si implementas autenticación)
const createProductController = async (req, res) => {
  try {
    const productData = req.body;

    // --- Validación (existente, la mantenemos) --- 
    const requiredFields = {
      topLevel: [
        'Codigo_Producto', 'categoria', 'peso_kg', 'clasificacion_easysystems',
        'codigo_ea', 'proveedor', 'procedencia'
      ],
      caracteristicas: ['nombre_del_producto', 'modelo'],
      dimensiones: ['largo_cm', 'ancho_cm', 'alto_cm']
    };
    for (const field of requiredFields.topLevel) {
      if (productData[field] === undefined || productData[field] === null || productData[field] === '') {
        return res.status(400).json({ message: `El campo ${field} es requerido`, field });
      }
    }
    if (!productData.caracteristicas) {
      return res.status(400).json({ message: 'El objeto caracteristicas es requerido', field: 'caracteristicas' });
    }
    for (const field of requiredFields.caracteristicas) {
      if (productData.caracteristicas[field] === undefined || productData.caracteristicas[field] === null || productData.caracteristicas[field] === '') {
        return res.status(400).json({ message: `El campo caracteristicas.${field} es requerido`, field: `caracteristicas.${field}` });
      }
    }
    if (!productData.dimensiones) {
      return res.status(400).json({ message: 'El objeto dimensiones es requerido', field: 'dimensiones' });
    }
    for (const field of requiredFields.dimensiones) {
      if (productData.dimensiones[field] === undefined || productData.dimensiones[field] === null || productData.dimensiones[field] === '') {
        return res.status(400).json({ message: `El campo dimensiones.${field} es requerido`, field: `dimensiones.${field}` });
      }
    }
    const numericFields = {
        topLevel: ['peso_kg'],
        dimensiones: ['largo_cm', 'ancho_cm', 'alto_cm']
    };
    for (const field of numericFields.topLevel) {
        if (productData[field] === undefined || isNaN(Number(productData[field]))) {
            return res.status(400).json({ message: `El campo ${field} debe ser un número válido`, field });
        }
    }
    if (productData.dimensiones) { 
        for (const field of numericFields.dimensiones) {
            if (productData.dimensiones[field] === undefined || isNaN(Number(productData.dimensiones[field]))) {
                return res.status(400).json({ message: `El campo dimensiones.${field} debe ser un número válido`, field: `dimensiones.${field}` });
            }
        }
    }
    // --- Fin Validación --- 

    console.log('[INFO] Validation passed for creating product with Codigo_Producto:', productData.Codigo_Producto);
    
    const newProduct = await createProductInDB(productData);

    // Actualizar caché después de crear un nuevo producto
    // Podríamos simplemente añadir el nuevo producto al caché en memoria y al de disco,
    // o recargar todo el caché desde la DB para asegurar consistencia total.
    // Recargar todo es más simple de implementar ahora.
    console.log('Product created, attempting to refresh cache...');
    const productsFromDB = await fetchBaseProductsFromDB(); // Esta función ya transforma los datos
    cachedProducts = productsFromDB;
    saveCacheToDisk();
    console.log('Cache refreshed after product creation.');

    res.status(201).json({
      message: 'Producto creado exitosamente y caché actualizado.',
      data: newProduct // Devolver el producto completo insertado en la DB
    });

  } catch (error) {
    console.error('[ERROR] Error creating product:', error);
    // Si el error es por duplicado, el mensaje de createProductInDB será útil
    if (error.message && error.message.includes('ya existe')) {
        return res.status(409).json({ message: error.message }); // 409 Conflict
    }
    res.status(500).json({ 
      message: 'Error al crear el producto.',
      error: error.message 
    });
  }
};

// --- Función para inicializar el caché de productos al inicio de la aplicación ---
async function initializeProductCache() {
  try {
    console.log('Inicializando caché de productos desde DB al arrancar la aplicación...');
    const productsFromDB = await fetchBaseProductsFromDB();
    cachedProducts = productsFromDB; // Actualizar caché en memoria
    saveCacheToDisk(); // Guardar en archivo (saveCacheToDisk ya sobrescribe)
    console.log(`Caché de productos inicializado con ${cachedProducts.length} productos y guardado en disco.`);
  } catch (error) {
    console.error('Error fatal al inicializar el caché de productos desde DB:', error);
    // Considerar si la aplicación debe continuar si el caché no se puede cargar.
    // Por ahora, la aplicación continuará con un caché vacío si esto falla.
    cachedProducts = []; 
    // No intentar guardar un caché vacío si la carga inicial falló, para no borrar un archivo bueno.
  }
}

// Llamar a la inicialización del caché cuando este módulo se carga por primera vez.
// Esto asegura que se intente poblar el caché tan pronto como el controlador esté listo.
initializeProductCache();

// --- NUEVO: Handler para el endpoint de prueba de DB ---
const testGetBaseProductsFromDBController = async (req, res) => {
  try {
    console.log('[Controller Test] Attempting to fetch base products directly from DB for testing...');
    const products = await fetchBaseProductsFromDB();
    res.status(200).json({
      message: 'Test successful: Fetched base products directly from DB',
      count: products.length,
      products: products
    });
  } catch (error) {
    console.error('[Controller Test] Error fetching base products from DB for testing:', error);
    res.status(500).json({
      message: 'Test failed: Error fetching base products from DB',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// @desc    Get product by code
// @route   GET /api/products/:codigo
// @access  Public
const getProductByCode = asyncHandler(async (req, res) => {
    const { codigo } = req.params;
    
    if (!codigo) {
        return res.status(400).json({ 
            success: false,
            message: "El código del producto es requerido" 
        });
    }

    const product = await Producto.findOne({ Codigo_Producto: codigo });
    
    if (!product) {
        return res.status(404).json({ 
            success: false,
            message: `Producto con código ${codigo} no encontrado` 
        });
    }

    res.status(200).json({
        success: true,
        data: product
    });
});

// @desc    Update a product (e.g., mark as descontinuado)
// @route   PUT /api/products/:id (or /api/products/bycode/:codigo if preferred)
// @access  Private/Admin
const updateProduct = asyncHandler(async (req, res) => {
    const { codigoProducto } = req.params;
    const updateData = req.body;

    if (!codigoProducto) {
      return res.status(400).json({ message: 'El parámetro codigoProducto es requerido.' });
    }
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'El cuerpo de la solicitud (updateData) no puede estar vacío.' });
    }

    // Opcional: Validación más exhaustiva de updateData aquí si es necesario
    // Por ejemplo, verificar que no se intenten pasar campos no permitidos o formatos incorrectos.

    console.log(`[Controller] Attempting to update product with Codigo_Producto: ${codigoProducto}`);
    const updatedProduct = await updateProductInDB(codigoProducto, updateData);

    if (!updatedProduct) {
      return res.status(404).json({ message: `Producto con Codigo_Producto ${codigoProducto} no encontrado para actualizar.` });
    }

    // Actualizar caché después de la modificación
    console.log('Product updated, attempting to refresh cache...');
    const productsFromDB = await fetchBaseProductsFromDB();
    cachedProducts = productsFromDB;
    saveCacheToDisk();
    console.log('Cache refreshed after product update.');

    res.status(200).json({
      message: 'Producto actualizado exitosamente y caché refrescado.',
      data: updatedProduct
    });
});

// @desc    Get distinct categories
// @route   GET /api/products/categories
// @access  Public
const getCategories = asyncHandler(async (req, res) => {
  // ... existing getCategories code ...
});

// @desc    Toggle the discontinued status of a product
// @route   PUT /api/products/code/:codigoProducto/toggle-discontinued
// @access  Private/Admin (assumed)
const toggleProductDiscontinuedStatus = asyncHandler(async (req, res) => {
  const { codigoProducto } = req.params;

  if (!codigoProducto) {
    res.status(400);
    throw new Error('El parámetro codigoProducto es requerido.');
  }

  const product = await Producto.findOne({ Codigo_Producto: codigoProducto });

  if (!product) {
    res.status(404);
    throw new Error(`Producto con Codigo_Producto ${codigoProducto} no encontrado.`);
  }

  const newDiscontinuedStatus = !product.descontinuado;

  const updatedProduct = await updateProductInDB(codigoProducto, { descontinuado: newDiscontinuedStatus });

  if (!updatedProduct) {
    // This case might indicate an issue with updateProductInDB or the product disappeared
    res.status(404); // Or 500 if updateProductInDB should always find it after the above check
    throw new Error(`Producto con Codigo_Producto ${codigoProducto} no encontrado durante la actualización o la actualización falló.`);
  }
  
  // Ensure the returned product from updateProductInDB reflects the change for the response
  // If updateProductInDB returns the product *before* update, we might need to re-fetch or merge
  // For now, assume updateProductInDB returns the updated document or enough info.
  // Best practice would be for updateProductInDB to return the complete updated document.

  console.log(`Product ${codigoProducto} discontinued status toggled to ${newDiscontinuedStatus}. Attempting to refresh cache...`);
  const productsFromDB = await fetchBaseProductsFromDB();
  cachedProducts = productsFromDB;
  saveCacheToDisk();
  console.log('Cache refreshed after toggling product discontinued status.');

  res.status(200).json({
    message: `Estado descontinuado del producto ${codigoProducto} cambiado a ${newDiscontinuedStatus}. Caché refrescado.`,
    data: updatedProduct // Send back the updated product (or at least its new status)
  });
});

// @desc    Get optional products from body
// @route   POST /api/products/opcionales-by-body
// @access  Public
const getOptionalProductsFromBody = async (req, res) => {
  try {
    const { codigo } = req.body;

    if (!codigo) {
      return res.status(400).json({
        success: false,
        error: 'Parámetro inválido',
        message: 'Se requiere el código del producto principal en el body'
      });
    }

    console.log(`[opcionales-by-body] Buscando producto principal con código: ${codigo}`);

    // Si el caché está vacío, intentar inicializarlo
    if (cachedProducts.length === 0) {
      console.log('[opcionales-by-body] Cache vacío, intentando inicializar...');
      await initializeProductCache();
    }

    // Buscar el producto principal en el caché
    const productoPrincipal = cachedProducts.find(p => p.Codigo_Producto === codigo);

    if (!productoPrincipal) {
      return res.status(404).json({
        success: false,
        error: 'No encontrado',
        message: `Producto principal con código ${codigo} no encontrado en el caché.`
      });
    }

    // Filtrar los productos opcionales del caché
    const productosOpcionales = cachedProducts.filter(producto => {
      // Verificar que no sea el mismo producto
      if (producto.Codigo_Producto === codigo) {
        return false;
      }

      // Verificar que sea un producto opcional
      const esOpcional = producto.tipo === "opcional" || 
                        (producto.nombre_comercial && producto.nombre_comercial.toLowerCase().includes("opcional")) ||
                        producto.es_opcional === true;

      // Verificar que tenga modelo
      const tieneModelo = producto.caracteristicas && producto.caracteristicas.modelo;

      // Verificar que coincida el tipo de producto (PTO/Motor)
      const coincideTipo = producto.producto && 
                          productoPrincipal.producto && 
                          producto.producto.toLowerCase() === productoPrincipal.producto.toLowerCase();

      return esOpcional && tieneModelo && coincideTipo;
    });

    console.log(`[opcionales-by-body] Encontrados ${productosOpcionales.length} productos opcionales para el producto ${codigo}`);

    res.status(200).json({
      success: true,
      data: {
        productoPrincipal,
        productosOpcionales
      }
    });

  } catch (error) {
    console.error('Error al obtener productos opcionales desde body:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al obtener productos opcionales',
      message: error.message
    });
  }
};

// @desc    Get technical specifications of a product
// @route   GET /api/products/:codigo/specifications
// @access  Public
const getProductSpecifications = asyncHandler(async (req, res) => {
    const { codigo } = req.params;
    if (!codigo) {
        return res.status(400).json({
            success: false,
            message: 'El código del producto es requerido'
        });
    }
    const product = await Producto.findOne({ Codigo_Producto: codigo });
    if (!product) {
        return res.status(404).json({
            success: false,
            message: `Producto con código ${codigo} no encontrado`
        });
    }
    // Extract technical specifications (customize as needed)
    const specs = {
        codigo_producto: product.Codigo_Producto,
        nombre_del_producto: product.caracteristicas?.nombre_del_producto || product.nombre_del_producto,
        modelo: product.caracteristicas?.modelo || product.modelo,
        especificaciones_tecnicas: product.especificaciones_tecnicas || {},
        descontinuado: product.descontinuado || false
    };
    res.status(200).json({
        success: true,
        data: specs
    });
});

// @desc    Upload bulk products from a plain Excel template
// @route   POST /api/products/upload-plain
// @access  Private/Admin (assuming)
const uploadBulkProductsPlain = async (req, res) => {
    console.log('[Bulk Upload Plain] Request received.');

    if (!req.file) {
        return res.status(400).json({ message: 'No se subió ningún archivo.' });
    }

    console.log(`[Bulk Upload Plain] Processing file: ${req.file.originalname}, size: ${req.file.size} bytes`);

    // --- Placeholder Logic ---
    // TODO: Implement the actual logic to read the plain Excel file,
    // parse the data, validate it, and save/update products in the database.
    // You can use 'xlsx' library here to read req.file.buffer.
    // Remember to handle potential errors during file processing and DB operations.
    // --- End Placeholder Logic ---

    // For now, just confirm the request was received and file is available
    res.status(200).json({
        message: 'Endpoint /api/products/upload-plain reached successfully.',
        file: {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size
        },
        note: 'Logic for processing the Excel file needs to be implemented.'
    });
};

module.exports = { 
  fetchProducts, 
  getCachedProducts, 
  fetchFilteredProductsController, 
  fetchCurrencyValuesController, 
  getCachedDollarValue, 
  getCachedEuroValue,
  getAllProductsAndCache, 
  resetCache,
  clearCache,
  getProductDetail,
  getOptionalProducts,
  getRawOptionalProducts,
  createProductController,
  getProductByCode,
  updateProduct,
  testGetBaseProductsFromDBController,
  getCategories,
  toggleProductDiscontinuedStatus,
  getOptionalProductsFromBody,
  getProductSpecifications,
  uploadBulkProductsPlain
};