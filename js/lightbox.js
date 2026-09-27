document.addEventListener("DOMContentLoaded", () => {
    const lightbox = document.querySelector("#lightbox");
    const closeButton = lightbox?.querySelector(".lightbox-close");
    const imageArea = lightbox?.querySelector(".lightbox-image");
    const title = lightbox?.querySelector("#lightbox-title");
    const description = lightbox?.querySelector("#lightbox-description");
    const category = lightbox?.querySelector("#lightbox-category");
    const counter = lightbox?.querySelector("#lightbox-counter");
    const previousButton = lightbox?.querySelector(".lightbox-prev");
    const nextButton = lightbox?.querySelector(".lightbox-next");

    if (!lightbox || !closeButton || !imageArea) return;

    let activeItems = [];
    let activeIndex = 0;
    let previousFocus = null;
    let pointerStartX = null;

    const triggers = () => [...document.querySelectorAll("[data-lightbox-trigger]")];
    const isVisible = trigger => {
        const item = trigger.closest(".gallery-item");
        return !item || getComputedStyle(item).display !== "none";
    };

    function renderItem(index) {
        if (!activeItems.length) return;
        activeIndex = (index + activeItems.length) % activeItems.length;
        const trigger = activeItems[activeIndex];
        const image = trigger.querySelector("img");
        if (!image) return;

        const largeImage = document.createElement("img");
        largeImage.src = trigger.getAttribute("href") || image.currentSrc || image.src;
        largeImage.alt = image.alt || trigger.dataset.title || "Imagem ampliada";
        imageArea.replaceChildren(largeImage);

        const item = trigger.closest(".gallery-item");
        title.textContent = trigger.dataset.title || item?.dataset.title || image.alt || "Imagem";
        description.textContent = trigger.dataset.description || item?.dataset.description || "";
        category.textContent = trigger.dataset.category ||
            item?.querySelector(".gallery-overlay .tag")?.textContent.trim() ||
            item?.dataset.category || "Arte digital";

        const multiple = activeItems.length > 1;
        previousButton.hidden = !multiple;
        nextButton.hidden = !multiple;
        counter.hidden = !multiple;
        if (multiple) counter.textContent = `${String(activeIndex + 1).padStart(2, "0")} / ${String(activeItems.length).padStart(2, "0")}`;
        lightbox.setAttribute("aria-label", `${title.textContent}, imagem ${activeIndex + 1} de ${activeItems.length}`);
    }

    function openLightbox(trigger) {
        const group = trigger.dataset.lightboxTrigger;
        activeItems = triggers().filter(item => item.dataset.lightboxTrigger === group && isVisible(item));
        activeIndex = Math.max(0, activeItems.indexOf(trigger));
        previousFocus = trigger;
        renderItem(activeIndex);
        lightbox.classList.add("open");
        lightbox.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
        closeButton.focus();
    }

    function closeLightbox() {
        if (!lightbox.classList.contains("open")) return;
        lightbox.classList.remove("open");
        lightbox.setAttribute("aria-hidden", "true");
        imageArea.replaceChildren();
        document.body.style.overflow = "";
        previousFocus?.focus();
    }

    triggers().forEach(trigger => {
        trigger.addEventListener("click", event => {
            event.preventDefault();
            openLightbox(trigger);
        });
    });

    closeButton.addEventListener("click", closeLightbox);
    previousButton?.addEventListener("click", () => renderItem(activeIndex - 1));
    nextButton?.addEventListener("click", () => renderItem(activeIndex + 1));

    lightbox.addEventListener("click", event => {
        if (event.target === lightbox) closeLightbox();
    });

    lightbox.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            event.preventDefault();
            closeLightbox();
        } else if (event.key === "ArrowLeft" && activeItems.length > 1) {
            event.preventDefault();
            renderItem(activeIndex - 1);
        } else if (event.key === "ArrowRight" && activeItems.length > 1) {
            event.preventDefault();
            renderItem(activeIndex + 1);
        } else if (event.key === "Tab") {
            const controls = [...lightbox.querySelectorAll("button:not([hidden])")];
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    });

    imageArea.addEventListener("pointerdown", event => {
        if (event.pointerType === "touch") pointerStartX = event.clientX;
    }, { passive: true });

    imageArea.addEventListener("pointerup", event => {
        if (pointerStartX === null) return;
        const distance = event.clientX - pointerStartX;
        pointerStartX = null;
        if (Math.abs(distance) < 48 || activeItems.length < 2) return;
        renderItem(activeIndex + (distance < 0 ? 1 : -1));
    }, { passive: true });

    imageArea.addEventListener("pointercancel", () => {
        pointerStartX = null;
    }, { passive: true });
});
