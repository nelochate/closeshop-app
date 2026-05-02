type NullableText = string | null | undefined

type AuthIdentityLike = {
  identity_data?: Record<string, any> | null
}

type AuthUserLike = {
  email?: NullableText
  user_metadata?: Record<string, any> | null
  raw_user_meta_data?: Record<string, any> | null
  identities?: AuthIdentityLike[] | null
}

type ProfileIdentityLike = {
  first_name?: NullableText
  last_name?: NullableText
  full_name?: NullableText
  name?: NullableText
  display_name?: NullableText
}

export const normalizeIdentityText = (value?: NullableText) => value?.trim() || ''

const pickFirstText = (...values: NullableText[]) => {
  for (const value of values) {
    const normalized = normalizeIdentityText(value)
    if (normalized) {
      return normalized
    }
  }

  return ''
}

const splitDisplayName = (value?: NullableText) => {
  const normalized = normalizeIdentityText(value)

  if (!normalized) {
    return {
      firstName: '',
      lastName: '',
    }
  }

  const parts = normalized.split(/\s+/)

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: '',
    }
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

const getAuthMetadataCandidates = (user?: AuthUserLike | null) => {
  const metadata = [user?.user_metadata, user?.raw_user_meta_data].filter(Boolean)
  const identityMetadata = (user?.identities || [])
    .map((identity) => identity?.identity_data)
    .filter(Boolean)

  return [...metadata, ...identityMetadata] as Array<Record<string, any>>
}

export const buildAvatarFallback = (label: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(label || 'Account')}&background=random`

export const getProfileDisplayName = (profile?: ProfileIdentityLike | null) => {
  const preferredName = pickFirstText(
    profile?.full_name,
    profile?.name,
    profile?.display_name,
  )

  if (preferredName) {
    return preferredName
  }

  return [normalizeIdentityText(profile?.first_name), normalizeIdentityText(profile?.last_name)]
    .filter(Boolean)
    .join(' ')
    .trim()
}

export const getAuthUserDisplayName = (user?: AuthUserLike | null) => {
  const metadataCandidates = getAuthMetadataCandidates(user)

  for (const metadata of metadataCandidates) {
    const preferredName = pickFirstText(
      metadata?.full_name,
      metadata?.name,
      metadata?.display_name,
    )

    if (preferredName) {
      return preferredName
    }

    const firstName = pickFirstText(metadata?.first_name, metadata?.given_name)
    const lastName = pickFirstText(metadata?.last_name, metadata?.family_name)

    if (firstName || lastName) {
      return [firstName, lastName].filter(Boolean).join(' ').trim()
    }
  }

  return ''
}

export const getAuthUserAvatarUrl = (user?: AuthUserLike | null) => {
  const metadataCandidates = getAuthMetadataCandidates(user)

  for (const metadata of metadataCandidates) {
    const avatarUrl = pickFirstText(metadata?.avatar_url, metadata?.picture)

    if (avatarUrl) {
      return avatarUrl
    }
  }

  return ''
}

export const deriveProfileIdentityFromAuthUser = (user?: AuthUserLike | null) => {
  const metadataCandidates = getAuthMetadataCandidates(user)
  const preferredName = getAuthUserDisplayName(user)
  const splitName = splitDisplayName(preferredName)

  let firstName = splitName.firstName
  let lastName = splitName.lastName

  if (!firstName && !lastName) {
    for (const metadata of metadataCandidates) {
      firstName = pickFirstText(metadata?.first_name, metadata?.given_name)
      lastName = pickFirstText(metadata?.last_name, metadata?.family_name)

      if (firstName || lastName) {
        break
      }
    }
  }

  const avatarUrl = getAuthUserAvatarUrl(user)

  return {
    first_name: firstName || null,
    last_name: lastName || null,
    avatar_url: avatarUrl || null,
  }
}
