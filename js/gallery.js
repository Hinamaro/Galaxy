document.addEventListener("DOMContentLoaded", () => {

    const filters =
        document.querySelectorAll(".gallery-filter");

    const items =
        document.querySelectorAll(".gallery-item");


    if (!filters.length || !items.length) {
        return;
    }


    filters.forEach(filter => {

        filter.addEventListener("click", () => {

            const category =
                filter.dataset.filter;


            /*
             * Atualiza botão ativo
             */

            filters.forEach(button => {
                button.classList.remove("active");
            });

            filter.classList.add("active");


            /*
             * Filtra os trabalhos
             */

            items.forEach(item => {

                const itemCategory =
                    item.dataset.category;


                const shouldShow =
                    category === "all" ||
                    itemCategory === category;


                if (shouldShow) {

                    item.style.display = "";

                    requestAnimationFrame(() => {

                        item.style.opacity = "1";

                        item.style.transform =
                            "translateY(0)";

                    });

                } else {

                    item.style.opacity = "0";

                    item.style.transform =
                        "translateY(15px)";

                    setTimeout(() => {

                        if (
                            item.style.opacity === "0"
                        ) {
                            item.style.display =
                                "none";
                        }

                    }, 300);

                }

            });

        });

    });

});