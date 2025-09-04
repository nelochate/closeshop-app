import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../auth/LoginView.vue'
import RegisterView from '@/auth/RegisterView.vue'
import HomepageView from '@/mainsite/HomepageView.vue'
import MapSearch from '@/mainsite/MapSearch.vue'
import CartView from '@/mainsite/CartView.vue'
import MsessagevVew from '@/mainsite/MsessagevVew.vue'
import ProfileView from '@/mainsite/ProfileView.vue'
import NotificationView from '@/mainsite/NotificationView.vue'

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
    },
    {
      path: '/cartview',
      name: 'cartview',
      component: CartView
    },
     {
      path: '/messageview',
      name: 'messageview',
      component: MsessagevVew
    },
     {
      path: '/profileview',
      name: 'profileview',
      component: ProfileView
    },
    {
      path: '/notificationview',
      name: 'notificationview',
      component: NotificationView
    }

  ],
})

export default router
