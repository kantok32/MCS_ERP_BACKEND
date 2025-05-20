const xlsx = require('xlsx');
const path = require('path');
const mongoose = require('mongoose');
const Producto = require('../models/Producto'); // Importar el modelo definido externamente
const { fetchAvailableProducts, fetchFilteredProducts, fetchCurrencyValues } = require('../utils/fetchProducts'); // Asumiendo que estas utils aún son necesarias
const fs = require('fs');
const axios = require('axios');

// --- Quitar definiciones de Schema y Modelo de aquí --- 
// Ya no son necesarias porque se importan desde ../models/Producto

// --- Caché (si se sigue usando) --- 
let cachedProducts = [];
// ... (resto de la lógica de caché si aplica)
const CACHE_FILE = path.join(__dirname, '../data/productsCache.json');
// ... (lógica de carga/guardado de caché si aplica)

// --- Funciones del Controlador --- 

// Función cargarProductosDesdeExcel (modificada para usar el modelo importado y mapear datos)
const cargarProductosDesdeExcel = async (req, res) => {
    const excelFilePath = path.join(__dirname, '..', 'Plantilla_Carga_Productos_MongoDB.xlsx'); 
    console.log(`[Excel Load] Attempting to read file: ${excelFilePath}`);

    try {
        const workbook = xlsx.readFile(excelFilePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet, { raw: false });

        if (!data || data.length === 0) {
            return res.status(400).json({ message: 'No se encontraron datos en el archivo Excel.' });
        };

        console.log(`[Excel Load] Found ${data.length} rows in Excel.`);
        let operaciones = [];
        let errores = [];

        for (const row of data) {
            // Mapeo cuidadoso de Excel a Schema

            // Convertir fechas de Excel si es necesario (Excel almacena fechas como números)
            let fechaCotizacionExcel = row['fecha cotizacion'];
            if (typeof fechaCotizacionExcel === 'number') {
                // Es un número de serie de fecha de Excel, convertir a objeto Date de JavaScript
                // El epoch de Excel es 30 de diciembre de 1899 para Windows (25569 días antes del epoch de Unix)
                // O 1 de enero de 1904 para Mac (24107 días antes del epoch de Unix)
                // Usaremos el de Windows por ser más común.
                fechaCotizacionExcel = new Date(Date.UTC(0, 0, fechaCotizacionExcel - 1, 0, 0, 0) - (25569 * 24 * 60 * 60 * 1000));
            } else if (typeof fechaCotizacionExcel === 'string') {
                // Si es un string, intentar parsearlo. Ajustar el formato si es necesario.
                const parsedDate = new Date(fechaCotizacionExcel);
                if (!isNaN(parsedDate.getTime())) {
                    fechaCotizacionExcel = parsedDate;
                } else {
                    console.warn(`[Excel Load] No se pudo parsear la fecha '${fechaCotizacionExcel}' para ${row.Codigo_Producto}. Se dejará como undefined.`);
                    fechaCotizacionExcel = undefined; // o null, o dejar que falle la validación del schema si es requerida
                }
            } else if (fechaCotizacionExcel) {
                 console.warn(`[Excel Load] Formato de fecha inesperado para '${fechaCotizacionExcel}' para ${row.Codigo_Producto}. Se intentará usar tal cual.`);
            }


            let productoData = {
                Codigo_Producto: row.Codigo_Producto,
                // categoria: row.categoria, // 'categoria' a nivel raíz fue eliminada del schema, verificar si aún está en Excel y dónde debe ir.
                peso_kg: parseFloat(row.peso_kg) || undefined,
                caracteristicas: {
                    nombre_del_producto: row.nombre_del_producto,
                    modelo: row.modelo
                },
                dimensiones: {
                    // Asumiendo que el schema espera números para las dimensiones en mm
                    largo_mm: parseFloat(row.largo_mm || row.largo_m * 1000 || row.largo_cm * 10) || undefined,
                    ancho_mm: parseFloat(row.ancho_mm || row.ancho_m * 1000 || row.ancho_cm * 10) || undefined,
                    alto_mm: parseFloat(row.alto_mm || row.alto_m * 1000 || row.alto_cm * 10) || undefined
                },
                datos_contables: {
                    costo_fabrica: parseFloat(row['costo fabrica']) || undefined,
                    divisa_costo: row.divisa_costo || 'EUR', // Tomar del Excel si existe, sino default a EUR
                    fecha_cotizacion: fechaCotizacionExcel // Usar la fecha procesada
                    // Asegurarse que otros campos de datos_contables como costo_ano_cotizacion se mapeen si están en Excel
                    // costo_ano_cotizacion: parseInt(row['costo_ano_cotizacion']) || undefined
                },
                tipo: row.tipo,
                familia: row.familia,
                proveedor: row.proveedor,
                procedencia: row.procedencia,
                nombre_comercial: row.nombre_comercial,
                descripcion: row.descripcion, 
                clasificacion_easysystems: row.clasificacion_easysystems,
                codigo_ea: row.codigo_ea,
                es_opcional: row.es_opcional === 'TRUE' || row.es_opcional === true || row.es_opcional === 'true',
                producto: row.producto, // Este es el campo 'tipo de producto' o 'familia de producto' según el Excel

                // Mantener estos si aún son relevantes y están en el Excel y schema
                especificaciones_tecnicas: {}, 
                metadata: {}, 
                // Los campos _json podrían ya no ser necesarios si el schema principal maneja los objetos directamente
                // dimensiones_json: row.dimensiones_json, 
                // especificaciones_tecnicas_json: row.especificaciones_tecnicas_json,
                // opciones_json: row.opciones_json,
                // metadata_json: row.metadata_json,
            };
            
            // Limpiar campos undefined para que no se guarden explícitamente como null a menos que se desee
            Object.keys(productoData).forEach(key => {
                if (productoData[key] === undefined) {
                    delete productoData[key];
                }
                if (typeof productoData[key] === 'object' && productoData[key] !== null) {
                    Object.keys(productoData[key]).forEach(subKey => {
                        if (productoData[key][subKey] === undefined) {
                            delete productoData[key][subKey];
                        }
                    });
                    // Si el sub-objeto quedó vacío después de limpiar, eliminarlo también
                    if (Object.keys(productoData[key]).length === 0) {
                         delete productoData[key];
                    }
                }
            });


            // Validación básica usando los campos requeridos del Schema
            const tempProduct = new Producto(productoData); // Crear instancia temporal para validación
            const validationError = tempProduct.validateSync(); // Validar sincrónicamente

            if (validationError) {
                 const errorMessages = Object.values(validationError.errors).map(e => e.message).join(', ');
                 console.warn(`[Excel Load] Skipping row due to validation errors: ${errorMessages}`, row);
                 errores.push({ message: `Errores de validación: ${errorMessages}`, rowData: row });
                 continue;
            }

            // Procesamiento de campos JSON embebidos (si aún existen)
             const jsonFields = ['dimensiones_json', 'especificaciones_tecnicas_json', 'opciones_json', 'metadata_json'];
             for (const field of jsonFields) {
                 if (productoData[field] && typeof productoData[field] === 'string') {
                     try {
                         productoData[field] = JSON.parse(productoData[field]);
                     } catch (e) {
                          console.warn(`[Excel Load] Error parsing JSON for field ${field}. Storing as string. Error: ${e.message}`);
                     }
                 }
             }
            
             // Lógica para poblar especificaciones_tecnicas desde Excel
             if (productoData.especificaciones_tecnicas_json && typeof productoData.especificaciones_tecnicas_json === 'object') {
                 productoData.especificaciones_tecnicas = { ...productoData.especificaciones_tecnicas_json }; // Usa el JSON si existe
             } else {
                 // Alternativa: busca columnas con prefijo 'spec_' u otra lógica
                 for (const key in row) {
                     if (/* tu lógica para identificar specs, ej: key.startsWith('spec_') */ false) { 
                         // const specName = key.substring(5);
                         // productoData.especificaciones_tecnicas[specName] = row[key];
                     }
                 }
             }

            // Preparar operación de upsert
            operaciones.push({
                updateOne: {
                    filter: { Codigo_Producto: productoData.Codigo_Producto }, 
                    update: { $set: productoData },    
                    upsert: true                       
                }
            });
        }

        console.log(`[Excel Load] Prepared ${operaciones.length} bulk operations.`);

        if (operaciones.length > 0) {
            const resultado = await Producto.bulkWrite(operaciones, { ordered: false });
            console.log('[Excel Load] Bulk write operation result:', resultado);

            const resumen = {
                totalRowsInExcel: data.length,
                rowsAttempted: operaciones.length,
                rowsSkipped: errores.length,
                inserted: resultado.upsertedCount,
                updated: resultado.modifiedCount,
                writeErrors: resultado.writeErrors?.length || 0,
                validationErrors: errores 
            };
            console.log('[Excel Load] Summary:', resumen);
            const status = (resumen.writeErrors > 0 || resumen.validationErrors.length > 0) ? 207 : 200;
            res.status(status).json({ message: `Carga completada con ${status === 207 ? 'errores' : 'éxito'}.`, summary: resumen });
        } else {
            res.status(400).json({ message: 'No se procesaron filas válidas del archivo Excel.', errors: errores });
        }

    } catch (error) {
        console.error('[Excel Load] General error processing Excel file:', error);
        if (error.code === 'ENOENT') {
             res.status(404).json({ message: `Archivo Excel no encontrado en la ruta: ${excelFilePath}` });
        } else if (error instanceof mongoose.Error.ValidationError) {
             res.status(400).json({ message: 'Error de validación de datos durante la carga masiva.', error: error.message, details: error.errors });
        } else if (error instanceof mongoose.Error) {
             res.status(500).json({ message: 'Error de base de datos durante la carga masiva.', error: error.message });
        } else if (error.name === 'BulkWriteError') { 
             res.status(500).json({ message: 'Error durante la escritura masiva en la base de datos.', error: error.message, details: error.writeErrors });
        }
         else {
            res.status(500).json({ message: 'Error interno del servidor al procesar el archivo Excel.', error: error.message });
        }
    }
};

