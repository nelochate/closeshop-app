<template>
  <div class="callback-container">
    <v-progress-circular indeterminate color="primary" />
    <p>Processing sign-in...</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const route = useRoute()

const getSafeRedirectPath = () => {
  const rawRedirect = typeof route.query.redirectTo === 'string' ? route.query.redirectTo : ''

  if (!rawRedirect.startsWith('/') || rawRedirect.startsWith('//')) {
    return null
  }

  return rawRedirect
}

onMounted(async () => {
  const { data, error } = await supabase.auth.getSession()
  const requestedRedirectPath = getSafeRedirectPath()
  const callbackFlow = typeof route.query.flow === 'string' ? route.query.flow : null

  if (error) {
    console.error('Error getting session:', error)
    router.replace('/')
    return
  }

  if (callbackFlow === 'signup-confirmation') {
    if (data.session) {
      await supabase.auth.signOut()
    }

    router.replace(requestedRedirectPath || '/email-confirmed')
    return
  }

  if (data.session) {
    if (requestedRedirectPath) {
      router.replace(requestedRedirectPath)
      return
    }

    // Check profile and redirect
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.session.user.id)
      .single()

    const redirectPath = profile?.role === 'admin' ? '/admin-dashboard' : '/homepage'
    router.replace(redirectPath)
  } else {
    router.replace('/')
  }
})
</script>

<style scoped>
.callback-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 20px;
}
</style>
