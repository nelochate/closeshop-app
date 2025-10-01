<script setup>
import { ref, onMounted, computed } from "vue"
import { supabase } from "@/utils/supabase"


// router instance
const users = ref([])
const search = ref("")
const loading = ref(false)
const errorMessage = ref("")
const deleting = ref(false)

// ✅ Fetch all profiles with auth emails
const fetchUsers = async () => {
  loading.value = true
  try {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })

    if (profilesError) throw profilesError

    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
    if (authError) throw authError

    users.value = profiles.map(profile => {
      const authUser = authUsers.users.find(u => u.id === profile.id)
      return {
        ...profile,
        email: authUser?.email || "No email",
        created_at: new Date(profile.created_at).toLocaleDateString()
      }
    })
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    loading.value = false
  }
}

// ✅ Delete user (profile + auth)
const deleteUser = async (id) => {
  if (!confirm("Are you sure you want to delete this user?")) return

  deleting.value = true
  try {
    await supabase.from("profiles").delete().eq("id", id)
    await supabase.auth.admin.deleteUser(id)

    users.value = users.value.filter(u => u.id !== id)
    alert("✅ User deleted successfully")
  } catch (error) {
    alert("❌ Error deleting user: " + error.message)
  } finally {
    deleting.value = false
  }
}

// ✅ Simple search
const filteredUsers = computed(() => {
  if (!search.value) return users.value
  const term = search.value.toLowerCase()
  return users.value.filter(u =>
    u.name?.toLowerCase().includes(term) ||
    u.email?.toLowerCase().includes(term) ||
    u.phone?.toLowerCase().includes(term) ||
    u.role?.toLowerCase().includes(term)
  )
})

const getRoleColor = (role) => {
  return role === "admin" ? "red"
    : role === "seller" ? "blue"
    : role === "customer" ? "green"
    : "grey"
}

onMounted(fetchUsers)
</script>

<template>
  <v-container>
    <v-card>
      <v-card-title>
        <v-icon color="primary" class="mr-2">mdi-account-cog</v-icon>
        <span class="text-h5">User Management</span>
        <v-spacer></v-spacer>
        <v-text-field
          v-model="search"
          append-icon="mdi-magnify"
          label="Search users..."
          dense outlined hide-details
          style="max-width: 250px"
        />
      </v-card-title>

      <v-card-text>
        <v-progress-circular
          v-if="loading"
          indeterminate
          color="primary"
          size="40"
          class="d-flex mx-auto my-6"
        />

        <v-table v-else-if="users.length > 0">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Role</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in filteredUsers" :key="user.id">
              <td>{{ user.name || "No name" }}</td>
              <td>{{ user.email }}</td>
              <td>{{ user.phone || "No phone" }}</td>
              <td>
                <v-chip :color="getRoleColor(user.role)" small dark>
                  {{ user.role }}
                </v-chip>
              </td>
              <td>{{ user.created_at }}</td>
              <td>
                <v-btn
                  color="error"
                  size="small"
                  variant="outlined"
                  :disabled="user.role === 'admin'"
                  :loading="deleting"
                  @click="deleteUser(user.id)"
                >
                  <v-icon small>mdi-delete</v-icon>
                  Delete
                </v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>

        <v-alert v-else type="info">No users found.</v-alert>
      </v-card-text>
    </v-card>
  </v-container>
</template>
