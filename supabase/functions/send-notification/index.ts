import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PUSH_CHANNEL_ID = "closeshop-high-priority";
const FIREBASE_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

type NotificationRecord = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  related_id: string;
  related_type: string;
  action_url: string;
  direct_token: string;
};

type PushTokenRow = {
  id: string;
  token: string;
  platform?: string | null;
  notifications_enabled?: boolean | null;
  chat_enabled?: boolean | null;
  order_enabled?: boolean | null;
};

let cachedAccessToken = "";
let cachedAccessTokenExpiresAt = 0;
let cachedApnsAuthToken = "";
let cachedApnsAuthTokenIssuedAt = 0;

const jsonResponse = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const normalizeText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const isChatNotification = (notification: NotificationRecord) => notification.type === "new_message";

const isOrderNotification = (notification: NotificationRecord) =>
  notification.related_type === "order" ||
  ["order_placed", "shipping_update", "order_delivered"].includes(notification.type);

const notificationMatchesTokenPreferences = (
  notification: NotificationRecord,
  tokenRow: PushTokenRow,
) => {
  if (tokenRow.notifications_enabled === false) {
    return false;
  }

  if (isChatNotification(notification)) {
    return tokenRow.chat_enabled !== false;
  }

  if (isOrderNotification(notification)) {
    return tokenRow.order_enabled !== false;
  }

  return true;
};

const extractNotificationRecord = (payload: Record<string, unknown>): NotificationRecord => {
  const record =
    (payload.record as Record<string, unknown> | undefined) ||
    (payload.new as Record<string, unknown> | undefined) ||
    (payload.new_record as Record<string, unknown> | undefined) ||
    (payload.notification as Record<string, unknown> | undefined) ||
    payload;

  return {
    id: normalizeText(record.id),
    user_id: normalizeText(record.user_id || payload.receiver_id),
    type: normalizeText(record.type) || (payload.sender_id ? "new_message" : ""),
    title: normalizeText(record.title || payload.title) || "CloseShop",
    message: normalizeText(record.message || payload.content),
    related_id: normalizeText(record.related_id || payload.related_id),
    related_type: normalizeText(record.related_type || payload.related_type),
    action_url: normalizeText(record.action_url || payload.action_url),
    direct_token: normalizeText(payload.token),
  };
};

const buildActionUrl = (notification: NotificationRecord) => {
  if (notification.action_url) {
    return notification.action_url;
  }

  if (notification.type === "new_message" && notification.related_id) {
    return `/chatview/${notification.related_id}`;
  }

  return "/notificationview";
};

const toBase64Url = (value: string | Uint8Array) => {
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : value;

  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const pemToArrayBuffer = (pem: string) => {
  const sanitized = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");

  const binary = atob(sanitized);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
};

const getFirebaseAccessToken = async () => {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessTokenExpiresAt - 60 > now) {
    return cachedAccessToken;
  }

  const rawServiceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!rawServiceAccountJson) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON secret.");
  }

  const serviceAccount = JSON.parse(rawServiceAccountJson) as {
    client_email?: string;
    private_key?: string;
    token_uri?: string;
  };

  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 3600;
  const tokenUri = serviceAccount.token_uri || GOOGLE_TOKEN_URL;

  const jwtHeader = toBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const jwtClaimSet = toBase64Url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: FIREBASE_SCOPE,
      aud: tokenUri,
      iat: issuedAt,
      exp: expiresAt,
    }),
  );

  const unsignedJwt = `${jwtHeader}.${jwtClaimSet}`;
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(unsignedJwt),
  );

  const signedJwt = `${unsignedJwt}.${toBase64Url(new Uint8Array(signature))}`;

  const tokenResponse = await fetch(tokenUri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt,
    }),
  });

  const tokenResult = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenResult?.access_token) {
    throw new Error(`Unable to fetch Firebase access token: ${JSON.stringify(tokenResult)}`);
  }

  cachedAccessToken = tokenResult.access_token;
  cachedAccessTokenExpiresAt = issuedAt + Number(tokenResult.expires_in || 3600);
  return cachedAccessToken;
};

