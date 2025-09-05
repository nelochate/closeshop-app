import LoginView from '../auth/LoginView.vue'
import RegisterView from '@/auth/RegisterView.vue'
import HomepageView from '@/mainsite/HomepageView.vue'
import MapSearch from '@/mainsite/MapSearch.vue'

// Toggle for system deface mode
const isDefaced = false

// Routes
export const routes = isDefaced
  ? [

      {
        path: '/',
        name: 'LoginView',
        component: () => import('@/auth/LoginView.vue'),
        meta: { requiresAuth: false }
      },
      {
        path: '/register',
        name: 'RegisterView',
        component: () => import('@/auth/RegisterView.vue'),
        meta: { requiresAuth: false }
      },
      {
        path: '/homepage',
        name: 'homepage',
        component: () => import('@/mainsite/HomepageView.vue'),
        meta: { requiresAuth: true } // protect homepage
      },
      {
        path: '/mapsearch',
        name: 'mapsearch',
        component: () => import('@/mainsite/MapSearch.vue'),
        meta: { requiresAuth: true } // protect mapsearch
      }
    ]
  : [
      // ✅ if deface is off, still provide the normal routes
      {
        path: '/',
        name: 'LoginView',
        component: LoginView,
        meta: { requiresAuth: false }
      },
      {
        path: '/register',
        name: 'RegisterView',
        component: RegisterView,
        meta: { requiresAuth: false }
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
      }
    ]
