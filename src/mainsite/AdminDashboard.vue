<script setup>
import { ref, onMounted, computed } from "vue"
import { supabase } from "@/utils/supabase"
import { useRouter } from "vue-router"

const router = useRouter()
const currentUser = ref(null)
const users = ref([])
const loading = ref(false)
const errorMessage = ref("")
const search = ref("")
const deleteDialog = ref(false)
const selectedUser = ref(null)
const deleting = ref(false)

// Fetch current logged-in user's profile
const fetchCurrentUser = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push("/login")
      return
    }

    // Get profile role
    const { data, error } = await supabase
      .from("profiles")
      .select("id, role, name, email")
      .eq("id", user.id)
      .single()

    if (error) throw error

    currentUser.value = data

    // Redirect if not admin
    if (data.role !== "admin") {
      router.push("/")
    }
  } catch (error) {
    errorMessage.value = error.message
  }
}

// Fetch all profiles (users) with auth email
const fetchUsers = async () => {
  loading.value = true
  errorMessage.value = ""

  try {
    // Get all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })

    if (profilesError) throw profilesError

    // Get auth users to match emails
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
    if (authError) throw authError

    // Combine profile data with auth email
    users.value = profiles.map(profile => {
      const authUser = authUsers.users.find(user => user.id === profile.id)
      return {
        ...profile,
        email: authUser?.email || 'No email',
        created_at: new Date(profile.created_at).toLocaleDateString()
      }
    })

  } catch (error) {
    errorMessage.value = error.message
    console.error("Error fetching users:", error)
  } finally {
    loading.value = false
  }
}

// Confirm delete user
const confirmDelete = (user) => {
  selectedUser.value = user
  deleteDialog.value = true
}

// Delete user and all their data
const deleteUser = async () => {
  if (!selectedUser.value) return

  deleting.value = true
  try {
    // First delete user data from all related tables
    await deleteUserData(selectedUser.value.id)

    // Then delete the user from auth
    const { error: authError } = await supabase.auth.admin.deleteUser(selectedUser.value.id)
    if (authError) throw authError

    // Remove from local state
    users.value = users.value.filter(user => user.id !== selectedUser.value.id)

    // Show success message
    errorMessage.value = ""
    alert("✅ User deleted successfully!")

  } catch (error) {
    console.error("Error deleting user:", error)
    errorMessage.value = `Error deleting user: ${error.message}`
  } finally {
    deleting.value = false
    deleteDialog.value = false
    selectedUser.value = null
  }
}

// Delete user data from all related tables
const deleteUserData = async (userId) => {
  const tables = ['addresses', 'cart_items', 'orders', 'reviews']

  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('user_id', userId)

    if (error) {
      console.warn(`Error deleting from ${table}:`, error)
    }
  }

  // Delete user's profile last
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId)

  if (error) {
    console.warn('Error deleting profile:', error)
    throw error
  }
}

// Filter users based on search
const filteredUsers = computed(() => {
  if (!search.value) return users.value

  const searchTerm = search.value.toLowerCase()
  return users.value.filter(user =>
    user.name?.toLowerCase().includes(searchTerm) ||
    user.email?.toLowerCase().includes(searchTerm) ||
    user.phone?.toLowerCase().includes(searchTerm) ||
    user.role?.toLowerCase().includes(searchTerm)
  )
})

// Get role color for badges
const getRoleColor = (role) => {
  const colors = {
    admin: 'red',
    seller: 'blue',
    customer: 'green'
  }
  return colors[role] || 'grey'
}

onMounted(async () => {
  await fetchCurrentUser()
  await fetchUsers()
})
</script>

<template>
  <v-container>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon large color="primary" class="mr-2">mdi-account-cog</v-icon>
        <span class="text-h4">Admin Dashboard - User Management</span>
        <v-spacer></v-spacer>

        <v-text-field
          v-model="search"
          append-icon="mdi-magnify"
          label="Search users..."
          single-line
          hide-details
          outlined
          dense
          class="ml-4"
          style="max-width: 300px;"
        ></v-text-field>
      </v-card-title>

      <v-alert v-if="errorMessage" type="error" class="ma-4">
        {{ errorMessage }}
      </v-alert>

      <v-card-text>
        <v-progress-circular
          v-if="loading && users.length === 0"
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
              <td>{{ user.name || 'No name' }}</td>
              <td>{{ user.email }}</td>
              <td>{{ user.phone || 'No phone' }}</td>
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
                  @click="confirmDelete(user)"
                  :disabled="user.role === 'admin'"
                  :loading="deleting && selectedUser?.id === user.id"
                >
                  <v-icon small>mdi-delete</v-icon>
                  Delete
                </v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>

        <v-alert v-else type="info" class="ma-4">
          No users found.
        </v-alert>
      </v-card-text>
    </v-card>

    <!-- Delete Confirmation Dialog -->
    <v-dialog v-model="deleteDialog" max-width="500">
      <v-card>
        <v-card-title class="headline">Confirm User Deletion</v-card-title>
        <v-card-text>
          <p>Are you sure you want to delete user <strong>{{ selectedUser?.name }}</strong>?</p>
          <p class="text-caption text--secondary">
            Email: {{ selectedUser?.email }}<br>
            Role: {{ selectedUser?.role }}
          </p>
          <v-alert type="warning" dense class="mt-2">
            ⚠️ This will permanently delete all user data including orders, addresses, and reviews.
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey" text @click="deleteDialog = false" :disabled="deleting">
            Cancel
          </v-btn>
          <v-btn color="error" text @click="deleteUser" :loading="deleting">
            Delete User
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.v-table {
  margin-top: 20px;
}

.v-table th {
  font-weight: bold;
  background-color: #f5f5f5;
}

.v-table tbody tr:hover {
  background-color: #fafafa;
}
</style>
