import React from 'react'
import ReactDOM from 'react-dom/client'
import '@readio/ui/styles.css'
import { App } from './App'
import './styles.css'

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('Missing #app root for @readio/cloud-ui scaffold')
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
