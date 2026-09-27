document.addEventListener("DOMContentLoaded", () => {
    const items = document.querySelectorAll(".spotlight");

    items.forEach(item => {
        item.addEventListener("mousemove", event => {
            const rect = item.getBoundingClientRect();

            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            item.style.setProperty("--mouse-x", `${x}px`);
            item.style.setProperty("--mouse-y", `${y}px`);
        });

        item.addEventListener("mouseleave", () => {
            item.style.setProperty("--mouse-x", "-100px");
            item.style.setProperty("--mouse-y", "-100px");
        });
    });
});