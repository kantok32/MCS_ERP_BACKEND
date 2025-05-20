const CostoPerfil = require('../models/CostoPerfil');
const { calcularCostoProducto } = require('../utils/calculoCostoProducto'); // Importar la función de cálculo
const { fetchCurrencyValues } = require('../utils/fetchProducts'); // Importar fetchCurrencyValues
// Ya no necesitamos getLatestCurrencyValues aquí
// const { getLatestCurrencyValues } = require('./productController');

// @desc    Crear un nuevo perfil de costo
// @route   POST /api/costo-perfiles
// @access  Private (ejemplo, ajustar según necesidad)
const createCostoPerfil = async (req, res) => {
  try {
    // *** INICIO VALIDACIÓN ADICIONAL ***
    const { nombre_perfil } = req.body;
    if (!nombre_perfil || typeof nombre_perfil !== 'string' || nombre_perfil.trim() === '') {
      return res.status(400).json({ message: 'El campo \'nombre_perfil\' es obligatorio y no puede estar vacío.' });
    }
    // *** FIN VALIDACIÓN ADICIONAL ***

    const nuevoPerfil = new CostoPerfil(req.body);
    const perfilGuardado = await nuevoPerfil.save();
    res.status(201).json(perfilGuardado);
  } catch (error) {
    console.error('Error al crear perfil de costo:', error);
    // *** INICIO MANEJO DE ERRORES MEJORADO ***
    if (error.name === 'ValidationError') {
      // Error de validación de Mongoose (campos requeridos faltantes, tipos inválidos, etc.)
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ 
          message: 'Datos de perfil inválidos. Por favor revise los campos.', 
          errors: messages 
      });
    } 
    if (error.code === 11000) {
      // Error de clave duplicada (probablemente nombre_perfil repetido ahora)
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ message: `Error: Ya existe un perfil con ese valor para '${field}'.` });
    }
    // Otros errores al intentar guardar o errores inesperados
    res.status(500).json({ message: 'Error interno al intentar crear el perfil.', error: error.message });
    // *** FIN MANEJO DE ERRORES MEJORADO ***
  }
};

// @desc    Obtener todos los perfiles de costo
// @route   GET /api/costo-perfiles
// @access  Private (ejemplo)
const getAllCostoPerfiles = async (req, res) => {
  try {
    // Podríamos añadir filtros o paginación aquí si es necesario
    const perfiles = await CostoPerfil.find({});
    res.status(200).json(perfiles);
  } catch (error) {
    console.error('Error al obtener perfiles de costo:', error);
    res.status(500).json({ message: 'Error al obtener los perfiles' });
  }
};

// @desc    Obtener un perfil de costo por ID
// @route   GET /api/costo-perfiles/:id
// @access  Private (ejemplo)
const getCostoPerfilById = async (req, res) => {
  try {
    const perfil = await CostoPerfil.findById(req.params.id);
    if (!perfil) {
      return res.status(404).json({ message: 'Perfil no encontrado' });
    }
    res.status(200).json(perfil);
  } catch (error) {
    console.error('Error al obtener perfil por ID:', error);
    // Si el ID tiene un formato inválido, Mongoose puede lanzar un error
    if (error.kind === 'ObjectId') {
        return res.status(400).json({ message: 'ID de perfil inválido' });
    }
    res.status(500).json({ message: 'Error al obtener el perfil' });
  }
};

// @desc    Actualizar un perfil de costo por ID
// @route   PUT /api/costo-perfiles/:id
// @access  Private (ejemplo)
const updateCostoPerfil = async (req, res) => {
  try {
    const perfil = await CostoPerfil.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true } // Devuelve el doc actualizado y corre validaciones
    );
    if (!perfil) {
      return res.status(404).json({ message: 'Perfil no encontrado para actualizar' });
    }
    res.status(200).json(perfil);
  } catch (error) {
    console.error('Error al actualizar perfil:', error);
    if (error.kind === 'ObjectId') {
        return res.status(400).json({ message: 'ID de perfil inválido' });
    }
    res.status(400).json({ message: 'Error al actualizar el perfil', error: error.message });
  }
};

