import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MetroidvaniaLab } from '../../src/prototypes/metroidvania/MetroidvaniaLab'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MetroidvaniaLab />
  </StrictMode>,
)
