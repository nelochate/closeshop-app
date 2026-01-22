<template>
  <div class="status-view-wrapper">
    <!-- Debug Banner (Shows at top when debug mode is on) -->
    <div v-if="debugMode" class="debug-banner">
      <div class="debug-content">
        <div class="debug-row">
          <span class="debug-label">User ID:</span>
          <span class="debug-value">{{ userId || 'Not logged in' }}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Shop ID:</span>
          <span class="debug-value">{{ currentShopId || 'Not found' }}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Shop Owner:</span>
          <span class="debug-value">{{ shop?.owner_id || 'No shop' }}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Access:</span>
          <span class="debug-value" :class="{ 'access-granted': !accessDenied, 'access-denied': accessDenied }">
            {{ accessDenied ? 'DENIED' : 'GRANTED' }}
          </span>
        </div>
        <v-btn size="x-small" @click="debugMode = false" class="debug-close-btn">
          <v-icon size="12">mdi-close</v-icon>
        </v-btn>
      </div>
    </div>

    <!-- Header -->
    <div class="app-header">
      <div class="header-backdrop"></div>
      <div class="header-content">
        <v-btn 
          icon 
          @click="goBack"
          class="header-back-btn"
          size="small"
          variant="flat"
        >
          <v-icon size="20">mdi-chevron-left</v-icon>
        </v-btn>
        <div class="header-title">
          <h1>Shop Status</h1>
          <p class="subtitle">Complete shop information</p>
        </div>
        <div class="header-actions">
          <v-btn 
            icon 
            @click="fetchData"
            :loading="loading"
            size="small"
            variant="text"
            class="header-refresh-btn"
          >
            <v-icon size="20">mdi-refresh</v-icon>
          </v-btn>
          <!-- Debug toggle button -->
          <v-btn 
            icon 
            @click="debugMode = !debugMode"
            size="small"
            variant="text"
            class="debug-toggle-btn"
          >
            <v-icon size="20" :color="debugMode ? 'yellow' : 'white'">mdi-bug</v-icon>
          </v-btn>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <main class="main-content">
      <!-- Loading State -->
      <div v-if="loading" class="loading-container">
        <div class="loading-card">
          <div class="loading-spinner">
            <div class="spinner-ring"></div>
          </div>
          <h3>Loading Shop Status</h3>
          <p>Getting complete shop information...</p>
          <!-- Debug info in loading -->
          <div v-if="debugMode" class="debug-loading">
            <p>Current user: {{ userId || 'Not logged in' }}</p>
            <p>Looking for shop ID: {{ currentShopId || 'Not found' }}</p>
          </div>
        </div>
      </div>

      <!-- Authentication Required State -->
      <div v-else-if="!userId" class="auth-required-container">
        <div class="auth-required-card">
          <div class="auth-icon">
            <v-icon size="64" color="warning">mdi-shield-lock</v-icon>
          </div>
          <h3>Authentication Required</h3>
          <p>Please sign in to view your shop status.</p>
          <!-- Debug info for auth -->
          <div v-if="debugMode" class="debug-auth">
            <p>Detected shop ID: {{ currentShopId || 'None' }}</p>
            <p>User session: Not authenticated</p>
          </div>
          <div class="auth-actions">
            <v-btn 
              color="primary" 
              @click="goToLogin" 
              variant="flat"
              prepend-icon="mdi-login"
              size="large"
              class="login-btn"
            >
              Sign In
            </v-btn>
            <v-btn 
              color="secondary" 
              @click="goToHome" 
              variant="outlined"
              prepend-icon="mdi-home"
              class="home-btn"
            >
              Go to Homepage
            </v-btn>
          </div>
        </div>
      </div>

      <!-- Access Denied State -->
      <div v-else-if="accessDenied" class="access-denied-container">
        <div class="access-denied-card">
          <div class="access-denied-icon">
            <v-icon size="64" color="error">mdi-close-circle</v-icon>
          </div>
          <h3>Access Denied</h3>
          <p>You don't have permission to view this shop's status.</p>
          <!-- Debug info for access denied -->
          <div v-if="debugMode" class="debug-access">
            <div class="debug-grid">
              <div class="debug-item">
                <strong>Your User ID:</strong>
                <code>{{ userId }}</code>
                <v-btn size="x-small" @click="copyToClipboard(userId)" class="copy-btn">
                  <v-icon size="12">mdi-content-copy</v-icon>
                </v-btn>
              </div>
              <div class="debug-item">
                <strong>Shop Owner ID:</strong>
                <code>{{ shop?.owner_id || 'Unknown' }}</code>
                <v-btn size="x-small" @click="copyToClipboard(shop?.owner_id)" class="copy-btn" v-if="shop?.owner_id">
                  <v-icon size="12">mdi-content-copy</v-icon>
                </v-btn>
              </div>
              <div class="debug-item">
                <strong>Shop ID:</strong>
                <code>{{ currentShopId }}</code>
                <v-btn size="x-small" @click="copyToClipboard(currentShopId)" class="copy-btn">
                  <v-icon size="12">mdi-content-copy</v-icon>
                </v-btn>
              </div>
            </div>
          </div>
          <p class="access-note">Only the shop owner can view their shop status.</p>
          <div class="access-denied-actions">
            <v-btn 
              color="primary" 
              @click="goToMyShop" 
              variant="flat"
              prepend-icon="mdi-store"
              size="large"
              class="my-shop-btn"
            >
              Go to My Shop
            </v-btn>
            <v-btn 
              color="secondary" 
              @click="goToHome" 
              variant="outlined"
              prepend-icon="mdi-home"
              class="home-btn"
            >
              Go to Homepage
            </v-btn>
            <!-- Added Find My Shop button -->
            <v-btn 
              color="info" 
              @click="findMyShop" 
              variant="outlined"
              prepend-icon="mdi-magnify"
              class="find-shop-btn"
            >
              Find My Shop
            </v-btn>
          </div>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="error-container">
        <div class="error-card">
          <div class="error-icon">
            <v-icon size="64" color="error">mdi-alert-circle</v-icon>
          </div>
          <h3>Unable to Load</h3>
          <p>{{ error }}</p>
          <div class="debug-info" v-if="debugInfo">
            <details>
              <summary>Debug Information</summary>
              <pre>{{ JSON.stringify(debugInfo, null, 2) }}</pre>
            </details>
          </div>
          <div class="error-actions">
            <v-btn 
              color="primary" 
              @click="fetchData" 
              variant="flat"
              prepend-icon="mdi-refresh"
              class="action-btn"
            >
              Try Again
            </v-btn>
            <v-btn 
              color="secondary" 
              @click="goToHome" 
              variant="outlined"
              prepend-icon="mdi-home"
              class="action-btn"
            >
              Go Home
            </v-btn>
            <!-- Added Find My Shop button -->
            <v-btn 
              color="info" 
              @click="findMyShop" 
              variant="outlined"
              prepend-icon="mdi-magnify"
              class="action-btn"
            >
              Find My Shop
            </v-btn>
          </div>
        </div>
      </div>

      <!-- No Shop State -->
      <div v-else-if="!shop && !loading && !error && !accessDenied && userId" class="no-shop-container">
        <div class="no-shop-card">
          <div class="no-shop-icon">
            <v-icon size="64" color="warning">mdi-store-off</v-icon>
          </div>
          <h3>No Shop Found</h3>
          <p>You haven't created a shop yet.</p>
          <!-- Debug info for no shop -->
          <div v-if="debugMode" class="debug-no-shop">
            <p>Looking for shop owned by user: {{ userId }}</p>
            <p>Shop ID from URL/localStorage: {{ currentShopId || 'None' }}</p>
          </div>
          <div class="no-shop-actions">
            <v-btn 
              color="primary" 
              @click="createShop" 
              variant="flat"
              prepend-icon="mdi-plus-circle"
              size="large"
              class="create-btn"
            >
              Create New Shop
            </v-btn>
            <v-btn 
              color="secondary" 
              @click="goToHome" 
              variant="outlined"
              prepend-icon="mdi-home"
              class="home-btn"
            >
              Go to Homepage
            </v-btn>
            <!-- Added Find My Shop button -->
            <v-btn 
              color="info" 
              @click="findMyShop" 
              variant="outlined"
              prepend-icon="mdi-magnify"
              class="find-btn"
            >
              Search for My Shop
            </v-btn>
          </div>
        </div>
      </div>

      <!-- Shop Information -->
      <div v-else-if="shop && userId && !accessDenied" class="shop-info-container">
        <!-- Success Banner (only shows in debug mode) -->
        <div class="success-banner" v-if="debugMode">
          <div class="success-content">
            <v-icon size="16" color="success">mdi-check-circle</v-icon>
            <span>Access Granted - You are the owner of this shop</span>
            <div class="success-details">
              <small>User ID matches Shop Owner ID: {{ userId }}</small>
            </div>
          </div>
        </div>

        <!-- Status Banner -->
        <div class="status-banner" :style="{ background: statusColors.gradient }">
          <div class="banner-content">
            <div class="status-icon-wrapper">
              <div class="icon-circle">
                <v-icon 
                  size="32" 
                  color="white"
                  :class="{ 'pulse-icon': isPending }"
                >
                  {{ statusIcon }}
                </v-icon>
              </div>
            </div>
            <div class="status-text">
              <h2 class="status-title">{{ statusTitle }}</h2>
              <p class="status-subtitle">{{ statusMessage }}</p>
              <div class="shop-name-chip">
                <span class="shop-name">{{ shop.business_name }}</span>
                <div class="status-badge">
                  {{ shopStatus.toUpperCase() }}
                </div>
              </div>
              <div class="shop-id">
                <small>Shop ID: {{ shop.id }}</small>
                <v-btn 
                  size="x-small" 
                  variant="text" 
                  @click="copyToClipboard(shop.id)"
                  class="copy-id-btn"
                >
                  <v-icon size="14">mdi-content-copy</v-icon>
                </v-btn>
              </div>
              <div class="owner-verified">
                <v-icon size="14" color="white">mdi-shield-check</v-icon>
                <small>Owned by: {{ ownerProfile?.first_name || 'You' }} ({{ userId }})</small>
              </div>
              <!-- Debug links -->
              <div class="debug-shop-link" v-if="debugMode">
                <small>
                  <a href="#" @click.prevent="copyShopLink">Copy Direct Link</a> |
                  <a href="#" @click.prevent="reloadWithId">Reload with ID</a>
                </small>
              </div>
            </div>
          </div>
        </div>

        <!-- Shop Details -->
        <div class="shop-details">
          <!-- Basic Information Card -->
          <div class="info-card">
            <div class="card-header">
              <h3>
                <v-icon color="#3f83c7" size="20">mdi-storefront</v-icon>
                Basic Information
              </h3>
            </div>
            
            <div class="info-grid">
              <div class="info-row">
                <div class="info-label">
                  <v-icon size="16">mdi-store</v-icon>
                  Business Name
                </div>
                <div class="info-value">{{ shop.business_name || 'Not provided' }}</div>
              </div>
              
              <div class="info-row" v-if="shop.description">
                <div class="info-label">
                  <v-icon size="16">mdi-text</v-icon>
                  Description
                </div>
                <div class="info-value multiline">{{ shop.description }}</div>
              </div>
              
              <div class="info-row">
                <div class="info-label">
                  <v-icon size="16">mdi-calendar-check</v-icon>
                  Created At
                </div>
                <div class="info-value">
                  {{ formatDateTime(shop.created_at) }}
                </div>
              </div>
              
              <div class="info-row" v-if="shop.updated_at">
                <div class="info-label">
                  <v-icon size="16">mdi-calendar-sync</v-icon>
                  Updated At
                </div>
                <div class="info-value">
                  {{ formatDateTime(shop.updated_at) }}
                </div>
              </div>
            </div>
          </div>

          <!-- Address Information Card -->
          <div class="info-card">
            <div class="card-header">
              <h3>
                <v-icon color="#3f83c7" size="20">mdi-map-marker</v-icon>
                Address Information
              </h3>
              <v-chip size="small" v-if="shop.address_source" :color="getAddressSourceColor(shop.address_source)">
                {{ shop.address_source }}
              </v-chip>
            </div>
            
            <div class="info-grid">
              <div class="info-row" v-if="shop.house_no">
                <div class="info-label">
                  <v-icon size="16">mdi-home</v-icon>
                  House No.
                </div>
                <div class="info-value">{{ shop.house_no }}</div>
              </div>
              
              <div class="info-row" v-if="shop.building">
                <div class="info-label">
                  <v-icon size="16">mdi-office-building</v-icon>
                  Building
                </div>
                <div class="info-value">{{ shop.building }}</div>
              </div>
              
              <div class="info-row" v-if="shop.street">
                <div class="info-label">
                  <v-icon size="16">mdi-road</v-icon>
                  Street
                </div>
                <div class="info-value">{{ shop.street }}</div>
              </div>
              
              <div class="info-row" v-if="shop.barangay">
                <div class="info-label">
                  <v-icon size="16">mdi-city</v-icon>
                  Barangay
                </div>
                <div class="info-value">{{ shop.barangay }}</div>
              </div>
              
              <div class="info-row" v-if="shop.city">
                <div class="info-label">
                  <v-icon size="16">mdi-city</v-icon>
                  City
                </div>
                <div class="info-value">{{ shop.city }}</div>
              </div>
              
              <div class="info-row" v-if="shop.province">
                <div class="info-label">
                  <v-icon size="16">mdi-map</v-icon>
                  Province
                </div>
                <div class="info-value">{{ shop.province }}</div>
              </div>
              
              <div class="info-row" v-if="shop.region">
                <div class="info-label">
                  <v-icon size="16">mdi-earth</v-icon>
                  Region
                </div>
                <div class="info-value">{{ shop.region }}</div>
              </div>
              
              <div class="info-row" v-if="shop.postal">
                <div class="info-label">
                  <v-icon size="16">mdi-post</v-icon>
                  Postal Code
                </div>
                <div class="info-value">{{ shop.postal }}</div>
              </div>
              
              <div class="info-row" v-if="shop.detected_address">
                <div class="info-label">
                  <v-icon size="16">mdi-map-search</v-icon>
                  Detected Address
                </div>
                <div class="info-value multiline">{{ shop.detected_address }}</div>
              </div>
            </div>
          </div>

          <!-- Business Hours & Operations -->
          <div class="info-card">
            <div class="card-header">
              <h3>
                <v-icon color="#3f83c7" size="20">mdi-clock-time-four</v-icon>
                Business Hours & Operations
              </h3>
            </div>
            
            <div class="info-grid">
              <div class="info-row" v-if="shop.open_time">
                <div class="info-label">
                  <v-icon size="16">mdi-clock-out</v-icon>
                  Open Time
                </div>
                <div class="info-value">
                  {{ formatTime(shop.open_time) }}
                </div>
              </div>
              
              <div class="info-row" v-if="shop.close_time">
                <div class="info-label">
                  <v-icon size="16">mdi-clock-in</v-icon>
                  Close Time
                </div>
                <div class="info-value">
                  {{ formatTime(shop.close_time) }}
                </div>
              </div>
              
              <div class="info-row" v-if="shop.open_days && shop.open_days.length > 0">
                <div class="info-label">
                  <v-icon size="16">mdi-calendar-week</v-icon>
                  Open Days
                </div>
                <div class="info-value">
                  <div class="days-list">
                    <v-chip 
                      v-for="day in formattedOpenDays" 
                      :key="day"
                      size="small"
                      variant="outlined"
                      class="day-chip"
                    >
                      {{ day }}
                    </v-chip>
                  </div>
                </div>
              </div>
              
              <div class="info-row" v-if="shop.delivery_options && shop.delivery_options.length > 0">
                <div class="info-label">
                  <v-icon size="16">mdi-truck-delivery</v-icon>
                  Delivery Options
                </div>
                <div class="info-value">
                  <div class="delivery-options">
                    <v-chip 
                      v-for="option in shop.delivery_options" 
                      :key="option"
                      size="small"
                      color="primary"
                      variant="outlined"
                      class="option-chip"
                    >
                      {{ option }}
                    </v-chip>
                  </div>
                </div>
              </div>
              
              <div class="info-row" v-if="shop.meetup_details">
                <div class="info-label">
                  <v-icon size="16">mdi-handshake</v-icon>
                  Meetup Details
                </div>
                <div class="info-value multiline">{{ shop.meetup_details }}</div>
              </div>
            </div>
          </div>

          <!-- Verification & Status -->
          <div class="info-card">
            <div class="card-header">
              <h3>
                <v-icon color="#3f83c7" size="20">mdi-shield-check</v-icon>
                Verification & Status
              </h3>
            </div>
            
            <div class="info-grid">
              <div class="info-row">
                <div class="info-label">
                  <v-icon size="16">mdi-check-circle</v-icon>
                  Application Status
                </div>
                <div class="info-value">
                  <v-chip size="small" :color="getStatusColor(shop.status)">
                    {{ shop.status.toUpperCase() }}
                  </v-chip>
                </div>
              </div>
              
              <div class="info-row" v-if="shop.valid_id_front">
                <div class="info-label">
                  <v-icon size="16">mdi-card-account-details</v-icon>
                  Valid ID (Front)
                </div>
                <div class="info-value">
                  <v-btn 
                    size="small" 
                    variant="outlined"
                    @click="openImage(shop.valid_id_front)"
                    prepend-icon="mdi-image"
                    class="view-image-btn"
                  >
                    View Image
                  </v-btn>
                  <v-btn 
                    size="x-small" 
                    variant="text" 
                    @click="copyToClipboard(shop.valid_id_front)"
                    class="copy-id-btn"
                  >
                    <v-icon size="14">mdi-content-copy</v-icon>
                  </v-btn>
                </div>
              </div>
              
              <div class="info-row" v-if="shop.valid_id_back">
                <div class="info-label">
                  <v-icon size="16">mdi-card-account-details</v-icon>
                  Valid ID (Back)
                </div>
                <div class="info-value">
                  <v-btn 
                    size="small" 
                    variant="outlined"
                    @click="openImage(shop.valid_id_back)"
                    prepend-icon="mdi-image"
                    class="view-image-btn"
                  >
                    View Image
                  </v-btn>
                  <v-btn 
                    size="x-small" 
                    variant="text" 
                    @click="copyToClipboard(shop.valid_id_back)"
                    class="copy-id-btn"
                  >
                    <v-icon size="14">mdi-content-copy</v-icon>
                  </v-btn>
                </div>
              </div>
              
              <div class="info-row" v-if="shop.logo_url">
                <div class="info-label">
                  <v-icon size="16">mdi-image</v-icon>
                  Logo
                </div>
                <div class="info-value">
                  <v-btn 
                    size="small" 
                    variant="outlined"
                    @click="openImage(shop.logo_url)"
                    prepend-icon="mdi-image"
                    class="view-image-btn"
                  >
                    View Logo
                  </v-btn>
                  <v-btn 
                    size="x-small" 
                    variant="text" 
                    @click="copyToClipboard(shop.logo_url)"
                    class="copy-id-btn"
                  >
                    <v-icon size="14">mdi-content-copy</v-icon>
                  </v-btn>
                </div>
              </div>
            </div>
          </div>

          <!-- Owner Information -->
          <div class="info-card" v-if="ownerProfile">
            <div class="card-header">
              <h3>
                <v-icon color="#3f83c7" size="20">mdi-account-tie</v-icon>
                Owner Information
              </h3>
              <v-chip size="small" color="success" variant="outlined">
                Owner Verified
              </v-chip>
            </div>
            
            <div class="info-grid">
              <div class="info-row" v-if="ownerProfile.first_name || ownerProfile.last_name">
                <div class="info-label">
                  <v-icon size="16">mdi-account</v-icon>
                  Name
                </div>
                <div class="info-value">
                  {{ ownerProfile.first_name || '' }} {{ ownerProfile.last_name || '' }}
                </div>
              </div>
              
              <div class="info-row" v-if="ownerProfile.phone">
                <div class="info-label">
                  <v-icon size="16">mdi-phone</v-icon>
                  Phone
                </div>
                <div class="info-value">{{ ownerProfile.phone }}</div>
              </div>
              
              <div class="info-row" v-if="ownerProfile.role">
                <div class="info-label">
                  <v-icon size="16">mdi-account-badge</v-icon>
                  Role
                </div>
                <div class="info-value">
                  <v-chip size="small" color="primary" variant="flat">
                    {{ ownerProfile.role }}
                  </v-chip>
                </div>
              </div>
              
              <div class="info-row" v-if="ownerProfile.avatar_url">
                <div class="info-label">
                  <v-icon size="16">mdi-account-circle</v-icon>
                  Avatar
                </div>
                <div class="info-value">
                  <v-btn 
                    size="small" 
                    variant="outlined"
                    @click="openImage(ownerProfile.avatar_url)"
                    prepend-icon="mdi-image"
                    class="view-image-btn"
                  >
                    View Avatar
                  </v-btn>
                  <v-btn 
                    size="x-small" 
                    variant="text" 
                    @click="copyToClipboard(ownerProfile.avatar_url)"
                    class="copy-id-btn"
                  >
                    <v-icon size="14">mdi-content-copy</v-icon>
                  </v-btn>
                </div>
              </div>
              
              <div class="info-row" v-if="ownerProfile.created_at">
                <div class="info-label">
                  <v-icon size="16">mdi-calendar-account</v-icon>
                  Profile Created
                </div>
                <div class="info-value">
                  {{ formatDateTime(ownerProfile.created_at) }}
                </div>
              </div>
              
              <div class="info-row" v-if="ownerProfile.updated_at">
                <div class="info-label">
                  <v-icon size="16">mdi-calendar-sync</v-icon>
                  Profile Updated
                </div>
                <div class="info-value">
                  {{ formatDateTime(ownerProfile.updated_at) }}
                </div>
              </div>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="action-buttons">
            <v-btn
              v-if="isApproved"
              color="primary"
              size="large"
              variant="flat"
              @click="handleApproved"
              prepend-icon="mdi-rocket-launch"
              block
              class="primary-action"
            >
              Launch Dashboard
            </v-btn>
            
            <v-btn
              v-else-if="isDeclined"
              color="warning"
              size="large"
              variant="flat"
              @click="handleDeclined"
              prepend-icon="mdi-pencil-box"
              block
              class="primary-action"
            >
              Edit & Resubmit
            </v-btn>
            
            <v-btn
              v-else
              color="info"
              size="large"
              variant="flat"
              @click="handlePending"
              prepend-icon="mdi-clipboard-text"
              block
              class="primary-action"
            >
              Prepare Shop
            </v-btn>

            <div class="secondary-actions">
              <v-btn
                variant="outlined"
                @click="copyStatusLink"
                prepend-icon="mdi-link-variant"
                block
                class="secondary-btn link-btn"
              >
                Copy Status Link
              </v-btn>
              
              <v-btn
                variant="outlined"
                @click="goToHome"
                prepend-icon="mdi-home"
                block
                class="secondary-btn"
              >
                Go Home
              </v-btn>
              
              <v-btn
                variant="outlined"
                @click="refreshData"
                :loading="loading"
                prepend-icon="mdi-refresh"
                block
                class="secondary-btn"
              >
                Refresh Data
              </v-btn>
              
            
              
              <!-- Debug button (only shows in debug mode) -->
              <v-btn
                v-if="debugMode"
                variant="outlined"
                @click="forceLoadShop"
                prepend-icon="mdi-wrench"
                block
                color="warning"
                class="debug-btn"
              >
                Force Load Shop
              </v-btn>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const route = useRoute()
