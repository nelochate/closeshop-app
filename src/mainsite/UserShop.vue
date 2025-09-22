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
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) throw new Error('User not logged in')

    // fetch shop info
    const { data, error } = await supabase
      .from('shops')
      .select(
        'business_name, description, logo_url, open_time, close_time, barangay, building, street, house_no, postal',
      )
      .eq('id', user.id) // ✅ correct column
      .maybeSingle()

    if (error) throw error

    console.log('Shop info:', data)

    // assign values to display
    businessName.value = data?.business_name || 'No name'
    description.value = data?.description || 'No description provided'
    timeOpen.value = data?.open_time || 'N/A'
    timeClose.value = data?.close_time || 'N/A'
    businessAvatar.value = data?.logo_url || ''

    // build full address string
    address.value = [
      data?.house_no,
      data?.building,
      data?.street,
      data?.barangay,
      'Butuan City',
      'Agusan del Norte',
      'CARAGA',
      data?.postal,
    ]
      .filter(Boolean)
      .join(', ')

    isOpen.value = true
  } catch (err: any) {
    console.error('Error loading shop info:', err.message, err)
  }
}

onMounted(fetchShopData)

// delete shop btn
const deleteShop = async () => {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('User not found')

    // Delete shop from DB
    const { error } = await supabase.from('shops').delete().eq('id', user.id)
    if (error) throw error

    // Optionally, delete the logo image
    if (businessAvatar.value) {
      const oldPath = businessAvatar.value.split('/storage/v1/object/public/Profile/')[1]
      if (oldPath) await supabase.storage.from('Profile').remove([oldPath])
    }

    // Reset state
    businessAvatar.value = ''
    businessName.value = ''
    description.value = ''
    timeOpen.value = ''
    timeClose.value = ''
    address.value = ''
    isOpen.value = false

    alert('Shop deleted successfully')
  } catch (err) {
    console.error(err)
    alert('Failed to delete shop')
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

      <!-- Dropdown menu -->
      <v-menu>
        <template #activator="{ props }">
          <v-btn icon v-bind="props">
            <v-icon>mdi-menu</v-icon>
          </v-btn>
        </template>

        <v-list>
          <v-list-item to="/edit-shop">
            <v-list-item-title>
              <v-icon start small>mdi-pencil</v-icon>
              Edit Shop
            </v-list-item-title>
          </v-list-item>

          <v-list-item @click="deleteShop">
            <v-list-item-title>
              <v-icon start small>mdi-delete</v-icon>
              Delete Shop
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </v-app-bar>

    <v-main>
      <!-- Business Info Section -->
      <v-container class="py-6">
        <v-sheet rounded="xl" elevation="4" class="pa-6 text-center">
          <!-- Avatar -->
          <div class="relative inline-block">
            <v-avatar size="96">
              <v-img v-if="businessAvatar" :src="businessAvatar" cover />
              <v-icon v-else size="48">mdi-store</v-icon>
            </v-avatar>
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

          <p class="mt-2 text-body-2"><v-icon start small>mdi-map-marker</v-icon> {{ address }}</p>
        </v-sheet>
      </v-container>

      <!-- Transaction Section -->
      <v-divider thickness="3">Transaction</v-divider>

      <v-container class="py-4">
        <v-btn color="primary" rounded="lg" class="mb-4" to="/productlist"> My Product </v-btn>

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
