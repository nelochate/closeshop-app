<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import { useAuthUserStore } from '@/stores/authUser'
import { adminNavigationItems } from './adminNavigation'
import {
  fetchAdminApprovalNotificationSnapshot,
  fetchCurrentAdminContext,
  formatAdminDateTime,
  getAdminDisplayName,
  type AdminApprovalAlert,
  type AdminProfile,
} from './services/adminService'

const router = useRouter()
const route = useRoute()
const authStore = useAuthUserStore()

const drawer = ref(false)
const loadingAccess = ref(true)
const accessError = ref('')
const adminProfile = ref<AdminProfile | null>(null)
const logoutDialog = ref(false)
const notificationMenu = ref(false)
const loadingApprovalAlerts = ref(true)
const approvalAlerts = ref<AdminApprovalAlert[]>([])
const pendingApprovalSummary = ref({
  shops: 0,
  riders: 0,
})
const unreadApprovalAlertIds = ref<string[]>([])
const approvalSnackbar = ref({
  show: false,
  text: '',
  entityType: 'shop' as AdminApprovalAlert['entityType'],
})

let shopApprovalChannel: any = null
let riderApprovalChannel: any = null

const activeSection = computed(() => String(route.meta.adminSection || 'dashboard'))
const pageTitle = computed(() => String(route.meta.adminTitle || 'Admin Dashboard'))
const pageSubtitle = computed(() =>
  String(route.meta.adminSubtitle || 'Manage shops, riders, orders, and platform health from one place.'),
)

const adminDisplayName = computed(() => getAdminDisplayName(adminProfile.value))
const adminEmail = computed(() => adminProfile.value?.email || 'admin@closeshop.local')
const pendingApprovalCount = computed(
  () => pendingApprovalSummary.value.shops + pendingApprovalSummary.value.riders,
)
const pendingApprovalBadge = computed(() =>
  pendingApprovalCount.value > 99 ? '99+' : pendingApprovalCount.value,
)
const hasUnreadApprovalAlerts = computed(() => unreadApprovalAlertIds.value.length > 0)
const approvalMenuSummary = computed(() => {
  const { shops, riders } = pendingApprovalSummary.value

  if (!shops && !riders) {
    return 'New shop and rider approvals will appear here.'
  }

  if (shops && riders) {
    return `${pluralize(shops, 'shop')} and ${pluralize(riders, 'rider')} waiting for review.`
  }

  if (shops) {
    return `${pluralize(shops, 'shop')} waiting for review.`
  }

  return `${pluralize(riders, 'rider')} waiting for review.`
})

const adminInitials = computed(() => {
  const label = adminDisplayName.value.trim()

  if (!label) return 'AD'

  const parts = label.split(/\s+/).filter(Boolean)
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
})

const pluralize = (value: number, singular: string) =>
  `${value} ${value === 1 ? singular : `${singular}s`}`

const getAlertIcon = (entityType: AdminApprovalAlert['entityType']) =>
  entityType === 'shop' ? 'mdi-storefront-outline' : 'mdi-bike-fast'

const getApprovalRoute = (entityType: AdminApprovalAlert['entityType']) =>
  entityType === 'shop'
    ? { name: 'admin-shops', query: { status: 'pending' } }
    : { name: 'admin-riders', query: { status: 'pending' } }

const isAlertUnread = (alertId: string) => unreadApprovalAlertIds.value.includes(alertId)

const goTo = async (to: any) => {
  drawer.value = false
  await router.push(to)
}

const goToApprovalRoute = async (entityType: AdminApprovalAlert['entityType']) => {
  notificationMenu.value = false
  approvalSnackbar.value.show = false
  await goTo(getApprovalRoute(entityType))
}

const openApprovalAlert = async (alert: AdminApprovalAlert) => {
  unreadApprovalAlertIds.value = unreadApprovalAlertIds.value.filter((alertId) => alertId !== alert.id)
  await goToApprovalRoute(alert.entityType)
}

const showApprovalSnackbar = (
  text: string,
  entityType: AdminApprovalAlert['entityType'],
) => {
  approvalSnackbar.value.show = false
  approvalSnackbar.value.text = text
  approvalSnackbar.value.entityType = entityType

  window.setTimeout(() => {
    approvalSnackbar.value.show = true
  }, 30)
}

