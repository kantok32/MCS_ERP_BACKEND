const axios = require('axios');

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
const getSafeCellValue = (cellValue, defaultValue = null) => {
    if (cellValue !== undefined && cellValue !== null) {
        const value = String(cellValue).trim(); // Siempre convertir a string y trim
        return value === '' ? null : value; // Considerar strings vacíos como null
    }
    return defaultValue; // Returns null for undefined or null cells
};

// Helper function to check if a string looks like a section title (all caps, min length, improved check)
const looksLikeTitle = (text) => {
    if (typeof text !== 'string' || text.length < 3) { // Minimum length for a title
        return false;
    }
    const trimmedText = text.trim();
    if (trimmedText === '') return false;

    // Heuristic 1: Is it all uppercase (ignoring spaces and symbols)?
    const alphanumericOnly = trimmedText.replace(/[^a-zA-Z0-9]/g, '');
    const isUpperCase = alphanumericOnly.length > 0 && alphanumericOnly.toUpperCase() === alphanumericOnly;

    // Heuristic 2 (Optional - based on observing patterns): Does it contain characters uncommon in titles but common in values?
    // For example, numbers, slashes, brackets like [], units like [m], [kg] etc.
    // This might be too complex or error-prone without more examples.
    // Let's stick to a combination of empty cells and uppercase for now.

    return isUpperCase; // Primary heuristic based on observation
};

