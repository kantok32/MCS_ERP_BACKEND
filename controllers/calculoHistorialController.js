const asyncHandler = require('express-async-handler');
const CalculoHistorial = require('../models/CalculoHistorial');
const Producto = require('../models/Producto');
const ContadorConfiguracion = require('../models/ContadorConfiguracion');
const pdf = require('html-pdf');
const fs = require('fs');
const path = require('path');

// Función helper para obtener el siguiente número de configuración
async function obtenerSiguienteNumeroConfiguracion(nombreContador = 'calculoHistorialCounter') {
    const contador = await ContadorConfiguracion.findByIdAndUpdate(
        nombreContador, // Usamos un ID fijo para el documento contador
        { $inc: { secuencia: 1 } }, // Incrementa el campo 'secuencia' en 1
        {
            new: true, // Devuelve el documento modificado (con la nueva secuencia)
            upsert: true, // Crea el documento contador si no existe
            setDefaultsOnInsert: true // Asegura que se aplique el default de 'secuencia: 0' si se crea
        }
    );
    return contador.secuencia; // Devuelve el nuevo número de secuencia
}

// @desc    Guardar resultados de cálculo y devolverlos en formato CSV para exportación
// @route   POST /api/calculos-historial/guardar-y-exportar
// @access  Public (o Private, según configuración de ruta)
const guardarYExportarCalculos = asyncHandler(async (req, res) => {
    const {
        itemsParaCotizar,
        resultadosCalculados, 
        selectedProfileId,
        nombrePerfil,
        anoEnCursoGlobal,
        cotizacionDetails // Objeto que contiene todos los datos del formulario de ConfiguracionPanel.tsx
    } = req.body;

    // Validación básica de datos de entrada
    if (!itemsParaCotizar || !Array.isArray(itemsParaCotizar) || itemsParaCotizar.length === 0 || !resultadosCalculados || !cotizacionDetails) {
        res.status(400);
        throw new Error('Faltan datos requeridos o el formato es incorrecto: itemsParaCotizar, resultadosCalculados y cotizacionDetails son necesarios.');
    }

    try {
        // 0. Obtener el siguiente número de configuración ANTES de cualquier otra cosa
        const numeroSecuencialConfig = await obtenerSiguienteNumeroConfiguracion('calculoHistorialCounter');

        // 1. Obtener descripciones de productos y opcionales
        const productosConDescripcion = [];
        for (const item of itemsParaCotizar) {
            let descripcionPrincipal = 'Descripción no disponible';
            try {
                const productoDb = await Producto.findOne({ Codigo_Producto: item.principal.codigo_producto });
                if (productoDb && productoDb.descripcion) {
                    descripcionPrincipal = productoDb.descripcion;
                }
            } catch (err) {
                console.error(`Error fetching description for principal ${item.principal.codigo_producto}:`, err);
            }

            const opcionalesConDescripcion = [];
            if (item.opcionales && item.opcionales.length > 0) {
                for (const opcional of item.opcionales) {
                    let descripcionOpcional = 'Descripción no disponible';
                    try {
                        const opcionalDb = await Producto.findOne({ Codigo_Producto: opcional.codigo_producto });
                        if (opcionalDb && opcionalDb.descripcion) {
                            descripcionOpcional = opcionalDb.descripcion;
                        }
                    } catch (err) {
                        console.error(`Error fetching description for opcional ${opcional.codigo_producto}:`, err);
                    }
                    opcionalesConDescripcion.push({
                        ...opcional,
                        Descripcion: descripcionOpcional 
                    });
                }
            }
            productosConDescripcion.push({
                principal: {
                    ...item.principal,
                    Descripcion: descripcionPrincipal
                },
                opcionales: opcionalesConDescripcion
            });
        }

        // 2. Guardar en MongoDB con todos los datos
        const nuevoHistorial = await CalculoHistorial.create({
            itemsParaCotizar: productosConDescripcion,
            resultadosCalculados: resultadosCalculados,
            selectedProfileId: selectedProfileId || null,
            nombrePerfil,
            anoEnCursoGlobal,
            empresaQueCotiza: cotizacionDetails.empresaQueCotiza || 'Mi Empresa por Defecto',
            clienteNombre: cotizacionDetails.clienteNombre,
            clienteRut: cotizacionDetails.clienteRut,
            clienteDireccion: cotizacionDetails.clienteDireccion,
            clienteComuna: cotizacionDetails.clienteComuna,
            clienteCiudad: cotizacionDetails.clienteCiudad,
            clientePais: cotizacionDetails.clientePais,
            clienteContactoNombre: cotizacionDetails.clienteContactoNombre,
            clienteContactoEmail: cotizacionDetails.clienteContactoEmail,
            clienteContactoTelefono: cotizacionDetails.clienteContactoTelefono,
            numeroConfiguracion: numeroSecuencialConfig,
            numeroCotizacion: numeroSecuencialConfig,
            referenciaDocumento: cotizacionDetails.referenciaDocumento,
            fechaCreacionCotizacion: cotizacionDetails.fechaCreacion ? new Date(cotizacionDetails.fechaCreacion) : new Date(),
            fechaCaducidadCotizacion: cotizacionDetails.fechaCaducidad ? new Date(cotizacionDetails.fechaCaducidad) : undefined,
            emisorNombre: cotizacionDetails.emisorNombre,
            emisorAreaComercial: cotizacionDetails.emisorAreaComercial,
            emisorEmail: cotizacionDetails.emisorEmail,
            comentariosAdicionales: cotizacionDetails.comentariosAdicionales,
            terminosPago: cotizacionDetails.terminosPago,
            medioPago: cotizacionDetails.medioPago,
            formaPago: cotizacionDetails.formaPago,
        });

        // 3. Generar HTML para el PDF
        const htmlParaPdf = generarHtmlParaPdf({
            calculoHistorialCompleto: nuevoHistorial,
            itemsParaCotizar: nuevoHistorial.itemsParaCotizar,
            resultadosCalculados: nuevoHistorial.resultadosCalculados,
            nombrePerfil: nuevoHistorial.nombrePerfil,
            anoEnCursoGlobal: nuevoHistorial.anoEnCursoGlobal
        });

        // 4. Generar PDF usando html-pdf
        const tmpDir = process.env.TMPDIR || '/app/tmp';
        const tmpFile = path.join(tmpDir, `config_${numeroSecuencialConfig}.pdf`);

        // Ensure temp directory exists and is writable
        try {
            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir, { recursive: true });
            }
            // Test write permissions
            const testFile = path.join(tmpDir, 'test.txt');
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            console.log('Directorio temporal verificado y con permisos de escritura');
        } catch (error) {
            console.error('Error al verificar el directorio temporal:', error);
            throw new Error(`No se pudo acceder al directorio temporal: ${error.message}`);
        }

        // Configuración básica de PhantomJS
        const opcionesPdf = {
            format: 'A4',
            border: '0.5in',
            phantomPath: process.env.PHANTOMJS_BIN || '/usr/local/bin/phantomjs',
            phantomArgs: [
                '--local-url-access=false',
                '--ignore-ssl-errors=true',
                '--web-security=false',
                '--debug=true'
            ],
            timeout: 60000, // 60 seconds timeout
            directory: tmpDir,
            filename: tmpFile
        };

        // Wrap PDF generation in a Promise for better error handling
        const generatePdf = () => {
            return new Promise((resolve, reject) => {
                try {
                    console.log('Iniciando creación del PDF con PhantomJS...');
                    console.log('Opciones de configuración:', JSON.stringify(opcionesPdf, null, 2));
                    
                    // Verificar que PhantomJS existe
                    if (!fs.existsSync(opcionesPdf.phantomPath)) {
                        throw new Error(`PhantomJS no encontrado en: ${opcionesPdf.phantomPath}`);
                    }
                    console.log('PhantomJS encontrado en:', opcionesPdf.phantomPath);

                    // Crear el PDF
                    const pdfInstance = pdf.create(htmlParaPdf, opcionesPdf);
                    
                    pdfInstance.toFile(tmpFile, (err, res) => {
                        if (err) {
                            console.error('Error detallado al generar el PDF:', err);
                            reject(err);
                            return;
                        }
                        
                        if (!res || !res.filename) {
                            console.error('Error: No se pudo generar el archivo PDF');
                            reject(new Error('No se pudo generar el archivo PDF'));
                            return;
                        }

                        console.log('PDF generado exitosamente en:', res.filename);
                        console.log('Tamaño del archivo:', fs.statSync(res.filename).size, 'bytes');

                        // Read the generated file
                        fs.readFile(res.filename, (err, buffer) => {
                            if (err) {
                                console.error('Error al leer el archivo PDF:', err);
                                reject(err);
                                return;
                            }

                            // Clean up the temporary file
                            fs.unlink(res.filename, (unlinkErr) => {
                                if (unlinkErr) {
                                    console.warn('Advertencia: No se pudo eliminar el archivo temporal:', unlinkErr);
                                } else {
                                    console.log('Archivo temporal eliminado correctamente');
                                }
                            });

                            resolve(buffer);
                        });
                    });

                    // Agregar manejador de eventos para errores de PhantomJS
                    pdfInstance.on('error', (err) => {
                        console.error('Error de PhantomJS:', err);
                    });

                } catch (error) {
                    console.error('Error inesperado en la generación del PDF:', error);
                    reject(error);
                }
            });
        };

        try {
            console.log('Iniciando generación de PDF...');
            console.log('Directorio temporal:', tmpDir);
            console.log('Ruta de PhantomJS:', process.env.PHANTOMJS_BIN);
            console.log('Archivo temporal:', tmpFile);
            
            const pdfBuffer = await generatePdf();
            console.log('PDF generado exitosamente');
            
            res.header('Content-Type', 'application/pdf');
            res.header('Content-Disposition', `inline; filename="Configuracion_${numeroSecuencialConfig}.pdf"`);
            res.header('X-Calculo-ID', nuevoHistorial._id.toString());
            res.header('X-Numero-Cotizacion', numeroSecuencialConfig.toString());
            res.send(pdfBuffer);
        } catch (error) {
            console.error('Error en la generación del PDF:', error);
            throw error;
        }

    } catch (error) {
        console.error('Error en guardarYExportarCalculos:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                message: 'Error interno del servidor al procesar la solicitud.',
                error: error.message 
            });
        }
    }
});

