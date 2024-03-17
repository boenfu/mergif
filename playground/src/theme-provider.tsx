import { Theme } from '@radix-ui/themes'
import type { FC, PropsWithChildren } from 'react'
import { useCallback, useEffect, useState } from 'react'

export type ColorScheme = 'light' | 'dark'

declare global {
  interface Window {
    preferredColorScheme: ColorScheme
    setPreferredColorScheme?(color: ColorScheme): void
  }
}

export const ThemeProvider: FC<PropsWithChildren<any>> = ({
  children,
  ...props
}) => {
  const [preferredColorScheme, setPreferredColorScheme] = useState<ColorScheme>(
    localStorage.getItem('appearance') === 'dark' ? 'dark' : 'light',
  )

  window.preferredColorScheme = preferredColorScheme
  window.setPreferredColorScheme = setPreferredColorScheme

  useEffect(() => {
    if (!window.matchMedia) {
      setPreferredColorScheme('light')
      return
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    setPreferredColorScheme(mediaQuery.matches ? 'dark' : 'light')

    function onChange(event: MediaQueryListEvent): void {
      setPreferredColorScheme(event.matches ? 'dark' : 'light')
    }

    mediaQuery.addEventListener('change', onChange)

    return () => {
      mediaQuery.removeEventListener('change', onChange)
    }
  }, [])

  useEffect(() => {
    switch (preferredColorScheme) {
      case 'light': {
        document.body.classList.remove('light', 'dark')
        document.body.classList.add('light')
        break
      }
      case 'dark': {
        document.body.classList.remove('light', 'dark')
        document.body.classList.add('dark')
        break
      }
    }

    localStorage.setItem('appearance', preferredColorScheme)
  }, [preferredColorScheme])

  return (
    <Theme {...props} appearance={preferredColorScheme} accentColor="brown" radius="small">
      {children}
    </Theme>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePreferredColorScheme() {
  const [preferredColorScheme, setPreferredColorScheme] = useState<ColorScheme>(
    window.preferredColorScheme,
  )

  useEffect(() => {
    if (!window.matchMedia)
      return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    function onChange(): void {
      setTimeout(() => {
        setPreferredColorScheme(window.preferredColorScheme)
      })
    }

    mediaQuery.addEventListener('change', onChange)

    return () => {
      mediaQuery.removeEventListener('change', onChange)
    }
  }, [])

  return [preferredColorScheme, useCallback((color: ColorScheme) => {
    setPreferredColorScheme(color)
    window.setPreferredColorScheme?.(color)
  }, [])] as const
}
