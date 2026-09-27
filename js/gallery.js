document.addEventListener("DOMContentLoaded", async () => {
    const filters = [...document.querySelectorAll(".gallery-filter")];
    const grid = document.querySelector(".gallery-grid");
    if (!grid) return;
    let activeCategory = "all";

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
        });
    }
    applyFilter();
});
