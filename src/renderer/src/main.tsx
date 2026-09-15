import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ModalProvider } from '@/hooks/use-modal'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <ModalProvider>
        <App />
      </ModalProvider>
    </TooltipProvider>
  </StrictMode>
)
