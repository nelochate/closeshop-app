import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const normalizeText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const getCorsHeaders = (request: Request) => {
  const origin = normalizeText(request.headers.get("Origin")) || "*";
  const requestedHeaders = normalizeText(request.headers.get("Access-Control-Request-Headers"));

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      requestedHeaders || "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin, Access-Control-Request-Headers",
  };
};

const jsonResponse = (request: Request, status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...getCorsHeaders(request),
      "Content-Type": "application/json",
    },
  });

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const getSupabaseAdminClient = () =>
  createClient(getRequiredEnv("SUPABASE_URL"), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

const getSupabaseUserClient = (authorization: string) =>
  createClient(getRequiredEnv("SUPABASE_URL"), getRequiredEnv("SUPABASE_ANON_KEY"), {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

const parseAvatarStoragePath = (publicUrl: string) => {
  const marker = "/storage/v1/object/public/avatars/";
  const markerIndex = publicUrl.indexOf(marker);

  if (markerIndex < 0) {
    return "";
  }

  return decodeURIComponent(publicUrl.slice(markerIndex + marker.length).split("?")[0] || "");
};

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: getCorsHeaders(request),
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(request, 405, { error: "Method not allowed." });
  }

  try {
    const authorization = normalizeText(request.headers.get("Authorization"));

    if (!authorization) {
      return jsonResponse(request, 401, { error: "Missing authorization header." });
    }

    const requestBody = await request.json().catch(() => ({}));
    if (requestBody?.confirmDelete !== true) {
      return jsonResponse(request, 400, {
        error: "Account deletion must be explicitly confirmed.",
      });
    }

    const userClient = getSupabaseUserClient(authorization);
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user?.id) {
      return jsonResponse(request, 401, { error: "Unable to resolve the authenticated user." });
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const userId = user.id;
    const timestamp = new Date().toISOString();

    const { data: profileRow, error: profileFetchError } = await supabaseAdmin
      .from("profiles")
      .select("avatar_url")
      .eq("id", userId)
      .maybeSingle();

    if (profileFetchError) {
      throw profileFetchError;
    }

    const avatarPath = parseAvatarStoragePath(normalizeText(profileRow?.avatar_url));
    if (avatarPath) {
      const { error: avatarDeleteError } = await supabaseAdmin.storage.from("avatars").remove([
        avatarPath,
      ]);

      if (avatarDeleteError) {
        console.warn("Could not delete avatar asset during account deletion:", avatarDeleteError);
      }
    }

    const cleanupTasks = [
      supabaseAdmin
        .from("shops")
        .update({
          status: "declined",
          manual_status: "closed",
          gcash_enabled: false,
          payment_enabled: false,
          updated_at: timestamp,
        })
        .eq("owner_id", userId),
      supabaseAdmin.from("notifications").delete().eq("user_id", userId),
      supabaseAdmin.from("cart_items").delete().eq("user_id", userId),
      supabaseAdmin.from("addresses").delete().eq("user_id", userId),
      supabaseAdmin.from("reviews").delete().eq("user_id", userId),
      supabaseAdmin.from("user_push_tokens").delete().eq("user_id", userId),
      supabaseAdmin
        .from("profiles")
        .update({
          first_name: "Deleted",
          last_name: "User",
          full_name: "Deleted User",
          email: `deleted-${userId}@deleted.local`,
          avatar_url: null,
          updated_at: timestamp,
        })
        .eq("id", userId),
    ];

    const cleanupResults = await Promise.allSettled(cleanupTasks);
    const cleanupError = cleanupResults.find(
      (result) => result.status === "rejected" || result.value?.error,
    );

    if (cleanupError) {
      if (cleanupError.status === "rejected") {
        throw cleanupError.reason;
      }

      throw cleanupError.value.error;
    }

    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId, true);

    if (deleteUserError) {
      throw deleteUserError;
    }

    return jsonResponse(request, 200, {
      success: true,
      userId,
    });
  } catch (error) {
    console.error("Delete account function failed:", error);
    return jsonResponse(request, 500, {
      error: error instanceof Error ? error.message : "Failed to delete account.",
    });
  }
});
