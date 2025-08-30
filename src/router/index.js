import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../auth/LoginView.vue'
import RegisterView from '@/auth/RegisterView.vue'
import HomepageView from '@/mainsite/HomepageView.vue'
import MapSearch from '@/mainsite/MapSearch.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'LoginView',
      component: LoginView
    },
     {
      path: '/register',
      name: 'RegisterVIew',
      component: RegisterView
    },
     {
      path: '/homepage',
      name: 'homepage',
      component: HomepageView
    },
     {
      path: '/mapsearch',
      name: 'mapsearch',
      component: MapSearch
    }
  ],
})

export default router