const router = useRouter()

// State
const loading = ref(true)
const error = ref(null)
const shop = ref(null)
const ownerProfile = ref(null)
const userId = ref(null)
const accessDenied = ref(false)
const debugInfo = ref({})
const debugMode = ref(false) // Set to true for debugging, false for production
const userShops = ref([])

// Get current user
const getCurrentUser = async () => {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError) {
      console.error('Auth error:', authError)
      return null
    }
    
    console.log('Current user ID:', user?.id)
    return user?.id || null
  } catch (err) {
    console.error('Error getting current user:', err)
    return null
  }
}

// Get shop ID from multiple sources
const getShopId = () => {
  const shopId = route.query.shopId || route.params.id || localStorage.getItem('lastCreatedShopId')
  console.log('Shop ID sources:', {
    routeQuery: route.query.shopId,
    routeParams: route.params.id,
    localStorage: localStorage.getItem('lastCreatedShopId'),
    final: shopId
  })
  return shopId
}

// Computed property for current shop ID
const currentShopId = computed(() => getShopId())

// Find all shops for current user
const fetchUserShops = async () => {
  try {
    if (!userId.value) return []
    
    const { data: shops, error: shopsError } = await supabase
      .from('shops')
      .select('*')
      .eq('owner_id', userId.value)
    
    if (shopsError) throw shopsError
    
    userShops.value = shops || []
    return userShops.value
  } catch (err) {
    console.error('Error fetching user shops:', err)
    return []
  }
}

