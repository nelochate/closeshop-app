<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const goBack = () => router.back()

// state
const businessAvatar = ref('')
const businessName = ref('')
const description = ref('')
const timeOpen = ref('')
const timeClose = ref('')
const isOpen = ref(false)
const address = ref('')

// transactions
const transactionFilter = ref('Orders')
const transactionOptions = ['Orders', 'Completed', 'Cancelled']

// fetch shop data
const fetchShopData = async () => {
  try {
    // get current user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser()

    if (userError || !user) throw new Error('User not logged in')

    // fetch shop info
    const { data, error } = await supabase
      .from('shops')
      .select('business_name, description, logo_url, open_time, close_time, address')
      .eq('id', user.id)
      .maybeSingle() // ✅ safer than .single()

    if (error) throw error

    console.log('Shop info:', data)

    // assign values to display
    businessName.value = data?.business_name || 'No name'
    description.value = data?.description || 'No description provided'
    timeOpen.value = data?.open_time || 'N/A'
    timeClose.value = data?.close_time || 'N/A'
    address.value = data?.address || 'No address set'
    businessAvatar.value = data?.logo_url || ''
    isOpen.value = true
  } catch (err: any) {
    console.error('Error loading shop info:', err.message, err)
  }
}


onMounted(fetchShopData)

//delete shop btn
const deleteShop = async () => {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('User not found')

    // Delete shop from DB
    const { error } = await supabase.from('shops').delete().eq('user_id', user.id)
    if (error) throw error

    // Optionally, delete the logo image
    if (avatarUrl.value) {
      const oldPath = avatarUrl.value.split('/storage/v1/object/public/Profile/')[1]
      if (oldPath) await supabase.storage.from('Profile').remove([oldPath])
    }

    // Reset form
    avatarUrl.value = null
    shopName.value = ''
    description.value = ''
    openTime.value = ''
    closeTime.value = ''
    showSnackbar('Shop deleted successfully', 'success')
  } catch (err) {
    console.error(err)
    showSnackbar('Failed to delete shop', 'error')
  }
}
</script>

<template>
  <v-app>
    <!-- Top Bar -->
    <v-app-bar flat color="primary" dark>
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-h6">Business Profile</v-toolbar-title>

      <div float="end">
                <v-btn color="error" class="shop-btn" @click="deleteShop"> Delete Shop </v-btn>

      </div>
    </v-app-bar>

    <v-main>
      <!-- Business Info Section -->
      <v-container class="py-6">
        <v-sheet rounded="xl" elevation="4" class="pa-6 text-center">
          <!-- Avatar with edit button -->
          <div class="relative inline-block">
            <v-avatar size="96">
              <v-img v-if="businessAvatar" :src="businessAvatar" cover />
              <v-icon v-else size="48">mdi-store</v-icon>
            </v-avatar>
            <v-btn
              icon
              size="small"
              color="primary"
              class="absolute bottom-0 right-0"
            >
              <v-icon>mdi-camera</v-icon>
            </v-btn>
          </div>

          <h2 class="text-h6 mt-4">{{ businessName }}</h2>
          <p class="text-body-2 text-medium-emphasis">{{ description }}</p>

          <!-- Business hours -->
          <div class="mt-2">
            <p><strong>Opens:</strong> {{ timeOpen }}</p>
            <p><strong>Closes:</strong> {{ timeClose }}</p>
            <v-btn
              size="small"
              :color="isOpen ? 'green' : 'red'"
              class="mt-2"
              @click="isOpen = !isOpen"
            >
              {{ isOpen ? 'Open' : 'Closed' }}
            </v-btn>
          </div>

          <p class="mt-2 text-body-2">
            <v-icon start small>mdi-map-marker</v-icon> {{ address }}
          </p>
        </v-sheet>
      </v-container>

      <!-- Transaction Section -->
      <v-divider thickness="3">Transaction</v-divider>

      <v-container class="py-4">
        <v-btn color="primary" rounded="lg" class="mb-4" to="/productlist">
          My Product
        </v-btn>

        <v-select
          v-model="transactionFilter"
          :items="transactionOptions"
          label="Filter Transactions"
          variant="outlined"
          density="comfortable"
        />
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.relative {
  position: relative;
}
.inline-block {
  display: inline-block;
}
.absolute {
  position: absolute;
}
.bottom-0 {
  bottom: 0;
}
.right-0 {
  right: 0;
}
</style>
