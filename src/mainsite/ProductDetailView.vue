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

// Fetch product + shop
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

    console.log('Product loaded:', product.value)
  } catch (e) {
    error.value = e.message || 'Failed to load product'
    console.error('Error loading product:', e)
  } finally {
    loading.value = false
  }
})

// Get price based on variety selection - IMPROVED
const displayPrice = computed(() => {
  if (!product.value) return 0
  
  // If variety is selected and has its own price, use variety price
  if (selectedVariety.value && selectedVariety.value.price !== undefined && selectedVariety.value.price !== null) {
    return selectedVariety.value.price
  }
  
  // Otherwise use product base price
  return product.value.price
})

// Get stock based on variety selection - IMPROVED
const displayStock = computed(() => {
  if (!product.value) return 0
  
  console.log('📊 Stock check - selected variety:', selectedVariety.value)
  
  // If variety is selected and has its own stock, use variety stock
  if (selectedVariety.value && selectedVariety.value.stock !== undefined && selectedVariety.value.stock !== null) {
    console.log('📦 Using variety stock:', selectedVariety.value.stock)
    return selectedVariety.value.stock
  }
  
  // Otherwise use product base stock
  console.log('📦 Using base product stock:', product.value.stock || 0)
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

// Check if add to cart/buy now is disabled - IMPROVED
const isActionDisabled = computed(() => {
  if (!product.value) return true
  if (displayStock.value === 0) {
    console.log('❌ Action disabled: No stock available')
    return true
  }
  if (product.value.has_sizes && !selectedSize.value) {
    console.log('❌ Action disabled: Size not selected')
    return true
  }
  console.log('✅ Action enabled')
  return false
})

// IMPROVED VARIETY CART FUNCTION
const addToCartDirect = async (cartItem) => {
  try {
    console.log('🛒 addToCartDirect called with:', cartItem)
    
    // Get current user
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

    console.log('👤 Adding to cart for user:', currentUser.id)

    // Prepare variety data for storage - IMPROVED
    const varietyData = cartItem.varietyData ? {
      name: cartItem.varietyData.name,
      price: cartItem.varietyData.price,
      stock: cartItem.varietyData.stock,
      images: cartItem.varietyData.images || []
    } : null

    console.log('📦 Prepared variety_data:', varietyData)

    // Build query for checking existing items
    let query = supabase
      .from('cart_items')
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('product_id', cartItem.productId)

    // Add size condition if size exists
    if (cartItem.selectedSize) {
      query = query.eq('selected_size', cartItem.selectedSize)
    } else {
      query = query.is('selected_size', null)
    }

    // Add variety condition if variety exists
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

    console.log('📊 Existing items found:', existingItems?.length || 0)

    if (existingItems && existingItems.length > 0) {
      // Update quantity if item exists
      const existingItem = existingItems[0]
      const newQuantity = existingItem.quantity + cartItem.quantity

      console.log('🔄 Updating existing item:', existingItem.id, 'new quantity:', newQuantity)

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
      
      console.log('✅ Cart item quantity updated')
    } else {
      // Insert new item
      console.log('➕ Inserting new cart item')
      
      const insertData = {
        user_id: currentUser.id,
        product_id: cartItem.productId,
        quantity: cartItem.quantity,
        selected_size: cartItem.selectedSize,
        selected_variety: cartItem.selectedVariety,
        variety_data: varietyData
      }

      console.log('📝 Insert data:', insertData)

      const { data, error: insertError } = await supabase
        .from('cart_items')
        .insert(insertData)
        .select()

      if (insertError) {
        console.error('❌ Error inserting cart item:', insertError)
        console.error('Insert error details:', insertError)
        throw insertError
      }
      
      console.log('✅ New cart item added:', data)
    }

    // Refresh cart count - improved error handling
    try {
      if (cart && typeof cart.loadCart === 'function') {
        await cart.loadCart()
        console.log('🔄 Cart store refreshed')
      } else {
        console.log('⚠️ Cart store or loadCart method not available')
      }
    } catch (cartError) {
      console.warn('⚠️ Could not refresh cart store:', cartError)
      // Continue anyway since the cart item was added successfully
    }
    
    console.log('🎉 Cart operation completed successfully')
    return true
    
  } catch (error) {
    console.error('❌ Error in addToCartDirect:', error)
    throw error
  }
}

// IMPROVED FLY TO CART ANIMATION
const animateToCart = () => {
  if (isAnimating.value) return
  
  isAnimating.value = true
  
  // Get the product image element
  const productImg = productImgRef.value?.$el || productImgRef.value
  const cartIcon = cartIconRef.value?.$el || cartIconRef.value
  
  if (!productImg || !cartIcon) {
    console.log('❌ Animation elements not found')
    isAnimating.value = false
    return
  }

  // Get positions
  const productRect = productImg.getBoundingClientRect()
  const cartRect = cartIcon.getBoundingClientRect()

  // Create flying clone
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

  // Force reflow
  void clone.offsetWidth

  // Animate to cart
  const finalLeft = cartRect.left + cartRect.width / 2 - 15
  const finalTop = cartRect.top + cartRect.height / 2 - 15

  clone.style.left = `${finalLeft}px`
  clone.style.top = `${finalTop}px`
  clone.style.width = '30px'
  clone.style.height = '30px'
  clone.style.opacity = '0.5'
  clone.style.transform = 'scale(0.8) rotate(360deg)'

  // Bounce cart icon
  cartIcon.style.transform = 'scale(1.2)'
  cartIcon.style.transition = 'transform 0.3s ease'

  // Clean up
  setTimeout(() => {
    clone.remove()
    cartIcon.style.transform = 'scale(1)'
    
    // Add secondary bounce
    setTimeout(() => {
      cartIcon.style.transform = 'scale(1.1)'
      setTimeout(() => {
        cartIcon.style.transform = 'scale(1)'
        isAnimating.value = false
      }, 150)
    }, 50)
  }, 800)
}

// IMPROVED CONFIRM ADD TO CART FOR VARIETIES
const confirmAddToCart = async () => {
  console.log('🛒 confirmAddToCart called')
  
  if (!product.value) {
    console.log('❌ Product not loaded')
    alert('Product not loaded')
    return
  }

  // Use dialog selections if available, otherwise use main selections
  const finalSize = dialogSelectedSize.value || selectedSize.value
  const finalVariety = dialogSelectedVariety.value || selectedVariety.value

  console.log('📋 Selection details:', {
    finalSize,
    finalVariety: finalVariety ? finalVariety : 'None',
    productHasSizes: product.value.has_sizes,
    quantity: quantity.value,
    displayStock: displayStock.value
  })

  // Validation - only sizes are mandatory if product has sizes
  if (product.value.has_sizes && !finalSize) {
    console.log('❌ Size selection required')
    alert('Please select a size')
    return
  }

  // Check stock - FIXED: use displayStock.value
  const availableStock = displayStock.value
  console.log('📦 Stock check:', { availableStock, quantity: quantity.value })
  
  if (quantity.value > availableStock) {
    console.log('❌ Not enough stock')
    alert(`Only ${availableStock} items available in stock`)
    return
  }

  try {
    // Prepare cart item with variety information
    const cartItem = {
      productId: product.value.id,
      quantity: quantity.value,
      selectedSize: finalSize,
      selectedVariety: finalVariety ? finalVariety.name : null,
      varietyData: finalVariety,
    }

    console.log('📦 Cart item prepared:', cartItem)

    // Use direct cart function
    await addToCartDirect(cartItem)
    
    console.log('✅ Successfully added to cart')
    
    // Show success feedback with animation
    animateToCart()
    showAddToCart.value = false
    quantity.value = 1
    
    // Reset dialog selections
    dialogSelectedSize.value = null
    dialogSelectedVariety.value = null
    
  } catch (err) {
    console.error('❌ confirmAddToCart error:', err)
    alert('❌ Failed to add to cart: ' + (err.message || 'Unknown error'))
  }
}

// IMPROVED GO TO CART FUNCTION FOR VARIETIES
const goToCart = async () => {
  console.log('🛒 goToCart called')
  
  if (!product.value) {
    alert('Product not loaded')
    return
  }
  
  try {
    const finalSize = selectedSize.value
    const finalVariety = selectedVariety.value

    // Validation - only sizes are mandatory
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

    console.log('📦 Cart item prepared (goToCart):', cartItem)

    // Use direct cart function
    await addToCartDirect(cartItem)
    
    console.log('✅ Added to cart, navigating to cart view')
    
    // Show animation before navigating
    animateToCart()
    
    // Small delay to let animation complete before navigation
    setTimeout(() => {
      router.push('/cartview')
    }, 1000)
    
  } catch (err) {
    console.error('❌ goToCart error:', err)
    alert('Failed to add to cart: ' + (err.message || 'Unknown error'))
  }
}

// Rest of your functions remain mostly the same...
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
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(window.location.href)
    alert('Product link copied to clipboard!')
  }
}

