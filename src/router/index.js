import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../auth/LoginView.vue'
import RegisterView from '@/auth/RegisterView.vue'
import HomepageView from '@/mainsite/HomepageView.vue'
import MapSearch from '@/mainsite/MapSearch.vue'
import CartView from '@/mainsite/CartView.vue'
import MessageView from '@/mainsite/MessageView.vue'
import ProfileView from '@/mainsite/ProfileView.vue'
import NotificationView from '@/mainsite/NotificationView.vue'

import { useAuthUserStore } from '@/stores/authUser'
import { supabase } from '@/utils/supabase'

// define all routes in one place
const routes = [
  {
    path: '/',
    name: 'login',
    component: LoginView
  },
  {
    path: '/register',
    name: 'register',
    component: RegisterView
  },
  {
    path: '/homepage',
    name: 'homepage',
    component: HomepageView,
    meta: { requiresAuth: true }
  },
  {
    path: '/mapsearch',
    name: 'mapsearch',
    component: MapSearch,
    meta: { requiresAuth: true }
  },
  {
    path: '/cartview',
    name: 'cartview',
    component: CartView,
    meta: { requiresAuth: true }
  },
  {
    path: '/messageview',
    name: 'messageview',
    component: MessageView,
    meta: { requiresAuth: true }
  },
  {
    path: '/profileview',
    name: 'profileview',
    component: ProfileView,
    meta: { requiresAuth: true }
  },
  {
    path: '/notificationview',
    name: 'notificationview',
    component: NotificationView,
    meta: { requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// ✅ auth + admin guard
router.beforeEach(async (to) => {
  const authStore = useAuthUserStore()
  const isLoggedIn = await authStore.isAuthenticated()

  // prevent logged-in users from returning to login/register
  if (isLoggedIn && (to.path === '/' || to.path === '/register')) {
    return { path: '/homepage' }
  }

  // protect authenticated routes
  if (!isLoggedIn && to.meta.requiresAuth) {
    return { path: '/' }
  }

  // protect admin routes
  if (to.meta.requiresAdmin) {
    if (!isLoggedIn) return { path: '/' }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return { path: '/' }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (error) throw error

      if (profile?.role !== 'admin') {
        return { path: '/homepage' }
      }
    } catch (err) {
      console.error('Admin check failed:', err)
      return { path: '/homepage' }
    }
  }

  return true
})

export default router