// Función createIndividualEquipment (usa el modelo importado)
const createIndividualEquipment = async (req, res) => {
    // --- DEBUG: Log súper básico y robusto al inicio --- 
    console.log(`
--- [${new Date().toISOString()}] Accediendo a createIndividualEquipment... ---
`);
    // ---------------------------------------------------

    // --- DEBUG: Log inicial del body recibido --- 
    // Intentar loggear el body de forma segura
    try {
        console.log('[Create Equip] Raw request body received:', JSON.stringify(req.body, null, 2));
    } catch (stringifyError) {
        console.error('[Create Equip] Error stringifying req.body:', stringifyError);
        console.log('[Create Equip] req.body (raw): ', req.body);
    }
    // ---------------------------------------------
    try {
        // Extraer datos del body
        const {
            Codigo_Producto,
            categoria,
            peso_kg,
            caracteristicas, 
            dimensiones,    
            especificaciones_tecnicas, 
            metadata,
            // Campos de costo nuevos
            costo_fabrica_original_eur, 
            costo_ano_cotizacion,
            // Otros campos...
            tipo, familia, proveedor, procedencia, nombre_comercial, descripcion, clasificacion_easysystems, codigo_ea 
        } = req.body;

        // --- DEBUG: Log de datos extraídos --- 
        console.log('[Create Equip] Extracted caracteristicas:', JSON.stringify(caracteristicas, null, 2));
        console.log('[Create Equip] Extracted dimensiones:', JSON.stringify(dimensiones, null, 2));
        // --------------------------------------

        // Construir el documento (Mongoose validará al crear)
        const nuevoProductoData = {
            Codigo_Producto,
            categoria,
            peso_kg,
            caracteristicas, // Pasar el objeto extraído
            dimensiones,   // Pasar el objeto extraído
            especificaciones_tecnicas: especificaciones_tecnicas || {},
            metadata: metadata || {},
            // Añadir nuevos campos (asegurarse que sean números si existen)
            ...(costo_fabrica_original_eur !== undefined && { costo_fabrica_original_eur: Number(costo_fabrica_original_eur) }),
            ...(costo_ano_cotizacion !== undefined && { costo_ano_cotizacion: Number(costo_ano_cotizacion) }),
            ...(tipo && { tipo }),
            ...(familia && { familia }),
            ...(proveedor && { proveedor }),
            ...(procedencia && { procedencia }),
            ...(nombre_comercial && { nombre_comercial }),
            ...(descripcion && { descripcion }),
            ...(clasificacion_easysystems && { clasificacion_easysystems }),
            ...(codigo_ea && { codigo_ea }),
        };
        
        // --- DEBUG: Log del objeto a crear --- 
        console.log('[Create Equip] Object being passed to Producto.create():', JSON.stringify(nuevoProductoData, null, 2));
        // ------------------------------------

        console.log('[Create Equip] Attempting to create product with data:', nuevoProductoData); // Log anterior, puede ser redundante ahora

        // Crear usando el modelo importado
        const productoCreado = await Producto.create(nuevoProductoData);

        console.log('[Create Equip] Product created successfully:', productoCreado);
        res.status(201).json({ message: 'Equipo creado exitosamente', producto: productoCreado }); // Devolver mensaje genérico, frontend lo cambia

    } catch (error) {
         console.error('[Create Equip] Error creating equipment:', error);
         if (error.name === 'ValidationError') {
             // --- DEBUG: Log cuando ocurre ValidationError --- 
             console.log(`
--- !!! VALIDATION ERROR DETECTED (${new Date().toISOString()}) !!! ---
`);
             console.log('Validation Error Details:', JSON.stringify(error.errors, null, 2));
             // ---------------------------------------------
             const errors = Object.values(error.errors).map(el => el.message);
             // Devolver el primer error o todos concatenados
             return res.status(400).json({ message: errors[0] || 'Error de validación', errors }); // Devolver mensaje específico de error
         } else if (error.code === 11000) { 
              return res.status(409).json({ message: 'Error: El Código de Producto ya existe.' });
         } else if (error instanceof mongoose.Error) {
             return res.status(500).json({ message: 'Error de base de datos al crear el equipo.', error: error.message });
         } else {
             return res.status(500).json({ message: 'Error interno del servidor al crear el equipo.' });
         }
    }
};

