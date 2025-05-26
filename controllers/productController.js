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

// Helper function to get value from cell, handling potential nulls and converting to string
const getSafeCellValue = (row, header, defaultValue = null) => {
    const value = row[header];
    if (value === undefined || value === null) {
        return defaultValue;
    }
    if (typeof value === 'number') return value;
    return String(value).trim();
};

// Helper to parse numbers, handling potential units like [kg], [m], [mm], [L], [HP], [m³/hr], [dB]
const parseNumberValue = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const strValue = String(value).replace(/,/g, '.').replace(/[^0-9.-]/g, '');
    const number = parseFloat(strValue);
    return isNaN(number) ? null : number;
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

// @desc    Fetch a single product by its Codigo_Producto
// @route   GET /api/products/:codigo or /api/products/code/:codigoProducto
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
  // For now, assume updateProductInDB returns the complete updated document.
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

// @desc    Calculates a test cost based on provided data and a simulated profile
// @route   POST /api/costo-perfiles/calcular-prueba-costo
// @access  Public
const calculatePruebaCosto = async (req, res) => {
    // ... implementation ...
};

// @desc    Calculates product cost based on a specified profile
// @route   POST /api/costo-perfiles/calcular-producto
// @access  Public
const calculateCostoProductoFromProfile = async (req, res) => {
    // ... implementation ...
};

// @desc    Upload bulk products from a matrix template (original bulk upload)
// @route   POST /api/products/upload-matrix (assuming a route exists or will exist)
// @access  Private/Admin (assuming)
const uploadBulkProductsMatrix = async (req, res) => {
    // ... implementation ...
};

