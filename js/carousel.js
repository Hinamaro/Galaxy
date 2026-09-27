document.addEventListener("DOMContentLoaded", async () => {
    const track = document.querySelector("#hero-track");
    const dots = document.querySelector("#carousel-dots");
    const prev = document.querySelector(".carousel-prev");
    const next = document.querySelector(".carousel-next");

    if (!track || !dots) return;

    const slides = [
        { label: "ARTE DE DESTAQUE · 01", className: "hero-art-one" },
        { label: "CHARACTER ART · 02", className: "hero-art-two" },
        { label: "COMISSÕES ABERTAS · 03", className: "hero-art-three" }
    ];

    slides.forEach((slide, index) => {
        const item = document.createElement("div");
        item.className = `hero-slide ${slide.className}`;
        item.innerHTML = `<div class="art-placeholder" style="background-image:url(assets/hero/hero-${String(index+1).padStart(2,"0")}.svg);background-size:cover;background-position:center;"></div>`;
        track.appendChild(item);

        const dot = document.createElement("button");
        dot.setAttribute("aria-label", `Ir para banner ${index + 1}`);
        dot.addEventListener("click", () => goTo(index));
        dots.appendChild(dot);
    });

    let current = 0;

    function render() {
        track.style.transform = `translateX(-${current * 100}%)`;
        [...dots.children].forEach((dot, index) => dot.classList.toggle("active", index === current));
    }

    function goTo(index) {
        current = (index + slides.length) % slides.length;
        render();
    }

    prev?.addEventListener("click", () => goTo(current - 1));
    next?.addEventListener("click", () => goTo(current + 1));

    render();

    setInterval(() => goTo(current + 1), 6000);
});