// --- Otras funciones existentes (adaptadas si usan Producto) ---
const getCachedProducts = async (req, res) => {
    try {
        // Leer de MongoDB usando el modelo importado
        const products = await Producto.find({}); 
        res.status(200).json(products);
    } catch(error){
        console.error("Error getting products from DB:", error);
        res.status(500).json({ message: "Error retrieving products." });
    }
};

// ... (Adaptar fetchProducts, getProductDetail, etc. si necesitan usar el modelo Producto)
// ... Ejemplo: fetchProducts podría ahora guardar en DB en lugar de/además de caché
const fetchProducts = async (req, res) => {
  try {
    const productsFromWebhook = await fetchAvailableProducts();
    // Opcional: Actualizar/insertar en MongoDB además de/en lugar de caché
    // Aquí podrías usar bulkWrite similar a cargarProductosDesdeExcel si quieres actualizar la DB
    // Ejemplo simplificado: solo cachear en memoria
    cachedProducts = productsFromWebhook; 
    saveCacheToDisk(); // Guarda en archivo JSON si aún se usa
    res.status(200).json({ message: 'Products fetched and cached successfully', products: cachedProducts });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Fetch filtered products from DB
// @route   GET /api/products/filter (Asumiendo esta ruta desde productRoutes)
// @access  Public (Asumiendo)
const fetchFilteredProductsController = async (req, res) => {
    try {
        const { codigo, modelo, categoria } = req.query;
        
        // Construir el objeto de filtro para Mongoose
        const filter = {};
        if (codigo) filter.Codigo_Producto = { $regex: codigo, $options: 'i' }; // Búsqueda case-insensitive
        if (modelo) filter['caracteristicas.modelo'] = { $regex: modelo, $options: 'i' };
        if (categoria) filter.categoria = { $regex: categoria, $options: 'i' };
        
        console.log('[Filter Products] Searching with filter:', filter);
        
        // Buscar en la base de datos usando el modelo Producto
        const products = await Producto.find(filter);
        
        console.log(`[Filter Products] Found ${products.length} products.`);
        res.status(200).json(products);
        
    } catch (error) {
        console.error('[Filter Products] Error filtering products:', error);
        res.status(500).json({ message: 'Error al filtrar productos', error: error.message });
    }
};

// @desc    Fetch currency values from webhook and cache them
// @route   GET /api/currency/fetch (Asumiendo desde productRoutes)
// @access  Public (Asumiendo)
const fetchCurrencyValuesController = async (req, res) => {
    console.log('[Currency Fetch] Request received.');
    try {
        // Llama a la función de utilidad que realmente hace el fetch
        const currencyData = await fetchCurrencyValues(); 
        console.log('[Currency Fetch] Data received from utility:', currencyData);
        
        // Verificar que el objeto y las propiedades esperadas existan
        // Ajusta las claves ("Valor_Dolar", "Valor_Euro", "Fecha") si son diferentes en la respuesta real de fetchCurrencyValues
        if (currencyData && currencyData.Valor_Dolar !== undefined && currencyData.Valor_Euro !== undefined && currencyData.Fecha !== undefined) {
            // Actualizar caché interno
            currencyCache.dollar.value = currencyData.Valor_Dolar;
            currencyCache.euro.value = currencyData.Valor_Euro;
            const updateTime = new Date().toISOString();
            currencyCache.dollar.fecha = currencyData.Fecha; // Usar fecha de la respuesta
            currencyCache.euro.fecha = currencyData.Fecha;
            currencyCache.dollar.last_update = updateTime;
            currencyCache.euro.last_update = updateTime;
            
            console.log('[Currency Fetch] Internal cache updated:', currencyCache);

            res.status(200).json({ 
                message: 'Currency values fetched and cached successfully', 
                currencies: currencyCache // Devuelve el caché actualizado
            });
        } else {
            console.error('[Currency Fetch] Invalid or incomplete currency data received:', currencyData);
            res.status(404).json({ message: 'Invalid or incomplete currency data received from source.' });
        }
    } catch (error) {
        console.error('[Currency Fetch] Error fetching currency values:', error);
        res.status(500).json({ message: 'Error fetching currency values', error: error.message });
    }
};

// @desc    Get cached dollar value
// @route   GET /api/currency/dollar (Asumiendo desde productRoutes)
// @access  Public (Asumiendo)
const getCachedDollarValue = (req, res) => {
    if (currencyCache.dollar.value !== null) {
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
// @route   GET /api/currency/euro (Asumiendo desde productRoutes)
// @access  Public (Asumiendo)
const getCachedEuroValue = (req, res) => {
     if (currencyCache.euro.value !== null) {
        res.status(200).json({
            value: currencyCache.euro.value,
            fecha: currencyCache.euro.fecha,
            last_update: currencyCache.euro.last_update
        });
    } else {
        res.status(404).json({ message: 'Euro value not cached yet' });
    }
};

// @desc    Get all cached values (currencies and potentially products)
// @route   GET /api/products/cache/all (Asumiendo desde productRoutes)
// @access  Public (Asumiendo)
const getAllCachedValues = async (req, res) => {
    try {
        // Decide si leer productos de caché en memoria/disco o DB
        // Ejemplo: Leyendo de DB como se configuró getCachedProducts
        const products = await Producto.find({}); 
        
        const response = {
            success: true,
            data: {
                currencies: currencyCache,
                products: {
                    count: products.length,
                    items: products
                }
            }
        };
        res.status(200).json(response);
    } catch (error) {
        console.error('[Cache All] Error retrieving cached values:', error);
        res.status(500).json({ success: false, message: 'Error retrieving cached values', error: error.message });
    }
};

// @desc    Get product detail by Codigo_Producto
// @route   GET /api/products/detail?codigo=... (Asumiendo)
// @access  Public (Asumiendo)
const getProductDetail = async (req, res) => {
    try {
        // Extraer 'codigo' sin desestructuración
        const codigo = req.query.codigo;
        
        // Validar si el parámetro 'codigo' existe
        if (!codigo) {
            return res.status(400).json({ message: "Falta el parámetro de query 'codigo'" });
        }
        
        // Buscar el producto usando el valor de 'codigo'
        const product = await Producto.findOne({ Codigo_Producto: codigo });
        
        if (!product) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        
        res.status(200).json(product);
    } catch (error) {
         console.error('[Product Detail] Error fetching product detail:', error);
        res.status(500).json({ message: 'Error al obtener detalle del producto', error: error.message });
    }
};

// @desc    Get optional products (definir lógica según necesidad, ej: por categoría o flag)
// @route   GET /api/products/opcionales (Asumiendo)
// @access  Public (Asumiendo)
const getOptionalProducts = async (req, res) => {
     try {
         // Ejemplo: Buscar productos con una categoría específica o un campo booleano
         // const optionalProducts = await Producto.find({ esOpcional: true }); 
         // O buscar por categoría específica si aplica
         // const optionalProducts = await Producto.find({ categoria: 'Opcional' }); 
         
         // Placeholder: Devolver array vacío hasta definir la lógica
         const optionalProducts = []; 
         
         console.log(`[Optional Products] Found ${optionalProducts.length} optional products.`);
         res.status(200).json(optionalProducts);
     } catch (error) {
         console.error('[Optional Products] Error fetching optional products:', error);
         res.status(500).json({ message: 'Error al obtener productos opcionales', error: error.message });
     }
 };

// @desc    Reset cache (Placeholder - definir qué caché resetear)
// @route   POST /api/products/cache/reset (Asumiendo)
// @access  Admin (Asumiendo - añadir middleware de auth si es necesario)
const resetCache = async (req, res) => {
    try {
        console.log('[Cache Reset] Request received.');
        // Implementar lógica de reseteo - ¿Borrar archivo? ¿Limpiar caché en memoria? ¿Forzar fetch?
        // Ejemplo: Limpiar caché de divisas en memoria
        currencyCache.dollar = { value: null, last_update: null, fecha: null };
        currencyCache.euro = { value: null, last_update: null, fecha: null };
        console.log('[Cache Reset] Currency cache cleared.');
        
        // Podrías también querer borrar el archivo JSON de caché de productos si lo usas
        // if (fs.existsSync(CACHE_FILE)) { fs.unlinkSync(CACHE_FILE); }
        
        res.status(200).json({ message: 'Caché reseteado (parcialmente/totalmente según implementación).' });
    } catch (error) {
        console.error('[Cache Reset] Error resetting cache:', error);
        res.status(500).json({ message: 'Error al resetear el caché', error: error.message });
    }
};

// @desc    Clear cache (similar a reset, definir lógica)
// @route   DELETE /api/products/cache (Asumiendo)
// @access  Admin (Asumiendo)
const clearCache = async (req, res) => {
     try {
        console.log('[Cache Clear] Request received.');
        // Implementar lógica - similar a resetCache
        currencyCache.dollar = { value: null, last_update: null, fecha: null };
        currencyCache.euro = { value: null, last_update: null, fecha: null };
        console.log('[Cache Clear] Currency cache cleared.');
        res.status(200).json({ message: 'Caché limpiado.' });
    } catch (error) {
        console.error('[Cache Clear] Error clearing cache:', error);
        res.status(500).json({ message: 'Error al limpiar el caché', error: error.message });
    }
};

// <<<--- INICIO: NUEVAS FUNCIONES AUXILIARES Y CONFIGURACIÓN --- >>>

// Objeto de Configuración para Mapeo de Especificaciones
// Este objeto se podría externalizar a un archivo JSON más adelante.
const specMappings = {
  // Nombres de especificación (en minúsculas y trim) como claves
  "peso": { "targetPath": "dimensiones.peso_kg", "type": "string" }, // Mantener como string para incluir "[kg]"
  "ancho": { "targetPath": "dimensiones.ancho_cm", "type": "string" }, // Mantener como string para incluir "[m]"
  "alto con cañón de descarga": { "targetPath": "dimensiones.alto_cm", "type": "string" },
  "alto sin cañón de descarga": { "targetPath": "dimensiones.alto_sin_canon_cm", "type": "string", "optional": true },
  "largo": { "targetPath": "dimensiones.largo_cm", "type": "string" },
  "largo (tolva cerrada)": { "targetPath": "dimensiones.largo_tolva_cerrada_cm", "type": "string", "optional": true },
  "largo (tolva abierta)": { "targetPath": "dimensiones.largo_tolva_abierta_cm", "type": "string", "optional": true },
  "alto desde el suelo a tolva": { "targetPath": "dimensiones.alto_suelo_tolva_cm", "type": "string", "optional": true },
  "motor": { "targetPath": "especificaciones_tecnicas.motor", "type": "string" },
  "tipo de combustible": { "targetPath": "especificaciones_tecnicas.combustible", "type": "string" },
  "estanque de combustible": { "targetPath": "especificaciones_tecnicas.capacidad_estanque_combustible_l", "type": "string" },
  "estanque hidraulico": { "targetPath": "especificaciones_tecnicas.capacidad_estanque_hidraulico_l", "type": "string" },
  "potencia del motor": { "targetPath": "especificaciones_tecnicas.potencia_motor", "type": "string" }, // Ej: "23.8 [hp]"
  "requisito máximo de caudal hidráulico": { "targetPath": "especificaciones_tecnicas.caudal_hidraulico_requerido", "type": "string", "optional": true },
  "sistema de enfriamiento": { "targetPath": "especificaciones_tecnicas.sistema_enfriamiento", "type": "string", "optional": true },
  "control de operación": { "targetPath": "especificaciones_tecnicas.control_operacion", "type": "string", "optional": true },
  "nivel de ruido": { "targetPath": "especificaciones_tecnicas.nivel_ruido_db", "type": "string" },
  "emisiones": { "targetPath": "especificaciones_tecnicas.norma_emisiones", "type": "string" },
  "producción": { "targetPath": "especificaciones_tecnicas.produccion_m3_hr", "type": "string" },
  "tipo de alimentacion": { "targetPath": "especificaciones_tecnicas.tipo_alimentacion", "type": "string", "optional": true },
  "tamaño de tolva de entrada (ancho x alto)": { "targetPath": "especificaciones_tecnicas.tamano_tolva_entrada_mm", "type": "string", "optional": true },
  "tamaño de garganta de alimentacion": { "targetPath": "especificaciones_tecnicas.tamano_garganta_alimentacion_mm", "type": "string", "optional": true },
  "diametro de entrada": { "targetPath": "especificaciones_tecnicas.diametro_entrada_mm", "type": "string", "optional": true },
  // ... añadir más mapeos según sea necesario
  // Categorías a ignorar (no son especificaciones de valor)
  "dimensiones": { "isSpecCategory": true },
  "sistema de potencia": { "isSpecCategory": true },
  "rotacion de la mesa de chipeadora": { "isSpecCategory": true }, // O mapear si es una spec real con valor
  "sistema de alimentacion": { "isSpecCategory": true },
  "emisiones y ruido": { "isSpecCategory": true } // Ejemplo si hay otra categoría
};

function findHeaderRowIndex(dataAoA, keyword, startRow = 0, columnToSearch = 0) {
    for (let i = startRow; i < dataAoA.length; i++) {
        const cellValue = dataAoA[i][columnToSearch]?.toString().trim().toLowerCase();
        if (cellValue === keyword.toLowerCase()) {
            return i;
        }
    }
    return -1; // No encontrado
}

function getSafeCellValue(dataAoA, rowIndex, colIndex) {
    if (dataAoA && dataAoA[rowIndex] && dataAoA[rowIndex][colIndex] !== undefined && dataAoA[rowIndex][colIndex] !== null) {
        return dataAoA[rowIndex][colIndex].toString().trim();
    }
    return ""; // Devolver cadena vacía si no hay valor o está fuera de límites
}

// Función para establecer valor en ruta anidada. Ej: setValueByPath(obj, "a.b.c", 10)
function setValueByPath(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
            current[keys[i]] = {};
        }
        current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
}

// Adaptación de funciones de parseo
const parseStringValue = (value) => value?.toString().trim() || undefined;

const parseNumberValue = (value) => {
    if (value === undefined || value === null || value.toString().trim() === "") return undefined;
    // Intentar extraer solo el número, por si viene con unidades como "750 [kg]" -> 750
    const numericPart = value.toString().match(/^[\d,.]+/);
    if (numericPart) {
      const num = Number(numericPart[0].replace(',', '.')); // Reemplazar coma por punto para decimales
      return isNaN(num) ? undefined : num; // Devolver undefined si no es un número válido
    }
    const numVal = Number(value.toString().replace(',', '.'));
    return isNaN(numVal) ? undefined : numVal;
};

const parseBooleanValue = (value) => {
    const val = value?.toString().trim().toLowerCase();
    if (val === undefined || val === null || val === '') return undefined;
    if (['true', 'verdadero', 'si', '1'].includes(val)) return true;
    if (['false', 'falso', 'no', '0'].includes(val)) return false;
    return undefined; // O lanzar error si se prefiere un booleano estricto
};

const valueParsers = {
    "string": parseStringValue,
    "number": parseNumberValue,
    "boolean": parseBooleanValue,
};
// <<<--- FIN: NUEVAS FUNCIONES AUXILIARES Y CONFIGURACIÓN --- >>>

// <<<--- MODIFICACIÓN DE uploadBulkProducts --- >>>
// ESTA VERSIÓN SERÁ RENOMBRADA a uploadBulkProductsMatrix
const uploadBulkProductsMatrix = async (req, res) => {
    console.log('[Bulk Upload Matrix] Request received.');
    if (!req.file) {
        return res.status(400).json({ message: 'No se subió ningún archivo.' });
    }
    console.log(`[Bulk Upload Matrix] Processing file: ${req.file.originalname}, size: ${req.file.size} bytes`);

    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        // LEER COMO ARRAY DE ARRAYS para estructura matricial
        const dataAoA = xlsx.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });

        if (!dataAoA || dataAoA.length < 3) { // Necesita al menos cabeceras y una fila de datos
            return res.status(400).json({ message: 'No se encontraron suficientes datos o estructura no válida en el archivo Excel subido.' });
        }

        // --- Identificar filas clave y columna de especificaciones ---
        // Asumimos que la columna de nombres de especificaciones es la primera (índice 0)
        const specNameColIndex = 0;
        // Buscar filas de cabecera para Código Fabricante y Modelo
        // Se puede hacer más robusto permitiendo variaciones o configuración
        const codigoFabricanteRowKeyword = "Código Fabricante";
        const modeloRowKeyword = "Modelo";

        let rowIndexCodigoFabricante = findHeaderRowIndex(dataAoA, codigoFabricanteRowKeyword, 0, 0);
        if (rowIndexCodigoFabricante === -1) rowIndexCodigoFabricante = findHeaderRowIndex(dataAoA, codigoFabricanteRowKeyword, 0, 1); // Intentar en columna 1
        if (rowIndexCodigoFabricante === -1) {
             // Fallback: Asumir que está en la segunda fila si no se encuentra la palabra clave
             if (dataAoA.length > 1) rowIndexCodigoFabricante = 1; else throw new Error(`Fila de '${codigoFabricanteRowKeyword}' no encontrada.`);
             console.warn(`[Bulk Upload Matrix] Keyword '${codigoFabricanteRowKeyword}' no encontrada, asumiendo fila ${rowIndexCodigoFabricante + 1}`);
        }
        
        let rowIndexModelo = findHeaderRowIndex(dataAoA, modeloRowKeyword, 0, 0);
         if (rowIndexModelo === -1) rowIndexModelo = findHeaderRowIndex(dataAoA, modeloRowKeyword, 0, 1); // Intentar en columna 1
        if (rowIndexModelo === -1) {
            // Fallback: Asumir que está debajo de Codigo Fabricante si no se encuentra
            if (dataAoA.length > rowIndexCodigoFabricante + 1) rowIndexModelo = rowIndexCodigoFabricante + 1; else throw new Error(`Fila de '${modeloRowKeyword}' no encontrada.`);
            console.warn(`[Bulk Upload Matrix] Keyword '${modeloRowKeyword}' no encontrada, asumiendo fila ${rowIndexModelo + 1}`);
        }


        const startDataColIndex = 1; // Los datos de modelos empiezan en la segunda columna (después de nombres de spec)
        // La primera fila de datos de especificaciones reales. Saltar las filas de "Codigo Fabricante" y "Modelo"
        const startDataRowIndex = Math.max(rowIndexCodigoFabricante, rowIndexModelo) + 1;

        const headerRowCodigos = dataAoA[rowIndexCodigoFabricante];
        const headerRowModelos = dataAoA[rowIndexModelo];

        if (!headerRowCodigos || !headerRowModelos) {
            throw new Error("No se pudieron leer las filas de cabecera para códigos y modelos.");
        }

        let operaciones = [];
        let errores = [];
        let processedModelCount = 0;

        // --- Iterar por Columnas (Modelos) ---
        for (let colIndex = startDataColIndex; colIndex < headerRowCodigos.length; colIndex++) {
            const currentCodigoProducto = getSafeCellValue(dataAoA, rowIndexCodigoFabricante, colIndex);
            if (!currentCodigoProducto) { // Si no hay código de producto en esta columna, saltarla
                console.warn(`[Bulk Upload Matrix] Columna ${colIndex +1} omitida: Falta Codigo_Producto en fila de cabecera.`);
                continue;
            }

            processedModelCount++;
            const currentNombreModelo = getSafeCellValue(dataAoA, rowIndexModelo, colIndex);
            
            let productoData = {
                Codigo_Producto: currentCodigoProducto,
                caracteristicas: { modelo: currentNombreModelo },
                especificaciones_tecnicas: {},
                dimensiones: {},
                datos_contables: {}, // Estos campos necesitarían otra fuente o se dejan vacíos
                detalles: {}, // Idem
                // Se deben añadir otros campos raíz del schema 'Producto' si se conocen
                // ej. categoria, Descripcion, etc. ¿De dónde vendrán?
            };

            // --- Iterar por Filas (Especificaciones) para el modelo actual ---
            for (let rowIndex = startDataRowIndex; rowIndex < dataAoA.length; rowIndex++) {
                const rawSpecName = getSafeCellValue(dataAoA, rowIndex, specNameColIndex);
                if (!rawSpecName) continue; // Fila de especificación vacía

                const normalizedSpecName = rawSpecName.toLowerCase().trim();
                const mappingConfig = specMappings[normalizedSpecName];

                if (!mappingConfig || mappingConfig.isSpecCategory) {
                    // console.log(`[Bulk Upload Matrix] Saltando fila de categoría o sin mapeo: ${rawSpecName}`);
                    continue;
                }

                const rawValue = getSafeCellValue(dataAoA, rowIndex, colIndex);
                if (rawValue === "" && !mappingConfig.optional) { // Considerar si "" debe ser error o simplemente omitido
                     errores.push({
                         rowNumber: rowIndex + 1, // Fila del Excel
                         field: rawSpecName,
                         message: `Valor obligatorio faltante para la especificación '${rawSpecName}'.`,
                         codigo: currentCodigoProducto
                     });
                    continue;
                }
                if (rawValue === "" && mappingConfig.optional) {
                    continue; // Si es opcional y vacío, simplemente no lo añadimos
                }


                const parser = valueParsers[mappingConfig.type] || parseStringValue; // Default a string parser
                let processedValue = parser(rawValue);
                
                // Si el tipo es string y el valor procesado es string vacío, convertir a undefined
                // para que no se guarde como "" a menos que se desee explícitamente.
                if (mappingConfig.type === 'string' && processedValue === '') {
                    processedValue = undefined;
                }


                if (processedValue !== undefined) {
                     // Limpieza específica para campos numéricos que aún pueden tener la unidad en el string original
                    if (mappingConfig.type === 'number' && typeof rawValue === 'string') {
                        const numericOnly = parseFloat(rawValue.replace(/[^\d.-]/g, '').replace(',', '.'));
                        if (!isNaN(numericOnly)) processedValue = numericOnly;
                        else processedValue = undefined; // No se pudo parsear un número limpio
                    }
                     // Si es string y el valor original tenía [unidad], usar el valor original si el parser no lo hizo.
                    if (mappingConfig.type === 'string' && typeof rawValue === 'string' && /\s*\[.*\]/.test(rawValue) ) {
                        processedValue = rawValue;
                    }

                    setValueByPath(productoData, mappingConfig.targetPath, processedValue);
                } else if (!mappingConfig.optional) {
                     errores.push({
                         rowNumber: rowIndex + 1,
                         field: rawSpecName,
                         message: `Valor inválido o no parseable para '${rawSpecName}': '${rawValue}'. Tipo esperado: ${mappingConfig.type}`,
                         codigo: currentCodigoProducto
                     });
                }
            }

            // Limpieza final de sub-objetos vacíos antes de la validación
            ['caracteristicas', 'especificaciones_tecnicas', 'dimensiones', 'datos_contables', 'detalles'].forEach(key => {
                if (productoData[key] && Object.keys(productoData[key]).length === 0) {
                    delete productoData[key];
                }
            });
            
            // Validación del producto individual
            try {
                const tempProduct = new Producto(productoData); // Asumiendo que 'Producto' es el modelo Mongoose importado
                const validationError = tempProduct.validateSync();
                if (validationError) {
                    for (const fieldPath in validationError.errors) {
                        errores.push({
                            rowNumber: 'N/A (Modelo completo)', // Difícil de mapear a una sola fila del Excel
                            field: fieldPath,
                            message: validationError.errors[fieldPath].message,
                            value: validationError.errors[fieldPath].value,
                            codigo: currentCodigoProducto
                        });
                    }
                    console.warn(`[Bulk Upload Matrix] Modelo ${currentCodigoProducto} con errores de validación.`);
                } else {
                    operaciones.push({
                        updateOne: {
                            filter: { Codigo_Producto: productoData.Codigo_Producto },
                            update: { $set: productoData },
                            upsert: true
                        }
                    });
                }
            } catch (modelError) {
                 console.warn(`[Bulk Upload Matrix] Error creando instancia de Producto para ${currentCodigoProducto}: ${modelError.message}`);
                 errores.push({
                     rowNumber: 'N/A', field: 'Creación Modelo',
                     message: modelError.message, codigo: currentCodigoProducto
                 });
            }
        } // Fin del bucle por columnas (modelos)

        console.log(`[Bulk Upload Matrix] Prepared ${operaciones.length} bulk operations for ${processedModelCount} models. Found ${errores.length} initial errors.`);
        
        let resultadoBulkWrite = { upsertedCount: 0, modifiedCount: 0, matchedCount:0, upsertedIds: {}, hasWriteErrors: () => false, getWriteErrors: () => [] };
        let finalErrorList = [...errores];

        if (operaciones.length > 0) {
            try {
                resultadoBulkWrite = await Producto.bulkWrite(operaciones, { ordered: false });
                console.log('[Bulk Upload Matrix] Bulk write operation result:', resultadoBulkWrite);
                if (resultadoBulkWrite.hasWriteErrors()) {
                    resultadoBulkWrite.getWriteErrors().forEach(err => {
                        const codigo = err.err.op?.Codigo_Producto || err.err.op?.$set?.Codigo_Producto || 'Desconocido';
                        finalErrorList.push({
                            rowNumber: 'N/A (DB)', field: 'bulkWrite',
                            message: err.errmsg || 'Error de escritura en Base de Datos',
                            details: `Código de error: ${err.code}`, codigo: codigo
                        });
                    });
                }
            } catch (bulkError) {
                console.error('[Bulk Upload Matrix] Error executing BulkWrite:', bulkError);
                finalErrorList.push({
                    rowNumber: 'N/A (DB)', field: 'bulkWrite General',
                    message: 'Error general durante la operación de escritura masiva.',
                    details: bulkError.message, codigo: 'N/A'
                });
            }
        }

        const resumen = {
            totalModelsInExcel: processedModelCount, // Número de columnas de modelo procesadas
            rowsProcessed: dataAoA.length, // Número de filas leídas del excel (informativo)
            modelsAttemptedInBulk: operaciones.length,
            modelsWithErrors: finalErrorList.filter(e => e.codigo !== 'N/A').map(e => e.codigo).filter((v, i, a) => a.indexOf(v) === i).length,
            inserted: resultadoBulkWrite.upsertedCount || 0,
            updated: resultadoBulkWrite.modifiedCount || 0,
            writeErrorsCount: resultadoBulkWrite.getWriteErrors?.().length || 0,
            errors: finalErrorList
        };
        console.log('[Bulk Upload Matrix] Final Summary:', JSON.stringify(resumen, null, 2));
        
        const status = finalErrorList.length > 0 ? 207 : 200;
        const message = finalErrorList.length > 0 ? `Carga completada con ${finalErrorList.length} errores.` : 'Carga masiva (matriz) completada exitosamente.';
        res.status(status).json({ message, summary: resumen });

    } catch (error) {
        console.error('[Bulk Upload Matrix] General error processing uploaded file:', error);
        res.status(500).json({ message: 'Error interno del servidor al procesar el archivo subido (matriz).', error: error.message });
    }
};
// <<<------------------------------------------------------------>>>

