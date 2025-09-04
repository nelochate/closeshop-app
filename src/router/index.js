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

  // 🔹 1. Redirect logged-in users away from login/register
  if (isLoggedIn && (to.name === 'LoginView' || to.name === 'RegisterView')) {
    return { name: 'homepage' }
  }

  // 🔹 2. Redirect guests away from protected routes
  if (!isLoggedIn && to.meta.requiresAuth) {
    return { name: 'LoginView' }
  }

  // 🔹 3. Admin-only routes protection
  if (to.meta.requiresAdmin) {
    if (!isLoggedIn) {
      return { name: 'LoginView' }
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { name: 'LoginView' }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (error) throw error

      if (profile?.role !== 'admin') {
        return { name: 'homepage' }
      }
    } catch (error) {
      console.error('Admin check failed:', error)
      return { name: 'homepage' }
    }
  }

  // 🔹 4. No special rules → allow
  return true
})

export default router
