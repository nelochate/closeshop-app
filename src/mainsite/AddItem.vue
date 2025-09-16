<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

// Router
const router = useRouter()
const goBack = () => router.back()

// Form state
const productName = ref('')
const description = ref('')
const price = ref<number | null>(null)
const stock = ref<number | null>(null)
const category = ref('')
const categories = ['Clothing', 'Food', 'Electronics', 'Accessories']

// Sizes
const availableSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
const selectedSizes = ref<string[]>([])

// Product image
const productImage = ref<File | null>(null)

// Varieties
type Variety = { id: number; name: string; price: number }
const varieties = ref<Variety[]>([])

const addVariety = () => {
  varieties.value.push({
    id: Date.now(),
    name: `New Variety ${varieties.value.length + 1}`,
    price: 0,
  })
}

// Submit form
const submitForm = () => {
  console.log('Form submitted:', {
    productName: productName.value,
    description: description.value,
    price: price.value,
    stock: stock.value,
    category: category.value,
    sizes: selectedSizes.value,
    image: productImage.value,
    varieties: varieties.value,
  })

  // TODO: Send to Supabase
  router.push('/products')
}
</script>

<template>
  <v-app>
    <!-- Top Bar -->
    <v-app-bar flat color="primary" dark>
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-h6">Add Product</v-toolbar-title>
    </v-app-bar>

    <v-main>
      <v-container class="py-6">
        <v-form @submit.prevent="submitForm">
          <!--add product photo can add multiple or 5 piccture can zoom in and out each one-->
          <v-img></v-img>
          <!-- Product Info -->
          <v-text-field v-model="productName" label="Product Name" variant="outlined" required />
          <v-textarea v-model="description" label="Description" variant="outlined" rows="3" />
          <v-text-field
            v-model="price"
            label="Price"
            type="number"
            prefix="₱"
            variant="outlined"
            required
          />

          <v-text-field v-model="stock" label="Stock Quantity" type="number" variant="outlined" />
          <v-select
            v-model="category"
            :items="categories"
            label="Category"
            variant="outlined"
            required
          />
          
          

          <!-- Sizes -->
          <v-label class="mt-4 mb-2 font-medium">Available Sizes</v-label>
          <v-row>
            <v-col v-for="size in availableSizes" :key="size" cols="6" sm="4" md="2">
              <v-checkbox
                v-model="selectedSizes"
                :label="size"
                :value="size"
                density="comfortable"
              />
            </v-col>
          </v-row>

          <!-- Varieties Section -->
          <v-card class="mt-6" rounded="xl" elevation="2">
            <v-card-title class="d-flex justify-between">
              <strong>Varieties</strong>
              <v-btn size="small" color="primary" variant="tonal" @click="addVariety">
                <v-icon start>mdi-plus</v-icon> Add
              </v-btn>
            </v-card-title>

            <v-divider />

            <v-card-text>
              <div v-if="varieties.length === 0" class="text-body-2 text-grey">
                No varieties yet.
              </div>

              <v-row v-else>
                <v-col v-for="variety in varieties" :key="variety.id" cols="12" sm="6" md="4">
                  <v-card class="pa-3" rounded="lg" elevation="1">
                    <!-- Image Upload -->
                    <v-file-input
                      v-model="productImage"
                      label="Upload Product Image"
                      accept="image/*"
                      variant="outlined"
                      prepend-icon="mdi-image"
                    />
                    
                     <v-text-area v-model="variety.price"
                      label="Description"
                      type="text"
                      prefix="₱"
                      variant="outlined"
                      density="comfortable"
                      hide-details>
                      
                    </v-text-area>
                    <v-text-field
                      v-model="variety.price"
                      label="Price"
                      type="number"
                      prefix="₱"
                      variant="outlined"
                      density="comfortable"
                      hide-details
                    />
                  </v-card>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>

          <!-- Submit -->
          <v-btn
            type="submit"
            color="primary"
            rounded="lg"
            prepend-icon="mdi-content-save"
            class="mt-4"
          >
            Save Product
          </v-btn>
        </v-form>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.font-medium {
  font-weight: 500;
}
</style>