const getApnsAuthToken = async () => {
  const now = Math.floor(Date.now() / 1000);
  if (cachedApnsAuthToken && cachedApnsAuthTokenIssuedAt + (50 * 60) > now) {
    return cachedApnsAuthToken;
  }

  const apnsKeyId = Deno.env.get("APNS_KEY_ID");
  const apnsTeamId = Deno.env.get("APNS_TEAM_ID");
  const apnsPrivateKey = Deno.env.get("APNS_PRIVATE_KEY");

  if (!apnsKeyId || !apnsTeamId || !apnsPrivateKey) {
    throw new Error("Missing APNS_KEY_ID, APNS_TEAM_ID, or APNS_PRIVATE_KEY secret.");
  }

  const jwtHeader = toBase64Url(JSON.stringify({ alg: "ES256", kid: apnsKeyId }));
  const jwtClaimSet = toBase64Url(
    JSON.stringify({
      iss: apnsTeamId,
      iat: now,
    }),
  );

  const unsignedJwt = `${jwtHeader}.${jwtClaimSet}`;
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(apnsPrivateKey),
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: "SHA-256",
    },
    privateKey,
    new TextEncoder().encode(unsignedJwt),
  );

  cachedApnsAuthToken = `${unsignedJwt}.${toBase64Url(new Uint8Array(signature))}`;
  cachedApnsAuthTokenIssuedAt = now;
  return cachedApnsAuthToken;
};

const getSupabaseAdminClient = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret.");
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const fetchRecipientTokens = async (
  supabaseAdmin: ReturnType<typeof getSupabaseAdminClient>,
  notification: NotificationRecord,
) => {
  if (notification.direct_token) {
    return [
      {
        id: "direct-token",
        token: notification.direct_token,
        platform: "android",
        notifications_enabled: true,
        chat_enabled: true,
        order_enabled: true,
      },
    ] satisfies PushTokenRow[];
  }

  const { data, error } = await supabaseAdmin
    .from("user_push_tokens")
    .select("id, token, platform, notifications_enabled, chat_enabled, order_enabled")
    .eq("user_id", notification.user_id)
    .eq("is_active", true);

  if (error) {
    throw error;
  }

  return (data || []).filter((tokenRow) => notificationMatchesTokenPreferences(notification, tokenRow));
};

