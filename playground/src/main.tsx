import { createRoot } from 'react-dom/client'

import { App } from './app'
import { ThemeProvider } from './theme-provider'

import '@radix-ui/themes/styles.css'
import './global.css'

createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
)
