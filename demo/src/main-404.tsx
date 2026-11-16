import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts'
import './styles/kit/tokens.css'
import './styles/kit/kit.css'
import './styles/tokens.css'
import './styles/app.css'
import NotFound from './NotFound'

// The reveal's hidden starting state applies only once the script is running; the kit's motion (kit.css) only when
// the system does not ask for less motion.
document.documentElement.classList.add('js')
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.add('k-motion')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NotFound />
  </StrictMode>,
)
