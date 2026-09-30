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
const statusColors: Record<string, string> = {
  received: "#ad5a83", quote: "#a74f7f", payment: "#874f87", queue: "#805a98",
  sketch: "#68568c", approval: "#5b4c8c", finalizing: "#523c76", delivered: "#47765e", cancelled: "#735666",
};
const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

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
  const emailJsAccessToken = Deno.env.get("EMAILJS_ACCESS_TOKEN");
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
    .select("id, client_name, client_email, email_updates_enabled, artist_email_message, artist_email_messages, art_type, status, tracking_code, estimated_delivery")
    .eq("id", orderId).single();
  if (error || !order) return Response.json({ error: "Pedido não encontrado ou sem acesso." }, { status: 404, headers: corsHeaders });
  const { data: visibleDeliveries } = await supabase.from("commission_deliveries")
    .select("file_kind, password_required")
    .eq("order_id", order.id).eq("client_visible", true);
  const sharedFiles = Array.isArray(visibleDeliveries) ? visibleDeliveries : [];
  const sharedSketch = sharedFiles.filter(file => file.file_kind === "sketch");
  const sharedFinal = sharedFiles.filter(file => file.file_kind === "final");
  if (!order.email_updates_enabled || !order.client_email) {
    return Response.json({ skipped: true, reason: "E-mail não autorizado para atualizações." }, { headers: corsHeaders });
  }
  const recordAttempt = async (sent: boolean, detail: string | null) => {
    // Email delivery should not fail just because optional audit logging did.
    await supabase.from("commission_email_notifications").insert({
      order_id: order.id, status: order.status, sent, detail: detail?.slice(0, 500) || null,
    });
  };
  const missingSettings = [
    !emailJsPublicKey && "EMAILJS_PUBLIC_KEY",
    !emailJsAccessToken && "EMAILJS_ACCESS_TOKEN",
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
    : "Ainda sem previsão definida.";
  const perStatusMessages = order.artist_email_messages && typeof order.artist_email_messages === "object"
    ? order.artist_email_messages as Record<string, unknown> : {};
  const artistMessage = String(perStatusMessages[order.status] ?? order.artist_email_message ?? "").trim().slice(0, 500)
    || "Nenhum recado adicional nesta atualização.";
  const statusColor = statusColors[order.status] || "#a174bb";
  const subject = order.status === "approval"
    ? "✦ Seu esboço está pronto para aprovação"
    : order.status === "delivered"
      ? "✦ Sua comissão foi finalizada"
      : `✦ Sua comissão foi atualizada: ${label}`;
  const hasLinkedDelivery = order.status === "approval" ? sharedSketch.length > 0
    : order.status === "delivered" ? sharedFinal.length > 0 : false;
  const relevantFiles = order.status === "approval" ? sharedSketch : order.status === "delivered" ? sharedFinal : [];
  const hasPasswordProtectedDelivery = relevantFiles.some(file => file.password_required);
  const ctaLabel = hasLinkedDelivery
    ? order.status === "approval" ? "Acessar esboço" : "Acessar arte final"
    : "Acompanhar minha comissão";
  const introMessage = order.status === "approval" && hasLinkedDelivery
    ? `Seu esboço está disponível para revisão.${hasPasswordProtectedDelivery ? " A artista enviará a senha separadamente." : " Acesse pelo botão abaixo."}`
    : order.status === "delivered" && hasLinkedDelivery
      ? `Sua arte final está disponível.${hasPasswordProtectedDelivery ? " A artista enviará a senha separadamente." : " Acesse pelo botão abaixo."}`
      : "A artista atualizou sua comissão. Acesse o acompanhamento para ver os detalhes.";
  const preheader = order.status === "approval" && hasLinkedDelivery
    ? "Seu esboço está disponível para revisão no acompanhamento do pedido."
    : order.status === "delivered" && hasLinkedDelivery
      ? "Sua arte final está pronta. Abra o link para acessar e baixar."
      : order.status === "approval"
        ? "A artista atualizou seu pedido. Acesse o acompanhamento para ver os detalhes."
        : order.status === "delivered"
          ? "Sua comissão foi finalizada. Acesse o acompanhamento para ver os detalhes."
          : "A artista atualizou seu pedido. Veja a nova etapa no site.";
  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: emailJsPublicKey,
      accessToken: emailJsAccessToken,
      service_id: emailJsServiceId,
      template_id: emailJsTemplateId,
      template_params: {
        to_email: order.client_email,
        from_name: "Zoolixianas · Comissões",
        client_name: escapeHtml(order.client_name),
        art_type: escapeHtml(order.art_type),
        status_label: label,
        eta,
        tracking_code: order.tracking_code,
        tracking_url: trackingUrl,
        has_eta: Boolean(order.estimated_delivery),
        has_artist_message: Boolean(artistMessage),
        artist_message: escapeHtml(artistMessage),
        status_color: statusColor,
        cta_label: ctaLabel,
        intro_message: introMessage,
        subject,
        preheader,
      },
    }),
  });
  if (!response.ok) {
    let providerDetail = `HTTP ${response.status}`;
    try {
      providerDetail = (await response.text()).slice(0, 240) || providerDetail;
    } catch { /* O provedor pode responder sem JSON. */ }
    await recordAttempt(false, `O provedor recusou o envio (HTTP ${response.status}).`);
    return Response.json({ error: `O provedor recusou o envio (${response.status}): ${providerDetail}` }, { status: 502, headers: corsHeaders });
  }
  await recordAttempt(true, null);
  return Response.json({ sent: true }, { headers: corsHeaders });
});
