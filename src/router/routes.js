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
        path: '/login',
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
        meta: { requiresAuth: true } // protect homepage
      },
      {
        path: '/mapsearch',
        name: 'mapsearch',
        component: MapSearch,
        meta: { requiresAuth: true } // protect mapsearch
      }
    ]
  : [
      // ✅ if deface is off, still provide the normal routes
      {
        path: '/login',
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
