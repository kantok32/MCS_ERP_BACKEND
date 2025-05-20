// Middleware para manejar rutas no encontradas (404)
const notFound = (req, res, next) => {
  const error = new Error(`Ruta no encontrada - ${req.originalUrl}`);
  res.status(404);
  next(error); // Pasa el error al siguiente middleware (errorHandler)
};

// Middleware para manejar errores generales
const errorHandler = (err, req, res, next) => {
  // A veces un error puede venir con un código de estado ya establecido (ej. 404, 400)
  // Si no, usar 500 (Internal Server Error)
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);

  console.error('[ErrorHandler] Error:', err.message);
  // Opcional: Loggear el stack trace completo en desarrollo
  if (process.env.NODE_ENV !== 'production') {
     console.error('[ErrorHandler] Stack:', err.stack);
  }

  res.json({
    message: err.message,
    // Solo mostrar el stack en modo desarrollo por seguridad
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

module.exports = { notFound, errorHandler }; 