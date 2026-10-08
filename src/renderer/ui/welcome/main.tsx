import '../../design/tokens.css'
import '../../design/page.css'
import '../../design/focus.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WelcomeApp } from './welcome-app'

const container = document.getElementById('root')
if (container === null) {
  throw new Error('renderer root element is missing')
}

createRoot(container).render(
  <StrictMode>
    <WelcomeApp />
  </StrictMode>
)
