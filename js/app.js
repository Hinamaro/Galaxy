document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector("#commission-form");
    const message = document.querySelector("#form-message");
    const success = document.querySelector("#form-success");
    const submitButton = form?.querySelector("[type='submit']");
    const originalLabel = submitButton?.innerHTML;

    if (!form) {
        return;
    }

    if (success) {
        success.hidden = true;
    }

    const showMessage = (text, type = "") => {
        if (!message) {
            return;
        }

        message.textContent = text;
        message.hidden = false;
        message.classList.toggle("is-error", type === "error");
        message.classList.toggle("is-success", type === "success");
    };

    form.addEventListener(
        "invalid",
        () => {
            showMessage(
                "Preencha os campos obrigatórios antes de enviar.",
                "error"
            );
        },
        true
    );

    form.addEventListener("submit", async event => {
        event.preventDefault();

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        showMessage("Enviando sua solicitação...");

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.innerHTML =
                'Enviando... <span aria-hidden="true">↗</span>';
        }

        try {
            const response = await fetch(form.action, {
                method: "POST",
                body: new FormData(form),
                headers: {
                    Accept: "application/json"
                }
            });

            if (!response.ok) {
                throw new Error("O Formspree recusou o envio.");
            }

            form.reset();

            showMessage(
                "Solicitação enviada com sucesso! Em breve entraremos em contato.",
                "success"
            );
        } catch (error) {
            console.error(error);

            showMessage(
                "Não foi possível enviar agora. Confira sua conexão e tente novamente.",
                "error"
            );
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.innerHTML =
                    originalLabel ||
                    'Enviar solicitação <span aria-hidden="true">→</span>';
            }
        }
    });
});

const currentYear =
    document.querySelector("#current-year");

if (currentYear) {
    currentYear.textContent =
        new Date().getFullYear();
}