// @desc    Eliminar un perfil de costo por ID
// @route   DELETE /api/costo-perfiles/:id
// @access  Private (ejemplo)
const deleteCostoPerfil = async (req, res) => {
  try {
    const perfil = await CostoPerfil.findByIdAndDelete(req.params.id);
    if (!perfil) {
      return res.status(404).json({ message: 'Perfil no encontrado para eliminar' });
    }
    // Importante: Considerar qué sucede con los productos/equipos que usaban este perfil.
    // Podría ser necesario reasignar un perfil por defecto o marcar esos productos.
    // La lógica de cálculo referenciada en la imagen se aplicaría en los endpoints que usan estos perfiles,
    // no directamente aquí en el CRUD del perfil mismo.
    res.status(200).json({ message: 'Perfil eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar perfil:', error);
    if (error.kind === 'ObjectId') {
        return res.status(400).json({ message: 'ID de perfil inválido' });
    }
    res.status(500).json({ message: 'Error al eliminar el perfil' });
  }
};

// @desc    Calcular costos de prueba basados en inputs (manuales + perfil opcional + tasas de cambio)
// @route   POST /api/costo-perfiles/calcular-prueba
// @access  Public (o Private según necesidad)
const calculatePruebaCosto = async (req, res) => {
  try {
    const {
      anoCotizacion,
      anoEnCurso,
      costoFabricaOriginalEUR,
      tipoCambioEurUsdActual,
      bufferEurUsd, // Recibe el buffer como decimal (ej: 0.02)
      descuentoFabrica // Recibe el descuento como decimal (ej: 0.10)
    } = req.body;

    // Validaciones básicas de existencia (igual que antes)
    if (anoCotizacion === undefined || anoEnCurso === undefined || costoFabricaOriginalEUR === undefined || 
        tipoCambioEurUsdActual === undefined || bufferEurUsd === undefined || descuentoFabrica === undefined) {
      return res.status(400).json({ message: 'Faltan parámetros requeridos para el cálculo de prueba.', received: req.body });
    }

    // Validaciones de tipo y valor (igual que antes)
    const numAnoCotizacion = Number(anoCotizacion);
    const numAnoEnCurso = Number(anoEnCurso);
    const numCostoFabricaOriginalEUR = Number(costoFabricaOriginalEUR);
    const numTipoCambioEurUsdActual = Number(tipoCambioEurUsdActual);
    const numBufferEurUsd = Number(bufferEurUsd);
    const numDescuentoFabrica = Number(descuentoFabrica);

    if (isNaN(numAnoCotizacion) || isNaN(numAnoEnCurso) || 
        isNaN(numCostoFabricaOriginalEUR) || numCostoFabricaOriginalEUR <= 0 || 
        isNaN(numTipoCambioEurUsdActual) || numTipoCambioEurUsdActual <= 0 ||
        isNaN(numBufferEurUsd) || numBufferEurUsd < 0 || 
        isNaN(numDescuentoFabrica) || numDescuentoFabrica < 0 || numDescuentoFabrica >= 1) {
         return res.status(400).json({ message: 'Parámetros numéricos inválidos para el cálculo de prueba.' });
    }

    // *** NECESITAMOS USD/CLP también para el cálculo completo simulado ***
    let tipoCambioUsdClpActual;
    try {
      const currencyData = await fetchCurrencyValues();
      if (!currencyData || typeof currencyData.Valor_Dolar !== 'string' || currencyData.Valor_Dolar.trim() === '') { 
        throw new Error('Respuesta inválida, faltante o vacía de Valor_Dolar desde webhook');
      }
       // *** Lógica de conversión mejorada ***
      let valorDolarString = currencyData.Valor_Dolar.trim();
      if (valorDolarString.includes(',')) {
         valorDolarString = valorDolarString.replace(/\./g, '').replace(',', '.');
      }
      tipoCambioUsdClpActual = parseFloat(valorDolarString);

      if (isNaN(tipoCambioUsdClpActual) || tipoCambioUsdClpActual <= 0) {
         throw new Error(`Valor_Dolar '${currencyData.Valor_Dolar}' no pudo ser convertido a número válido.`);
      }
    } catch (currencyError) {
      console.error('Error obteniendo valor del dólar para prueba:', currencyError);
      return res.status(500).json({ message: 'No se pudo obtener el tipo de cambio USD/CLP actual.', error: currencyError.message });
    }

    // *** CAMBIO: Construir un objeto perfilData simulado ***
    const perfilDataSimulado = {
      buffer_eur_usd_pct: numBufferEurUsd, // Usar el valor numérico validado
      descuento_fabrica_pct: numDescuentoFabrica, // Usar el valor numérico validado
      // Simular transporte nacional en 0 si no se proporciona (o añadirlo al request si se desea)
      transporte_nacional_clp: 0, 
    };

    // Llamar a la función de cálculo con los datos y el perfil simulado
    const resultadoCalculo = calcularCostoProducto({
      anoCotizacion: numAnoCotizacion,
      anoEnCurso: numAnoEnCurso,
      costoFabricaOriginalEUR: numCostoFabricaOriginalEUR,
      tipoCambioEurUsdActual: numTipoCambioEurUsdActual,
      tipoCambioUsdClpActual: tipoCambioUsdClpActual, // Pasar TC USD/CLP obtenido
      perfilData: perfilDataSimulado // Pasar el objeto simulado
    });
    
    if (resultadoCalculo.error) {
        return res.status(400).json({ message: `Error en el cálculo de prueba: ${resultadoCalculo.error}` });
    }

    res.status(200).json({ 
      message: 'Cálculo de prueba realizado exitosamente.',
      resultado: { 
          inputs: resultadoCalculo.inputs, 
          calculados: resultadoCalculo.calculados 
      }
    });

  } catch (error) {
    console.error('Error inesperado en calculatePruebaCosto:', error);
    res.status(500).json({ message: 'Error interno del servidor al realizar el cálculo de prueba.' });
  }
};

// NUEVA FUNCIÓN:
// @desc    Calcular el costo de un producto usando un perfil específico
// @route   POST /api/costo-perfiles/calcular-producto
// @access  Private (ejemplo)
const calculateCostoProductoFromProfile = async (req, res) => {
  try {
    const {
      profileId,
      anoCotizacion,
      anoEnCurso,
      costoFabricaOriginalEUR,
      tipoCambioEurUsdActual 
    } = req.body;

    // Validaciones básicas (igual que antes)
    if (!profileId || !anoCotizacion || !anoEnCurso || !costoFabricaOriginalEUR || !tipoCambioEurUsdActual) {
      return res.status(400).json({ message: 'Faltan parámetros requeridos para el cálculo.' });
    }
    const numAnoCotizacion = Number(anoCotizacion);
    const numAnoEnCurso = Number(anoEnCurso);
    const numCostoFabricaOriginalEUR = Number(costoFabricaOriginalEUR);
    const numTipoCambioEurUsdActual = Number(tipoCambioEurUsdActual);

    if (isNaN(numAnoCotizacion) || isNaN(numAnoEnCurso) || isNaN(numCostoFabricaOriginalEUR) || numCostoFabricaOriginalEUR <= 0 || isNaN(numTipoCambioEurUsdActual) || numTipoCambioEurUsdActual <=0 ) {
         return res.status(400).json({ message: 'Parámetros numéricos inválidos.' });
    }

    // *** Obtener TC USD/CLP actual ***
    let tipoCambioUsdClpActualNum;
    try {
      const currencyData = await fetchCurrencyValues(); 
      if (!currencyData || typeof currencyData.Valor_Dolar !== 'string' || currencyData.Valor_Dolar.trim() === '') { 
        throw new Error('Respuesta inválida, faltante o vacía de Valor_Dolar desde webhook');
      }

      // *** Lógica de conversión mejorada ***
      let valorDolarString = currencyData.Valor_Dolar.trim();
      // Detectar si usa coma como decimal (formato chileno)
      if (valorDolarString.includes(',')) {
         // Asumir formato chileno: quitar puntos de miles, reemplazar coma decimal por punto
         valorDolarString = valorDolarString.replace(/\./g, '').replace(',', '.');
      } 
      // Si no hay coma, se asume que el punto (si existe) es decimal y no de miles.
      // No se necesita hacer replace en ese caso, parseFloat lo maneja.
      
      tipoCambioUsdClpActualNum = parseFloat(valorDolarString);

      if (isNaN(tipoCambioUsdClpActualNum) || tipoCambioUsdClpActualNum <= 0) {
         throw new Error(`Valor_Dolar '${currencyData.Valor_Dolar}' no pudo ser convertido a número válido.`);
      }
    } catch (currencyError) {
      console.error('Error obteniendo valor del dólar:', currencyError);
      return res.status(500).json({ message: 'No se pudo obtener el tipo de cambio USD/CLP actual.', error: currencyError.message });
    }

    // Buscar el perfil
    const perfil = await CostoPerfil.findById(profileId);
    if (!perfil) {
      return res.status(404).json({ message: 'Perfil de costo no encontrado.' });
    }

    // Llamar a la función de cálculo pasando el objeto perfil y el TC USD/CLP
    const resultadoCalculo = calcularCostoProducto({
      anoCotizacion: numAnoCotizacion,
      anoEnCurso: numAnoEnCurso,
      costoFabricaOriginalEUR: numCostoFabricaOriginalEUR,
      tipoCambioEurUsdActual: numTipoCambioEurUsdActual,
      tipoCambioUsdClpActual: tipoCambioUsdClpActualNum, // Pasar el valor numérico
      perfilData: perfil 
    });
    
    if (resultadoCalculo.error) {
        const profileName = perfil.nombre_perfil || profileId;
        return res.status(400).json({ message: `Error en el cálculo: ${resultadoCalculo.error}`, perfilUsado: profileName });
    }

    res.status(200).json({
      perfilUsado: { _id: perfil._id, nombre: perfil.nombre_perfil || perfil._id }, 
      resultado: { 
          inputs: resultadoCalculo.inputs, 
          calculados: resultadoCalculo.calculados 
        }
    });

  } catch (error) {
    console.error('Error al calcular costo de producto con perfil:', error);
    if (error.kind === 'ObjectId') {
        return res.status(400).json({ message: 'ID de perfil inválido' });
    }
    res.status(500).json({ message: 'Error interno al calcular el costo del producto.' });
  }
};

module.exports = {
  createCostoPerfil,
  getAllCostoPerfiles,
  getCostoPerfilById,
  updateCostoPerfil,
  deleteCostoPerfil,
  calculatePruebaCosto,
  calculateCostoProductoFromProfile // Exportar la nueva función
}; 