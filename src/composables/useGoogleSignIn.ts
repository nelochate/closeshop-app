import { ref } from 'vue'
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in'
import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey)

export function useGoogleSignIn() {
  const user = ref<any>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Initialize Google Sign-In
  const initialize = async () => {
    try {
      const webClientId = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID

      await GoogleSignIn.initialize({
        scopes: ['profile', 'email'],
        grantOfflineAccess: true,
        serverClientId: webClientId,
        forceCodeForRefreshToken: true
      })

      console.log('Google Sign-In initialized')
    } catch (err) {
      console.error('Failed to initialize Google Sign-In:', err)
      error.value = 'Failed to initialize Google Sign-In'
    }
  }

  // Sign in with Google
  const signIn = async () => {
    isLoading.value = true
    error.value = null

    try {
      // 1. Sign in with Google using Capacitor plugin
      const result = await GoogleSignIn.signIn()

      console.log('Google Sign-In result:', result)

      // 2. Get the ID token
      const idToken = result.idToken

      if (!idToken) {
        throw new Error('No ID token received from Google')
      }

      // 3. Sign in to Supabase with the Google ID token
      const { data, error: supabaseError } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken
      })

      if (supabaseError) throw supabaseError

      user.value = data.user
      console.log('Successfully signed in:', data.user)

      return data.user
    } catch (err: any) {
      console.error('Sign-in error:', err)

      // Handle specific error cases
      if (err.message?.includes('canceled')) {
        error.value = 'Sign-in was cancelled'
      } else if (err.message?.includes('network')) {
        error.value = 'Network error. Please check your connection'
      } else {
        error.value = err.message || 'Failed to sign in with Google'
      }

      throw err
    } finally {
      isLoading.value = false
    }
  }

  // Sign out
  const signOut = async () => {
    try {
      // Sign out from Google
      await GoogleSignIn.signOut()

      // Sign out from Supabase
      await supabase.auth.signOut()

      user.value = null
      console.log('Signed out successfully')
    } catch (err) {
      console.error('Sign-out error:', err)
      error.value = 'Failed to sign out'
    }
  }

  // Check current session
  const checkSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      user.value = session?.user || null
      return user.value
    } catch (err) {
      console.error('Session check error:', err)
      return null
    }
  }

  return {
    user,
    isLoading,
    error,
    initialize,
    signIn,
    signOut,
    checkSession
  }
}
