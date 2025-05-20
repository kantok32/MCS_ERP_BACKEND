const axios = require('axios');

// Cache para almacenar los valores de divisas
const currencyCache = {
  dollar: {
    value: null,
    fecha: null,
    last_update: null
  },
  euro: {
    value: null,
    fecha: null,
    last_update: null
  }
};

// URL del webhook
const WEBHOOK_URL = 'https://n8n-807184488368.southamerica-west1.run.app/webhook/8012d60e-8a29-4910-b385-6514edc3d912';

// Función para obtener valores del webhook
const fetchCurrencyValues = async () => {
  try {
    console.log('Fetching currency values from webhook...');
    const response = await axios.get(WEBHOOK_URL);

    if (!response.data || !response.data.Valor_Dolar || !response.data.Valor_Euro || !response.data.Fecha) {
      throw new Error('Missing required currency fields in response');
    }

    return response.data;
  } catch (error) {
    console.error('Error in fetchCurrencyValues:', error.message);
    throw error;
  }
};

// Función para actualizar el caché
const updateCurrencyCache = async () => {
  try {
    const currencyData = await fetchCurrencyValues();
    
    currencyCache.dollar.value = currencyData.Valor_Dolar;
    currencyCache.euro.value = currencyData.Valor_Euro;
    currencyCache.dollar.fecha = currencyData.Fecha;
    currencyCache.euro.fecha = currencyData.Fecha;
    currencyCache.dollar.last_update = new Date().toISOString();
    currencyCache.euro.last_update = new Date().toISOString();
    
    console.log('Currency cache updated at:', new Date().toISOString());
  } catch (error) {
    console.error('Error updating currency cache:', error.message);
  }
};

// Función para verificar si el caché necesita actualización
const shouldUpdateCache = () => {
  if (!currencyCache.dollar.last_update) return true;
  
  const lastUpdate = new Date(currencyCache.dollar.last_update);
  const now = new Date();
  const hoursSinceLastUpdate = (now - lastUpdate) / (1000 * 60 * 60);
  
  return hoursSinceLastUpdate >= 20;
};

// Controlador para obtener valores de divisas
const getCurrencyValues = async (req, res) => {
  try {
    // Verificar si necesitamos actualizar el caché
    if (shouldUpdateCache()) {
      await updateCurrencyCache();
    }

    res.status(200).json({
      success: true,
      data: currencyCache,
      last_update: currencyCache.dollar.last_update
    });
  } catch (error) {
    console.error('Error in getCurrencyValues:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener valores de divisas'
    });
  }
};

// Inicializar el caché al arrancar el servidor
updateCurrencyCache();

module.exports = {
  getCurrencyValues,
  updateCurrencyCache
}; 