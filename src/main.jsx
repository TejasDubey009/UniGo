import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// UniGo never runs inside another site's frame, where a hidden page could trick a signed-in admin or
// captain into clicking (clickjacking). Hosting should also send X-Frame-Options; see README.
const framed = (() => {
  try {
    return window.top !== window.self
  } catch {
    return true
  }
})()

const root = document.getElementById('root')
if (framed) {
  const link = document.createElement('a')
  link.href = window.location.href
  link.target = '_top'
  link.rel = 'noopener'
  link.textContent = 'Open UniGo in its own tab'
  link.style.cssText = 'display:block;padding:24px;font:600 16px system-ui,sans-serif;color:#163300'
  root.replaceChildren(link)
} else {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
