<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import BottomNav from '@/common/layout/BottomNav.vue'
import { supabase } from '@/utils/supabase'
import PullToRefreshWrapper from '@/components/PullToRefreshWrapper.vue'
import { formatLiveTimestamp, parseAppTimestamp } from '@/utils/dateTime'
import { resolveConversationViewerRole, resolveCounterpartyIdentity } from '@/utils/chatIdentity'

const activeTab = ref('chat')
const router = useRouter()
const goBack = () => router.back()

// State
const conversations = ref<any[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const showDeleteDialog = ref(false)
const conversationToDelete = ref<any>(null)
const deleting = ref(false)
const currentTime = ref(Date.now())
let conversationsSubscription: any = null
let refreshInterval: ReturnType<typeof setInterval> | null = null
let timeUpdateInterval: ReturnType<typeof setInterval> | null = null

const formatConversationTime = (timestamp?: string | null) =>
  formatLiveTimestamp(timestamp, currentTime.value)

const handleRefresh = async () => {
  console.log('🔄 Pull-to-refresh triggered - Refreshing conversations...')

  try {
    // Clear any existing errors
    error.value = null

    // Refresh conversations
    await fetchConversations()

    console.log('✅ Conversations refresh complete!')
  } catch (err) {
    console.error('❌ Refresh failed:', err)
    error.value = 'Failed to refresh conversations'
  }
}


// Fetch conversations with proper user matching
const fetchConversations = async () => {
  try {
    loading.value = true
    error.value = null

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('❌ No authenticated user')
      loading.value = false
      return
    }

    console.log('👤 Current auth user:', user.id)

    // Get current user's profile
    const { data: currentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, avatar_url')
      .eq('id', user.id)
      .single()

    if (profileError || !currentProfile) {
      console.error('❌ Error fetching current profile:', profileError)
      loading.value = false
      return
    }

    console.log('📋 Current profile:', currentProfile)

    // First, fetch conversations without messages to avoid the relationship conflict
    const { data: conversationsData, error: convError } = await supabase
      .from('conversations')
      .select(`
        id,
        user1,
        user2,
        created_at,
        updated_at,
        user1_profile:profiles!conversations_user1_fkey (
          id,
          first_name,
          last_name,
          avatar_url
        ),
        user2_profile:profiles!conversations_user2_fkey (
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .or(`user1.eq.${currentProfile.id},user2.eq.${currentProfile.id}`)
      .order('updated_at', { ascending: false })

    if (convError) {
      console.error('❌ Error fetching conversations:', convError)
      error.value = 'Failed to load conversations'
      loading.value = false
      return
    }

    console.log('💬 Raw conversations data:', conversationsData)

    // Now fetch messages for each conversation separately
    conversations.value = await Promise.all(
      (conversationsData || []).map(async (conv) => {
        const isUser1 = conv.user1 === currentProfile.id
        const otherProfileId = isUser1 ? conv.user2 : conv.user1
        const otherProfile = isUser1 ? conv.user2_profile : conv.user1_profile

        console.log(`🔄 Processing conversation:`, {
          convId: conv.id,
          isUser1,
          otherProfileId,
          otherProfile
        })

        // Fetch messages for this specific conversation
        const { data: messages, error: messagesError } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(50) // Limit to recent messages

        if (messagesError) {
          console.error('❌ Error fetching messages:', messagesError)
        }

        console.log(`💌 Messages for conversation ${conv.id}:`, messages)

        // Get the latest message
        const latestMessage = messages && messages.length > 0
          ? messages[0] // Already ordered by created_at desc
          : null

        console.log('💌 Latest message:', latestMessage)

        // Check if there are unread messages for current user
        const unreadMessages = messages?.filter(msg =>
          msg.receiver_id === user.id && !msg.is_read
        ) || []

        // Get shop info for the other user (if they are a seller)
        const { data: shop } = await supabase
          .from('shops')
          .select('business_name, logo_url, owner_id')
          .eq('owner_id', otherProfileId) // Shop owner_id should match profile id
          .maybeSingle()

        console.log('🏪 Shop data:', shop)

        const viewerRole = resolveConversationViewerRole({
          currentUserId: currentProfile.id,
          customerUserId: conv.user1,
          sellerUserId: conv.user2,
        })

        // Determine display name and avatar
        const { displayName, avatar } = resolveCounterpartyIdentity({
          viewerRole,
          profile: otherProfile,
          shop,
        })

        // Determine last message preview
        let lastMessagePreview = '(No messages yet)'
        let senderName = ''
        let isUnread = unreadMessages.length > 0

        if (latestMessage) {
          const isFromCurrentUser = latestMessage.sender_id === user.id
          senderName = isFromCurrentUser ? 'You' : displayName
          lastMessagePreview = latestMessage.content

          // Check if the latest message itself is unread
          const isLatestMessageUnread = latestMessage.receiver_id === user.id && !latestMessage.is_read
          isUnread = isUnread || isLatestMessageUnread
        }

        const processedConv = {
          id: conv.id,
          otherUserId: otherProfileId, // This is the profile ID for routing
          otherUserName: displayName,
          avatar: avatar,
          lastMessage: lastMessagePreview,
          lastMessageCreatedAt: latestMessage?.created_at || null,
          sender: senderName,
          unread: isUnread,
          unreadCount: unreadMessages.length,
          updatedAt: conv.updated_at,
          hasUnreadMessages: unreadMessages.length > 0 // New flag specifically for styling
        }

        console.log('✅ Processed conversation:', processedConv)
        return processedConv
      })
    )

    // Sort by update time (most recent first)
    conversations.value.sort((a, b) => {
      const rightTime = parseAppTimestamp(b.updatedAt)?.getTime() || 0
      const leftTime = parseAppTimestamp(a.updatedAt)?.getTime() || 0
      return rightTime - leftTime
    })

    console.log('🎉 Final conversations:', conversations.value)

  } catch (err) {
    console.error('❌ Unexpected error in fetchConversations:', err)
    error.value = 'An unexpected error occurred'
  } finally {
    loading.value = false
  }
}

// ✅ DELETE CONVERSATION FUNCTION
const deleteConversation = async (conversationId: string) => {
  try {
    deleting.value = true
    console.log('🗑️ Deleting conversation:', conversationId)

    // Delete the conversation (this will automatically delete all messages due to CASCADE)
    const { error: deleteError } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId)

    if (deleteError) {
      console.error('❌ Error deleting conversation:', deleteError)
      throw deleteError
    }

    console.log('✅ Conversation deleted successfully')

    // Remove from local state
    conversations.value = conversations.value.filter(conv => conv.id !== conversationId)

    // Close dialog
    showDeleteDialog.value = false
    conversationToDelete.value = null

  } catch (err) {
    console.error('❌ Error in deleteConversation:', err)
    error.value = 'Failed to delete conversation'
  } finally {
    deleting.value = false
  }
}

// ✅ Confirm delete dialog
const confirmDelete = (conversation: any, event?: Event) => {
  if (event) {
    event.stopPropagation() // Prevent opening the chat
  }
  conversationToDelete.value = conversation
  showDeleteDialog.value = true
}

// ✅ Cancel delete
const cancelDelete = () => {
  showDeleteDialog.value = false
  conversationToDelete.value = null
}

// Alternative method using RPC if you want to create a database function
const fetchConversationsWithRPC = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // You could create a database function like this:
    /*
    CREATE OR REPLACE FUNCTION get_user_conversations(user_profile_id UUID)
    RETURNS TABLE (
      conversation_id UUID,
      other_user_id UUID,
      other_user_name TEXT,
      other_user_avatar TEXT,
      last_message TEXT,
      last_message_time TIMESTAMP,
      unread_count INTEGER,
      updated_at TIMESTAMP
    ) AS $$
    BEGIN
      RETURN QUERY
      -- Your complex query here
    END;
    $$ LANGUAGE plpgsql;
    */

    // Then call it like:
    // const { data, error } = await supabase.rpc('get_user_conversations', {
    //   user_profile_id: user.id
    // })

  } catch (err) {
    console.error('RPC method error:', err)
    // Fallback to the regular method
    await fetchConversations()
  }
}

// Real-time subscription for new messages
const subscribeToMessages = () => {
  const subscription = supabase
    .channel('conversations-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages'
      },
      (payload) => {
        console.log('🔔 Real-time message update:', payload)
        fetchConversations() // Refresh conversations
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'conversations'
      },
      (payload) => {
        console.log('🔔 New conversation created:', payload)
        fetchConversations() // Refresh conversations
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'conversations'
      },
      (payload) => {
        console.log('🔔 Conversation deleted:', payload)
        fetchConversations() // Refresh conversations
      }
    )
    .subscribe()

  return subscription
}

// Navigate to chat
const openChat = (conversation: any) => {
  console.log('💬 Opening chat with:', conversation)
  router.push({
    name: 'chatview',
    params: { id: conversation.otherUserId },
    query: { conversationId: conversation.id },
  })
}

// Start conversation with a user (optional - if you want to add this feature)
const startNewConversation = () => {
  // You can implement a search to find users/shops to start conversations with
  console.log('➕ Start new conversation')
  // router.push({ name: 'new-conversation' })
}

// Initialize
onMounted(async () => {
  currentTime.value = Date.now()
  timeUpdateInterval = setInterval(() => {
    currentTime.value = Date.now()
  }, 30000)
  await fetchConversations()
  conversationsSubscription = subscribeToMessages()
  refreshInterval = setInterval(fetchConversations, 30000)
})

onUnmounted(() => {
  conversationsSubscription?.unsubscribe()

  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }

  if (timeUpdateInterval) {
    clearInterval(timeUpdateInterval)
    timeUpdateInterval = null
  }
})
</script>

<template>
  <v-app>
    <PullToRefreshWrapper :on-refresh="handleRefresh">
      <!-- Top App Bar -->
      <v-app-bar flat elevation="0" class="top-nav" color="#3f83c7">
        <v-btn variant="text" icon @click="goBack" class="back-btn">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <v-toolbar-title class="font-bold">
          <strong>Messages</strong>
        </v-toolbar-title>
        <v-spacer />
      </v-app-bar>

      <v-divider />

      <v-main>
        <div class="messages-view">
          <!-- Loading State -->
          <div v-if="loading" class="loading-container">
            <v-progress-circular indeterminate color="primary" />
            <p class="text-caption mt-2">Loading conversations...</p>
          </div>

          <!-- Error State -->
          <v-alert
            v-else-if="error"
            type="error"
            border="start"
            class="mx-4 mt-4"
            @click="fetchConversations"
            style="cursor: pointer"
          >
            {{ error }} - Tap to retry
          </v-alert>

          <!-- Empty State -->
          <div v-else-if="conversations.length === 0" class="empty-state">
            <v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-forum-outline</v-icon>
            <h3 class="text-h6 mb-2">No conversations yet</h3>
            <p class="text-caption text-grey">Start a conversation by contacting a seller or buyer.</p>
          </div>

          <!-- Conversations List -->
          <v-list v-else class="conversations-list">
            <v-list-item
              v-for="conversation in conversations"
              :key="conversation.id"
              class="conversation-item"
              :class="{ 'unread-item': conversation.unread }"
              @click="openChat(conversation)"
            >
              <template #prepend>
                <div class="avatar-container">
                  <v-avatar size="56" class="conversation-avatar">
                    <v-img
                      :src="conversation.avatar"
                      :alt="conversation.otherUserName"
                      cover
                    />
                  </v-avatar>
                  <v-badge
                    v-if="conversation.unreadCount > 0"
                    dot
                    color="error"
                    location="bottom end"
                    class="unread-badge"
                  />
                </div>
              </template>

              <v-list-item-title class="conversation-title">
                <strong>{{ conversation.otherUserName }}</strong>
                <v-badge
                  v-if="conversation.unreadCount > 1"
                  :content="conversation.unreadCount"
                  color="error"
                  inline
                  class="ml-2"
                />
              </v-list-item-title>

              <v-list-item-subtitle
                class="conversation-preview"
                :class="{ 'unread-message': conversation.unread }"
              >
                <span v-if="conversation.sender" class="sender-name">
                  {{ conversation.sender }}:
                </span>
                {{ conversation.lastMessage }}
              </v-list-item-subtitle>

              <template #append>
                <div class="conversation-meta">
                  <div
                    class="message-time"
                    :class="{ 'unread-time': conversation.unread }"
                  >
                    {{ formatConversationTime(conversation.lastMessageCreatedAt) }}
                  </div>
                  <div class="action-buttons">
                    <v-icon
                      v-if="conversation.unread"
                      color="primary"
                      size="16"
                      class="mt-1 mr-1"
                    >
                      mdi-circle-medium
                    </v-icon>
                    <v-btn
                      icon
                      size="x-small"
                      variant="text"
                      color="error"
                      @click.stop="confirmDelete(conversation)"
                      class="delete-btn"
                    >
                      <v-icon size="18">mdi-delete-outline</v-icon>
                    </v-btn>
                  </div>
                </div>
              </template>
            </v-list-item>
          </v-list>
        </div>
      </v-main>

      <!-- Delete Confirmation Dialog -->
      <v-dialog v-model="showDeleteDialog" max-width="400" persistent>
        <v-card>
          <v-card-title class="text-h6">
            Delete Conversation?
          </v-card-title>
          <v-card-text>
            Are you sure you want to delete this conversation with
            <strong>{{ conversationToDelete?.otherUserName }}</strong>?
            This action cannot be undone and will delete all messages in this conversation.
          </v-card-text>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn
              text
              @click="cancelDelete"
              :disabled="deleting"
            >
              Cancel
            </v-btn>
            <v-btn
              color="error"
              variant="flat"
              @click="deleteConversation(conversationToDelete?.id)"
              :loading="deleting"
            >
              Delete
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <BottomNav v-model="activeTab" />
    </PullToRefreshWrapper>
  </v-app>
</template>

<style scoped>
/* CSS Variables for safe area insets */
:root {
  --sat: env(safe-area-inset-top);
  --sar: env(safe-area-inset-right);
  --sab: env(safe-area-inset-bottom);
  --sal: env(safe-area-inset-left);
}

/* Top Navigation Bar - Fixed for notches */
.top-nav {
  padding-top: env(safe-area-inset-top);
  background: linear-gradient(135deg, #3f83c7, #2f6ca9) !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12) !important;
}

/* For iOS devices with dynamic island */
@supports (padding-top: env(safe-area-inset-top)) {
  .top-nav {
    padding-top: env(safe-area-inset-top);
    height: calc(56px + env(safe-area-inset-top)) !important;
  }
}

/* For older iOS devices */
@supports (padding-top: constant(safe-area-inset-top)) {
  .top-nav {
    padding-top: constant(safe-area-inset-top);
    height: calc(56px + constant(safe-area-inset-top)) !important;
  }
}

/* Ensure toolbar content is properly aligned */
.top-nav :deep(.v-toolbar__content) {
  height: 56px !important;
  padding-top: 0 !important;
}

.top-nav :deep(.v-toolbar-title) {
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.top-nav :deep(.v-btn) {
  color: white !important;
}

/* Main content area - accounts for the fixed header */
.messages-view {
  margin-top: calc(56px + var(--sat, 0px));
  min-height: calc(100vh - 56px - var(--sat, 0px));
  padding-bottom: 80px;
}

/* iOS support for margin-top */
@supports (padding-top: env(safe-area-inset-top)) {
  .top-nav {
    padding-top: env(safe-area-inset-top);
  }

  .messages-view {
    margin-top: calc(56px + env(safe-area-inset-top));
  }
}

/* Landscape mode adjustment */
@media (orientation: landscape) and (max-height: 500px) {
  .top-nav {
    height: 56px !important;
    padding-top: 0 !important;
  }

  .messages-view {
    margin-top: 56px;
  }
}

/* Rest of your existing styles remain exactly the same */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

.conversations-list {
  margin-top: -55px;
  background: white;
  padding: 0;
}

.conversation-item {
  border-bottom: 1px solid #e0e0e0;
  padding: 16px;
  transition: background-color 0.2s ease;
  cursor: pointer;
  position: relative;
}

.conversation-item:hover {
  background-color: #f5f5f5;
}

.conversation-item:last-child {
  border-bottom: none;
}

.unread-item {
  background-color: #e3f2fd;
}

.unread-item:hover {
  background-color: #bbdefb;
}

.avatar-container {
  position: relative;
  margin-right: 16px;
}

.conversation-avatar {
  border: 2px solid #e0e0e0;
}

.unread-item .conversation-avatar {
  border-color: #2196f3;
}

.unread-badge {
  position: absolute;
  bottom: 2px;
  right: 2px;
}

.conversation-title {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
}

.conversation-preview {
  font-size: 0.875rem;
  color: #666;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: all 0.2s ease;
}

/* BOLD STYLES FOR UNREAD MESSAGES */
.unread-message {
  font-weight: 600 !important;
  color: #333 !important;
}

.sender-name {
  font-weight: 500;
  color: #333;
}

.unread-message .sender-name {
  font-weight: 700;
}

.conversation-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  min-width: 80px;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
}

.delete-btn {
  opacity: 0.6;
  transition: opacity 0.2s ease;
}

.delete-btn:hover {
  opacity: 1;
  background-color: rgba(244, 67, 54, 0.1);
}

.message-time {
  font-size: 0.75rem;
  color: #999;
  white-space: nowrap;
  transition: all 0.2s ease;
}

/* Bold time for unread messages */
.unread-time {
  font-weight: 600;
  color: #2196f3 !important;
}

/* Responsive design */
@media (max-width: 600px) {
  .conversation-item {
    padding: 12px 16px;
  }

  .conversation-avatar {
    width: 48px !important;
    height: 48px !important;
  }

  .conversation-title {
    font-size: 0.9rem;
  }

  .conversation-preview {
    font-size: 0.8rem;
  }

  .unread-message {
    font-size: 0.8rem;
  }

  .conversation-meta {
    min-width: 70px;
  }
}

/* Animation for new messages */
@keyframes highlight {
  0% { background-color: #e3f2fd; }
  100% { background-color: transparent; }
}

.conversation-item.highlight {
  animation: highlight 2s ease;
}

/* Enhanced visual distinction for unread items */
.unread-item .conversation-title {
  color: #1976d2;
}

.unread-item .conversation-preview {
  font-weight: 600;
  color: #333;
}
</style>
