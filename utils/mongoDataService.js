const { MongoClient } = require('mongodb');

// Loguear el valor crudo de process.env.DB_NAME y MONGO_URI al inicio del módulo
console.log(`[mongoDataService - INIT] Raw process.env.MONGO_URI: ${process.env.MONGO_URI}`);
console.log(`[mongoDataService - INIT] Raw process.env.DB_NAME: ${process.env.DB_NAME}`);

const MONGO_URI = process.env.MONGO_URI; // Es mejor que MONGO_URI siempre venga de las variables de entorno
const DB_NAME = process.env.DB_NAME || 'Productos'; // El fallback 'Productos' se usa si process.env.DB_NAME es undefined

// Loguear el valor de DB_NAME que se usará efectivamente
console.log(`[mongoDataService - INIT] Effective DB_NAME to be used: ${DB_NAME}`);

let client;
let dbInstance;

const connectDB = async () => {
  if (dbInstance) {
    return dbInstance;
  }
  if (!MONGO_URI) {
    throw new Error('MongoDB URI no está definida. Por favor, configura la variable de entorno MONGO_URI.');
  }
  try {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    dbInstance = client.db(DB_NAME);
    console.log(`Successfully connected to MongoDB database: ${DB_NAME}`);
    return dbInstance;
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw error; // Re-lanzar el error para que sea manejado por quien llama
  }
};

const getDB = async () => {
  if (!dbInstance) {
    return await connectDB();
  }
  return dbInstance;
};

const fetchBaseProductsFromDB = async () => {
  try {
    const db = await getDB();
    const productsCollection = db.collection('Productos');

    console.log(`[mongoDataService] Connected to DB: ${db.databaseName}`);
    console.log(`[mongoDataService] Targeting collection: ${productsCollection.collectionName}`);

    const documentCount = await productsCollection.countDocuments({});
    console.log(`[mongoDataSvc] MongoDB reports ${documentCount} documents in collection '${productsCollection.collectionName}' using countDocuments({}).`);

    const query = {};
    console.log(`[mongoDataSvc] Fetching ALL products from DB: ${DB_NAME}, Collection: ${productsCollection.collectionName} with query: ${JSON.stringify(query)}`);
    
    const productsFromDB = await productsCollection.find(query).toArray();
    
    const transformedProducts = productsFromDB.map(p => {
      const productoTransformado = { ...p }; // Copia superficial

      // Mapear Codigo_Producto a codigo_producto si es necesario y si el frontend lo espera así
      if (p.Codigo_Producto && !p.codigo_producto) {
        productoTransformado.codigo_producto = p.Codigo_Producto;
      }

      if (p.caracteristicas && typeof p.caracteristicas === 'object') {
        if (p.caracteristicas.nombre_del_producto) {
          productoTransformado.nombre_del_producto = p.caracteristicas.nombre_del_producto;
        }
        // Frontend espera 'Descripcion' (mayúscula), DB tiene 'descripcion' (minúscula)
        if (p.caracteristicas.descripcion) { 
          productoTransformado.Descripcion = p.caracteristicas.descripcion;
        }
        // Frontend espera 'Modelo' (mayúscula), DB tiene 'modelo' (minúscula)
        if (p.caracteristicas.modelo) { 
          productoTransformado.Modelo = p.caracteristicas.modelo;
        }
        // Mover 'categoria' de caracteristicas al nivel raíz
        if (p.caracteristicas.categoria) {
          productoTransformado.categoria = p.caracteristicas.categoria;
        }
        // Opcional: eliminar caracteristicas si ya no se necesita en el frontend aplanado
        // delete productoTransformado.caracteristicas;
      }
      
      // Asegurarse de que los campos que el frontend espera existan, aunque sea con valor por defecto
      productoTransformado.nombre_del_producto = productoTransformado.nombre_del_producto || '-';
      productoTransformado.Descripcion = productoTransformado.Descripcion || '-';
      productoTransformado.Modelo = productoTransformado.Modelo || '-';
      productoTransformado.categoria = productoTransformado.categoria || '-';
      productoTransformado.fabricante = p.fabricante || '-'; // Changed to use main level fabricante
      // codigo_producto ya debería estar o se mapeó arriba
      productoTransformado.codigo_producto = productoTransformado.codigo_producto || productoTransformado.Codigo_Producto || '-';

      return productoTransformado;
    });

    console.log(`[mongoDataSvc] Found and transformed ${transformedProducts.length} total products from DB.`);
    return transformedProducts;
  } catch (error) {
    console.error('Error in fetchBaseProductsFromDB (fetching all products):', error);
    throw new Error('Failed to fetch all products from database. Original error: ' + error.message);
  }
};

