type NullableText = string | null | undefined

type ProfileIdentity = {
  first_name?: NullableText
  last_name?: NullableText
  avatar_url?: NullableText
}

type ShopIdentity = {
  business_name?: NullableText
  logo_url?: NullableText
}

export type CounterpartyViewerRole = 'customer' | 'seller'

const normalizeText = (value?: NullableText) => value?.trim() || ''

export const buildAvatarFallback = (label: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(label || 'User')}&background=random`

export const getProfileDisplayName = (profile?: ProfileIdentity | null) =>
  [normalizeText(profile?.first_name), normalizeText(profile?.last_name)]
    .filter(Boolean)
    .join(' ')
    .trim()

export const getShopDisplayName = (shop?: ShopIdentity | null) =>
  normalizeText(shop?.business_name)

export const resolveConversationViewerRole = ({
  currentUserId,
  customerUserId,
  sellerUserId,
}: {
  currentUserId?: NullableText
  customerUserId?: NullableText
  sellerUserId?: NullableText
}): CounterpartyViewerRole | null => {
  if (currentUserId && customerUserId && currentUserId === customerUserId) {
    return 'customer'
  }

  if (currentUserId && sellerUserId && currentUserId === sellerUserId) {
    return 'seller'
  }

  return null
}

export const resolveCounterpartyIdentity = ({
  viewerRole,
  profile,
  shop,
}: {
  viewerRole: CounterpartyViewerRole | null
  profile?: ProfileIdentity | null
  shop?: ShopIdentity | null
}) => {
  const profileName = getProfileDisplayName(profile)
  const shopName = getShopDisplayName(shop)

  if (viewerRole === 'customer') {
    const displayName = shopName || 'Shop'
    return {
      displayName,
      avatar: shop.logo_url || buildAvatarFallback(displayName),
      customerFacingShopIdentity: true,
    }
  }

  if (viewerRole === 'seller') {
    const displayName = profileName || 'User'

    return {
      displayName,
      avatar: profile?.avatar_url || buildAvatarFallback(displayName),
      customerFacingShopIdentity: false,
    }
  }

  return {
    displayName: 'Conversation',
    avatar: buildAvatarFallback('Conversation'),
    customerFacingShopIdentity: false,
  }
}
