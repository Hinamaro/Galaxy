const SITE_ORIGIN = "https://zoolixianas.vercel.app";
const SHARE_IMAGE = `${SITE_ORIGIN}/assets/branding/share-card.jpg`;

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

export default function handler(request, response) {
    if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        return response.status(405).send("Method not allowed");
    }

    const rawTitle = Array.isArray(request.query.obra) ? request.query.obra[0] : request.query.obra;
    const title = String(rawTitle || "Arte das Zoolixianas").trim().slice(0, 120);
    const safeTitle = escapeHtml(title || "Arte das Zoolixianas");
    const description = escapeHtml(`Conheça “${title}”, uma obra das Zoolixianas. Explore a galeria e descubra sua próxima comissão.`);
    const destination = new URL("/gallery.html", SITE_ORIGIN);
    destination.searchParams.set("obra", title || "Arte das Zoolixianas");
    const shareUrl = new URL("/api/share", SITE_ORIGIN);
    shareUrl.searchParams.set("obra", title || "Arte das Zoolixianas");
    const safeDestination = escapeHtml(destination.href);
    const safeShareUrl = escapeHtml(shareUrl.href);

    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return response.status(200).send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle} | Zoolixianas</title>
  <meta name="description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Zoolixianas">
  <meta property="og:title" content="${safeTitle} | Zoolixianas">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${safeShareUrl}">
  <meta property="og:image" content="${SHARE_IMAGE}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Duas artistas, muitos mundos — Zoolixianas">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle} | Zoolixianas">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${SHARE_IMAGE}">
  <meta http-equiv="refresh" content="0;url=${safeDestination}">
</head>
<body><p>Abrindo a obra… <a href="${safeDestination}">Continuar para a galeria</a></p></body>
</html>`);
}