const applyApprovalNotificationSnapshot = (
  snapshot: Awaited<ReturnType<typeof fetchAdminApprovalNotificationSnapshot>>,
  options: {
    highlightId?: string | null
  } = {},
) => {
  const availableAlertIds = new Set(snapshot.alerts.map((alert) => alert.id))
  let nextUnreadAlertIds = unreadApprovalAlertIds.value.filter((alertId) =>
    availableAlertIds.has(alertId),
  )

  if (
    options.highlightId &&
    availableAlertIds.has(options.highlightId) &&
    !notificationMenu.value &&
    !nextUnreadAlertIds.includes(options.highlightId)
  ) {
    nextUnreadAlertIds = [options.highlightId, ...nextUnreadAlertIds]
  }

  unreadApprovalAlertIds.value = nextUnreadAlertIds.slice(0, 24)
  approvalAlerts.value = snapshot.alerts
  pendingApprovalSummary.value = {
    shops: snapshot.pendingShopApprovals,
    riders: snapshot.pendingRiderApprovals,
  }
}

const refreshApprovalNotifications = async (
  options: {
    highlightId?: string | null
    toastText?: string
    toastEntityType?: AdminApprovalAlert['entityType']
  } = {},
) => {
  try {
    const snapshot = await fetchAdminApprovalNotificationSnapshot()
    applyApprovalNotificationSnapshot(snapshot, {
      highlightId: options.highlightId || null,
    })

    if (options.toastText && options.toastEntityType && !notificationMenu.value) {
      showApprovalSnackbar(options.toastText, options.toastEntityType)
    }
  } catch (error) {
    console.error('Failed to refresh admin approval alerts:', error)
  } finally {
    loadingApprovalAlerts.value = false
  }
}

const cleanupApprovalChannels = () => {
  if (shopApprovalChannel) {
    supabase.removeChannel(shopApprovalChannel)
    shopApprovalChannel = null
  }

  if (riderApprovalChannel) {
    supabase.removeChannel(riderApprovalChannel)
    riderApprovalChannel = null
  }
}

const subscribeToApprovalChannels = () => {
  cleanupApprovalChannels()

  shopApprovalChannel = supabase
    .channel('admin-dashboard-shops')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shops' }, async (payload) => {
      const isNewPendingShop =
        payload.eventType === 'INSERT' && String(payload.new?.status || 'pending') === 'pending'

      await refreshApprovalNotifications({
        highlightId: isNewPendingShop ? `shop:${payload.new?.id}` : null,
        toastText: isNewPendingShop
          ? `${payload.new?.business_name || 'A new shop application'} needs approval.`
          : '',
        toastEntityType: 'shop',
      })
    })
    .subscribe()

  riderApprovalChannel = supabase
    .channel('admin-dashboard-riders')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'Rider_Registration' },
      async (payload) => {
        const isNewPendingRider =
          payload.eventType === 'INSERT' && String(payload.new?.status || 'pending') === 'pending'
        const riderName =
          [payload.new?.first_name, payload.new?.last_name].filter(Boolean).join(' ').trim() ||
          payload.new?.email ||
          'A new rider application'

        await refreshApprovalNotifications({
          highlightId: isNewPendingRider ? `rider:${String(payload.new?.rider_id)}` : null,
          toastText: isNewPendingRider ? `${riderName} needs rider approval.` : '',
          toastEntityType: 'rider',
        })
      },
    )
    .subscribe()
}

const handleLogout = async () => {
  try {
    cleanupApprovalChannels()

    await authStore.signOut()

    adminProfile.value = null
    notificationMenu.value = false
    approvalAlerts.value = []
    unreadApprovalAlertIds.value = []
    pendingApprovalSummary.value = {
      shops: 0,
      riders: 0,
    }
    approvalSnackbar.value.show = false
    logoutDialog.value = false
    await router.replace({ name: 'login' })
  } catch (error: any) {
    accessError.value = error?.message || 'Failed to log out right now.'
  }
}

const bootstrapAdminShell = async () => {
  loadingAccess.value = true
  accessError.value = ''
  loadingApprovalAlerts.value = true
  approvalAlerts.value = []
  pendingApprovalSummary.value = {
    shops: 0,
    riders: 0,
  }
  unreadApprovalAlertIds.value = []
  cleanupApprovalChannels()

  try {
    const { user, profile } = await fetchCurrentAdminContext()

    if (!user) {
      router.replace('/')
      return
    }

    if (profile?.role !== 'admin') {
      router.replace('/homepage')
      return
    }

    adminProfile.value = profile
    await refreshApprovalNotifications()
    subscribeToApprovalChannels()
  } catch (error: any) {
    console.error('Failed to initialize admin shell:', error)
    accessError.value = error?.message || 'Failed to verify admin access.'
  } finally {
    loadingAccess.value = false
  }
}

