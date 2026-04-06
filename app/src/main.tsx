import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import PetWindow from './PetWindow.tsx'

const path = window.location.pathname
const isPet = path === '/pet'

// Pet window needs fully transparent background
if (isPet) {
  document.documentElement.classList.add('pet-mode')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPet ? <PetWindow /> : <App />}
  </StrictMode>,
)
