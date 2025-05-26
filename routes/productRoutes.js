const express = require('express');
const router = express.Router();
const multer = require('multer');
const cors = require('cors');

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
router.get('/filter', productController.fetchFilteredProductsController);
router.get('/cache/all', productController.getAllProductsAndCache);
router.get('/detail', productController.getProductDetail);
router.get('/opcionales', productController.getOptionalProducts);
router.get('/opcionales/raw', productController.getRawOptionalProducts);
router.get('/test/db-base-products', productController.testGetBaseProductsFromDBController);
router.get('/currency/dollar', productController.getCachedDollarValue);
router.get('/currency/euro', productController.getCachedEuroValue);
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

// --- Rutas con parámetros ---
router.get('/:codigo/specifications', productController.getProductSpecifications);
router.get('/:codigo', productController.getProductByCode);

// --- Rutas POST y PUT ---
router.post('/opcionales-by-body', productController.getOptionalProductsFromBody);
router.post('/cache/reset', productController.resetCache);
router.put('/code/:codigoProducto', productController.updateProduct);
router.put('/code/:codigoProducto/toggle-discontinued', productController.toggleProductDiscontinuedStatus);
router.delete('/cache', productController.clearCache);

// Endpoint para la carga masiva de productos con plantilla PLANA (LEGACY - comentado)
// router.post('/upload-bulk', upload.single('archivoExcel'), productoCtrl.uploadBulkProducts); 

// Ruta para la carga PLANA de nuevos equipos (Plantilla General de Equipos)
router.post(
  '/upload-plain',
  upload.single('archivoExcelPlain'), // Multer para archivos, no afecta JSON
  productController.uploadBulkProductsPlain
);

// Ruta para la carga MATRICIAL general de productos (si es un formato diferente al de especificaciones)
// router.post('/upload-matrix', upload.single('archivoExcelMatrix'), productController.uploadBulkProductsMatrix); // Commented out 

// Nueva ruta para actualizar especificaciones técnicas (Formato Matricial de Especificaciones)
router.post('/upload-specifications', upload.single('file'), productController.uploadTechnicalSpecifications); 

module.exports = router;