// NUEVA FUNCIÓN para crear un producto en la DB
const createProductInDB = async (productData) => {
  try {
    const db = await getDB();
    const productsCollection = db.collection('Productos');
    
    // Considerar si necesitas transformar productData antes de insertar
    // Por ejemplo, si el frontend envía 'codigo_producto' y la DB espera 'Codigo_Producto'
    // O si necesitas añadir campos por defecto como createdAt, updatedAt
    const productToInsert = {
      ...productData,
      // Asegúrate de que Codigo_Producto (o el campo que uses como ID de negocio) esté presente
      // codigo_producto: productData.codigo_producto || productData.Codigo_Producto,
      createdAt: new Date(), // Añadir timestamp de creación
      updatedAt: new Date()  // Añadir timestamp de actualización
    };

    // Verificar si ya existe un producto con el mismo Codigo_Producto (si debe ser único)
    if (productToInsert.Codigo_Producto) {
        const existingProduct = await productsCollection.findOne({ Codigo_Producto: productToInsert.Codigo_Producto });
        if (existingProduct) {
            throw new Error(`El producto con Codigo_Producto ${productToInsert.Codigo_Producto} ya existe.`);
        }
    }

    const result = await productsCollection.insertOne(productToInsert);
    
    //insertOne devuelve un objeto con acknowledged: true y insertedId: ObjectId(...)
    if (!result.acknowledged || !result.insertedId) {
      throw new Error('No se pudo insertar el producto en la base de datos.');
    }
    
    // Devolver el documento insertado completo (opcionalmente buscando por insertedId)
    // o al menos el ID y los datos originales con los timestamps
    const createdProduct = await productsCollection.findOne({ _id: result.insertedId });
    return createdProduct; // Devolver el producto completo tal como está en la DB

  } catch (error) {
    console.error('Error in createProductInDB:', error);
    // Propagar el error para que el controlador lo maneje
    // Si es un error de duplicado, el mensaje ya será específico
    throw error; 
  }
};

// NUEVA FUNCIÓN para obtener un producto por su Codigo_Producto
const getProductByCodeFromDB = async (codigoProducto) => {
  try {
    const db = await getDB();
    const productsCollection = db.collection('Productos');
    
    // El campo en la base de datos es 'Codigo_Producto'
    const product = await productsCollection.findOne({ Codigo_Producto: codigoProducto });
    
    if (!product) {
      return null; // O lanzar un error específico si se prefiere que el servicio lo maneje
    }

    // Aplicar la misma transformación que en fetchBaseProductsFromDB para consistencia
    const productoTransformado = { ...product }; 
    if (product.Codigo_Producto && !product.codigo_producto) {
      productoTransformado.codigo_producto = product.Codigo_Producto;
    }
    if (product.caracteristicas && typeof product.caracteristicas === 'object') {
      if (product.caracteristicas.nombre_del_producto) {
        productoTransformado.nombre_del_producto = product.caracteristicas.nombre_del_producto;
      }
      if (product.caracteristicas.descripcion) { 
        productoTransformado.Descripcion = product.caracteristicas.descripcion;
      }
      if (product.caracteristicas.modelo) { 
        productoTransformado.Modelo = product.caracteristicas.modelo;
      }
      if (product.caracteristicas.categoria) {
        productoTransformado.categoria = product.caracteristicas.categoria;
      }
      // Add fabricante field
      if (product.caracteristicas.fabricante) {
        productoTransformado.fabricante = product.caracteristicas.fabricante;
      }
    }
    productoTransformado.nombre_del_producto = productoTransformado.nombre_del_producto || '-';
    productoTransformado.Descripcion = productoTransformado.Descripcion || '-';
    productoTransformado.Modelo = productoTransformado.Modelo || '-';
    productoTransformado.categoria = productoTransformado.categoria || '-';
    productoTransformado.fabricante = productoTransformado.fabricante || '-';
    productoTransformado.codigo_producto = productoTransformado.codigo_producto || productoTransformado.Codigo_Producto || '-';

    return productoTransformado;
  } catch (error) {
    console.error(`Error in getProductByCodeFromDB for code ${codigoProducto}:`, error);
    throw error; // Propagar el error
  }
};

