const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { createClient } = require("@supabase/supabase-js");

// ✅ Initialize Firebase Admin SDK
admin.initializeApp();

// ✅ Connect to your Supabase project
const supabase = createClient(
  "https://zmfoklqjmxokmqrhazmr.supabase.co", // replace with your actual Supabase project URL
  "YOUR_SUPABASE_SERVICE_ROLE_KEY" // ⚠️ use service_role key from Supabase (keep it secret!)
);

// ✅ Function triggers when a new message is created in Firestore
exports.sendChatNotification = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    const message = snap.data();

    if (!message || !message.receiverId) {
      console.log("⚠️ No receiverId in message, skipping notification.");
      return;
    }

    console.log("📩 New message created:", message);

    // Fetch the receiver's FCM token from Supabase users table
    const { data: receiver, error } = await supabase
      .from("users")
      .select("fcm_token, full_name")
      .eq("id", message.receiverId)
      .single();

    if (error) {
      console.error("❌ Error fetching receiver from Supabase:", error);
      return;
    }

    if (!receiver?.fcm_token) {
      console.log("🚫 No FCM token found for receiver");
      return;
    }

    // Construct notification payload
    const payload = {
      notification: {
        title: "New Message 💬",
        body: message.text || "You have a new message",
      },
      token: receiver.fcm_token,
    };

    try {
      await admin.messaging().send(payload);
      console.log("✅ Notification sent successfully to", receiver.full_name);
    } catch (err) {
      console.error("🔥 Error sending FCM:", err);
    }
  });
