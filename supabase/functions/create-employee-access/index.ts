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
    const userId = payload.requesterUserId?.trim() || getUserIdFromBearer(authHeader);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Не удалось определить пользователя" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: requesterRow, error: requesterError } = await supabaseAdmin
      .from("employees")
      .select("id, employee_type")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (requesterError || requesterRow?.employee_type !== "admin") {
      return new Response(JSON.stringify({ error: "Выдавать доступ может только админ" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const employeeId = payload.employeeId?.trim();
    const email = payload.email?.trim().toLowerCase();
    const password = payload.password?.trim();

    if (!employeeId || !email || !password) {
      return new Response(JSON.stringify({ error: "Нужны employeeId, email и password" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: employee, error: employeeError } = await supabaseAdmin
      .from("employees")
      .select("id, name, auth_user_id")
      .eq("id", employeeId)
      .maybeSingle();

    if (employeeError || !employee) {
      return new Response(JSON.stringify({ error: "Сотрудник не найден" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (employee.auth_user_id) {
      return new Response(JSON.stringify({ error: "У сотрудника уже есть доступ" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        employee_name: employee.name,
      },
    });

    if (createError || !created.user) {
      return new Response(JSON.stringify({ error: createError?.message || "Не удалось создать auth пользователя" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: linkError } = await supabaseAdmin
      .from("employees")
      .update({ auth_user_id: created.user.id, auth_email: email })
      .eq("id", employee.id);

    if (linkError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return new Response(JSON.stringify({ error: "Не удалось привязать доступ к сотруднику" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      employeeId: employee.id,
      authUserId: created.user.id,
      email,
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
