// middleware/verifyToken.js
const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  let token = req.header('Authorization');
  console.log('🧪 TOKEN RECIBIDO:', token);

  if (!token) return res.status(401).json({ error: 'Acceso denegado. No hay token.' });

  if (typeof token === 'string' && token.startsWith('Bearer ')) {
    token = token.split(' ')[1].trim();
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified; // debe incluir { _id, role }
    next();
  } catch (err) {
    console.log('❌ TOKEN INVALIDO:', err.message);
    res.status(401).json({ error: 'Token no válido.' });
  }
};
