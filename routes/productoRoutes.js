const express = require('express');
const router = express.Router();
const { cargarProductosDesdeExcel } = require('../controllers/productoController');

// Definir la ruta para cargar productos desde Excel
// POST /api/productos/cargar-excel
router.post('/cargar-excel', cargarProductosDesdeExcel);

// Aquí puedes añadir otras rutas relacionadas con productos si es necesario
// router.get('/', getAllProductos);
// router.get('/:id', getProductoById);

module.exports = router; 