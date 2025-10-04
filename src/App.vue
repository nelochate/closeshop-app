<script setup>
import { onMounted } from 'vue'
import { useCartStore } from '@/stores/cart'

const cart = useCartStore()

onMounted(() => {
  cart.init()   // ✅ load cart once
})
console.log("✅ VITE_SUPABASE_URL:", import.meta.env.VITE_SUPABASE_URL)
</script>


<template>
<RouterView/>

</template>
