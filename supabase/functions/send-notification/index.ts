// supabase/functions/send-notification/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
  try {
    // Parse JSON body
    const { sender_id, receiver_id, content, token, title } = await req.json();

    console.log("📩 New message received:", { sender_id, receiver_id, content });

    if (!token) {
      return new Response(JSON.stringify({ error: "Missing FCM token" }), { status: 400 });
    }

    const FIREBASE_SERVER_KEY = Deno.env.get("FIREBASE_SERVER_KEY");
    if (!FIREBASE_SERVER_KEY) {
      return new Response(JSON.stringify({ error: "Missing FIREBASE_SERVER_KEY" }), { status: 500 });
    }

    // ✅ Send the notification through Firebase Cloud Messaging
    const fcmResponse = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        "Authorization": `key=${FIREBASE_SERVER_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        notification: {
          title: title || "New Message",
          body: content,
          icon: "https://your-app-logo-url.com/icon.png", // optional
        },
        data: {
          sender_id,
          receiver_id,
          click_action: "FLUTTER_NOTIFICATION_CLICK",
        },
      }),
    });

    const result = await fcmResponse.json();
    console.log("✅ FCM Response:", result);

    return new Response(
      JSON.stringify({ success: true, message: "Notification sent", result }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("❌ Notification error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
