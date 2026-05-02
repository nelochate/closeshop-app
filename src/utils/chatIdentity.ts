import {
  buildAvatarFallback,
  getProfileDisplayName,
  normalizeIdentityText,
} from '@/utils/accountIdentity'

export { getProfileDisplayName }

type NullableText = string | null | undefined

type ProfileIdentity = {
  first_name?: NullableText
  last_name?: NullableText
  full_name?: NullableText
  name?: NullableText
  display_name?: NullableText
  avatar_url?: NullableText
}

type ShopIdentity = {
  id?: NullableText
  owner_id?: NullableText
  business_name?: NullableText
  logo_url?: NullableText
}

type ConversationIdentityMessage = {
  content?: NullableText
  product_shop_id?: NullableText
  product?: {
    shop_id?: NullableText
    shop?: {
      id?: NullableText
      owner_id?: NullableText
      business_name?: NullableText
    } | null
  } | null
  orderProduct?: {
    shop_id?: NullableText
    shop?: {
      id?: NullableText
      owner_id?: NullableText
      business_name?: NullableText
    } | null
  } | null
}

export type CounterpartyViewerRole = 'customer' | 'seller'

export const getShopDisplayName = (shop?: ShopIdentity | null) =>
  normalizeIdentityText(shop?.business_name)

const normalizeLookupValue = (value?: NullableText) => normalizeIdentityText(value).toLowerCase()

const extractOrderMessageShopName = (content?: NullableText) => {
  const normalizedContent = normalizeIdentityText(content)

  if (!normalizedContent) {
    return ''
  }

  const matchingLine = normalizedContent
    .split('\n')
    .map((line: string) => line.trim())
    .find((line: string) => line.toLowerCase().startsWith('shop:'))

  return matchingLine ? normalizeIdentityText(matchingLine.slice(5)) : ''
}

const doesMessageReferenceShop = (
  message?: ConversationIdentityMessage | null,
  shop?: ShopIdentity | null,
) => {
  if (!message || !shop) {
    return false
  }

  const shopId = normalizeLookupValue(shop.id)
  const shopName = normalizeLookupValue(shop.business_name)

  const relatedShopIds = [
    message.product_shop_id,
    message.product?.shop_id,
    message.product?.shop?.id,
    message.orderProduct?.shop_id,
    message.orderProduct?.shop?.id,
  ]
    .map((value) => normalizeLookupValue(value))
    .filter(Boolean)

  if (shopId && relatedShopIds.includes(shopId)) {
    return true
  }

  const relatedShopNames = [
    message.product?.shop?.business_name,
    message.orderProduct?.shop?.business_name,
    extractOrderMessageShopName(message.content),
  ]
    .map((value) => normalizeLookupValue(value))
    .filter(Boolean)

  return !!shopName && relatedShopNames.includes(shopName)
}

const resolveReferencedShopOwnerId = ({
  currentUserId,
  otherUserId,
  currentUserShop,
  otherUserShop,
  messages,
}: {
  currentUserId?: NullableText
  otherUserId?: NullableText
  currentUserShop?: ShopIdentity | null
  otherUserShop?: ShopIdentity | null
  messages?: ConversationIdentityMessage[] | null
}) => {
  if (!Array.isArray(messages) || messages.length === 0) {
    return null
  }

  const referencesCurrentShop = messages.some((message) =>
    doesMessageReferenceShop(message, currentUserShop),
  )
  const referencesOtherShop = messages.some((message) =>
    doesMessageReferenceShop(message, otherUserShop),
  )

  if (referencesOtherShop && !referencesCurrentShop) {
    return otherUserId || null
  }

  if (referencesCurrentShop && !referencesOtherShop) {
    return currentUserId || null
  }

  return null
}

export const resolveConversationViewerRole = ({
  currentUserId,
  otherUserId,
  customerUserId,
  sellerUserId,
  currentUserShop,
  otherUserShop,
  messages,
}: {
  currentUserId?: NullableText
  otherUserId?: NullableText
  customerUserId?: NullableText
  sellerUserId?: NullableText
  currentUserShop?: ShopIdentity | null
  otherUserShop?: ShopIdentity | null
  messages?: ConversationIdentityMessage[] | null
}): CounterpartyViewerRole | null => {
  const hasShopContext =
    typeof currentUserShop !== 'undefined' ||
    typeof otherUserShop !== 'undefined' ||
    typeof messages !== 'undefined' ||
    !!otherUserId

  if (!hasShopContext) {
    if (currentUserId && customerUserId && currentUserId === customerUserId) {
      return 'customer'
    }

    if (currentUserId && sellerUserId && currentUserId === sellerUserId) {
      return 'seller'
    }

    return null
  }

  const currentUserOwnsShop = Boolean(
    normalizeIdentityText(currentUserShop?.owner_id || currentUserShop?.business_name),
  )
  const otherUserOwnsShop = Boolean(
    normalizeIdentityText(otherUserShop?.owner_id || otherUserShop?.business_name),
  )

  if (otherUserOwnsShop && !currentUserOwnsShop) {
    return 'customer'
  }

  if (currentUserOwnsShop && !otherUserOwnsShop) {
    return 'seller'
  }

  const referencedShopOwnerId = resolveReferencedShopOwnerId({
    currentUserId,
    otherUserId,
    currentUserShop,
    otherUserShop,
    messages,
  })

  if (otherUserId && referencedShopOwnerId === otherUserId) {
    return 'customer'
  }

  if (currentUserId && referencedShopOwnerId === currentUserId) {
    return 'seller'
  }

  if (otherUserOwnsShop && currentUserId && otherUserId) {
    if (currentUserId === customerUserId && otherUserId === sellerUserId) {
      return 'customer'
    }

    if (currentUserId === sellerUserId && otherUserId === customerUserId) {
      return 'seller'
    }
  }

  if (currentUserId && customerUserId && currentUserId === customerUserId) {
    return 'customer'
  }

  if (currentUserId && sellerUserId && currentUserId === sellerUserId) {
    return 'seller'
  }

  return 'seller'
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
  const fallbackLabel = 'Chat contact'

  if (viewerRole === 'customer') {
    const displayName = shopName || profileName || fallbackLabel
    return {
      displayName,
      avatar: shop?.logo_url || profile?.avatar_url || buildAvatarFallback(displayName),
      customerFacingShopIdentity: Boolean(shopName || shop?.logo_url),
    }
  }

  const displayName = profileName || fallbackLabel

  return {
    displayName,
    avatar: profile?.avatar_url || buildAvatarFallback(displayName),
    customerFacingShopIdentity: false,
  }
}
