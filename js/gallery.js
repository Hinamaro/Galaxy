document.addEventListener("DOMContentLoaded", async () => {
    const filters = [...document.querySelectorAll(".gallery-filter")];
    const grid = document.querySelector(".gallery-grid");
    if (!grid) return;
    let activeCategory = "all";
    const shareFeedback = document.querySelector("#share-feedback");

    function addShareButton(article) {
        const overlay = article.querySelector(".gallery-overlay");
        if (!overlay || overlay.querySelector(".gallery-share-button")) return;
        const title = article.dataset.title || article.querySelector("h3")?.textContent.trim() || "Arte Zoolixianas";
        const share = document.createElement("button");
        share.type = "button";
        share.className = "gallery-share-button";
        share.textContent = "↗ Compartilhar";
        share.setAttribute("aria-label", `Compartilhar a obra ${title}`);
        share.addEventListener("click", async event => {
            event.stopPropagation();
            const url = new URL("gallery.html", window.location.href);
            url.searchParams.set("obra", title);
            const shareData = { title: `${title} | Zoolixianas`, text: "Veja esta arte das Zoolixianas!", url: url.href };
            try {
                if (navigator.share) await navigator.share(shareData);
                else {
                    await navigator.clipboard.writeText(url.href);
                    if (shareFeedback) shareFeedback.textContent = "Link da obra copiado. Agora é só compartilhar onde quiser.";
                }
            } catch (error) {
                if (error?.name === "AbortError") return;
                try {
                    await navigator.clipboard.writeText(url.href);
                    if (shareFeedback) shareFeedback.textContent = "Link da obra copiado. Agora é só compartilhar onde quiser.";
                } catch {
                    if (shareFeedback) shareFeedback.textContent = `Copie o link para compartilhar: ${url.href}`;
                }
            }
        });
        overlay.append(share);
    }

    grid.querySelectorAll(".gallery-item").forEach(addShareButton);

    function applyFilter() {
        const items = [...grid.querySelectorAll(".gallery-item")];
        filters.forEach(button => {
            const active = button.dataset.filter === activeCategory;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });
        items.forEach(item => {
            const visible = activeCategory === "all" || item.dataset.category === activeCategory;
            item.style.display = visible ? "" : "none";
        });
    }

    filters.forEach(button => button.addEventListener("click", () => {
        activeCategory = button.dataset.filter;
        applyFilter();
    }));

    const config = window.GALAXY_BACKEND;
    if (window.supabase?.createClient && config?.supabaseUrl && config?.publishableKey) {
        const client = window.supabase.createClient(config.supabaseUrl, config.publishableKey);
        const { data } = await client.from("commission_gallery")
            .select("title, category, artist_name, image_path")
            .eq("published", true).eq("consent_confirmed", true)
            .order("created_at", { ascending: false });
        (data || []).forEach(item => {
            const article = document.createElement("article");
            article.className = "gallery-item published-commission";
            article.dataset.category = item.category;
            article.dataset.title = item.title;
            article.dataset.description = `Comissão concluída por ${item.artist_name}. Publicada com autorização.`;
            const url = client.storage.from("commission-gallery").getPublicUrl(item.image_path).data.publicUrl;
            const button = document.createElement("button");
            button.type = "button";
            button.className = "gallery-image-button";
            button.dataset.lightboxTrigger = "gallery";
            button.dataset.title = item.title;
            button.dataset.category = item.category;
            button.dataset.description = article.dataset.description;
            const image = document.createElement("img");
            image.className = "gallery-image";
            image.src = url;
            image.alt = item.title;
            image.loading = "lazy";
            button.append(image);
            const overlay = document.createElement("div");
            overlay.className = "gallery-overlay";
            const tag = document.createElement("span");
            tag.className = "tag";
            tag.textContent = ({ character: "Personagem", fanart: "Fanart", oc: "OC", illustration: "Ilustração" })[item.category] || "Comissão";
            const title = document.createElement("h3");
            title.textContent = item.title;
            const artist = document.createElement("span");
            artist.className = "arrow-link";
            artist.textContent = `Arte por ${item.artist_name} →`;
            overlay.append(tag, title, artist);
            article.append(button, overlay);
            grid.append(article);
            addShareButton(article);
        });
    }
    applyFilter();

    const sharedArtwork = new URLSearchParams(window.location.search).get("obra");
    if (sharedArtwork) {
        const matchingItem = [...grid.querySelectorAll(".gallery-item")].find(item => item.dataset.title === sharedArtwork);
        const imageButton = matchingItem?.querySelector("[data-lightbox-trigger]");
        if (imageButton) {
            const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            matchingItem.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
            window.setTimeout(() => imageButton.click(), 250);
        }
    }
});
