/**
 * Calcula la sección "Costo de Producto" basado en los parámetros proporcionados,
 * incluyendo datos de un perfil de costo.
 * 
 * @param {object} params - Objeto con los parámetros de entrada.
 * @param {number} params.anoCotizacion - Año base del costo original.
 * @param {number} params.anoEnCurso - Año objetivo para el cálculo.
 * @param {number} params.costoFabricaOriginalEUR - Costo original del producto en EUR.
 * @param {number} params.tipoCambioEurUsdActual - Tasa de cambio EUR/USD sin buffer.
 * @param {number} params.tipoCambioUsdClpActual - Tasa de cambio USD/CLP observada.
 * @param {object} params.perfilData - El objeto completo del perfil de costo a usar.
 * @returns {object} - Objeto con los resultados del cálculo del costo del producto.
 */
function calcularCostoProducto({
  anoCotizacion,
  anoEnCurso,
  costoFabricaOriginalEUR,
  tipoCambioEurUsdActual,
  tipoCambioUsdClpActual,
  perfilData
}) {

  // Validaciones básicas de los inputs directos
  if (costoFabricaOriginalEUR <= 0 || tipoCambioEurUsdActual <= 0 || tipoCambioUsdClpActual <= 0 || !perfilData) {
      console.error("Error en calcularCostoProducto: Inputs inválidos o perfil faltante", { costoFabricaOriginalEUR, tipoCambioEurUsdActual, tipoCambioUsdClpActual, perfilDataExists: !!perfilData });
      return { error: "Inputs inválidos o perfil de costo faltante para el cálculo." }; 
  }

  // Extraer valores necesarios DESDE el perfil
  // ASUNCIÓN: Los valores _pct en el modelo se guardan como decimal (ej: 0.02)
  const bufferEurUsd = perfilData.buffer_eur_usd_pct ?? 0; 
  const descuentoFabrica = perfilData.descuento_fabrica_pct ?? 0;
  // Nuevos valores a extraer del perfil para Logística y Seguro
  const costoOrigenEUR = perfilData.costo_logistica_origen_eur ?? 0;
  const fleteMaritimoUSD = perfilData.flete_maritimo_usd ?? 0;
  const recargosDestinoUSD = perfilData.recargos_destino_usd ?? 0;
  const tasaSeguroPct = perfilData.tasa_seguro_pct ?? 0; // Asumiendo decimal
  // Re-extraer valores de importación (excepto IVA fijo)
  const costoAgenteAduanaUSD = perfilData.costo_agente_aduana_usd ?? 0;
  const gastosPortuariosOtrosUSD = perfilData.gastos_portuarios_otros_usd ?? 0;
  // const derechoAdvaloremPct = perfilData.derecho_advalorem_pct ?? 0; // Ya no se usa, es 6% fijo
  const DERECHO_ADVALOREM_FIJO = 0.06; // Derecho Ad Valorem fijo 6% según documento
  const IVA_FIJO = 0.19; // IVA fijo 19%
  // Extraer valor para Landed Cost
  const transporteNacionalCLP = perfilData.transporte_nacional_clp ?? 0;
  // Extraer valores para Conversión y Margen
  const bufferUsdClpPct = perfilData.buffer_usd_clp_pct ?? 0;
  const margenAdicionalPct = perfilData.margen_adicional_pct ?? 0;
  // Extraer valor para Precios Cliente
  const descuentoClientePct = perfilData.descuento_cliente_pct ?? 0;

  // Validar que los valores extraídos sean números válidos
  if (typeof bufferEurUsd !== 'number' || typeof descuentoFabrica !== 'number' ||
      typeof costoOrigenEUR !== 'number' || typeof fleteMaritimoUSD !== 'number' ||
      typeof recargosDestinoUSD !== 'number' || typeof tasaSeguroPct !== 'number' ||
      typeof costoAgenteAduanaUSD !== 'number' || typeof gastosPortuariosOtrosUSD !== 'number' ||
      /* Ya no validamos derechoAdvaloremPct */ typeof transporteNacionalCLP !== 'number' ||
      typeof bufferUsdClpPct !== 'number' || typeof margenAdicionalPct !== 'number' ||
      typeof descuentoClientePct !== 'number') {
    console.error("Error en calcularCostoProducto: Valores de perfil inválidos", { 
        bufferEurUsd, descuentoFabrica, costoOrigenEUR, fleteMaritimoUSD, 
        recargosDestinoUSD, tasaSeguroPct, 
        costoAgenteAduanaUSD, gastosPortuariosOtrosUSD, /* derechoAdvaloremPct, */
        transporteNacionalCLP, bufferUsdClpPct, margenAdicionalPct,
        descuentoClientePct
    });
    return { error: "Valores numéricos inválidos encontrados en el perfil de costo." };
  }

  // --- SECCIÓN 1: Costo de Producto --- 
  // 1. Calcular el factor de actualización
  const factorActualizacion = Math.pow(1 + 0.05, anoEnCurso - anoCotizacion);
  // 2. Costo fábrica actualizado (EUR)
  const costoFabricaActualizadoEUR = costoFabricaOriginalEUR * factorActualizacion;
  // 3. Aplicar descuento del fabricante (extraído del perfil)
  const costoFabricaDescontadoEUR_EXW = costoFabricaActualizadoEUR * (1 - descuentoFabrica); // Nombre cambiado para claridad
  // 4. Tipo de cambio EUR/USD con buffer del perfil
  const tipoCambioEurUsdAplicado = tipoCambioEurUsdActual * (1 + bufferEurUsd); // <--- CORRECCIÓN: Usa buffer del perfil
  // 5. Costo final en USD (EXW)
  const costoFinalFabricaUSD_EXW = costoFabricaDescontadoEUR_EXW * tipoCambioEurUsdAplicado;

  // --- SECCIÓN 2: Logística y Seguro --- 
  // 6. Costos en Origen (USD)
  const costosOrigenUSD = costoOrigenEUR * tipoCambioEurUsdAplicado;
  // 7. Costo Total Flete y Manejos (USD)
  const costoTotalFleteManejosUSD = fleteMaritimoUSD + recargosDestinoUSD; // <- Solo Flete + Recargos
  // 8. Base para Seguro (CFR Aprox - USD)
  const baseParaSeguroUSD = costoFinalFabricaUSD_EXW + costoTotalFleteManejosUSD;
  // 9. Prima Seguro (USD)
  const primaSeguroUSD = baseParaSeguroUSD * 1.1 * tasaSeguroPct; 
  // 10. Total Transporte y Seguro EXW (USD)
  const totalTransporteSeguroEXW_USD = costoTotalFleteManejosUSD + primaSeguroUSD;

  // --- SECCIÓN 3: Costos de Importación --- 
  // 11. Valor CIF (USD) 
  const valorCIF_USD = costoFinalFabricaUSD_EXW + totalTransporteSeguroEXW_USD; 
  // 12. Derecho AdValorem (USD) - Usando % FIJO según documento
  const derechoAdvaloremUSD = valorCIF_USD * DERECHO_ADVALOREM_FIJO; // <--- CORRECCIÓN: Usa 6% fijo
  // 13. Base IVA Importación (USD)
  const baseIvaImportacionUSD = valorCIF_USD + derechoAdvaloremUSD;
  // 14. IVA Importación (USD) - Usando 19% FIJO
  const ivaImportacionUSD = baseIvaImportacionUSD * IVA_FIJO; 
  // 15. Total Costos Importación (Duty + Fees) (USD) - Sin IVA calculado
  const totalCostosImportacionDutyFeesUSD = derechoAdvaloremUSD + costoAgenteAduanaUSD + gastosPortuariosOtrosUSD;

  // --- SECCIÓN 4: Costo puesto en Bodega (Landed Cost) --- 
  // 16. Transporte Nacional (USD)
  const transporteNacionalUSD = tipoCambioUsdClpActual !== 0 ? transporteNacionalCLP / tipoCambioUsdClpActual : 0;
  // 17. Precio Neto Compra Base (USD) - Landed Cost
  const precioNetoCompraBaseUSD_LandedCost = valorCIF_USD + totalCostosImportacionDutyFeesUSD + transporteNacionalUSD;
  
  // --- SECCIÓN 5: Conversión a CLP y Margen --- 
  // 18. Tipo Cambio USD/CLP Aplicado
  const tipoCambioUsdClpAplicado = tipoCambioUsdClpActual * (1 + bufferUsdClpPct);
  // 19. Precio Neto Compra Base (CLP)
  const precioNetoCompraBaseCLP = precioNetoCompraBaseUSD_LandedCost * tipoCambioUsdClpAplicado;
  // 20. Margen (CLP)
  const margenCLP = precioNetoCompraBaseCLP * margenAdicionalPct;
  // 21. Precio Venta Neto (CLP)
  const precioVentaNetoCLP = margenCLP + precioNetoCompraBaseCLP;

  // --- SECCIÓN 6: Precios para cliente --- 
  // 22. Precio Neto Venta Final (CLP)
  const precioNetoVentaFinalCLP = precioVentaNetoCLP * (1 - descuentoClientePct);
  // 23. IVA Venta (19%) (CLP) - Usando IVA FIJO
  const ivaVentaCLP = precioNetoVentaFinalCLP * IVA_FIJO; 
  // 24. Precio Venta Total Cliente (CLP)
  const precioVentaTotalClienteCLP = precioNetoVentaFinalCLP + ivaVentaCLP;

  // Devolver resultados estructurados sin redondeo aplicado
  return {
    inputs: { 
        anoCotizacion,
        anoEnCurso,
        costoFabricaOriginalEUR,
        tipoCambioEurUsdActual,
        tipoCambioUsdClpActual,
        bufferEurUsd_fromProfile: bufferEurUsd,
        descuentoFabrica_fromProfile: descuentoFabrica,
        costoOrigenEUR_fromProfile: costoOrigenEUR,
        fleteMaritimoUSD_fromProfile: fleteMaritimoUSD,
        recargosDestinoUSD_fromProfile: recargosDestinoUSD,
        tasaSeguroPct_fromProfile: tasaSeguroPct,
        costoAgenteAduanaUSD_fromProfile: costoAgenteAduanaUSD,
        gastosPortuariosOtrosUSD_fromProfile: gastosPortuariosOtrosUSD,
        transporteNacionalCLP_fromProfile: transporteNacionalCLP,
        bufferUsdClpPct_fromProfile: bufferUsdClpPct,
        margenAdicionalPct_fromProfile: margenAdicionalPct,
        descuentoClientePct_fromProfile: descuentoClientePct,
    },
    calculados: {
      costo_producto: {
          factorActualizacion,
          costoFabricaActualizadoEUR, 
          costoFabricaDescontadoEUR_EXW: costoFabricaDescontadoEUR_EXW, // Nombre actualizado
          tipoCambioEurUsdAplicado,
          costoFinalFabricaUSD_EXW
      },
      logistica_seguro: {
          costosOrigenUSD,
          costoTotalFleteManejosUSD,
          baseParaSeguroUSD,
          primaSeguroUSD,
          totalTransporteSeguroEXW_USD
      },
      importacion: {
          valorCIF_USD,
          derechoAdvaloremUSD,
          baseIvaImportacionUSD,
          ivaImportacionUSD,
          totalCostosImportacionDutyFeesUSD
      },
      landed_cost: {
          transporteNacionalUSD,
          precioNetoCompraBaseUSD_LandedCost
      },
      conversion_margen: {
          tipoCambioUsdClpAplicado,
          precioNetoCompraBaseCLP,
          margenCLP,
          precioVentaNetoCLP
      },
      precios_cliente: {
          precioNetoVentaFinalCLP,
          ivaVentaCLP,
          precioVentaTotalClienteCLP
      }
    }
  };
}

module.exports = {
  calcularCostoProducto
}; 