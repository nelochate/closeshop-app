import { createRouter, createWebHistory } from 'vue-router' // Changed to createWebHistory

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
import ForgotPasswordView from '@/mainsite/ForgotPasswordView.vue'
import UpdatePasswordView from '@/mainsite/UpdatePasswordView.vue'
import { useAuthUserStore } from '@/stores/authUser'
import UserShop from '@/mainsite/UserShop.vue'
import ProductListing from '@/mainsite/ProductListing.vue'
import ChatView from '@/mainsite/ChatView.vue'

// ✅ Define routes
const routes = [
  { path: '/', name: 'login', component: LoginView },
  { path: '/register', name: 'register', component: RegisterView },
  { path: '/homepage', name: 'homepage', component: HomepageView, meta: { requiresAuth: true } },
  { path: '/mapsearch', name: 'mapsearch', component: MapSearch, meta: { requiresAuth: true } },
  { path: '/cartview', name: 'cartview', component: CartView, meta: { requiresAuth: true } },
  {
    path: '/messageview',
    name: 'messageview',
    component: MessageView,
    meta: { requiresAuth: true },
  },
  {
    path: '/chatview/:id',
    name: 'chatview',
    component: ChatView,
    meta: { requiresAuth: true },
  },

  {
    path: '/profileview',
    name: 'profileview',
    component: ProfileView,
    meta: { requiresAuth: true },
  },
  {
    path: '/notificationview',
    name: 'notificationview',
    component: NotificationView,
    meta: { requiresAuth: true },
  },
  { path: '/register-success', name: 'confirm-email', component: ConfirmEmail },
  {
    path: '/admin-dashboard',
    name: 'admin-dashboard',
    component: AdminDashboard,
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/shop-build/:id?',
    name: 'shop-build',
    component: () => import('@/mainsite/ShopBuild.vue'),
  },
  { path: '/usershop', name: 'usershop', component: UserShop, meta: { requiresAuth: true } },
  {
    path: '/productlist',
    name: 'productlist',
    component: ProductListing,
    meta: { requiresAuth: true },
  },
  {
    path: '/additem/:id?',
    name: 'AddItem',
    component: () => import('@/mainsite/AddItem.vue'),
  },

  // ✅ Allow unauthenticated access to update-password
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: ForgotPasswordView,
    meta: { requiresAuth: false },
  },

  {
    path: '/update-password',
    name: 'update-password',
    component: UpdatePasswordView,
    meta: { requiresAuth: false },
  },

  {
    path: '/edit-profile',
    name: 'edit-profile',
    component: () => import('@/mainsite/EditProfileview.vue'),
    meta: { requiresAuth: true },
  },

  {
    path: '/product/:id',
    name: 'product-detail',
    component: () => import('@/mainsite/ProductDetailView.vue'),
    props: true,
  },

  {
    path: '/shop/:id',
    name: 'shop-view',
    component: () => import('@/mainsite/ShopView.vue'),
    props: true,
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/mainsite/SettingsView.vue'),
    meta: { requiresAuth: true },
  },

  {
    path: '/edit-email',
    name: 'edit-email',
    component: () => import('@/mainsite/edit/EditEmailView.vue'),
    meta: { requiresAuth: true },
  },

  {
    path: '/edit-name',
    name: 'edit-name',
    component: () => import('@/mainsite/edit/EditNameView.vue'),
    meta: { requiresAuth: true },
  },

  {
    path: '/edit-phone', // Updated path
    name: 'edit-phone',
    component: () => import('@/mainsite/edit/EditPhoneView.vue'),
    meta: { requiresAuth: true },
  },

  {
    path: '/my-address',
    name: 'my-address',
    component: () => import('@/mainsite/edit/MyAddressView.vue'),
  },
  {
    path: '/edit-address/:id?',
    name: 'edit-address',
    component: () => import('@/mainsite/edit/EditAddressForm.vue'),
    meta: { requiresAuth: true },
  },

  // ✅ Catch-all route
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },

  //Search Functionality
  {
    path: '/search',
    name: 'search',
    component: () => import('@/mainsite/SearchView.vue'),
  },

  {
    path: '/purchaseview/:id?', // Make id optional with ?
    name: 'purchaseview',
    component: () => import('@/mainsite/PurchaseView.vue'),
  },
  //for checkout
  {
    path: '/checkout-success/:orderId',
    name: 'checkout-success',
    component: () => import('@/mainsite/CheckoutSuccess.vue'),
    props: true,
  },
  {
    path: '/rateview/:orderId',
    name: 'rateview',
    component: () => import('@/mainsite/RateView.vue'),
    props: true,
  },
  {
    path: '/viewproduct/:id', // Add :id parameter
    name: 'viewproduct',
    component: () => import('@/mainsite/ViewProducts.vue'),
    props: true, // This will pass the id as a prop to your component
  },
]

// ✅ Use HISTORY mode instead of hash mode
const history = createWebHistory() // Changed from createWebHashHistory()

const router = createRouter({
  history, // Now using history mode
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    return { top: 0 }
  },
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

    console.log(
      'Navigation:',
      to.path,
      'Logged in:',
      isLoggedIn,
      'Requires auth:',
      to.meta.requiresAuth,
    )

    // ✅ Skip auth check for routes that explicitly allow unauthenticated access
    if (to.meta.requiresAuth === false) {
      return next() // Allow access to routes like update-password
    }

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
    next('/')
  }
})

export default router
