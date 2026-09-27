document.addEventListener("DOMContentLoaded", async () => {
    const card = document.querySelector(".status-card");
    const title = document.querySelector("#status-title");
    const description = document.querySelector("#status-description");
    const slots = document.querySelector("#status-slots");
    const note = document.querySelector("#status-note");
    const updated = document.querySelector("#status-updated");
    const config = window.GALAXY_BACKEND;
    const trackingForm = document.querySelector("#tracking-form");
    const trackingCode = document.querySelector("#tracking-code");
    const trackingMessage = document.querySelector("#tracking-message");
    const trackingResult = document.querySelector("#tracking-result");
    const trackingRequest = document.querySelector("#tracking-request");
    const clientRequestForm = document.querySelector("#client-request-form");
    const clientRequestMessage = document.querySelector("#tracking-request-message");
    let activeTrackingCode = "";
    const orderStatuses = [
        ["received", "Pedido recebido"], ["quote", "Orçamento"], ["payment", "Pagamento"],
        ["queue", "Na fila"], ["sketch", "Esboço"], ["approval", "Aprovação"],
        ["finalizing", "Finalização"], ["delivered", "Entregue"]
    ];
    const statusDescriptions = {
        received: "A artista recebeu seu pedido e vai revisar os detalhes.",
        quote: "Estamos combinando o valor e os detalhes da comissão.",
        payment: "Aguardando a confirmação do pagamento combinado.",
        queue: "Tudo certo! Seu pedido está aguardando a vez na fila.",
        sketch: "A artista está preparando o esboço da sua arte.",
        approval: "O esboço está pronto e aguarda sua aprovação ou comentários.",
        finalizing: "A arte está nos ajustes finais antes da entrega.",
        delivered: "Sua comissão foi finalizada e entregue. Obrigada pelo apoio!",
        cancelled: "Este pedido foi cancelado. Entre em contato com as artistas se tiver dúvidas."
    };

    const showUnavailable = (heading, message) => {
        card.dataset.state = "setup";
        title.textContent = heading;
        description.textContent = message;
        slots.hidden = true;
        note.hidden = true;
        updated.textContent = "";
    };

    if (!window.supabase?.createClient || !config?.supabaseUrl || !config?.publishableKey) {
        showUnavailable("Status em configuração", "A disponibilidade será exibida aqui assim que o sistema for conectado.");
    }

    const client = window.supabase?.createClient && config?.supabaseUrl && config?.publishableKey
        ? window.supabase.createClient(config.supabaseUrl, config.publishableKey)
        : null;
    if (client) {
        const { data, error } = await client
            .from("commission_status")
            .select("state, slots_left, public_note, updated_at")
            .eq("id", 1)
            .single();

        if (error || !data) {
            showUnavailable("Não foi possível carregar o status", "Tente novamente mais tarde ou fale conosco para confirmar a disponibilidade.");
        } else {
            const states = {
                open: ["Comissões abertas", "Estamos recebendo novos pedidos no momento."],
                few: ["Poucas vagas disponíveis", "Estamos aceitando alguns pedidos antes de fechar a fila."],
                closed: ["Comissões fechadas", "No momento não estamos recebendo novos pedidos."]
            };
            const [heading, message] = states[data.state] || states.closed;
            card.dataset.state = data.state;
            title.textContent = heading;
            description.textContent = message;

            if (data.state !== "closed" && Number(data.slots_left) > 0) {
                slots.textContent = Number(data.slots_left) === 1 ? "1 vaga disponível" : `${Number(data.slots_left)} vagas disponíveis`;
                slots.hidden = false;
            } else slots.hidden = true;

            if (data.public_note?.trim()) {
                note.textContent = data.public_note.trim();
                note.hidden = false;
            } else note.hidden = true;

            if (data.updated_at) {
                const date = new Date(data.updated_at);
                updated.textContent = `Atualizado em ${date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`;
            }
        }
    }

    async function lookupOrder(rawCode) {
        trackingMessage.hidden = true;
        trackingResult.hidden = true;
        trackingResult.replaceChildren();
        trackingRequest.hidden = true;
        const code = rawCode.trim().replace(/[^a-f\d]/gi, "").toUpperCase();
        activeTrackingCode = code;
        if (!client) {
            trackingMessage.textContent = "A consulta está temporariamente indisponível. Tente novamente mais tarde.";
            trackingMessage.classList.add("is-error");
            trackingMessage.classList.remove("is-loading");
            trackingMessage.hidden = false;
            return;
        }
        trackingMessage.textContent = "Buscando seu pedido…";
        trackingMessage.hidden = false;
        trackingMessage.classList.add("is-loading");
        trackingMessage.classList.remove("is-error");
        const { data, error } = await client.rpc("get_public_order_status", { lookup_code: code });
        trackingMessage.hidden = true;
        if (error) {
            trackingMessage.textContent = "Não foi possível consultar agora. Tente novamente mais tarde.";
            trackingMessage.classList.add("is-error");
            trackingMessage.classList.remove("is-loading");
            trackingMessage.hidden = false;
            return;
        }
        const order = Array.isArray(data) ? data[0] : data;
        if (!order) {
            trackingMessage.textContent = "Não encontramos esse código. Confira com cuidado ou fale com a artista que registrou seu pedido.";
            trackingMessage.classList.add("is-error");
            trackingMessage.classList.remove("is-loading");
            trackingMessage.hidden = false;
            return;
        }
        const statusIndex = orderStatuses.findIndex(([value]) => value === order.status);
        const statusLabel = order.status === "cancelled" ? "Pedido cancelado" : (orderStatuses[statusIndex]?.[1] || "Pedido em andamento");
        trackingResult.dataset.status = order.status;
        const heading = document.createElement("div");
        heading.className = "tracking-result-heading";
        const title = document.createElement("h3");
        title.textContent = "Acompanhe sua comissão";
        const badge = document.createElement("span");
        badge.className = "tracking-status-badge";
        badge.dataset.status = order.status;
        badge.textContent = statusLabel;
        heading.append(title, badge);
        const subtitle = document.createElement("p");
        subtitle.className = "tracking-order-type";
        subtitle.textContent = `${order.art_type} · recebido em ${new Date(order.created_at).toLocaleDateString("pt-BR")}`;
        const explanation = document.createElement("p");
        explanation.className = "tracking-explanation";
        explanation.textContent = statusDescriptions[order.status] || "A artista está atualizando o andamento do seu pedido.";
        const updated = document.createElement("p");
        updated.className = "tracking-updated";
        updated.textContent = `Etapa atualizada em ${new Date(order.updated_at || order.created_at).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}`;
        const estimate = document.createElement("p");
        estimate.className = "tracking-estimate";
        if (order.estimated_delivery) {
            const [year, month, day] = order.estimated_delivery.split("-").map(Number);
            estimate.textContent = `Previsão de entrega: ${new Date(year, month - 1, day).toLocaleDateString("pt-BR", { dateStyle: "long" })}`;
            estimate.dataset.hasEstimate = "true";
        } else {
            estimate.textContent = "A artista ainda não informou uma previsão de entrega.";
            estimate.dataset.hasEstimate = "false";
        }
        const timeline = document.createElement("div");
        timeline.className = "tracking-timeline";
        if (order.status !== "cancelled") {
            orderStatuses.forEach(([value, label], index) => {
                const step = document.createElement("div");
                step.dataset.status = value;
                step.className = `tracking-step${index < statusIndex ? " is-done" : ""}${index === statusIndex ? " is-current" : ""}`;
                step.textContent = label;
                timeline.append(step);
            });
            trackingResult.append(heading, subtitle, explanation, updated, estimate, timeline);
        } else trackingResult.append(heading, subtitle, explanation, updated, estimate);
        if (Array.isArray(order.history) && order.history.length) {
            const historySection = document.createElement("section");
            historySection.className = "tracking-history";
            const historyTitle = document.createElement("h4");
            historyTitle.textContent = "Movimentações do pedido";
            const historyList = document.createElement("ol");
            order.history.forEach(item => {
                const entry = document.createElement("li");
                const label = orderStatuses.find(([value]) => value === item.status)?.[1] || (item.status === "cancelled" ? "Cancelado" : "Atualização");
                const time = new Date(item.changed_at).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" });
                entry.textContent = `${label} · ${time}`;
                historyList.append(entry);
            });
            historySection.append(historyTitle, historyList);
            trackingResult.append(historySection);
        }
        const contactLink = document.createElement("a");
        contactLink.className = "button button-secondary tracking-contact-link";
        contactLink.href = "contact.html";
        contactLink.textContent = "Falar com as artistas";
        trackingResult.append(contactLink);
        trackingResult.hidden = false;
        trackingRequest.hidden = false;
    }

    trackingForm.addEventListener("submit", async event => {
        event.preventDefault();
        await lookupOrder(trackingCode.value);
    });

    clientRequestForm.addEventListener("submit", async event => {
        event.preventDefault();
        clientRequestMessage.hidden = true;
        const submit = clientRequestForm.querySelector("button[type=submit]");
        submit.disabled = true;
        const { data, error } = client ? await client.rpc("submit_public_order_request", {
            lookup_code: activeTrackingCode,
            request_kind: document.querySelector("#client-request-type").value,
            request_message: document.querySelector("#client-request-message").value.trim()
        }) : { data: false, error: true };
        submit.disabled = false;
        if (error || data !== true) {
            clientRequestMessage.textContent = "Não foi possível enviar. Aguarde alguns minutos e tente novamente.";
            clientRequestMessage.dataset.state = "error";
            clientRequestMessage.hidden = false;
            return;
        }
        clientRequestForm.reset();
        clientRequestMessage.textContent = "Solicitação enviada às artistas. Elas vão analisar e responder pelo canal de contato já combinado.";
        clientRequestMessage.dataset.state = "success";
        clientRequestMessage.hidden = false;
    });

    const sharedCode = new URLSearchParams(window.location.search).get("codigo");
    if (sharedCode) {
        trackingCode.value = sharedCode;
        lookupOrder(sharedCode);
    }
});
