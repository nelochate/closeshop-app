import { supabase } from "@/utils/supabase"

// Send password reset email
export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/update-password`,
  })

  if (error) throw new Error(error.message)
  return "Password reset link sent. Check your email."
}

// Update password using access token from URL
export async function updatePassword(newPassword) {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword
  })

  if (error) throw new Error(error.message)
  return data.user
}
