<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const goBack = () => router.back()

// ✅ Single products ref with showVarieties and image
const products = ref([
  {
    id: 1,
    name: 'Sample Product 1',
    price: 199,
    description: 'Description here',
    image: 'https://via.placeholder.com/300', // main product image
    showVarieties: false, // toggling state
    varieties: [
      { id: 1, name: 'Small', price: 149, image: '' },
      { id: 2, name: 'Large', price: 249, image: '' }
    ]
  },
  {
    id: 2,
    name: 'Sample Product 2',
    price: 299,
    description: 'Another description',
    image: 'https://via.placeholder.com/300',
    showVarieties: false,
    varieties: []
  }
])

// delete product
const deleteProduct = (id: number) => {
  products.value = products.value.filter(p => p.id !== id)
}

// edit product
const editProduct = (id: number) => {
  router.push(`/products/edit/${id}`)
}

// choose main product
const chooseProduct = (product: any) => {
  console.log('Chosen product:', product)
  // later -> router.push(`/checkout/${product.id}`)
}

// choose a variety
const chooseVariety = (product: any, variety: any) => {
  console.log(`Chosen variety: ${variety.name} of product: ${product.name}`)
  // later -> router.push(`/checkout/${product.id}?variety=${variety.id}`)
}
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

        <!-- Product List -->
        <v-row>
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
              <v-card-title class="text-h6">{{ product.name }}</v-card-title>
              <v-card-subtitle class="text-body-2">
                ₱{{ product.price }}
              </v-card-subtitle>
              <v-card-text class="text-body-2">
                {{ product.description }}
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
                      v-for="variety in product.varieties"
                      :key="variety.id"
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
                          v-if="variety.image"
                          :src="variety.image"
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
