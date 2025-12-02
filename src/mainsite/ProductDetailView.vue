<script setup lang="js">
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { useCartStore } from '@/stores/cart'
import VueEasyLightbox from 'vue-easy-lightbox'

const cartStore = useCartStore()
const route = useRoute()
const router = useRouter()
const productId = route.params.id

const product = ref(null)
const loading = ref(true)
const error = ref(null)
const reviews = ref([])
const reviewsLoading = ref(false)


// Dialog states
const showAddToCartDialog = ref(false)
const quantity = ref(1)
const selectedSize = ref(null)
const selectedVariety = ref(null)
const openImageDialog = ref(false)
const previewIndex = ref(0)
const user = ref(null)

// DOM refs
const productImgRef = ref(null)
const cartIconRef = ref(null)

// Animation refs
const isAnimating = ref(false)

// Dialog selections
const dialogSelectedSize = ref(null)
const dialogSelectedVariety = ref(null)
const dialogQuantity = ref(1)

// Review filter and sort
const reviewFilter = ref('all')
const reviewSort = ref('latest')

// Image states
const currentImage = ref('')
const openVarietyDialog = ref(false)
const varietyPreviewIndex = ref(0)
const varietyImages = ref([])

// Snackbar for notifications
const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref('success')

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

// Show snackbar notification
const showSnackbar = (message, color = 'success') => {
  snackbarMessage.value = message
  snackbarColor.value = color
  snackbar.value = true
}

// Fetch product + shop + reviews
onMounted(async () => {
  loading.value = true
  try {
    // Get current logged-in user first
    const { data: userData } = await supabase.auth.getUser()
    user.value = userData?.user

    // Fetch product + shop details
    const { data, error: err } = await supabase
      .from('products')
      .select(`
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
      `)
      .eq('id', productId)
      .single()

    if (err) throw err
    product.value = data

    // Parse JSON safely
    if (product.value.sizes && typeof product.value.sizes === 'string') {
      try {
        product.value.sizes = JSON.parse(product.value.sizes)
      } catch {
        product.value.sizes = []
      }
    }

    if (product.value.varieties && typeof product.value.varieties === 'string') {
      try {
        product.value.varieties = JSON.parse(product.value.varieties)
      } catch {
        product.value.varieties = []
      }
    }

    // Debug: Log varieties to see their structure
    console.log('🔄 Parsed varieties:', product.value.varieties)
    if (product.value.varieties && product.value.varieties.length > 0) {
      console.log('📦 First variety structure:', product.value.varieties[0])
    }

    // Auto-select if only one option
    if (product.value?.sizes?.length === 1) {
      selectedSize.value = product.value.sizes[0]
      dialogSelectedSize.value = product.value.sizes[0]
    }

    // Load reviews for this product
    await loadReviews()

    console.log('Product loaded:', product.value)
  } catch (e) {
    error.value = e.message || 'Failed to load product'
    console.error('Error loading product:', e)
  } finally {
    loading.value = false
  }
})

// Load reviews for the current product
const loadReviews = async () => {
  if (!productId) return

  reviewsLoading.value = true
  try {
    const { data, error: err } = await supabase
      .from('reviews')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })

    if (err) throw err

    // Process reviews data
    reviews.value = (data || []).map(review => {
      // Ensure photos is always an array
      let photos = review.photos || []

      // If photos is a string, try to parse it as JSON
      if (typeof photos === 'string') {
        try {
          photos = JSON.parse(photos)
        } catch (e) {
          console.warn('⚠️ Could not parse photos as JSON:', photos)
          photos = []
        }
      }

      // Filter out invalid photo entries
      photos = photos.filter(photo =>
        photo &&
        typeof photo === 'string' &&
        photo.length > 0 &&
        (photo.startsWith('http') || photo.startsWith('data:') || photo.startsWith('/') || photo.startsWith('blob:'))
      )

      return {
        ...review,
        photos: photos
      }
    })

    console.log('📝 Reviews loaded:', reviews.value.length)
  } catch (error) {
    console.error('Error loading reviews:', error)
    reviews.value = []
  } finally {
    reviewsLoading.value = false
  }
}

// Calculate review statistics
const reviewStats = computed(() => {
  if (reviews.value.length === 0) {
    return {
      average_rating: 0,
      total_reviews: 0,
      rating_distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    }
  }

  const total = reviews.value.length
  const average = reviews.value.reduce((sum, review) => sum + review.rating, 0) / total

  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  reviews.value.forEach(review => {
    distribution[review.rating]++
  })

  return {
    average_rating: Math.round(average * 10) / 10,
    total_reviews: total,
    rating_distribution: distribution
  }
})

