import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: 'accountant' | 'contact'
    title?: string
  }
}