// Find my shop automatically
const findMyShop = async () => {
  try {
    loading.value = true
    const shops = await fetchUserShops()
    
    if (shops.length === 0) {
      error.value = 'No shops found for your account. Create a new shop.'
    } else if (shops.length === 1) {
      // Redirect to the single shop
      const shopId = shops[0].id
      router.replace({ query: { shopId } })
      localStorage.setItem('lastCreatedShopId', shopId)
      await fetchData()
    } else {
      // Multiple shops - show selection (you can implement this)
      console.log('Multiple shops found:', shops)
      // For now, take the first one
      const shopId = shops[0].id
      router.replace({ query: { shopId } })
      localStorage.setItem('lastCreatedShopId', shopId)
      await fetchData()
    }
  } catch (err) {
    error.value = 'Error finding your shop: ' + err.message
  } finally {
    loading.value = false
  }
}

// Fetch complete shop data with owner profile
const fetchData = async () => {
  try {
    loading.value = true
    error.value = null
    shop.value = null
    ownerProfile.value = null
    accessDenied.value = false
    debugInfo.value = {
      step: 'start',
      timestamp: new Date().toISOString()
    }

    // Get current user
    const currentUserId = await getCurrentUser()
    userId.value = currentUserId
    
    debugInfo.value.userId = userId.value
    debugInfo.value.shopId = currentShopId.value

    // Check if user is authenticated
    if (!userId.value) {
      console.log('User not authenticated')
      loading.value = false
      return
    }

    // If no shop ID provided, try to find user's shop
    if (!currentShopId.value) {
      console.log('No shop ID provided, searching for user shop')
      const shops = await fetchUserShops()
      
      if (shops.length > 0) {
        // Use the first shop
        const firstShop = shops[0]
        shop.value = firstShop
        localStorage.setItem('lastCreatedShopId', firstShop.id)
        // Update URL
        router.replace({ query: { shopId: firstShop.id } })
      } else {
        console.log('No shops found for user')
        loading.value = false
        return
      }
    } else {
      // Fetch shop by ID
      console.log('Fetching shop by ID:', currentShopId.value)
      
      const { data: shops, error: shopsError } = await supabase
        .from('shops')
        .select('*')
        .eq('id', currentShopId.value)
        .limit(1)

      if (shopsError) {
        console.error('Shops fetch error:', shopsError)
        throw shopsError
      }

      console.log('Shops found:', shops)

      if (!shops || shops.length === 0) {
        console.log('No shop found with ID:', currentShopId.value)
        // Try to find user's shops
        const userShops = await fetchUserShops()
        if (userShops.length > 0) {
          error.value = `Shop not found with ID: ${currentShopId.value}. But you have ${userShops.length} shop(s).`
        } else {
          error.value = `Shop not found with ID: ${currentShopId.value}`
        }
        localStorage.removeItem('lastCreatedShopId')
      } else {
        const shopData = shops[0]
        shop.value = shopData
        
        debugInfo.value.shopData = {
          id: shopData.id,
          owner_id: shopData.owner_id,
          business_name: shopData.business_name,
          status: shopData.status
        }

        // TEMPORARY FIX: Uncomment next line to bypass ownership check
        // const isOwner = true  // TEMPORARY: Allow any logged-in user
        
        // ORIGINAL: Check ownership
        const isOwner = shopData.owner_id === userId.value
        
        debugInfo.value.ownershipCheck = {
          currentUserId: userId.value,
          shopOwnerId: shopData.owner_id,
          isOwner: isOwner
        }

        if (!isOwner) {
          console.log('ACCESS DENIED: User does not own this shop')
          accessDenied.value = true
          loading.value = false
          return
        }

        console.log('ACCESS GRANTED: User owns this shop')
        localStorage.setItem('lastCreatedShopId', shop.value.id)
      }
    }

    // Fetch owner profile if we have a shop
    if (shop.value && shop.value.owner_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', shop.value.owner_id)
        .single()
      
      ownerProfile.value = profile
    }
    
  } catch (err) {
    console.error('Error in fetchData:', err)
    error.value = err.message || 'Failed to load shop information.'
    debugInfo.value.error = {
      message: err.message,
      stack: err.stack
    }
  } finally {
    loading.value = false
    console.log('Fetch complete:', {
      userId: userId.value,
      shop: shop.value?.id,
      error: error.value,
      accessDenied: accessDenied.value
    })
  }
}

