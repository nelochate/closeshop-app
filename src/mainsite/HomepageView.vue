<script setup lang="js">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import BottomNav from '@/common/layout/BottomNav.vue'

// ---------------------------------
// State
// ---------------------------------
const router = useRouter()
const activeTab = ref('home')
const search = ref('')

// Mock data for the carousels (replace with API later)
const recommended = [
  { id: 'r1', title: 'Classic Tee',       img: 'https://picsum.photos/seed/tee/480/360',       logo: 'https://picsum.photos/seed/logo1/40/40' },
  { id: 'r2', title: 'Iced Latte',        img: 'https://picsum.photos/seed/latte/480/360',     logo: 'https://picsum.photos/seed/logo2/40/40' },
  { id: 'r3', title: 'Fresh Produce',     img: 'https://picsum.photos/seed/produce/480/360',   logo: 'https://picsum.photos/seed/logo3/40/40' },
  { id: 'r4', title: 'Corner Mart',       img: 'https://picsum.photos/seed/store/480/360',     logo: 'https://picsum.photos/seed/logo4/40/40' },
]

const nearby = [
  { id: 'n1', title: 'Tabaco BBQ',        img: 'https://picsum.photos/seed/bbq/480/360',       logo: 'https://picsum.photos/seed/logo6/40/40' },
  { id: 'n2', title: 'Local Diner',       img: 'https://picsum.photos/seed/diner/480/360',     logo: 'https://picsum.photos/seed/logo7/40/40' },
  { id: 'n3', title: 'Hardware Hub',      img: 'https://picsum.photos/seed/hardware/480/360',  logo: 'https://picsum.photos/seed/logo8/40/40' },
  { id: 'n4', title: 'Seafood Corner',    img: 'https://picsum.photos/seed/seafood/480/360',   logo: 'https://picsum.photos/seed/logo9/40/40' },
]

// ---------------------------------
// Handlers
// ---------------------------------
const onSearch = () => {
  const q = search.value.trim()
  if (!q) return
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
            <!-- NEW: Notification button beside the search -->
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
          <div v-for="item in recommended" :key="item.id" class="item-card">
            <v-img :src="item.img" cover class="item-img" />
            <div class="item-footer"></div>
            <v-avatar class="avatar-badge" size="20">
              <v-img :src="item.logo" alt="" />
            </v-avatar>
          </div>
        </div>

        <!-- Nearby Stores -->
        <div class="section-header mt-6">
          <h3 class="section-title">Nearby Stores</h3>
          <button class="see-more" @click="seeMoreNearby">See more</button>
        </div>

        <div class="scroll-row">
          <div v-for="item in nearby" :key="item.id" class="item-card">
            <v-img :src="item.img" cover class="item-img" />
            <div class="item-footer"></div>
            <v-avatar class="avatar-badge" size="20">
              <v-img :src="item.logo" alt="" />
            </v-avatar>
          </div>
        </div>
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
  padding-bottom: 96px; /* keep above BottomNav */
}

.hero {
  background: #e5f1f8;        /* light blue panel like the mock */
  border-radius: 14px;
}

/* Row so search and bell sit side-by-side */
.hero-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Search field takes the width, bell stays compact */
.search-field { flex: 1; }

.search-field :deep(.v-field) {
  background: #ffffff !important;
  box-shadow: 0 6px 20px rgba(0,0,0,.06);
}

.search-field :deep(input) {
  font-size: 14px;
}

/* Circular white notification button */
.notif-btn {
  width: 44px;
  height: 44px;
  min-width: 44px;
  border-radius: 9999px;
  background: #ffffff !important;
  box-shadow: 0 6px 20px rgba(0,0,0,.06);
}
.notif-btn :deep(.v-icon) { color: #111827; }

.hero-banner {
  border-radius: 10px;
  overflow: hidden;
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
  color: #1f2937; /* neutral-800 */
}
.see-more {
  background: transparent;
  border: 0;
  color: #6b7280;  /* neutral-500 */
  font-weight: 600;
  cursor: pointer;
}

/* ---- Horizontal card scroller ---- */
.scroll-row {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 10px 2px 2px;
  scroll-snap-type: x mandatory;
}
.scroll-row::-webkit-scrollbar { display: none; }

/* ---- Card ---- */
.item-card {
  position: relative;
  width: 124px;
  height: 124px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 6px 18px rgba(0,0,0,.06);
  background: #fff;
  scroll-snap-align: start;
}
.item-img { width: 100%; height: 100%; }

/* Blue footer strip like the mock */
.item-footer {
  position: absolute;
  left: 0; right: 0; bottom: 0;
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
  box-shadow: 0 2px 8px rgba(0,0,0,.15);
}

/* spacing utilities */
.mt-6 { margin-top: 24px; }
</style>
