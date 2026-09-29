document.addEventListener("DOMContentLoaded", () => {
    const button = document.querySelector("#share-site-button");
    const feedback = document.querySelector("#share-site-feedback");
    if (!button) return;

    button.addEventListener("click", async () => {
        const url = new URL("/", window.location.href).href;
        const details = {
            title: "Zoolixianas — duas artistas, muitos mundos",
            text: "Explore ilustrações, personagens e universos das Zoolixianas — e encontre a arte perfeita para sua ideia.",
            url,
        };
        try {
            if (navigator.share) await navigator.share(details);
            else {
                await navigator.clipboard.writeText(url);
                if (feedback) feedback.textContent = "Link do site copiado. Agora é só compartilhar onde quiser.";
            }
        } catch (error) {
            if (error?.name === "AbortError") return;
            try {
                await navigator.clipboard.writeText(url);
                if (feedback) feedback.textContent = "Link do site copiado. Agora é só compartilhar onde quiser.";
            } catch {
                if (feedback) feedback.textContent = `Copie o link do site para compartilhar: ${url}`;
            }
        }
    });
});
