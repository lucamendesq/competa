import { ref, watchEffect } from 'vue'

const THEME_KEY = 'competa_theme'

export function useTheme() {
  const getInitial = () => {
    try {
      const stored = localStorage.getItem(THEME_KEY)
      if (stored === 'dark' || stored === 'light') return stored === 'dark'
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    } catch {
      return false
    }
  }

  const dark = ref(getInitial())

  watchEffect(() => {
    if (dark.value) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    try {
      localStorage.setItem(THEME_KEY, dark.value ? 'dark' : 'light')
    } catch {}
  })

  function toggle() {
    dark.value = !dark.value
  }

  return { dark, toggle }
}
