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
const openImageDialog = ref(false) // for image zoom dialog
const previewIndex = ref(0) // for image zoom dialog
const user = ref(null) // current user
//for variety zoom dialog
const openVarietyDialog = ref(false)
const varietyPreviewIndex = ref(0)
const varietyImages = ref([]) // store selected variety images

// DOM refs
const productImgRef = ref(null)
const cartIconRef = ref(null)

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
    // 🧠 Get current logged-in user first
    const { data: userData } = await supabase.auth.getUser()
    user.value = userData?.user

    // 🛒 Fetch product + shop details
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

    // 🧩 Parse JSON safely
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
  } catch (e) {
    error.value = e.message || 'Failed to load product'
  } finally {
    loading.value = false
  }

  // Auto-select if only one option
  if (product.value?.sizes?.length === 1) {
    selectedSize.value = product.value.sizes[0]
  }

  if (product.value?.varieties?.length === 1) {
    selectedVariety.value = product.value.varieties[0]
  }
})

const confirmAddToCart = async () => {
  if (!product.value) return

  // Use dialog selections if available, otherwise use main selections
  const finalSize = dialogSelectedSize.value || selectedSize.value
  const finalVariety = dialogSelectedVariety.value || selectedVariety.value

  if (product.value.has_sizes && !finalSize) {
    alert('Please select a size')
    return
  }

  if (product.value.has_varieties && !finalVariety) {
    alert('Please select a variety')
    return
  }

  try {
    // QUICK FIX: Pass only the product ID string instead of object
    await cart.addToCart(product.value.id, quantity.value)
    animateToCart()
    showAddToCart.value = false
    quantity.value = 1
    // Reset dialog selections
    dialogSelectedSize.value = null
    dialogSelectedVariety.value = null
  } catch (err) {
    console.error('confirmAddToCart error:', err)
    alert('❌ Failed to add to cart: ' + (err.message || 'Unknown error'))
  }
}

const goToCart = async () => {
  if (!product.value) return
  try {
    // QUICK FIX: Pass only the product ID string instead of object
    await cart.addToCart(product.value.id, 1)
    router.push('/cartview')
  } catch (err) {
    console.error('addToCart error:', err)
    alert('Failed to add to cart: ' + (err.message || 'Unknown error'))
  }
}

const checkoutNow = async () => alert('Proceed to checkout!')
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

