import { useEffect, useState } from 'react'

// Tema claro/escuro: segue o sistema na primeira visita e lembra a escolha do usuário.
const KEY = 'interativa_theme'

export function getInitialTheme() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme)
  useEffect(() => {
    applyTheme(theme)
    try { localStorage.setItem(KEY, theme) } catch {}
  }, [theme])
  return [theme, () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))]
}
