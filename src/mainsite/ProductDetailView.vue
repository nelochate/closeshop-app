<script setup>
import { ref, onMounted, computed, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { useCartStore } from '@/stores/cart'
import {
  buildAvatarFallback,
  getProfileDisplayName,
  normalizeIdentityText,
} from '@/utils/accountIdentity'

const route = useRoute()
const router = useRouter()
const productId = computed(() => route.params.id)
const cart = useCartStore()

// State management
const product = ref(null)
const loading = ref(true)
const error = ref(null)
const cartCount = computed(() => cart.count)
const isAnimating = ref(false)
const addingToCart = ref(false)

// Dialog states
const showAddToCartDialog = ref(false)
const showBuyNowDialog = ref(false)
const showVarieties = ref(false)
const selectedSize = ref(null)
const selectedVariety = ref(null)

// DOM refs
const productImgRef = ref(null)
const cartIconRef = ref(null)

// Dialog selections
const dialogSelectedSize = ref(null)
const dialogSelectedVariety = ref(null)
const dialogQuantity = ref(1)

// Buy now dialog selections
const buyNowSelectedSize = ref(null)
const buyNowSelectedVariety = ref(null)
const buyNowQuantity = ref(1)

// Review states
const reviews = ref([])
const reviewsLoading = ref(false)
const reviewError = ref('')
const selectedReviewRating = ref(null)

// Snackbar for notifications
const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref('success')

// User
const user = ref(null)
let reviewsSubscription = null
let reviewsRefreshTimeoutId = null

// Real-time subscription
let productSubscription = null

// Fetch user
const fetchUser = async () => {
  try {
    const { data } = await supabase.auth.getUser()
    user.value = data?.user
  } catch (err) {
    console.error('Error fetching user:', err)
  }
}

// Get the main image
const mainImage = (imgs) => {
  if (!imgs) return '/placeholder.png'
  if (Array.isArray(imgs)) return imgs[0] || '/placeholder.png'
  try {
    const parsed = JSON.parse(imgs)
    if (Array.isArray(parsed)) return parsed[0] || '/placeholder.png'
  } catch {
    // ignore JSON parse errors
  }
  return imgs
}

const normalizeImageList = (imgs) => {
  if (Array.isArray(imgs)) {
    return imgs.filter(Boolean)
  }

  if (typeof imgs === 'string') {
    try {
      const parsed = JSON.parse(imgs)
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean)
      }
    } catch {
      return imgs ? [imgs] : []
    }
  }

  return []
}

const normalizeVarietiesList = (varieties) => {
  if (Array.isArray(varieties)) {
    return varieties
  }

  if (typeof varieties === 'string') {
    try {
      const parsed = JSON.parse(varieties)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return []
}

const formatCurrency = (value = 0) =>
  `PHP ${Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const getAvailabilityLabel = (stock = 0) => {
  const stockCount = Number(stock || 0)

  if (stockCount <= 0) return 'Out of stock'
  if (stockCount < 5) return `Only ${stockCount} left`
  return `${stockCount} available`
}

const productImageList = computed(() => {
  const images = normalizeImageList(product.value?.main_img_urls)
  return images.length ? images : ['/placeholder.png']
})

// Show snackbar notification
const showSnackbar = (message, color = 'success') => {
  snackbarMessage.value = message
  snackbarColor.value = color
  snackbar.value = true
}

// Setup real-time product updates
const cleanupProductRealtimeSubscription = () => {
  if (!productSubscription) {
    return
  }

  supabase.removeChannel(productSubscription)
  productSubscription = null
}

const setupProductRealtimeSubscription = () => {
  if (!productId.value) {
    cleanupProductRealtimeSubscription()
    return
  }

  cleanupProductRealtimeSubscription()

  productSubscription = supabase
    .channel(`product-${productId.value}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'products',
        filter: `id=eq.${productId.value}`,
      },
      (payload) => {
        console.log('🔄 Product updated in real-time:', payload)
        const updatedProduct = payload.new
        const updatedVarieties = normalizeVarietiesList(updatedProduct?.varieties)

        if (product.value) {
          const prevStock = Number(product.value.stock || 0)
          const prevSold = Number(product.value.sold || 0)

          product.value = {
            ...product.value,
            stock: Number(updatedProduct?.stock || 0),
            sold: Number(updatedProduct?.sold || 0),
            varieties: updatedVarieties.length ? updatedVarieties : product.value.varieties,
          }

          if (Number(updatedProduct?.stock || 0) === 0 && prevStock > 0) {
            showSnackbar('This product is now out of stock!', 'warning')
          } else if (Number(updatedProduct?.stock || 0) > 0 && prevStock === 0) {
            showSnackbar('This product is back in stock!', 'success')
          }

          if (Number(updatedProduct?.sold || 0) > prevSold) {
            const soldIncrease = Number(updatedProduct.sold || 0) - prevSold
            showSnackbar(`🔥 ${soldIncrease} item${soldIncrease > 1 ? 's' : ''} just sold!`, 'info')
          }
        }
      },
    )
    .subscribe()

  console.log('📡 Subscribed to real-time product updates for product:', productId)
}

const normalizeReviewPhotos = (photos) => {
  if (Array.isArray(photos)) {
    return photos.filter((photo) => normalizeIdentityText(photo))
  }

  if (typeof photos === 'string') {
    try {
      const parsed = JSON.parse(photos)
      if (Array.isArray(parsed)) {
        return parsed.filter((photo) => normalizeIdentityText(photo))
      }
    } catch {
      return normalizeIdentityText(photos) ? [photos] : []
    }
  }

  return []
}

const mapReviewsWithProfiles = async (reviewRows = []) => {
  const reviewerIds = [...new Set(reviewRows.map((review) => review.user_id).filter(Boolean))]
  let profilesById = new Map()

  if (reviewerIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, full_name, avatar_url')
      .in('id', reviewerIds)

    if (profileError) {
      console.warn('Could not load product reviewer profiles:', profileError)
    } else {
      profilesById = new Map((profileRows || []).map((profile) => [profile.id, profile]))
    }
  }

  return reviewRows.map((review) => {
    const reviewerProfile = review.user_id ? profilesById.get(review.user_id) : null
    const reviewerName =
      getProfileDisplayName(reviewerProfile) || normalizeIdentityText(review.user_name) || 'Customer'
    const reviewerAvatar =
      normalizeIdentityText(reviewerProfile?.avatar_url) ||
      normalizeIdentityText(review.user_avatar) ||
      buildAvatarFallback(reviewerName)

    return {
      ...review,
      rating: Number(review.rating || 0),
      likes: Number(review.likes || 0),
      photos: normalizeReviewPhotos(review.photos),
      reviewer_name: reviewerName,
      reviewer_avatar: reviewerAvatar,
    }
  })
}

const fetchProductReviews = async ({ silent = false } = {}) => {
  if (!productId.value) {
    reviews.value = []
    return
  }

  if (!silent) {
    reviewsLoading.value = true
  }

  reviewError.value = ''

  try {
    const { data, error: reviewsError } = await supabase
      .from('reviews')
      .select('*')
      .eq('product_id', productId.value)
      .order('created_at', { ascending: false })

    if (reviewsError) throw reviewsError

    reviews.value = await mapReviewsWithProfiles(data || [])
  } catch (err) {
    console.error('Error loading product reviews:', err)
    reviewError.value = err?.message || 'Failed to load reviews.'
  } finally {
    if (!silent) {
      reviewsLoading.value = false
    }
  }
}