const sendPushMessage = async (
  accessToken: string,
  firebaseProjectId: string,
  notification: NotificationRecord,
  tokenRow: PushTokenRow,
) => {
  const requestBody = {
    message: {
      token: tokenRow.token,
      notification: {
        title: notification.title || "CloseShop",
        body: notification.message || "You have a new update.",
      },
      data: {
        notification_id: notification.id || "",
        type: notification.type || "",
        related_id: notification.related_id || "",
        related_type: notification.related_type || "",
        action_url: buildActionUrl(notification),
        title: notification.title || "CloseShop",
        message: notification.message || "",
      },
      android: {
        priority: "high",
        notification: {
          channel_id: PUSH_CHANNEL_ID,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
    },
  };

  const fcmResponse = await fetch(
    `https://fcm.googleapis.com/v1/projects/${firebaseProjectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    },
  );

  const fcmResult = await fcmResponse.json();

  if (fcmResponse.ok) {
    return {
      success: true,
      tokenRowId: tokenRow.id,
      response: fcmResult,
    };
  }

  const errorCode = normalizeText(
    fcmResult?.error?.details?.[0]?.errorCode || fcmResult?.error?.status || fcmResult?.error?.message,
  );

  return {
    success: false,
    tokenRowId: tokenRow.id,
    invalidToken: errorCode === "UNREGISTERED" || errorCode === "INVALID_ARGUMENT",
    response: fcmResult,
  };
};

const sendApnsMessage = async (
  notification: NotificationRecord,
  tokenRow: PushTokenRow,
) => {
  const apnsBundleId = Deno.env.get("APNS_BUNDLE_ID");
  const apnsHost = Deno.env.get("APNS_HOST") ||
    (Deno.env.get("APNS_USE_SANDBOX") === "true"
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com");

  if (!apnsBundleId) {
    throw new Error("Missing APNS_BUNDLE_ID secret.");
  }

  const apnsAuthToken = await getApnsAuthToken();
  const requestBody = {
    aps: {
      alert: {
        title: notification.title || "CloseShop",
        body: notification.message || "You have a new update.",
      },
      sound: "default",
    },
    notification_id: notification.id || "",
    type: notification.type || "",
    related_id: notification.related_id || "",
    related_type: notification.related_type || "",
    action_url: buildActionUrl(notification),
    title: notification.title || "CloseShop",
    message: notification.message || "",
  };

  const apnsResponse = await fetch(`${apnsHost}/3/device/${tokenRow.token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${apnsAuthToken}`,
      "apns-topic": apnsBundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await apnsResponse.text();
  const apnsResult = responseText ? JSON.parse(responseText) : {};

  if (apnsResponse.ok) {
    return {
      success: true,
      tokenRowId: tokenRow.id,
      response: apnsResult,
    };
  }

  const errorCode = normalizeText(apnsResult?.reason);
  return {
    success: false,
    tokenRowId: tokenRow.id,
    invalidToken:
      errorCode === "BadDeviceToken" ||
      errorCode === "DeviceTokenNotForTopic" ||
      errorCode === "Unregistered",
    response: apnsResult,
  };
};

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const payload = await req.json();
    const notification = extractNotificationRecord(payload);

    if (!notification.user_id && !notification.direct_token) {
      return jsonResponse(400, { error: "Missing notification recipient." });
    }

    if (!notification.message && !notification.title) {
      return jsonResponse(400, { error: "Missing notification content." });
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const recipientTokens = await fetchRecipientTokens(supabaseAdmin, notification);

    if (recipientTokens.length === 0) {
      return jsonResponse(200, {
        success: true,
        dispatched: 0,
        reason: "No active push tokens matched this notification.",
      });
    }

    const hasFirebaseRecipients = recipientTokens.some((tokenRow) => tokenRow.platform !== "ios");
    const firebaseProjectId = hasFirebaseRecipients ? Deno.env.get("FIREBASE_PROJECT_ID") : "";
    const firebaseAccessToken = hasFirebaseRecipients ? await getFirebaseAccessToken() : "";

    if (hasFirebaseRecipients && !firebaseProjectId) {
      throw new Error("Missing FIREBASE_PROJECT_ID secret.");
    }

    const results = await Promise.all(
      recipientTokens.map((tokenRow) => {
        if (tokenRow.platform === "ios") {
          return sendApnsMessage(notification, tokenRow);
        }

        return sendPushMessage(firebaseAccessToken, firebaseProjectId, notification, tokenRow);
      }),
    );

    const invalidTokenIds = results
      .filter((result) => !result.success && result.invalidToken && result.tokenRowId !== "direct-token")
      .map((result) => result.tokenRowId);

    if (invalidTokenIds.length > 0) {
      const { error } = await supabaseAdmin
        .from("user_push_tokens")
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .in("id", invalidTokenIds);

      if (error) {
        console.warn("Could not deactivate invalid push tokens:", error);
      }
    }

    const dispatchedCount = results.filter((result) => result.success).length;

    return jsonResponse(200, {
      success: true,
      dispatched: dispatchedCount,
      attempted: recipientTokens.length,
      invalidated: invalidTokenIds.length,
      results,
    });
  } catch (error) {
    console.error("Push notification dispatch failed:", error);
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unknown push dispatch error",
    });
  }
});