// Animation
const animateToCart = () => {
  if (!productImgRef.value || !cartIconRef.value) return

  const imgEl = productImgRef.value.$el || productImgRef.value
  const cartEl = cartIconRef.value.$el || cartIconRef.value

  const imgRect = imgEl.getBoundingClientRect()
  const cartRect = cartEl.getBoundingClientRect()

  const clone = imgEl.cloneNode(true)
  clone.style.position = 'fixed'
  clone.style.left = `${imgRect.left}px`
  clone.style.top = `${imgRect.top}px`
  clone.style.width = `${imgRect.width}px`
  clone.style.height = `${imgRect.height}px`
  clone.style.zIndex = '2000'
  clone.style.transition = 'all 0.8s cubic-bezier(0.65, -0.1, 0.25, 1.5), opacity 0.8s'

  document.body.appendChild(clone)
  void clone.offsetWidth // reflow

  // Animate to cart
  clone.style.left = `${cartRect.left + cartRect.width / 2 - imgRect.width / 4}px`
  clone.style.top = `${cartRect.top + cartRect.height / 2 - imgRect.height / 4}px`
  clone.style.width = `${imgRect.width / 2}px`
  clone.style.height = `${imgRect.height / 2}px`
  clone.style.opacity = '0.2'

  setTimeout(() => {
    clone.remove()
    // 👇 Bounce cart icon
    cartEl.classList.add('cart-bounce')
    setTimeout(() => cartEl.classList.remove('cart-bounce'), 400)
  }, 800)
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

// Check if current user is the shop owner - FIXED VERSION
const isOwner = computed(() => {
  if (!user.value || !product.value?.shop?.owner_id) return false
  return user.value.id === product.value.shop.owner_id
})

const generateTransactionNumber = () => {
  const timestamp = Date.now() // milliseconds since 1970
  const random = Math.floor(Math.random() * 1000) // 0-999
  return `TXN${timestamp}${random.toString().padStart(3, '0')}`
}

// to store dialog selection
const buyNow = () => {
  if (!product.value) return alert('Product not loaded')

  const item = {
    id: product.value.id,
    product_id: product.value.id,
    name: product.value.prod_name,
    price: product.value.price,
    quantity: 1,
    size: selectedSize.value || null,
    variety: selectedVariety.value || null,
    image: mainImage(product.value.main_img_urls),
    shop_id: product.value.shop?.id,
    product: product.value
  }

  console.log('🛒 Navigating to checkout with item:', item)

  // ✅ Use query params instead of state for more reliability
  router.push({
    name: 'purchaseview',
    query: {
      productId: product.value.id,
      fromProduct: 'true'
    },
    state: { 
      items: [item], 
      shopId: product.value.shop.id,
      fromCart: false 
    }
  })
}
// Add to Cart Dialog
const addToCartDialog = computed(() => {
  return {
    value: showAddToCart.value,
    product: product.value,
    quantity: quantity.value,
    selectedSize: dialogSelectedSize.value,
    selectedVariety: dialogSelectedVariety.value,
    onConfirm: confirmAddToCart,
    onClose: () => {
      showAddToCart.value = false
      dialogSelectedSize.value = null
      dialogSelectedVariety.value = null
    },
    'onUpdate:selectedSize': (val) => {
      dialogSelectedSize.value = val
    },
    'onUpdate:selectedVariety': (val) => {
      dialogSelectedVariety.value = val
    },
    'onUpdate:quantity': (val) => {
      quantity.value = val
    },
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
      <v-btn icon ref="cartIconRef" @click="goToCart">
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
        <!-- Product Image (click to enlarge) -->
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
          <p class="product-price mb-2">₱{{ product.price }}</p>

          <!-- 🆕 Varieties -->
          <div v-if="product.varieties && product.varieties.length" class="mb-3">
            <p class="font-weight-medium mb-1">Variety:</p>

            <v-btn-toggle v-model="selectedVariety" mandatory class="flex-wrap">
              <v-btn
                v-for="variety in product.varieties"
                :key="variety.name"
                :value="variety"
                variant="outlined"
                class="ma-1 pa-2 rounded-pill d-flex flex-column align-center"
                color="primary"
                style="min-width: 80px; max-width: 120px"
              >
                <v-img
                  v-if="variety.images && variety.images.length"
                  :src="variety.images[0]"
                  width="40"
                  height="40"
                  class="mb-1 rounded-circle"
                  cover
                  style="cursor: zoom-in"
                  @click.stop="previewVarietyImages(variety.images)"
                />

                <span class="text-caption font-weight-medium">{{ variety.name }}</span>
                <span v-if="!product.has_same_price" class="text-caption text-red">
                  ₱{{ variety.price }}
                </span>
              </v-btn>
            </v-btn-toggle>
          </div>

          <!-- 🆕 Sizes -->
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
          <p v-if="selectedSize" class="text-caption text-grey mt-1">
            Selected size: <strong>{{ selectedSize }}</strong>
          </p>
          <p class="product-description mb-2">{{ product.prod_description }}</p>
          <p class="product-meta">Sold: {{ product.sold }} | Stock: {{ product.stock }}</p>
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

      <!-- Feedback Section -->
      <v-divider class="my-4">Customer Feedback</v-divider>

      <v-card
        v-for="review in reviews"
        :key="review.id"
        class="mx-4 my-3 pa-3"
        elevation="1"
        rounded="lg"
      >
        <div class="d-flex align-center mb-2">
          <v-avatar size="42" class="mr-3">
            <v-img :src="review.user_avatar || '/placeholder.png'" />
          </v-avatar>
          <div>
            <p class="font-weight-medium mb-0">{{ review.user_name }}</p>
            <p class="text-caption text-grey">2 days ago</p>
          </div>
        </div>

        <!-- Ratings -->
        <div class="mb-2">
          <div class="d-flex align-center mb-1">
            <span class="text-caption mr-2">Shop Rating:</span>
            <v-rating
              v-model="review.shop_rating"
              color="amber"
              half-increments
              readonly
              density="compact"
              size="18"
            />
          </div>

          <div class="d-flex align-center">
            <span class="text-caption mr-2">Product Rating:</span>
            <v-rating
              v-model="review.product_rating"
              color="amber"
              half-increments
              readonly
              density="compact"
              size="18"
            />
          </div>
        </div>

        <!-- Review Message -->
        <v-card-text class="py-1 text-body-2">{{ review.message }}</v-card-text>

        <!-- Like/Dislike Actions -->
        <v-card-actions class="pt-0">
          <v-btn variant="text" size="small" color="primary" @click="review.likes++">
            <v-icon left size="18">mdi-thumb-up-outline</v-icon>
            {{ review.likes }}
          </v-btn>

          <v-btn variant="text" size="small" color="error" @click="review.dislikes++">
            <v-icon left size="18">mdi-thumb-down-outline</v-icon>
            {{ review.dislikes }}
          </v-btn>
        </v-card-actions>
      </v-card>

      <!-- Add to Cart Dialog -->
      <v-dialog v-model="showAddToCart" max-width="500">
        <v-card>
          <v-card-title class="d-flex justify-space-between align-center">
            <span>Add to Cart</span>
            <v-btn icon @click="showAddToCart = false">
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </v-card-title>

          <v-card-text>
            <!-- Quantity Selector -->
            <div class="mb-4">
              <p class="font-weight-medium mb-2">Quantity:</p>
              <div class="d-flex align-center">
                <v-btn icon @click="quantity > 1 ? quantity-- : null" :disabled="quantity <= 1">
                  <v-icon>mdi-minus</v-icon>
                </v-btn>
                <span class="mx-4">{{ quantity }}</span>
                <v-btn icon @click="quantity++" :disabled="quantity >= product.stock">
                  <v-icon>mdi-plus</v-icon>
                </v-btn>
                <span class="ml-2 text-caption text-grey">Stock: {{ product.stock }}</span>
              </div>
            </div>

            <!-- Sizes in Dialog -->
            <div v-if="product.sizes && product.sizes.length" class="mb-4">
              <p class="font-weight-medium mb-2">Size:</p>
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

            <!-- Varieties in Dialog -->
            <div v-if="product.varieties && product.varieties.length" class="mb-4">
              <p class="font-weight-medium mb-2">Variety:</p>
              <v-btn-toggle v-model="dialogSelectedVariety" mandatory class="flex-wrap">
                <v-btn
                  v-for="variety in product.varieties"
                  :key="variety.name"
                  :value="variety"
                  variant="outlined"
                  class="ma-1 pa-2 rounded-pill d-flex flex-column align-center"
                  color="primary"
                  style="min-width: 80px; max-width: 120px"
                >
                  <v-img
                    v-if="variety.images && variety.images.length"
                    :src="variety.images[0]"
                    width="40"
                    height="40"
                    class="mb-1 rounded-circle"
                    cover
                  />
                  <span class="text-caption font-weight-medium">{{ variety.name }}</span>
                </v-btn>
              </v-btn-toggle>
            </div>
          </v-card-text>

          <v-card-actions>
            <v-btn
              block
              color="primary"
              @click="confirmAddToCart"
              :disabled="
                (!dialogSelectedSize && product.has_sizes) ||
                (!dialogSelectedVariety && product.has_varieties)
              "
            >
              Add to Cart
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-main>

    <!-- Bottom Nav - ALWAYS VISIBLE FOR ALL PRODUCTS -->
    <v-bottom-navigation class="bottom-nav" height="65" fixed>
      <v-row class="w-full pa-0 ma-0" no-gutters>
        <!-- If owner, show only Visit Shop -->
        <template v-if="isOwner">
          <v-col cols="12" class="pa-0">
            <v-btn block color="primary" class="bottom-btn" @click="goToShop(product.shop.id)">
              <v-icon left size="20">mdi-storefront-outline</v-icon>
              Visit Shop
            </v-btn>
          </v-col>
        </template>

        <!-- If not owner, show Chat, Add to Cart, Buy Now -->
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
            <v-btn block class="bottom-btn cart-btn" color="#4caf50" @click="showAddToCart = true">
              <v-icon left size="20">mdi-cart-outline</v-icon>
              Add to Cart
            </v-btn>
          </v-col>

          <!-- Buy Now -->
          <v-col cols="4" class="pa-0">
            <v-btn block class="bottom-btn buy-now-btn" color="#438fda" @click="buyNow()">
              Buy Now
            </v-btn>
          </v-col>
        </template>
      </v-row>
    </v-bottom-navigation>
  </v-app>
</template>

<style scoped>
.app-bar{
  padding-top: 20px;
}
/* Page & Sheet */
.product-page {
  padding: 0;
  margin: 0;
  background-color: #f5f7fa;
  min-height: 100vh;
  padding-bottom: 70px;
  padding-top: 60px;
  /* space for bottom nav */
}

.top-text {
  font-size: 16px;
  font-weight: 400;
  margin-left: -5px;
}

.product-sheet {
  width: 100%;
  max-width: 900px;
  /* center for desktop */
  margin: 0 auto;
  border-radius: 0;
  box-shadow: none;
}

/* Product Image */
.product-img {
  width: 100%;
  border-radius: 8px;
  object-fit: contain;
  margin: 16px 0;
}

/* Product Info */
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

/* Shop Card */
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

/* Bottom Nav */
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

/* smooth scaling when flying */
.fly-clone {
  border-radius: 8px;
  overflow: hidden;
  pointer-events: none;
}

/* Bounce animation for cart icon */
@keyframes bounce {
  0% {
    transform: scale(1);
  }

  30% {
    transform: scale(1.3);
  }

  60% {
    transform: scale(0.9);
  }

  100% {
    transform: scale(1);
  }
}

.cart-bounce {
  animation: bounce 0.4s ease;
}

/* Responsive */
@media (max-width: 1024px) {
  .product-title {
    font-size: 1.1rem;
  }

  .product-price {
    font-size: 1rem;
  }

  .product-description {
    font-size: 0.85rem;
  }

  .product-meta {
    font-size: 0.75rem;
  }

  .shop-name {
    font-size: 0.95rem;
  }

  .bottom-btn {
    font-size: 0.85rem;
  }
}

@media (max-width: 600px) {
  .product-title {
    font-size: 1rem;
  }

  .product-price {
    font-size: 0.95rem;
  }

  .product-description {
    font-size: 0.8rem;
  }

  .product-meta {
    font-size: 0.7rem;
  }

  .shop-name {
    font-size: 0.9rem;
  }

  .bottom-btn {
    font-size: 0.8rem;
    gap: 2px;
  }
}

.v-card-text {
  line-height: 1.4;
  color: #374151;
}

.text-caption.text-grey {
  color: #6b7280;
}

/*for varieties*/
.v-btn-toggle .v-btn {
  background-color: #fff;
  border: 1px solid #e0e0e0;
  transition: all 0.2s ease;
}

.v-btn-toggle .v-btn:hover {
  transform: scale(1.05);
  border-color: #438fda;
}

.v-btn-toggle .v-btn--active {
  background-color: #e8f3ff;
  border-color: #438fda;
}
/*for image zoom*/
.zoomed-img {
  transition: transform 0.3s ease;
  cursor: grab;
}

.zoomed-img:hover {
  transform: scale(1.05);
}
</style>