// routes
const goToShop = (shopId) => {
  router.push(`/shop/${shopId}`)
}

const goToChat = () => {
  if (product.value?.shop?.owner_id) {
    router.push(`/chatview/${product.value.shop.owner_id}`)
  }
}

//sample rating
const reviews = ref([
  {
    id: 1,
    user_name: 'Jane Dela Cruz',
    user_avatar: '/user1.jpg',
    shop_rating: 4.5,
    product_rating: 5,
    message: 'Great quality! The product arrived fast and matches the description.',
    likes: 12,
    dislikes: 1,
  },
  {
    id: 2,
    user_name: 'Mark Santos',
    user_avatar: '/user2.jpg',
    shop_rating: 4,
    product_rating: 4,
    message: 'Good item, but the packaging could be better.',
    likes: 6,
    dislikes: 0,
  },
])

//watcher
watch(showAddToCart, (val) => {
  if (val) {
    // when dialog opens, preserve the last selected
    dialogSelectedSize.value = selectedSize.value
    dialogSelectedVariety.value = selectedVariety.value
  }
})

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

// Variety zoom dialog
const openVarietyDialog = ref(false)
const varietyPreviewIndex = ref(0)
const varietyImages = ref([])

const buyNow = () => {
  if (!product.value) return alert('Product not loaded')

  const finalSize = selectedSize.value
  const finalVariety = selectedVariety.value

  // Validation - only sizes are mandatory
  if (product.value.has_sizes && !finalSize) {
    alert('Please select a size')
    return
  }

  // Create proper item name with variety
  let itemName = product.value.prod_name
  if (finalVariety) {
    itemName = `${product.value.prod_name} - ${finalVariety.name}`
  }

  const item = {
    id: product.value.id,
    product_id: product.value.id,
    name: itemName, // Include variety in name
    price: finalVariety?.price || product.value.price,
    quantity: 1,
    size: finalSize,
    variety: finalVariety ? finalVariety.name : null,
    varietyData: finalVariety, // Make sure this contains the full variety object
    varietyPrice: finalVariety?.price || product.value.price, // Add this for reference
    image: mainImage(product.value.main_img_urls),
    shop_id: product.value.shop?.id,
    product: product.value
  }

  console.log('🛒 Navigating to checkout with item:', item)

  router.push({
    name: 'purchaseview',
    query: {
      productId: product.value.id,
      fromProduct: 'true',
      variety: finalVariety ? finalVariety.name : null, // Pass variety as query param
      size: finalSize // Pass size as query param
    },
    state: { 
      items: [item], 
      shopId: product.value.shop.id,
      fromCart: false 
    }
  })
}
// Get variety image for display - IMPROVED
const getVarietyImage = (variety) => {
  console.log('🖼️ Getting variety image for:', variety)
  if (variety.images && variety.images.length) {
    return variety.images[0]
  }
  // If variety has main_img_urls, use that
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

        <!-- Image Lightbox -->
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
      </v-sheet>

      <!-- Rest of your template remains the same -->
      <!-- ... (feedback section and dialog remain unchanged) ... -->
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
/* Your existing CSS plus new styles */

.app-bar{
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
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
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
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
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

/* Animation styles */
.fly-to-cart {
  position: fixed;
  z-index: 10000;
  pointer-events: none;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
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