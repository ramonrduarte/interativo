const fs = require('fs')
const path = require('path')

const dataDir = path.join(__dirname, '../../data')
const uploadsDir = path.join(__dirname, '../../uploads')

fs.mkdirSync(dataDir, { recursive: true })
fs.mkdirSync(path.join(uploadsDir, 'images'), { recursive: true })
fs.mkdirSync(path.join(uploadsDir, 'videos'), { recursive: true })

// ---------------------------------------------------------------------------
// Minimal synchronous JSON file store
// ---------------------------------------------------------------------------
class Table {
  constructor(name) {
    this.file = path.join(dataDir, `${name}.json`)
    this._data = this._load()
  }

  _load() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')) }
    catch { return { nextId: 1, rows: [] } }
  }

  _save() {
    fs.writeFileSync(this.file, JSON.stringify(this._data, null, 2))
  }

  all() { return [...this._data.rows] }

  get(id) { return this._data.rows.find(r => r.id == id) || null }

  where(pred) { return this._data.rows.filter(pred) }

  findOne(pred) { return this._data.rows.find(pred) || null }

  insert(obj) {
    const row = { ...obj, id: this._data.nextId++, created_at: new Date().toISOString() }
    this._data.rows.push(row)
    this._save()
    return row
  }

  update(id, updates) {
    const idx = this._data.rows.findIndex(r => r.id == id)
    if (idx === -1) return null
    this._data.rows[idx] = { ...this._data.rows[idx], ...updates }
    this._save()
    return this._data.rows[idx]
  }

  remove(id) {
    const before = this._data.rows.length
    this._data.rows = this._data.rows.filter(r => r.id != id)
    this._save()
    return this._data.rows.length < before
  }

  removeWhere(pred) {
    this._data.rows = this._data.rows.filter(r => !pred(r))
    this._save()
  }
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------
const db = {
  layouts:        new Table('layouts'),
  media:          new Table('media'),
  playlists:      new Table('playlists'),
  playlistSlides: new Table('playlist_slides'),
  tickers:        new Table('tickers'),
  screens:        new Table('screens'),
  schedules:      new Table('schedules'),
}

// ---------------------------------------------------------------------------
// Seed layouts — adds missing templates without wiping existing data
// ---------------------------------------------------------------------------
const allSeeds = [
  // ── Horizontal (paisagem) ──────────────────────────────────────────────────
  { name: 'Tela Cheia',              template: 'fullscreen',        zone_count: 1, orientation: 'landscape', config: { zones: [{ id: 0, label: 'Principal' }] } },
  { name: 'Dividida 50/50',          template: 'split5050',         zone_count: 2, orientation: 'landscape', config: { zones: [{ id: 0, label: 'Esquerda' }, { id: 1, label: 'Direita' }] } },
  { name: 'Dividida 70/30',          template: 'split7030',         zone_count: 2, orientation: 'landscape', config: { zones: [{ id: 0, label: 'Principal' }, { id: 1, label: 'Lateral' }] } },
  { name: 'Cima / Baixo',            template: 'topbottom',         zone_count: 2, orientation: 'landscape', config: { zones: [{ id: 0, label: 'Superior' }, { id: 1, label: 'Inferior' }] } },
  { name: 'Grade 2x2',               template: 'grid2x2',           zone_count: 4, orientation: 'landscape', config: { zones: [{ id: 0, label: 'Sup. Esq' }, { id: 1, label: 'Sup. Dir' }, { id: 2, label: 'Inf. Esq' }, { id: 3, label: 'Inf. Dir' }] } },
  { name: 'Principal + Banner',      template: 'mainbanner',        zone_count: 2, orientation: 'landscape', config: { zones: [{ id: 0, label: 'Principal' }, { id: 1, label: 'Banner' }] } },
  // ── Vertical (retrato) ────────────────────────────────────────────────────
  { name: '[V] Tela Cheia',          template: 'v-fullscreen',      zone_count: 1, orientation: 'portrait',  config: { zones: [{ id: 0, label: 'Principal' }] } },
  { name: '[V] Metade / Metade',     template: 'v-half',            zone_count: 2, orientation: 'portrait',  config: { zones: [{ id: 0, label: 'Superior' }, { id: 1, label: 'Inferior' }] } },
  { name: '[V] 70% Cima + 30% Baixo',template: 'v-7030',           zone_count: 2, orientation: 'portrait',  config: { zones: [{ id: 0, label: 'Principal' }, { id: 1, label: 'Rodapé' }] } },
  { name: '[V] Três Faixas',         template: 'v-thirds',          zone_count: 3, orientation: 'portrait',  config: { zones: [{ id: 0, label: 'Topo' }, { id: 1, label: 'Meio' }, { id: 2, label: 'Base' }] } },
  { name: '[V] Principal + Banner',  template: 'v-mainbanner',      zone_count: 2, orientation: 'portrait',  config: { zones: [{ id: 0, label: 'Principal' }, { id: 1, label: 'Banner' }] } },
  { name: '[V] Grade 2x2',           template: 'v-grid2x2',         zone_count: 4, orientation: 'portrait',  config: { zones: [{ id: 0, label: 'Sup. Esq' }, { id: 1, label: 'Sup. Dir' }, { id: 2, label: 'Inf. Esq' }, { id: 3, label: 'Inf. Dir' }] } },
]

const existingTemplates = new Set(db.layouts.all().map(l => l.template))
allSeeds.forEach(s => { if (!existingTemplates.has(s.template)) db.layouts.insert(s) })

module.exports = { db }
