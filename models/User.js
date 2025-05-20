const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'El nombre es obligatorio.'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'El correo electrónico es obligatorio.'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Por favor ingrese un correo electrónico válido.'],
  },
  password: {
    type: String,
    required: [true, 'La contraseña es obligatoria.'],
    minlength: [6, 'La contraseña debe tener al menos 6 caracteres.'],
    // No seleccionar la contraseña por defecto en las consultas
    select: false,
  },
  isAdmin: {
    type: Boolean,
    required: true,
    default: false,
  },
}, {
  timestamps: true, // Añade createdAt y updatedAt automáticamente
});

// Middleware para hashear la contraseña antes de guardar (en creación o modificación)
userSchema.pre('save', async function (next) {
  // Solo hashear la contraseña si ha sido modificada (o es nueva)
  if (!this.isModified('password')) {
    return next();
  }

  // Generar salt y hashear la contraseña
  try {
    const salt = await bcrypt.genSalt(10); // Cost factor de 10
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error); // Pasar error al siguiente middleware/handler
  }
});

// Método para comparar la contraseña ingresada con la hasheada en la BD
userSchema.methods.matchPassword = async function (enteredPassword) {
  // 'this.password' se refiere a la contraseña hasheada del documento de usuario
  // Es necesario seleccionar explícitamente la contraseña al buscar el usuario, ya que select: false
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User; 