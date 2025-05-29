const axios = require('axios');
const xlsx = require('xlsx');
const Producto = require('../models/Producto');
const asyncHandler = require('express-async-handler');

// Etiquetas de los webhooks
const WEBHOOKS = {
  EQUIPOS: 'https://n8n-807184488368.southamerica-west1.run.app/webhook/6f697684-4cfc-4bc1-8918-bfffc9f20b9f',
  OPCIONALES: 'https://n8n-807184488368.southamerica-west1.run.app/webhook/ac8b70a7-6be5-4e1a-87b3-3813464dd254',
  DETALLES: 'https://n8n-807184488368.southamerica-west1.run.app/webhook/c02247e7-84f0-49b3-a2df-28817da48017',
  VALOR_DOLAR_EURO: 'https://n8n-807184488368.southamerica-west1.run.app/webhook/8012d60e-8a29-4910-b385-6514edc3d912'
};

/**
 * Obtiene todos los productos disponibles.
 * Webhook: WEBHOOKS.EQUIPOS
 * Método: GET
 * Retorna: Array de productos.
 */
const fetchAvailableProducts = async () => {
  try {
    const response = await axios.get(WEBHOOKS.EQUIPOS);
    return response.data;
  } catch (error) {
    console.error('Error fetching products:', error);
    throw new Error('Failed to fetch products');
  }
};

/**
 * Obtiene productos filtrados según los parámetros de consulta.
 * Webhook: WEBHOOKS.OPCIONALES
 * Método: GET
 * Parámetros: query (filtros de búsqueda)
 * Retorna: Array de productos filtrados.
 */
const fetchFilteredProducts = async (query) => {
  try {
    console.log('Enviando solicitud a webhook de OPCIONALES con parámetros:', query);
    console.log('URL del webhook:', WEBHOOKS.OPCIONALES);
    
    const response = await axios.get(WEBHOOKS.OPCIONALES, {
      params: query,
      timeout: 10000 // 10 segundos de timeout
    });
    
    console.log('Respuesta recibida del webhook OPCIONALES');
    
    // Verificar que la respuesta sea un array
    if (!Array.isArray(response.data)) {
      console.error('La respuesta no es un array:', response.data);
      // Si no es un array pero tiene alguna estructura de datos, intentamos extraer los productos
      if (response.data && typeof response.data === 'object') {
        // Buscar propiedades que podrían contener los productos
        const possibleArrayProps = ['data', 'products', 'items', 'results'];
        for (const prop of possibleArrayProps) {
          if (Array.isArray(response.data[prop])) {
            console.log(`Encontrados productos en propiedad: ${prop}`);
            return response.data[prop];
          }
        }
      }
      
      // Si llegamos aquí, no pudimos encontrar un array
      return []; // Devolver array vacío en lugar de lanzar error
    }
    
    return response.data;
  } catch (error) {
    console.error('Error fetching filtered products:', error.message);
    
    // Más información sobre el error para debug
    if (error.response) {
      // El servidor respondió con un código de error
      console.error('Error response data:', error.response.data);
      console.error('Error response status:', error.response.status);
      console.error('Error response headers:', error.response.headers);
      throw new Error(`Failed to fetch filtered products: Server responded with ${error.response.status}`);
    } else if (error.request) {
      // La petición fue hecha pero no se recibió respuesta
      console.error('Error request:', error.request);
      throw new Error('Failed to fetch filtered products: No response received from server');
    } else {
      // Algo ocurrió al configurar la petición
      console.error('Error config:', error.config);
      throw new Error(`Failed to fetch filtered products: ${error.message}`);
    }
  }
};

/**
 * Obtiene productos opcionales basados en los parámetros proporcionados.
 * Webhook: WEBHOOKS.OPCIONALES
 * Método: GET
 * Parámetros: query (código, modelo, categoría)
 * Retorna: Array de productos opcionales relacionados.
 */
