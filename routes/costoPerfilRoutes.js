const express = require('express');
const router = express.Router();
const {
  createCostoPerfil,
  getAllCostoPerfiles,
  getCostoPerfilById,
  updateCostoPerfil,
  deleteCostoPerfil,
  calculatePruebaCosto,
  calculateCostoProductoFromProfile
} = require('../controllers/costoPerfilController');

// Middleware de autenticación/autorización (ejemplo - descomentar y ajustar si se usa)
// const { protect, admin } = require('../middleware/authMiddleware');

// Rutas CRUD para CostoPerfil

// Crear un nuevo perfil y obtener todos los perfiles
router.route('/')
  .post(/* protect, admin, */ createCostoPerfil) // Solo admin puede crear (ejemplo)
  .get(/* protect, */ getAllCostoPerfiles);       // Usuarios autenticados pueden ver todos (ejemplo)

// Obtener, actualizar y eliminar un perfil específico por ID
router.route('/:id')
  .get(/* protect, */ getCostoPerfilById)         // Usuarios autenticados pueden ver uno (ejemplo)
  .put(/* protect, admin, */ updateCostoPerfil)    // Solo admin puede actualizar (ejemplo)
  .delete(/* protect, admin, */ deleteCostoPerfil); // Solo admin puede eliminar (ejemplo)

// Ruta para el cálculo de prueba (POST)
// Actualmente esta ruta llamará a una función deshabilitada en el controlador.
router.post('/calcular-prueba', calculatePruebaCosto);

// NUEVA RUTA: Ruta para calcular el costo de un producto usando un perfil (POST)
router.post('/calcular-producto', calculateCostoProductoFromProfile);

module.exports = router; 