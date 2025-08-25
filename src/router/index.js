import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../auth/LoginView.vue'
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'LoginView',
      component: LoginView
    }
  ],
})

export default router