watch(notificationMenu, (isOpen) => {
  if (isOpen) {
    unreadApprovalAlertIds.value = []
  }
})

onMounted(() => {
  bootstrapAdminShell()
})

onBeforeUnmount(() => {
  cleanupApprovalChannels()
})
</script>

<template>
  <v-app>
    <v-navigation-drawer
      v-model="drawer"
      temporary
      location="left"
      width="292"
      class="admin-drawer"
    >
      <div class="admin-drawer__header">
        <v-icon size="28" color="primary">mdi-shield-crown-outline</v-icon>
        <div>
          <div class="admin-drawer__title">Closeshop Admin</div>
          <div class="admin-drawer__subtitle">Management workspace</div>
        </div>
      </div>

      <v-list nav density="comfortable" class="px-2">
        <v-list-item
          v-for="item in adminNavigationItems"
          :key="item.key"
          rounded="xl"
          class="mb-1"
          :active="activeSection === item.key"
          @click="goTo(item.to)"
        >
          <template #prepend>
            <v-icon :icon="item.icon" />
          </template>
          <v-list-item-title class="font-weight-bold">
            {{ item.label }}
          </v-list-item-title>
          <v-list-item-subtitle>
            {{ item.description }}
          </v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-app-bar class="admin-app-bar" flat height="76">
      <template #prepend>
        <v-app-bar-nav-icon class="d-md-none" @click="drawer = true" />
      </template>

      <button class="admin-brand" type="button" @click="goTo({ name: 'admin-dashboard' })">
        <span class="admin-brand__logo">
          <v-icon size="22" color="white">mdi-shield-crown-outline</v-icon>
        </span>
        <span class="admin-brand__copy">
          <strong>Closeshop Admin</strong>
          <small>Control center</small>
        </span>
      </button>

      <div class="admin-top-nav d-none d-md-flex">
        <v-btn
          v-for="item in adminNavigationItems"
          :key="item.key"
          variant="text"
          rounded="xl"
          class="admin-top-nav__btn"
          :class="{ 'admin-top-nav__btn--active': activeSection === item.key }"
          @click="goTo(item.to)"
        >
          <v-icon start size="18">{{ item.icon }}</v-icon>
          {{ item.label }}
        </v-btn>
      </div>

      <v-spacer />

      <v-menu v-model="notificationMenu" location="bottom end" offset="10">
        <template #activator="{ props }">
          <v-btn
            v-bind="props"
            icon
            variant="text"
            class="mr-1 admin-notification-btn"
            :class="{ 'admin-notification-btn--active': hasUnreadApprovalAlerts }"
          >
            <v-badge
              :content="pendingApprovalBadge"
              :model-value="pendingApprovalCount > 0"
              color="warning"
              offset-x="6"
              offset-y="6"
            >
              <v-icon color="white">
                {{ hasUnreadApprovalAlerts ? 'mdi-bell-ring-outline' : 'mdi-bell-outline' }}
              </v-icon>
            </v-badge>
          </v-btn>
        </template>

        <v-card min-width="320" max-width="380" rounded="xl" class="admin-notification-menu">
          <div class="admin-notification-menu__header">
            <div>
              <strong>Approval alerts</strong>
              <p>{{ approvalMenuSummary }}</p>
            </div>

            <v-chip v-if="pendingApprovalCount > 0" color="warning" variant="tonal" size="small">
              {{ pendingApprovalCount }}
            </v-chip>
          </div>

          <v-divider />

          <div v-if="loadingApprovalAlerts" class="admin-notification-menu__state">
            <v-skeleton-loader type="list-item-two-line@3" class="w-100" />
          </div>

          <div v-else-if="approvalAlerts.length === 0" class="admin-notification-menu__state">
            <v-icon size="28" color="success">mdi-bell-check-outline</v-icon>
            <strong>No approval alerts</strong>
            <p>New shops and rider registrations waiting for approval will appear here.</p>
          </div>

          <v-list v-else lines="two" class="py-0">
            <v-list-item
              v-for="alert in approvalAlerts"
              :key="alert.id"
              class="admin-notification-menu__item"
              @click="openApprovalAlert(alert)"
            >
              <template #prepend>
                <v-avatar
                  size="36"
                  :color="alert.entityType === 'shop' ? 'primary' : 'warning'"
                  class="mr-3"
                >
                  <v-icon color="white" size="18">{{ getAlertIcon(alert.entityType) }}</v-icon>
                </v-avatar>
              </template>

              <v-list-item-title class="admin-notification-menu__item-title">
                {{ alert.title }}
              </v-list-item-title>

              <v-list-item-subtitle class="admin-notification-menu__item-subtitle">
                {{ alert.message }}
              </v-list-item-subtitle>

              <template #append>
                <div class="admin-notification-menu__item-meta">
                  <v-chip
                    v-if="isAlertUnread(alert.id)"
                    color="success"
                    variant="tonal"
                    size="x-small"
                  >
                    New
                  </v-chip>
                  <span>{{ formatAdminDateTime(alert.createdAt) }}</span>
                </div>
              </template>
            </v-list-item>
          </v-list>

        </v-card>
      </v-menu>

      <v-menu location="bottom end" offset="10">
        <template #activator="{ props }">
          <v-btn v-bind="props" variant="text" rounded="xl" class="admin-profile-trigger">
            <v-avatar size="36" color="white" class="admin-profile-trigger__avatar">
              <span class="text-primary font-weight-bold">{{ adminInitials }}</span>
            </v-avatar>
            <div class="admin-profile-trigger__copy d-none d-sm-flex">
              <strong>{{ adminDisplayName }}</strong>
              <small>{{ adminEmail }}</small>
            </div>
            <v-icon end color="white">mdi-chevron-down</v-icon>
          </v-btn>
        </template>

        <v-card min-width="260" rounded="xl">
          <v-list>
            <v-list-item>
              <template #prepend>
                <v-avatar size="40" color="primary">
                  <span class="text-white font-weight-bold">{{ adminInitials }}</span>
                </v-avatar>
              </template>
              <v-list-item-title class="font-weight-bold">{{ adminDisplayName }}</v-list-item-title>
              <v-list-item-subtitle>{{ adminEmail }}</v-list-item-subtitle>
            </v-list-item>

            <v-divider class="my-2" />

            <v-list-item @click="goTo({ name: 'admin-dashboard' })">
              <template #prepend>
                <v-icon>mdi-view-dashboard-outline</v-icon>
              </template>
              <v-list-item-title>Open Overview</v-list-item-title>
            </v-list-item>

            <v-list-item @click="goTo({ name: 'admin-shops' })">
              <template #prepend>
                <v-icon>mdi-storefront-outline</v-icon>
              </template>
              <v-list-item-title>Manage Shops</v-list-item-title>
            </v-list-item>

            <v-list-item @click="goTo({ name: 'admin-riders' })">
              <template #prepend>
                <v-icon>mdi-bike-fast</v-icon>
              </template>
              <v-list-item-title>Manage Riders</v-list-item-title>
            </v-list-item>

            <v-divider class="my-2" />

            <v-list-item class="text-error" @click="logoutDialog = true">
              <template #prepend>
                <v-icon color="error">mdi-logout</v-icon>
              </template>
              <v-list-item-title>Logout</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-card>
      </v-menu>
    </v-app-bar>

    <v-main class="admin-shell-main">
      <div v-if="loadingAccess" class="admin-shell-state">
        <v-progress-circular indeterminate color="primary" size="52" />
        <p>Opening admin workspace...</p>
      </div>

      <div v-else-if="accessError" class="admin-shell-state">
        <v-card class="admin-shell-error" rounded="xl">
          <v-card-text class="text-center py-10 px-6">
            <v-icon size="54" color="error">mdi-alert-circle-outline</v-icon>
            <h2 class="mt-4 text-h6 font-weight-bold">Admin access unavailable</h2>
            <p class="mt-2 text-medium-emphasis">{{ accessError }}</p>
            <v-btn color="primary" rounded="lg" class="mt-4" @click="bootstrapAdminShell">
              Retry
            </v-btn>
          </v-card-text>
        </v-card>
      </div>

      <v-container v-else class="admin-shell-container">
        <section class="admin-shell-hero">
          <div class="admin-shell-hero__copy">
            <h1 class="admin-shell-hero__title">{{ pageTitle }}</h1>
            <p class="admin-shell-hero__subtitle">{{ pageSubtitle }}</p>
          </div>

          <div class="admin-shell-hero__meta">
            <v-chip color="white" variant="outlined" size="small" class="admin-shell-hero__chip">
              <v-icon start size="16">mdi-shield-check-outline</v-icon>
              Secure admin session
            </v-chip>

            <v-chip
              v-if="pendingApprovalCount > 0"
              color="warning"
              variant="flat"
              size="small"
              class="admin-shell-hero__chip admin-shell-hero__chip--warning"
            >
              <v-icon start size="16">mdi-bell-alert-outline</v-icon>
              {{ pluralize(pendingApprovalCount, 'approval') }} waiting
            </v-chip>
          </div>
        </section>

        <nav class="admin-shell-mobile-nav d-md-none" aria-label="Admin sections">
          <button
            v-for="item in adminNavigationItems"
            :key="item.key"
            type="button"
            class="admin-shell-mobile-nav__item"
            :class="{ 'admin-shell-mobile-nav__item--active': activeSection === item.key }"
            @click="goTo(item.to)"
          >
            <v-icon size="18">{{ item.icon }}</v-icon>
            <span>{{ item.label }}</span>
          </button>
        </nav>

        <RouterView />
      </v-container>
    </v-main>

    <v-snackbar v-model="approvalSnackbar.show" color="primary" location="top right" timeout="4800">
      {{ approvalSnackbar.text }}

      <template #actions>
        <v-btn variant="text" @click="goToApprovalRoute(approvalSnackbar.entityType)">
          Review
        </v-btn>
      </template>
    </v-snackbar>

    <v-dialog v-model="logoutDialog" max-width="420" persistent>
      <v-card rounded="xl">
        <v-card-title class="d-flex align-center px-5 py-4">
          <v-icon color="primary" class="mr-3">mdi-logout</v-icon>
          <span class="text-subtitle-1 font-weight-bold">Confirm Logout</span>
          <v-spacer />
          <v-btn icon size="small" @click="logoutDialog = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>

        <v-divider />

        <v-card-text class="px-5 py-5">
          Leave the admin dashboard and sign out of this account?
        </v-card-text>

        <v-card-actions class="px-5 pb-5">
          <v-btn variant="outlined" rounded="lg" @click="logoutDialog = false">
            Cancel
          </v-btn>
          <v-spacer />
          <v-btn color="error" rounded="lg" @click="handleLogout">
            Logout
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-app>
</template>