const fetchOptionalProducts = async (query) => {
  try {
    const response = await axios.get(WEBHOOKS.OPCIONALES, {
      params: query,
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching optional products:', error);
    throw new Error('Failed to fetch optional products');
  }
};

/**
 * Obtiene los valores actuales de dólar y euro, junto con la fecha.
 * Webhook: WEBHOOKS.VALOR_DOLAR_EURO
 * Método: GET
 * Retorna: Objeto con los valores de dólar, euro y fecha.
 */
const fetchCurrencyValues = async () => {
  try {
    console.log('Fetching currency values from webhook...');
    const response = await axios.get(WEBHOOKS.VALOR_DOLAR_EURO);

    console.log('Webhook response:', response.data);

    // Validar que la respuesta contenga los campos necesarios
    if (!response.data || !response.data.Valor_Dolar || !response.data.Valor_Euro || !response.data.Fecha) {
      console.error('Missing required fields in response:', response.data);
      throw new Error('Missing required currency fields in response');
    }

    return response.data;
  } catch (error) {
    console.error('Error in fetchCurrencyValues:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    throw new Error(`Failed to fetch currency values: ${error.message}`);
  }
};

/**
 * Obtiene los detalles de un producto específico.
 * Webhook: WEBHOOKS.DETALLES
 * Método: POST
 * Parámetros: query (código, modelo, categoría)
 * Retorna: Detalles del producto.
 */
const fetchProductDetails = async (query) => {
  try {
    const response = await axios.post(WEBHOOKS.DETALLES, { query });
    return response.data;
  } catch (error) {
    console.error('Error fetching product details:', error);
    throw new Error('Failed to fetch product details');
  }
};

// Helper function to safely get cell value
const getSafeCellValue = (data, rowIndex, colIndex, defaultValue = null) => {
    if (data && data[rowIndex] && data[rowIndex][colIndex] !== undefined && data[rowIndex][colIndex] !== null) {
        // Basic trimming for strings, handle numbers etc.
        const cellValue = data[rowIndex][colIndex];
        if (typeof cellValue === 'string') {
             const trimmedValue = cellValue.trim();
             // Considerar si los strings vacíos trimmeados deben ser null
             return trimmedValue === '' ? null : trimmedValue;
        }
        return cellValue; // Return numbers, booleans, errors etc. directly
    }
    return defaultValue; // Returns null for undefined or null cells
};

// Helper function to check if a string looks like a section title (all caps, min length, no typical value chars)
const looksLikeTitle = (text) => {
    if (typeof text !== 'string' || text.length < 3) { // Minimum length for a title
        return false;
    }
    // Check if it's all uppercase (ignoring spaces and non-alphanumeric)
    const alphanumericOnly = text.replace(/[^a-zA-Z0-9]/g, '');
    if (alphanumericOnly.length === 0) return false; // Avoid strings with only symbols passing

    const isUpperCase = alphanumericOnly.toUpperCase() === alphanumericOnly && alphanumericOnly !== ''; // Must be uppercase and not empty
    
    // Heuristic: check for characters common in values but not titles (optional, can be refined)
    // const valueChars = /[0-9\/\-\,\.]/; // Example: numbers, slashes, hyphens, commas, dots
    // const containsValueChars = valueChars.test(alphanumericOnly);

    return isUpperCase; // Focus primarily on uppercase for now
};

// Helper function to clean keys for database fields (snake_case)
const cleanKey = (text) => {
    if (typeof text !== 'string') return '';
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); // Clean accents, non-alphanum, trim underscores
};

const uploadTechnicalSpecifications = asyncHandler(async (req, res) => {
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
                message: 'El archivo debe ser un archivo Excel válido (.xls, .xlsx).'
            });
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });

        // Asumir que los datos están en la primera hoja
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convertir la hoja a un array de arrays.
        // header: 1 - la primera fila del Excel se tratará como la cabecera y no se incluirá en los datos. Los datos comenzarán desde la fila 2.
        // defval: null - celdas vacías serán null.
        // raw: true - intentar obtener valores sin formato.
        const dataAoA = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: true });

        // Ajuste para header:1 - si la primera fila tiene encabezados de producto, necesitamos leerla primero
        // Leer toda la hoja incluyendo la primera fila como datos
         const dataAoA_full = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: true });

        if (!dataAoA_full || dataAoA_full.length < 2 || dataAoA_full[0].length < 2) { // Mínimo 2 filas (cabecera, 1 dato) y 2 columnas (nombre, 1 producto)
            return res.status(400).json({
                success: false,
                message: 'El archivo no tiene el formato esperado (mínimo 2 filas y 2 columnas).'
            });
        }

        // Asumir que la primera fila contiene los códigos de producto
        const headerRow = dataAoA_full[0];
        // Extraer códigos de producto a partir de la segunda columna (índice 1)
        const productCodes = headerRow.slice(1)
            .map(code => getSafeCellValue(null, null, null, code)) // Usar helper para limpieza inicial
            .filter(code => code !== null && code !== ''); // Filtrar códigos vacíos o null

        if (productCodes.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No se encontraron códigos de producto válidos en la primera fila del archivo Excel.'
            });
        }

        console.log(`[Bulk Upload Specs] Found ${productCodes.length} product codes: ${productCodes.join(', ')}`);

        // Estructura para almacenar las especificaciones técnicas parseadas para CADA producto
        // productsSpecifications[codigo_producto] = array_ordenado_de_objetos_fila
        const productsSpecifications = {};
        productCodes.forEach(code => {
            productsSpecifications[code] = [];
        });

        let currentPath = []; // Para rastrear la jerarquía de secciones (claves limpias)
        const startDataRowIndex = 1; // Los datos de especificaciones empiezan en la segunda fila (índice 1)

        // Iterar sobre las filas de datos de especificaciones (desde la segunda fila del Excel completo)
        for (let i = startDataRowIndex; i < dataAoA_full.length; i++) {
            const row = dataAoA_full[i];
            if (!row || row.length === 0) {
                 // Si es una fila completamente vacía, resetear el camino de anidación
                 currentPath = [];
                 console.log(`[Bulk Upload Specs] Row ${i + 1}: Empty row, resetting path.`);
                 continue;
            }

            const rowTitleRaw = getSafeCellValue(null, null, null, row[0]);

            if (!rowTitleRaw) {
                 // Si la primera columna está vacía, también resetear camino (considerar como separador/fila sin nombre)
                 currentPath = [];
                 console.log(`[Bulk Upload Specs] Row ${i + 1}: Empty first column, resetting path.`);
                 continue;
            }

            const cleanedRowTitle = cleanKey(rowTitleRaw);

            // Heurística mejorada: Es título si TODAS las celdas de producto en esta fila están vacías Y el texto parece un título
            // Debemos verificar solo las celdas correspondientes a los productCodes que identificamos
            const productDataCells = row.slice(1, 1 + productCodes.length); // Celdas desde la col B hasta la última col de producto
            const allProductDataCellsEmpty = productDataCells.every(cell => getSafeCellValue(null, null, null, cell) === null); // Usar helper para null check

            const isSectionTitle = allProductDataCellsEmpty && looksLikeTitle(rowTitleRaw);

             // Crear el objeto que representa esta fila para guardarlo en el array de especificaciones
             const rowObjectBase = {
                 nombre: rowTitleRaw, // Nombre original del Excel para mostrar en UI
                 clave: cleanedRowTitle, // Clave limpia para uso programático/anidación
                 tipo: isSectionTitle ? 'titulo' : 'caracteristica',
                 path: [...currentPath], // Copia del path actual (para posible uso en UI jerárquica)
                 // valores: {} // Los valores específicos para cada producto se añadirán por producto
            };


            if (isSectionTitle) {
                // Si es un título de sección, actualizar la ruta actual
                // Lógica de path simple: cada título principal reemplaza el último en el path.
                // Si se necesita jerarquía multi-nivel, se requiere push/pop más inteligente.
                 currentPath = [cleanedRowTitle]; // Establecer el path con este nuevo título principal
                 console.log(`[Bulk Upload Specs] Row ${i + 1}: Identified as TITLE "${rowTitleRaw}". New path: ${currentPath.join(' > ')}`);

            } else {
                // Si es una característica, extraer los valores para cada producto y añadir a cada producto
                console.log(`[Bulk Upload Specs] Row ${i + 1}: Identified as CHARACTERISTIC "${rowTitleRaw}". Path: ${currentPath.join(' > ')}`);

                productCodes.forEach((code, index) => {
                    const value = getSafeCellValue(null, null, null, row[index + 1]); // Valor en la columna del producto

                    // Crear un objeto específico para este producto y esta fila
                    const productRowData = {
                        ...rowObjectBase,
                         valor: value // Incluir el valor específico para este producto
                    };

                    // Añadir este objeto de fila al array de especificaciones de ESTE producto
                    if (productsSpecifications[code]) {
                        productsSpecifications[code].push(productRowData);
                    } else {
                        console.warn(`[Bulk Upload Specs] Row ${i + 1}: Product code ${code} not found in initial header mapping. Skipping.`);
                    }
                });

                 // Después de una característica, el path no cambia, a menos que la siguiente fila sea un nuevo título o vacía.
            }
        }

        console.log('[Bulk Upload Specs] Finished parsing Excel data.');
        // console.log('Parsed Specifications (example for first product):', JSON.stringify(productsSpecifications[productCodes[0]], null, 2));


        // --- Preparar operaciones de bulkWrite ---
        let operaciones = [];
        let productosConErroresDB = [];
        let productosNoEncontradosCount = 0;


        // Iterar sobre los productos que identificamos en la cabecera
        for (const productCode of productCodes) {
            const productSpecsArray = productsSpecifications[productCode];

            if (productSpecsArray && productSpecsArray.length > 0) {
                 // Construir el objeto de actualización
                 const updateDoc = {
                     $set: {
                         especificaciones_tecnicas: productSpecsArray // Guardar el array completo ordenado
                         // Otros campos del producto se actualizarían en otra carga masiva si aplica
                     }
                 };

                operaciones.push({
                    updateOne: {
                        filter: { Codigo_Producto: String(productCode).trim() }, // Asegurar que el código sea string y trimeado para el filtro
                        update: updateDoc,
                        upsert: false // Solo actualizar productos existentes
                    }
                });
            } else {
                console.warn(`[Bulk Upload Specs] No specification rows parsed for product code: ${productCode}. Skipping update for this product.`);
                 // Considerar añadir a una lista de advertencia si se desea reportar
            }
        }

        console.log(`[Bulk Upload Specs] Prepared ${operaciones.length} bulk write operations for ${productCodes.length} products.`);

        let resultadoBulkWrite = { modifiedCount: 0, upsertedCount: 0, matchedCount: 0, hasWriteErrors: () => false, getWriteErrors: () => [] };

        if (operaciones.length > 0) {
            try {
                // Ejecutar las operaciones de bulkWrite
                resultadoBulkWrite = await Producto.bulkWrite(operaciones, { ordered: false }); // ordered: false para continuar si hay errores individuales

                console.log('[Bulk Upload Specs] Resultado de BulkWrite:', resultadoBulkWrite);

                if (resultadoBulkWrite.hasWriteErrors()) {
                    resultadoBulkWrite.getWriteErrors().forEach(err => {
                        // Intentar extraer el código del producto del filtro de la operación que falló
                        const codigoMatch = err.err.op?.updateOne?.filter?.Codigo_Producto;
                        const codigo = codigoMatch ? String(codigoMatch) : 'Desconocido';

                        productosConErroresDB.push({
                            codigo: codigo,
                            message: err.errmsg || 'Error de escritura en BD',
                            details: `Código de error: ${err.code}`
                        });
                    });
                }

                 // Calcular productos no encontrados o sin modificar (donde matchedCount < operaciones.length y no hay write error explícito)
                 // Esto es una aproximación. Un matchedCount de 0 para una operación de updateOne con upsert:false
                 // significa que el documento no existía O el documento existía pero no se necesitaba modificar (aunque aquí siempre estamos haciendo $set).
                 // La forma más precisa de saber si un producto no existía es consultar antes o usar upsert:true y ver upsertedCount.
                 // Basándonos en la necesidad de solo ACTUALIZAR, matchedCount es el indicador clave de cuántos productos *encontrados* fueron *considerados* para actualización.
                 // Si matchedCount < operaciones.length, implica que algunos códigos de la cabecera NO fueron encontrados.
                 productosNoEncontradosCount = operaciones.length - (resultadoBulkWrite.matchedCount || 0);
                 // Considerar que matchedCount podría ser > modifiedCount si los datos $set eran idénticos a lo que ya existía.
                 // productsSuccessfullyUpdated debería ser modifiedCount.
                 let productsSuccessfullyUpdated = resultadoBulkWrite.modifiedCount || 0;


            } catch (bulkError) {
                console.error('[Bulk Upload Specs] Error general en BulkWrite:', bulkError);
                // Si hay un error a nivel de bulkWrite (no errores individuales de escritura), se captura aquí.
                 res.status(500).json({
                     success: false,
                     message: 'Error general durante la actualización masiva en la base de datos.',
                     error: bulkError.message,
                     writeErrors: bulkError.writeErrors || [] // Incluir errores de escritura individual si están disponibles
                 });
                 return; // Terminar la ejecución
            }
        } else {
             console.log('[Bulk Upload Specs] No operations to perform, likely no product codes found or no specification rows parsed.');
              res.status(400).json({
                success: false,
                message: 'No se generaron operaciones de actualización. Verifique el formato del archivo y si hay códigos de producto válidos.'
              });
              return;
        }


        // Enviar respuesta resumen
        const hasErrors = productosConErroresDB.length > 0 || productosNoEncontradosCount > 0;
        const status = hasErrors ? 207 : 200;
        const message = hasErrors ?
                        `Procesamiento completado con advertencias o errores. Productos no encontrados: ${productosNoEncontradosCount}, Errores de BD al actualizar: ${productosConErroresDB.length}` :
                        `Especificaciones técnicas de ${resultadoBulkWrite.modifiedCount || 0} productos actualizadas exitosamente.`;

        res.status(status).json({
            success: !hasErrors, // false si hay errores o no encontrados
            message: message,
            summary: {
                totalProductsInExcelHeader: productCodes.length,
                productsAttemptedToUpdate: operaciones.length, // Cuántas operaciones de updateOne se crearon
                productsSuccessfullyUpdated: resultadoBulkWrite.modifiedCount || 0, // Cuántos documentos fueron REALMENTE modificados
                productsFoundButNotModified: (resultadoBulkWrite.matchedCount || 0) - (resultadoBulkWrite.modifiedCount || 0), // Encontrados pero sin cambios
                productsNotFoundInDB: productosNoEncontradosCount, // Calculado si matchedCount < operaciones.length
                productsWithDbErrors: productosConErroresDB.length, // Errores explícitos de escritura
            },
             errors: productosConErroresDB, // Lista detallada de errores de DB
             warnings: productosNoEncontradosCount > 0 ? [{ message: `Se encontraron ${productosNoEncontradosCount} códigos de producto en el archivo que no existen en la base de datos.` }] : [] // Advertencia por no encontrados
        });

    } catch (error) {
        console.error('[Bulk Upload Specs] Error general processing uploaded file:', error);
        // Mejorar el manejo de errores generales
        let errorMessage = 'Error interno del servidor al procesar el archivo de especificaciones.';
        if (error instanceof SyntaxError) {
            errorMessage = 'Error de sintaxis al procesar el archivo (ej. JSON inválido si se esperaba).';
        } else if (error.message.includes('Sheet not found')) {
             errorMessage = 'La hoja de cálculo especificada no fue encontrada.';
        } // Puedes añadir más tipos de error si identificas patrones

        res.status(500).json({
            success: false,
            message: errorMessage,
            error: error.message
        });
    }
});

module.exports = { 
  fetchAvailableProducts, 
  fetchFilteredProducts, 
  fetchCurrencyValues, 
  fetchProductDetails,
  fetchOptionalProducts,
  uploadTechnicalSpecifications
};