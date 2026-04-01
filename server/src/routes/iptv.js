const express = require('express')
const https = require('https')
const http = require('http')
const router = express.Router()

// Parse M3U text into channel list
function parseM3U(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const channels = []
  let meta = null

  for (const raw of lines) {
    const line = raw.trim()
    if (line.startsWith('#EXTINF:')) {
      const name  = line.match(/,(.+)$/)
      const logo  = line.match(/tvg-logo="([^"]*)"/)
      const group = line.match(/group-title="([^"]*)"/)
      const id    = line.match(/tvg-id="([^"]*)"/)
      meta = {
        name:  name?.[1]?.trim()  || 'Canal',
        logo:  logo?.[1]  || null,
        group: group?.[1] || null,
        id:    id?.[1]    || null,
      }
    } else if (line && !line.startsWith('#') && meta) {
      channels.push({ ...meta, url: line })
      meta = null
    }
  }
  return channels
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject)
      }
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

// GET /api/iptv/parse?url=...  — server fetches + parses M3U (bypasses CORS)
router.get('/parse', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'url é obrigatório' })
  try {
    const text = await fetchUrl(url)
    const channels = parseM3U(text)
    res.json({ channels, total: channels.length })
  } catch (e) {
    res.status(500).json({ error: 'Não foi possível carregar a lista: ' + e.message })
  }
})

// POST /api/iptv/parse  — client sends raw M3U text
router.post('/parse', (req, res) => {
  const { content } = req.body
  if (!content) return res.status(400).json({ error: 'content é obrigatório' })
  const channels = parseM3U(content)
  res.json({ channels, total: channels.length })
})

module.exports = router