// Helper function to clean keys for database fields (snake_case)
const cleanKey = (text) => {
    if (typeof text !== 'string') return '';
    return text
        .trim() // Trim whitespace
        .toLowerCase() // Convert to lowercase
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/[^a-z0-9]+/g, '_') // Replace non-alphanumeric with underscore
        .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
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

        // Leer toda la hoja como un array de arrays, incluyendo la primera fila como datos
        // defval: null - celdas vacías serán null.
        // raw: true - intentar obtener valores sin formato (útil para números/fechas pero trim() los convierte a string de nuevo).
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
            .map(code => getSafeCellValue(code)) // Usar helper para limpieza inicial (trim, null for empty)
            .filter(code => code !== null); // Filtrar códigos null (celdas vacías en cabecera)

        if (productCodes.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No se encontraron códigos de producto válidos en la primera fila del archivo Excel (Columna B en adelante).'
            });
        }

        console.log(`[Bulk Upload Specs] Found ${productCodes.length} product codes in header: ${productCodes.join(', ')}`);

        // Estructura para almacenar las especificaciones técnicas parseadas para CADA producto
        // productsSpecifications[codigo_producto] = array_ordenado_de_objetos_fila
        const productsSpecifications = {};
        productCodes.forEach(code => {
            productsSpecifications[code] = [];
        });

        let currentPath = []; // Para rastrear la jerarquía de secciones (claves limpias de títulos)
        const startDataRowIndex = 1; // Los datos de especificaciones empiezan en la segunda fila (índice 1)

        // Iterar sobre las filas de datos de especificaciones (desde la segunda fila del Excel completo)
        for (let i = startDataRowIndex; i < dataAoA_full.length; i++) {
            const row = dataAoA_full[i];
            // Si la fila está completamente vacía o la primera columna está vacía, resetear el camino de anidación
             const rowTitleRaw = getSafeCellValue(row[0]);
            if (!row || row.length === 0 || !rowTitleRaw) {
                 currentPath = [];
                 if (!rowTitleRaw) console.log(`[Bulk Upload Specs] Row ${i + 1}: Empty first column, resetting path.`);
                 else console.log(`[Bulk Upload Specs] Row ${i + 1}: Empty row, resetting path.`);
                 continue;
            }

            const cleanedRowTitle = cleanKey(rowTitleRaw);

            // Heurística mejorada: Es título si TODAS las celdas de producto en esta fila están vacías Y el texto parece un título
            // Verificar solo las celdas correspondientes a los productCodes que identificamos
            const productDataCells = row.slice(1, 1 + productCodes.length); // Celdas desde la col B hasta la última col de producto
            const allProductDataCellsEmpty = productDataCells.every(cell => getSafeCellValue(cell) === null); // Usar helper para null check

            const isSectionTitle = allProductDataCellsEmpty && looksLikeTitle(rowTitleRaw);


            if (isSectionTitle) {
                // Si es un título de sección, actualizar la ruta actual
                // Lógica de path simple: cada título principal reemplaza el camino anterior.
                 currentPath = [cleanedRowTitle]; // Establecer el path con este nuevo título principal
                 console.log(`[Bulk Upload Specs] Row ${i + 1}: Identified as TITLE "${rowTitleRaw}". New path: ${currentPath.join(' > ')}`);

                // Crear un objeto para representar la fila del título (opcional, pero ayuda a mantener la estructura en el array)
                 const titleRowObject = {
                     nombre: rowTitleRaw,
                     clave: cleanedRowTitle,
                     tipo: 'titulo',
                     path: [...currentPath],
                     // Los títulos no tienen un 'valor' directo asociado a un producto en su propia fila
                     // Podríamos añadir un campo 'valores' vacío o simplemente omitirlo si no se usa.
                     // Para consistencia, añadiremos 'valores' que estará vacío para títulos.
                     valores: {} // No hay valores de producto en la fila del título
                 };

                 // Añadir este objeto de título al array de especificaciones de CADA producto
                 productCodes.forEach(code => {
                     if (productsSpecifications[code]) {
                         productsSpecifications[code].push(titleRowObject);
                     }
                 });


            } else {
                // Si es una característica, extraer los valores para cada producto y añadir a cada producto
                console.log(`[Bulk Upload Specs] Row ${i + 1}: Identified as CHARACTERISTIC "${rowTitleRaw}". Path: ${currentPath.join(' > ')}`);

                productCodes.forEach((code, index) => {
                    const value = getSafeCellValue(row[index + 1]); // Valor en la columna del producto para este producto

                    // Crear un objeto específico para este producto y esta fila de característica
                    const characteristicRowObject = {
                        nombre: rowTitleRaw, // Nombre original de la característica
                        clave: cleanedRowTitle, // Clave limpia de la característica
                        tipo: 'caracteristica',
                        path: [...currentPath], // Path de secciones padres
                        valor: value // El valor específico para ESTE producto en ESTA fila
                    };

                    // Añadir este objeto de fila al array de especificaciones de ESTE producto
                    if (productsSpecifications[code]) {
                        productsSpecifications[code].push(characteristicRowObject);
                    } else {
                        console.warn(`[Bulk Upload Specs] Row ${i + 1}: Product code ${code} not found in initial header mapping. Skipping adding characteristic.`);
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

            // Si no se encontraron filas de especificación parseadas para este producto (lo cual sería raro si el código existe),
            // o si solo se encontraron títulos y no queremos guardar títulos sin características, podríamos omitir la actualización.
            // Sin embargo, para mantener la estructura completa del Excel (incluyendo títulos), siempre guardamos el array si hay un código de producto válido.
            if (productSpecsArray) { // Siempre habrá un array si el código estaba en la cabecera, puede estar vacío.
                 const updateDoc = {
                     $set: {
                         especificaciones_tecnicas: productSpecsArray // Guardar el array completo ordenado (puede estar vacío si no hay filas parseadas)
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
                console.warn(`[Bulk Upload Specs] productSpecifications array not initialized for code: ${productCode}. This should not happen if code was in header.`);
                 // Esto indicaría un problema con la inicialización o los productCodes.
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
                 // matchedCount es el número de documentos que coincidieron con el filtro.
                 // Si matchedCount < operaciones.length, algunos documentos no se encontraron para actualizar.
                 productosNoEncontradosCount = operaciones.length - (resultadoBulkWrite.matchedCount || 0);
                 // modifiedCount es el número de documentos que REALMENTE fueron modificados.
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
              // Dependiendo de si la ausencia de operaciones es un error, podríamos devolver 400.
              // Si productCodes.length > 0 pero operaciones.length es 0, es un problema.
              if (productCodes.length > 0) {
                   res.status(400).json({
                    success: false,
                    message: 'Se encontraron códigos de producto en la cabecera, pero no se generaron operaciones de actualización. Verifique el formato de las filas de especificación.'
                  });
              } else {
                  // Esto ya se manejó al inicio si productCodes.length === 0
                   res.status(400).json({
                    success: false,
                    message: 'No se encontraron códigos de producto válidos en la primera fila del archivo Excel.'
                  });
              }
              return;
        }


        // Refrescar el caché global después de procesar todos los productos
        try {
            // Asegúrate de que initializeProductCache() actualiza el caché global usado por getCachedProducts etc.
            // Esta función parece no estar definida en este archivo. Debería estar en mongoDataService o similar.
            // Comentarla si no está disponible o si el caché se maneja de otra forma.
            // await initializeProductCache();
            console.log('Cache refresh logic needs to be called from appropriate service.');
        } catch (cacheError) {
            console.error('Error calling cache refresh logic:', cacheError);
        }


        // Enviar respuesta resumen
        const hasErrors = productosConErroresDB.length > 0 || productosNoEncontradosCount > 0;
        const status = hasErrors ? 207 : 200; // 207 Multi-Status si hay éxito parcial con errores/advertencias
        const message = hasErrors ?
                        `Procesamiento completado con advertencias o errores. Productos no encontrados: ${productosNoEncontradosCount}, Errores de BD al actualizar: ${productosConErroresDB.length}` :
                        `Especificaciones técnicas de ${resultadoBulkWrite.modifiedCount || 0} productos actualizadas exitosamente.`;

        res.status(status).json({
            success: !hasErrors, // true si no hay errores ni no encontrados, false en caso contrario
            message: message,
            summary: {
                totalProductsInExcelHeader: productCodes.length, // Total de códigos en la cabecera
                productsAttemptedToUpdate: operaciones.length, // Número de operaciones de updateOne generadas
                productsSuccessfullyUpdated: resultadoBulkWrite.modifiedCount || 0, // Documentos realmente modificados en BD
                productsFoundButNotModified: (resultadoBulkWrite.matchedCount || 0) - (resultadoBulkWrite.modifiedCount || 0), // Documentos encontrados pero que no cambiaron (siempre 0 con $set?)
                productsNotFoundInDB: productosNoEncontradosCount, // Códigos de cabecera sin documento coincidente
                productsWithDbErrors: productosConErroresDB.length, // Errores explícitos de escritura de DB
            },
             errors: productosConErroresDB, // Lista detallada de errores de DB
             warnings: productosNoEncontradosCount > 0 ? [{ message: `Se encontraron ${productosNoEncontradosCount} códigos de producto en el archivo que no existen en la base de datos.` }] : [] // Advertencia por no encontrados
        });

    } catch (error) {
        console.error('[Bulk Upload Specs] Error general processing uploaded file:', error);
        // Mejorar el manejo de errores generales
        let errorMessage = 'Error interno del servidor al procesar el archivo de especificaciones.';
        // Puedes añadir más tipos de error si identificas patrones específicos (ej. formato de archivo inválido)
        if (error instanceof Error) {
             errorMessage = `Error al procesar el archivo: ${error.message}`;
        }


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
  fetchOptionalProducts
};