<style scoped>
.admin-drawer :deep(.v-navigation-drawer__content) {
  background: linear-gradient(180deg, #f8fbff 0%, #eef4fb 100%);
}

.admin-drawer__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 22px 18px 12px;
}

.admin-drawer__title {
  color: #0f172a;
  font-weight: 800;
}

.admin-drawer__subtitle {
  color: #64748b;
  font-size: 0.85rem;
}

.admin-app-bar {
  padding-top: var(--app-safe-area-top, env(safe-area-inset-top, 0px));
  padding-left: max(10px, var(--app-safe-area-left, env(safe-area-inset-left, 0px)));
  padding-right: max(10px, var(--app-safe-area-right, env(safe-area-inset-right, 0px)));
  background: linear-gradient(135deg, #284384 0%, #1d4ed8 55%, #2563eb 100%) !important;
  color: white !important;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.18) !important;
}

.admin-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.admin-brand__logo {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.16);
}

.admin-brand__copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.08;
}

.admin-brand__copy strong {
  color: white;
  font-size: 0.95rem;
  font-weight: 800;
}

.admin-brand__copy small {
  color: rgba(219, 234, 254, 0.88);
  font-size: 0.75rem;
}

.admin-top-nav {
  margin-left: 18px;
  align-items: center;
  gap: 4px;
}

