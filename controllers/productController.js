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
        const { codigo: codigoPrincipal } = req.query; // Obtener solo el código principal de la query

        // Validar parámetro requerido
        if (!codigoPrincipal) {
            return res.status(400).json({
                success: false,
                error: 'Parámetro inválido',
                message: 'Se requiere el código del producto principal (param: codigo)'
            });
        }

        console.log(`[getOptionalProducts] Buscando producto principal con código: ${codigoPrincipal}`);

        // 1. Buscar el producto principal en la base de datos
        const productoPrincipal = await Producto.findOne({ Codigo_Producto: codigoPrincipal }).lean();

        if (!productoPrincipal) {
            console.log(`[getOptionalProducts] Producto principal con código ${codigoPrincipal} no encontrado.`);
            // Si el producto principal no existe, no hay opcionales asociados a él según esta lógica.
            return res.status(200).json({
                success: true,
                data: {
                    total: 0,
                    products: [] // Lista vacía porque el principal no existe
                },
                timestamp: new Date().toISOString()
            });
        }

        // 2. Obtener el array de asignaciones del producto principal
        // Asegurarse de que asignado_a_codigo_principal existe y es un array. Si no, tratar como array vacío.
        const mainProductAssignments = Array.isArray(productoPrincipal.asignado_a_codigo_principal)
            ? productoPrincipal.asignado_a_codigo_principal.map(item => String(item).trim().toLowerCase()).filter(item => item !== '')
            : (productoPrincipal.asignado_a_codigo_principal ? [String(productoPrincipal.asignado_a_codigo_principal).trim().toLowerCase()].filter(item => item !== '') : []);

        if (mainProductAssignments.length === 0) {
            console.log(`[getOptionalProducts] Producto principal ${codigoPrincipal} no tiene asignaciones.`);
            // Si el principal no tiene asignaciones, no hay opcionales que coincidan.
            return res.status(200).json({
                success: true,
                data: {
                    total: 0,
                    products: [] // Lista vacía porque el principal no tiene asignaciones
                },
                timestamp: new Date().toISOString()
            });
        }

        console.log(`[getOptionalProducts] Asignaciones del producto principal ${codigoPrincipal}: ${mainProductAssignments.join(', ')}`);
        console.log('[getOptionalProducts] Querying with mainProductAssignments:', mainProductAssignments);

        // 3. Construir la consulta para encontrar opcionales:
        //    - Excluir el producto principal.
        //    - Filtrar por productos marcados como opcionales por categoría.
        //    - Buscar opcionales cuyo array asignado_a_codigo_principal contenga AL MENOS UN elemento que esté en mainProductAssignments.
        //    - Realizar la comparación de asignaciones de forma insensible a mayúsculas/minúsculas.

        const findQuery = {
            Codigo_Producto: { $ne: codigoPrincipal },
            categoria: 'opcional',
            // Usar $elemMatch para buscar en el array del opcional
            // La comparación de asignaciones ya se hizo insensible a mayúsculas/minúsculas
            // al procesar mainProductAssignments, y asumimos que los valores en DB
            // también están normalizados o se compararán correctamente por $in en el array.
            asignado_a_codigo_principal: { $in: mainProductAssignments }
        };
        console.log('[getOptionalProducts] Constructed findQuery:', JSON.stringify(findQuery, null, 2));

        const opcionalesFiltrados = await Producto.find(findQuery).lean();

        console.log(`[getOptionalProducts] Encontrados ${opcionalesFiltrados.length} opcionales que coinciden con la consulta.`);

        if (opcionalesFiltrados.length === 0) {
            console.log('[getOptionalProducts] No matching optional products found for query:', JSON.stringify(findQuery, null, 2));
        } else {
             console.log('[getOptionalProducts] Found optional products (first 5):', opcionalesFiltrados.slice(0, 5).map(p => p.Codigo_Producto).join(', ') + (opcionalesFiltrados.length > 5 ? '...' : ''));
        }

        // Mapear los resultados al formato deseado para el frontend
        const opcionalesParaFrontend = opcionalesFiltrados.map(op => {
            const mapped = {
                // Incluir todos los campos relevantes para el frontend
                ...op,
                codigo_producto: op.Codigo_Producto,
                nombre_del_producto: op.caracteristicas?.nombre_del_producto || op.nombre_del_producto,
                Descripcion: op.caracteristicas?.descripcion || op.descripcion || op.Descripcion,
                Modelo: op.caracteristicas?.modelo || op.modelo || op.Modelo,
                asignado_a_codigo_principal: op.asignado_a_codigo_principal // Asegurar que este campo se incluye
            };
            // Eliminar el campo original de MongoDB si es diferente y ya mapeamos a codigo_producto
            if (op.hasOwnProperty('Codigo_Producto') && mapped.codigo_producto !== undefined) {
                delete mapped.Codigo_Producto; // Eliminar si ya está en codigo_producto
            }
            // Asegurarse de que _id no se envíe al frontend a menos que sea necesario
            delete mapped._id;
            return mapped;
        });

        res.status(200).json({
            success: true,
            message: 'Opcionales encontrados',
            data: {
                total: opcionalesParaFrontend.length,
                products: opcionalesParaFrontend
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error al obtener productos opcionales:', error);
        return res.status(500).json({
            success: false,
            error: 'Error al obtener productos opcionales',
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

        // Convertir la hoja a un array de objetos. Use defval: null para celdas vacías.
        // sheet_to_json por defecto usa la primera fila como encabezados.
        const data = xlsx.utils.sheet_to_json(worksheet, { defval: null });

        if (data.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'El archivo no contiene filas de datos (después de los encabezados).'
            });
        }

        // --- Logging: Datos leídos y encabezados ---
        console.log('[Bulk Upload Plain] Data rows read:', data.length);
        if (data.length > 0) {
             console.log('[Bulk Upload Plain] First row headers (actual):', Object.keys(data[0]));
        }
        // Fin Logging ---

        // --- Mapeo flexible de encabezados de plantilla a nombres de campo de la DB ---
        // Definimos los campos de DB esperados y su *forma esperada normalizada* en la plantilla (minúscula, sin espacios/guiones).
        // Usaremos esto para encontrar la columna correcta en el archivo subido, sin importar su capitalización o espacios/guiones.
        const fieldMap = {
            'Codigo_Producto': 'codigo_producto',
            'nombre_del_producto': 'nombre_producto', // Mapeo de nombre
            'descripcion': 'descripcion',
            'modelo': 'modelo', // Esperamos 'modelo' normalizado
            'categoria': 'equipo u opcional', // Mapeo crucial para 'categoria', usando el nombre de tu plantilla
            'producto': 'producto',
            'fecha_cotizacion': 'fecha_cotizacion',
            'costo_fabrica': 'costo fabrica', // Mapeo de guion bajo a espacio esperado
            'peso_kg': 'peso_kg',
            'dimensiones.largo_cm': 'largo_mm', // Necesita conversión de mm a cm
            'dimensiones.ancho_cm': 'ancho_mm', // Necesita conversión de mm a cm
            'dimensiones.alto_cm': 'alto_mm',   // Necesita conversión de mm a cm
            'asignado_a_codigo_principal': 'asignacion', // Map to the correct column header
            // Agrega aquí otros campos de DB y su forma normalizada en la plantilla si es necesario
        };

        // Campos requeridos (nombres de campo de la DB esperados por el backend)
        const requiredFields = [
          'Codigo_Producto', 'nombre_del_producto', 'modelo', 'categoria',
          'peso_kg', 'dimensiones.largo_cm', 'dimensiones.ancho_cm', 'dimensiones.alto_cm'
        ];

        // Obtener y normalizar los encabezados reales del archivo
        const actualHeaders = Object.keys(data[0]);
        const normalizedActualHeaders = actualHeaders.map(header =>
             String(header).toLowerCase().replace(/[^a-z0-9]/g, '') // Normalizar: minúscula, sin espacios ni caracteres especiales
        );

        // Mapear los campos de BD (requeridos + opcionales con mapeo) a la columna real en el archivo
        const columnMap = {}; // Usaremos un mapa general ahora
        const missingRequiredFields = [];

        // Verificar que al menos los campos requeridos tengan una columna mapeable
        requiredFields.forEach(requiredField => {
            const normalizedExpectedHeader = String(fieldMap[requiredField]).toLowerCase().replace(/[^a-z0-9]/g, '');
            const columnIndex = normalizedActualHeaders.indexOf(normalizedExpectedHeader);

            if (columnIndex !== -1) {
                // Encontramos la columna para un campo REQUERIDO. Guardamos el encabezado REAL.
                 columnMap[requiredField] = actualHeaders[columnIndex];
            } else {
                missingRequiredFields.push(requiredField); // Falta la columna para un campo REQUERIDO
            }
        });

        if (missingRequiredFields.length > 0) {
            // Informar al usuario sobre los campos de BD que faltan (basado en el mapeo)
            return res.status(400).json({
                success: false,
                message: `Faltan columnas requeridas en la plantilla: ${missingRequiredFields.join(', ')}`
            });
        }

        // Ahora, mapear también los campos opcionales que tienen una columna en la plantilla y un mapeo definido
        actualHeaders.forEach(actualHeader => {
            const normalizedActualHeader = String(actualHeader).toLowerCase().replace(/[^a-z0-9]/g, '');
             // Buscar qué campo de BD corresponde a este encabezado normalizado en el fieldMap
             const dbField = Object.keys(fieldMap).find(key =>
                 String(fieldMap[key]).toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedActualHeader
             );

            // Si encontramos un mapeo y no es un campo requerido que ya mapeamos (para evitar duplicados),
            // o si es un campo opcional, lo añadimos al columnMap.
            // La condición anterior ya añadió los requeridos, este bucle añade los opcionales mapeados que existen en el archivo.
            // Simplificamos: si el encabezado actual mapea a un campo en fieldMap y aún no está en columnMap (ya que requeridos fueron añadidos), lo agregamos.
             if (dbField && !columnMap[dbField]) {
                 columnMap[dbField] = actualHeader; // Usar el encabezado real del archivo
             }
        });

        console.log('[Bulk Upload Plain] Headers mapped successfully. Full Column Map:', columnMap);
        console.log('[Bulk Upload Plain] Normalized actual headers:', normalizedActualHeaders);
        console.log('[Bulk Upload Plain] Looking for "equipo u opcional" column...');
        const equipoOpcionalIndex = normalizedActualHeaders.indexOf('equipouopcional');
        console.log('[Bulk Upload Plain] Found "equipo u opcional" at index:', equipoOpcionalIndex);
        if (equipoOpcionalIndex !== -1) {
            console.log('[Bulk Upload Plain] Actual header for "equipo u opcional":', actualHeaders[equipoOpcionalIndex]);
            console.log('[Bulk Upload Plain] First row value for "equipo u opcional":', data[0][actualHeaders[equipoOpcionalIndex]]);
        } else {
            console.log('[Bulk Upload Plain] WARNING: Could not find "equipo u opcional" column in headers');
            console.log('[Bulk Upload Plain] Available headers:', actualHeaders);
        }

        // Procesar filas de datos
        const results = [];
        let hasErrors = false;

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            if (!row) continue; // Saltar filas completamente vacías si las hubiera

            const productData = {};
            productData.dimensiones = {}; // Inicializar subdocumento dimensiones (si aplica)
            let hasDimensiones = false; // Bandera para saber si se agregaron dimensiones

            // Llenar productData usando el mapa COMPLETO de columnas (requeridas y opcionales mapeadas)
            for (const dbField in columnMap) {
                if (columnMap.hasOwnProperty(dbField)) {
                    const actualHeader = columnMap[dbField];
                    const value = row[actualHeader]; // Obtener el valor usando el encabezado real de la columna

                    // Manejar campos anidados como dimensiones y aplicar conversiones
                    if (dbField.startsWith('dimensiones.')) {
                        const dimensionField = dbField.split('.')[1]; // ej: largo_cm
                        const mmValue = parseNumberValue(value); // Usar helper existente para parsear número
                        if (mmValue !== null) {
                            // Convertir mm a cm
                            productData.dimensiones[dimensionField] = mmValue / 10;
                            hasDimensiones = true;
                        } else {
                            // Si el valor es nulo, guardarlo como null en el subdocumento si el campo existe en el mapeo
                             if (columnMap[`dimensiones.${dimensionField}`]) {
                                productData.dimensiones[dimensionField] = null; 
                             }
                        }
                    } else if (dbField === 'asignado_a_codigo_principal') { // Explicitly handle the new field
                        console.log(`[Bulk Upload Plain] Processing asignado_a_codigo_principal for row ${i + 1}. Value:`, value);
                        // Check if the value is a string and contains '/', then split and trim
                        if (typeof value === 'string' && value.includes('/')) {
                            productData.asignado_a_codigo_principal = value.split('/').map(item => item.trim().toLowerCase()).filter(item => item !== '');
                        } else if (value !== null && value !== undefined && String(value).trim() !== '') {
                            // If it's not a string with '/' but has a non-empty value, store it as a single-element array
                            productData.asignado_a_codigo_principal = [String(value).trim().toLowerCase()];
                        } else {
                            // If value is null, undefined, or empty after trim, set to null or undefined as appropriate by schema default
                             // Mongoose will handle setting to null/undefined based on schema definition if the field is not required
                             // We can explicitly set to undefined to ensure the field is not included if empty
                             productData.asignado_a_codigo_principal = undefined;
                        }
                    } else {
                        // Convertir campos textuales a minúsculas si no son nulos o indefinidos
                        if (typeof value === 'string' && value !== null && value !== undefined && value.trim() !== '') {
                            // Aplicar a campos específicos que queremos en minúsculas
                            const fieldsToLowerCase = ['nombre_del_producto', 'modelo', 'categoria', 'producto', 'descripcion'];
                            if (fieldsToLowerCase.includes(dbField)) {
                                productData[dbField] = value.toLowerCase();
                            } else {
                                productData[dbField] = value;
                            }
                        } else {
                             // Asignar directamente si no es un string o está vacío/nulo
                            productData[dbField] = value;
                        }
                    }
                }
            }

            // Si no se agregaron campos de dimensiones, eliminar el subdocumento vacío
            if (!hasDimensiones && Object.keys(productData.dimensiones).length === 0) {
                delete productData.dimensiones;
            }

            // --- Validar que los campos requeridos (mapeados) tienen valor ---
            const missingRequiredValues = requiredFields.filter(requiredField => {
                // Para campos anidados como dimensiones.largo_cm
                if (requiredField.includes('.')) {
                    const [parent, child] = requiredField.split('.');
                    // Verificar que el padre exista y el hijo no sea undefined/null
                    return !productData[parent] || productData[parent][child] === undefined || productData[parent][child] === null;
                } else {
                     return productData[requiredField] === undefined || productData[requiredField] === null;
                }
            });

            if (missingRequiredValues.length > 0) {
                 hasErrors = true;
                 results.push({
                     // Intentar obtener el Codigo_Producto o usar N/A si no está presente
                     code: productData.Codigo_Producto || row[columnMap['Codigo_Producto']] || 'N/A',
                     status: 'error',
                     message: `Faltan valores para los campos requeridos: ${missingRequiredValues.join(', ')}`
                 });
                 console.error(`[Bulk Upload Plain] Row ${i + 1} missing required values:`, missingRequiredValues);
                 continue; // Saltar a la siguiente fila si faltan valores requeridos
            }

            // --- Logging: productData antes de crear/actualizar en DB ---
            console.log(`[Bulk Upload Plain] Processing row ${i + 1}. Data prepared:`, productData);
            // Fin Logging ---

            try {
                // Asegurar que Codigo_Producto sea string y trim() si es necesario
                 if (productData.Codigo_Producto !== undefined && productData.Codigo_Producto !== null) {
                     productData.Codigo_Producto = String(productData.Codigo_Producto).trim();
                 } else {
                     // Esto no debería ocurrir si Codigo_Producto es requerido y la validación pasó, pero como seguridad
                      throw new Error('Codigo_Producto es requerido y no se pudo obtener después del mapeo.');
                 }

                // Intentar crear el producto
                console.log('[Bulk Upload Plain] Attempting to create product:', productData.Codigo_Producto);
                const newProduct = await createProductInDB(productData);
                console.log('[Bulk Upload Plain] Product created:', newProduct.Codigo_Producto);
                results.push({
                    code: newProduct.Codigo_Producto,
                    status: 'success',
                    message: 'Producto creado exitosamente.'
                });
            } catch (error) {
                // Si el error indica que el producto ya existe, intentar actualizar en su lugar
                if (error.message && error.message.includes('ya existe')) {
                     console.warn(`[Bulk Upload Plain] Product with code ${productData.Codigo_Producto} already exists. Attempting to update...`);
                     try {
                         // Eliminar campos que no deben actualizarse (como _id, y Codigo_Producto si updateProductInDB no lo permite)
                         const updateData = { ...productData };
                         delete updateData._id;
                         // Dependiendo de updateProductInDB, puede que necesites eliminar Codigo_Producto de updateData
                         // delete updateData.Codigo_Producto;

                         // --- Logging: updateData antes de updateProductInDB ---
                         console.log(`[Bulk Upload Plain] Updating product ${productData.Codigo_Producto}. Update data:`, updateData);
                         // Fin Logging ---

                         const updatedProduct = await updateProductInDB(productData.Codigo_Producto, updateData);

                         if (updatedProduct) {
                              console.log('[Bulk Upload Plain] Product updated:', updatedProduct.Codigo_Producto);
                              results.push({
                                  code: updatedProduct.Codigo_Producto,
                                  status: 'success',
                                  message: 'Producto actualizado exitosamente.'
                              });
                         } else {
                             // Esto podría pasar si el producto existía pero desapareció o updateProductInDB falló silenciosamente
                              hasErrors = true;
                              console.error(`[Bulk Upload Plain] Failed to update product ${productData.Codigo_Producto} after 'already exists' error. updateProductInDB returned null/undefined.`);
                              results.push({
                                  code: productData.Codigo_Producto,
                                  status: 'error',
                                  message: 'Error al actualizar producto existente (updateProductInDB falló o no encontró el producto).',
                              });
                         }
                     } catch (updateError) {
                         // Error durante el intento de actualización
                         hasErrors = true;
                         console.error(`[Bulk Upload Plain] Error updating product ${productData.Codigo_Producto}:`, updateError);
                         results.push({
                              code: productData.Codigo_Producto,
                              status: 'error',
                              message: `Error al actualizar producto: ${updateError.message}`,
                         });
                     }
                } else {
                     // Otro tipo de error durante la creación
                     hasErrors = true;
                     console.error('[Bulk Upload Plain] Error creating product:', productData.Codigo_Producto || row[columnMap['Codigo_Producto']] || 'N/A', error);
                     results.push({
                         // Intentar obtener el Codigo_Producto mapeado o usar N/A
                         code: productData.Codigo_Producto || row[columnMap['Codigo_Producto']] || 'N/A',
                         status: 'error',
                         message: `Error al crear producto: ${error.message}`
                     });
                }
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

// @desc    Delete a product by its Codigo_Producto
// @route   DELETE /api/products/code/:codigoProducto (or just /api/products/:codigo if preferred)
// @access  Private/Admin
const deleteProductByCode = asyncHandler(async (req, res) => {
    const { codigoProducto } = req.params;

    if (!codigoProducto) {
        return res.status(400).json({
            success: false,
            message: 'El código del producto es requerido para la eliminación.'
        });
    }

    // Asumimos que tienes una función en mongoDataService para eliminar por código
    const deleteResult = await deleteProductFromDB(codigoProducto);

    if (!deleteResult || deleteResult.deletedCount === 0) {
        return res.status(404).json({
            success: false,
            message: `Producto con código ${codigoProducto} no encontrado o no se pudo eliminar.`
        });
    }

    // Actualizar caché después de la eliminación
    console.log(`Product with code ${codigoProducto} deleted. Attempting to refresh cache...`);
    const productsFromDB = await fetchBaseProductsFromDB();
    cachedProducts = productsFromDB;
    saveCacheToDisk();
    console.log('Cache refreshed after product deletion.');

    res.status(200).json({
        success: true,
        message: `Producto con código ${codigoProducto} eliminado exitosamente y caché refrescado.`
    });
});

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
    uploadTechnicalSpecifications,
    deleteProductByCode
};