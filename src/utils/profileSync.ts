import { supabase } from '@/utils/supabase'
import {
  deriveProfileIdentityFromAuthUser,
  normalizeIdentityText,
} from '@/utils/accountIdentity'
import { withSchemaColumnFallback } from '@/utils/supabaseSchema'

type SyncProfileOptions = {
  user?: any | null
  defaultRole?: string
}

const PROFILE_SELECT = '*'

const normalizeNameValue = (value?: string | null) => normalizeIdentityText(value).toLowerCase()

const isReplaceablePlaceholderName = (firstName?: string | null, lastName?: string | null) => {
  const normalizedFirstName = normalizeNameValue(firstName)
  const normalizedLastName = normalizeNameValue(lastName)

  if (!normalizedFirstName && !normalizedLastName) {
    return false
  }

  const fullName = [normalizedFirstName, normalizedLastName].filter(Boolean).join(' ').trim()

  return (
    (normalizedFirstName === 'user' && normalizedLastName === 'profile') ||
    fullName === 'user profile'
  )
}

export const syncProfileFromAuthUser = async ({
  user,
  defaultRole = 'customer',
}: SyncProfileOptions) => {
  if (!user?.id) {
    return null
  }

  const derivedIdentity = deriveProfileIdentityFromAuthUser(user)
  const { data: existingProfile, error: profileError } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error('Unable to load profile for auth sync:', profileError)
    return null
  }

  if (!existingProfile) {
    const insertPayload: Record<string, any> = {
      id: user.id,
      role: defaultRole,
    }

    if (normalizeIdentityText(derivedIdentity.first_name)) {
      insertPayload.first_name = derivedIdentity.first_name
    }

    if (normalizeIdentityText(derivedIdentity.last_name)) {
      insertPayload.last_name = derivedIdentity.last_name
    }

    if (normalizeIdentityText(derivedIdentity.avatar_url)) {
      insertPayload.avatar_url = derivedIdentity.avatar_url
    }

    if (normalizeIdentityText(derivedIdentity.full_name)) {
      insertPayload.full_name = derivedIdentity.full_name
    }

    if (normalizeIdentityText(derivedIdentity.email)) {
      insertPayload.email = derivedIdentity.email
    }

    const { data: createdProfile, error: insertError } = await withSchemaColumnFallback({
      payload: insertPayload,
      requiredColumns: ['id', 'role'],
      execute: (currentPayload) =>
        supabase.from('profiles').insert([currentPayload]).select(PROFILE_SELECT).single(),
    })

    if (insertError) {
      if (insertError.code === '23505') {
        const { data: retryProfile, error: retryError } = await supabase
          .from('profiles')
          .select(PROFILE_SELECT)
          .eq('id', user.id)
          .maybeSingle()

        if (retryError) {
          console.error('Unable to recover duplicated profile after auth sync:', retryError)
          return null
        }

        return retryProfile || null
      }

      console.error('Failed to auto-create profile from auth user:', insertError)
      return null
    }

    return createdProfile || null
  }

  const updates: Record<string, any> = {}
  const shouldReplacePlaceholderName = isReplaceablePlaceholderName(
    existingProfile.first_name,
    existingProfile.last_name,
  )
  const derivedFullName = normalizeIdentityText(derivedIdentity.full_name)

  if (
    (shouldReplacePlaceholderName || !normalizeIdentityText(existingProfile.first_name)) &&
    normalizeIdentityText(derivedIdentity.first_name)
  ) {
    updates.first_name = derivedIdentity.first_name
  }

  if (
    (shouldReplacePlaceholderName || !normalizeIdentityText(existingProfile.last_name)) &&
    normalizeIdentityText(derivedIdentity.last_name)
  ) {
    updates.last_name = derivedIdentity.last_name
  }

  if (
    !normalizeIdentityText(existingProfile.avatar_url) &&
    normalizeIdentityText(derivedIdentity.avatar_url)
  ) {
    updates.avatar_url = derivedIdentity.avatar_url
  }

  if (
    (shouldReplacePlaceholderName || !normalizeIdentityText(existingProfile.full_name)) &&
    derivedFullName
  ) {
    updates.full_name = derivedIdentity.full_name
  }

  if (!normalizeIdentityText(existingProfile.email) && normalizeIdentityText(derivedIdentity.email)) {
    updates.email = derivedIdentity.email
  }

  if (Object.keys(updates).length === 0) {
    return existingProfile
  }

  const { data: updatedProfile, error: updateError } = await withSchemaColumnFallback({
    payload: updates,
    execute: (currentPayload) =>
      supabase
        .from('profiles')
        .update(currentPayload)
        .eq('id', user.id)
        .select(PROFILE_SELECT)
        .single(),
  })

  if (updateError) {
    console.error('Failed to backfill profile identity from auth user:', updateError)
    return existingProfile
  }

  return updatedProfile || { ...existingProfile, ...updates }
}