// Filtered and sorted reviews
const filteredReviews = computed(() => {
  let filtered = [...reviews.value]

  // Apply rating filter
  if (reviewFilter.value !== 'all') {
    const rating = parseInt(reviewFilter.value)
    filtered = filtered.filter(review => review.rating === rating)
  }

  // Apply sort
  if (reviewSort.value === 'latest') {
    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  } else if (reviewSort.value === 'highest') {
    filtered.sort((a, b) => b.rating - a.rating)
  } else if (reviewSort.value === 'lowest') {
    filtered.sort((a, b) => a.rating - b.rating)
  } else if (reviewSort.value === 'most_liked') {
    filtered.sort((a, b) => (b.likes || 0) - (a.likes || 0))
  }

  return filtered
})

// Format date for reviews
const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// View review image in dialog
const viewReviewImage = (imageUrl) => {
  console.log('🖼️ Viewing review image:', imageUrl)
  if (!imageUrl) {
    console.log('❌ No image URL provided')
    return
  }
  currentImage.value = imageUrl
  openImageDialog.value = true
}

// Get price based on variety selection
const displayPrice = computed(() => {
  if (!product.value) return 0

  if (selectedVariety.value && selectedVariety.value.price !== undefined && selectedVariety.value.price !== null) {
    return selectedVariety.value.price
  }

  return product.value.price
})

// Get stock based on variety selection
const displayStock = computed(() => {
  if (!product.value) return 0

  if (selectedVariety.value && selectedVariety.value.stock !== undefined && selectedVariety.value.stock !== null) {
    return selectedVariety.value.stock
  }

  return product.value.stock || 0
})

// Get dialog display stock
const dialogDisplayStock = computed(() => {
  if (!product.value) return 0

  if (dialogSelectedVariety.value && dialogSelectedVariety.value.stock !== undefined && dialogSelectedVariety.value.stock !== null) {
    return dialogSelectedVariety.value.stock
  }

  return product.value.stock || 0
})

// Check if main product is selected (no variety)
const isMainProductSelected = computed(() => {
  return !selectedVariety.value
})

// Check if any variety is selected
const isAnyVarietySelected = computed(() => {
  return !!selectedVariety.value
})

// Check if add to cart/buy now is disabled
const isActionDisabled = computed(() => {
  if (!product.value) return true
  if (displayStock.value === 0) {
    return true
  }
  if (product.value.has_sizes && !selectedSize.value) {
    return true
  }
  return false
})

// FLY TO CART ANIMATION
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

// OPEN ADD TO CART DIALOG
const openAddToCartDialog = () => {
  if (!product.value) {
    showSnackbar('Product not loaded', 'error')
    return
  }

  // Check if user is logged in
  if (!user.value) {
    showSnackbar('Please login to add items to cart', 'warning')
    return
  }

  // Set dialog values from current selections
  dialogSelectedSize.value = selectedSize.value
  dialogSelectedVariety.value = selectedVariety.value
  dialogQuantity.value = 1

  showAddToCartDialog.value = true
}

// CONFIRM ADD TO CART (from dialog)
// CONFIRM ADD TO CART (from dialog)
const confirmAddToCart = async () => {
  console.log('🛒 confirmAddToCart called')

  if (!product.value) {
    console.log('❌ Product not loaded')
    showSnackbar('Product not loaded', 'error')
    return
  }

  // Check if user is logged in
  if (!user.value) {
    showSnackbar('Please login to add items to cart', 'warning')
    return
  }

  const finalSize = dialogSelectedSize.value
  const finalVariety = dialogSelectedVariety.value
  const finalQuantity = dialogQuantity.value

  // Validate selections
  if (product.value.has_sizes && !finalSize) {
    showSnackbar('Please select a size', 'warning')
    return
  }

  const availableStock = dialogDisplayStock.value
  if (finalQuantity > availableStock) {
    showSnackbar(`Only ${availableStock} items available in stock`, 'warning')
    return
  }

  try {
    // Prepare variety data
    const varietyData = finalVariety ? {
      name: finalVariety.name,
      price: finalVariety.price,
      stock: finalVariety.stock,
      images: finalVariety.images || []
    } : null

    // Use cart store to add item
    const result = await cartStore.addToCart(
      product.value.id,
      finalQuantity,
      finalSize,
      finalVariety ? finalVariety.name : null,
      varietyData
    )

    // Check if result exists and has success property
    if (result && result.success) {
      showSnackbar('Product added to cart successfully!', 'success')

      // Animate to cart
      animateToCart()

      // Close dialog
      showAddToCartDialog.value = false

      // Reset quantity
      dialogQuantity.value = 1
    } else {
      // Handle case where result exists but success is false
      const errorMessage = result?.error || 'Failed to add to cart'
      throw new Error(errorMessage)
    }

  } catch (err) {
    console.error('❌ confirmAddToCart error:', err)

    // Safely get error message
    let errorMessage = 'Failed to add to cart: '
    if (err && err.message) {
      errorMessage += err.message
    } else if (err && typeof err === 'string') {
      errorMessage += err
    } else {
      errorMessage += 'Unknown error occurred'
    }

    showSnackbar(errorMessage, 'error')
  }
}

