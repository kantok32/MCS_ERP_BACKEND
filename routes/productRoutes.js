const express = require('express');
const router = express.Router();
const multer = require('multer');

// --- Importar controladores ---
// Controlador para operaciones con Mongoose (crear, cargar excel)
// const productoCtrl = require('../controllers/productoController.js'); // Comentando la importación duplicada o con 'o'
const productController = require('../controllers/productController.js'); // Usaremos este nombre consistentemente
// Controlador para operaciones con caché y llamadas a webhook (sin 'o')
// const productCtrl = require('../controllers/productController.js');

const path = require('path');
const fs = require('fs');

// Configurar multer para almacenamiento en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- Rutas que usan productController (sin 'o' - caché/webhook) ---
router.get('/fetch', productController.fetchProducts);
router.get('/', productController.getCachedProducts); // Lista todos los productos (del caché)
// Añadir ruta directa por código de producto
router.get('/:codigo', productController.getProductByCode);
// router.post('/', productController.createProductController); // Comentado para evitar conflicto con productoCtrl si se usara abajo. Asegurar que el controller correcto se usa.
// Es probable que createProductController sea parte de productController.js y no necesite el alias productoCtrl

// --- NUEVA RUTA para actualizar un producto por Codigo_Producto ---
router.put('/code/:codigoProducto', productController.updateProduct);

// --- NUEVA RUTA para actualizar el estado descontinuado de un producto ---
router.put('/code/:codigoProducto/toggle-discontinued', productController.toggleProductDiscontinuedStatus);

// --- NUEVA RUTA para eliminar un producto por Codigo_Producto ---
// router.delete('/code/:codigoProducto', productController.deleteProductController); // Temporarily commented out as handler is missing

router.get('/filter', productController.fetchFilteredProductsController);
router.get('/cache/all', productController.getAllProductsAndCache);
router.post('/cache/reset', productController.resetCache);
router.delete('/cache', productController.clearCache); // Corregido DELETE
router.get('/detail', productController.getProductDetail);
router.get('/opcionales', productController.getOptionalProducts);
router.get('/opcionales/raw', productController.getRawOptionalProducts);
router.post('/opcionales-by-body', productController.getOptionalProductsFromBody);

// --- NUEVA RUTA DE PRUEBA PARA DB ---
router.get('/test/db-base-products', productController.testGetBaseProductsFromDBController);

// <<<--- Añadir Rutas para Divisas Cacheadas --->>>
router.get('/currency/dollar', productController.getCachedDollarValue);
router.get('/currency/euro', productController.getCachedEuroValue);
// <<<------------------------------------------->>>

// Ruta para descargar plantilla (lógica local)
router.get('/download-template', (req, res) => {
  const templatePath = path.join(__dirname, '../Plantilla_Carga_Equipos.xlsx');
  if (fs.existsSync(templatePath)) {
    res.download(templatePath, 'Plantilla_Carga_Equipos.xlsx', (err) => {
      if (err) {
        console.error('Error downloading template:', err);
        res.status(500).json({ message: 'Error downloading template' });
      }
    });
  } else {
    res.status(404).json({ message: 'Template file not found' });
  }
});

// Nueva ruta para descargar plantilla de ESPECIFICACIONES (CSV)
router.get('/download-specifications-template', (req, res) => {
  const templatePath = path.join(__dirname, '../Plantilla_Carga_Especificaciones.xlsx');
  if (fs.existsSync(templatePath)) {
    res.download(templatePath, 'Plantilla_Carga_Especificaciones.xlsx', (err) => {
      if (err) {
        console.error('Error downloading specifications template:', err);
        res.status(500).json({ message: 'Error downloading specifications template' });
      }
    });
  } else {
    res.status(404).json({ message: 'Specifications template file not found' });
  }
});

// Cargar productos desde Excel (se mantiene si aún es necesaria)
// router.post('/cargar-excel', productoCtrl.cargarProductosDesdeExcel); // Comentado temporalmente, usa el alias 'productoCtrl'

// Endpoint para la carga masiva de productos con plantilla PLANA (LEGACY - comentado)
// router.post('/upload-bulk', upload.single('archivoExcel'), productoCtrl.uploadBulkProducts); 

// Ruta para la carga PLANA de nuevos equipos (Plantilla General de Equipos)
// router.post('/upload-plain', upload.single('archivoExcelPlain'), productController.uploadBulkProductsPlain); // Commented out

// Ruta para la carga MATRICIAL general de productos (si es un formato diferente al de especificaciones)
// router.post('/upload-matrix', upload.single('archivoExcelMatrix'), productController.uploadBulkProductsMatrix); // Commented out 

// Nueva ruta para actualizar especificaciones técnicas (Formato Matricial de Especificaciones)
// router.post('/upload-specifications', upload.single('archivoEspecificaciones'), productController.uploadTechnicalSpecifications); // Commented out

// <<<--- Fin de la sección de carga masiva --- >>>

module.exports = router;