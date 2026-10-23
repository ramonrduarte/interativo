// ---------------------------------------------------------------------------
// Conversão automática de vídeos para H.264
//
// Vídeos em HEVC/H.265 (padrão de muitos celulares), VP9, 10 bits ou acima de
// 1080p não tocam em boa parte das TV boxes e navegadores (tela preta).
// Todo vídeo enviado é verificado com ffprobe e, se preciso, convertido com
// ffmpeg para H.264 8 bits até 1920px, com "faststart" (começa a tocar antes
// de baixar tudo). A conversão roda em fila, um vídeo por vez, em segundo plano.
// ---------------------------------------------------------------------------
const { spawn } = require('child_process')
const path = require('path')
const fs   = require('fs')
const { db } = require('./db')

const uploadsDir = path.join(__dirname, '../../uploads')
const MAX_SIDE   = 1920
const OK_PIX_FMT = ['yuv420p', 'yuvj420p']

const queue   = []
const queued  = new Map()   // media id → { name, company_id } na fila ou em conversão
let running   = false
let available = null        // ffmpeg instalado?
let current   = null        // conversão em andamento (para o painel)

function run(cmd, args, onLine) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = '', partial = ''
    p.stdout.on('data', d => {
      if (!onLine) { out += d; return }
      partial += d
      const lines = partial.split('\n')
      partial = lines.pop()
      lines.forEach(onLine)
    })
    p.stderr.on('data', d => { err = (err + d).slice(-4000) })
    p.on('error', reject)
    p.on('close', code => code === 0 ? resolve(out) : reject(new Error(`${cmd} saiu com código ${code}: ${err.trim().split('\n').pop()}`)))
  })
}

async function ffmpegAvailable() {
  if (available === null) {
    try { await run('ffmpeg', ['-version']); await run('ffprobe', ['-version']); available = true }
    catch { available = false; console.warn('[video] ffmpeg não encontrado — conversão de vídeos desativada') }
  }
  return available
}

async function probe(file) {
  const out = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height,pix_fmt:format=duration', '-of', 'json', file])
  const json = JSON.parse(out)
  const v = json.streams?.[0]
  return v ? { ...v, duration: Number(json.format?.duration) || 0 } : null
}

/** Caminho relativo da miniatura de um vídeo: videos/x.mp4 → videos/x.jpg */
function thumbFor(filename) {
  return filename.replace(/\.[^./]+$/, '') + '.jpg'
}

/** Gera a miniatura (quadro em ~1 s, 480 px de largura) se ainda não existir. */
async function ensureThumb(filename) {
  const thumb = path.join(uploadsDir, thumbFor(filename))
  if (fs.existsSync(thumb)) return
  const src = path.join(uploadsDir, filename)
  for (const at of ['1', '0']) {   // vídeos com menos de 1 s: pega o primeiro quadro
    try {
      await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', at, '-i', src,
        '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', thumb])
      if (fs.existsSync(thumb)) return
    } catch {}
  }
}

function needsConversion(v) {
  if (!v) return false
  return v.codec_name !== 'h264'
    || !OK_PIX_FMT.includes(v.pix_fmt)
    || Math.max(v.width || 0, v.height || 0) > MAX_SIDE
}

