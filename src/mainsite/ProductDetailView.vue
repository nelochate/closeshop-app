<script setup>
import { ref, onMounted, computed, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const route = useRoute()
const router = useRouter()
const productId = route.params.id

// State management
const product = ref(null)
const loading = ref(true)
const error = ref(null)
const cartCount = ref(0)
const isAnimating = ref(false)
const addingToCart = ref(false)

// Dialog states
const showAddToCartDialog = ref(false)
const showBuyNowDialog = ref(false)
const selectedSize = ref(null)
const selectedVariety = ref(null)
const openImageDialog = ref(false)
const previewIndex = ref(0)

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

// Image states
const openVarietyDialog = ref(false)
const varietyPreviewIndex = ref(0)
const varietyImages = ref([])

// Snackbar for notifications
const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref('success')

// User
const user = ref(null)

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

// Fetch cart count
const fetchCartCount = async () => {
  if (!user.value) {
    cartCount.value = 0
    return
  }

  try {
    const { count, error } = await supabase
      .from('cart_items')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.value.id)

    if (error) throw error
    cartCount.value = count || 0
  } catch (err) {
    console.error('Error fetching cart count:', err)
    cartCount.value = 0
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

// Show snackbar notification
const showSnackbar = (message, color = 'success') => {
  snackbarMessage.value = message
  snackbarColor.value = color
  snackbar.value = true
}

// Setup real-time product updates
const setupProductRealtimeSubscription = () => {
  if (productSubscription) {
    productSubscription.unsubscribe()
  }

  productSubscription = supabase
    .channel(`product-${productId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'products',
        filter: `id=eq.${productId}`,
      },
      (payload) => {
        console.log('🔄 Product updated in real-time:', payload)
        const updatedProduct = payload.new

        if (product.value) {
          const prevStock = product.value.stock
          const prevSold = product.value.sold

          product.value.stock = updatedProduct.stock || 0
          product.value.sold = updatedProduct.sold || 0

          if (product.value.varieties && product.value.varieties.length > 0) {
            product.value.varieties = product.value.varieties.map((variety) => {
              const updatedVariety = updatedProduct.varieties?.find((v) => v.name === variety.name)
              if (updatedVariety) {
                return { ...variety, stock: updatedVariety.stock }
              }
              return variety
            })
          }

          if (updatedProduct.stock === 0 && prevStock > 0) {
            showSnackbar('This product is now out of stock!', 'warning')
          } else if (updatedProduct.stock > 0 && prevStock === 0) {
            showSnackbar('This product is back in stock!', 'success')
          }

          if (updatedProduct.sold > prevSold) {
            const soldIncrease = updatedProduct.sold - prevSold
            showSnackbar(`🔥 ${soldIncrease} item${soldIncrease > 1 ? 's' : ''} just sold!`, 'info')
          }
        }
      },
    )
    .subscribe()

  console.log('📡 Subscribed to real-time product updates for product:', productId)
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
      .eq('id', productId)
      .single()

    if (err) throw err
    product.value = data

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
  if (selectedVariety.value && selectedVariety.value.stock !== undefined) {
    return selectedVariety.value.stock
  }
  return product.value.stock || 0
})

const dialogDisplayStock = computed(() => {
  if (!product.value) return 0
  if (dialogSelectedVariety.value && dialogSelectedVariety.value.stock !== undefined) {
    return dialogSelectedVariety.value.stock
  }
  return product.value.stock || 0
})

const buyNowDisplayStock = computed(() => {
  if (!product.value) return 0
  if (buyNowSelectedVariety.value && buyNowSelectedVariety.value.stock !== undefined) {
    return buyNowSelectedVariety.value.stock
  }
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

const goToChat = () => {
  if (product.value?.shop?.owner_id) {
    router.push(`/chatview/${product.value.shop.owner_id}`)
  }
}

const selectMainProduct = () => {
  selectedVariety.value = null
}

const previewVarietyImages = (images, index = 0) => {
  if (!images || !images.length) return
  varietyImages.value = images
  varietyPreviewIndex.value = index
  openVarietyDialog.value = true
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
          stock: finalVariety.stock,
          images: finalVariety.images || [],
        }
      : null

    const { data, error } = await supabase
      .from('cart_items')
      .insert({
        user_id: user.value.id,
        product_id: product.value.id,
        quantity: finalQuantity,
        selected_size: finalSize,
        selected_variety: finalVariety ? finalVariety.name : null,
        variety_data: varietyData,
      })
      .select()
      .single()

    if (error) throw error

    showSnackbar('Product added to cart successfully!', 'success')
    animateToCart()
    closeAddToCartDialog()
    await fetchCartCount()
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

const cleanup = () => {
  if (productSubscription) {
    productSubscription.unsubscribe()
    console.log('📡 Unsubscribed from product updates')
  }
}

onMounted(async () => {
  await fetchUser()
  await fetchProduct()
  await fetchCartCount()
})

onUnmounted(() => {
  cleanup()
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
        <v-badge v-if="cartCount > 0" :content="cartCount" color="red" offset-x="-7" offset-y="-3">
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
      <v-skeleton-loader v-if="loading" type="image, text, text, text" class="mb-6" />
      <v-alert v-else-if="error" type="error" variant="tonal" class="mb-6 mx-4">
        {{ error }}
      </v-alert>

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
                @click="() => { previewIndex = index; openImageDialog = true; }"
              />
            </v-carousel-item>
          </v-carousel>
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
                    ₱{{ dialogSelectedVariety?.price || product.price }}
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
                        <div class="text-caption text-grey">₱{{ product.price }}</div>
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
                    :disabled="variety.stock === 0"
                  >
                    <v-card-text class="pa-3 d-flex align-center">
                      <v-avatar size="40" class="mr-3">
                        <v-img :src="getVarietyImage(variety)" />
                      </v-avatar>
                      <div class="flex-grow-1">
                        <div class="font-weight-medium">{{ variety.name }}</div>
                        <div class="text-caption text-grey">
                          ₱{{ variety.price || product.price }}
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
                    ₱{{
                      ((dialogSelectedVariety?.price || product.price) * dialogQuantity).toFixed(2)
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
                    ₱{{ buyNowSelectedVariety?.price || product.price }}
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
                        <div class="text-caption text-grey">₱{{ product.price }}</div>
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
                    :disabled="variety.stock === 0"
                  >
                    <v-card-text class="pa-3 d-flex align-center">
                      <v-avatar size="40" class="mr-3">
                        <v-img :src="getVarietyImage(variety)" />
                      </v-avatar>
                      <div class="flex-grow-1">
                        <div class="font-weight-medium">{{ variety.name }}</div>
                        <div class="text-caption text-grey">
                          ₱{{ variety.price || product.price }}
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
                    ₱{{
                      ((buyNowSelectedVariety?.price || product.price) * buyNowQuantity).toFixed(2)
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
          <div class="product-header">
            <h1 class="product-title">{{ product.prod_name }}</h1>
            <div class="product-price-wrapper">
              <span class="product-price">₱{{ displayPrice }}</span>
              <span v-if="displayStock > 0" class="stock-badge in-stock">
                <v-icon size="14" class="mr-1">mdi-check-circle</v-icon>
                In Stock
              </span>
              <span v-else class="stock-badge out-of-stock">
                <v-icon size="14" class="mr-1">mdi-close-circle</v-icon>
                Out of Stock
              </span>
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
                    <div class="option-subtitle">Base option</div>
                  </div>
                  <div class="option-price">₱{{ product.price }}</div>
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
              <p class="selection-label">Available Varieties:</p>

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
                    <div class="variety-content">
                      <v-avatar size="48" class="mr-3">
                        <v-img
                          :src="getVarietyImage(variety)"
                          @click.stop="previewVarietyImages(variety.images)"
                          style="cursor: zoom-in"
                        />
                      </v-avatar>
                      <div class="variety-info">
                        <div class="variety-name">{{ variety.name }}</div>
                        <div class="variety-type">Special variant</div>
                      </div>
                      <div class="variety-price">₱{{ variety.price || product.price }}</div>
                      <v-icon v-if="isVarietySelected(variety)" color="primary" size="20">
                        mdi-check-circle
                      </v-icon>
                    </div>
                  </v-card-text>
                </v-card>
              </div>
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
            <p class="summary-value">
              {{ selectedVariety ? selectedVariety.name : 'Standard Product' }}
              <span v-if="selectedSize"> • {{ selectedSize }}</span>
            </p>
            <div class="summary-details">
              <span>Price: <strong>₱{{ displayPrice }}</strong></span>
              <span>Stock: <strong :class="{ 'low-stock': displayStock < 5 && displayStock > 0 }">{{ displayStock }} available</strong></span>
            </div>
          </div>

          <p class="product-description">{{ product.prod_description }}</p>
        </div>

        <!-- Shop Info -->
        <v-card
          v-if="product.shop"
          flat
          class="shop-card pa-3 d-flex align-center"
          @click="goToShop(product.shop.id)"
        >
          <v-avatar size="48" class="mr-3">
            <v-img :src="product.shop.logo_url || '/placeholder.png'" />
          </v-avatar>
          <div class="shop-info">
            <p class="shop-name">{{ product.shop.business_name }}</p>
            <p class="shop-link">View Shop <v-icon size="14">mdi-chevron-right</v-icon></p>
          </div>
        </v-card>
      </v-sheet>
    </v-main>

    <!-- Bottom Nav -->
    <div class="bottom-bar">
      <template v-if="isOwner">
        <button class="bottom-action-btn primary-btn" @click="goToShop(product.shop.id)">
          <v-icon size="20">mdi-storefront-outline</v-icon>
          <span>Visit Shop</span>
        </button>
      </template>

      <template v-else>
        <button class="bottom-action-btn chat-btn" @click="goToChat()">
          <v-icon size="20">mdi-chat-outline</v-icon>
          <span>Chat</span>
        </button>

        <button
          class="bottom-action-btn cart-btn"
          @click="openAddToCartDialog()"
          :disabled="displayStock === 0"
        >
          <v-icon size="20">mdi-cart-outline</v-icon>
          <span>{{ displayStock === 0 ? 'Out of Stock' : 'Add to Cart' }}</span>
        </button>

        <button
          class="bottom-action-btn buy-btn"
          @click="openBuyNowDialog()"
          :disabled="isActionDisabled"
        >
          <span>Buy Now</span>
        </button>
      </template>
    </div>
  </v-app>
</template>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.product-page {
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  min-height: 100vh;
  padding-bottom: 90px;
}

.product-sheet {
  max-width: 800px;
  margin: 0 auto;
  padding: 16px;
}

/* App Bar */
.app-bar {
  background: linear-gradient(135deg, #3f83c7, #2c5f8a) !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1) !important;
}

/* Product Images */
.product-images {
  margin-bottom: 16px;
}

.product-img,
.product-images :deep(.v-carousel),
.product-images :deep(.v-carousel-item) {
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
}

.product-img :deep(img) {
  object-fit: contain;
  background: white;
  padding: 20px;
}

/* Product Info Card */
.product-info {
  background: white;
  border-radius: 28px;
  padding: 24px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.06);
}

.product-header {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #eef2f6;
}

.product-title {
  font-size: 1.8rem;
  font-weight: 700;
  color: #1a2c3e;
  line-height: 1.3;
  margin-bottom: 12px;
}

.product-price-wrapper {
  display: flex;
 align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.product-price {
  font-size: 2rem;
  font-weight: 800;
  color: #e53935;
}

.stock-badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 100px;
  font-size: 0.8rem;
  font-weight: 600;
}

.in-stock {
  background: #e8f5e9;
  color: #2e7d32;
}

.out-of-stock {
  background: #ffebee;
  color: #c62828;
}

/* Selection Labels */
.selection-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #475569;
  margin-bottom: 12px;
  letter-spacing: -0.2px;
}

/* Option Cards */
.option-card,
.variety-card {
  border-radius: 16px !important;
  border: 1.5px solid #e2e8f0;
  transition: all 0.2s ease;
  cursor: pointer;
}

.option-card:hover,
.variety-card:hover {
  transform: translateY(-2px);
  border-color: #3f83c7;
  box-shadow: 0 6px 16px rgba(63, 131, 199, 0.1);
}

.option-card--selected,
.variety-card--selected {
  border-color: #3f83c7 !important;
  background: #f0f7ff;
}

.option-title {
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 4px;
}

.option-subtitle {
  font-size: 0.75rem;
  color: #94a3b8;
}

.option-price {
  font-weight: 700;
  color: #e53935;
  margin-right: 12px;
}

.or-divider {
  position: relative;
  text-align: center;
  margin: 20px 0;
}

.or-text {
  position: relative;
  top: -12px;
  background: white;
  padding: 0 12px;
  font-size: 0.8rem;
  color: #94a3b8;
  font-weight: 600;
  text-transform: uppercase;
}

.varieties-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.variety-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.variety-info {
  flex: 1;
}

.variety-name {
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 2px;
}

.variety-type {
  font-size: 0.7rem;
  color: #94a3b8;
}

.variety-price {
  font-weight: 700;
  color: #e53935;
}

/* Size Buttons */
.size-section {
  margin: 20px 0;
}

.size-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.size-btn {
  min-width: 56px;
  padding: 10px 16px;
  border: 1.5px solid #e2e8f0;
  background: white;
  border-radius: 100px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s ease;
}

.size-btn:hover {
  border-color: #3f83c7;
  background: #f0f7ff;
}

.size-btn--active {
  background: #3f83c7;
  border-color: #3f83c7;
  color: white;
}

/* Selection Summary */
.selection-summary {
  background: linear-gradient(135deg, #f8fafc, #f1f5f9);
  border-radius: 20px;
  padding: 16px;
  margin: 20px 0;
}

.summary-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #64748b;
  margin-bottom: 6px;
}

.summary-value {
  font-weight: 700;
  color: #1e293b;
  font-size: 1rem;
  margin-bottom: 8px;
}

.summary-details {
  display: flex;
  gap: 20px;
  font-size: 0.85rem;
  color: #475569;
}

.summary-details strong {
  color: #3f83c7;
}

.low-stock {
  color: #f59e0b !important;
}

/* Product Description */
.product-description {
  font-size: 0.9rem;
  line-height: 1.6;
  color: #475569;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #eef2f6;
}

/* Shop Card */
.shop-card {
  border-radius: 20px !important;
  background: white;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
}

.shop-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
}

.shop-name {
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 2px;
}

.shop-link {
  font-size: 0.75rem;
  color: #3f83c7;
  display: flex;
  align-items: center;
  gap: 2px;
}

/* Bottom Bar */
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(20px);
  border-top: 1px solid #eef2f6;
  display: flex;
  padding: 12px 16px;
  gap: 12px;
  z-index: 100;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
}

.bottom-action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 12px;
  border: none;
  border-radius: 60px;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.bottom-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chat-btn {
  background: #f0fdf4;
  color: #22c55e;
}

.chat-btn:active {
  transform: scale(0.97);
}

.cart-btn {
  background: #fff7ed;
  color: #f97316;
}

.cart-btn:active {
  transform: scale(0.97);
}

.buy-btn {
  background: linear-gradient(135deg, #3f83c7, #2c5f8a);
  color: white;
  box-shadow: 0 4px 12px rgba(63, 131, 199, 0.3);
}

.buy-btn:active {
  transform: scale(0.97);
}

.primary-btn {
  background: linear-gradient(135deg, #3f83c7, #2c5f8a);
  color: white;
}

/* Dialog Styles */
:deep(.v-dialog .v-card) {
  border-radius: 28px !important;
}

/* Responsive */
@media (max-width: 768px) {
  .product-sheet {
    padding: 12px;
  }
  
  .product-info {
    padding: 20px;
  }
  
  .product-title {
    font-size: 1.4rem;
  }
  
  .product-price {
    font-size: 1.5rem;
  }
  
  .bottom-action-btn {
    padding: 12px 10px;
    font-size: 0.8rem;
  }
  
  .size-btn {
    min-width: 48px;
    padding: 8px 14px;
    font-size: 0.8rem;
  }
}

@media (max-width: 480px) {
  .product-price-wrapper {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .bottom-action-btn span {
    font-size: 0.75rem;
  }
  
  .variety-content {
    flex-wrap: wrap;
  }
  
  .variety-price {
    margin-left: auto;
  }
}
</style>