// GO TO CART FUNCTION
const goToCart = async () => {
  console.log('🛒 goToCart called')

  if (!product.value) {
    showSnackbar('Product not loaded', 'error')
    return
  }

  // Check if user is logged in
  if (!user.value) {
    showSnackbar('Please login to add items to cart', 'warning')
    return
  }

  const finalSize = selectedSize.value
  const finalVariety = selectedVariety.value

  if (product.value.has_sizes && !finalSize) {
    showSnackbar('Please select a size', 'warning')
    return
  }

  try {
    // Prepare variety data
    const varietyData = finalVariety ? {
      name: finalVariety.name,
      price: finalVariety.price,
      stock: finalVariety.stock,
      images: finalVariety.images || []
    } : null

    // Add to cart first
    const result = await cartStore.addToCart(
      product.value.id,
      1,
      finalSize,
      finalVariety ? finalVariety.name : null,
      varietyData
    )

    // Check result properly
    if (result && result.success) {
      showSnackbar('Product added to cart!', 'success')
      animateToCart()

      // Navigate to cart after animation
      setTimeout(() => {
        router.push('/cartview')
      }, 1000)
    } else {
      const errorMessage = result?.error || 'Failed to add to cart'
      throw new Error(errorMessage)
    }

  } catch (err) {
    console.error('❌ goToCart error:', err)

    // Safely get error message
    let errorMessage = 'Failed to add to cart: '
    if (err && err.message) {
      errorMessage += err.message
    } else if (err && typeof err === 'string') {
      errorMessage += err
    } else {
      errorMessage += 'Unknown error occurred'
    }

    showSnackbar(errorMessage, 'error')
  }
}

// Rest of functions
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

const goToShop = (shopId) => {
  router.push(`/shop/${shopId}`)
}

const goToChat = () => {
  if (product.value?.shop?.owner_id) {
    router.push(`/chatview/${product.value.shop.owner_id}`)
  }
}

// for dialog selections
const previewVarietyImages = (images, index = 0) => {
  if (!images || !images.length) return
  varietyImages.value = images
  varietyPreviewIndex.value = index
  openVarietyDialog.value = true
}

// Check if current user is the shop owner
const isOwner = computed(() => {
  if (!user.value || !product.value?.shop?.owner_id) return false
  return user.value.id === product.value.shop.owner_id
})

const buyNow = () => {
  if (!product.value) {
    showSnackbar('Product not loaded', 'error')
    return
  }

  const finalSize = selectedSize.value
  const finalVariety = selectedVariety.value

  if (product.value.has_sizes && !finalSize) {
    showSnackbar('Please select a size', 'warning')
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
    quantity: 1,
    size: finalSize,
    variety: finalVariety ? finalVariety.name : null,
    varietyData: finalVariety,
    varietyPrice: finalVariety?.price || product.value.price,
    image: mainImage(product.value.main_img_urls),
    shop_id: product.value.shop?.id,
    product: product.value,
  }

  console.log('🛒 Navigating to checkout with item:', item)

  router.push({
    name: 'purchaseview',
    query: {
      productId: product.value.id,
      fromProduct: 'true',
      variety: finalVariety ? finalVariety.name : null,
      size: finalSize,
    },
    state: {
      items: [item],
      shopId: product.value.shop.id,
      fromCart: false
    }
  })
}

