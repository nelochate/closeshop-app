<script setup>
import { ref, onMounted } from "vue"
import { supabase } from "@/utils/supabase"
import { useRouter } from "vue-router"

const router = useRouter()
const currentUser = ref(null)
const users = ref([])
const loading = ref(false)
const errorMessage = ref("")

// Fetch current logged-in user's profile
const fetchCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    router.push("/login")
    return
  }

  // Get profile role
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, name")
    .eq("id", user.id)
    .single()

  if (error) {
    errorMessage.value = error.message
    return
  }

  currentUser.value = data

  // Redirect if not admin
  if (data.role !== "admin") {
    router.push("/") // send them to home page
  }
}

// Fetch all profiles (users)
const fetchUsers = async () => {
  loading.value = true
  const { data, error } = await supabase.from("profiles").select("*")
  if (error) {
    errorMessage.value = error.message
  } else {
    users.value = data
  }
  loading.value = false
}

// Delete user
const deleteUser = async (id) => {
  if (!confirm("Are you sure you want to delete this user?")) return
  const { error } = await supabase.from("profiles").delete().eq("id", id)
  if (error) {
    alert("❌ " + error.message)
  } else {
    users.value = users.value.filter((u) => u.id !== id)
    alert("✅ User deleted successfully!")
  }
}

onMounted(async () => {
  await fetchCurrentUser()
  await fetchUsers()
})
</script>

<template>
  <v-container>
    <h2 class="text-h4 mb-4">⚙️ Admin Dashboard</h2>

    <v-alert v-if="errorMessage" type="error" class="mb-4">
      {{ errorMessage }}
    </v-alert>

    <v-progress-circular
      v-if="loading"
      indeterminate
      color="primary"
      size="40"
      class="d-flex mx-auto my-6"
    />

    <v-table v-else>
      <thead>
        <tr>
          <th>Name</th>
          <th>Phone</th>
          <th>Role</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="user in users" :key="user.id">
          <td>{{ user.name }}</td>
          <td>{{ user.phone }}</td>
          <td>{{ user.role }}</td>
          <td>
            <v-btn
              color="error"
              size="small"
              variant="outlined"
              @click="deleteUser(user.id)"
              :disabled="user.role === 'admin'"  
            >
              Delete
            </v-btn>
          </td>
        </tr>
      </tbody>
    </v-table>
  </v-container>
</template>
