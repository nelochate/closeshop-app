import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import '@mdi/font/css/materialdesignicons.css'
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'
import { useNotificationStore } from '@/stores/notification'
import 'mapbox-gl/dist/mapbox-gl.css'//for mapbox
//import pwa elements
import {defineCustomElements} from '@ionic/pwa-elements/loader';
//initialize pwa elements
defineCustomElements(window)
// Vuetify
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import "leaflet/dist/leaflet.css";

const app = createApp(App)
const pinia = createPinia()
const vuetify = createVuetify({
  icons: {
    defaultSet: 'mdi',
  },
  components,
  directives,
})




// ✅ Use plugins in correct order
app.use(pinia)
app.use(router)
app.use(vuetify)

// ✅ Wait for router to be ready before setting up auth listeners
router.isReady().then(() => {
  const authStore = useAuthUserStore()

  // ✅ Initial auth hydration
  if (!authStore.userData?.id) {
    authStore
      .hydrateFromSession()
      .then(() => {
        console.log('Auth initialized')
      })
      .catch(console.error)
  }

  // ✅ Set up auth state change listener
  supabase.auth.onAuthStateChange((event, session) => {
    window.setTimeout(async () => {
      if (session?.user) {
        await authStore.hydrateFromSession({
          session,
          force: event === 'SIGNED_IN' || event === 'USER_UPDATED',
        })
      } else {
        authStore.$reset()
      }
    }, 0)
  })

  // ✅ Mount the app
  app.mount('#app')
  console.log('App mounted successfully')
}).catch((error) => {
  console.error('Router failed to initialize:', error)
  app.mount('#app')
})

// ✅ Notification; Start listening after user logs in
supabase.auth.onAuthStateChange((event, session) => {
  if (session?.user) {
    const notificationStore = useNotificationStore()
    notificationStore.fetchNotifications(session.user.id)
    notificationStore.listenForNotifications(session.user.id)
  }
})



/*
//for nominatim
import express from 'express'
import fetch from 'node-fetch'
const app = express()

app.get('/geocode', async (req, res) => {
  const query = encodeURIComponent(req.query.q)
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}`

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Closeshop/1.0 (your-email@example.com)' // Nominatim requires this
    }
  })
  const data = await response.json()
  res.json(data)
})

app.listen(3000)
*/
