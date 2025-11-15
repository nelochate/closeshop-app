<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/utils/supabase'

const pendingShops = ref<any[]>([])
const loadingShops = ref(false)

const fetchPendingShops = async () => {
  loadingShops.value = true
  try {
    const { data, error } = await supabase
      .from('shops')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) throw error
    pendingShops.value = data
  } catch (err) {
    console.error(err)
  } finally {
    loadingShops.value = false
  }
}

const updateShopStatus = async (id: string, status: 'approved' | 'declined') => {
  try {
    const { error } = await supabase.from('shops').update({ status }).eq('id', id)
    if (error) throw error
    pendingShops.value = pendingShops.value.filter(shop => shop.id !== id)
    alert(`Shop ${status} successfully!`)
  } catch (err) {
    alert('Failed to update shop status: ' + err.message)
  }
}

onMounted(fetchPendingShops)
</script>

<template>
  <v-container>
    <v-card>
      <v-card-title>
        <v-icon color="primary" class="mr-2">mdi-store-check</v-icon>
        <span class="text-h5">Pending Shop Registrations</span>
      </v-card-title>

      <v-card-text>
        <v-progress-circular
          v-if="loadingShops"
          indeterminate
          color="primary"
          size="40"
          class="d-flex mx-auto my-6"
        />

        <v-simple-table v-else>
          <thead>
            <tr>
              <th>Shop Name</th>
              <th>Owner ID</th>
              <th>Address</th>
              <th>Delivery Options</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="shop in pendingShops" :key="shop.id">
              <td>{{ shop.business_name }}</td>
              <td>{{ shop.owner_id }}</td>
              <td>{{ shop.detected_address || shop.street + ', ' + shop.barangay }}</td>
              <td>{{ shop.delivery_options.join(', ') }}</td>
              <td>
                <v-btn color="success" small @click="updateShopStatus(shop.id, 'approved')">Approve</v-btn>
                <v-btn color="error" small @click="updateShopStatus(shop.id, 'declined')">Decline</v-btn>
              </td>
            </tr>
          </tbody>
        </v-simple-table>

        <v-alert v-if="!pendingShops.length && !loadingShops" type="info">
          No pending shop registrations.
        </v-alert>
      </v-card-text>
    </v-card>
  </v-container>
</template>
