import { create } from 'zustand'

const STORAGE_KEY = 'interativa_config'

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) } catch { return null }
}

export const useTvStore = create(set => ({
  config: loadSaved(),
  connected: false,
  token: new URLSearchParams(window.location.search).get('token') || localStorage.getItem('interativa_token'),

  setConfig: config => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)) } catch {}
    set({ config })
  },

  setConnected: connected => set({ connected }),

  setToken: token => {
    localStorage.setItem('interativa_token', token)
    set({ token })
  },
}))
