<script setup lang="ts">
import { ref, onMounted } from "vue"
import { useRoute, useRouter } from "vue-router"
import { supabase } from "@/utils/supabase"
import BottomNav from "@/common/layout/BottomNav.vue"
import * as L from "leaflet"

// route + router
const route = useRoute()
const router = useRouter()
const shopId = route.params.id as string
const activeTab = ref(null)

// shop state
const shop = ref<any>(null)
const products = ref<any[]>([])
const loading = ref(true)
const errorMsg = ref("")

const PLACEHOLDER_IMG = "https://picsum.photos/seed/shop/640/360"

// fetch shop
const fetchShop = async () => {
  try {
    const { data, error } = await supabase
      .from("shops")
      .select("*")
      .eq("id", shopId)
      .single()

    if (error) throw error
    shop.value = data
  } catch (err: any) {
    errorMsg.value = err.message
    console.error("fetchShop error:", err)
  }
}

// fetch products
const fetchProducts = async () => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("id, prod_name, price, main_img_urls, sold")
      .eq("shop_id", shopId)

    if (error) throw error
    products.value = (data || []).map((p) => ({
      id: p.id,
      title: p.prod_name,
      price: p.price,
      sold: p.sold || 0,
      img: extractImage(p.main_img_urls),
    }))
  } catch (err: any) {
    errorMsg.value = err.message
    console.error("fetchProducts error:", err)
  }
}

// helper for images
function extractImage(main_img_urls: any) {
  if (!main_img_urls) return PLACEHOLDER_IMG
  if (Array.isArray(main_img_urls) && main_img_urls.length) return main_img_urls[0]
  if (typeof main_img_urls === "string") {
    try {
      const parsed = JSON.parse(main_img_urls)
      if (Array.isArray(parsed) && parsed.length) return parsed[0]
    } catch {
      return main_img_urls
    }
  }
  return PLACEHOLDER_IMG
}

// share shop
const shareProduct = () => {
  if (navigator.share) {
    navigator
      .share({
        title: shop.value?.business_name || "Shop",
        text: "Check out this shop on our app!",
        url: window.location.href,
      })
      .catch((err) => console.error("Share failed:", err))
  } else {
    alert("Sharing is not supported on this device.")
  }
}

// map setup
let map: L.Map | null = null
let shopMarker: L.Marker | null = null

const initMap = () => {
  if (!shop.value?.latitude || !shop.value?.longitude) return

  // destroy old map if exists
  if (map) {
    map.remove()
    map = null
  }

  map = L.map("shop-map").setView([shop.value.latitude, shop.value.longitude], 16)

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
  }).addTo(map)

  shopMarker = L.marker([shop.value.latitude, shop.value.longitude]).addTo(map)
  shopMarker.bindPopup(shop.value.business_name || "Shop").openPopup()
}

onMounted(async () => {
  loading.value = true
  await fetchShop()
  await fetchProducts()
  loading.value = false

  // initialize map after shop is loaded
  initMap()
})
</script>

<template>
  <v-app>
    <!-- Top Nav -->
    <v-app-bar color="#438fda" dark flat>
      <v-btn icon @click="router.back()">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="top-text"><strong>Shop Details</strong></v-toolbar-title>
      <v-spacer />
      <v-btn icon @click="shareProduct">
        <v-icon>mdi-share-variant-outline</v-icon>
      </v-btn>
    </v-app-bar>

    <v-main>
      <v-container class="py-0 px-0">
        <!-- Cover -->
        <v-img
          :src="shop?.physical_store || PLACEHOLDER_IMG"
          height="200"
          cover
          class="cover-photo"
        >
          <template #placeholder>
            <v-skeleton-loader type="image" height="200" />
          </template>
        </v-img>

        <!-- Avatar + Info -->
        <div class="avatar-wrapper">
          <v-avatar size="96" class="avatar-border">
            <v-img v-if="shop?.logo_url" :src="shop.logo_url" cover />
            <v-icon v-else size="48">mdi-store</v-icon>
          </v-avatar>
        </div>

        <v-container class="py-4">
          <h2 class="text-h6">{{ shop?.business_name || "Shop" }}</h2>
          <p class="text-body-2 text-medium-emphasis">
            {{ shop?.description || "No description yet." }}
          </p>

          <div class="mt-2 text-body-2">
            <p><v-icon small start>mdi-clock</v-icon> {{ shop?.open_time }} – {{ shop?.close_time }}</p>
            <p>
              <v-icon small start>mdi-map-marker</v-icon>
              {{
                [shop?.house_no, shop?.building, shop?.street, shop?.barangay, shop?.city, shop?.province, shop?.region, shop?.postal]
                  .filter(Boolean)
                  .join(", ")
              }}
            </p>
          </div>
        </v-container>

        <!-- Mini Map -->
        <v-container>
          <h3 class="text-h6 mb-2">Location</h3>
          <div id="shop-map"></div>
        </v-container>

        <!-- Products -->
        <v-divider></v-divider>
        <v-container>
          <h3 class="text-h6 mb-2">Products</h3>

          <template v-if="loading">
            <v-skeleton-loader v-for="i in 4" :key="i" type="image, text" class="mb-4" />
          </template>

          <template v-else-if="products.length === 0">
            <div class="empty-card">
              <div class="empty-title">No products yet</div>
              <div class="empty-sub">This shop hasn’t added products.</div>
            </div>
          </template>

          <template v-else>
            <div class="product-grid">
              <div
                v-for="item in products"
                :key="item.id"
                class="product-card"
                @click="router.push(`/product/${item.id}`)"
              >
                <v-img :src="item.img" height="140" cover />
                <div class="product-info">
                  <div class="product-title">{{ item.title }}</div>
                  <div class="product-price">₱{{ Number(item.price).toFixed(2) }}</div>
                  <div class="product-sold">{{ item.sold }} sold</div>
                </div>
              </div>
            </div>
          </template>
        </v-container>

        <v-alert v-if="errorMsg" type="error" class="ma-4">
          {{ errorMsg }}
        </v-alert>
      </v-container>
    </v-main>

    <!-- Bottom Navigation -->
    <BottomNav v-model="activeTab" />
  </v-app>
</template>

<style scoped>
.top-text {
  font-size: 19px;
  font-weight: 400;
  margin-left: -2px;
}
.cover-photo {
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
}
.avatar-wrapper {
  display: flex;
  justify-content: center;
  margin-top: -48px;
}
.avatar-border {
  border: 4px solid #fff;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  background: #fff;
}
#shop-map {
  width: 100%;
  height: 250px;
  border-radius: 12px;
  margin-bottom: 16px;
}
.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
.product-card {
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,.05);
  cursor: pointer;
  transition: transform 0.2s;
}
.product-card:hover {
  transform: translateY(-2px);
}
.product-info {
  padding: 8px;
}
.product-title {
  font-size: 13px;
  font-weight: 500;
  color: #111827;
  margin-bottom: 2px;
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
.empty-card {
  background: #f9fafb;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
}
.empty-title {
  font-weight: 700;
  color: #1f2937;
}
.empty-sub {
  font-size: 12px;
  color: #6b7280;
}
</style>
