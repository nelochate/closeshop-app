import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../auth/LoginView.vue'
import RegisterView from '@/auth/RegisterView.vue'

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
    }
  ],
})

export default router
