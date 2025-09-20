<script setup lang="js">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import BottomNav from '@/common/layout/BottomNav.vue'
import { supabase } from '@/utils/supabase'

// ---------------------------------
// State
// ---------------------------------
const router = useRouter()
const activeTab = ref('home')
const search = ref('')

const recommended = ref([]) // we’ll fill this with all shops for now
const nearby = ref([])      // same for now (placeholder)

const loading = ref(true)
const errorMsg = ref('')

const PLACEHOLDER_IMG = 'https://picsum.photos/seed/shop/480/360'

// Map DB row -> card for UI
function toCard(row) {
  // NOTE: your screenshot shows the column as "business_nam" (without 'e').
  // If your real column name is different, adjust below.
  const title = row.business_nam || 'Untitled Shop'
  const address = [
    row.building, row.street, row.barangay, row.city, row.province, row.region
  ].filter(Boolean).join(', ')

  return {
    id: row.id,
    title,
    img: row.cover_url || row.logo_url || PLACEHOLDER_IMG, // cover_url optional later
    logo: row.logo_url,
    address
  }
}

async function fetchAllShopsPublic() {
  loading.value = true
  errorMsg.value = ''
  // Select only the fields we use in UI. Add/remove as needed.
  const { data, error } = await supabase
    .from('shops')
    .select('id,business_name,description,logo_url,building,street,barangay,city,province,region')
    .order('business_name', { ascending: true })

  if (error) {
    console.error('fetchAllShopsPublic:', error)
    errorMsg.value = error.message
    recommended.value = []
    nearby.value = []
  } else {
    const cards = (data || []).map(toCard)
    // For now, both sections show all shops (you’ll refine this later)
   // recommended.value = cards
    nearby.value = cards
  }
  loading.value = false
}

// ---------------------------------
// Lifecycle
// ---------------------------------
onMounted(fetchAllShopsPublic)

// ---------------------------------
// Handlers
// ---------------------------------
const onSearch = () => {
  const q = search.value.trim()
  if (!q) return
  // Router left as-is; hook up a search page later
  // router.push({ name: 'search', query: { q } })
}
const seeMoreRecommended = () => router.push('/popular')
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
            <v-text-field
              v-model="search"
              class="search-field"
              variant="solo"
              rounded="pill"
              hide-details
              clearable
              density="comfortable"
              :placeholder="'Looking for something specific?'"
              label="Search"
              prepend-inner-icon="mdi-magnify"
              append-inner-icon="mdi-earth"
              @keyup.enter="onSearch"
              @click:prepend-inner="onSearch"
            />
            <v-btn class="notif-btn" icon aria-label="Notifications" @click="goNotifications">
              <v-icon size="22">mdi-bell-outline</v-icon>
            </v-btn>
          </div>

          <v-img
            class="hero-banner mt-4"
            src="https://picsum.photos/seed/promo/960/420"
            alt="Big Sale Banner"
            cover
          />
        </v-sheet>

        <!-- Recommended -->
        <div class="section-header mt-6">
          <h3 class="section-title">Recommended</h3>
          <button class="see-more" @click="seeMoreRecommended">See more</button>
        </div>

        <div class="scroll-row">
          <!-- Loading skeletons -->
          <template v-if="loading">
            <v-skeleton-loader v-for="i in 4" :key="'rec-skel-'+i" type="image" class="item-card" />
          </template>

          <!-- Empty state -->
          <template v-else-if="recommended.length === 0">
            <div class="empty-card">
              <div class="empty-title">No shops yet</div>
              <div class="empty-sub">New shops will appear here.</div>
            </div>
          </template>

          <!-- Items -->
          <template v-else>
            <div v-for="item in recommended" :key="item.id" class="item-card">
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

        <!-- Nearby Stores -->
        <div class="section-header mt-6">
          <h3 class="section-title">Nearby Stores</h3>
          <button class="see-more" @click="seeMoreNearby">See more</button>
        </div>

        <div class="scroll-row">
          <!-- Loading skeletons -->
          <template v-if="loading">
            <v-skeleton-loader v-for="i in 4" :key="'near-skel-'+i" type="image" class="item-card" />
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
.page { background: #f5f7fa; padding-bottom: 96px; }
.hero { background: #e5f1f8; border-radius: 14px; }
.hero-row { display: flex; align-items: center; gap: 10px; }
.search-field { flex: 1; }
.search-field :deep(.v-field) { background: #ffffff !important; box-shadow: 0 6px 20px rgba(0,0,0,.06); }
.search-field :deep(input) { font-size: 14px; }
.notif-btn { width: 44px; height: 44px; min-width: 44px; border-radius: 9999px; background: #ffffff !important; box-shadow: 0 6px 20px rgba(0,0,0,.06); }
.notif-btn :deep(.v-icon) { color: #111827; }
.hero-banner { border-radius: 10px; overflow: hidden; }

/* ---- Section header ---- */
.section-header { display: flex; align-items: center; justify-content: space-between; }
.section-title { margin: 0; font-size: 16px; font-weight: 700; color: #1f2937; }
.see-more { background: transparent; border: 0; color: #6b7280; font-weight: 600; cursor: pointer; }

/* ---- Horizontal scroller ---- */
.scroll-row { display: flex; gap: 12px; overflow-x: auto; padding: 10px 2px 2px; scroll-snap-type: x mandatory; }
.scroll-row::-webkit-scrollbar { display: none; }

/* ---- Card ---- */
.item-card { position: relative; width: 124px; height: 124px; border-radius: 12px; overflow: hidden; box-shadow: 0 6px 18px rgba(0,0,0,.06); background: #fff; scroll-snap-align: start; }
.item-img { width: 100%; height: 100%; }

/* Blue footer strip like the mock */
.item-footer { position: absolute; left: 0; right: 0; bottom: 0; height: 24px; background: #5ca3eb; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; }

/* Small avatar badge overlapping the footer */
.avatar-badge { position: absolute; left: 8px; bottom: 8px; border: 2px solid #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,.15); }

/* Text overlay (outside avatar) */
.item-meta { position: absolute; left: 36px; right: 8px; bottom: 6px; color: #fff; }
.item-title { font-size: 12px; line-height: 1.1; font-weight: 700; text-shadow: 0 1px 2px rgba(0,0,0,.35); }
.item-sub { font-size: 10px; opacity: .9; text-shadow: 0 1px 2px rgba(0,0,0,.35); }

/* Empty state card that still preserves layout/scroll */
.empty-card {
  width: 240px;
  height: 124px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 6px 18px rgba(0,0,0,.06);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; padding: 12px;
}
.empty-title { font-weight: 700; color: #1f2937; }
.empty-sub { font-size: 12px; color: #6b7280; }

.mt-6 { margin-top: 24px; }
</style>
