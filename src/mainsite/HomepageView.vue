<script setup lang="js">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import BottomNav from '@/common/layout/BottomNav.vue'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const activeTab = ref('home')
const search = ref('')

const recommended = ref([]) // will hold product cards
const nearby = ref([])      // shops (unchanged)

const loading = ref(true)
const errorMsg = ref('')

const PLACEHOLDER_IMG = 'https://picsum.photos/seed/shop/480/360'

// helper: normalize image field (main_img_urls may be jsonb array or string)
function extractImage(main_img_urls) {
  if (!main_img_urls) return PLACEHOLDER_IMG

  if (Array.isArray(main_img_urls) && main_img_urls.length > 0) {
    return main_img_urls[0]
  }

  if (typeof main_img_urls === 'string') {
    try {
      const parsed = JSON.parse(main_img_urls)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed[0]
    } catch {
      return main_img_urls
    }
  }

  return PLACEHOLDER_IMG
}


// existing shop fetch (keeps your nearby section working)
async function fetchAllShopsPublic() {
  loading.value = true
  errorMsg.value = ''
  const { data, error } = await supabase
    .from('shops')
    .select('id,business_name,description,logo_url,building,street,barangay,city,province,region')
    .order('business_name', { ascending: true })

  if (error) {
    console.error('fetchAllShopsPublic:', error)
    errorMsg.value = error.message
    nearby.value = []
  } else {
    nearby.value = (data || []).map(row => ({
      id: row.id,
      title: row.business_name,
      img: row.logo_url || PLACEHOLDER_IMG,
      logo: row.logo_url,
      address: [row.building, row.street, row.barangay, row.city, row.province, row.region].filter(Boolean).join(', ')
    }))
  }
  loading.value = false
}

// ------------------------------
// New: fetchProducts (robust, avoids ambiguous embedding)
// ------------------------------
async function fetchProducts() {
  loading.value = true
  errorMsg.value = ''
  try {
    // 1) fetch all products (select the fields you need)
    const { data: products, error: prodError } = await supabase
      .from('products')
      .select('id, prod_name, price, main_img_urls, shop_id')
    if (prodError) throw prodError
    const productList = products || []

    // 2) fetch order_items to compute purchase counts (aggregate in JS)
    const { data: orderItems, error: oiError } = await supabase
      .from('order_items')
      .select('product_id, quantity')
    if (oiError) throw oiError

    const purchaseCount = new Map()
    for (const oi of orderItems || []) {
      if (!oi.product_id) continue
      purchaseCount.set(oi.product_id, (purchaseCount.get(oi.product_id) || 0) + (oi.quantity || 0))
    }

    // 3) fetch shops for the products (only the shops we need)
    const shopIds = [...new Set(productList.map(p => p.shop_id).filter(Boolean))]
    let shopsById = {}
    if (shopIds.length > 0) {
      const { data: shopsData, error: shopsError } = await supabase
        .from('shops')
        .select('id, business_name, logo_url')
        .in('id', shopIds)
      if (shopsError) throw shopsError
      shopsById = Object.fromEntries((shopsData || []).map(s => [s.id, s]))
    }

    // 4) build product cards and sort by popularity (purchase count)
    const cards = productList.map(p => {
      return {
        id: p.id,
        title: p.prod_name || 'Untitled product',
        img: extractImage(p.main_img_urls),
        logo: shopsById[p.shop_id]?.logo_url || PLACEHOLDER_IMG,
        address: shopsById[p.shop_id]?.business_name || '',
        purchases: purchaseCount.get(p.id) || 0
      }
    }).sort((a, b) => b.purchases - a.purchases)

    recommended.value = cards
  } catch (err) {
    console.error('fetchProducts error', err)
    errorMsg.value = (err && err.message) ? err.message : String(err)
    recommended.value = []
  } finally {
    loading.value = false
  }
}

// Lifecycle: call both
onMounted(() => {
  fetchAllShopsPublic()
  fetchProducts()
})

// handlers (kept from your code)
const onSearch = () => {
  const q = search.value.trim()
  if (!q) return
  // router.push({ name: 'search', query: { q } })
}

const seeMoreNearby = () => router.push('/mapsearch')
const goNotifications = () => router.push('/notificationview')
</script>


