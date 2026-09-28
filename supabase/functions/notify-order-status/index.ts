import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const labels: Record<string, string> = {
  received: "Pedido recebido", quote: "Orçamento enviado", payment: "Aguardando pagamento",
  queue: "Na fila", sketch: "Esboço", approval: "Aguardando aprovação",
  finalizing: "Finalização", delivered: "Entregue", cancelled: "Cancelado",
};

const htmlEntities: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => htmlEntities[char]);

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return Response.json({ error: "Método não permitido." }, { status: 405, headers: corsHeaders });

  const authorization = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  let publishableKey = "";
  try { publishableKey = publishableKeys ? JSON.parse(publishableKeys).default || "" : ""; } catch { publishableKey = ""; }
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || publishableKey;
  const emailJsPublicKey = Deno.env.get("EMAILJS_PUBLIC_KEY");
  const emailJsServiceId = Deno.env.get("EMAILJS_SERVICE_ID");
  const emailJsTemplateId = Deno.env.get("EMAILJS_TEMPLATE_ID");
  const siteUrlValue = Deno.env.get("SITE_URL") || "";
  if (!authorization || !supabaseUrl || !anonKey) return Response.json({ error: "Sessão ausente." }, { status: 401, headers: corsHeaders });

  const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return Response.json({ error: "Sessão inválida." }, { status: 401, headers: corsHeaders });
  const { data: isArtist } = await supabase.rpc("is_artist");
  if (!isArtist) return Response.json({ error: "Acesso não autorizado." }, { status: 403, headers: corsHeaders });

  let orderId: string;
  try { orderId = String((await request.json()).orderId || ""); }
  catch { return Response.json({ error: "Pedido inválido." }, { status: 400, headers: corsHeaders }); }
  if (!orderId) return Response.json({ error: "Pedido inválido." }, { status: 400, headers: corsHeaders });

  const { data: order, error } = await supabase.from("commission_orders")
    .select("id, client_name, client_email, email_updates_enabled, art_type, status, tracking_code, estimated_delivery")
    .eq("id", orderId).single();
  if (error || !order) return Response.json({ error: "Pedido não encontrado ou sem acesso." }, { status: 404, headers: corsHeaders });
  if (!order.email_updates_enabled || !order.client_email) {
    return Response.json({ skipped: true, reason: "E-mail não autorizado para atualizações." }, { headers: corsHeaders });
  }
  const missingSettings = [
    !emailJsPublicKey && "EMAILJS_PUBLIC_KEY",
    !emailJsServiceId && "EMAILJS_SERVICE_ID",
    !emailJsTemplateId && "EMAILJS_TEMPLATE_ID",
    !siteUrlValue && "SITE_URL",
  ].filter(Boolean);
  if (missingSettings.length) return Response.json({ error: `Falta configurar nos segredos do Supabase: ${missingSettings.join(", ")}.` }, { status: 503, headers: corsHeaders });
  let siteUrl: URL;
  try { siteUrl = new URL(siteUrlValue); }
  catch { return Response.json({ error: "SITE_URL precisa ser o endereço HTTPS do site publicado." }, { status: 503, headers: corsHeaders }); }
  if (siteUrl.protocol !== "https:") return Response.json({ error: "SITE_URL precisa começar com https://." }, { status: 503, headers: corsHeaders });

  const label = labels[order.status] || "Pedido atualizado";
  const trackingUrl = `${siteUrl.origin}/status.html?codigo=${encodeURIComponent(order.tracking_code)}`;
  const eta = order.estimated_delivery
    ? new Date(`${order.estimated_delivery}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })
    : "Ainda não informada";
  const name = escapeHtml(order.client_name);
  const artType = escapeHtml(order.art_type);
  const safeLabel = escapeHtml(label);
  const safeEta = escapeHtml(eta);
  const safeUrl = escapeHtml(trackingUrl);
  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: emailJsPublicKey,
      service_id: emailJsServiceId,
      template_id: emailJsTemplateId,
      template_params: {
        to_email: order.client_email,
        client_name: name,
        art_type: artType,
        status_label: safeLabel,
        eta: safeEta,
        tracking_url: safeUrl,
        subject: `Atualização da sua comissão: ${label}`,
      },
    }),
  });
  if (!response.ok) {
    let providerDetail = `HTTP ${response.status}`;
    try {
      providerDetail = (await response.text()).slice(0, 240) || providerDetail;
    } catch { /* O provedor pode responder sem JSON. */ }
    return Response.json({ error: `O provedor recusou o envio (${response.status}): ${providerDetail}` }, { status: 502, headers: corsHeaders });
  }
  return Response.json({ sent: true }, { headers: corsHeaders });
});
