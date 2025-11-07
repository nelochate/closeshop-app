<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const route = useRoute()
const router = useRouter()

const query = ref(route.query.q || '')
const results = ref([])
const loading = ref(false)
const errorMsg = ref('')
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

// 🔍 Fetch products that START with query
async function fetchSearchResults() {
  if (!query.value || query.value.trim().length < 1) {
    results.value = []
    return
  }

  try {
    loading.value = true
    errorMsg.value = ''

    const { data, error } = await supabase
      .from('products')
      .select('id, prod_name, price, main_img_urls, sold')
      .ilike('prod_name', `${query.value}%`) // starts-with search

    if (error) throw error

    results.value = (data || []).map((p) => ({
      id: p.id,
      title: p.prod_name,
      price: p.price,
      img: Array.isArray(p.main_img_urls)
        ? p.main_img_urls[0]
        : JSON.parse(p.main_img_urls || '[]')[0],
      sold: p.sold || 0
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

// 🔁 Update search as user types
watch(query, (val) => {
  router.replace({ name: 'search', query: { q: val } })
})
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
            placeholder="Search products..."
            prepend-inner-icon="mdi-magnify"
            class="search-field"
            autofocus
          />
        </div>
      </v-sheet>

      <!-- 🛍️ Results -->
      <v-container class="py-6" style="max-width: 720px;">
        <h2 class="page-title" v-if="query">Search results for “{{ query }}”</h2>

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

        <!-- Results Grid -->
        <template v-else-if="!loading && results.length > 0">
          <div class="product-grid">
            <div
              v-for="item in results"
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

        <!-- Empty State -->
        <template v-else-if="!loading && !results.length && query.length >= 2">
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
/* 🌈 PAGE LAYOUT */
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

/* 🧾 PAGE TITLE */
.page-title {
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 16px;
}

/* 🛍️ PRODUCT GRID */
.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
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

/* 📱 MOBILE OPTIMIZATION */
@media (max-width: 480px) {
  .product-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .product-img {
    height: 140px;
  }

  .page-title {
    font-size: 16px;
  }
}
</style>
