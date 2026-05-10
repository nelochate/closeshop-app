import type { RouteLocationRaw } from 'vue-router'

export type AdminNavItem = {
  key: string
  label: string
  icon: string
  description: string
  to: RouteLocationRaw
}

export const adminNavigationItems: AdminNavItem[] = [
  {
    key: 'dashboard',
    label: 'Overview',
    icon: 'mdi-view-dashboard-outline',
    description: 'Platform overview and approval queue',
    to: { name: 'admin-dashboard' },
  },
  {
    key: 'shops',
    label: 'Shops',
    icon: 'mdi-storefront-outline',
    description: 'Shop approvals, moderation, and details',
    to: { name: 'admin-shops' },
  },
  {
    key: 'riders',
    label: 'Riders',
    icon: 'mdi-bike-fast',
    description: 'Rider approvals and status management',
    to: { name: 'admin-riders' },
  },
  {
    key: 'analytics',
    label: 'Analytics',
    icon: 'mdi-chart-box-outline',
    description: 'Revenue previews and platform metrics',
    to: { name: 'admin-analytics' },
  },
]
