<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const route = useRoute()
const router = useRouter()
const productId = route.params.id as string

const product = ref<any>(null)
const loading = ref(true)
const error = ref<string | null>(null)

// Get the main image
const mainImage = (imgs: string[] | string | null) => {
  if (!imgs) return '/placeholder.png'
  if (Array.isArray(imgs)) return imgs[0] || '/placeholder.png'
  try {
    const parsed = JSON.parse(imgs)
    if (Array.isArray(parsed)) return parsed[0] || '/placeholder.png'
  } catch {}
  return imgs
}

// Fetch product + shop
onMounted(async () => {
  loading.value = true
  try {
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
        shop:shops!products_shop_id_fkey(
          id,
          business_name,
          logo_url
        )
      `)
      .eq('id', productId)
      .single()
    if (err) throw err
    product.value = data
  } catch (e: any) {
    error.value = e.message || 'Failed to load product'
  } finally {
    loading.value = false
  }
})

// Handlers
const addToCart = async () => alert('Added to cart!')
const checkoutNow = async () => alert('Proceed to checkout!')
const chatNow = async () => alert('Chat with seller!')
const shareProduct = async () => alert('Share product!')
</script>

<template>
  <v-app>
    <!-- Top Nav -->
    <v-app-bar color="#438fda" dark flat>
      <v-btn icon @click="router.back()">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-spacer />
      <v-btn icon @click="addToCart">
        <v-icon>mdi-cart-outline</v-icon>
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
        <!-- Single Product Image -->
        <v-img
          :src="mainImage(product.main_img_urls)"
          class="product-img mb-4"
          contain
        />

        <!-- Product Info -->
        <div class="product-info mb-4">
          <h2 class="product-title mb-2">{{ product.prod_name }}</h2>
          <p class="product-price mb-2">₱{{ product.price }}</p>
          <p class="product-description mb-2">{{ product.prod_description }}</p>
          <p class="product-meta">Sold: {{ product.sold }} | Stock: {{ product.stock }}</p>
        </div>

        <!-- Shop Info -->
        <v-card flat class="shop-card pa-2 d-flex align-center mb-4">
          <v-avatar size="48">
            <v-img :src="product.shop.logo_url || '/placeholder.png'" />
          </v-avatar>
          <div class="shop-info ml-3">
            <p class="shop-name">{{ product.shop.business_name }}</p>
          </div>
        </v-card>
      </v-sheet>
    </v-main>

    <!-- Bottom Nav -->
    <v-bottom-navigation absolute app class="bottom-nav">
      <v-row class="w-full pa-0 ma-0" no-gutters>
        <!-- Chat Now -->
        <v-col cols="3.5" class="pa-0">
          <v-btn block class="bottom-btn chat-now-btn" @click="chatNow">
            <v-icon left size="20">mdi-chat-outline</v-icon>
            Chat Now
          </v-btn>
        </v-col>

        <!-- Add to Cart -->
        <v-col cols="3.5" class="pa-0">
          <v-btn block class="bottom-btn cart-btn" @click="addToCart">
            <v-icon left size="20">mdi-cart-outline</v-icon>
            Add to Cart
          </v-btn>
        </v-col>

        <!-- Buy Now -->
        <v-col cols="5" class="pa-0">
          <v-btn block class="bottom-btn buy-now-btn" @click="checkoutNow">
            Buy Now
          </v-btn>
        </v-col>
      </v-row>
    </v-bottom-navigation>
  </v-app>
</template>

<style scoped>
/* Page & Sheet */
.product-page {
  padding: 0;
  margin: 0;
  background-color: #f5f7fa;
  min-height: 100vh;
  padding-bottom: 70px; /* space for bottom nav */
}

.product-sheet {
  width: 100%;
  max-width: 900px; /* center for desktop */
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
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.shop-name {
  font-weight: 600;
  font-size: 1rem;
}

/* Bottom Nav */
.bottom-nav {
  height: 65px;
  padding: 0;
  background-color: #ffffff;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.1);
  border-top-left-radius: 0;
  border-top-right-radius: 0;
  position: fixed;
  bottom: 0;
  width: 100%;
  z-index: 100;
}

/* Bottom Buttons Modern Style */
.bottom-btn {
  height: 100%;
  font-weight: 600;
  text-transform: none;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 0.9rem;
  border-radius:0px;
  transition: transform 0.1s ease-in-out;
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
@media (max-width: 1024px) {
  .product-title { font-size: 1.1rem; }
  .product-price { font-size: 1rem; }
  .product-description { font-size: 0.85rem; }
  .product-meta { font-size: 0.75rem; }
  .shop-name { font-size: 0.95rem; }
  .bottom-btn { font-size: 0.85rem; }
}

@media (max-width: 600px) {
  .product-title { font-size: 1rem; }
  .product-price { font-size: 0.95rem; }
  .product-description { font-size: 0.8rem; }
  .product-meta { font-size: 0.7rem; }
  .shop-name { font-size: 0.9rem; }
  .bottom-btn { font-size: 0.8rem; gap: 2px; }
}
</style>
