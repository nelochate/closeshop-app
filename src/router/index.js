import { createRouter, createWebHistory } from 'vue-router'
import { useAuthUserStore } from '@/stores/authUser'
import { routes } from './routes'
import { supabase } from '@/utils/supabase'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(async (to) => {
  const authStore = useAuthUserStore()
  const isLoggedIn = await authStore.isAuthenticated()

  // Prevent logged-in users from going back to /login or /register
  if (isLoggedIn && (to.path === '/login' || to.path === '/register')) {
    return { path: '/homepage' }
  }

  // Protect routes that need authentication
  if (!isLoggedIn && to.meta.requiresAuth) {
    return { path: '/login' }
  }

  // 🔒 Admin route protection
  if (to.meta.requiresAdmin) {
    if (!isLoggedIn) return { path: '/login' }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return { path: '/login' }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (error) throw error

      if (profile?.role !== 'admin') {
        return { path: '/homepage' } // redirect non-admins
      }
    } catch (error) {
      console.error('Admin check failed:', error)
      return { path: '/homepage' }
    }
  }

  return true
})

export default router
