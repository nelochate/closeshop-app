import { createRouter, createWebHashHistory } from 'vue-router'
import { Capacitor } from '@capacitor/core'

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
import ShopBuild from '@/mainsite/ShopBuild.vue'

import { useAuthUserStore } from '@/stores/authUser'
import UserShop from '@/mainsite/UserShop.vue'
import ProductListing from '@/mainsite/ProductListing.vue'


// ✅ Define routes
const routes = [
  { path: '/', name: 'login', component: LoginView },
  { path: '/register', name: 'register', component: RegisterView },
  { path: '/homepage', name: 'homepage', component: HomepageView, meta: { requiresAuth: true } },
  { path: '/mapsearch', name: 'mapsearch', component: MapSearch, meta: { requiresAuth: true } },
  { path: '/cartview', name: 'cartview', component: CartView, meta: { requiresAuth: true } },
  { path: '/messageview', name: 'messageview', component: MessageView, meta: { requiresAuth: true } },
  { path: '/profileview', name: 'profileview', component: ProfileView, meta: { requiresAuth: true } },
  { path: '/notificationview', name: 'notificationview', component: NotificationView, meta: { requiresAuth: true } },
  { path: '/register-success', name: 'confirm-email', component: ConfirmEmail },
  { path: '/admin-dashboard', name: 'admin-dashboard', component: AdminDashboard, meta: { requiresAuth: true, requiresAdmin: true } },
  { path: '/shop-build', name: 'shop-build', component: ShopBuild, meta: { requiresAuth: true } },
  { path: '/usershop', name: 'usershop', component: UserShop, meta: { requiresAuth: true } },//sakto ni
    { path: '/productlist', name: 'productlist', component: ProductListing, meta: { requiresAuth: true } },//sakto ni

  // ✅ Catch-all route
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

// ✅ Use hash history to avoid server configuration issues
const isCapacitor = Capacitor.isNativePlatform()
const history = isCapacitor ? createWebHashHistory() : createWebHashHistory() // Force hash for now

const router = createRouter({
  history,
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    return { top: 0 }
  }
})

// ✅ Track if auth has been initialized
let authInitialized = false

router.beforeEach(async (to, from, next) => {
  try {
    const authStore = useAuthUserStore()

    // ✅ Initialize auth if not done yet
    if (!authInitialized) {
      await authStore.hydrateFromSession()
      authInitialized = true
    }

    const isLoggedIn = authStore.isLoggedIn

    console.log('Navigation:', to.path, 'Logged in:', isLoggedIn)

    // ✅ Redirect authenticated users away from auth pages
    if (isLoggedIn && (to.path === '/' || to.path === '/register')) {
      return next({ path: '/homepage', replace: true })
    }

    // ✅ Redirect unauthenticated users from protected routes
    if (!isLoggedIn && to.meta.requiresAuth) {
      return next({ path: '/', replace: true })
    }

    // ✅ Handle admin routes
    if (to.meta.requiresAdmin) {
      if (!authStore.isAdmin) {
        console.log('Admin access denied - redirecting to homepage')
        return next({ path: '/homepage', replace: true })
      }
    }

    // ✅ All checks passed
    next()
  } catch (error) {
    console.error('Router navigation error:', error)
    // ✅ On error, redirect to login but don't replace to avoid loops
    next('/')
  }
})

// ✅ Handle navigation errors
router.onError((error, to) => {
  console.error('Navigation error to:', to.fullPath, error)
  if (error.message.includes('Failed to fetch dynamically imported module')) {
    window.location.reload()
  }
})

export default router
