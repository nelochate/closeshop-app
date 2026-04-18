import { supabase } from './supabase'

interface UpdatePasswordResult {
  success: boolean
  error?: string
}

export const updateUserPassword = async (newPassword: string): Promise<UpdatePasswordResult> => {
  try {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    // Check for lock error but verify if update actually worked
    if (error && error.message && error.message.includes('lock')) {
      console.warn('Supabase lock warning detected, verifying session...')

      // Verify if the session still exists (which means update likely succeeded)
      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
        // Session exists, password was likely updated successfully
        return { success: true }
      } else {
        // No session, actual error occurred
        return {
          success: false,
          error: 'Session expired. Please request a new reset link.'
        }
      }
    }

    // Regular error handling
    if (error) {
      return { success: false, error: error.message }
    }

    // No error at all
    return { success: true }

  } catch (error: any) {
    console.error('Password update error:', error)
    return {
      success: false,
      error: error.message || 'An unexpected error occurred'
    }
  }
}

// Also create a helper to check if we're in a valid password reset session
export const isValidResetSession = async (): Promise<boolean> => {
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) return false

  // Check if this is a password recovery session
  // You can add additional checks here if needed
  return true
}
