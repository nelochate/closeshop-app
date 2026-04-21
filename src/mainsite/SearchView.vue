<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const route = useRoute()
const router = useRouter()

const query = ref(route.query.q || '')
const productResults = ref([])
const shopResults = ref([])
const loading = ref(false)
const errorMsg = ref('')
const activeTab = ref('products') // 'products' or 'shops'
let debounceTimer

// 🔄 Watch URL query param and refetch on change
watch(
  () => route.query.q,
  (newQ) => {
    query.value = newQ || ''
    debounceFetch()
  }
)

// 🕓 Debounce search to avoid overloading Supabase
function debounceFetch() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(fetchSearchResults, 400)
}

// 🔍 Fetch products and shops
async function fetchSearchResults() {
  if (!query.value || query.value.trim().length < 1) {
    productResults.value = []
    shopResults.value = []
    return
  }

  try {
    loading.value = true
    errorMsg.value = ''

    // Fetch products
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, prod_name, price, main_img_urls, sold, shop_id')
      .ilike('prod_name', `%${query.value}%`)

    if (productsError) throw productsError

    // Fetch shops
    const { data: shops, error: shopsError } = await supabase
      .from('shops')
      .select('id, business_name, logo_url, status, description')
      .ilike('business_name', `%${query.value}%`)
      .eq('status', 'approved') // Only show approved shops

    if (shopsError) throw shopsError

    // Process products
    productResults.value = (products || []).map((p) => ({
      id: p.id,
      title: p.prod_name,
      price: p.price,
      img: Array.isArray(p.main_img_urls)
        ? p.main_img_urls[0]
        : JSON.parse(p.main_img_urls || '[]')[0],
      sold: p.sold || 0,
      type: 'product'
    }))

    // Process shops
    shopResults.value = (shops || []).map((s) => ({
      id: s.id,
      title: s.business_name,
      description: s.description || 'No description available',
      img: s.logo_url || null,
      type: 'shop'
    }))

  } catch (err) {
    console.error('Search error:', err)
    errorMsg.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(fetchSearchResults)

// 🔙 Navigation helpers
const goBack = () => router.back()
const goToProduct = (id) => router.push({ name: 'product-detail', params: { id } })
const goToShop = (id) => router.push({ name: 'shop-view', params: { id } })

// 🔁 Update search as user types
watch(query, (val) => {
  router.replace({ name: 'search', query: { q: val } })
})

// Computed properties
const hasResults = computed(() => 
  productResults.value.length > 0 || shopResults.value.length > 0
)

const currentResults = computed(() => {
  return activeTab.value === 'products' ? productResults.value : shopResults.value
})

const showEmptyState = computed(() => 
  !loading.value && 
  query.value.length >= 2 && 
  !hasResults.value
)
</script>

<template>
  <v-app>
    <v-main class="page">
      <!-- 🔍 Header -->
      <v-sheet class="hero">
        <div class="hero-row">
          <v-btn icon @click="goBack" class="back-btn" aria-label="Go Back">
            <v-icon>mdi-arrow-left</v-icon>
          </v-btn>

          <v-text-field
            v-model="query"
            variant="solo"
            rounded="pill"
            hide-details
            clearable
            density="comfortable"
            placeholder="Search products & shops..."
            prepend-inner-icon="mdi-magnify"
            class="search-field"
            autofocus
          />
        </div>
      </v-sheet>

      <!-- 🛍️ Results -->
      <v-container class="py-6" style="max-width: 720px;">
        <!-- Results Header -->
        <div class="results-header" v-if="query && hasResults">
          <h2 class="page-title">Results for "{{ query }}"</h2>
          
          <!-- Tabs -->
          <div class="results-tabs">
            <v-btn
              @click="activeTab = 'products'"
              :class="['tab-btn', { active: activeTab === 'products' }]"
              variant="text"
              size="small"
            >
              <v-icon left size="18">mdi-package-variant</v-icon>
              Products ({{ productResults.length }})
            </v-btn>
            <v-btn
              @click="activeTab = 'shops'"
              :class="['tab-btn', { active: activeTab === 'shops' }]"
              variant="text"
              size="small"
            >
              <v-icon left size="18">mdi-storefront</v-icon>
              Shops ({{ shopResults.length }})
            </v-btn>
          </div>
        </div>

        <!-- Loading Skeleton -->
        <template v-if="loading">
          <div class="product-grid">
            <v-skeleton-loader
              v-for="i in 6"
              :key="i"
              type="image"
              class="product-card"
            />
          </div>
        </template>

        <!-- Error -->
        <v-alert v-if="errorMsg" type="error" variant="tonal" class="mt-4">
          {{ errorMsg }}
        </v-alert>

        <!-- Product Results Grid -->
        <template v-else-if="!loading && activeTab === 'products' && productResults.length > 0">
          <div class="product-grid">
            <div
              v-for="item in productResults"
              :key="item.id"
              class="product-card"
              @click="goToProduct(item.id)"
            >
              <v-img :src="item.img" class="product-img" cover />
              <div class="product-info">
                <div class="product-title">{{ item.title }}</div>
                <div class="product-price">₱{{ Number(item.price).toFixed(2) }}</div>
                <div class="product-sold">{{ item.sold }} sold</div>
              </div>
            </div>
          </div>
        </template>

        <!-- Shop Results Grid -->
        <template v-else-if="!loading && activeTab === 'shops' && shopResults.length > 0">
          <div class="shop-grid">
            <div v-for="shop in shopResults" :key="shop.id" class="shop-card" @click="goToShop(shop.id)">
              <div class="shop-avatar-container">
                <v-avatar size="64" class="shop-avatar" color="blue-lighten-4">
                  <v-img v-if="shop.img && shop.img !== '/shop-placeholder.png'" :src="shop.img" class="shop-logo"
                    cover />
                  <div v-else class="default-shop-logo">
                    <v-icon size="32" color="#3f83c7">mdi-storefront</v-icon>
                  </div>
                </v-avatar>
                <div class="shop-badge">
                  <v-icon size="16" color="white">mdi-storefront</v-icon>
                </div>
              </div>
              <div class="shop-info">
                <h3 class="shop-name">{{ shop.title }}</h3>
                <p class="shop-description" v-if="shop.description">
                  {{ shop.description.length > 80 ? shop.description.substring(0, 80) + '...' : shop.description }}
                </p>
              </div>
            </div>
          </div>
        </template>

        <!-- Empty State -->
        <template v-else-if="showEmptyState">
          <div class="empty-state">
            <v-icon size="48" color="grey">mdi-magnify</v-icon>
            <p class="empty-title">No results found</p>
            <p class="empty-sub">Try searching with another keyword.</p>
          </div>
        </template>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.page {
  background: #f5f7fa;
  min-height: 100vh;
}

/* 🔵 HERO HEADER */
.hero {
  background: #3f83c7;
  padding: calc(env(safe-area-inset-top) + 14px) 16px 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  position: sticky;
  top: 0;
  z-index: 20;
  padding-top: 35px;
}

.hero-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 720px;
}

.back-btn {
  background: #fff !important;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
}

.back-btn :deep(.v-icon) {
  color: #111827;
}

.search-field {
  flex: 1;
}

.search-field :deep(.v-field) {
  background: #fff !important;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
}

.search-field :deep(input) {
  font-size: 14px;
}

/* 🧾 RESULTS HEADER */
.results-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 16px;
}

