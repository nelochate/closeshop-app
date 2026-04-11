<template>
  <v-app>
    <v-container class="fill-height" fluid>
      <v-row align="center" justify="center">
        <v-col cols="12" sm="8" md="4">
          <v-card class="elevation-12">
            <v-toolbar color="primary" dark flat>
              <v-toolbar-title>Completing Sign In</v-toolbar-title>
            </v-toolbar>
            <v-card-text class="text-center pa-4">
              <v-progress-circular
                :size="50"
                color="primary"
                indeterminate
              ></v-progress-circular>
              <p class="mt-4">Please wait while we complete your sign in...</p>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </v-app>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { App } from '@capacitor/app'

const router = useRouter()
const isNative = Capacitor.isNativePlatform()

onMounted(async () => {
  try {
    if (isNative) {
      // For native, close the browser
      await Browser.close()
    }

    // Get the session
    const { data: { session }, error } = await supabase.auth.getSession()

    if (error) {
      console.error('Auth callback error:', error)
      router.push('/login')
      return
    }

    if (session) {
      // Check user role and redirect
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      const redirectPath = profile?.role === 'admin' ? '/admin-dashboard' : '/homepage'
      router.push(redirectPath)
    } else {
      router.push('/login')
    }
  } catch (error) {
    console.error('Error in auth callback:', error)
    router.push('/login')
  }
})
</script>
