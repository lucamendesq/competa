import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  const accountants = ref<{ id: string, name: string }[]>([])
  
  return {
    accountants
  }
})