// Force load shop (debug function)
const forceLoadShop = async () => {
  if (!userId.value) {
    error.value = 'Please log in first'
    return
  }
  
  const shops = await fetchUserShops()
  if (shops.length > 0) {
    const shopId = shops[0].id
    router.replace({ query: { shopId } })
    localStorage.setItem('lastCreatedShopId', shopId)
    await fetchData()
  } else {
    error.value = 'No shops found for your account'
  }
}

// Copy shop link
const copyShopLink = async () => {
  if (!shop.value) return
  const link = `${window.location.origin}/status?shopId=${shop.value.id}`
  await copyToClipboard(link)
}

// Reload with shop ID in URL
const reloadWithId = () => {
  if (!shop.value) return
  router.replace({ query: { shopId: shop.value.id } })
  fetchData()
}

// Helper functions
const formatTime = (timeString) => {
  if (!timeString) return ''
  const [hours, minutes] = timeString.split(':')
  const hour = parseInt(hours)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const formattedHour = hour % 12 || 12
  return `${formattedHour}:${minutes} ${ampm}`
}

const formatDateTime = (dateString) => {
  if (!dateString) return 'N/A'
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (err) {
    return 'Invalid date'
  }
}

const copyToClipboard = async (text) => {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    console.log('Copied to clipboard:', text)
  } catch (err) {
    // Fallback
    const textArea = document.createElement('textarea')
    textArea.value = text
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
  }
}