// <<<--- INICIO: FUNCIÓN uploadBulkProducts RECREADA PARA CARGA PLANA (fila por producto) --- >>>
// Esta función es la que adaptamos para las especificaciones técnicas matriciales.
// La renombraremos a uploadTechnicalSpecifications.
const uploadTechnicalSpecifications = async (req, res) => {
    console.log('[Bulk Upload Specs] Request received for technical specifications update.');
    if (!req.file) {
        return res.status(400).json({ message: 'No se subió ningún archivo.' });
    }

    console.log(`[Bulk Upload Specs] Processing file: ${req.file.originalname}, size: ${req.file.size} bytes`);

    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const dataAoA = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null });

        if (!dataAoA || dataAoA.length < 2) { 
            return res.status(400).json({ message: 'El archivo Excel/CSV no contiene suficientes datos (mínimo 2 filas para cabecera y datos).' });
        }

        // 1. Find Header Row
        let headerRowIndex = -1;
        for (let i = 0; i < dataAoA.length; i++) {
            if (dataAoA[i] && dataAoA[i][0] && typeof dataAoA[i][0] === 'string' && dataAoA[i][0].trim().toUpperCase() === 'ESPECIFICACION_ID') {
                headerRowIndex = i;
                break;
            }
        }

        if (headerRowIndex === -1) {
            return res.status(400).json({ message: 'No se encontró la fila de cabecera con "Especificacion_ID" en la primera columna. Verifique el formato del archivo.' });
        }
        
        if (dataAoA.length < headerRowIndex + 2) { // Need at least one data row below header
             return res.status(400).json({ message: 'El archivo no contiene filas de datos debajo de la fila de cabecera.' });
        }

        const productCodesHeaderRow = dataAoA[headerRowIndex];
        const productHeaderCodes = []; 
        
        // 2. Parse Product Codes from Header (starting from 3rd column, index 2)
        // Col 0: Especificacion_ID, Col 1: Descripcion_Especificacion, Col 2 onwards: Product Codes
        for (let j = 2; j < productCodesHeaderRow.length; j++) {
            const code = productCodesHeaderRow[j] ? productCodesHeaderRow[j].toString().trim() : null;
            if (code) {
                productHeaderCodes.push(code);
            } else {
                console.warn(`[Bulk Upload Specs] Columna ${xlsx.utils.encode_col(j)} en la fila de cabecera de códigos de producto está vacía o no es un código válido. Se ignorará esta columna.`);
            }
        }

        if (productHeaderCodes.length === 0) {
            return res.status(400).json({ message: 'No se encontraron códigos de producto válidos en la fila de cabecera (a partir de la tercera columna) del archivo.' });
        }
        
        console.log(`[Bulk Upload Specs] Códigos de producto encontrados en cabecera: ${productHeaderCodes.join(', ')}`);

        let updatesByProduct = {}; 
        let parseErrors = []; // Though not currently populated, keep for future
        
        let currentSectionKey = null; 

        // 3. Parse Specification Data Rows (starting from headerRowIndex + 1)
        for (let i = headerRowIndex + 1; i < dataAoA.length; i++) {
            const currentRow = dataAoA[i];
            if (!currentRow || currentRow.length === 0) { // Skip empty rows
                currentSectionKey = null; // Reset section on empty row
                continue; 
            }

            const especificacionID = currentRow[0] ? currentRow[0].toString().trim() : null;
            // const descripcionEspecificacion = currentRow[1] ? currentRow[1].toString().trim() : null; // Available if needed later

            if (!especificacionID) {
                console.log(`[Bulk Upload Specs] Fila ${i + 1} omitida: Especificacion_ID (columna A) está vacía.`);
                currentSectionKey = null; 
                continue;
            }

            for (let k = 0; k < productHeaderCodes.length; k++) {
                const codigoProducto = productHeaderCodes[k];
                // Values for products start at column index 2 in data rows, corresponding to productHeaderCodes[k]
                const productValueColIndex = k + 2; 

                if (!updatesByProduct[codigoProducto]) {
                    updatesByProduct[codigoProducto] = {
                        especificaciones_tecnicas: {},
                        modelo: null 
                    };
                }
                
                const rawValue = currentRow[productValueColIndex];
                const specValue = (rawValue !== null && rawValue !== undefined && rawValue.toString().trim() !== '') ? rawValue.toString().trim() : null;

                // Section logic: if Especificacion_ID is all caps and cell value for this product is null or same as ID
                // Note: specValue here is for a specific product column, not the "Descripcion_Especificacion" column.
                // A section usually spans all products or has no specific values in product columns for that row.
                // For simplicity, we check if the *especificacionID itself* is all caps.
                // And if the value cell for THIS product under THIS ID is empty, it might just be a section header row.
                // This section logic might need further refinement based on exact CSV layout conventions for sections.
                const isPotentiallySectionTitle = especificacionID.toUpperCase() === especificacionID;

                if (isPotentiallySectionTitle && (specValue === null || specValue === especificacionID)) {
                    // Check if all product columns for this ID row are empty or same as ID to confirm section
                    let allProductCellsIndicateSection = true;
                    for(let m=0; m < productHeaderCodes.length; m++) {
                        const val = currentRow[m+2];
                        if(val !== null && val.toString().trim() !== '' && val.toString().trim() !== especificacionID) {
                            allProductCellsIndicateSection = false;
                            break;
                        }
                    }
                    if(allProductCellsIndicateSection) {
                        currentSectionKey = especificacionID;
                        if (!updatesByProduct[codigoProducto].especificaciones_tecnicas[currentSectionKey]) {
                             updatesByProduct[codigoProducto].especificaciones_tecnicas[currentSectionKey] = {};
                        }
                        // Since it's a section header for this product, break from product loop for this row.
                        // The section is set for all products.
                        // This assignment to currentSectionKey will be used by subsequent rows for this product.
                    } else {
                        // It looked like a section by ID, but has distinct values under products, so treat as regular spec
                        if (specValue !== null) {
                             if (currentSectionKey && updatesByProduct[codigoProducto].especificaciones_tecnicas[currentSectionKey]) {
                                updatesByProduct[codigoProducto].especificaciones_tecnicas[currentSectionKey][especificacionID] = specValue;
                            } else {
                                updatesByProduct[codigoProducto].especificaciones_tecnicas[especificacionID] = specValue;
                            }
                        }
                    }
                } else if (especificacionID.toUpperCase() === "MODELO") {
                    if (specValue !== null) { 
                        updatesByProduct[codigoProducto].modelo = specValue;
                    }
                } else { 
                    if (specValue !== null) { 
                        if (currentSectionKey && updatesByProduct[codigoProducto].especificaciones_tecnicas[currentSectionKey]) {
                            updatesByProduct[codigoProducto].especificaciones_tecnicas[currentSectionKey][especificacionID] = specValue;
                        } else {
                            updatesByProduct[codigoProducto].especificaciones_tecnicas[especificacionID] = specValue;
                        }
                    }
                }
            }
             // If the row was a section title valid for all products, reset currentSectionKey only if it was exclusively a section.
            // This needs to be outside the product loop (k)
            let allCellsEmptyOrSection = true;
            for(let m=0; m < productHeaderCodes.length; m++) {
                const val = currentRow[m+2];
                 if(val !== null && val.toString().trim() !== '' && val.toString().trim() !== especificacionID) {
                    allCellsEmptyOrSection = false;
                    break;
                }
            }
            if(especificacionID.toUpperCase() === especificacionID && allCellsEmptyOrSection) {
                 // it was a global section for all products
                 // currentSectionKey is already set globally from the first product pass
            } else {
                // it was a data row, or a "MODELO" row, reset currentSectionKey so next normal spec is not nested
                // unless the next row explicitly defines a new section.
                // This part is tricky: if the section key is meant to persist across multiple spec lines,
                // it should not be nulled here. The original code nulled it on empty first column.
                // Let's keep original behavior: currentSectionKey persists until a new section or empty first cell.
            }
        }
        
        console.log('[Bulk Upload Specs] Datos parseados del Excel/CSV:', JSON.stringify(updatesByProduct, null, 2));

        if (Object.keys(updatesByProduct).length === 0 && parseErrors.length === 0) {
            return res.status(400).json({ message: 'No se encontraron datos de productos procesables en el archivo Excel según el formato esperado.' });
        }

        let operaciones = [];
        let productosNoEncontrados = [];
        let productosActualizados = 0;
        let productosConErroresDB = [];

        for (const codigoProducto of Object.keys(updatesByProduct)) {
            const updateData = updatesByProduct[codigoProducto];
            
            try {
                const productoExistente = await Producto.findOne({ Codigo_Producto: codigoProducto });

                if (productoExistente) {
                    let fieldsToUpdate = {
                        especificaciones_tecnicas: updateData.especificaciones_tecnicas 
                    };
                    if (updateData.modelo !== null) {
                        fieldsToUpdate['caracteristicas.modelo'] = updateData.modelo; 
                    }
                    
                    if (fieldsToUpdate.especificaciones_tecnicas) {
                        Object.keys(fieldsToUpdate.especificaciones_tecnicas).forEach(key => {
                            if (typeof fieldsToUpdate.especificaciones_tecnicas[key] === 'object' &&
                                Object.keys(fieldsToUpdate.especificaciones_tecnicas[key]).length === 0) {
                                delete fieldsToUpdate.especificaciones_tecnicas[key];
                            }
                        });
                    }

                    operaciones.push({
                        updateOne: {
                            filter: { Codigo_Producto: codigoProducto },
                            update: { $set: fieldsToUpdate }
                        }
                    });
                } else {
                    productosNoEncontrados.push(codigoProducto);
                }
            } catch (dbError) {
                console.error(`[Bulk Upload Specs] Error de DB al buscar producto ${codigoProducto}:`, dbError);
                productosConErroresDB.push({ codigo: codigoProducto, error: dbError.message });
            }
        }

        let resultadoBulkWrite = null;
        if (operaciones.length > 0) {
            try {
                resultadoBulkWrite = await Producto.bulkWrite(operaciones, { ordered: false });
                console.log('[Bulk Upload Specs] Resultado de BulkWrite:', resultadoBulkWrite);
                productosActualizados = resultadoBulkWrite.modifiedCount || 0;
                
                if (resultadoBulkWrite.hasWriteErrors()) {
                    resultadoBulkWrite.getWriteErrors().forEach(err => {
                        const codigo = err.err.op?.filter?.Codigo_Producto || err.err.op?.$set?.Codigo_Producto || 'Desconocido';
                        productosConErroresDB.push({
                            codigo: codigo,
                            message: err.errmsg || 'Error de escritura en BD',
                            details: `Código de error: ${err.code}`
                        });
                    });
                }
            } catch (bulkError) {
                console.error('[Bulk Upload Specs] Error en BulkWrite:', bulkError);
                operaciones.forEach(op => {
                    if (op.updateOne && op.updateOne.filter && op.updateOne.filter.Codigo_Producto) {
                         productosConErroresDB.push({ codigo: op.updateOne.filter.Codigo_Producto, error: bulkError.message || "Error general en bulkWrite" });
                    }
                });
            }
        }
        
        const resumen = {
            totalProductsInExcelHeader: productHeaderCodes.length,
            productsForUpdateAttempt: Object.keys(updatesByProduct).length,
            productsSuccessfullyUpdated: productosActualizados,
            productsNotFound: productosNoEncontrados,
            productsWithParseErrors: parseErrors, 
            productsWithDbErrors: productosConErroresDB
        };

        console.log('[Bulk Upload Specs] Resumen final:', JSON.stringify(resumen, null, 2));

        const hasErrors = productosNoEncontrados.length > 0 || productosConErroresDB.length > 0 || parseErrors.length > 0;
        const status = hasErrors ? 207 : (operaciones.length > 0 ? 200 : 400); 
        let message = 'Actualización de especificaciones completada.';
        if (productosActualizados > 0) message = `Actualización de especificaciones completada. Productos actualizados: ${productosActualizados}.`;
        if (hasErrors) message += ` Se encontraron problemas.`;

        return res.status(status).json({ message, summary: resumen });

    } catch (error) {
        console.error('[Bulk Upload Specs] Error general procesando el archivo subido:', error);
        if (error.message && (error.message.includes("Cannot find zip comment") || error.message.includes("Corrupted zip"))) {
             return res.status(400).json({ message: 'El archivo subido no parece ser un archivo Excel válido o está corrupto.', error: error.message });
        }
        return res.status(500).json({ message: 'Error interno del servidor al procesar el archivo de especificaciones.', error: error.message });
    }
};
// <<<--- FIN: FUNCIÓN uploadTechnicalSpecifications (antes uploadBulkProducts para carga plana) --- >>>


// --- Exportaciones (asegurar que todas las necesarias estén aquí) ---\
module.exports = {
    cargarProductosDesdeExcel,
    createIndividualEquipment,
    fetchProducts, 
    getCachedProducts, 
    fetchFilteredProductsController, 
    fetchCurrencyValuesController, 
    getCachedDollarValue, 
    getCachedEuroValue,
    getAllCachedValues, 
    clearCache, 
    getProductDetail, 
    getOptionalProducts, 
    resetCache, 
    uploadTechnicalSpecifications, // Nueva función para especificaciones matriciales
    uploadBulkProductsMatrix, // Para la carga general de productos (plantilla general)
}; 