async function convertMedia(mediaId) {
  const media = await db.media.get(mediaId)
  if (!media || media.type !== 'video' || !media.filename) return
  const src = path.join(uploadsDir, media.filename)
  if (!fs.existsSync(src)) return

  const info = await probe(src)
  if (!needsConversion(info)) return

  const relDst = media.filename.replace(/\.[^./]+$/, '') + '-h264.mp4'
  const dst    = path.join(uploadsDir, relDst)
  const tmp    = dst + '.part'
  console.log(`[video] Convertendo "${media.name}" (${info.codec_name} ${info.width}x${info.height} ${info.pix_fmt}) → H.264`)
  const started = Date.now()
  current = { mediaId: media.id, name: media.name, company_id: media.company_id, startedAt: started, duration: info.duration, done: 0 }

  // -progress pipe:1 → ffmpeg informa o tempo já convertido (out_time_us) para calcular a %
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-nostats', '-progress', 'pipe:1', '-i', src,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', `scale=w='min(${MAX_SIDE},iw)':h='min(${MAX_SIDE},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart', '-f', 'mp4', tmp], line => {
    const m = line.match(/^out_time_(?:us|ms)=(\d+)/)
    if (m && current) current.done = Number(m[1]) / 1e6
  })
  current = null
  fs.renameSync(tmp, dst)

  await db.media.update(media.id, {
    filename:  relDst,
    mime_type: 'video/mp4',
    file_size: fs.statSync(dst).size,
  })
  // Original só é apagado depois que o banco já aponta para o arquivo novo
  try { fs.unlinkSync(src) } catch {}
  try { fs.unlinkSync(path.join(uploadsDir, thumbFor(media.filename))) } catch {}
  await ensureThumb(relDst)
  console.log(`[video] "${media.name}" convertido em ${Math.round((Date.now() - started) / 1000)}s`)

  await refreshScreens(media.company_id)
}

// Reenvia a configuração às TVs da empresa para usarem o arquivo novo
async function refreshScreens(companyId) {
  try {
    const { pushToScreen } = require('./socket')
    const screens = await db.screens.where(s => s.company_id == companyId)
    for (const s of screens) await pushToScreen(s.id)
  } catch (e) { console.error('[video] erro ao atualizar telas:', e.message) }
}

async function processQueue() {
  if (running) return
  running = true
  while (queue.length) {
    const id = queue.shift()
    try { await convertMedia(id) }
    catch (e) {
      current = null
      console.error(`[video] Falha ao converter mídia ${id}:`, e.message)
      // limpa arquivo parcial, se houver
      try {
        const m = await db.media.get(id)
        const part = m && path.join(uploadsDir, m.filename.replace(/\.[^./]+$/, '') + '-h264.mp4.part')
        if (part && fs.existsSync(part)) fs.unlinkSync(part)
      } catch {}
    }
    queued.delete(id)
  }
  running = false
}

/** Agenda a verificação/conversão de um vídeo (chamado após o upload). */
async function queueConversion(mediaId) {
  if (!(await ffmpegAvailable())) return
  if (queued.has(mediaId)) return
  const m = await db.media.get(mediaId)
  if (!m || m.type !== 'video' || !m.filename) return
  // Só entra na fila (e aparece no painel) o que realmente precisa ser convertido
  try {
    const src = path.join(uploadsDir, m.filename)
    if (!fs.existsSync(src)) return
    const info = await probe(src)
    // Duração medida pelo servidor: o navegador não consegue ler vídeos HEVC no upload,
    // e sem ela a playlist não oferece a opção "duração do vídeo"
    if (!m.video_duration && info?.duration > 0) {
      await db.media.update(m.id, { video_duration: Math.round(info.duration) })
    }
    // Miniatura para a Biblioteca (vídeos que vão ser convertidos ganham a deles depois)
    if (!needsConversion(info)) { await ensureThumb(m.filename); return }
  } catch (e) {
    console.warn(`[video] Não foi possível analisar "${m.name}":`, e.message)
    return
  }
  if (queued.has(mediaId)) return
  queued.set(mediaId, { name: m.name, company_id: m.company_id })
  queue.push(mediaId)
  processQueue()
}

/** Situação das conversões de uma empresa (para o painel). */
function getStatus(companyId) {
  const mine = id => queued.get(id)?.company_id == companyId
  let active = null
  if (current && current.company_id == companyId) {
    const elapsed = (Date.now() - current.startedAt) / 1000
    const pct = current.duration > 0 ? Math.min(99, Math.round((current.done / current.duration) * 100)) : null
    const speed = elapsed > 3 && current.done > 0 ? current.done / elapsed : null     // segundos de vídeo por segundo
    const remaining = speed && current.duration ? Math.max(0, Math.round((current.duration - current.done) / speed)) : null
    active = { mediaId: current.mediaId, name: current.name, percent: pct, elapsedSec: Math.round(elapsed), remainingSec: remaining }
  }
  // Usa o mapa "queued" (e não só a fila): entre um vídeo e outro o próximo já saiu
  // da fila mas ainda não começou — não pode sumir do painel nesse intervalo.
  const waiting = [...queued.keys()]
    .filter(id => mine(id) && id !== active?.mediaId)
    .map(id => ({ mediaId: id, name: queued.get(id).name }))
  return { active, waiting }
}

/** Na inicialização: verifica todos os vídeos já enviados e converte os incompatíveis. */
function startVideoMaintenance() {
  setTimeout(async () => {
    try {
      if (!(await ffmpegAvailable())) return
      const videos = await db.media.where(m => m.type === 'video' && m.filename)
      for (const v of videos) await queueConversion(v.id)
      if (videos.length) console.log(`[video] ${videos.length} vídeo(s) verificados na inicialização`)
    } catch (e) { console.error('[video] erro na verificação inicial:', e.message) }
  }, 15_000)
}

module.exports = { queueConversion, startVideoMaintenance, needsConversion, getStatus, thumbFor }
