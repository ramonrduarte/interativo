// ---------------------------------------------------------------------------
// Atualização automática do app Android (Interativa Player)
//
//  GET  /api/app/latest          (público)   → versão publicada, lida pelas TVs
//  GET  /api/admin/app-release   (superadmin) → mesma informação, para o painel
//  POST /api/admin/app-release   (superadmin) → publica um .apk novo
//
// O .apk fica em uploads/app/ (volume persistente) e é servido por /uploads.
// O nome gerado pelo build traz a versão: interativa-player-1.5.0-6.apk
// ---------------------------------------------------------------------------
const express = require('express')
const multer  = require('multer')
const crypto  = require('crypto')
const path    = require('path')
const fs      = require('fs')

const appDir     = path.join(__dirname, '../../../uploads/app')
const latestFile = path.join(appDir, 'latest.json')
fs.mkdirSync(appDir, { recursive: true })

const upload = multer({
  dest: appDir,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.apk$/i.test(file.originalname)) cb(null, true)
    else cb(new Error('Envie o arquivo .apk do Interativa Player'))
  },
})

function readLatest() {
  try { return JSON.parse(fs.readFileSync(latestFile, 'utf8')) } catch { return null }
}

const publicRouter = express.Router()
publicRouter.get('/latest', (_req, res) => {
  const latest = readLatest()
  if (!latest) return res.status(404).json({ error: 'Nenhuma versão publicada' })
  res.json(latest)
})

const adminRouter = express.Router()   // montado dentro de /api/admin (já exige superadmin)

adminRouter.get('/app-release', (_req, res) => res.json(readLatest()))

adminRouter.post('/app-release', upload.single('apk'), (req, res) => {
  const tmp = req.file?.path
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' })

    // Versão: campos do formulário ou o nome do arquivo gerado pelo build
    const m = req.file.originalname.match(/(\d+\.\d+\.\d+)-(\d+)\.apk$/i)
    const versionCode = Number(req.body.versionCode || m?.[2])
    const versionName = String(req.body.versionName || m?.[1] || versionCode)
    if (!Number.isInteger(versionCode) || versionCode <= 0) {
      fs.unlinkSync(tmp)
      return res.status(400).json({ error: 'Não foi possível identificar a versão. Use o arquivo gerado pelo build (ex.: interativa-player-1.5.0-6.apk).' })
    }

    // Um .apk é um arquivo zip: confere a assinatura "PK"
    const head = Buffer.alloc(2)
    const fd = fs.openSync(tmp, 'r'); fs.readSync(fd, head, 0, 2, 0); fs.closeSync(fd)
    if (head.toString() !== 'PK') {
      fs.unlinkSync(tmp)
      return res.status(400).json({ error: 'Arquivo inválido — não é um .apk' })
    }

    const current = readLatest()
    if (current && versionCode <= current.versionCode && req.body.force !== 'true') {
      fs.unlinkSync(tmp)
      return res.status(400).json({ error: `Já existe a versão ${current.versionName} (${current.versionCode}) publicada. Envie uma versão mais nova.` })
    }

    const fileName = `interativa-player-${versionCode}.apk`
    fs.renameSync(tmp, path.join(appDir, fileName))
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(appDir, fileName))).digest('hex')
    const latest = {
      versionCode, versionName,
      url:  `/uploads/app/${fileName}`,
      size: req.file.size,
      sha256,
      publishedAt: new Date().toISOString(),
    }
    fs.writeFileSync(latestFile, JSON.stringify(latest, null, 2))

    // Mantém só a versão atual e a anterior
    fs.readdirSync(appDir)
      .filter(f => /^interativa-player-\d+\.apk$/.test(f) && f !== fileName && f !== `interativa-player-${current?.versionCode}.apk`)
      .forEach(f => { try { fs.unlinkSync(path.join(appDir, f)) } catch {} })

    console.log(`[app] Versão ${versionName} (${versionCode}) publicada`)
    res.json(latest)
  } catch (e) {
    if (tmp && fs.existsSync(tmp)) try { fs.unlinkSync(tmp) } catch {}
    res.status(500).json({ error: e.message })
  }
})

module.exports = { publicRouter, adminRouter }
