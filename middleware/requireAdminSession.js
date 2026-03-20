// middleware/requireAdminSession.js
module.exports = function (req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  return res.status(401).json({ error: 'No autenticado (sesión admin requerida)' });
};