const openImage = (url) => {
  if (url) {
    window.open(url, '_blank')
  }
}

// Computed properties
const shopStatus = computed(() => shop.value?.status || 'pending')
const isApproved = computed(() => shopStatus.value === 'approved')
const isDeclined = computed(() => shopStatus.value === 'declined')
const isPending = computed(() => shopStatus.value === 'pending')

const statusColors = computed(() => {
  const colors = {
    approved: { gradient: 'linear-gradient(135deg, #4CAF50 0%, #66BB6A 100%)' },
    declined: { gradient: 'linear-gradient(135deg, #F44336 0%, #EF5350 100%)' },
    pending: { gradient: 'linear-gradient(135deg, #FF9800 0%, #FFB74D 100%)' }
  }
  return colors[shopStatus.value] || { gradient: 'linear-gradient(135deg, #3f83c7 0%, #5a95d1 100%)' }
})

const statusIcon = computed(() => {
  const icons = {
    approved: 'mdi-check-circle',
    declined: 'mdi-alert-circle',
    pending: 'mdi-clock-outline'
  }
  return icons[shopStatus.value] || 'mdi-help-circle'
})

const statusTitle = computed(() => {
  const titles = {
    approved: 'Approved! 🎉',
    declined: 'Needs Attention',
    pending: 'Under Review'
  }
  return titles[shopStatus.value] || 'Unknown Status'
})