// Get variety image for display
const getVarietyImage = (variety) => {
  console.log('🖼️ Getting variety image for:', variety)
  if (variety.images && variety.images.length) {
    return variety.images[0]
  }
  if (variety.main_img_urls && variety.main_img_urls.length) {
    return Array.isArray(variety.main_img_urls) ? variety.main_img_urls[0] : variety.main_img_urls
  }
  return mainImage(product.value?.main_img_urls)
}

// Select main product (deselect variety)
const selectMainProduct = () => {
  selectedVariety.value = null
  console.log('🔘 Main product selected')
}

// Check if variety is selected
const isVarietySelected = (variety) => {
  return selectedVariety.value && selectedVariety.value.name === variety.name
}

// Increment quantity in dialog
const incrementQuantity = () => {
  if (dialogQuantity.value < dialogDisplayStock.value) {
    dialogQuantity.value++
  }
}

// Decrement quantity in dialog
const decrementQuantity = () => {
  if (dialogQuantity.value > 1) {
    dialogQuantity.value--
  }
}

// Close dialog and reset values
const closeAddToCartDialog = () => {
  showAddToCartDialog.value = false
  dialogQuantity.value = 1
}
</script>

<template>
  <v-app>
    <VueEasyLightbox />

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
    <v-app-bar class="app-bar" color="#438fda" dark flat>
      <v-btn icon @click="router.back()">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="top-text"><strong>Product Details</strong></v-toolbar-title>
      <v-spacer />
      <v-btn icon ref="cartIconRef" @click="router.push('/cartview')" :disabled="isAnimating">
        <v-badge v-if="cartStore.count" :content="cartStore.count" color="red" offset-x="-7" offset-y="-3">
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
                @click="((previewIndex = index), (openImageDialog = true))"
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

        <!-- Image Lightbox for Product Images -->
        <VueEasyLightbox
          v-if="openImageDialog"
          :visible="openImageDialog"
          :imgs="product.main_img_urls"
          :index="previewIndex"
          @hide="openImageDialog = false"
        />

        <!-- Variety Image Lightbox -->
        <VueEasyLightbox
          v-if="openVarietyDialog"
          :visible="openVarietyDialog"
          :imgs="varietyImages"
          :index="varietyPreviewIndex"
          @hide="openVarietyDialog = false"
        />

        <!-- Review Image Lightbox -->
        <v-dialog v-model="openImageDialog" max-width="800px" @click:outside="openImageDialog = false">
          <v-card>
            <v-card-actions class="d-flex justify-end pa-2">
              <v-btn icon @click="openImageDialog = false">
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </v-card-actions>
            <v-card-text class="text-center pa-0">
              <v-img
                :src="currentImage"
                max-height="600"
                contain
                class="rounded-b"
              />
              <div v-if="!currentImage" class="text-center py-8">
                <v-icon size="64" color="grey-lighten-2">mdi-image-off</v-icon>
                <div class="text-h6 mt-4 text-grey">Image not available</div>
              </div>
            </v-card-text>
          </v-card>
        </v-dialog>

        <!-- Add to Cart Dialog -->
        <v-dialog v-model="showAddToCartDialog" max-width="500px" @click:outside="closeAddToCartDialog">
          <v-card class="pa-4">
            <v-card-title class="d-flex justify-space-between align-center">
              <h3>Add to Cart</h3>
              <v-btn icon @click="closeAddToCartDialog">
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </v-card-title>

            <v-card-text>
              <!-- Product Info -->
              <div class="mb-4 d-flex align-center">
                <v-avatar size="80" class="mr-3">
                  <v-img :src="mainImage(product.main_img_urls)" />
                </v-avatar>
                <div>
                  <h4 class="mb-1">{{ product.prod_name }}</h4>
                  <div class="text-primary font-weight-bold">
                    ₱{{ dialogSelectedVariety?.price || product.price }}
                  </div>
                  <div class="text-caption text-grey">
                    Stock: {{ dialogDisplayStock }} available
                  </div>
                </div>
              </div>

              <!-- Size Selection -->
              <div v-if="product.sizes && product.sizes.length" class="mb-4">
                <p class="font-weight-medium mb-2">Select Size:</p>
                <v-btn-toggle v-model="dialogSelectedSize" mandatory class="flex-wrap" style="gap: 6px">
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

              <!-- Variety Selection -->
              <div v-if="product.varieties && product.varieties.length" class="mb-4">
                <p class="font-weight-medium mb-2">Select Variety:</p>
                <div class="varieties-list">
                  <!-- Main Product Option -->
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
                        <div class="text-caption text-grey">₱{{ product.price }}</div>
                      </div>
                      <v-icon v-if="!dialogSelectedVariety" color="primary">
                        mdi-check-circle
                      </v-icon>
                    </v-card-text>
                  </v-card>

                  <!-- Varieties -->
                  <v-card
                    v-for="variety in product.varieties"
                    :key="variety.name"
                    class="mb-2"
                    :class="{ 'option-selected': dialogSelectedVariety?.name === variety.name }"
                    @click="dialogSelectedVariety = variety"
                    variant="outlined"
                    :disabled="variety.stock === 0"
                  >
                    <v-card-text class="pa-3 d-flex align-center">
                      <v-avatar size="40" class="mr-3">
                        <v-img :src="getVarietyImage(variety)" />
                      </v-avatar>
                      <div class="flex-grow-1">
                        <div class="font-weight-medium">{{ variety.name }}</div>
                        <div class="text-caption text-grey">₱{{ variety.price || product.price }}</div>
                        <div class="text-caption">
                          <v-chip v-if="variety.stock === 0" size="x-small" color="red">
                            Out of stock
                          </v-chip>
                          <v-chip v-else-if="variety.stock < 10" size="x-small" color="orange">
                            {{ variety.stock }} left
                          </v-chip>
                        </div>
                      </div>
                      <v-icon v-if="dialogSelectedVariety?.name === variety.name" color="primary">
                        mdi-check-circle
                      </v-icon>
                    </v-card-text>
                  </v-card>
                </div>
              </div>

              <!-- Quantity Selector -->
              <div class="mb-4">
                <p class="font-weight-medium mb-2">Quantity:</p>
                <div class="d-flex align-center">
                  <v-btn icon @click="decrementQuantity" :disabled="dialogQuantity <= 1">
                    <v-icon>mdi-minus</v-icon>
                  </v-btn>
                  <span class="mx-4 font-weight-bold">{{ dialogQuantity }}</span>
                  <v-btn icon @click="incrementQuantity" :disabled="dialogQuantity >= dialogDisplayStock">
                    <v-icon>mdi-plus</v-icon>
                  </v-btn>
                  <span class="ml-4 text-caption text-grey">
                    {{ dialogDisplayStock }} available
                  </span>
                </div>
              </div>

              <!-- Total Price -->
              <div class="total-price mb-4 pa-3 rounded-lg" style="background: #f8f9fa;">
                <div class="d-flex justify-space-between">
                  <span>Total:</span>
                  <span class="font-weight-bold text-primary">
                    ₱{{ ((dialogSelectedVariety?.price || product.price) * dialogQuantity).toFixed(2) }}
                  </span>
                </div>
              </div>
            </v-card-text>

            <v-card-actions>
              <v-spacer />
              <v-btn @click="closeAddToCartDialog" variant="outlined" class="mr-2">
                Cancel
              </v-btn>
              <v-btn
                color="primary"
                @click="confirmAddToCart"
                :disabled="dialogDisplayStock === 0 || (product.has_sizes && !dialogSelectedSize)"
                :loading="isAnimating"
              >
                Add to Cart
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Product Info -->
        <div class="product-info mb-4">
          <h2 class="product-title mb-2">{{ product.prod_name }}</h2>
          <p class="product-price mb-2">₱{{ displayPrice }}</p>

          <!-- Selection Options -->
          <div class="selection-options mb-4">
            <!-- Main Product Option -->
            <div class="option-section mb-4">
              <p class="font-weight-medium mb-2">Choose your option:</p>

              <!-- Main Product Card -->
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
                    <div class="d-flex justify-space-between align-center">
                      <span class="font-weight-medium">Standard Product</span>
                      <v-chip v-if="product.stock === 0" size="small" color="red">
                        Out of stock
                      </v-chip>
                      <v-chip v-else-if="product.stock < 10" size="small" color="orange">
                        {{ product.stock }} left
                      </v-chip>
                    </div>
                    <div class="d-flex justify-space-between align-center mt-1">
                      <span class="text-caption text-grey">Base option</span>
                      <span class="font-weight-medium text-primary">₱{{ product.price }}</span>
                    </div>
                  </div>
                  <v-icon
                    v-if="isMainProductSelected"
                    color="primary"
                    class="ml-2"
                  >
                    mdi-check-circle
                  </v-icon>
                </v-card-text>
              </v-card>

              <!-- OR Separator - Only show if there are varieties -->
              <div v-if="product.varieties && product.varieties.length" class="text-center my-3">
                <v-divider />
                <span class="text-caption text-grey bg-white px-3">OR</span>
                <v-divider />
              </div>
            </div>

            <!-- Varieties Section -->
            <div v-if="product.varieties && product.varieties.length" class="varieties-section">
              <p class="font-weight-medium mb-2">Available Varieties:</p>

              <div class="varieties-grid">
                <v-card
                  v-for="variety in product.varieties"
                  :key="variety.name"
                  class="variety-card"
                  :class="{ 'variety-card--selected': isVarietySelected(variety) }"
                  @click="selectedVariety = variety"
                  variant="outlined"
                  :disabled="variety.stock === 0"
                >
                  <v-card-text class="pa-3">
                    <div class="d-flex align-center mb-2">
                      <v-avatar size="48" class="mr-3">
                        <v-img
                          :src="getVarietyImage(variety)"
                          @click.stop="previewVarietyImages(variety.images)"
                          style="cursor: zoom-in"
                        />
                      </v-avatar>
                      <div class="flex-grow-1">
                        <div class="d-flex justify-space-between align-center">
                          <span class="font-weight-medium">{{ variety.name }}</span>
                          <v-icon
                            v-if="isVarietySelected(variety)"
                            color="primary"
                            size="20"
                          >
                            mdi-check-circle
                          </v-icon>
                        </div>
                        <div class="d-flex justify-space-between align-center mt-1">
                          <span class="text-caption text-grey">Special variant</span>
                          <span class="font-weight-medium text-primary">
                            ₱{{ variety.price || product.price }}
                          </span>
                        </div>
                      </div>
                    </div>

                    <!-- Stock indicator -->
                    <div class="d-flex justify-end">
                      <v-chip
                        v-if="variety.stock === 0"
                        size="x-small"
                        color="red"
                      >
                        Out of stock
                      </v-chip>
                      <v-chip
                        v-else-if="variety.stock < 10"
                        size="x-small"
                        color="orange"
                      >
                        {{ variety.stock }} left
                      </v-chip>
                      <v-chip
                        v-else
                        size="x-small"
                        color="green"
                      >
                        In stock
                      </v-chip>
                    </div>
                  </v-card-text>
                </v-card>
              </div>
            </div>
          </div>

          <!-- Sizes -->
          <div v-if="product.sizes && product.sizes.length" class="mb-3">
            <p class="font-weight-medium mb-1">Size:</p>
            <v-btn-toggle v-model="selectedSize" mandatory class="flex-wrap" style="gap: 6px">
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

          <!-- Selection Summary -->
          <div class="selection-summary mb-3 pa-3 rounded-lg" style="background: #f8f9fa;">
            <p class="text-caption text-grey mb-1">Your selection:</p>
            <p class="font-weight-medium mb-1">
              {{ selectedVariety ? selectedVariety.name : 'Standard Product' }}
              <span v-if="selectedSize"> • {{ selectedSize }}</span>
            </p>
            <p class="text-caption text-grey">
              Price: <span class="font-weight-medium text-primary">₱{{ displayPrice }}</span>
              • Stock: <span class="font-weight-medium">{{ displayStock }} available</span>
            </p>
          </div>

          <p class="product-description mb-2">{{ product.prod_description }}</p>
          <p class="product-meta">Total Sold: {{ product.sold }}</p>
        </div>

        <!-- Shop Info -->
        <v-card
          v-if="product.shop"
          flat
          class="shop-card pa-2 d-flex align-center mb-4"
          @click="goToShop(product.shop.id)"
          style="cursor: pointer"
        >
          <v-avatar size="48">
            <v-img :src="product.shop.logo_url || '/placeholder.png'" />
          </v-avatar>
          <div class="shop-info ml-3">
            <p class="shop-name">{{ product.shop.business_name }}</p>
          </div>
        </v-card>

        <!-- Reviews Section -->
        <v-card class="reviews-section mb-4" elevation="1">
          <v-card-title class="d-flex align-center">
            <v-icon left color="amber">mdi-star</v-icon>
            Customer Reviews
            <v-chip v-if="reviewStats.total_reviews > 0" color="primary" size="small" class="ml-2">
              {{ reviewStats.total_reviews }}
            </v-chip>
          </v-card-title>

          <v-card-text>
            <!-- Review Statistics -->
            <div v-if="reviewStats.total_reviews > 0" class="review-stats mb-6">
              <v-row>
                <v-col cols="12" md="4" class="text-center">
                  <div class="average-rating mb-2">
                    <div class="text-h3 text-primary font-weight-bold">
                      {{ reviewStats.average_rating.toFixed(1) }}
                    </div>
                    <v-rating
                      :model-value="reviewStats.average_rating"
                      readonly
                      size="small"
                      color="amber"
                      class="my-2"
                    />
                    <div class="text-caption text-grey">
                      {{ reviewStats.total_reviews }} review{{ reviewStats.total_reviews !== 1 ? 's' : '' }}
                    </div>
                  </div>
                </v-col>

                <v-col cols="12" md="8">
                  <div class="rating-distribution">
                    <div v-for="rating in [5,4,3,2,1]" :key="rating" class="d-flex align-center mb-2">
                      <span class="text-caption mr-2" style="min-width: 20px">{{ rating }}</span>
                      <v-icon color="amber" size="small">mdi-star</v-icon>
                      <v-progress-linear
                        :model-value="(reviewStats.rating_distribution[rating] / reviewStats.total_reviews) * 100"
                        color="amber"
                        height="8"
                        class="mx-2"
                        rounded
                      />
                      <span class="text-caption text-grey" style="min-width: 40px">
                        {{ reviewStats.rating_distribution[rating] }}
                      </span>
                    </div>
                  </div>
                </v-col>
              </v-row>
            </div>

            <!-- Review Filters -->
            <div class="review-filters mb-4">
              <v-row class="align-center">
                <v-col cols="12" sm="6">
                  <v-select
                    v-model="reviewFilter"
                    :items="[
                      { title: 'All Ratings', value: 'all' },
                      { title: '5 Stars', value: '5' },
                      { title: '4 Stars', value: '4' },
                      { title: '3 Stars', value: '3' },
                      { title: '2 Stars', value: '2' },
                      { title: '1 Star', value: '1' }
                    ]"
                    item-title="title"
                    item-value="value"
                    density="compact"
                    variant="outlined"
                    hide-details
                    label="Filter by rating"
                  />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-select
                    v-model="reviewSort"
                    :items="[
                      { title: 'Latest', value: 'latest' },
                      { title: 'Highest Rating', value: 'highest' },
                      { title: 'Lowest Rating', value: 'lowest' },
                      { title: 'Most Liked', value: 'most_liked' }
                    ]"
                    item-title="title"
                    item-value="value"
                    density="compact"
                    variant="outlined"
                    hide-details
                    label="Sort by"
                  />
                </v-col>
              </v-row>
            </div>

            <!-- Reviews List -->
            <div v-if="reviewsLoading" class="text-center py-8">
              <v-progress-circular indeterminate color="primary"></v-progress-circular>
              <div class="text-body-2 mt-2">Loading reviews...</div>
            </div>

            <div v-else-if="filteredReviews.length === 0" class="text-center py-8">
              <v-icon size="64" color="grey-lighten-2">mdi-comment-outline</v-icon>
              <div class="text-h6 mt-4 text-grey">No reviews yet</div>
              <div class="text-body-2 text-grey">Be the first to leave a review!</div>
            </div>

            <div v-else class="reviews-list">
              <v-card
                v-for="review in filteredReviews"
                :key="review.id"
                class="review-card mb-4"
                variant="outlined"
              >
                <v-card-text class="pa-4">
                  <div class="d-flex align-start">
                    <!-- User Avatar -->
                    <v-avatar size="48" class="mr-4">
                      <v-img
                        :src="review.user_avatar || '/default-avatar.png'"
                        alt="User avatar"
                      />
                    </v-avatar>

                    <!-- Review Content -->
                    <div class="flex-grow-1">
                      <div class="d-flex align-center flex-wrap mb-2">
                        <div class="font-weight-medium mr-2">{{ review.user_name }}</div>
                        <v-chip
                          v-if="review.is_verified"
                          size="x-small"
                          color="green"
                          class="ml-1"
                        >
                          <v-icon left small>mdi-check</v-icon>
                          Verified
                        </v-chip>
                        <v-spacer></v-spacer>
                        <span class="text-caption text-grey">
                          {{ formatDate(review.created_at) }}
                        </span>
                      </div>

                      <!-- Rating -->
                      <v-rating
                        :model-value="review.rating"
                        readonly
                        size="small"
                        color="amber"
                        density="compact"
                        class="mb-2"
                      />

                      <!-- Comment -->
                      <div class="text-body-1 mb-3">{{ review.comment }}</div>

                      <!-- Photos -->
                      <div v-if="review.photos && review.photos.length > 0" class="mb-3">
                        <div class="text-caption text-grey mb-2">
                          {{ review.photos.length }} photo{{ review.photos.length !== 1 ? 's' : '' }}
                        </div>
                        <v-row dense>
                          <v-col
                            v-for="(photo, index) in review.photos"
                            :key="index"
                            cols="4"
                            sm="3"
                            md="2"
                          >
                            <v-img
                              :src="photo"
                              :alt="`Review photo ${index + 1}`"
                              aspect-ratio="1"
                              cover
                              class="rounded-lg cursor-pointer"
                              @click="viewReviewImage(photo)"
                            />
                          </v-col>
                        </v-row>
                      </div>
                    </div>
                  </div>
                </v-card-text>
              </v-card>
            </div>
          </v-card-text>
        </v-card>
      </v-sheet>
    </v-main>

    <!-- Bottom Nav -->
    <v-bottom-navigation class="bottom-nav" height="65" fixed>
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

          <!-- Buy Now -->
          <v-col cols="4" class="pa-0">
            <v-btn
              block
              class="bottom-btn buy-now-btn"
              color="#438fda"
              @click="buyNow()"
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
.app-bar {
  padding-top: 20px;
}
.product-page {
  padding: 0;
  margin: 0;
  background-color: #f5f7fa;
  min-height: 100vh;
  padding-bottom: 70px;
  padding-top: 60px;
}

