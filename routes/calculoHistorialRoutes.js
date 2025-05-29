const express = require('express');
const router = express.Router();
const { guardarYExportarCalculos, guardarCalculoHistorial, getAllCalculosHistorial, getCalculoHistorialById, deleteCalculoHistorial } = require('../controllers/calculoHistorialController');

// Middleware de autenticación (descomentar si se requiere proteger la ruta)
// const { protect } = require('../middleware/authMiddleware');

// @desc    Obtener todos los historiales de cálculo guardados
// @route   GET /api/calculo-historial
// @access  Public (o Private si se usa 'protect')
router.get('/', /* protect, */ getAllCalculosHistorial);

// @desc    Guardar resultados de cálculo y preparar para exportación CSV
// @route   POST /api/calculos-historial/guardar-y-exportar
// @access  Public (o Private si se usa 'protect')
router.post('/guardar-y-exportar', /* protect, */ guardarYExportarCalculos);

// @desc    Guardar un historial de cálculo sin generar PDF
// @route   POST /api/calculo-historial/guardar
// @access  Public (o Private si se usa 'protect')
router.post('/guardar', /* protect, */ guardarCalculoHistorial);

// @desc    Obtener un historial de cálculo específico por ID
// @route   GET /api/calculo-historial/:id
// @access  Public (o Private si se usa 'protect')
router.get('/:id', /* protect, */ getCalculoHistorialById);

// @desc    Eliminar un historial de cálculo
// @route   DELETE /api/calculo-historial/:id
// @access  Public (o Private si se usa 'protect')
router.delete('/:id', /* protect, */ deleteCalculoHistorial);

module.exports = router; 