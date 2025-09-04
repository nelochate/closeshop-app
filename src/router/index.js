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

  // Home page redirection
  if (to.path === '/login') {
    return isLoggedIn ? { name: 'homepage' } : { name: 'LoginView' }
  }

  // Prevent logged-in users from accessing auth pages
  if (isLoggedIn && (to.name === 'LoginView' || to.name === 'RegisterView')) {
    return { name: 'homepage' }
  }

  // Protect auth-required routes
  if (!isLoggedIn && to.meta.requiresAuth) {
    return { name: 'LoginView' }
  }

  // Admin route protection
  if (isLoggedIn && to.meta.requiresAdmin) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return { name: 'LoginView' }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (error) throw error

      if (profile?.role !== 'admin') {
        // redirect non-admins safely
        return { name: 'homepage' }
      }
    } catch (error) {
      console.error('Admin check failed:', error)
      return { name: 'homepage' }
    }
  }
})

export default router