// NUEVA FUNCIÓN para actualizar un producto por su Codigo_Producto
const updateProductInDB = async (codigoProducto, updateData) => {
  try {
    const db = await getDB();
    const productsCollection = db.collection('Productos');

    console.log(`[mongoDataService - updateProductInDB] Iniciando actualización para Codigo_Producto: "${codigoProducto}" (Tipo: ${typeof codigoProducto})`);
    console.log(`[mongoDataService - updateProductInDB] Conectado a DB: ${db.databaseName}, Colección: ${productsCollection.collectionName}`);

    const dataToUpdate = { ...updateData };
    delete dataToUpdate._id;
    delete dataToUpdate.Codigo_Producto; // No se debe intentar modificar el Codigo_Producto con $set

    dataToUpdate.updatedAt = new Date();
    console.log(`[mongoDataService - updateProductInDB] Datos para $set:`, JSON.stringify(dataToUpdate, null, 2));

    // Paso 1: Intentar actualizar el documento usando updateOne
    const updateResult = await productsCollection.updateOne(
      { Codigo_Producto: codigoProducto },
      { $set: dataToUpdate }
    );

    console.log(`[mongoDataService - updateProductInDB] Resultado de updateOne:`, JSON.stringify(updateResult, null, 2));

    // Verificar si updateOne encontró y modificó el documento
    if (updateResult.matchedCount === 0) {
      console.error(`[mongoDataService - updateProductInDB] PRODUCT NOT FOUND por updateOne. Ningún documento coincidió con Codigo_Producto: ${codigoProducto}`);
      return null; // El producto no fue encontrado
    }

    if (updateResult.modifiedCount === 0 && updateResult.matchedCount > 0) {
      console.warn(`[mongoDataService - updateProductInDB] Producto encontrado (matchedCount: ${updateResult.matchedCount}) pero no modificado (modifiedCount: 0) por updateOne. Esto puede ocurrir si los datos enviados son idénticos a los existentes. Codigo_Producto: ${codigoProducto}`);
      // Continuamos para intentar obtener el documento, ya que fue encontrado.
    } else if (updateResult.modifiedCount > 0) {
      console.log(`[mongoDataService - updateProductInDB] Producto actualizado exitosamente por updateOne (matchedCount: ${updateResult.matchedCount}, modifiedCount: ${updateResult.modifiedCount}). Codigo_Producto: ${codigoProducto}`);
    }

    // Paso 2: Si el producto fue encontrado (y posiblemente modificado), obtener la versión más reciente
    console.log(`[mongoDataService - updateProductInDB] Intentando recuperar el producto actualizado con findOne para Codigo_Producto: ${codigoProducto}`);
    const product = await productsCollection.findOne({ Codigo_Producto: codigoProducto });

    if (!product) {
      console.error(`[mongoDataService - updateProductInDB] Error Crítico: updateOne indicó coincidencia/modificación, pero findOne NO PUDO recuperar el producto con Codigo_Producto: ${codigoProducto} inmediatamente después.`);
      return null;
    }

    console.log(`[mongoDataService - updateProductInDB] Producto recuperado por findOne (ANTES de transformación):`, JSON.stringify(product, null, 2));

    // Aplicar la transformación estándar
    const productoTransformado = { ...product };
    if (product.Codigo_Producto && !product.codigo_producto) {
      productoTransformado.codigo_producto = product.Codigo_Producto;
    }
    if (product.caracteristicas && typeof product.caracteristicas === 'object') {
      if (product.caracteristicas.nombre_del_producto) {
        productoTransformado.nombre_del_producto = product.caracteristicas.nombre_del_producto;
      }
      if (product.caracteristicas.descripcion) {
        productoTransformado.Descripcion = product.caracteristicas.descripcion;
      }
      if (product.caracteristicas.modelo) {
        productoTransformado.Modelo = product.caracteristicas.modelo;
      }
      if (product.caracteristicas.categoria) {
        productoTransformado.categoria = product.caracteristicas.categoria;
      }
      // Add fabricante field
      if (product.caracteristicas.fabricante) {
        productoTransformado.fabricante = product.caracteristicas.fabricante;
      }
    }
    productoTransformado.nombre_del_producto = productoTransformado.nombre_del_producto || '-';
    productoTransformado.Descripcion = productoTransformado.Descripcion || '-';
    productoTransformado.Modelo = productoTransformado.Modelo || '-';
    productoTransformado.categoria = productoTransformado.categoria || '-';
    productoTransformado.fabricante = productoTransformado.fabricante || '-';
    productoTransformado.codigo_producto = productoTransformado.codigo_producto || productoTransformado.Codigo_Producto || '-';

    console.log(`[mongoDataService - updateProductInDB] Producto DESPUÉS de transformación (productoTransformado):`, JSON.stringify(productoTransformado, null, 2));
    return productoTransformado;

  } catch (error) {
    console.error(`[mongoDataService - updateProductInDB] Error general en la función para Codigo_Producto ${codigoProducto}:`, error);
    throw error; // Propagar el error para que el controlador lo maneje
  }
};

// NUEVA FUNCIÓN para eliminar un producto por su Codigo_Producto
const deleteProductFromDB = async (codigoProducto) => {
  try {
    const db = await getDB();
    const productsCollection = db.collection('Productos');

    // Eliminar el producto que coincida con Codigo_Producto
    const result = await productsCollection.deleteOne({ Codigo_Producto: codigoProducto });

    // result.deletedCount será 1 si se eliminó, 0 si no se encontró
    if (result.deletedCount === 0) {
      return false; // Indica que no se encontró o no se eliminó nada
    }
    return true; // Indica que la eliminación fue exitosa

  } catch (error) {
    console.error(`Error in deleteProductFromDB for code ${codigoProducto}:`, error);
    throw error; // Propagar el error
  }
};

// Opcional: Función para cerrar la conexión cuando la app se detiene
const closeDB = async () => {
  if (client) {
    await client.close();
    console.log('MongoDB connection closed.');
  }
};

module.exports = { getDB, fetchBaseProductsFromDB, connectDB, closeDB, createProductInDB, getProductByCodeFromDB, updateProductInDB, deleteProductFromDB }; 