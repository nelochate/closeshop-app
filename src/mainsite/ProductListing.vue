<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const goBack = () => router.back()

// product type
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

// state
const products = ref<Product[]>([])
const loading = ref(true)

// delete dialog state
const confirmDialog = ref(false)
const productToDelete = ref<Product | null>(null)

// snackbar state
const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref<'success' | 'error'>('success')

const showSnackbar = (message: string, type: 'success' | 'error') => {
  snackbarMessage.value = message
  snackbarColor.value = type
  snackbar.value = true
}

// fetch products
const fetchProducts = async () => {
  loading.value = true
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    loading.value = false
    return
  }

  // ✅ get shop id
  const { data: shop } = await supabase.from('shops').select('id').eq('owner_id', user.id).maybeSingle()
  if (!shop) {
    products.value = []
    loading.value = false
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
      varieties: p.varieties || [],
    }))
  }
  loading.value = false
}

// open delete confirm
const requestDelete = (product: Product) => {
  productToDelete.value = product
  confirmDialog.value = true
}

// delete confirmed (with storage cleanup)
const deleteProductConfirmed = async () => {
  if (!productToDelete.value) return
  const id = productToDelete.value.id

  try {
    // 🔹 fetch product first to know its images
    const { data: product, error: fetchError } = await supabase
      .from('products')
      .select('main_img_urls, varieties')
      .eq('id', id)
      .single()

    if (!fetchError && product) {
      // collect all images
      const allUrls: string[] = []
      if (product.main_img_urls) allUrls.push(...product.main_img_urls)
      if (product.varieties) {
        for (const v of product.varieties) {
          if (v.images) allUrls.push(...v.images)
        }
      }

      // convert URLs → relative paths inside bucket
      const paths = allUrls
        .map((url: string) => {
          const parts = url.split('/product_lists/')
          return parts[1] ? parts[1] : null
        })
        .filter((p: string | null) => p !== null) as string[]

      if (paths.length) {
        const { error: storageError } = await supabase.storage.from('product_lists').remove(paths)
        if (storageError) console.warn('⚠️ Some images not removed:', storageError.message)
      }
    }

    // 🔹 delete product row
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) throw error

    // update local state
    products.value = products.value.filter((p) => p.id !== id)
    showSnackbar('✅ Product deleted successfully', 'success')
  } catch (err: any) {
    console.error('❌ Error deleting product:', err.message)
    showSnackbar('❌ Failed to delete product', 'error')
  } finally {
    confirmDialog.value = false
    productToDelete.value = null
  }
}

// edit product
const editProduct = (id: string) => {
  router.push(`/additem/${id}`)
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
        <v-btn
          color="primary"
          rounded="lg"
          prepend-icon="mdi-plus"
          class="mb-6"
          @click="router.push('/additem')"
        >
          Add New Item
        </v-btn>

        <!-- Loading -->
        <div v-if="loading" class="text-center py-6">
          <v-progress-circular indeterminate color="primary"></v-progress-circular>
        </div>

        <!-- Products -->
        <v-row v-else>
          <v-col v-for="product in products" :key="product.id" cols="12" sm="6" md="4">
            <v-card rounded="xl" elevation="3" class="mb-4">
              <v-img v-if="product.image" :src="product.image" aspect-ratio="1" cover />
              <v-card-title>{{ product.prod_name }}</v-card-title>
              <v-card-subtitle>₱{{ product.price }}</v-card-subtitle>
              <v-card-text>{{ product.prod_description }}</v-card-text>

              <v-card-actions>
                <v-btn color="blue" variant="text" @click="editProduct(product.id)">
                  <v-icon start>mdi-pencil</v-icon>Edit
                </v-btn>
                <v-btn color="red" variant="text" @click="requestDelete(product)">
                  <v-icon start>mdi-delete</v-icon>Delete
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>

        <!-- Confirm Delete Dialog -->
        <v-dialog v-model="confirmDialog" max-width="400">
          <v-card>
            <v-card-title class="text-h6">Confirm Delete</v-card-title>
            <v-card-text>
              Are you sure you want to delete
              <strong>{{ productToDelete?.prod_name }}</strong
              >? This action cannot be undone.
            </v-card-text>
            <v-card-actions class="justify-end">
              <v-btn text @click="confirmDialog = false">Cancel</v-btn>
              <v-btn color="red" @click="deleteProductConfirmed">Delete</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Snackbar -->
        <v-snackbar
          v-model="snackbar"
          :color="snackbarColor"
          timeout="3000"
          location="bottom right"
          rounded="lg"
        >
          {{ snackbarMessage }}
        </v-snackbar>
      </v-container>
    </v-main>
  </v-app>
</template>
