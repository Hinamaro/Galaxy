const commissions = [
    {
        title: "Ícone",
        price: "R$ XX",
        label: "Ícone",
        description: "Uma ilustração focada no rosto e expressão do personagem.",
        items: ["1 personagem", "Alta resolução", "Fundo simples"]
    },
    {
        title: "Busto",
        price: "R$ XX",
        label: "Busto",
        description: "Do busto até o peito, ideal para personagens e perfis.",
        items: ["1 personagem", "Alta resolução", "Fundo simples"]
    },
    {
        title: "Meio corpo",
        price: "R$ XX",
        label: "Meio corpo",
        description: "Uma composição mais completa para destacar seu personagem.",
        items: ["1 personagem", "Alta resolução", "Fundo simples"]
    },
    {
        title: "Corpo inteiro",
        price: "R$ XX",
        label: "Corpo inteiro",
        description: "Seu personagem completo em uma ilustração finalizada.",
        items: ["1 personagem", "Alta resolução", "Fundo simples"]
    }
];

document.addEventListener("DOMContentLoaded", () => {
    const preview = document.querySelector("#commission-preview");
    const grid = document.querySelector("#commission-grid");

    if (preview) renderCommissions(preview, commissions.slice(0, 3));
    if (grid) renderCommissions(grid, commissions);
});

function renderCommissions(container, items) {
    container.innerHTML = items.map(item => `
        <article class="commission-card">
            <div class="commission-card-image art-placeholder" style="background-image:url(assets/commissions/${item.title === "Ícone" ? "icon" : item.title === "Busto" ? "bust" : item.title === "Meio corpo" ? "halfbody" : "fullbody"}.svg);background-size:cover;background-position:center;"> </div>
            <div class="commission-card-content">
                <span class="eyebrow">Comissão</span>
                <h3>${item.title}</h3>
                <p class="price">${item.price}</p>
                <p>${item.description}</p>
                <ul>${item.items.map(value => `<li>${value}</li>`).join("")}</ul>
                <a class="button button-secondary" href="contact.html">Solicitar</a>
            </div>
        </article>
    `).join("");
}