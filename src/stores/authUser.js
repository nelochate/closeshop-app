// /src/stores/authUser .ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/utils/supabase'

export const useAuthUserStore = defineStore('authUser ', () => {
  const userData = ref(null) // Store full user object including user_metadata
  const profile = ref(null) // Stores user profile from profiles table
  const isLoading = ref(false)
  const error = ref(null)

  const isLoggedIn = computed(() => !!userData.value)
  const userId = computed(() => (userData.value ? userData.value.id : null))
  const isAdmin = computed(() => profile.value?.role === 'admin')

  function $reset() {
    userData.value = null
    profile.value = null
    error.value = null
  }

async function hydrateFromSession() {
  try {
    isLoading.value = true
    const { data, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw sessionError
    const user = data.session?.user
    if (!user) {
      $reset()
      return false
    }
    // Store full user object with metadata
    userData.value = user
    await loadProfile(user.id)
    return true
  } catch (e) {
    console.error('hydrateFromSession failed:', e)
    $reset()
    return false
  } finally {
    isLoading.value = false
  }
}


  async function loadProfile(uid) {
    if (!uid) uid = userId.value
    if (!uid) return
    const { data, error: pErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .single()
    if (pErr) {
      console.error('loadProfile error:', pErr)
      return
    }
    profile.value = data
  }

  async function signIn(email, password) {
    error.value = null
    const { data, error: e } = await supabase.auth.signInWithPassword({ email, password })
    if (e) throw e
    userData.value = data.user
    await loadProfile(data.user.id)
    return data
  }

  async function signUp(email, password) {
    error.value = null
    const { data, error: e } = await supabase.auth.signUp({ email, password })
    if (e) throw e
    return data
  }

  async function signOut() {
    try {
      isLoading.value = true
      error.value = null
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw signOutError
      $reset()
      return true
    } catch (err) {
      error.value = err.message || 'Logout failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function isAuthenticated() {
    try {
      if (userData.value) return true
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session) return false
      return true
    } catch (e) {
      console.error('isAuthenticated error:', e)
      return false
    }
  }

  async function forceLogout() {
    await supabase.auth.signOut()
    $reset()
  }

  return {
    userData,
    profile,
    isLoading,
    error,
    isLoggedIn,
    isAdmin,
    userId,
    $reset,
    hydrateFromSession,
    loadProfile,
    signIn,
    signUp,
    signOut,
    isAuthenticated,
    forceLogout,
  }
})