// @desc    Upload bulk products from a plain template
// @route   POST /api/products/upload-plain
// @access  Private/Admin (assuming)
const uploadBulkProductsPlain = async (req, res) => {
    console.log('[Bulk Upload Plain] Request received for plain template upload.');
    
    // Verificar si se subió un archivo
    if (!req.file) {
        return res.status(400).json({ 
            success: false, 
            message: 'No se subió ningún archivo.' 
        });
    }

    console.log(`[Bulk Upload Plain] Processing file: ${req.file.originalname}, size: ${req.file.size} bytes`);

    try {
        // Verificar que el archivo sea un Excel válido
        if (!req.file.mimetype.includes('excel') && !req.file.mimetype.includes('spreadsheet')) {
            return res.status(400).json({ 
                success: false, 
                message: 'El archivo debe ser un archivo Excel válido.' 
            });
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });

        // Asumir que los datos están en la primera hoja
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convertir la hoja a un array de arrays usando la función correcta
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null });

        if (data.length < 2) {
            return res.status(400).json({ 
                success: false, 
                message: 'El archivo debe contener al menos una fila de encabezados y una fila de datos.' 
            });
        }

        // Definir mapeo de encabezados flexibles a nombres de campo del backend
        const headerMap = {
            'codigo_producto': 'Codigo_Producto',
            'codigo producto': 'Codigo_Producto',
            'nombre_del_producto': 'nombre_del_producto',
            'nombre del producto': 'nombre_del_producto',
            'nombre_producto': 'nombre_del_producto',
            'nombre producto': 'nombre_del_producto',
            'descripcion': 'descripcion',
            'modelo': 'modelo',
            'categoria': 'categoria',
            'equipo u opcional': 'tipo', // Mapeamos 'equipo u opcional' a 'tipo'
            'producto': 'producto',     // Para distinguir motor/pto, etc.
            'fecha_cotizacion': 'fecha_cotizacion',
            'costo_fabrica': 'costo_fabrica',
            'costo fabrica': 'costo_fabrica',
            'largo_m': 'largo_m', // Mantengo nombres como en la imagen por ahora
            'ancho_mm': 'ancho_mm',
            'alto_mm': 'alto_mm',
            'peso_kg': 'peso_kg',
            'linea_de_producto': 'linea_de_producto',
            'marca': 'marca',
            'marca_motor': 'marca_motor',
            'combustible': 'combustible',
            'hp': 'hp',
            'diametro_mm': 'diametro_mm',
            'movilidad': 'movilidad',
            'rotacion': 'rotacion',
            'opcional': 'opcional', // Si hay una columna explícita 'opcional'
            'modelo_compatible_manual': 'modelo_compatible_manual',
            'clasificacion_easysystems': 'clasificacion_easysystems',
            'numero_caracteres': 'numero_caracteres',
            'codigo_ea': 'codigo_ea',
            'proveedor': 'proveedor',
            'procedencia': 'procedencia',
            'familia': 'familia',
            'nombre_comercial': 'nombre_comercial',
            'elemento_corte': 'elemento_corte',
            'garganta_alimentacion_mm': 'garganta_alimentacion_mm',
            'tipo_motor': 'tipo_motor',
            'potencia_motor_kw_hp': 'potencia_motor_kw_hp',
            'tipo_enganche': 'tipo_enganche',
            'tipo_chasis': 'tipo_chasis',
            'capacidad_chasis_velocidad': 'capacidad_chasis_velocidad',
            'ultima_actualizacion': 'ultima_actualizacion',
            // Agregar otros mapeos según sea necesario basándose en la plantilla real
        };

        // Función para estandarizar el nombre de un encabezado
        const standardizeHeader = (header) => {
            if (header === null || header === undefined) return '';
            return String(header).trim().toLowerCase().replace(/\s+/g, '_');
        };

        // Extraer y estandarizar encabezados (primera fila)
        const rawHeaders = data[0];
        const headers = rawHeaders.map(standardizeHeader);

        // Mapear los encabezados del archivo a los nombres de campo del backend
        const mappedHeaders = headers.map(header => headerMap[header] || null); // Usa null si no se encuentra mapeo
        const originalHeadersMap = {}; // Para referencia si es necesario depurar
        headers.forEach((stdHeader, index) => { originalHeadersMap[stdHeader] = rawHeaders[index]; });

        // Validar que los encabezados requeridos (usando los nombres del backend) estén presentes después del mapeo
        // NOTA: Es importante que los nombres en requiredBackendFields coincidan con las CLAVES de headerMap.
        const requiredBackendFields = ['Codigo_Producto', 'nombre_del_producto', 'modelo', 'categoria'];
        
        const presentBackendFields = mappedHeaders.filter(mappedName => mappedName !== null); // Campos que sí pudimos mapear

        const missingRequiredHeaders = requiredBackendFields.filter(requiredField => 
             !presentBackendFields.includes(requiredField) // Verificar si el campo requerido está entre los mapeados presentes
        );

        if (missingRequiredHeaders.length > 0) {
             // Opcional: dar más detalle, como los encabezados originales encontrados
            console.error('Headers found in file (standardized):', headers);
            console.error('Mapped backend fields found:', presentBackendFields);
            return res.status(400).json({ 
                success: false, 
                message: `Faltan campos requeridos (después del mapeo de encabezados): ${missingRequiredHeaders.join(', ')}. Encabezados presentes: ${presentBackendFields.join(', ')}.`, 
                missingFields: missingRequiredHeaders,
                presentFields: presentBackendFields
            });
        }

        // Procesar filas de datos
        const results = [];
        let hasErrors = false;

        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;

            // Crear objeto de producto desde la fila, usando los encabezados mapeados
            const productData = {};
            mappedHeaders.forEach((backendField, index) => {
                // Solo incluimos si mapeó a un campo de backend válido (no null) y la celda tiene un valor (no undefined/null)
                 if (backendField !== null && row[index] !== undefined && row[index] !== null) {
                    productData[backendField] = row[index];
                } else if (backendField !== null && (row[index] === undefined || row[index] === null)) {
                    // Si el campo mapeó pero la celda está vacía, la incluimos con null o undefined
                     productData[backendField] = null; // O undefined, dependiendo de preferencia
                 }
                 // Si backendField es null, ignoramos esta columna ya que no la mapeamos
            });

            try {
                // Validar datos requeridos nuevamente (ahora usando los campos estandarizados en productData)
                for(const requiredField of requiredBackendFields) {
                    if (productData[requiredField] === undefined || productData[requiredField] === null || String(productData[requiredField]).trim() === ''){
                         throw new Error(`Campo requerido vacío o inválido: ${requiredField}`);
                    }
                }

                // Crear producto en la base de datos
                // Es posible que necesites ajustar createProductInDB si espera una estructura anidada (ej. dimensiones)
                // Pero por ahora, asumo que puede manejar campos aplanados o que la plantilla plana no tiene dimensiones anidadas.
                const newProduct = await createProductInDB(productData);

                results.push({ 
                    code: productData.Codigo_Producto, 
                    status: 'success', 
                    message: 'Producto creado exitosamente.' 
                });
            } catch (error) {
                hasErrors = true;
                // Incluir el código del producto si está disponible
                const productCode = productData ? productData.Codigo_Producto || 'N/A' : 'N/A';
                console.error(`Error processing row for product ${productCode}:`, error.message);
                results.push({ 
                    code: productCode, 
                    status: 'error', 
                    message: `Error al procesar: ${error.message}` 
                });
            }
        }

        // Refrescar el caché global después de procesar todos los productos
        try {
            await initializeProductCache();
            console.log('Cache refreshed after bulk plain upload.');
        } catch (cacheError) {
            console.error('Error refreshing cache after bulk upload:', cacheError);
            // No consideramos esto un error fatal
        }

        // Enviar respuesta resumen
        const status = hasErrors ? 207 : 200;
        res.status(status).json({ 
            success: true, 
            message: 'Procesamiento de archivo completado.', 
            results 
        });

    } catch (error) {
        console.error('Error processing plain template file:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor al procesar el archivo.', 
            error: error.message 
        });
    }
};