// --- Funciones Helper para Formato en HTML (similares a las del frontend) ---
const formatCLP = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '--';
    return `$ ${Number(value).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};
const formatGenericCurrency = (value, currency, digits = 2) => {
    if (value === null || value === undefined || isNaN(value)) return '--';
    const options = { style: 'currency', currency: currency, minimumFractionDigits: digits, maximumFractionDigits: digits };
    return Number(value).toLocaleString(currency === 'EUR' ? 'de-DE' : 'en-US', options);
};
const formatPercentDisplay = (value, digits = 2) => {
    if (value === null || value === undefined || isNaN(value)) return '--';
    return `${(Number(value) * 100).toFixed(digits)}%`;
};
const formatNumber = (value, digits = 4) => {
    if (value === null || value === undefined || isNaN(value)) return '--';
    return Number(value).toFixed(digits);
};

// --- Función para generar el HTML del PDF ---
const generarHtmlParaPdf = (datos) => {
    const { calculoHistorialCompleto } = datos; // Todos los datos necesarios están aquí

    const { 
        itemsParaCotizar, 
        resultadosCalculados, 
        empresaQueCotiza,
        numeroCotizacion,
        referenciaDocumento,
        fechaCreacionCotizacion,
        fechaCaducidadCotizacion,
        emisorNombre,
        emisorAreaComercial,
        emisorEmail,
        comentariosAdicionales
    } = calculoHistorialCompleto; 

    const miEmpresa = {
        nombre: empresaQueCotiza || "Nombre de Mi Empresa S.A.",
        rut: "76.123.456-7",
        direccion: "Av. Siempre Viva 742, Springfield",
        ciudad: "Santiago",
        pais: "Chile",
        telefono: "+56 2 2123 4567",
        email: emisorEmail || "ventas@miempresa.cl",
    };

    let itemsHtml = '';
    let subtotalNetoGeneral = 0;
    
    const primerProductoPrincipal = itemsParaCotizar.length > 0 ? itemsParaCotizar[0].principal.nombre_del_producto : "Equipos Varios";
    const tituloDocumento = `Informe de Configuración: ${primerProductoPrincipal}`;

    itemsParaCotizar.forEach((item, index) => {
        const productoPrincipal = item.principal;
        const keyProductoPrincipal = `principal-${productoPrincipal.codigo_producto}`;
        const calculosProductoMap = resultadosCalculados instanceof Map ? resultadosCalculados : new Map(Object.entries(resultadosCalculados));
        const calculosProducto = calculosProductoMap.get(keyProductoPrincipal);

        let precioUnitarioNetoPrincipal = 0;
        if (calculosProducto && calculosProducto.calculados && calculosProducto.calculados.precios_cliente) {
            precioUnitarioNetoPrincipal = calculosProducto.calculados.precios_cliente.precioNetoVentaFinalCLP || 0;
        }
        const cantidadPrincipal = 1; // Assuming quantity is always 1 for this report
        const totalPrincipal = precioUnitarioNetoPrincipal * cantidadPrincipal;
        subtotalNetoGeneral += totalPrincipal;

        itemsHtml += `
            <tr>
                <td>
                    <b>${productoPrincipal.nombre_del_producto || 'Producto Principal Sin Nombre'}</b><br>
                    <small style="white-space: pre-line;">${productoPrincipal.Descripcion || 'Sin descripción detallada.'}</small>
                </td>
                <td style="text-align:center;">${cantidadPrincipal}</td>
                <td style="text-align:right;">${formatCLP(precioUnitarioNetoPrincipal)}</td>
                <td style="text-align:right;">${formatCLP(totalPrincipal)}</td>
            </tr>
        `;

        if (item.opcionales && item.opcionales.length > 0) {
            item.opcionales.forEach(opcional => {
                const keyOpcional = `opcional-${opcional.codigo_producto}`;
                const calculosOpcional = calculosProductoMap.get(keyOpcional);
                let precioNetoOpcional = 0;
                if (calculosOpcional && calculosOpcional.calculados && calculosOpcional.calculados.precios_cliente) {
                    precioNetoOpcional = calculosOpcional.calculados.precios_cliente.precioNetoVentaFinalCLP || 0;
                }
                const cantidadOpcional = 1; // Assuming quantity is always 1 for optionals
                const totalOpcional = precioNetoOpcional * cantidadOpcional;
                subtotalNetoGeneral += totalOpcional;

                itemsHtml += `
                    <tr class="opcional-row">
                        <td>
                            &nbsp;&nbsp;&nbsp;└─ <i>${opcional.nombre_del_producto || 'Opcional Sin Nombre'}</i><br>
                            &nbsp;&nbsp;&nbsp;<small style="padding-left:15px; white-space: pre-line;"><i>${opcional.Descripcion || 'Sin descripción detallada.'}</i></small>
                        </td>
                        <td style="text-align:center;">${cantidadOpcional}</td>
                        <td style="text-align:right;">${formatCLP(precioNetoOpcional)}</td>
                        <td style="text-align:right;">${formatCLP(totalOpcional)}</td>
                    </tr>
                `;
            });
        }
    });

    const ivaPct = 0.19; 
    const montoIva = subtotalNetoGeneral * ivaPct;
    const totalGeneral = subtotalNetoGeneral + montoIva;

    let htmlContent = `
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { 
                font-family: Arial, sans-serif; 
                font-size: 12px; 
                color: #333;
                background-color: #ffffff;
                margin: 0;
                padding: 20px;
            }
            .container {
                max-width: 900px; 
                margin: auto;
                border: 1px solid #ccc; 
                padding: 25px;
            }
            .header-info {
                overflow: auto; 
                margin-bottom: 30px;
                padding-bottom: 20px;
                border-bottom: 1px solid #eee;
            }
            .company-rut {
                font-size: 11px;
                color: #555;
                margin-bottom:15px;
            }
            .document-title {
                font-size: 22px;
                font-weight: bold;
                color: #2c3e50;
                margin-bottom: 25px;
            }

            .info-columns {
                overflow: auto; 
                margin-bottom: 20px;
            }
            .info-columns .column {
                width: 100%;
            }
            .info-columns h3 {
                font-size: 14px;
                font-weight: bold;
                color: #3498db;
                margin-top: 0;
                margin-bottom: 10px;
                border-bottom: 1px solid #eee;
                padding-bottom: 5px;
            }
            .info-columns p {
                margin: 0 0 6px 0;
                line-height: 1.5;
            }
            .info-columns p strong { 
                font-weight: bold;
                color: #555;
            }

            .comments-section {
                margin-bottom: 30px;
                padding: 15px;
                background-color: #f9f9f9;
                border-radius: 4px;
                page-break-inside: avoid; /* Evitar corte interno */
            }
            .comments-section h3 {
                font-size: 14px;
                font-weight: bold;
                color: #3498db;
                margin-top: 0;
                margin-bottom: 10px;
            }
            .comments-section p {
                margin: 0 0 8px 0;
                line-height: 1.6;
            }
            .comments-section .label { /* Para etiquetas en Comentarios (Términos de pago, etc) */
                font-weight: bold;
                color: #444;
            }

            .items-table-container {
                margin-bottom: 30px;
            }
            .items-table-container h2 {
                font-size: 16px;
                color: #2c3e50;
                margin-bottom: 10px;
                border-bottom: 2px solid #3498db;
                padding-bottom: 5px;
            }
            table.items {
                width: 100%;
                border-collapse: collapse;
            }
            table.items th, table.items td {
                border: 1px solid #ddd;
                padding: 8px 10px;
                text-align: left;
                font-size: 11px;
            }
            table.items th {
                background-color: #f2f2f2;
                font-weight: bold;
                color: #333;
            }
            table.items .opcional-row td {
                background-color: #fcfcfc;
                font-size: 10.5px;
            }
            table.items small {
                font-size: 10px;
                color: #666;
            }

            .totals-section {
                margin-bottom: 30px;
                overflow: auto; /* Clearfix */
                page-break-inside: avoid; /* Evitar corte interno */
            }
            .totals-table {
                float: right;
                width: 40%; /* Ajustar ancho según necesidad */
            }
            .totals-table td {
                padding: 6px 0;
                font-size: 12px;
            }
            .totals-table td.label {
                text-align: right;
                font-weight: bold;
                color: #555;
                padding-right: 15px;
            }
            .totals-table td.value {
                text-align: right;
                font-weight: bold;
                color: #2c3e50;
            }
            .totals-table tr.grand-total td {
                font-size: 14px;
                color: #3498db;
                border-top: 2px solid #3498db;
                padding-top: 8px;
            }
            
            .conditions-section {
                margin-bottom: 30px;
                page-break-inside: avoid; /* Evitar corte interno */
            }
            .conditions-section h2 {
                font-size: 16px;
                color: #2c3e50;
                margin-bottom: 10px;
                border-bottom: 2px solid #3498db;
                padding-bottom: 5px;
            }
            .conditions-section h4 {
                font-size: 13px;
                font-weight: bold;
                color: #444;
                margin-top: 15px;
                margin-bottom: 5px;
            }
            .conditions-section p {
                font-size: 11px;
                line-height: 1.5;
                color: #555;
                margin-bottom: 8px;
            }

            .footer-contact {
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #ccc;
                text-align: center;
                font-size: 11px;
                color: #777;
                page-break-inside: avoid; /* Evitar corte interno */
            }
            .footer-contact p {
                margin: 3px 0;
            }
            .footer-contact strong {
                color: #555;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header-info">
                <div class="company-rut">
                    ${miEmpresa.rut}
                </div>
                <div class="document-title">${tituloDocumento}</div>
            </div>

            <div class="info-columns">
                <div class="column">
                    <h3>Detalles del Emisor</h3>
                    <p><strong>Configuración Nº:</strong> ${numeroCotizacion || 'N/A'}</p>                    
                    <p><strong>Informe creado por:</strong></p>
                    <p>${emisorNombre || 'Departamento Comercial'}</p>
                    ${emisorAreaComercial ? `<p>${emisorAreaComercial}</p>` : ''}
                </div>
            </div>

            <div class="comments-section">
                <h3>Comentarios Adicionales</h3> 
                ${comentariosAdicionales ? `<p style="white-space: pre-wrap;">${comentariosAdicionales}</p>` : '<p>No se ingresaron comentarios.</p>'}
            </div>

            <div class="items-table-container">
                <h2>Resumen de Equipos Calculados</h2>
                <table class="items">
                    <thead>
                        <tr>
                            <th style="width:55%;">Artículo y descripción</th>
                            <th style="width:10%; text-align:center;">Cantidad</th>
                            <th style="width:17.5%; text-align:right;">Precio unitario</th>
                            <th style="width:17.5%; text-align:right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>
            </div>

            <div class="totals-section">
                <table class="totals-table">
                    <tbody>
                        <tr>
                            <td class="label">Subtotal:</td>
                            <td class="value">${formatCLP(subtotalNetoGeneral)}</td>
                        </tr>
                        <tr>
                            <td class="label">IVA (${(ivaPct * 100).toFixed(0)}%):</td>
                            <td class="value">${formatCLP(montoIva)}</td>
                        </tr>
                        <tr class="grand-total">
                            <td class="label">Total:</td>
                            <td class="value">${formatCLP(totalGeneral)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            
            ${/* <div class="conditions-section">
                <h2>Condiciones de compra</h2>
                <h4>1- Antecedentes Técnicos Generales.</h4>
                <p>Los antecedentes técnicos de los productos y/o servicios cotizados, se encuentran en los documentos adjuntos a la presente cotización (si aplica).</p>
                <h4>2- Precio.</h4>
                <p>Los valores corresponden al precio neto más IVA, salvo que se indique lo contrario.</p>
                <h4>3- Plazo de Entrega.</h4>
                <p>El tiempo de entrega es estimativo y se confirmará con la Orden de Compra. La entrega se hace efectiva en bodega de ${miEmpresa.nombre}, o lugar a convenir.</p>
                <h4>4- Garantía.</h4>
                <p>El equipo se encuentra garantizado por un plazo de 12 meses por falla o defecto de construcción y/o material, no imputable al mal uso del equipo. Comprende piezas y partes, con la exclusión de aquellas que presenten desgaste natural por uso.</p>
            </div> */ ''}

            <div class="footer-contact">
                <p><strong>${miEmpresa.nombre}</strong></p>
                <p>${miEmpresa.direccion}, ${miEmpresa.ciudad}, ${miEmpresa.pais}</p>
                <p>Teléfono: ${miEmpresa.telefono} | Email: <a href="mailto:${miEmpresa.email}">${miEmpresa.email}</a></p>
                ${calculoHistorialCompleto._id ? `<p style="font-size:9px; color: #aaa; margin-top:10px;">ID de Cálculo Interno: ${calculoHistorialCompleto._id.toString()}</p>` : ''}
            </div>

        </div>
    </body>
    </html>
    `;

    return htmlContent;
};

// @desc    Guardar un nuevo historial de cálculo
// @route   POST /api/calculo-historial
// @access  Private (o según se defina la autenticación para esta acción)
const guardarCalculoHistorial = asyncHandler(async (req, res) => {
  try {
    const { itemsParaCotizar, resultadosCalculados, cotizacionDetails, nombreReferencia, selectedProfileId, nombrePerfil, anoEnCursoGlobal } = req.body;

    if (!itemsParaCotizar || !resultadosCalculados) {
      return res.status(400).json({ message: 'Los campos \'itemsParaCotizar\' y \'resultadosCalculados\' son obligatorios.' });
    }
    
    const numeroSecuencialConfig = await obtenerSiguienteNumeroConfiguracion('calculoHistorialCounter');

    const nuevoHistorial = new CalculoHistorial({
      itemsParaCotizar,
      resultadosCalculados,
      cotizacionDetails, 
      nombreReferencia,
      selectedProfileId: selectedProfileId || null,
      nombrePerfil: nombrePerfil || null,
      anoEnCursoGlobal: anoEnCursoGlobal || null,
      numeroConfiguracion: numeroSecuencialConfig,
      // Si cotizacionDetails no siempre viene o es parcial, considera valores por defecto o validación
    });

    const historialGuardado = await nuevoHistorial.save();
    res.status(201).json({
      message: 'Historial de cálculo guardado exitosamente.',
      data: historialGuardado
    });

  } catch (error) {
    console.error('Error al guardar el historial de cálculo:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ 
          message: 'Datos inválidos para el historial de cálculo.', 
          errors: messages 
      });
    }
    res.status(500).json({ message: 'Error interno al intentar guardar el historial de cálculo.', error: error.message });
  }
});

// @desc    Obtener todos los historiales de cálculo guardados con paginación y búsqueda
// @route   GET /api/calculo-historial
// @access  Private (o según se defina)
const getAllCalculosHistorial = asyncHandler(async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const searchTerm = req.query.search || '';
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    // Construir el filtro de búsqueda
    const searchFilter = {};
    if (searchTerm) {
      searchFilter.$or = [
        { 'clienteNombre': { $regex: searchTerm, $options: 'i' } },
        { 'clienteRut': { $regex: searchTerm, $options: 'i' } },
        { 'numeroConfiguracion': { $regex: searchTerm, $options: 'i' } },
        { 'empresaQueCotiza': { $regex: searchTerm, $options: 'i' } },
        { 'emisorNombre': { $regex: searchTerm, $options: 'i' } }
      ];
    }

    // Calcular el total de documentos que coinciden con el filtro
    const totalDocs = await CalculoHistorial.countDocuments(searchFilter);
    const totalPages = Math.ceil(totalDocs / limit);
    const skip = (page - 1) * limit;

    // Obtener los documentos paginados y ordenados
    const historiales = await CalculoHistorial.find(searchFilter)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .select({
        _id: 1,
        numeroConfiguracion: 1,
        createdAt: 1,
        nombreReferencia: 1,
        nombrePerfil: 1,
        'cotizacionDetails.clienteNombre': 1,
        itemsParaCotizar: { $slice: 1 }
      }); // Proyectar campos necesarios y limitar itemsParaCotizar

    // Construir la respuesta con metadatos de paginación
    const response = {
      data: historiales,
      total: totalDocs, // Añadimos el total directamente en la raíz
      page: page,
      limit: limit,
      totalPages: totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page < totalPages ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
      search: {
        term: searchTerm,
        sortBy,
        sortOrder: sortOrder === 1 ? 'asc' : 'desc'
      }
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error al obtener los historiales de cálculo:', error);
    res.status(500).json({ 
      message: 'Error interno al obtener los historiales de cálculo.', 
      error: error.message 
    });
  }
});

// @desc    Obtener un historial de cálculo específico por su ID
// @route   GET /api/calculo-historial/:id
// @access  Public (o según se defina)
const getCalculoHistorialById = asyncHandler(async (req, res) => {
  try {
    const historial = await CalculoHistorial.findById(req.params.id);

    if (historial) {
      res.status(200).json(historial);
    } else {
      res.status(404);
      throw new Error('Historial de cálculo no encontrado.');
    }
  } catch (error) {
    console.error(`Error al obtener el historial de cálculo por ID (${req.params.id}):`, error);
    if (error.kind === 'ObjectId') {
      res.status(400);
      throw new Error('ID de historial de cálculo no válido.');
    }
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({ 
      message: error.message || 'Error interno al obtener el historial.' 
    });
  }
});

// @desc    Eliminar un historial de cálculo por su ID
// @route   DELETE /api/calculo-historial/:id
// @access  Public (o Private si se usa autenticación)
const deleteCalculoHistorial = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[deleteCalculoHistorial] Intentando eliminar historial con ID: ${id}`);

    // Validar que el ID tenga el formato correcto de MongoDB
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      res.status(400);
      throw new Error('ID de historial de cálculo no válido. Debe ser un ObjectId válido de MongoDB.');
    }

    const historial = await CalculoHistorial.findById(id);
    console.log(`[deleteCalculoHistorial] Resultado de búsqueda:`, historial ? 'Encontrado' : 'No encontrado');

    if (!historial) {
      res.status(404);
      throw new Error('Historial de cálculo no encontrado.');
    }

    await historial.deleteOne();
    console.log(`[deleteCalculoHistorial] Historial eliminado exitosamente`);
    res.status(200).json({ 
      message: 'Historial de cálculo eliminado exitosamente.',
      id: id 
    });
  } catch (error) {
    console.error(`[deleteCalculoHistorial] Error al eliminar el historial de cálculo por ID (${req.params.id}):`, error);
    if (error.kind === 'ObjectId') {
      res.status(400);
      throw new Error('ID de historial de cálculo no válido.');
    }
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({ 
      message: error.message || 'Error interno al eliminar el historial.',
      error: error.message
    });
  }
});

module.exports = {
    guardarYExportarCalculos,
    generarHtmlParaPdf,
    guardarCalculoHistorial,
    getAllCalculosHistorial,
    getCalculoHistorialById,
    deleteCalculoHistorial
}; 