<script setup lang="js">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import BottomNav from '@/common/layout/BottomNav.vue'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const activeTab = ref('home')
const search = ref('')

const products = ref([])
const nearby = ref([])
const loading = ref(true)
const errorMsg = ref('')

const PLACEHOLDER_IMG = 'https://picsum.photos/seed/shop/480/360'

// ✅ Helper: normalize image field
function extractImage(main_img_urls) {
  if (!main_img_urls) return PLACEHOLDER_IMG
  if (Array.isArray(main_img_urls) && main_img_urls.length) return main_img_urls[0]
  if (typeof main_img_urls === 'string') {
    try {
      const parsed = JSON.parse(main_img_urls)
      if (Array.isArray(parsed) && parsed.length) return parsed[0]
    } catch {
      return main_img_urls // plain string url
    }
  }
  return PLACEHOLDER_IMG
}

// ✅ Fetch Shops
async function fetchShops() {
  try {
    const { data, error } = await supabase
      .from('shops')
      .select('id, business_name, description, logo_url, building, street, barangay, city, province, region')
      .order('business_name')

    if (error) throw error

    nearby.value = (data || []).map(s => ({
      id: s.id,
      title: s.business_name,
      img: s.logo_url || PLACEHOLDER_IMG,
      logo: s.logo_url,
      address: [s.building, s.street, s.barangay, s.city, s.province, s.region].filter(Boolean).join(', ')
    }))
  } catch (err) {
    console.error('fetchShops error:', err)
    errorMsg.value = err.message
    nearby.value = []
  }
}

// ✅ Fetch Products (with sold count + real price)
async function fetchProducts() {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id, prod_name, price, main_img_urls, shop_id, sold')

    if (error) throw error

    products.value = (data || []).map(p => ({
      id: p.id,
      title: p.prod_name || 'Untitled product',
      price: p.price, // 👈 exact seller price
      img: extractImage(p.main_img_urls),
      sold: p.sold || 0 // 👈 fallback if null
    }))
  } catch (err) {
    console.error('fetchProducts error:', err)
    errorMsg.value = err.message
    products.value = []
  }
}

// ✅ Lifecycle
onMounted(async () => {
  loading.value = true
  errorMsg.value = ''
  await Promise.all([fetchShops(), fetchProducts()])
  loading.value = false
})

// ✅ Handlers
const onSearch = () => {
  if (!search.value.trim()) return
  router.push({ name: 'search', query: { q: search.value.trim() } })
}
const seeMoreNearby = () => router.push('/mapsearch')
const goNotifications = () => router.push('/notificationview')
const goToProduct = (id) => router.push({ name: 'product-detail', params: { id } })
</script>

<template>
  <v-app>
    <v-main class="page">
      <v-container class="py-4" style="max-width: 720px">

        <!-- 🔎 Search + Notification -->
        <v-sheet class="hero pa-4">
          <div class="hero-row">
            <v-text-field
              v-model="search"
              class="search-field"
              variant="solo"
              rounded="pill"
              hide-details
              clearable
              density="comfortable"
              placeholder="Looking for something specific?"
              prepend-inner-icon="mdi-magnify"
              append-inner-icon="mdi-earth"
              @keyup.enter="onSearch"
              @click:prepend-inner="onSearch"
            />
            <v-btn class="notif-btn" icon aria-label="Notifications" @click="goNotifications">
              <v-icon size="22">mdi-bell-outline</v-icon>
            </v-btn>
          </div>
        </v-sheet>

        <!-- 🏬 Nearby Stores -->
        <div class="section-header mt-6">
          <h3 class="section-title">Nearby Stores</h3>
          <button class="see-more" @click="seeMoreNearby">See more</button>
        </div>

        <div class="scroll-row">
          <template v-if="loading">
            <v-skeleton-loader v-for="i in 4" :key="'near-skel-' + i" type="image" class="item-card" />
          </template>
          <template v-else-if="nearby.length === 0">
            <div class="empty-card">
              <div class="empty-title">Nothing nearby yet</div>
              <div class="empty-sub">Location-based results coming soon.</div>
            </div>
          </template>
          <template v-else>
            <div v-for="item in nearby" :key="item.id" class="item-card">
              <v-img :src="item.img" cover class="item-img" />
              <div class="item-footer"></div>
              <v-avatar class="avatar-badge" size="20">
                <v-img :src="item.logo || PLACEHOLDER_IMG" />
              </v-avatar>
              <div class="item-meta">
                <div class="item-title">{{ item.title }}</div>
                <div class="item-sub">{{ item.address }}</div>
              </div>
            </div>
          </template>
        </div>

        <!-- 🛒 Products -->
        <div class="section-header mt-6">
          <h3 class="section-title">Products</h3>
        </div>

        <template v-if="loading">
          <div class="product-grid">
            <v-skeleton-loader v-for="i in 6" :key="'prod-skel-' + i" type="image" class="product-card" />
          </div>
        </template>
        <template v-else-if="products.length === 0">
          <div class="empty-card">
            <div class="empty-title">No products yet</div>
            <div class="empty-sub">Products will appear here.</div>
          </div>
        </template>
        <template v-else>
          <div class="product-grid">
            <div v-for="item in products" :key="item.id" class="product-card" @click="goToProduct(item.id)">
              <v-img :src="item.img" class="product-img" cover />
              <div class="product-info">
                <div class="product-title">{{ item.title }}</div>
                <div class="product-price">₱{{ Number(item.price).toFixed(2) }}</div>
                <div class="product-sold">{{ item.sold }} sold</div>
              </div>
            </div>
          </div>
        </template>

        <!-- 🚨 Error -->
        <v-alert v-if="errorMsg" class="mt-6" type="error" variant="tonal">
          {{ errorMsg }}
        </v-alert>
      </v-container>
    </v-main>

    <!-- Bottom Navigation -->
    <BottomNav v-model="activeTab" />
  </v-app>
