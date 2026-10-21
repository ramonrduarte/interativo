import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { applyTheme, getInitialTheme } from './theme.js'

// Aplica o tema antes de desenhar, para não piscar claro → escuro
applyTheme(getInitialTheme())

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
