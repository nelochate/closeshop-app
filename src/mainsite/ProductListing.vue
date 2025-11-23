<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const goBack = () => router.back()

type Product = {
  id: string
  prod_name: string
  prod_description: string
  price: number
  stock: number
  main_img_urls: string[]
  sizes: string[]
  varieties: any[]
  image: string
}

const products = ref<Product[]>([])
const loading = ref(true)
const deleting = ref(false)

const confirmDialog = ref(false)
const productToDelete = ref<Product | null>(null)

const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref<'success' | 'error'>('success')

const showSnackbar = (msg: string, type: 'success' | 'error') => {
  snackbarMessage.value = msg
  snackbarColor.value = type
  snackbar.value = true
}

// Fetch products
const fetchProducts = async () => {
  loading.value = true
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    showSnackbar('Please log in to manage products', 'error')
    loading.value = false;
    return
  }

  const { data: shop } = await supabase
    .from('shops')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!shop) {
    showSnackbar('No shop found for your account', 'error')
    products.value = [];
    loading.value = false;
    return
  }

  const { data, error } = await supabase
    .from('products')
    .select('id, prod_name, prod_description, price, stock, main_img_urls, sizes, varieties')
    .eq('shop_id', shop.id)

  if (!error && data) {
    products.value = data.map((p: any) => ({
      ...p,
      image: p.main_img_urls?.[0] || 'https://via.placeholder.com/300',
      varieties: p.varieties || []
    }))
  } else if (error) {
    showSnackbar('Error loading products', 'error')
  }
  loading.value = false
}

const requestDelete = (product: Product) => {
  productToDelete.value = product
  confirmDialog.value = true
}

// Delete product with RLS-aware error handling
const deleteProductConfirmed = async () => {
  if (!productToDelete.value) return
  const productId = productToDelete.value.id
  deleting.value = true

  try {
    // First, verify the current user and their shop
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: userShop } = await supabase
      .from('shops')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (!userShop) throw new Error('No shop found for your account')

    // Verify this product belongs to the user's shop
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('shop_id')
      .eq('id', productId)
      .single()

    if (productError) throw new Error('Product not found')
    if (product.shop_id !== userShop.id) throw new Error('You do not own this product')

    console.log('User shop ID:', userShop.id, 'Product shop ID:', product.shop_id)

    // Delete from referencing tables first
    const referenceTables = [
      { name: 'cart_items', column: 'product_id' },
      { name: 'order_items', column: 'product_id' },
      { name: 'reviews', column: 'product_id' }
    ]

    for (const table of referenceTables) {
      const { error: deleteRefError } = await supabase
        .from(table.name)
        .delete()
        .eq(table.column, productId)

      if (deleteRefError && !deleteRefError.message.includes('0 rows')) {
        console.warn(`Could not delete from ${table.name}:`, deleteRefError.message)
      }
    }

    // Now delete the product
    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)

    if (deleteError) {
      console.error('Delete error details:', deleteError)

      if (deleteError.code === '42501') {
        throw new Error('Permission denied by RLS policy. You may not have delete permissions for this product.')
      } else if (deleteError.code === '23503') {
        throw new Error('Product is still referenced in other tables. Please try again.')
      } else {
        throw new Error(`Database error: ${deleteError.message}`)
      }
    }

    // Update UI
    products.value = products.value.filter(p => p.id !== productId)
    showSnackbar('✅ Product deleted successfully', 'success')

  } catch (err: any) {
    console.error('Delete failed:', err)

    // More user-friendly error messages
    let userMessage = err.message
    if (err.message.includes('RLS policy')) {
      userMessage = 'Permission denied. Please check if you have the correct RLS policies set up.'
    } else if (err.message.includes('not own')) {
      userMessage = 'You do not have permission to delete this product.'
    }

    showSnackbar(`❌ ${userMessage}`, 'error')
  } finally {
    deleting.value = false
    confirmDialog.value = false
    productToDelete.value = null
  }
}

const editProduct = (id: string) => {
  // Navigate to additem page with product ID as a route param
  router.push({ name: 'AddItem', params: { id } })
}


onMounted(fetchProducts)
</script>

<template>
  <v-app>
    <v-app-bar flat color="primary" dark>
      <v-btn icon @click="goBack"><v-icon>mdi-arrow-left</v-icon></v-btn>
      <v-toolbar-title class="text-h6">Product List</v-toolbar-title>
    </v-app-bar>

    <v-main>
      <v-container class="py-6">
        <v-btn color="primary" rounded="lg" prepend-icon="mdi-plus" class="mb-6" @click="router.push('/additem')">
          Add New Item
        </v-btn>

        <div v-if="loading" class="text-center py-6">
          <v-progress-circular indeterminate color="primary" />
          <div class="mt-2">Loading products...</div>
        </div>

        <v-row v-else>
          <v-col v-for="product in products" :key="product.id" cols="12" sm="6" md="4">
            <v-card rounded="xl" elevation="3" class="mb-4">
              <v-img v-if="product.image" :src="product.image" aspect-ratio="1" cover />

              <v-card-title class="text-h6">{{ product.prod_name }}</v-card-title>
              <v-card-subtitle class="text-h6 font-weight-bold">₱{{ product.price }}</v-card-subtitle>
              <v-card-text>{{ product.prod_description }}</v-card-text>

              <v-card-actions>
                <v-btn color="blue" variant="text" @click="editProduct(product.id)">
                  <v-icon start>mdi-pencil</v-icon>Edit
                </v-btn>


                <v-btn color="red" variant="text" @click="requestDelete(product)"
                  :loading="deleting && productToDelete?.id === product.id">
                  <v-icon start>mdi-delete</v-icon>Delete
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>

        <!-- Confirm Delete Dialog -->
        <v-dialog v-model="confirmDialog" max-width="500" persistent>
          <v-card>
            <v-card-title class="text-h6 d-flex align-center">
              <v-icon color="red" class="mr-2">mdi-alert</v-icon>
              Confirm Delete
            </v-card-title>
            <v-card-text>
              <div class="mb-3">
                Are you sure you want to delete <strong>"{{ productToDelete?.prod_name }}"</strong>?
              </div>
              <v-alert type="warning" density="compact">
                This will permanently remove the product and cannot be undone.
              </v-alert>
            </v-card-text>
            <v-card-actions class="justify-end">
              <v-btn variant="text" @click="confirmDialog = false" :disabled="deleting">
                Cancel
              </v-btn>
              <v-btn color="red" @click="deleteProductConfirmed" :loading="deleting">
                <v-icon start>mdi-delete</v-icon>
                Delete Permanently
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Snackbar -->
        <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="5000" location="bottom right" rounded="lg">
          <v-icon start>
            {{ snackbarColor === 'success' ? 'mdi-check' : 'mdi-alert' }}
          </v-icon>
          {{ snackbarMessage }}
        </v-snackbar>
      </v-container>
    </v-main>
  </v-app>
</template>
