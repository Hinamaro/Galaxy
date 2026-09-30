import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") {
    return Response.json({ error: "Método não permitido." }, { status: 405, headers: corsHeaders });
  }

  try {
    const { lookupCode, fileId, deliveryPassword } = await request.json();
    if (typeof lookupCode !== "string" || !/^[a-f0-9-]{1,64}$/i.test(lookupCode)
      || typeof fileId !== "string" || !/^[0-9a-f-]{36}$/i.test(fileId)
      || (deliveryPassword !== undefined && deliveryPassword !== null
        && (typeof deliveryPassword !== "string" || deliveryPassword.length > 256))) {
      return Response.json({ error: "Código ou arquivo inválido." }, { status: 400, headers: corsHeaders });
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Configuração segura indisponível.");

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await admin.rpc("get_protected_order_delivery_download", {
      lookup_code: lookupCode,
      delivery_id: fileId,
      delivery_password: deliveryPassword || null,
    });
    const file = Array.isArray(data) ? data[0] : data;
    if (error || !file?.file_path) {
      return Response.json({ error: "Senha incorreta, ainda não configurada ou arquivo indisponível." }, { status: 403, headers: corsHeaders });
    }

    const storage = admin.storage.from("commission-deliveries");
    const [{ data: preview, error: previewError }, { data: download, error: downloadError }] = await Promise.all([
      storage.createSignedUrl(file.file_path, 300),
      storage.createSignedUrl(file.file_path, 300, { download: file.original_name }),
    ]);
    if (previewError || downloadError || !preview?.signedUrl || !download?.signedUrl) {
      throw previewError || downloadError || new Error("Não foi possível preparar o arquivo.");
    }
    return Response.json({ previewUrl: preview.signedUrl, downloadUrl: download.signedUrl }, { headers: corsHeaders });
  } catch {
    return Response.json({ error: "Não foi possível abrir esse arquivo agora." }, { status: 500, headers: corsHeaders });
  }
});
