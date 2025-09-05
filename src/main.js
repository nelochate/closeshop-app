import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import '@mdi/font/css/materialdesignicons.css'
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'

// Vuetify
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import "leaflet/dist/leaflet.css";



const app = createApp(App)
const vuetify = createVuetify({
     icons: {
    defaultSet: 'mdi', // This is already the default value - only for display purposes
  },
  components,
  directives,

})
app.use(createPinia())
app.use(router)
app.use(vuetify)

const authStore = useAuthUserStore()
authStore.hydrateFromSession()

supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) {
    await authStore.hydrateFromSession()
  } else {
    authStore.$reset()
  }
})
app.mount('#app')