/* New styles for variety selection */
.option-card {
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;
}

.option-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.option-card--selected {
  border-color: #438fda !important;
  background-color: #e8f3ff;
}

.option-card:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.varieties-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.variety-card {
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;
}

.variety-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.variety-card--selected {
  border-color: #438fda !important;
  background-color: #e8f3ff;
}

.variety-card:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Dialog styles */
.option-selected {
  border-color: #438fda !important;
  background-color: #e8f3ff;
}

.total-price {
  border-left: 4px solid #438fda;
}

.selection-summary {
  border-left: 4px solid #438fda;
}

/* Review styles */
.review-card {
  transition: all 0.3s ease;
}

.review-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.average-rating {
  padding: 16px;
  background: #f8f9fa;
  border-radius: 12px;
}

.rating-distribution {
  padding: 8px 0;
}

.review-filters {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 8px;
}

/* Animation styles */
.fly-to-cart {
  position: fixed;
  z-index: 10000;
  pointer-events: none;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  transition: all 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

.cart-bounce {
  animation: cartBounce 0.4s ease;
}

@keyframes cartBounce {
  0% { transform: scale(1); }
  30% { transform: scale(1.3); }
  60% { transform: scale(0.9); }
  100% { transform: scale(1); }
}

/* Rest of your existing CSS */
.top-text {
  font-size: 16px;
  font-weight: 400;
  margin-left: -5px;
}

.product-sheet {
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  border-radius: 0;
  box-shadow: none;
}

.product-img {
  width: 100%;
  border-radius: 8px;
  object-fit: contain;
  margin: 16px 0;
}

.product-info {
  padding: 0 16px;
}

.product-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #111827;
}

