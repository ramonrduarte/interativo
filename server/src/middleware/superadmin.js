module.exports = function requireSuperadmin(req, res, next) {
  if (req.user?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Acesso restrito ao administrador principal' })
  }
  next()
}
