const BASE = '/api'

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

export const api = {
  // Content/Media
  getContent: () => req('GET', '/content'),
  uploadFile: (formData) => req('POST', '/content/upload', formData),
  addExternal: (data) => req('POST', '/content/external', data),
  updateContent: (id, data) => req('PUT', `/content/${id}`, data),
  deleteContent: (id) => req('DELETE', `/content/${id}`),

  // Layouts
  getLayouts: () => req('GET', '/layouts'),

  // Playlists
  getPlaylists: () => req('GET', '/playlists'),
  createPlaylist: (data) => req('POST', '/playlists', data),
  getPlaylist: (id) => req('GET', `/playlists/${id}`),
  updatePlaylist: (id, data) => req('PUT', `/playlists/${id}`, data),
  deletePlaylist: (id) => req('DELETE', `/playlists/${id}`),

  // Slides
  addSlide: (playlistId, data) => req('POST', `/playlists/${playlistId}/slides`, data),
  updateSlide: (playlistId, slideId, data) => req('PUT', `/playlists/${playlistId}/slides/${slideId}`, data),
  deleteSlide: (playlistId, slideId) => req('DELETE', `/playlists/${playlistId}/slides/${slideId}`),
  reorderSlides: (playlistId, slides) => req('PUT', `/playlists/${playlistId}/slides/reorder`, { slides }),

  // Screens
  getScreens: () => req('GET', '/screens'),
  createScreen: (data) => req('POST', '/screens', data),
  getScreen: (id) => req('GET', `/screens/${id}`),
  updateScreen: (id, data) => req('PUT', `/screens/${id}`, data),
  deleteScreen: (id) => req('DELETE', `/screens/${id}`),
  pushScreen: (id) => req('POST', `/screens/${id}/push`),

  // Tickers
  getTickers: () => req('GET', '/tickers'),
  createTicker: (data) => req('POST', '/tickers', data),
  updateTicker: (id, data) => req('PUT', `/tickers/${id}`, data),
  deleteTicker: (id) => req('DELETE', `/tickers/${id}`),

  // Pairing
  pairTv: (code, screen_id) => req('POST', '/pair', { code, screen_id }),
  getPairingWaiting: () => req('GET', '/pair/waiting'),

  // Schedules
  getSchedules: (screenId) => req('GET', `/schedules${screenId ? `?screen_id=${screenId}` : ''}`),
  createSchedule: (data) => req('POST', '/schedules', data),
  updateSchedule: (id, data) => req('PUT', `/schedules/${id}`, data),
  deleteSchedule: (id) => req('DELETE', `/schedules/${id}`),

  // Status
  getStatus: () => req('GET', '/status'),
}
