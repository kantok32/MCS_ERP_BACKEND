const express = require('express');
const router = express.Router();
const { getCurrencyValues } = require('../controllers/currencyController');

// Ruta para obtener valores de divisas
router.get('/values', getCurrencyValues);

module.exports = router; 