const statusMessage = computed(() => {
  const messages = {
    approved: 'Your shop is now live and ready for business',
    declined: 'Your application requires some updates',
    pending: 'Your shop application is being reviewed'
  }
  return messages[shopStatus.value] || 'Status information unavailable'
})

const formattedOpenDays = computed(() => {
  if (!shop.value?.open_days || !Array.isArray(shop.value.open_days)) return []
  
  const dayMap = {
    0: 'Sunday',
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday'
  }
  
  return shop.value.open_days
    .map(day => dayMap[day])
    .filter(day => day)
})

// Color helpers
const getStatusColor = (status) => {
  const colors = {
    approved: 'success',
    pending: 'warning',
    declined: 'error'
  }
  return colors[status] || 'info'
}

const getAddressSourceColor = (source) => {
  const colors = {
    detected: 'info',
    manual: 'primary'
  }
  return colors[source] || 'default'
}

// Navigation handlers
const goBack = () => router.go(-1)
const goToHome = () => router.push('/')
const goToLogin = () => router.push('/login')
const createShop = () => {
  localStorage.removeItem('lastCreatedShopId')
  router.push('/shop-build')
}

const goToMyShop = async () => {
  if (!userId.value) {
    router.push('/login')
    return
  }
  await findMyShop()
}

