// /src/stores/authUser .ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/utils/supabase'
import { syncProfileFromAuthUser } from '@/utils/profileSync'

export const useAuthUserStore = defineStore('authUser ', () => {
  const userData = ref(null) // Store full user object including user_metadata
  const profile = ref(null) // Stores user profile from profiles table
  const isLoading = ref(false)
  const error = ref(null)
  let hydrationPromise = null

  const isLoggedIn = computed(() => !!userData.value)
  const userId = computed(() => (userData.value ? userData.value.id : null))
  const isAdmin = computed(() => profile.value?.role === 'admin')

  function $reset() {
    userData.value = null
    profile.value = null
    error.value = null
  }

  async function hydrateFromSession(options = {}) {
    const { session = null, user = session?.user ?? null, force = false } = options

    if (hydrationPromise) {
      return hydrationPromise
    }

    if (!force && userData.value?.id && profile.value?.id === userData.value.id && !user) {
      return true
    }

    hydrationPromise = (async () => {
      try {
        isLoading.value = true

        let resolvedUser = user
        if (!resolvedUser?.id) {
          const { data, error: sessionError } = await supabase.auth.getSession()
          if (sessionError) throw sessionError
          resolvedUser = data.session?.user || null
        }

        if (!resolvedUser) {
          $reset()
          return false
        }

        userData.value = resolvedUser
        await loadProfile(resolvedUser.id, resolvedUser)
        return true
      } catch (e) {
        console.error('hydrateFromSession failed:', e)
        $reset()
        return false
      } finally {
        isLoading.value = false
        hydrationPromise = null
      }
    })()

    return hydrationPromise
  }


  async function loadProfile(uid, authUser = userData.value) {
    if (!uid) uid = userId.value
    if (!uid) return

    if (authUser?.id === uid) {
      const syncedProfile = await syncProfileFromAuthUser({
        user: authUser,
        defaultRole: 'customer',
      })

      if (syncedProfile) {
        profile.value = syncedProfile
        return syncedProfile
      }
    }

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
    return data
  }

  async function signIn(email, password) {
    error.value = null
    const { data, error: e } = await supabase.auth.signInWithPassword({ email, password })
    if (e) throw e
    userData.value = data.user
    await loadProfile(data.user.id, data.user)
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