.admin-top-nav__btn {
  color: rgba(255, 255, 255, 0.88);
  font-weight: 700;
  text-transform: none;
}

.admin-top-nav__btn--active {
  background: rgba(255, 255, 255, 0.14);
  color: white;
}

.admin-notification-btn {
  color: white;
}

.admin-notification-btn--active {
  background: rgba(255, 255, 255, 0.14);
}

.admin-notification-menu {
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.16);
}

.admin-notification-menu__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 14px;
}

.admin-notification-menu__header strong {
  display: block;
  color: #0f172a;
  font-size: 0.96rem;
  font-weight: 800;
}

.admin-notification-menu__header p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 0.84rem;
  line-height: 1.5;
}

.admin-notification-menu__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 20px 18px;
  text-align: center;
}

.admin-notification-menu__state strong {
  color: #0f172a;
  font-size: 0.94rem;
  font-weight: 800;
}

.admin-notification-menu__state p {
  margin: 0;
  color: #64748b;
  line-height: 1.55;
}

.admin-notification-menu__item {
  align-items: flex-start;
  padding-top: 12px;
  padding-bottom: 12px;
}

.admin-notification-menu__item-title {
  color: #0f172a;
  font-size: 0.9rem;
  font-weight: 700;
}

.admin-notification-menu__item-subtitle {
  margin-top: 4px;
  color: #64748b;
  white-space: normal;
  line-height: 1.5;
}