// @desc    Upload technical specifications from a matrix template
// @route   POST /api/products/upload-specifications
// @access  Private/Admin (assuming)
const uploadTechnicalSpecifications = async (req, res) => {
    console.log('[Bulk Upload Specs] Request received for technical specifications update.');
    
    // Verificar si se subió un archivo
    if (!req.file) {
        return res.status(400).json({ 
            success: false, 
            message: 'No se subió ningún archivo.' 
        });
    }

    console.log(`[Bulk Upload Specs] Processing file: ${req.file.originalname}, size: ${req.file.size} bytes`);

    try {
        // Verificar que el archivo sea un Excel válido
        if (!req.file.mimetype.includes('excel') && !req.file.mimetype.includes('spreadsheet')) {
            return res.status(400).json({ 
                success: false, 
                message: 'El archivo debe ser un archivo Excel válido.' 
            });
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });

        // Asumir que los datos están en la primera hoja
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convertir la hoja a un array de arrays usando la función correcta
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null });

        if (data.length < 2 || data[0].length < 2) {
            return res.status(400).json({ 
                success: false, 
                message: 'El archivo no tiene el formato esperado (mínimo 2 filas y 2 columnas).' 
            });
        }

        // Extraer códigos de producto (Fila 1, desde Columna B en adelante)
        const productCodesRow = data[0];
        const productCodes = productCodesRow.slice(1).filter(code => code !== undefined && code !== null && String(code).trim() !== '');

        if (productCodes.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'No se encontraron códigos de producto válidos en la primera fila.' 
            });
        }

        // Extraer nombres de especificaciones (Columna A, desde Fila 2 en adelante)
        const specNamesColumn = data.slice(1).map(row => row[0]);
        const specNames = specNamesColumn.filter(name => name !== undefined && name !== null && String(name).trim() !== '');

        if (specNames.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'No se encontraron nombres de especificaciones válidos en la primera columna (desde la segunda fila).' 
            });
        }

        console.log(`Found ${productCodes.length} product codes and ${specNames.length} specification names.`);

        const results = [];
        let hasErrors = false;

        // Procesar cada producto
        for (let i = 0; i < productCodes.length; i++) {
            const productCode = String(productCodes[i]).trim();
            const productDataColumnIndex = i + 1;

            // Extraer especificaciones técnicas para el producto actual
            const technicalSpecifications = {};
            for (let j = 0; j < specNames.length; j++) {
                const specName = String(specNames[j]).trim();
                const specDataRowIndex = j + 1;

                if (data[specDataRowIndex] && data[specDataRowIndex][productDataColumnIndex] !== undefined) {
                    // Asegurarse de no guardar 'null' si la celda está vacía para evitar sobreescribir con null innecesariamente,
                    // aunque en este caso queremos representar la ausencia de valor.
                    technicalSpecifications[specName] = data[specDataRowIndex][productDataColumnIndex];
                } else {
                    // Explicitamente establecer a null si la celda está vacía
                    technicalSpecifications[specName] = null;
                }
            }

            // Construir el objeto de actualización de forma explícita para el subdocumento
            const updateObject = {};
            // Iterar sobre las especificaciones recolectadas y añadirlas al path correcto
            for (const specName in technicalSpecifications) {
                if (technicalSpecifications.hasOwnProperty(specName)) {
                    updateObject[`especificaciones_tecnicas.${specName}`] = technicalSpecifications[specName];
                }
            }

            // Si no hay especificaciones, tal vez queramos limpiar el objeto o dejarlo como está
            // Si updateObject está vacío, updateProductInDB podría no hacer nada.
            // Aquí asumimos que siempre habrá especificaciones si el archivo está bien formado.
            if (Object.keys(updateObject).length === 0 && specNames.length > 0) {
                 console.warn(`[Bulk Upload Specs] No specification data collected for product ${productCode} despite finding specification names.`);
                 // Podríamos decidir qué hacer aquí: saltar la actualización, limpiar el campo, etc.
                 // Por ahora, si updateObject está vacío, no se actualizarán especificaciones_tecnicas.
                 // Si hay especificaciones definidas en la plantilla pero todas las celdas están vacías,
                 // updateObject contendrá { 'especificaciones_tecnicas.specName1': null, ... }
            }

            try {
                // Pasar el objeto de actualización explícito al servicio de datos
                const updatedProduct = await updateProductInDB(productCode, updateObject);

                if (updatedProduct) {
                    results.push({ 
                        code: productCode, 
                        status: 'success', 
                        message: 'Especificaciones actualizadas.' 
                    });
                } else {
                    hasErrors = true;
                    results.push({ 
                        code: productCode, 
                        status: 'warning', 
                        message: 'Producto no encontrado en la base de datos.' 
                    });
                }
            } catch (dbError) {
                hasErrors = true;
                console.error(`Error updating product ${productCode} in DB:`, dbError);
                results.push({ 
                    code: productCode, 
                    status: 'error', 
                    message: `Error al actualizar en DB: ${dbError.message}` 
                });
            }
        }

        // Refrescar el caché global después de procesar todos los productos
        try {
            await initializeProductCache();
            console.log('Cache refreshed after bulk specification update.');
        } catch (cacheError) {
            console.error('Error refreshing cache after bulk update:', cacheError);
            // No consideramos esto un error fatal
        }

        // Enviar respuesta resumen
        const status = hasErrors ? 207 : 200;
        res.status(status).json({ 
            success: true, 
            message: 'Procesamiento de archivo de especificaciones completado.', 
            results 
        });

    } catch (error) {
        console.error('Error processing specifications file:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor al procesar el archivo.', 
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

// --- Exportaciones ---
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
    calculatePruebaCosto,
    calculateCostoProductoFromProfile,
    uploadBulkProductsMatrix,
    uploadBulkProductsPlain,
    uploadTechnicalSpecifications
};