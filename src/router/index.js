import LoginView from '../auth/LoginView.vue'
import RegisterView from '@/auth/RegisterView.vue'
import HomepageView from '@/mainsite/HomepageView.vue'
import MapSearch from '@/mainsite/MapSearch.vue'
import CartView from '@/mainsite/CartView.vue'
import MessageView from '@/mainsite/MessageView.vue'
import ProfileView from '@/mainsite/ProfileView.vue'
import NotificationView from '@/mainsite/NotificationView.vue'
import ConfirmEmail from '@/common/ConfirmEmail.vue'
import AdminDashboard from '@/mainsite/AdminDashboard.vue'

import { useAuthUserStore } from '@/stores/authUser'
import { supabase } from '@/utils/supabase'
import { createRouter, createWebHistory } from 'vue-router'
import ShopBuild from '@/mainsite/ShopBuild.vue'

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
  },
  {
  path: '/register-success',
  name: 'cormfirm-email',
  component: ConfirmEmail
  },
  {
    path: '/admin-dashboard',
    name: 'admin-dashboard',
    component: AdminDashboard,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/shop-build',
    name: 'shop-build',
    component: ShopBuild,
   meta: { requiresAuth: true }// ikaw edit ani bep ug sakto bani murag kaw may nakasabot dri new ni
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
    // get current session (make sure session is available)
    const { data } = await supabase.auth.getSession()
    const session = data?.session

    // if no session, force login
    if (!session) return { path: '/' }

    const userId = session.user.id

    // fetch role from profiles
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Error fetching profile in route guard:', error)
      // if profile can't be fetched, send to homepage (or login if you prefer)
      return { path: '/' }
    }

    if (profile?.role !== 'admin') {
      return { path: '/homepage' }
    }
  }

  // allow navigation
  return true
})

export default router
