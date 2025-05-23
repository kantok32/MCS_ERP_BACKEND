# 🏭 MCS ERP Backend

[![Node.js](https://img.shields.io/badge/Node.js-v14+-green.svg)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Latest-blue.svg)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)

## 📝 Descripción
Backend del Sistema de Control de Maquinaria (MCS ERP) desarrollado en Node.js. Este sistema proporciona una API RESTful para la gestión de productos, costos, perfiles y usuarios, con integración de servicios de IA para análisis y procesamiento de datos.

## ✨ Características Principales
- 🛠️ Gestión de productos y especificaciones
- 💰 Cálculo de costos y perfiles
- 🔐 Sistema de autenticación y autorización
- 🤖 Integración con servicios de IA
- 🌐 API RESTful
- 💱 Soporte para múltiples monedas
- ⚡ Caché de productos para optimización

## 📋 Requisitos Previos
- Node.js (v14 o superior)
- MongoDB
- npm o yarn

## 🚀 Instalación

1. Clonar el repositorio:
```bash
git clone https://github.com/kantok32/MCS_ERP_BACKEND.git
cd MCS_ERP_BACKEND
```

2. Instalar dependencias:
```bash
npm install
```

3. Configurar variables de entorno:
Crear un archivo `.env` en la raíz del proyecto con las siguientes variables:
```env
MONGODB_URI=tu_uri_de_mongodb
JWT_SECRET=tu_secreto_jwt
PORT=3000
```

4. Iniciar el servidor:
```bash
npm start
```

## 📁 Estructura del Proyecto

```
MCS_ERP_BACKEND/
├── 📂 config/             # Configuraciones (base de datos, variables de entorno)
├── 📂 controllers/        # Controladores de la lógica de negocio
├── 📂 data/              # Datos y caché
├── 📂 middleware/        # Middleware (autenticación, manejo de errores)
├── 📂 models/            # Modelos de datos
├── 📂 routes/            # Rutas de la API
├── 📂 src/               # Código fuente TypeScript
├── 📂 utils/             # Utilidades y helpers
├── 📄 server.js          # Punto de entrada de la aplicación
└── 📄 package.json       # Dependencias y scripts
```

## 🔌 API Endpoints

### 🔐 Autenticación
- `POST /api/users/register` - Registro de usuarios
- `POST /api/users/login` - Inicio de sesión

### 📦 Productos
- `GET /api/products` - Obtener lista de productos
- `POST /api/products` - Crear nuevo producto
- `GET /api/products/:id` - Obtener producto específico
- `PUT /api/products/:id` - Actualizar producto
- `DELETE /api/products/:id` - Eliminar producto

### 💰 Costos y Perfiles
- `GET /api/costos-perfil` - Obtener perfiles de costo
- `POST /api/costos-perfil` - Crear perfil de costo
- `GET /api/calculo-historial` - Obtener historial de cálculos

### 💱 Monedas
- `GET /api/currencies` - Obtener tasas de cambio
- `POST /api/currencies/convert` - Convertir monedas

## 🛠️ Características Técnicas

### 🔒 Seguridad
- Autenticación JWT
- Middleware de autorización
- Manejo seguro de contraseñas
- Validación de datos

### ⚡ Optimización
- Caché de productos
- Compresión de respuestas
- Manejo eficiente de conexiones a base de datos

### 🤖 Integración con IA
- Procesamiento de lenguaje natural
- Análisis de datos
- Generación de respuestas inteligentes

## 🐳 Docker

El proyecto incluye configuración Docker para facilitar el despliegue:

```bash
# Construir la imagen
docker build -t mcs-erp-backend .

# Ejecutar el contenedor
docker run -p 3000:3000 mcs-erp-backend
```

## 🤝 Contribución

1. Fork el repositorio
2. Crear una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.

## 📞 Contacto

Para soporte o consultas, por favor abrir un issue en el repositorio.

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/kantok32">kantok32</a></sub>
</div> 