.admin-notification-menu__item-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  color: #64748b;
  font-size: 0.72rem;
  text-align: right;
}

.admin-profile-trigger {
  min-height: 48px;
  padding-inline: 8px 12px;
  color: white;
  text-transform: none;
}

.admin-profile-trigger__avatar {
  margin-right: 10px;
}

.admin-profile-trigger__copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  margin-right: 4px;
}

.admin-profile-trigger__copy strong,
.admin-profile-trigger__copy small {
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-profile-trigger__copy strong {
  color: white;
  font-size: 0.84rem;
}

.admin-profile-trigger__copy small {
  color: rgba(219, 234, 254, 0.88);
  font-size: 0.73rem;
}

.admin-shell-main {
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(96, 165, 250, 0.18), transparent 28%),
    linear-gradient(180deg, #f8fafc 0%, #eef4fb 100%);
}

.admin-shell-container {
  max-width: 1320px;
  padding:
    26px
    max(16px, var(--app-safe-area-right, env(safe-area-inset-right, 0px)))
    calc(30px + var(--app-safe-area-bottom, env(safe-area-inset-bottom, 0px)))
    max(16px, var(--app-safe-area-left, env(safe-area-inset-left, 0px))) !important;
}

.admin-shell-state {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #475569;
}

.admin-shell-error {
  max-width: 520px;
  width: calc(100% - 32px);
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.08);
}

.admin-shell-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
  margin-bottom: 22px;
  padding: 22px;
  border-radius: 28px;
  background:
    radial-gradient(circle at top right, rgba(147, 197, 253, 0.34), transparent 34%),
    linear-gradient(135deg, #20479c 0%, #1d4ed8 58%, #2563eb 100%);
  color: white;
  box-shadow: 0 18px 40px rgba(29, 78, 216, 0.18);
}

.admin-shell-hero__copy {
  flex: 1 1 340px;
  min-width: 0;
}

.admin-shell-hero__eyebrow {
  margin: 0 0 8px;
  color: rgba(219, 234, 254, 0.9);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-shell-hero__title {
  margin: 0;
  font-size: clamp(1.4rem, 3vw, 2.15rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.05;
}

.admin-shell-hero__subtitle {
  max-width: 58ch;
  margin: 10px 0 0;
  color: rgba(239, 246, 255, 0.92);
  line-height: 1.6;
}

.admin-shell-hero__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  min-width: 0;
}

.admin-shell-hero__chip {
  font-weight: 700;
}

.admin-shell-hero__chip--warning {
  color: #422006;
}

.admin-shell-mobile-nav {
  display: flex;
  gap: 10px;
  margin: -6px 0 18px;
  padding-bottom: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}

.admin-shell-mobile-nav::-webkit-scrollbar {
  display: none;
}

.admin-shell-mobile-nav__item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 12px 16px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
  color: #0f172a;
  font-weight: 700;
}

.admin-shell-mobile-nav__item--active {
  border-color: rgba(37, 99, 235, 0.24);
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  color: #1d4ed8;
}

@media (max-width: 959px) {
  .admin-shell-hero__meta {
    width: 100%;
    align-items: flex-start;
  }
}

@media (max-width: 600px) {
  .admin-brand__copy small,
  .admin-profile-trigger__copy {
    display: none;
  }

  .admin-shell-container {
    padding-top: 18px !important;
  }

  .admin-shell-hero {
    gap: 14px;
    padding: 18px;
    border-radius: 24px;
  }

  .admin-shell-hero__subtitle {
    margin-top: 8px;
    font-size: 0.94rem;
  }

}
</style>
