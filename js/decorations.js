document.addEventListener("DOMContentLoaded", () => {
    const containers =
        document.querySelectorAll(".decorations");

    containers.forEach(container => {
        const total = 8;

        for (let i = 0; i < total; i++) {
            const particle =
                document.createElement("span");

            particle.classList.add(
                "floating-particle"
            );

            particle.style.setProperty(
                "--x",
                `${Math.random() * 100}%`
            );

            particle.style.setProperty(
                "--y",
                `${Math.random() * 100}%`
            );

            particle.style.setProperty(
                "--delay",
                `${Math.random() * 5}s`
            );

            particle.style.setProperty(
                "--duration",
                `${4 + Math.random() * 5}s`
            );

            const size = 3 + Math.random() * 5;

            particle.style.width = `${size}px`;
            particle.style.height = `${size}px`;

            container.appendChild(particle);
        }
    });

    const layer =
        document.createElement("div");

    layer.className = "page-sparkles";
    layer.setAttribute("aria-hidden", "true");

    document.body.prepend(layer);

    const totalStars = 32;

    for (let i = 0; i < totalStars; i++) {
        const star =
            document.createElement("span");

        const isPurple = i % 2 === 0;

        star.className =
            `page-sparkle ${
                isPurple
                    ? "page-sparkle-purple"
                    : "page-sparkle-pink"
            }`;

        star.style.setProperty(
            "--x",
            `${Math.random() * 100}%`
        );

        star.style.setProperty(
            "--y",
            `${Math.random() * 100}%`
        );

        star.style.setProperty(
            "--size",
            `${2 + Math.random() * 4}px`
        );

        star.style.setProperty(
            "--delay",
            `${Math.random() * 7}s`
        );

        star.style.setProperty(
            "--duration",
            `${4 + Math.random() * 5}s`
        );

        star.style.setProperty(
            "--color",
            isPurple
                ? "var(--accent-purple)"
                : "var(--accent)"
        );

        layer.appendChild(star);
    }
});