// Action handlers
const refreshData = () => fetchData()

const copyStatusLink = async () => {
  if (!shop.value) return
  const link = `${window.location.origin}${window.location.pathname}?shopId=${shop.value.id}`
  await copyToClipboard(link)
}

const handleApproved = () => {
  router.push('/usershop')
}

const handleDeclined = () => {
  router.push('/shop-build')
}

const handlePending = () => {
  router.push('/usershop')
}

// Initialize
onMounted(() => {
  console.log('Status view mounted')
  fetchData()
  
  // Listen for auth changes
  supabase.auth.onAuthStateChange((event, session) => {
    console.log('Auth state changed:', event, 'User ID:', session?.user?.id)
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
      fetchData()
    }
  })
})

// Watch for route changes
watch(() => route.query.shopId, (newShopId) => {
  console.log('Shop ID in URL changed to:', newShopId)
  if (newShopId) {
    fetchData()
  }
})
</script>

<style scoped>
/* Debug Banner */
.debug-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.85);
  color: white;
  padding: 8px 16px;
  font-size: 12px;
  z-index: 1000;
  border-bottom: 2px solid #4CAF50;
}

.debug-content {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.debug-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.debug-label {
  color: #aaa;
  font-weight: 600;
}

.debug-value {
  font-family: monospace;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.access-granted {
  color: #4CAF50;
  font-weight: bold;
}

.access-denied {
  color: #F44336;
  font-weight: bold;
}

.debug-close-btn {
  margin-left: auto;
  background: rgba(255, 255, 255, 0.1) !important;
  color: white !important;
  min-width: 24px !important;
  width: 24px !important;
  height: 24px !important;
}

.debug-toggle-btn {
  color: rgba(255, 255, 255, 0.8) !important;
}

/* Success Banner */
.success-banner {
  background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
  color: white;
  padding: 12px 16px;
  border-radius: 12px;
  margin-bottom: 16px;
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.2);
}

.success-content {
  display: flex;
  align-items: center;
  gap: 10px;
}

.success-details {
  margin-left: auto;
  opacity: 0.8;
}

/* Debug sections in cards */
.debug-loading,
.debug-auth,
.debug-access,
.debug-error,
.debug-no-shop {
  margin-top: 16px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  font-size: 12px;
}

.debug-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.debug-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: white;
  border-radius: 6px;
  border: 1px solid #ddd;
}

