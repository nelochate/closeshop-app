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
</script>

<template>
  <v-app>
    <v-main class="product-page">

      <!-- Loading -->
      <v-skeleton-loader
        v-if="loading"
        type="image, text, text, text"
        class="mb-6"
      />

      <!-- Error -->
      <v-alert
        v-else-if="error"
        type="error"
        variant="tonal"
        class="mb-6 mx-4"
      >
        {{ error }}
      </v-alert>

      <!-- Product Details -->
      <v-sheet
        v-else
        class="product-sheet pa-4"
      >
        <!-- Single Product Image -->
        <v-img
          :src="mainImage(product.main_img_urls)"
          class="product-img mb-4"
          height="300"
          cover
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

        <!-- Action Buttons -->
        <div class="action-buttons d-flex gap-2">
          <v-btn color="orange" class="flex-1" @click="addToCart">Add to Cart</v-btn>
          <v-btn color="green" class="flex-1" @click="checkoutNow">Buy Now</v-btn>
        </div>
      </v-sheet>
    </v-main>
  </v-app>
</template>

<style scoped>
.product-page {
  padding: 0;
  margin: 0;
  background-color: #f5f7fa;
  min-height: 100vh;
}

.product-sheet {
  width: 100%;
  border-radius: 0;
  box-shadow: none;
}

.product-img {
  width: 100%;
  border-radius: 0;
  object-fit: cover;
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
  color: #e53935;
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
  box-shadow: 0 2px 8px rgba(0,0,0,.05);
}

.shop-name {
  font-weight: 600;
  font-size: 1rem;
}

.action-buttons {
  padding: 0 16px 16px 16px;
}

@media (max-width: 600px) {
  .product-title { font-size: 1rem; }
  .product-price { font-size: 1rem; }
  .product-description { font-size: 0.85rem; }
  .product-meta { font-size: 0.75rem; }
  .shop-name { font-size: 0.95rem; }
}
</style>
