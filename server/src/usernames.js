// Regras do nome de usuário (login): minúsculas, sem acentos, 3–32 caracteres a-z 0-9 . _ -
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function validateUsername(value) {
  const u = normalizeUsername(value)
  if (!USERNAME_RE.test(u)) {
    return { error: 'Usuário inválido: use de 3 a 32 caracteres (letras, números, ponto, _ ou -), sem espaços.' }
  }
  return { value: u }
}

/** E-mail opcional: vazio → null; senão minúsculo e com formato válido. */
function validateEmail(value) {
  const e = String(value || '').trim().toLowerCase()
  if (!e) return { value: null }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { error: 'E-mail inválido' }
  return { value: e }
}

module.exports = { normalizeUsername, validateUsername, validateEmail }
