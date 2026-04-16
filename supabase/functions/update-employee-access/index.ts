import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Payload = {
  employeeId?: string;
  email?: string;
  password?: string;
  requesterUserId?: string;
};

const getUserIdFromBearer = (authHeader: string) => {
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const [, payload] = token.split(".");
  if (!payload) return null;
  try {
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return decoded?.sub || null;
  } catch {
    return null;
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );

    const payload = await req.json() as Payload;
    const requesterUserId = payload.requesterUserId?.trim() || getUserIdFromBearer(authHeader);

    if (!requesterUserId) {
      return new Response(JSON.stringify({ error: "Не удалось определить пользователя" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: requesterRow, error: requesterError } = await supabaseAdmin
      .from("employees")
      .select("employee_type")
      .eq("auth_user_id", requesterUserId)
      .maybeSingle();

    if (requesterError || requesterRow?.employee_type !== "admin") {
      return new Response(JSON.stringify({ error: "Менять доступ может только админ" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const employeeId = payload.employeeId?.trim();
    const email = payload.email?.trim().toLowerCase();
    const password = payload.password?.trim();

    if (!employeeId || (!email && !password)) {
      return new Response(JSON.stringify({ error: "Нужно указать employeeId и новое значение email или password" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: employee, error: employeeError } = await supabaseAdmin
      .from("employees")
      .select("id, auth_user_id")
      .eq("id", employeeId)
      .maybeSingle();

    if (employeeError || !employee?.auth_user_id) {
      return new Response(JSON.stringify({ error: "У сотрудника ещё нет логина для изменения" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const attrs: Record<string, string> = {};
    if (email) attrs.email = email;
    if (password) attrs.password = password;

    const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      employee.auth_user_id,
      attrs,
    );

    if (updateError || !updated.user) {
      return new Response(JSON.stringify({ error: updateError?.message || "Не удалось обновить доступ" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (email) {
      await supabaseAdmin
        .from("employees")
        .update({ auth_email: updated.user.email || email })
        .eq("id", employeeId);
    }

    return new Response(JSON.stringify({
      employeeId,
      authUserId: updated.user.id,
      email: updated.user.email,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Неизвестная ошибка" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
