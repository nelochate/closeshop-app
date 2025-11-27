<script setup lang="js">
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { useCartStore } from '@/stores/cart'
import VueEasyLightbox from 'vue-easy-lightbox'

console.log('useRoute:', useRoute, 'useRouter:', useRouter)
const cart = useCartStore()
const route = useRoute()
const router = useRouter()
const productId = route.params.id

const product = ref(null)
const loading = ref(true)
const error = ref(null)
const reviews = ref([])
const reviewsLoading = ref(false)

const showAddToCart = ref(false)
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

// Review filter and sort
const reviewFilter = ref('all')
const reviewSort = ref('latest')

// Image states
const currentImage = ref('')
const openVarietyDialog = ref(false)
const varietyPreviewIndex = ref(0)
const varietyImages = ref([])

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
      `
      )
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

// Load reviews for the current product - COMPLETE
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
    
    // Debug: Check if any reviews have photos
    const reviewsWithPhotos = reviews.value.filter(r => r.photos && r.photos.length > 0)
    console.log('🖼️ Reviews with photos:', reviewsWithPhotos.length)
    
    if (reviewsWithPhotos.length > 0) {
      reviewsWithPhotos.forEach(review => {
        console.log('📸 Review photos:', {
          reviewId: review.id,
          photos: review.photos
        })
      })
    }
    
  } catch (error) {
    console.error('Error loading reviews:', error)
    reviews.value = []
  } finally {
    reviewsLoading.value = false
  }
}

// Test function to check review photos in database
const checkReviewPhotosInDB = async () => {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, photos, product_id')
      .eq('product_id', productId)
      .not('photos', 'is', null)
    
    if (error) throw error
    
    console.log('🔍 Database review photos check:', data)
    
    data?.forEach(review => {
      console.log(`📊 Review ${review.id}:`, {
        photos: review.photos,
        photosType: typeof review.photos,
        isArray: Array.isArray(review.photos),
        photosLength: Array.isArray(review.photos) ? review.photos.length : 'N/A'
      })
    })
    
  } catch (error) {
    console.error('Error checking review photos:', error)
  }
}

// Test function to verify photo display
const testPhotoDisplay = () => {
  console.log('🧪 Testing photo display...')
  
  const reviewsWithPhotos = reviews.value.filter(r => r.photos && r.photos.length > 0)
  console.log(`📊 Found ${reviewsWithPhotos.length} reviews with photos`)
  
  reviewsWithPhotos.forEach((review, index) => {
    console.log(`\n📸 Review ${index + 1}:`, {
      id: review.id,
      photoCount: review.photos.length,
      photos: review.photos
    })
    
    // Test each photo URL
    review.photos.forEach((photo, photoIndex) => {
      const img = new Image()
      img.onload = () => console.log(`✅ Photo ${photoIndex + 1}: Loaded successfully`)
      img.onerror = () => console.log(`❌ Photo ${photoIndex + 1}: Failed to load - ${photo}`)
      img.src = photo
    })
  })
  
  if (reviewsWithPhotos.length === 0) {
    console.log('ℹ️ No reviews with photos found. Make sure:')
    console.log('1. Reviews have photos array in database')
    console.log('2. Photos are valid URLs or base64 strings')
    console.log('3. Product has reviews with photos')
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

// Like a review
const likeReview = async (reviewId) => {
  try {
    const { error } = await supabase.rpc('increment_review_likes', {
      review_uuid: reviewId
    })
    
    if (error) throw error
    
    // Update local state
    const reviewIndex = reviews.value.findIndex(r => r.id === reviewId)
    if (reviewIndex !== -1) {
      reviews.value[reviewIndex].likes = (reviews.value[reviewIndex].likes || 0) + 1
    }
  } catch (error) {
    console.error('Error liking review:', error)
  }
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

// Handle image loading errors
const handleImageError = (imageUrl, index) => {
  console.error('❌ Failed to load review image:', {
    imageUrl,
    index,
    reviewId: reviews.value.find(r => r.photos?.includes(imageUrl))?.id
  })
}

// Handle lightbox image errors
const handleLightboxImageError = () => {
  console.error('❌ Failed to load image in lightbox:', currentImage.value)
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

// IMPROVED VARIETY CART FUNCTION
const addToCartDirect = async (cartItem) => {
  try {
    console.log('🛒 addToCartDirect called with:', cartItem)
    
    const { data: userData, error: userError } = await supabase.auth.getUser()
    
    if (userError) {
      console.error('❌ User auth error:', userError)
      throw userError
    }
    
    const currentUser = userData?.user
    
    if (!currentUser) {
      console.log('❌ No user logged in')
      throw new Error('Please login to add items to cart')
    }

    const varietyData = cartItem.varietyData ? {
      name: cartItem.varietyData.name,
      price: cartItem.varietyData.price,
      stock: cartItem.varietyData.stock,
      images: cartItem.varietyData.images || []
    } : null

    // Build query for checking existing items
    let query = supabase
      .from('cart_items')
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('product_id', cartItem.productId)

    if (cartItem.selectedSize) {
      query = query.eq('selected_size', cartItem.selectedSize)
    } else {
      query = query.is('selected_size', null)
    }

    if (cartItem.selectedVariety) {
      query = query.eq('selected_variety', cartItem.selectedVariety)
    } else {
      query = query.is('selected_variety', null)
    }

    const { data: existingItems, error: checkError } = await query

    if (checkError) {
      console.error('❌ Error checking existing items:', checkError)
      throw checkError
    }

    if (existingItems && existingItems.length > 0) {
      const existingItem = existingItems[0]
      const newQuantity = existingItem.quantity + cartItem.quantity

      const { error: updateError } = await supabase
        .from('cart_items')
        .update({ 
          quantity: newQuantity,
          variety_data: varietyData 
        })
        .eq('id', existingItem.id)

      if (updateError) {
        console.error('❌ Error updating cart item:', updateError)
        throw updateError
      }
    } else {
      const insertData = {
        user_id: currentUser.id,
        product_id: cartItem.productId,
        quantity: cartItem.quantity,
        selected_size: cartItem.selectedSize,
        selected_variety: cartItem.selectedVariety,
        variety_data: varietyData
      }

      const { data, error: insertError } = await supabase
        .from('cart_items')
        .insert(insertData)
        .select()

      if (insertError) {
        console.error('❌ Error inserting cart item:', insertError)
        throw insertError
      }
    }

    // Refresh cart count
    try {
      if (cart && typeof cart.loadCart === 'function') {
        await cart.loadCart()
      }
    } catch (cartError) {
      console.warn('⚠️ Could not refresh cart store:', cartError)
    }
    
    return true
    
  } catch (error) {
    console.error('❌ Error in addToCartDirect:', error)
    throw error
  }
}

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

// CONFIRM ADD TO CART FOR VARIETIES
const confirmAddToCart = async () => {
  console.log('🛒 confirmAddToCart called')
  
  if (!product.value) {
    console.log('❌ Product not loaded')
    alert('Product not loaded')
    return
  }

  const finalSize = dialogSelectedSize.value || selectedSize.value
  const finalVariety = dialogSelectedVariety.value || selectedVariety.value

  if (product.value.has_sizes && !finalSize) {
    alert('Please select a size')
    return
  }

  const availableStock = displayStock.value
  if (quantity.value > availableStock) {
    alert(`Only ${availableStock} items available in stock`)
    return
  }

  try {
    const cartItem = {
      productId: product.value.id,
      quantity: quantity.value,
      selectedSize: finalSize,
      selectedVariety: finalVariety ? finalVariety.name : null,
      varietyData: finalVariety,
    }

    await addToCartDirect(cartItem)
    
    animateToCart()
    showAddToCart.value = false
    quantity.value = 1
    
    dialogSelectedSize.value = null
    dialogSelectedVariety.value = null
    
  } catch (err) {
    console.error('❌ confirmAddToCart error:', err)
    alert('❌ Failed to add to cart: ' + (err.message || 'Unknown error'))
  }
}

// GO TO CART FUNCTION FOR VARIETIES
const goToCart = async () => {
  console.log('🛒 goToCart called')
  
  if (!product.value) {
    alert('Product not loaded')
    return
  }
  
  try {
    const finalSize = selectedSize.value
    const finalVariety = selectedVariety.value

    if (product.value.has_sizes && !finalSize) {
      alert('Please select a size')
      return
    }

    const cartItem = {
      productId: product.value.id,
      quantity: 1,
      selectedSize: finalSize,
      selectedVariety: finalVariety ? finalVariety.name : null,
      varietyData: finalVariety,
    }

    await addToCartDirect(cartItem)
    
    animateToCart()
    
    setTimeout(() => {
      router.push('/cartview')
    }, 1000)
    
  } catch (err) {
    console.error('❌ goToCart error:', err)
    alert('Failed to add to cart: ' + (err.message || 'Unknown error'))
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
    alert('Product link copied to clipboard!')
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
  if (!product.value) return alert('Product not loaded')

  const finalSize = selectedSize.value
  const finalVariety = selectedVariety.value

  if (product.value.has_sizes && !finalSize) {
    alert('Please select a size')
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

// DEBUG: Log variety selection changes
watch(selectedVariety, (newVal) => {
  console.log('🔄 Variety selection changed:', newVal)
})

watch(selectedSize, (newVal) => {
  console.log('🔄 Size selection changed:', newVal)
})

watch(showAddToCart, (val) => {
  if (val) {
    dialogSelectedSize.value = selectedSize.value
    dialogSelectedVariety.value = selectedVariety.value
  }
})
</script>

<template>
  <v-app>
    <VueEasyLightbox />

    <!-- Top Nav -->
    <v-app-bar class="app-bar" color="#438fda" dark flat>
      <v-btn icon @click="router.back()">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="top-text"><strong>Product Details</strong></v-toolbar-title>
      <v-spacer />
      <v-btn icon ref="cartIconRef" @click="goToCart" :disabled="isAnimating">
        <v-badge v-if="cart.count" :content="cart.count" color="red" offset-x="-7" offset-y="-3">
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
                @error="handleLightboxImageError"
              />
              <div v-if="!currentImage" class="text-center py-8">
                <v-icon size="64" color="grey-lighten-2">mdi-image-off</v-icon>
                <div class="text-h6 mt-4 text-grey">Image not available</div>
              </div>
            </v-card-text>
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
            <!-- Debug Buttons -->
            <v-card-actions class="justify-end pa-0 mb-4">
              <v-btn @click="checkReviewPhotosInDB" color="secondary" size="small">
                Debug Review Photos
              </v-btn>
              <v-btn @click="testPhotoDisplay" color="primary" size="small" class="ml-2">
                Test Photo Display
              </v-btn>
            </v-card-actions>

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

                      <!-- Photos - FULLY INTEGRATED -->
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
                              @error="handleImageError(photo, index)"
                            />
                          </v-col>
                        </v-row>
                      </div>

                      <!-- Actions -->
                      <div class="d-flex align-center">
                        <v-btn
                          variant="text"
                          size="small"
                          color="grey"
                          @click="likeReview(review.id)"
                        >
                          <v-icon left small>mdi-thumb-up</v-icon>
                          Helpful ({{ review.likes || 0 }})
                        </v-btn>
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

          <!-- Add to Cart -->
          <v-col cols="4" class="pa-0">
            <v-btn 
              block 
              class="bottom-btn cart-btn" 
              color="#4caf50" 
              @click="showAddToCart = true"
              :disabled="isActionDisabled || isAnimating"
              :loading="isAnimating"
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
              {{ displayStock === 0 ? 'Out of Stock' : 'Buy Now' }}
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