.results-tabs {
  display: flex;
  gap: 8px;
  border-bottom: 2px solid #e5e7eb;
  padding-bottom: 8px;
}

.tab-btn {
  text-transform: none;
  font-weight: 500;
  color: #6b7280 !important;
  border-radius: 8px;
  padding: 8px 16px;
}

.tab-btn.active {
  color: #3f83c7 !important;
  background-color: #eff6ff;
  font-weight: 600;
}

.tab-btn .v-icon {
  margin-right: 6px;
}

/* 🛍️ PRODUCT GRID */
.product-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.product-card {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  transition: transform 0.15s ease, box-shadow 0.2s ease;
  cursor: pointer;
}
.product-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.1);
}

.product-img {
  width: 100%;
  height: 160px;
  object-fit: cover;
}

.product-info {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.product-title {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  line-height: 1.3;
  height: 32px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.product-price {
  font-size: 14px;
  font-weight: 700;
  color: #e53935;
}

.product-sold {
  font-size: 12px;
  color: #6b7280;
}

/* 🏪 SHOP GRID */
.shop-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.shop-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.shop-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.shop-avatar-container {
  position: relative;
}

.shop-avatar {
  border: 2px solid #e5e7eb;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.shop-badge {
  position: absolute;
  bottom: -4px;
  right: -4px;
  background: #3f83c7;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid white;
}

.shop-info {
  flex: 1;
  min-width: 0;
}

.shop-name {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 4px 0;
}

.shop-description {
  font-size: 13px;
  color: #6b7280;
  margin: 0 0 8px 0;
  line-height: 1.4;
}

.default-shop-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #e3f2fd, #bbdefb);
  border-radius: 50%;
}

.shop-logo {
  border-radius: 50%;
}

/* 💤 EMPTY STATE */
.empty-state {
  text-align: center;
  padding: 40px 16px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
}

.empty-title {
  font-weight: 700;
  color: #1f2937;
  margin-top: 8px;
}

.empty-sub {
  font-size: 13px;
  color: #6b7280;
}

@media (min-width: 768px) {
  .product-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
}

/* 📱 MOBILE OPTIMIZATION */
@media (max-width: 480px) {
  .product-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .product-img {
    height: 140px;
  }

  .page-title {
    font-size: 16px;
  }

  .shop-card {
    padding: 12px;
    gap: 12px;
  }

  .shop-avatar {
    width: 56px !important;
    height: 56px !important;
  }

  .shop-name {
    font-size: 14px;
  }

  .shop-description {
    font-size: 12px;
  }

  .tab-btn {
    padding: 6px 12px;
    font-size: 13px;
  }
}

@media (max-width: 360px) {
  .product-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
}
</style>