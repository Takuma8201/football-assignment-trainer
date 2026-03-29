import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const TABLE_NAME = "shared_app_state";
const ROW_ID = "global";

type SharedAppState = {
  systems?: unknown[];
  deletedSystems?: unknown[];
  playDrafts?: unknown[];
  deletedPlayDrafts?: unknown[];
  tests?: unknown[];
};

const createAdminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
};

const normalizeState = (value: SharedAppState | null | undefined) => ({
  systems: Array.isArray(value?.systems) ? value?.systems : [],
  deletedSystems: Array.isArray(value?.deletedSystems) ? value?.deletedSystems : [],
  playDrafts: Array.isArray(value?.playDrafts) ? value?.playDrafts : [],
  deletedPlayDrafts: Array.isArray(value?.deletedPlayDrafts) ? value?.deletedPlayDrafts : [],
  tests: Array.isArray(value?.tests) ? value?.tests : []
});

export async function GET() {
  const client = createAdminClient();

  if (!client) {
    return NextResponse.json({ error: "shared storage is not configured" }, { status: 503 });
  }

  const { data, error } = await client
    .from(TABLE_NAME)
    .select("payload")
    .eq("id", ROW_ID)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    state: normalizeState((data?.payload ?? null) as SharedAppState | null)
  });
}

export async function POST(request: Request) {
  const client = createAdminClient();

  if (!client) {
    return NextResponse.json({ error: "shared storage is not configured" }, { status: 503 });
  }

  const body = (await request.json()) as { state?: SharedAppState };
  const nextState = normalizeState(body.state);

  const { data, error } = await client
    .from(TABLE_NAME)
    .upsert(
      {
        id: ROW_ID,
        payload: nextState,
        updated_at: new Date().toISOString()
      },
      { onConflict: "id" }
    )
    .select("payload")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    state: normalizeState((data?.payload ?? nextState) as SharedAppState)
  });
}