<template>
  <v-app>
    <v-main class="page">
      <v-container class="py-4" style="max-width: 720px">
        <!-- HERO: search + notification + banner -->
        <v-sheet class="hero pa-4">
          <div class="hero-row">
            <v-text-field v-model="search" class="search-field" variant="solo" rounded="pill" hide-details clearable
              density="comfortable" :placeholder="'Looking for something specific?'" label="Search"
              prepend-inner-icon="mdi-magnify" append-inner-icon="mdi-earth" @keyup.enter="onSearch"
              @click:prepend-inner="onSearch" />
            <v-btn class="notif-btn" icon aria-label="Notifications" @click="goNotifications">
              <v-icon size="22">mdi-bell-outline</v-icon>
            </v-btn>
          </div>
        </v-sheet>

        <!-- Nearby Stores -->
        <div class="section-header mt-6">
          <h3 class="section-title">Nearby Stores</h3>
          <button class="see-more" @click="seeMoreNearby">See more</button>
        </div>

        <div class="scroll-row">
          <!-- Loading skeletons -->
          <template v-if="loading">
            <v-skeleton-loader v-for="i in 4" :key="'near-skel-' + i" type="image" class="item-card" />
          </template>

          <!-- Empty state -->
          <template v-else-if="nearby.length === 0">
            <div class="empty-card">
              <div class="empty-title">Nothing nearby yet</div>
              <div class="empty-sub">Location-based results coming soon.</div>
            </div>
          </template>

          <!-- Items -->
          <template v-else>
            <div v-for="item in nearby" :key="item.id" class="item-card">
              <v-img :src="item.img" cover class="item-img" alt="" />
              <div class="item-footer"></div>
              <v-avatar class="avatar-badge" size="20">
                <v-img :src="item.logo || PLACEHOLDER_IMG" alt="" />
              </v-avatar>
              <div class="item-meta">
                <div class="item-title">{{ item.title }}</div>
                <div class="item-sub">{{ item.address }}</div>
              </div>
            </div>
          </template>
        </div>

       <!-- Products -->
<div class="section-header mt-6">
  <h3 class="section-title">Products</h3>
</div>

<template v-if="loading">
  <div class="product-grid">
    <v-skeleton-loader
      v-for="i in 6"
      :key="'prod-skel-' + i"
      type="image"
      class="product-card"
    />
  </div>
</template>

<template v-else-if="recommended.length === 0">
  <div class="empty-card">
    <div class="empty-title">No products yet</div>
    <div class="empty-sub">Products will appear here.</div>
  </div>
</template>

<template v-else>
  <div class="product-grid">
    <div v-for="item in recommended" :key="item.id" class="product-card">
      <v-img :src="item.img" class="product-img" cover />

      <div class="product-info">
        <div class="product-title">{{ item.title }}</div>
        <div class="product-price">₱{{ item.price || '0.00' }}</div>
        <div class="product-meta">Purchased: {{ item.purchases || 0 }}</div>
      </div>
    </div>
  </div>
</template>


        <!-- Error banner (if any) -->
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
/* ---- Page / hero ---- */
.page {
  background: #f5f7fa;
  padding-bottom: 96px;
}

.hero {
  background: #e5f1f8;
  border-radius: 14px;
}

.hero-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-field {
  flex: 1;
}

.search-field :deep(.v-field) {
  background: #ffffff !important;
  box-shadow: 0 6px 20px rgba(0, 0, 0, .06);
}

.search-field :deep(input) {
  font-size: 14px;
}

.notif-btn {
  width: 44px;
  height: 44px;
  min-width: 44px;
  border-radius: 9999px;
  background: #ffffff !important;
  box-shadow: 0 6px 20px rgba(0, 0, 0, .06);
}

.notif-btn :deep(.v-icon) {
  color: #111827;
}

/* ---- Section header ---- */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #1f2937;
}

.see-more {
  background: transparent;
  border: 0;
  color: #6b7280;
  font-weight: 600;
  cursor: pointer;
}

/* ---- Horizontal scroller ---- */
.scroll-row {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 10px 2px 2px;
  scroll-snap-type: x mandatory;
}

.scroll-row::-webkit-scrollbar {
  display: none;
}

/* ---- Card ---- */
.item-card {
  position: relative;
  width: 124px;
  height: 124px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 6px 18px rgba(0, 0, 0, .06);
  background: #fff;
  scroll-snap-align: start;
}

.item-img {
  width: 100%;
  height: 100%;
}

/* Blue footer strip like the mock */
.item-footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 24px;
  background: #5ca3eb;
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
}

/* Small avatar badge overlapping the footer */
.avatar-badge {
  position: absolute;
  left: 8px;
  bottom: 8px;
  border: 2px solid #ffffff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, .15);
}

/* Text overlay (outside avatar) */
.item-meta {
  position: absolute;
  left: 36px;
  right: 8px;
  bottom: 6px;
  color: #fff;
}

.item-title {
  font-size: 12px;
  line-height: 1.1;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, .35);
}

.item-sub {
  font-size: 10px;
  opacity: .9;
  text-shadow: 0 1px 2px rgba(0, 0, 0, .35);
}

/* Empty state card that still preserves layout/scroll */
.empty-card {
  width: 240px;
  height: 124px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 6px 18px rgba(0, 0, 0, .06);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 12px;
}

.empty-title {
  font-weight: 700;
  color: #1f2937;
}

.empty-sub {
  font-size: 12px;
  color: #6b7280;
}

.mt-6 {
  margin-top: 24px;
}

/* Grid layout like Shopee */
.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.product-card {
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  transition: transform 0.15s ease;
  cursor: pointer;
}

.product-card:hover {
  transform: translateY(-2px);
}

.product-img {
  width: 100%;
  height: 160px;
  object-fit: cover;
}

/* Info area */
.product-info {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.product-title {
  font-size: 13px;
  font-weight: 500;
  color: #111827;
  line-height: 1.3;
  height: 32px; /* 2 lines max */
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.product-price {
  font-size: 14px;
  font-weight: 700;
  color: #e53935; /* Shopee red */
}

.product-meta {
  font-size: 11px;
  color: #6b7280;
}

</style>
