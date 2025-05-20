const axios = require('axios');

// Etiquetas de los webhooks
const WEBHOOKS = {
  EQUIPOS: 'https://n8n-807184488368.southamerica-west1.run.app/webhook/6f697684-4cfc-4bc1-8918-bfffc9f20b9f',
  OPCIONALES: 'https://n8n-807184488368.southamerica-west1.run.app/webhook/ac8b70a7-6be5-4e1a-87b3-3813464dd254',
  DETALLES: 'https://n8n-807184488368.southamerica-west1.run.app/webhook/c02247e7-84f0-49b3-a2df-28817da48017',
  VALOR_DOLAR_EURO: 'https://n8n-807184488368.southamerica-west1.run.app/webhook/8012d60e-8a29-4910-b385-6514edc3d912'
};

/**
 * Obtiene todos los productos disponibles.
 * Webhook: WEBHOOKS.EQUIPOS
 * Método: GET
 * Retorna: Array de productos.
 */
const fetchAvailableProducts = async () => {
  try {
    const response = await axios.get(WEBHOOKS.EQUIPOS);
    return response.data;
  } catch (error) {
    console.error('Error fetching products:', error);
    throw new Error('Failed to fetch products');
  }
};

/**
 * Obtiene productos filtrados según los parámetros de consulta.
 * Webhook: WEBHOOKS.OPCIONALES
 * Método: GET
 * Parámetros: query (filtros de búsqueda)
 * Retorna: Array de productos filtrados.
 */
const fetchFilteredProducts = async (query) => {
  try {
    console.log('Enviando solicitud a webhook de OPCIONALES con parámetros:', query);
    console.log('URL del webhook:', WEBHOOKS.OPCIONALES);
    
    const response = await axios.get(WEBHOOKS.OPCIONALES, {
      params: query,
      timeout: 10000 // 10 segundos de timeout
    });
    
    console.log('Respuesta recibida del webhook OPCIONALES');
    
    // Verificar que la respuesta sea un array
    if (!Array.isArray(response.data)) {
      console.error('La respuesta no es un array:', response.data);
      // Si no es un array pero tiene alguna estructura de datos, intentamos extraer los productos
      if (response.data && typeof response.data === 'object') {
        // Buscar propiedades que podrían contener los productos
        const possibleArrayProps = ['data', 'products', 'items', 'results'];
        for (const prop of possibleArrayProps) {
          if (Array.isArray(response.data[prop])) {
            console.log(`Encontrados productos en propiedad: ${prop}`);
            return response.data[prop];
          }
        }
      }
      
      // Si llegamos aquí, no pudimos encontrar un array
      return []; // Devolver array vacío en lugar de lanzar error
    }
    
    return response.data;
  } catch (error) {
    console.error('Error fetching filtered products:', error.message);
    
    // Más información sobre el error para debug
    if (error.response) {
      // El servidor respondió con un código de error
      console.error('Error response data:', error.response.data);
      console.error('Error response status:', error.response.status);
      console.error('Error response headers:', error.response.headers);
      throw new Error(`Failed to fetch filtered products: Server responded with ${error.response.status}`);
    } else if (error.request) {
      // La petición fue hecha pero no se recibió respuesta
      console.error('Error request:', error.request);
      throw new Error('Failed to fetch filtered products: No response received from server');
    } else {
      // Algo ocurrió al configurar la petición
      console.error('Error config:', error.config);
      throw new Error(`Failed to fetch filtered products: ${error.message}`);
    }
  }
};

/**
 * Obtiene productos opcionales basados en los parámetros proporcionados.
 * Webhook: WEBHOOKS.OPCIONALES
 * Método: GET
 * Parámetros: query (código, modelo, categoría)
 * Retorna: Array de productos opcionales relacionados.
 */
const fetchOptionalProducts = async (query) => {
  try {
    const response = await axios.get(WEBHOOKS.OPCIONALES, {
      params: query,
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching optional products:', error);
    throw new Error('Failed to fetch optional products');
  }
};

/**
 * Obtiene los valores actuales de dólar y euro, junto con la fecha.
 * Webhook: WEBHOOKS.VALOR_DOLAR_EURO
 * Método: GET
 * Retorna: Objeto con los valores de dólar, euro y fecha.
 */
const fetchCurrencyValues = async () => {
  try {
    console.log('Fetching currency values from webhook...');
    const response = await axios.get(WEBHOOKS.VALOR_DOLAR_EURO);

    console.log('Webhook response:', response.data);

    // Validar que la respuesta contenga los campos necesarios
    if (!response.data || !response.data.Valor_Dolar || !response.data.Valor_Euro || !response.data.Fecha) {
      console.error('Missing required fields in response:', response.data);
      throw new Error('Missing required currency fields in response');
    }

    return response.data;
  } catch (error) {
    console.error('Error in fetchCurrencyValues:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    throw new Error(`Failed to fetch currency values: ${error.message}`);
  }
};

/**
 * Obtiene los detalles de un producto específico.
 * Webhook: WEBHOOKS.DETALLES
 * Método: POST
 * Parámetros: query (código, modelo, categoría)
 * Retorna: Detalles del producto.
 */
const fetchProductDetails = async (query) => {
  try {
    const response = await axios.post(WEBHOOKS.DETALLES, { query });
    return response.data;
  } catch (error) {
    console.error('Error fetching product details:', error);
    throw new Error('Failed to fetch product details');
  }
};

module.exports = { 
  fetchAvailableProducts, 
  fetchFilteredProducts, 
  fetchCurrencyValues, 
  fetchProductDetails,
  fetchOptionalProducts
};