.product-price {
  font-size: 1.1rem;
  font-weight: 700;
  color: #da2121;
}

.product-description {
  font-size: 0.9rem;
  color: #4b5563;
}

.product-meta {
  font-size: 0.85rem;
  color: #6b7280;
}

.shop-card {
  margin: 0 16px;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.shop-name {
  font-weight: 600;
  font-size: 1rem;
}

.bottom-nav {
  position: fixed !important;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  background-color: #ffffff !important;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
  border-top: 1px solid #eee;
}

.bottom-btn {
  height: 65px !important;
  border-radius: 0 !important;
}

.bottom-btn:hover {
  transform: scale(1.03);
}

.chat-now-btn,
.cart-btn {
  background-color: #4caf50;
  color: white;
  font-size: 12px;
}

.buy-now-btn {
  background-color: #438fda;
  color: white;
  font-size: 13px;
}

/* Responsive */
@media (max-width: 768px) {
  .varieties-grid {
    grid-template-columns: 1fr;
  }

  .review-stats .v-row {
    flex-direction: column;
  }
}

@media (max-width: 600px) {
  .product-title { font-size: 1rem; }
  .product-price { font-size: 0.95rem; }
  .product-description { font-size: 0.8rem; }
  .product-meta { font-size: 0.7rem; }
  .shop-name { font-size: 0.9rem; }
  .bottom-btn { font-size: 0.8rem; }
}
</style>