</template>

<style scoped>
.page { background: #f5f7fa; padding-bottom: 96px; }
.hero { background: #e5f1f8; border-radius: 14px; }
.hero-row { display: flex; align-items: center; gap: 10px; }
.search-field { flex: 1; }
.search-field :deep(.v-field) { background: #fff !important; box-shadow: 0 6px 20px rgba(0,0,0,.06); }
.search-field :deep(input) { font-size: 14px; }
.notif-btn { width: 44px; height: 44px; min-width: 44px; border-radius: 9999px; background: #fff !important; box-shadow: 0 6px 20px rgba(0,0,0,.06); }
.notif-btn :deep(.v-icon) { color: #111827; }

.section-header { display: flex; align-items: center; justify-content: space-between; }
.section-title { font-size: 16px; font-weight: 700; color: #1f2937; }
.see-more { background: transparent; border: 0; color: #6b7280; font-weight: 600; cursor: pointer; }

.scroll-row { display: flex; gap: 12px; overflow-x: auto; padding: 10px 2px 2px; scroll-snap-type: x mandatory; }
.scroll-row::-webkit-scrollbar { display: none; }

.item-card { position: relative; width: 124px; height: 124px; border-radius: 12px; overflow: hidden; box-shadow: 0 6px 18px rgba(0,0,0,.06); background: #fff; scroll-snap-align: start; }
.item-img { width: 100%; height: 100%; }
.item-footer { position: absolute; left: 0; right: 0; bottom: 0; height: 24px; background: #5ca3eb; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; }
.avatar-badge { position: absolute; left: 8px; bottom: 8px; border: 2px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
.item-meta { position: absolute; left: 36px; right: 8px; bottom: 6px; color: #fff; }
.item-title { font-size: 12px; font-weight: 700; text-shadow: 0 1px 2px rgba(0,0,0,.35); }
.item-sub { font-size: 10px; opacity: .9; text-shadow: 0 1px 2px rgba(0,0,0,.35); }

.empty-card { width: 240px; height: 124px; border-radius: 12px; background: #fff; box-shadow: 0 6px 18px rgba(0,0,0,.06); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 12px; }
.empty-title { font-weight: 700; color: #1f2937; }
.empty-sub { font-size: 12px; color: #6b7280; }
.mt-6 { margin-top: 24px; }

.product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-top: 12px; }
.product-card { background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.05); display: flex; flex-direction: column; transition: transform 0.15s ease; cursor: pointer; }
.product-card:hover { transform: translateY(-2px); }
.product-img { width: 100%; height: 160px; object-fit: cover; }
.product-info { padding: 8px; display: flex; flex-direction: column; gap: 2px; }
.product-title { font-size: 13px; font-weight: 500; color: #111827; line-height: 1.3; height: 32px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.product-price { font-size: 14px; font-weight: 700; color: #e53935; }
.product-sold { font-size: 12px; color: #6b7280; }
</style>
