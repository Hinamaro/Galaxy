document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector("#commission-intake-form");
    const message = document.querySelector("#commission-intake-message");
    const config = window.GALAXY_BACKEND;
    const client = window.supabase?.createClient && config?.supabaseUrl && config?.publishableKey
        ? window.supabase.createClient(config.supabaseUrl, config.publishableKey)
        : null;
    if (!form || !message) return;

    const setMessage = (text, state = "") => {
        message.replaceChildren(document.createTextNode(text));
        message.dataset.state = state;
        message.hidden = false;
    };

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const button = form.querySelector("button[type=submit]");
        button.disabled = true;
        setMessage("Enviando seu pedido para a artista…");
        const values = new FormData(form);
        const { data, error } = client ? await client.rpc("submit_public_commission_request", {
            request_name: String(values.get("name") || "").trim(),
            request_contact: String(values.get("contact") || "").trim(),
            request_email: String(values.get("email") || "").trim(),
            request_artist: String(values.get("artist") || ""),
            request_type: String(values.get("type") || "").trim(),
            request_summary: String(values.get("summary") || "").trim(),
            request_reference: String(values.get("reference") || "").trim(),
            request_email_consent: document.querySelector("#intake-email-consent").checked
        }) : { data: null, error: new Error("Sistema indisponível") };
        button.disabled = false;
        const result = Array.isArray(data) ? data[0] : data;
        if (error || !result?.tracking_code) {
            setMessage(error?.message?.includes("submit_public_commission_request")
                ? "O formulário está quase pronto. Falta aplicar a configuração do portal no Supabase."
                : error?.message?.includes("recent")
                    ? "Você enviou um pedido agora há pouco. Aguarde dois minutos e tente novamente."
                    : "Não foi possível enviar agora. Confira os campos e tente novamente.", "error");
            return;
        }
        form.reset();
        setMessage("Pedido enviado para análise! Guarde este código para acompanhar: ");
        const code = document.createElement("strong");
        code.textContent = result.tracking_code;
        const link = document.createElement("a");
        link.href = `status.html?codigo=${encodeURIComponent(result.tracking_code)}`;
        link.textContent = " Abrir acompanhamento do pedido";
        message.append(code, document.createElement("br"), link);
        message.dataset.state = "success";
        message.focus?.();
    });
});