.debug-item code {
  flex: 1;
  font-family: monospace;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.copy-btn {
  min-width: 20px !important;
  width: 20px !important;
  height: 20px !important;
}

/* Debug shop link */
.debug-shop-link {
  margin-top: 8px;
  opacity: 0.8;
}

.debug-shop-link a {
  color: rgba(255, 255, 255, 0.9);
  text-decoration: none;
  margin: 0 4px;
}

.debug-shop-link a:hover {
  text-decoration: underline;
}

/* Debug button */
.debug-btn {
  border-color: #FF9800 !important;
  color: #FF9800 !important;
}

/* Keep all your existing CSS from before */
.status-view-wrapper {
  min-height: 100vh;
  background: linear-gradient(135deg, #f8fafc 0%, #f2f4f7 100%);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.app-header {
  position: relative;
  height: 180px;
  overflow: hidden;
}

.header-backdrop {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
  background: linear-gradient(135deg, #2c5c8d 0%, #3f83c7 50%, #6ba1d4 100%);
  clip-path: polygon(0 0, 100% 0, 100% 80%, 0 100%);
}

.header-content {
  position: relative;
  z-index: 10;
  padding: 24px 20px 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.header-back-btn {
  background: rgba(255, 255, 255, 0.15) !important;
  color: white !important;
  min-width: 40px !important;
  width: 40px !important;
  height: 40px !important;
  border-radius: 12px !important;
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
}

.header-title {
  flex: 1;
  text-align: center;
  padding: 0 16px;
}

.header-title h1 {
  color: white;
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0 0 4px 0;
}

.header-title .subtitle {
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.875rem;
  margin: 0;
}

.header-refresh-btn {
  color: white !important;
  opacity: 0.8;
}

/* Main Content */
.main-content {
  padding: 0 16px 40px;
  position: relative;
  margin-top: -40px;
}

/* Loading State */
.loading-container {
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-card {
  text-align: center;
  padding: 40px;
  background: white;
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  max-width: 400px;
  width: 100%;
}

.loading-spinner {
  position: relative;
  width: 80px;
  height: 80px;
  margin: 0 auto 24px;
}

.spinner-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border: 4px solid rgba(107, 161, 212, 0.25);
  border-top-color: #3f83c7;
  border-radius: 50%;
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-card h3 {
  color: #101828;
  margin-bottom: 8px;
  font-weight: 600;
}

.loading-card p {
  color: #667085;
  font-size: 0.875rem;
}

/* Auth Required State */
.auth-required-container, .access-denied-container {
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.auth-required-card, .access-denied-card {
  text-align: center;
  padding: 40px;
  background: white;
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  max-width: 500px;
  width: 100%;
}

.auth-icon, .access-denied-icon {
  margin-bottom: 24px;
}

.auth-required-card h3, .access-denied-card h3 {
  color: #101828;
  margin-bottom: 8px;
  font-weight: 600;
}

.auth-required-card p, .access-denied-card p {
  color: #667085;
  margin-bottom: 16px;
  line-height: 1.5;
}

.access-note {
  color: #ef4444 !important;
  font-size: 0.875rem;
  margin-top: 16px;
}

.auth-actions, .access-denied-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 24px;
}

.login-btn, .my-shop-btn {
  height: 48px !important;
}

/* Error & No Shop States */
.error-container, .no-shop-container {
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-card, .no-shop-card {
  text-align: center;
  padding: 40px;
  background: white;
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  max-width: 500px;
  width: 100%;
}

.error-icon, .no-shop-icon {
  margin-bottom: 24px;
}

.error-card h3, .no-shop-card h3 {
  color: #101828;
  margin-bottom: 8px;
  font-weight: 600;
}

.error-card p, .no-shop-card p {
  color: #667085;
  margin-bottom: 24px;
  line-height: 1.5;
}

.error-actions, .no-shop-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 24px;
}

.action-btn, .create-btn, .home-btn {
  height: 44px !important;
  border-radius: 12px !important;
}

.create-btn {
  height: 48px !important;
}

/* Status Banner */
.status-banner {
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  margin-bottom: 24px;
  color: white;
}

.banner-content {
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 20px;
}

.icon-circle {
  width: 64px;
  height: 64px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.status-text {
  flex: 1;
}

.status-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 4px;
}

.status-subtitle {
  opacity: 0.9;
  font-size: 0.875rem;
  margin-bottom: 16px;
}

.shop-name-chip {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.shop-name {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.status-badge {
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.shop-id {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  opacity: 0.8;
  margin-bottom: 4px;
}

.owner-verified {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  opacity: 0.9;
}

/* Shop Details */
.shop-details {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Cards */
.info-card {
  background: white;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
  border: 1px solid #e4e7ec;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.card-header h3 {
  color: #101828;
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Info Grid */
.info-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.info-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f2f4f7;
}

.info-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.info-label {
  color: #667085;
  font-size: 0.875rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-value {
  color: #101828;
  font-size: 0.9375rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.info-value.multiline {
  line-height: 1.5;
  white-space: pre-wrap;
}

/* Copy Button */
.copy-id-btn {
  min-width: 24px !important;
  width: 24px !important;
  height: 24px !important;
}

.view-image-btn {
  height: 32px !important;
  font-size: 0.75rem;
}

/* Days List */
.days-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.day-chip {
  font-size: 0.75rem;
}

/* Delivery Options */
.delivery-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.option-chip {
  font-size: 0.75rem;
}

/* Action Buttons */
.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.primary-action {
  height: 56px !important;
  border-radius: 16px !important;
  font-weight: 600 !important;
  font-size: 1rem !important;
}

.secondary-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.secondary-btn {
  height: 48px !important;
  border-radius: 14px !important;
  font-weight: 500 !important;
  border: 2px solid #d0d5dd !important;
}

.link-btn {
  color: #3f83c7 !important;
  border-color: #6ba1d4 !important;
}

/* Animations */
.pulse-icon {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.1); opacity: 0.8; }
  100% { transform: scale(1); opacity: 1; }
}

/* Responsive Design */
@media (max-width: 600px) {
  .app-header {
    height: 160px;
  }
  
  .header-content {
    padding: 20px 16px 0;
  }
  
  .header-title h1 {
    font-size: 1.5rem;
  }
  
  .main-content {
    padding: 0 12px 32px;
    margin-top: -32px;
  }
  
  .banner-content {
    padding: 20px;
    flex-direction: column;
    text-align: center;
    gap: 16px;
  }
  
  .shop-name-chip {
    justify-content: center;
  }
  
  .icon-circle {
    width: 56px;
    height: 56px;
  }
  
  .status-title {
    font-size: 1.25rem;
  }
  
  .info-card {
    padding: 20px;
  }
  
  .primary-action {
    height: 52px !important;
  }
  
  .card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  
  /* Debug responsive */
  .debug-banner {
    padding: 6px 12px;
  }
  
  .debug-content {
    gap: 8px;
  }
  
  .debug-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
  
  .debug-close-btn {
    position: absolute;
    top: 4px;
    right: 4px;
  }
  
  .debug-grid {
    grid-template-columns: 1fr;
  }
}
</style>