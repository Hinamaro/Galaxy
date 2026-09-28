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
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAIL_FROM");
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
  const missingSettings = [!resendKey && "RESEND_API_KEY", !from && "MAIL_FROM", !siteUrlValue && "SITE_URL"].filter(Boolean);
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
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [order.client_email],
      subject: `Atualização da sua comissão: ${label}`,
      text: `Oi, ${order.client_name}!\n\nSua comissão (${order.art_type}) foi atualizada: ${label}.\nPrevisão de entrega: ${eta}.\n\nAcompanhe: ${trackingUrl}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#482651;background:#fff8fc;border:1px solid #eed6e8;border-radius:18px"><p style="color:#a34f80;font-weight:bold">ZOOLIXIANAS · COMISSÕES</p><h1 style="font-size:24px">Oi, ${name}!</h1><p>Sua comissão <strong>${artType}</strong> recebeu uma atualização:</p><p style="padding:14px;background:#f8eafa;border-radius:12px"><strong>${safeLabel}</strong></p><p>Previsão de entrega: <strong>${safeEta}</strong></p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#d987b5;color:white;text-decoration:none;border-radius:999px">Acompanhar pedido</a></p><p style="color:#88778b;font-size:13px">Este aviso foi enviado porque você autorizou atualizações por e-mail.</p></div>`,
    }),
  });
  if (!response.ok) {
    let providerDetail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      providerDetail = String(body?.message || body?.name || body?.error || providerDetail).slice(0, 240);
    } catch { /* O provedor pode responder sem JSON. */ }
    return Response.json({ error: `O provedor recusou o envio (${response.status}): ${providerDetail}` }, { status: 502, headers: corsHeaders });
  }
  return Response.json({ sent: true }, { headers: corsHeaders });
});
