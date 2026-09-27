document.addEventListener("DOMContentLoaded", () => {

    const header =
        document.querySelector("#site-header");

    const toggle =
        document.querySelector("#menu-toggle");

    const nav =
        document.querySelector("#main-nav");


    if (!header) return;


    /*
     * =====================================================
     * HEADER AO ROLAR
     * =====================================================
     */

    const updateHeader =
        () => {

            if (window.scrollY > 20) {

                header.classList.add("scrolled");

            } else {

                header.classList.remove("scrolled");

            }

        };


    updateHeader();


    window.addEventListener(
        "scroll",
        updateHeader,
        {
            passive: true
        }
    );


    /*
     * =====================================================
     * MENU MOBILE
     * =====================================================
     */

    if (toggle && nav) {

        const setMenuOpen = isOpen => {
            header.classList.toggle("menu-open", isOpen);
            toggle.setAttribute("aria-expanded", String(isOpen));
            toggle.setAttribute("aria-label", isOpen ? "Fechar menu" : "Abrir menu");
            toggle.textContent = isOpen ? "×" : "☰";
        };

        toggle.addEventListener("click", () => {
            setMenuOpen(!header.classList.contains("menu-open"));
        });


        /*
         * Fechar menu ao clicar
         */

        nav.querySelectorAll("a")
            .forEach(link => {

                link.addEventListener(
                    "click",
                    () => {

                        setMenuOpen(false);

                    }
                );

            });


        /*
         * Fechar ao apertar ESC
         */

        document.addEventListener(
            "keydown",
            event => {

                if (
                    event.key === "Escape" &&
                    header.classList.contains(
                        "menu-open"
                    )
                ) {

                    setMenuOpen(false);

                    toggle.focus();

                }

            }
        );


        /*
         * Fechar se clicar fora
         */

        const desktopViewport = window.matchMedia("(min-width: 721px)");
        const closeOnDesktop = event => {
            if (event.matches) setMenuOpen(false);
        };

        if (desktopViewport.addEventListener) {
            desktopViewport.addEventListener("change", closeOnDesktop);
        } else {
            desktopViewport.addListener(closeOnDesktop);
        }

        document.addEventListener(
            "click",
            event => {

                if (
                    !header.classList.contains(
                        "menu-open"
                    )
                ) {
                    return;
                }


                if (
                    !header.contains(
                        event.target
                    )
                ) {

                    setMenuOpen(false);

                }

            }
        );

    }


    /*
     * =====================================================
     * PÁGINA ATUAL
     * =====================================================
     */

    const currentPage =
        window.location.pathname
            .split("/")
            .pop() || "index.html";


    nav?.querySelectorAll("a")
        .forEach(link => {

            const href =
                link.getAttribute("href");


            if (
                href === currentPage
            ) {

                link.classList.add("active");

            }

        });

});