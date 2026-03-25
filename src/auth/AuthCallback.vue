<template>
  <div class="callback-container">
    <v-progress-circular indeterminate color="primary" />
    <p>Processing sign-in...</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()

onMounted(async () => {
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    console.error('Error getting session:', error)
    router.push('/')
    return
  }

  if (data.session) {
    // Check profile and redirect
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.session.user.id)
      .single()

    const redirectPath = profile?.role === 'admin' ? '/admin-dashboard' : '/homepage'
    router.push(redirectPath)
  } else {
    router.push('/')
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
