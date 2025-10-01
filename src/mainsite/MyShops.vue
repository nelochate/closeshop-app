<script setup lang="ts">
import { ref, onMounted } from "vue"
import { useRouter } from "vue-router"
import { supabase } from "@/utils/supabase"
import BottomNav from "@/common/layout/BottomNav.vue"

const router = useRouter()
const shops = ref<any[]>([])
const loading = ref(true)
const errorMsg = ref("")

const fetchShops = async () => {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error("User not found")

    const { data, error } = await supabase
      .from("shops")
      .select("id, business_name, logo_url, city, province")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })

    if (error) throw error
    shops.value = data || []
  } catch (err: any) {
    console.error(err)
    errorMsg.value = err.message
  } finally {
    loading.value = false
  }
}

const goViewShop = (id: string) => {
  router.push({ name: "shop-view", params: { id } })
}

const goEditShop = (id: string) => {
  router.push({ name: "shop-build", params: { id } })
}

const goCreateShop = () => {
  router.push({ name: "shop-build" }) // no id = create mode
}

onMounted(fetchShops)
</script>

<template>
  <v-app>
    <v-app-bar color="#438fda" dark flat>
      <v-toolbar-title><strong>My Shops</strong></v-toolbar-title>
      <v-spacer />
      <v-btn icon @click="goCreateShop">
        <v-icon>mdi-plus</v-icon>
      </v-btn>
    </v-app-bar>

    <v-main>
      <v-container>
        <template v-if="loading">
          <v-skeleton-loader v-for="i in 3" :key="i" type="list-item-avatar" class="mb-2" />
        </template>

        <template v-else-if="errorMsg">
          <v-alert type="error" class="mt-4">{{ errorMsg }}</v-alert>
        </template>

        <template v-else-if="shops.length === 0">
          <v-alert type="info" class="mt-4">
            You don’t have any shops yet. Create your first one!
          </v-alert>
          <v-btn color="primary" class="mt-4" @click="goCreateShop">
            <v-icon start>mdi-store-plus</v-icon>
            Create New Shop
          </v-btn>
        </template>

        <v-list v-else>
          <v-list-item
            v-for="shop in shops"
            :key="shop.id"
            class="shop-card"
          >
            <v-avatar size="56" class="mr-3">
              <v-img v-if="shop.logo_url" :src="shop.logo_url" cover />
              <v-icon v-else size="32">mdi-store</v-icon>
            </v-avatar>

            <v-list-item-content>
              <v-list-item-title>{{ shop.business_name }}</v-list-item-title>
              <v-list-item-subtitle>
                {{ shop.city }}, {{ shop.province }}
              </v-list-item-subtitle>
            </v-list-item-content>

            <v-list-item-action>
              <v-btn size="small" variant="text" color="primary" @click="goViewShop(shop.id)">
                View
              </v-btn>
              <v-btn size="small" variant="text" color="secondary" @click="goEditShop(shop.id)">
                Edit
              </v-btn>
            </v-list-item-action>
          </v-list-item>
        </v-list>
      </v-container>
    </v-main>

    <BottomNav />
  </v-app>
</template>

<style scoped>
.shop-card {
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
}
</style>
