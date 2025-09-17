<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { createClient } from '@supabase/supabase-js'

// --- Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

const router = useRouter()
const goBack = () => router.back()

// products state
type Product = {
  id: number
  prod_name: string
  prod_description: string
  price: number
  stock: number
  main_img_urls: string[]   // stored as jsonb
  sizes: string[]           // stored as jsonb
  varieties: any[]          // stored as jsonb
  showVarieties: boolean
}

const products = ref<Product[]>([])
const loading = ref(true)

// fetch products from Supabase
const fetchProducts = async () => {
  loading.value = true
  const { data, error } = await supabase
    .from('products')
    .select('id, prod_name, prod_description, price, stock, main_img_urls, sizes, varieties')

  if (error) {
    console.error('❌ Error fetching products:', error.message)
  } else {
    products.value = (data || []).map((p: any) => ({
      ...p,
      image: p.main_img_urls?.[0] || 'https://via.placeholder.com/300', // use first image or fallback
      showVarieties: false,
      varieties: p.varieties || [] // ensure array
    }))
  }
  loading.value = false
}

// delete product
const deleteProduct = async (id: number) => {
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) {
    console.error('❌ Error deleting product:', error.message)
  } else {
    products.value = products.value.filter(p => p.id !== id)
  }
}

// edit product
const editProduct = (id: number) => {
  router.push(`/products/edit/${id}`)
}

// choose main product
const chooseProduct = (product: Product) => {
  console.log('Chosen product:', product)
  // example: router.push(`/checkout/${product.id}`)
}

// choose a variety
const chooseVariety = (product: Product, variety: any) => {
  console.log(`Chosen variety: ${variety.name} of product: ${product.prod_name}`)
  // example: router.push(`/checkout/${product.id}?variety=${variety.id}`)
}

// load products when component mounts
onMounted(fetchProducts)
</script>

<template>
  <v-app>
    <!-- Top Bar -->
    <v-app-bar flat color="primary" dark>
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-h6">Product List</v-toolbar-title>
    </v-app-bar>

    <v-main>
      <v-container class="py-6">
        <!-- Add Item Button -->
        <v-btn
          color="primary"
          rounded="lg"
          prepend-icon="mdi-plus"
          class="mb-6"
          @click="router.push('/additem')" 
        >
          Add New Item
        </v-btn>

        <!-- Loading state -->
        <div v-if="loading" class="text-center py-6">
          <v-progress-circular indeterminate color="primary"></v-progress-circular>
        </div>

        <!-- Product List -->
        <v-row v-else>
          <v-col
            v-for="product in products"
            :key="product.id"
            cols="12"
            sm="6"
            md="4"
          >
            <v-card rounded="xl" elevation="3" class="mb-4">
              <!-- Main Product Image -->
              <v-img
                v-if="product.image"
                :src="product.image"
                aspect-ratio="1"
                class="rounded-t-xl"
                cover
              >
                <!-- Expand Button Overlay -->
                <template #append>
                  <v-btn
                    icon
                    variant="tonal"
                    color="primary"
                    class="ma-2"
                    @click="product.showVarieties = !product.showVarieties"
                  >
                    <v-icon>
                      {{ product.showVarieties ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
                    </v-icon>
                  </v-btn>
                </template>
              </v-img>

              <!-- Product Info -->
              <v-card-title class="text-h6">{{ product.prod_name }}</v-card-title>
              <v-card-subtitle class="text-body-2">
                ₱{{ product.price }}
              </v-card-subtitle>
              <v-card-text class="text-body-2">
                {{ product.prod_description }}
              </v-card-text>

              <!-- Main Product Buy Button -->
              <v-card-actions>
                <v-btn
                  color="primary"
                  prepend-icon="mdi-cart"
                  @click="chooseProduct(product)"
                >
                  Choose Product
                </v-btn>
              </v-card-actions>

              <!-- Varieties Section (collapsible) -->
              <v-expand-transition>
                <div v-show="product.showVarieties" class="pa-3">
                  <h4 class="text-subtitle-2 mb-2">Varieties</h4>
                  <v-row dense>
                    <v-col
                      v-for="(variety, idx) in product.varieties"
                      :key="idx"
                      cols="12"
                      sm="6"
                    >
                      <v-card
                        rounded="lg"
                        elevation="1"
                        class="pa-2 hover:bg-grey-lighten-4"
                      >
                        <v-card-title class="text-body-2">{{ variety.name }}</v-card-title>
                        <v-card-subtitle class="text-body-2">
                          ₱{{ variety.price }}
                        </v-card-subtitle>
                        <v-img
                          v-if="variety.images && variety.images[0]"
                          :src="variety.images[0]"
                          aspect-ratio="1"
                          class="rounded-lg mt-2"
                          cover
                        />
                        <v-btn
                          color="secondary"
                          prepend-icon="mdi-cart"
                          size="small"
                          class="mt-2"
                          @click="chooseVariety(product, variety)"
                        >
                          Choose {{ variety.name }}
                        </v-btn>
                      </v-card>
                    </v-col>
                  </v-row>
                </div>
              </v-expand-transition>

              <!-- Admin Actions -->
              <v-card-actions>
                <v-btn color="blue" variant="text" @click="editProduct(product.id)">
                  <v-icon start>mdi-pencil</v-icon>Edit
                </v-btn>
                <v-btn color="red" variant="text" @click="deleteProduct(product.id)">
                  <v-icon start>mdi-delete</v-icon>Delete
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.varieties {
  margin-top: 16px;
}
</style>
