import mongoose, { Schema, Document } from 'mongoose';

// Interfaz base para las características y datos contables para consistencia
interface ICaracteristicas {
  nombre_del_producto?: string;
  modelo?: string;
  descripcion?: string; // Ya estaba, pero aseguremos que esté
  // Aquí podrían ir más campos específicos de 'características' si se normalizan
}

interface IDatosContables {
  costo_fabrica?: number;
  divisa_costo?: string;
  fecha_cotizacion?: Date | string;
  // Aquí podrían ir más campos específicos de 'datos_contables'
}

export interface IProducto extends Document {
  codigo_producto: string; // Hecho requerido y único como en el controller
  nombre_del_producto?: string;
  descripcion?: string;
  Modelo?: string; // Nota: MongoDB es sensible a mayúsculas/minúsculas. 'Modelo' vs 'modelo'
  tipo?: string; // Ej: Equipo, Opcional
  pf_eur?: number | string; // Precio Fábrica EUR
  dimensiones?: any; // Puede ser un string simple o un objeto {largo_mm, ancho_mm, alto_mm, diametro_mm}
  peso_kg?: number | string;
  transporte_nacional?: number | string;
  ay?: number | string; // ¿Qué significa 'ay'? Considerar un nombre más descriptivo
  
  // Campos anidados (ejemplos)
  caracteristicas?: ICaracteristicas;
  datos_contables?: IDatosContables;

  // Nuevas especificaciones técnicas detalladas
  especificaciones_tecnicas?: mongoose.Schema.Types.Mixed; 

  // Campos para la gestión de precios e inventario (ejemplos adicionales)
  proveedor?: string;
  procedencia?: string; // Origen del producto
  clasificacion_easysystems?: string; // Clasificación interna
  codigo_ea?: string; // Código alternativo (Ej: EasyAnatomy)
  es_opcional?: boolean; // Indica si el producto es un opcional de otro
  // ...otros campos que puedan ser relevantes para la gestión
  // Campos de auditoría
  createdAt?: Date;
  updatedAt?: Date;
}

const ProductoSchema: Schema = new Schema({
  codigo_producto: { type: String, required: true, unique: true, trim: true },
  nombre_del_producto: { type: String, trim: true },
  descripcion: { type: String, trim: true },
  Modelo: { type: String, trim: true }, // Consistent with IProducto
  tipo: { type: String, trim: true },
  pf_eur: { type: Schema.Types.Mixed }, // Number or String
  dimensiones: { type: Schema.Types.Mixed },
  peso_kg: { type: Schema.Types.Mixed }, // Number or String
  transporte_nacional: { type: Schema.Types.Mixed }, // Number or String
  ay: { type: Schema.Types.Mixed }, // Number or String
  
  caracteristicas: {
    nombre_del_producto: { type: String, trim: true },
    modelo: { type: String, trim: true },
    descripcion: { type: String, trim: true },
  },
  datos_contables: {
    costo_fabrica: { type: Number },
    divisa_costo: { type: String, trim: true },
    fecha_cotizacion: { type: Schema.Types.Mixed }, // Date or String
  },

  especificaciones_tecnicas: { 
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  proveedor: { type: String, trim: true },
  procedencia: { type: String, trim: true },
  clasificacion_easysystems: { type: String, trim: true },
  codigo_ea: { type: String, trim: true },
  es_opcional: { type: Boolean, default: false },
}, { timestamps: true }); // timestamps agrega createdAt y updatedAt automáticamente

// Indexación para búsquedas comunes (ejemplo)
ProductoSchema.index({ nombre_del_producto: 'text', descripcion: 'text', Modelo: 'text' });
ProductoSchema.index({ tipo: 1 });

export default mongoose.model<IProducto>('Producto', ProductoSchema); 