const scheduleReviewsRefresh = () => {
  if (reviewsRefreshTimeoutId) {
    window.clearTimeout(reviewsRefreshTimeoutId)
  }

  reviewsRefreshTimeoutId = window.setTimeout(() => {
    void fetchProductReviews({ silent: true })
  }, 180)
}

const cleanupReviewsSubscription = () => {
  if (reviewsRefreshTimeoutId) {
    window.clearTimeout(reviewsRefreshTimeoutId)
    reviewsRefreshTimeoutId = null
  }

  if (reviewsSubscription) {
    supabase.removeChannel(reviewsSubscription)
    reviewsSubscription = null
  }
}

const subscribeToProductReviews = () => {
  if (!productId.value) {
    return
  }

  cleanupReviewsSubscription()

  reviewsSubscription = supabase
    .channel(`product-reviews:${productId.value}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'reviews',
        filter: `product_id=eq.${productId.value}`,
      },
      () => {
        scheduleReviewsRefresh()
      },
    )
    .subscribe()
}

// Fetch product
const fetchProduct = async () => {
  loading.value = true
  try {
    const { data, error: err } = await supabase
      .from('products')
      .select(
        `
        id,
        prod_name,
        prod_description,
        price,
        main_img_urls,
        sold,
        stock,
        sizes,
        varieties,
        has_sizes,
        has_varieties,
        shop:shops!products_shop_id_fkey(
          id,
          business_name,
          logo_url,
          owner_id
        )
      `,
      )
      .eq('id', productId.value)
      .single()

    if (err) throw err
    product.value = data

    product.value.main_img_urls = productImageList.value
    product.value.sizes = Array.isArray(product.value.sizes) ? product.value.sizes : []
    product.value.varieties = normalizeVarietiesList(product.value.varieties)

    if (product.value?.sizes?.length === 1) {
      selectedSize.value = product.value.sizes[0]
      dialogSelectedSize.value = product.value.sizes[0]
      buyNowSelectedSize.value = product.value.sizes[0]
    }

    setupProductRealtimeSubscription()
  } catch (e) {
    error.value = e.message || 'Failed to load product'
    console.error('Error loading product:', e)
  } finally {
    loading.value = false
  }
}

// Computed properties
const displayPrice = computed(() => {
  if (!product.value) return 0
  if (selectedVariety.value && selectedVariety.value.price !== undefined) {
    return selectedVariety.value.price
  }
  return product.value.price
})

const displayStock = computed(() => {
  if (!product.value) return 0
  return product.value.stock || 0
})

const soldCountLabel = computed(() => `${Number(product.value?.sold || 0)} sold`)

const stockBadgeLabel = computed(() => {
  if (displayStock.value <= 0) return 'Out of stock'
  if (displayStock.value < 5) return 'Low stock'
  return 'Ready to ship'
})

const stockBadgeClass = computed(() => {
  if (displayStock.value <= 0) return 'stock-badge--empty'
  if (displayStock.value < 5) return 'stock-badge--low'
  return 'stock-badge--ready'
})

const selectionSummaryText = computed(() => {
  const parts = [selectedVariety.value?.name || 'Standard Product']

  if (selectedSize.value) {
    parts.push(selectedSize.value)
  }

  return parts.join(' • ')
})

const selectionSummaryLabel = computed(() => {
  return selectionSummaryText.value.replace(/ [^A-Za-z0-9/]+ /, ' / ')
})

const stockSummaryText = computed(() => getAvailabilityLabel(displayStock.value))

const dialogDisplayStock = computed(() => {
  if (!product.value) return 0
  return product.value.stock || 0
})

const buyNowDisplayStock = computed(() => {
  if (!product.value) return 0
  return product.value.stock || 0
})

const isMainProductSelected = computed(() => {
  return !selectedVariety.value
})

const isActionDisabled = computed(() => {
  if (!product.value) return true
  if (displayStock.value === 0) return true
  if (product.value.has_sizes && !selectedSize.value) return true
  return false
})

const isOwner = computed(() => {
  if (!user.value || !product.value?.shop?.owner_id) return false
  return user.value.id === product.value.shop.owner_id
})

const reviewCount = computed(() => reviews.value.length)

const averageRating = computed(() => {
  if (!reviews.value.length) return 0

  const totalRating = reviews.value.reduce((sum, review) => sum + Number(review.rating || 0), 0)
  return Math.round((totalRating / reviews.value.length) * 10) / 10
})

const reviewSummaryLabel = computed(() => {
  if (!reviewCount.value) {
    return 'No reviews yet'
  }

  if (reviewCount.value === 1) {
    return '1 review'
  }

  return `${reviewCount.value} reviews`
})

const getReviewRatingBucket = (rating = 0) => {
  const normalizedRating = Math.round(Number(rating || 0))
  return Math.min(Math.max(normalizedRating, 1), 5)
}

const reviewRatingOptions = computed(() => [
  {
    label: 'All',
    value: null,
    count: reviews.value.length,
  },
  ...[5, 4, 3, 2, 1].map((rating) => ({
    label: `${rating}`,
    value: rating,
    count: reviews.value.filter((review) => getReviewRatingBucket(review.rating) === rating).length,
  })),
])

const filteredReviews = computed(() => {
  if (!selectedReviewRating.value) {
    return reviews.value
  }

  return reviews.value.filter(
    (review) => getReviewRatingBucket(review.rating) === selectedReviewRating.value,
  )
})

const filteredReviewsEmptyText = computed(() => {
  if (!selectedReviewRating.value) {
    return 'Reviews for this product will appear here as soon as customers submit them.'
  }

  return `No ${selectedReviewRating.value}-star reviews for this product yet.`
})

const formatReviewDate = (dateString) => {
  if (!dateString) return ''

  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const isVarietySelected = (variety) => {
  return selectedVariety.value && selectedVariety.value.name === variety.name
}

const getVarietyImage = (variety) => {
  if (variety.images && variety.images.length) {
    return variety.images[0]
  }
  if (variety.main_img_urls && variety.main_img_urls.length) {
    return Array.isArray(variety.main_img_urls) ? variety.main_img_urls[0] : variety.main_img_urls
  }
  return mainImage(product.value?.main_img_urls)
}

const goToCart = () => {
  router.push('/cartview')
}

const goToShop = (shopId) => {
  router.push(`/shop/${shopId}`)
}

const goToChat = async () => {
  if (!user.value) {
    showSnackbar('Please login to chat with the seller', 'warning')
    return
  }

  if (!product.value?.shop?.owner_id) {
    showSnackbar('Unable to start chat', 'error')
    return
  }

  // Prepare product information
  const productInfo = {
    id: product.value.id,
    name: product.value.prod_name,
    price: product.value.price,
    image: mainImage(product.value.main_img_urls),
    description: product.value.prod_description,
    selectedVariety: selectedVariety.value,
    selectedSize: selectedSize.value,
    shop_id: product.value.shop.id,
    shop_name: product.value.shop.business_name
  }

  // Create a natural question about the product
  let questionText = `Hi! I have a question about ${product.value.prod_name}`

  if (selectedVariety.value) {
    questionText += ` (${selectedVariety.value.name} variety)`
  }

  if (selectedSize.value) {
    questionText += ` - Size: ${selectedSize.value}`
  }

  questionText += `. Can you tell me more about it?`

  // Store in sessionStorage
  sessionStorage.setItem('sharedProduct', JSON.stringify(productInfo))
  sessionStorage.setItem('chatAutoMessage', questionText)

  // Navigate to chat with the shop owner
  router.push(`/chatview/${product.value.shop.owner_id}`)

  showSnackbar('Opening chat with your product question...', 'info')
}

const selectMainProduct = () => {
  selectedVariety.value = null
  showVarieties.value = false
}

const selectVariety = (variety) => {
  selectedVariety.value = variety
  showVarieties.value = false
}

const incrementQuantity = () => {
  if (dialogQuantity.value < dialogDisplayStock.value) {
    dialogQuantity.value++
  }
}

const decrementQuantity = () => {
  if (dialogQuantity.value > 1) {
    dialogQuantity.value--
  }
}

const incrementBuyNowQuantity = () => {
  if (buyNowQuantity.value < buyNowDisplayStock.value) {
    buyNowQuantity.value++
  }
}

const decrementBuyNowQuantity = () => {
  if (buyNowQuantity.value > 1) {
    buyNowQuantity.value--
  }
}

const openAddToCartDialog = () => {
  if (!product.value) {
    showSnackbar('Product not loaded', 'error')
    return
  }

  if (!user.value) {
    showSnackbar('Please login to add items to cart', 'warning')
    return
  }

  dialogSelectedSize.value = selectedSize.value
  dialogSelectedVariety.value = selectedVariety.value
  dialogQuantity.value = 1

  showAddToCartDialog.value = true
}

const closeAddToCartDialog = () => {
  showAddToCartDialog.value = false
  dialogQuantity.value = 1
}

const openBuyNowDialog = () => {
  if (!product.value) {
    showSnackbar('Product not loaded', 'error')
    return
  }

  if (!user.value) {
    showSnackbar('Please login to buy products', 'warning')
    return
  }

  if (product.value.varieties && product.value.varieties.length > 0) {
    buyNowSelectedSize.value = selectedSize.value
    buyNowSelectedVariety.value = selectedVariety.value
    buyNowQuantity.value = 1
    showBuyNowDialog.value = true
  } else {
    proceedToCheckout()
  }
}

const closeBuyNowDialog = () => {
  showBuyNowDialog.value = false
  buyNowQuantity.value = 1
}

const confirmAddToCart = async () => {
  console.log('🛒 Adding to cart...')

  if (!product.value) {
    showSnackbar('Product not loaded', 'error')
    return
  }

  if (!user.value) {
    showSnackbar('Please login to add items to cart', 'warning')
    return
  }

  const finalSize = dialogSelectedSize.value
  const finalVariety = dialogSelectedVariety.value
  const finalQuantity = dialogQuantity.value

  if (product.value.has_sizes && !finalSize) {
    showSnackbar('Please select a size', 'warning')
    return
  }

  const availableStock = dialogDisplayStock.value
  if (finalQuantity > availableStock) {
    showSnackbar(`Only ${availableStock} items available in stock`, 'warning')
    return
  }

  addingToCart.value = true

  try {
    const varietyData = finalVariety
        ? {
            name: finalVariety.name,
            price: finalVariety.price,
            stock: product.value.stock,
            images: finalVariety.images || [],
          }
        : null

    const result = await cart.addToCart(
      product.value.id,
      finalQuantity,
      finalSize,
      finalVariety ? finalVariety.name : null,
      varietyData,
    )

    if (!result.success) {
      throw new Error(result.error || 'Failed to add item to cart')
    }

    showSnackbar('Product added to cart successfully!', 'success')
    animateToCart()
    closeAddToCartDialog()

  } catch (err) {
    console.error('❌ Error adding to cart:', err)
    showSnackbar('Failed to add to cart. Please try again.', 'error')
  } finally {
    addingToCart.value = false
  }
}

const proceedToCheckout = () => {
  if (!product.value) {
    showSnackbar('Product not loaded', 'error')
    return
  }

  const finalSize = buyNowSelectedSize.value
  const finalVariety = buyNowSelectedVariety.value
  const finalQuantity = buyNowQuantity.value

  if (product.value.has_sizes && !finalSize) {
    showSnackbar('Please select a size', 'warning')
    return
  }

  const availableStock = buyNowDisplayStock.value
  if (finalQuantity > availableStock) {
    showSnackbar(`Only ${availableStock} items available in stock`, 'warning')
    return
  }

  let itemName = product.value.prod_name
  if (finalVariety) {
    itemName = `${product.value.prod_name} - ${finalVariety.name}`
  }

  const item = {
    id: product.value.id,
    product_id: product.value.id,
    name: itemName,
    price: finalVariety?.price || product.value.price,
    quantity: finalQuantity,
    size: finalSize,
    variety: finalVariety ? finalVariety.name : null,
    varietyData: finalVariety,
    image: mainImage(product.value.main_img_urls),
    shop_id: product.value.shop?.id,
  }

  router.push({
    name: 'purchaseview',
    query: {
      productId: product.value.id,
      fromProduct: 'true',
      variety: finalVariety ? finalVariety.name : null,
      size: finalSize,
      quantity: buyNowQuantity.value,
    },
    state: {
      items: [item],
      shopId: product.value.shop.id,
      fromCart: false,
      directProduct: true,
    },
  })
}

const animateToCart = () => {
  if (isAnimating.value) return
  isAnimating.value = true

  const productImg = productImgRef.value?.$el || productImgRef.value
  const cartIcon = cartIconRef.value?.$el || cartIconRef.value

  if (!productImg || !cartIcon) {
    console.log('❌ Animation elements not found')
    isAnimating.value = false
    return
  }

  const productRect = productImg.getBoundingClientRect()
  const cartRect = cartIcon.getBoundingClientRect()

  const clone = productImg.cloneNode(true)
  clone.style.position = 'fixed'
  clone.style.left = `${productRect.left}px`
  clone.style.top = `${productRect.top}px`
  clone.style.width = `${productRect.width}px`
  clone.style.height = `${productRect.height}px`
  clone.style.zIndex = '10000'
  clone.style.borderRadius = '8px'
  clone.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)'
  clone.style.transition = 'all 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55)'
  clone.style.pointerEvents = 'none'
  clone.style.opacity = '1'
  clone.style.transform = 'scale(1)'

  document.body.appendChild(clone)

  void clone.offsetWidth

  const finalLeft = cartRect.left + cartRect.width / 2 - 15
  const finalTop = cartRect.top + cartRect.height / 2 - 15

  clone.style.left = `${finalLeft}px`
  clone.style.top = `${finalTop}px`
  clone.style.width = '30px'
  clone.style.height = '30px'
  clone.style.opacity = '0.5'
  clone.style.transform = 'scale(0.8) rotate(360deg)'

  cartIcon.style.transform = 'scale(1.2)'
  cartIcon.style.transition = 'transform 0.3s ease'

  setTimeout(() => {
    clone.remove()
    cartIcon.style.transform = 'scale(1)'

    setTimeout(() => {
      cartIcon.style.transform = 'scale(1.1)'
      setTimeout(() => {
        cartIcon.style.transform = 'scale(1)'
        isAnimating.value = false
      }, 150)
    }, 50)
  }, 800)
}

const shareProduct = async () => {
  if (navigator.share) {
    try {
      await navigator.share({
        title: product.value.prod_name,
        text: product.value.prod_description,
        url: window.location.href,
      })
    } catch (err) {
      console.log('Error sharing:', err)
    }
  } else {
    navigator.clipboard.writeText(window.location.href)
    showSnackbar('Product link copied to clipboard!', 'info')
  }
}

const loadProductPage = async () => {
  await Promise.all([fetchProduct(), fetchProductReviews()])
  subscribeToProductReviews()
}

const cleanup = () => {
  if (productSubscription) {
    productSubscription.unsubscribe()
    console.log('📡 Unsubscribed from product updates')
  }
}

onMounted(async () => {
  await cart.initialize()
  await Promise.all([fetchUser(), loadProductPage()])
})

watch(
  () => route.params.id,
  async (newProductId, oldProductId) => {
    if (!newProductId || newProductId === oldProductId) {
      return
    }

    cleanupProductRealtimeSubscription()
    cleanupReviewsSubscription()
    selectedSize.value = null
    selectedVariety.value = null
    showVarieties.value = false
    dialogSelectedSize.value = null
    dialogSelectedVariety.value = null
    buyNowSelectedSize.value = null
    buyNowSelectedVariety.value = null
    dialogQuantity.value = 1
    buyNowQuantity.value = 1
    reviewError.value = ''

    await loadProductPage()
  },
)

onUnmounted(() => {
  cleanupReviewsSubscription()
  cleanupProductRealtimeSubscription()
})
</script>

<template>
  <v-app>
    <!-- Snackbar for notifications -->
    <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="3000" location="top">
      {{ snackbarMessage }}
      <template v-slot:actions>
        <v-btn variant="text" @click="snackbar = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </template>
    </v-snackbar>

    <!-- Top Nav -->
    <v-app-bar class="app-bar" flat color="#3f83c7" dark density="comfortable">
      <v-btn icon @click="$router.back()">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="top-text"><strong>Product Details</strong></v-toolbar-title>
      <v-spacer />
      <v-btn icon ref="cartIconRef" @click="goToCart" :disabled="isAnimating">
        <v-badge
          v-if="cartCount > 0"
          :content="cartCount"
          color="red"
          offset-x="-7"
          offset-y="-3"
        >
          <v-icon size="28">mdi-cart-outline</v-icon>
        </v-badge>
        <template v-else>
          <v-icon size="28">mdi-cart-outline</v-icon>
        </template>
      </v-btn>

      <v-btn icon @click="shareProduct">
        <v-icon>mdi-share-variant-outline</v-icon>
      </v-btn>
    </v-app-bar>

    <v-main class="product-page">
      <!-- Loading -->
      <v-skeleton-loader v-if="loading" type="image, text, text, text" class="mb-6" />

      <!-- Error -->
      <v-alert v-else-if="error" type="error" variant="tonal" class="mb-6 mx-4">
        {{ error }}
      </v-alert>

      <!-- Product Details -->
      <v-sheet v-else class="product-sheet pa-4">
        <!-- Product Images -->
        <div class="product-images mb-4">
          <v-carousel
            v-if="product.main_img_urls && product.main_img_urls.length > 1"
            hide-delimiter-background
            height="300"
          >
            <v-carousel-item v-for="(img, index) in product.main_img_urls" :key="index">
              <v-img
                :src="img"
                height="300"
                class="rounded-lg"
                style="cursor: zoom-in"
                @click="previewIndex = index; openImageDialog = true"
              />
            </v-carousel-item>
          </v-carousel>

          <!-- Fallback: Single Image -->
          <v-img
            v-else
            ref="productImgRef"
            :src="mainImage(product.main_img_urls)"
            class="product-img mb-4"
            contain
            style="cursor: zoom-in"
            @click="openImageDialog = true"
          />
        </div>

        <!-- Image Preview Modal -->
        <v-dialog v-model="openImageDialog" max-width="800px">
          <v-card>
            <v-card-actions class="d-flex justify-end pa-2">
              <v-btn icon @click="openImageDialog = false">
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </v-card-actions>
            <v-card-text class="text-center pa-0">
              <v-img
                :src="product.main_img_urls[previewIndex]"
                max-height="600"
                contain
                class="rounded-b"
              />
            </v-card-text>
          </v-card>
        </v-dialog>

        <v-dialog
          v-model="openReviewImageDialog"
          max-width="800px"
          @click:outside="closeReviewImagePreview"
        >
          <v-card>
            <v-card-actions class="d-flex justify-end pa-2">
              <v-btn icon @click="closeReviewImagePreview">
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </v-card-actions>
            <v-card-text class="text-center pa-0">
              <v-img :src="currentImage" max-height="600" contain class="rounded-b" />
            </v-card-text>
          </v-card>
        </v-dialog>

        <!-- Add to Cart Dialog -->
        <v-dialog v-model="showAddToCartDialog" max-width="500px">
          <v-card class="pa-4">
            <v-card-title class="d-flex justify-space-between align-center">
              <h3>Add to Cart</h3>
              <v-btn icon @click="closeAddToCartDialog">
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </v-card-title>

            <v-card-text>
              <div class="mb-4 d-flex align-center">
                <v-avatar size="80" class="mr-3">
                  <v-img :src="mainImage(product.main_img_urls)" />
                </v-avatar>
                <div>
                  <h4 class="mb-1">{{ product.prod_name }}</h4>
                  <div class="text-primary font-weight-bold">
                    {{ formatCurrency(dialogSelectedVariety?.price || product.price) }}
                  </div>
                  <div class="text-caption text-grey">
                    Stock: {{ dialogDisplayStock }} available
                  </div>
                </div>
              </div>

              <div v-if="product.sizes && product.sizes.length" class="mb-4">
                <p class="font-weight-medium mb-2">Select Size:</p>
                <v-btn-toggle
                  v-model="dialogSelectedSize"
                  mandatory
                  class="flex-wrap"
                  style="gap: 6px"
                >
                  <v-btn
                    v-for="size in product.sizes"
                    :key="size"
                    :value="size"
                    variant="outlined"
                    class="ma-1 rounded-pill text-capitalize"
                    color="primary"
                    size="small"
                  >
                    {{ size }}
                  </v-btn>
                </v-btn-toggle>
              </div>

              <div v-if="product.varieties && product.varieties.length" class="mb-4">
                <p class="font-weight-medium mb-2">Select Variety:</p>
                <div class="varieties-list">
                  <v-card
                    class="mb-2"
                    :class="{ 'option-selected': !dialogSelectedVariety }"
                    @click="dialogSelectedVariety = null"
                    variant="outlined"
                  >
                    <v-card-text class="pa-3 d-flex align-center">
                      <v-avatar size="40" class="mr-3">
                        <v-img :src="mainImage(product.main_img_urls)" />
                      </v-avatar>
                      <div class="flex-grow-1">
                        <div class="font-weight-medium">Standard Product</div>
                        <div class="text-caption text-grey">{{ formatCurrency(product.price) }}</div>
                      </div>
                      <v-icon v-if="!dialogSelectedVariety" color="primary">
                        mdi-check-circle
                      </v-icon>
                    </v-card-text>
                  </v-card>

                  <v-card
                    v-for="variety in product.varieties"
                    :key="variety.name"
                    class="mb-2"
                    :class="{ 'option-selected': dialogSelectedVariety?.name === variety.name }"
                    @click="dialogSelectedVariety = variety"
                    variant="outlined"
                    :disabled="product.stock === 0"
                  >
                    <v-card-text class="pa-3 d-flex align-center">
                      <v-avatar size="40" class="mr-3">
                        <v-img :src="getVarietyImage(variety)" />
                      </v-avatar>
                      <div class="flex-grow-1">
                        <div class="font-weight-medium">{{ variety.name }}</div>
                        <div class="text-caption text-grey">
                          {{ formatCurrency(variety.price || product.price) }}
                        </div>
                      </div>
                      <v-icon v-if="dialogSelectedVariety?.name === variety.name" color="primary">
                        mdi-check-circle
                      </v-icon>
                    </v-card-text>
                  </v-card>
                </div>
              </div>

              <div class="mb-4">
                <p class="font-weight-medium mb-2">Quantity:</p>
                <div class="d-flex align-center">
                  <v-btn icon @click="decrementQuantity" :disabled="dialogQuantity <= 1">
                    <v-icon>mdi-minus</v-icon>
                  </v-btn>
                  <span class="mx-4 font-weight-bold">{{ dialogQuantity }}</span>
                  <v-btn
                    icon
                    @click="incrementQuantity"
                    :disabled="dialogQuantity >= dialogDisplayStock"
                  >
                    <v-icon>mdi-plus</v-icon>
                  </v-btn>
                  <span class="ml-4 text-caption text-grey">
                    {{ dialogDisplayStock }} available
                  </span>
                </div>
              </div>

              <div class="total-price mb-4 pa-3 rounded-lg" style="background: #f8f9fa">
                <div class="d-flex justify-space-between">
                  <span>Total:</span>
                  <span class="font-weight-bold text-primary">
                    {{
                      formatCurrency((dialogSelectedVariety?.price || product.price) * dialogQuantity)
                    }}
                  </span>
                </div>
              </div>
            </v-card-text>

            <v-card-actions>
              <v-spacer />
              <v-btn @click="closeAddToCartDialog" variant="outlined" class="mr-2"> Cancel </v-btn>
              <v-btn
                color="primary"
                @click="confirmAddToCart"
                :disabled="dialogDisplayStock === 0 || (product.has_sizes && !dialogSelectedSize)"
                :loading="addingToCart"
              >
                Add to Cart
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- BUY NOW DIALOG -->
        <v-dialog v-model="showBuyNowDialog" max-width="500px">
          <v-card class="pa-4">
            <v-card-title class="d-flex justify-space-between align-center">
              <h3>Buy Now</h3>
              <v-btn icon @click="closeBuyNowDialog">
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </v-card-title>

            <v-card-text>
              <div class="mb-4 d-flex align-center">
                <v-avatar size="80" class="mr-3">
                  <v-img :src="mainImage(product.main_img_urls)" />
                </v-avatar>
                <div>
                  <h4 class="mb-1">{{ product.prod_name }}</h4>
                  <div class="text-primary font-weight-bold">
                    {{ formatCurrency(buyNowSelectedVariety?.price || product.price) }}
                  </div>
                  <div class="text-caption text-grey">
                    Stock: {{ buyNowDisplayStock }} available
                  </div>
                </div>
              </div>

              <div v-if="product.sizes && product.sizes.length" class="mb-4">
                <p class="font-weight-medium mb-2">Select Size:</p>
                <v-btn-toggle
                  v-model="buyNowSelectedSize"
                  mandatory
                  class="flex-wrap"
                  style="gap: 6px"
                >
                  <v-btn
                    v-for="size in product.sizes"
                    :key="size"
                    :value="size"
                    variant="outlined"
                    class="ma-1 rounded-pill text-capitalize"
                    color="primary"
                    size="small"
                  >
                    {{ size }}
                  </v-btn>
                </v-btn-toggle>
              </div>

              <div v-if="product.varieties && product.varieties.length" class="mb-4">
                <p class="font-weight-medium mb-2">Select Variety:</p>
                <div class="varieties-list">
                  <v-card
                    class="mb-2"
                    :class="{ 'option-selected': !buyNowSelectedVariety }"
                    @click="buyNowSelectedVariety = null"
                    variant="outlined"
                  >
                    <v-card-text class="pa-3 d-flex align-center">
                      <v-avatar size="40" class="mr-3">
                        <v-img :src="mainImage(product.main_img_urls)" />
                      </v-avatar>
                      <div class="flex-grow-1">
                        <div class="font-weight-medium">Standard Product</div>
                        <div class="text-caption text-grey">{{ formatCurrency(product.price) }}</div>
                      </div>
                      <v-icon v-if="!buyNowSelectedVariety" color="primary">
                        mdi-check-circle
                      </v-icon>
                    </v-card-text>
                  </v-card>

                  <v-card
                    v-for="variety in product.varieties"
                    :key="variety.name"
                    class="mb-2"
                    :class="{ 'option-selected': buyNowSelectedVariety?.name === variety.name }"
                    @click="buyNowSelectedVariety = variety"
                    variant="outlined"
                    :disabled="product.stock === 0"
                  >
                    <v-card-text class="pa-3 d-flex align-center">
                      <v-avatar size="40" class="mr-3">
                        <v-img :src="getVarietyImage(variety)" />
                      </v-avatar>
                      <div class="flex-grow-1">
                        <div class="font-weight-medium">{{ variety.name }}</div>
                        <div class="text-caption text-grey">
                          {{ formatCurrency(variety.price || product.price) }}
                        </div>
                      </div>
                      <v-icon v-if="buyNowSelectedVariety?.name === variety.name" color="primary">
                        mdi-check-circle
                      </v-icon>
                    </v-card-text>
                  </v-card>
                </div>
              </div>

              <div class="mb-4">
                <p class="font-weight-medium mb-2">Quantity:</p>
                <div class="d-flex align-center">
                  <v-btn icon @click="decrementBuyNowQuantity" :disabled="buyNowQuantity <= 1">
                    <v-icon>mdi-minus</v-icon>
                  </v-btn>
                  <span class="mx-4 font-weight-bold">{{ buyNowQuantity }}</span>
                  <v-btn
                    icon
                    @click="incrementBuyNowQuantity"
                    :disabled="buyNowQuantity >= buyNowDisplayStock"
                  >
                    <v-icon>mdi-plus</v-icon>
                  </v-btn>
                  <span class="ml-4 text-caption text-grey">
                    {{ buyNowDisplayStock }} available
                  </span>
                </div>
              </div>

              <div class="total-price mb-4 pa-3 rounded-lg" style="background: #f8f9fa">
                <div class="d-flex justify-space-between">
                  <span>Total:</span>
                  <span class="font-weight-bold text-primary">
                    {{
                      formatCurrency((buyNowSelectedVariety?.price || product.price) * buyNowQuantity)
                    }}
                  </span>
                </div>
              </div>
            </v-card-text>

            <v-card-actions>
              <v-spacer />
              <v-btn @click="closeBuyNowDialog" variant="outlined" class="mr-2"> Cancel </v-btn>
              <v-btn
                color="primary"
                @click="proceedToCheckout"
                :disabled="buyNowDisplayStock === 0 || (product.has_sizes && !buyNowSelectedSize)"
              >
                Proceed to Checkout
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Product Info -->
        <div class="product-info mb-4">
          <div class="product-badges">
            <span class="stock-badge" :class="stockBadgeClass">{{ stockBadgeLabel }}</span>
            <span class="info-badge">{{ soldCountLabel }}</span>
            <span v-if="product.varieties && product.varieties.length" class="info-badge">
              {{ product.varieties.length }} variant{{ product.varieties.length === 1 ? '' : 's' }}
            </span>
          </div>

          <div class="product-info__top">
            <div class="product-headline">
              <h2 class="product-title mb-2">{{ product.prod_name }}</h2>
              <div class="product-review-summary mb-2">
                <v-rating
                  :model-value="averageRating"
                  readonly
                  half-increments
                  density="compact"
                  color="amber"
                  active-color="amber"
                  size="small"
                />
                <span class="product-review-summary__score">
                  {{ reviewCount ? averageRating.toFixed(1) : 'New' }}
                </span>
                <span class="product-review-summary__meta">{{ reviewSummaryLabel }}</span>
              </div>
            </div>

            <div class="price-panel">
              <p class="product-price mb-1">{{ formatCurrency(displayPrice) }}</p>
              <p class="price-caption">Current selling price</p>
            </div>
          </div>

          <!-- Selection Options -->
          <div class="selection-options mb-4">
            <div class="option-section mb-4">
              <p class="selection-label">Choose your option:</p>

              <v-card
                class="option-card mb-2"
                :class="{ 'option-card--selected': isMainProductSelected }"
                @click="selectMainProduct"
                variant="outlined"
                :disabled="product.stock === 0"
              >
                <v-card-text class="pa-3 d-flex align-center">
                  <v-avatar size="48" class="mr-3">
                    <v-img :src="mainImage(product.main_img_urls)" />
                  </v-avatar>
                  <div class="flex-grow-1">
                    <div class="option-title">Standard Product</div>
                    <div class="option-subtitle">{{ getAvailabilityLabel(product.stock) }}</div>
                  </div>
                  <div class="option-price">{{ formatCurrency(product.price) }}</div>
                  <v-icon v-if="isMainProductSelected" color="primary" class="ml-3">
                    mdi-check-circle
                  </v-icon>
                </v-card-text>
              </v-card>

              <div v-if="product.varieties && product.varieties.length" class="or-divider">
                <v-divider />
                <span class="or-text">OR</span>
                <v-divider />
              </div>
            </div>

            <div v-if="product.varieties && product.varieties.length" class="varieties-section">
              <div class="varieties-toggle-row">
                <div>
                  <p class="selection-label mb-1">Varieties</p>
                  <p class="varieties-toggle-row__summary">
                    {{
                      selectedVariety
                        ? selectedVariety.name
                        : `${product.varieties.length} option${product.varieties.length === 1 ? '' : 's'} available`
                    }}
                  </p>
                </div>

                <v-btn
                  icon
                  variant="tonal"
                  color="primary"
                  class="varieties-toggle-btn"
                  :aria-label="showVarieties ? 'Hide varieties' : 'Show varieties'"
                  @click="showVarieties = !showVarieties"
                >
                  <v-icon>{{ showVarieties ? 'mdi-chevron-up' : 'mdi-shape-outline' }}</v-icon>
                </v-btn>
              </div>

              <v-expand-transition>
                <div v-if="showVarieties" class="varieties-grid">
                  <v-card
                    v-for="variety in product.varieties"
                    :key="variety.name"
                    class="variety-card"
                    :class="{ 'variety-card--selected': isVarietySelected(variety) }"
                    @click="selectVariety(variety)"
                    variant="outlined"
                    :disabled="product.stock === 0"
                  >
                    <v-card-text class="pa-3">
                      <div class="variety-content">
                        <v-avatar size="48" class="mr-3">
                          <v-img :src="getVarietyImage(variety)" />
                        </v-avatar>
                        <div class="variety-info">
                          <div class="variety-name">{{ variety.name }}</div>
                        </div>
                        <div class="variety-price">{{ formatCurrency(variety.price || product.price) }}</div>
                        <v-icon v-if="isVarietySelected(variety)" color="primary" size="20">
                          mdi-check-circle
                        </v-icon>
                      </div>
                    </v-card-text>
                  </v-card>
                </div>
              </v-expand-transition>
            </div>
          </div>

          <!-- Sizes -->
          <div v-if="product.sizes && product.sizes.length" class="size-section mb-4">
            <p class="selection-label">Select Size:</p>
            <div class="size-buttons">
              <button
                v-for="size in product.sizes"
                :key="size"
                class="size-btn"
                :class="{ 'size-btn--active': selectedSize === size }"
                @click="selectedSize = size"
              >
                {{ size }}
              </button>
            </div>
          </div>

          <!-- Selection Summary -->
          <div class="selection-summary">
            <p class="summary-label">Your selection:</p>
            <p class="summary-value">{{ selectionSummaryLabel }}</p>
            <div class="summary-details">
              <span>Price: <strong>{{ formatCurrency(displayPrice) }}</strong></span>
              <span>
                Stock:
                <strong
                  :class="{
                    'low-stock': displayStock < 5 && displayStock > 0,
                    'out-stock-text': displayStock === 0,
                  }"
                >
                  {{ stockSummaryText }}
                </strong>
              </span>
            </div>
          </div>

          <div class="description-block">
            <div class="description-label">About this item</div>
            <p class="product-description">
              {{ product.prod_description || 'No product description available yet.' }}
            </p>
          </div>
        </div>

      <!-- Shop Info -->
        <v-card
          v-if="product.shop"
          flat
          class="shop-card"
          @click="goToShop(product.shop.id)"
        >
          <div class="shop-card__content">
            <v-avatar size="52" class="mr-3">
              <v-img :src="product.shop.logo_url || '/placeholder.png'" />
            </v-avatar>
            <div class="shop-info">
              <p class="shop-eyebrow">Shop</p>
              <p class="shop-name">{{ product.shop.business_name }}</p>
            </div>
            <v-spacer />
          </div>
        </v-card>

        <section class="reviews-section mb-4" aria-label="Customer reviews">
          <div class="reviews-section__header">
            <div>
              <div class="reviews-section__eyebrow">Customer Reviews</div>
              <h3 class="reviews-section__title">What buyers are saying</h3>
            </div>
            <v-chip color="primary" variant="tonal" size="small" class="reviews-section__chip">
              Live updates
            </v-chip>
          </div>

          <div class="reviews-summary-card mb-4">
            <div class="reviews-summary-card__score">
              {{ reviewCount ? averageRating.toFixed(1) : '--' }}
            </div>
            <div class="reviews-summary-card__details">
              <v-rating
                :model-value="averageRating"
                readonly
                half-increments
                density="compact"
                color="amber"
                active-color="amber"
                size="small"
              />
              <div class="reviews-summary-card__meta">
                {{
                  reviewCount
                    ? `${reviewSummaryLabel} for this product`
                    : 'No customer reviews yet'
                }}
              </div>
            </div>
          </div>

          <div v-if="reviewsLoading" class="reviews-loading">
            <v-progress-circular indeterminate color="primary" size="28" />
            <span>Loading reviews...</span>
          </div>

          <v-alert v-else-if="reviewError" type="warning" variant="tonal" class="mb-0">
            {{ reviewError }}
          </v-alert>

          <div v-else-if="!reviews.length" class="reviews-empty-state">
            <v-icon size="40" color="grey-lighten-1">mdi-comment-outline</v-icon>
            <div class="reviews-empty-state__title">No reviews yet</div>
            <div class="reviews-empty-state__subtitle">
              Reviews for this product will appear here as soon as customers submit them.
            </div>
          </div>

          <div v-else class="reviews-list">
            <div class="review-filter" aria-label="Filter reviews by star rating">
              <button
                v-for="option in reviewRatingOptions"
                :key="option.value ?? 'all'"
                class="review-filter__chip"
                :class="{ 'review-filter__chip--active': selectedReviewRating === option.value }"
                type="button"
                @click="selectedReviewRating = option.value"
              >
                <span>{{ option.label }}</span>
                <v-icon v-if="option.value" size="14" color="amber">mdi-star</v-icon>
                <span class="review-filter__count">{{ option.count }}</span>
              </button>
            </div>

            <div v-if="!filteredReviews.length" class="reviews-empty-state reviews-empty-state--compact">
              <v-icon size="32" color="grey-lighten-1">mdi-star-outline</v-icon>
              <div class="reviews-empty-state__title">No matching reviews</div>
              <div class="reviews-empty-state__subtitle">
                {{ filteredReviewsEmptyText }}
              </div>
            </div>

            <article v-for="review in filteredReviews" :key="review.id" class="review-card">
              <div class="review-card__top">
                <div class="reviewer">
                  <v-avatar size="44" class="reviewer__avatar">
                    <v-img :src="review.reviewer_avatar" alt="Reviewer avatar" />
                  </v-avatar>
                  <div class="reviewer__details">
                    <div class="reviewer__name">
                      {{ review.reviewer_name }}
                    </div>
                    <div class="reviewer__meta">
                      <v-rating
                        :model-value="review.rating"
                        readonly
                        half-increments
                        density="compact"
                        color="amber"
                        active-color="amber"
                        size="x-small"
                      />
                      <span>{{ formatReviewDate(review.created_at) }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <p v-if="review.comment?.trim()" class="review-card__comment">
                {{ review.comment }}
              </p>
              <p v-else class="review-card__comment review-card__comment--muted">
                Rated this product without a written comment.
              </p>

              <div v-if="review.photos?.length" class="review-photo-grid">
                <div
                  v-for="(photo, index) in review.photos"
                  :key="`${review.id}-${index}`"
                  class="review-photo-grid__item"
                >
                  <img :src="photo" alt="Review photo" />
                </div>
              </div>
            </article>
          </div>
        </section>

      </v-sheet>
    </v-main>

        <!-- Bottom Nav -->
    <v-bottom-navigation class="bottom-nav" fixed height="64">
      <v-row class="w-full pa-0 ma-0" no-gutters>
        <template v-if="isOwner">
          <v-col cols="12" class="pa-0">
            <v-btn block color="primary" class="bottom-btn" @click="goToShop(product.shop.id)">
              <v-icon left size="20">mdi-storefront-outline</v-icon>
              Visit Shop
            </v-btn>
          </v-col>
        </template>

        <template v-else>
          <!-- Chat Now -->
          <v-col cols="4" class="pa-0">
            <v-btn block class="bottom-btn chat-now-btn" color="#4caf50" @click="goToChat()">
              <v-icon left size="20">mdi-chat-outline</v-icon>
              Chat Now
            </v-btn>
          </v-col>

          <!-- Add to Cart - Opens Dialog -->
          <v-col cols="4" class="pa-0">
            <v-btn
              block
              class="bottom-btn cart-btn"
              color="#4caf50"
              @click="openAddToCartDialog()"
              :disabled="displayStock === 0"
            >
              <v-icon left size="20">mdi-cart-outline</v-icon>
              {{ displayStock === 0 ? 'Out of Stock' : 'Add to Cart' }}
            </v-btn>
          </v-col>

          <!-- Buy Now - Opens Dialog -->
          <v-col cols="4" class="pa-0">
            <v-btn
              block
              class="bottom-btn buy-now-btn"
              color="#438fda"
              @click="openBuyNowDialog()"
              :disabled="isActionDisabled"
            >
              Buy Now
            </v-btn>
          </v-col>
        </template>
      </v-row>
    </v-bottom-navigation>
  </v-app>
</template>

<style scoped>
/* ===============================
   GLOBAL LAYOUT
================================= */
.v-application {
  background: #f6f8fb;
}

.product-page {
  --product-detail-bottom-bar-height: 64px;
  --product-detail-content-bottom-padding: calc(
    var(--product-detail-bottom-bar-height) + var(--app-bottom-safe-space, 0px) + 32px
  );
  background: #f6f8fb;
  min-height: 100vh;
}

.product-sheet {
  width: 100%;
  max-width: 1180px;
  margin: auto;
  padding: 20px;
}

/* =========================================
   SAFE AREA + GLOBAL MOBILE FRIENDLY LAYOUT
========================================= */
:root {
  font-family: 'Inter', 'Poppins', 'Roboto', sans-serif;
}

.v-application {
  background: #f5f7fb;
}

v-main,
.v-main {
  padding-top: var(--app-safe-area-top, env(safe-area-inset-top, 0px));
  padding-bottom: var(
    --product-detail-content-bottom-padding,
    var(--app-safe-area-bottom, env(safe-area-inset-bottom, 0px))
  );
  padding-left: max(0px, var(--app-safe-area-left, env(safe-area-inset-left, 0px)));
  padding-right: max(0px, var(--app-safe-area-right, env(safe-area-inset-right, 0px)));
  background: #f5f7fb;
  min-height: 100vh;
  margin-top: 30px;
}

/* =========================================
   APP BAR
========================================= */
.app-bar {
  padding-top: var(--app-safe-area-top, env(safe-area-inset-top, 0px));
  background: linear-gradient(135deg, #3f83c7, #2f6ca9) !important;
  color: white !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12) !important;
}

.app-bar :deep(.v-toolbar-title) {
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.app-bar :deep(.v-btn) {
  color: white !important;
}

/* ===============================
   PRODUCT IMAGE SECTION
================================= */
.product-images {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: 24px;
}

.product-img,
.product-images :deep(.v-carousel),
.product-images :deep(.v-window),
.product-images :deep(.v-carousel-item) {
  width: 100%;
  max-width: 620px;
  height: 420px !important;
  border-radius: 18px;
  overflow: hidden;
  background: white;
  box-shadow: 0 8px 24px rgba(0,0,0,0.08);
}

.product-img :deep(img),
.product-images :deep(img) {
  object-fit: contain !important;
  padding: 18px;
}


.shop-card {
  border-radius: 16px;
  padding: 12px 16px;
  margin: 12px 0;
  cursor: pointer;
  transition: all 0.2s ease;
  background: #fff;
}

.shop-card:active {
  transform: scale(0.98);
}

.shop-card__content {
  display: flex;
  align-items: center; /* vertically align avatar + text */
  width: 100%;
}

.shop-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-left: 12px; /* spacing beside avatar */
  overflow: hidden;
}

.shop-eyebrow {
  font-size: 12px;
  color: #888;
  margin: 0;
  line-height: 1.2;
}

.shop-name {
  font-size: 16px;
  font-weight: 600;
  color: #111;
  margin: 2px 0 0;
  line-height: 1.3;

  /* Prevent overflow */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===============================
   PRODUCT INFO
================================= */
.product-info {
  background: white;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.05);
}

.product-title {
  font-size: 1.7rem;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.35;
  margin-bottom: 8px;
}

.product-price {
  font-size: 2rem;
  font-weight: 800;
  color: #e53935;
  margin-bottom: 16px;
}

.product-description {
  font-size: 0.96rem;
  color: #475569;
  line-height: 1.7;
  margin-top: 16px;
}

.product-meta {
  margin-top: 12px;
  color: #64748b;
  font-size: 0.9rem;
}

.product-review-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.product-review-summary__score {
  font-size: 0.95rem;
  font-weight: 700;
  color: #1e293b;
}

.product-review-summary__meta {
  font-size: 0.88rem;
  color: #64748b;
}

.reviews-section {
  background: white;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.05);
  scroll-margin-bottom: var(--product-detail-content-bottom-padding);
}

.reviews-section__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}

.reviews-section__eyebrow {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #3f83c7;
  margin-bottom: 4px;
}

.reviews-section__title {
  font-size: 1.15rem;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}

.reviews-summary-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  border-radius: 18px;
  background: linear-gradient(135deg, #f8fbff, #eef6ff);
  border: 1px solid #dbeafe;
}

.reviews-summary-card__score {
  font-size: 2rem;
  font-weight: 800;
  line-height: 1;
  color: #1d4ed8;
}

.reviews-summary-card__details {
  display: grid;
  gap: 4px;
}

.reviews-summary-card__meta {
  color: #64748b;
  font-size: 0.9rem;
}

.reviews-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #475569;
  padding: 8px 0;
}

.reviews-empty-state {
  border: 1px dashed #cbd5e1;
  border-radius: 18px;
  padding: 28px 20px;
  text-align: center;
  color: #64748b;
}

.reviews-empty-state__title {
  margin-top: 10px;
  font-weight: 700;
  color: #334155;
}

.reviews-empty-state__subtitle {
  margin-top: 6px;
  font-size: 0.92rem;
  line-height: 1.5;
}

.reviews-empty-state--compact {
  padding: 22px 18px;
}

.reviews-list {
  display: grid;
  gap: 16px;
}

.review-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.review-filter__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 34px;
  padding: 7px 12px;
  border: 1px solid #dbeafe;
  border-radius: 999px;
  background: #f8fbff;
  color: #334155;
  font-size: 0.86rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
}

.review-filter__chip:hover {
  transform: translateY(-1px);
  border-color: #93c5fd;
}

.review-filter__chip--active {
  background: #3f83c7;
  border-color: #3f83c7;
  color: white;
}

.review-filter__count {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  font-size: 0.75rem;
  text-align: center;
}

.review-filter__chip--active .review-filter__count {
  background: rgba(255, 255, 255, 0.2);
}

.review-card {
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 18px;
  background: #fff;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.review-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
}

.review-card__top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.review-card__comment {
  margin: 14px 0 0;
  color: #334155;
  line-height: 1.65;
}

.review-card__comment--muted {
  color: #64748b;
  font-style: italic;
}

.reviewer {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.reviewer__details {
  min-width: 0;
}

.reviewer__name {
  font-weight: 700;
  color: #1e293b;
}

.reviewer__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 0.82rem;
  color: #64748b;
  margin-top: 4px;
}

.review-photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.review-photo-grid__item {
  border: 0;
  padding: 0;
  background: transparent;
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
}

.review-photo-grid__item img {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
}

/* ===============================
   OPTION / VARIETY CARDS
================================= */
.option-card,
.variety-card {
  border-radius: 16px !important;
  border: 1px solid #e5e7eb;
  transition: 0.25s ease;
}

.option-card:hover,
.variety-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 18px rgba(0,0,0,0.06);
}

.option-card--selected,
.variety-card--selected {
  border: 2px solid #3f83c7 !important;
  background: #eef6ff;
}

.varieties-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid #dbeafe;
  border-radius: 16px;
  background: #f8fbff;
  margin-bottom: 12px;
}

.varieties-toggle-row__summary {
  margin: 0;
  color: #64748b;
  font-size: 0.88rem;
  line-height: 1.35;
}

.varieties-toggle-btn {
  flex: 0 0 auto;
}

.varieties-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}

/* ===============================
   SHOP CARD
================================= */
.shop-card {
  border-radius: 18px;
  background: white;
  box-shadow: 0 5px 14px rgba(0,0,0,0.05);
  margin-bottom: 50px !important;
  cursor: pointer;
}

.shop-card__content {
  display: flex;
  align-items: center;
  padding: 16px 18px;
}

.shop-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.shop-eyebrow,
.shop-name {
  margin: 0;
}

.shop-eyebrow {
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.shop-name {
  font-weight: 700;
  font-size: 1rem;
  color: #1e293b;
}

/* ===============================
   BOTTOM NAV
================================= */
.bottom-nav {
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  background: #000 !important;
  backdrop-filter: none;
  height: calc(64px + var(--app-bottom-safe-space, 0px)) !important;
  padding-bottom: var(--app-bottom-safe-space, 0px);
}

.bottom-nav :deep(.v-bottom-navigation__content) {
  width: 100%;
  box-sizing: border-box;
  padding-left: max(0px, var(--app-safe-area-left, 0px));
  padding-right: max(0px, var(--app-safe-area-right, 0px));
}

.bottom-btn {
  height: 64px !important;
  font-weight: 700;
  text-transform: none !important;
  border-radius: 0 !important;
  font-size: 14px;
}

.chat-now-btn {
  background: #43a047 !important;
  color: white !important;
}

.cart-btn {
  background: #fb8c00 !important;
  color: white !important;
}

.buy-now-btn {
  background: #3f83c7 !important;
  color: white !important;
}

/* ===============================
   TABLET
================================= */
@media (max-width: 1024px) {
  .product-sheet {
    padding: 16px;
  }

  .product-img,
  .product-images :deep(.v-carousel),
  .product-images :deep(.v-window),
  .product-images :deep(.v-carousel-item) {
    max-width: 100%;
    height: 360px !important;
  }

  .product-title {
    font-size: 1.45rem;
  }

  .product-price {
    font-size: 1.7rem;
  }
}

/* ===============================
   MOBILE
================================= */
@media (max-width: 768px) {
  .product-page {
    --product-detail-bottom-bar-height: 58px;
    --product-detail-content-bottom-padding: calc(
      var(--product-detail-bottom-bar-height) + var(--app-bottom-safe-space, 0px) + 28px
    );
  }

  .product-sheet {
    padding: 12px;
  }

  .product-info {
    padding: 18px;
    border-radius: 18px;
  }

  .product-img,
  .product-images :deep(.v-carousel),
  .product-images :deep(.v-window),
  .product-images :deep(.v-carousel-item) {
    height: 260px !important;
    border-radius: 16px;
  }

  .product-img :deep(img),
  .product-images :deep(img) {
    padding: 12px;
  }

  .product-title {
    font-size: 1.15rem;
  }

  .product-price {
    font-size: 1.45rem;
  }

  .product-description {
    font-size: 0.9rem;
  }

  .reviews-section {
    padding: 18px;
    border-radius: 18px;
  }

  .reviews-section__header,
  .reviews-summary-card,
  .review-card__top {
    flex-direction: column;
  }

  .review-photo-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .varieties-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .bottom-btn {
    height: 58px !important;
    font-size: 11px;
  }
}

/* ===============================
   SMALL MOBILE
================================= */
@media (max-width: 480px) {
  .product-img,
  .product-images :deep(.v-carousel),
  .product-images :deep(.v-window),
  .product-images :deep(.v-carousel-item) {
    height: 220px !important;
  }

  .product-title {
    font-size: 1rem;
  }

  .product-price {
    font-size: 1.25rem;
  }

  .reviews-summary-card__score {
    font-size: 1.7rem;
  }

  .reviews-section__title {
    font-size: 1rem;
  }

  .review-card {
    padding: 14px;
  }

  .bottom-btn {
    font-size: 10px;
  }
}

/* ===============================
   DIALOG
================================= */
:deep(.v-dialog .v-card) {
  border-radius: 18px !important;
}

/* ===============================
   SCROLL
================================= */
html {
  scroll-behavior: smooth;
}
</style>
