import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ModalProvider } from '@/hooks/use-modal'
import { ConnectionProvider } from '@/hooks/use-connection'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <ConnectionProvider>
        <ModalProvider>
          <App />
        </ModalProvider>
      </ConnectionProvider>
    </TooltipProvider>
  </StrictMode>
)
