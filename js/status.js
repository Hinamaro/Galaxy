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
    const orderStatuses = [
        ["received", "Pedido recebido"], ["quote", "Orçamento"], ["payment", "Pagamento"],
        ["queue", "Na fila"], ["sketch", "Esboço"], ["approval", "Aprovação"],
        ["finalizing", "Finalização"], ["delivered", "Entregue"]
    ];

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

    trackingForm.addEventListener("submit", async event => {
        event.preventDefault();
        trackingMessage.hidden = true;
        trackingResult.hidden = true;
        trackingResult.replaceChildren();
        const code = trackingCode.value.trim().replace(/[^a-f\d]/gi, "").toUpperCase();
        if (!client) {
            trackingMessage.textContent = "A consulta está temporariamente indisponível. Tente novamente mais tarde.";
            trackingMessage.hidden = false;
            return;
        }
        trackingMessage.textContent = "Buscando seu pedido…";
        trackingMessage.hidden = false;
        trackingMessage.classList.remove("is-error");
        const { data, error } = await client.rpc("get_public_order_status", { lookup_code: code });
        trackingMessage.hidden = true;
        if (error) {
            trackingMessage.textContent = "Não foi possível consultar agora. Tente novamente mais tarde.";
            trackingMessage.hidden = false;
            return;
        }
        const order = Array.isArray(data) ? data[0] : data;
        if (!order) {
            trackingMessage.textContent = "Não encontramos esse código. Confira com cuidado ou fale com a artista que registrou seu pedido.";
            trackingMessage.hidden = false;
            return;
        }
        const statusIndex = orderStatuses.findIndex(([value]) => value === order.status);
        const heading = document.createElement("h3");
        heading.textContent = order.status === "cancelled" ? "Pedido cancelado" : (orderStatuses[statusIndex]?.[1] || "Pedido em andamento");
        const subtitle = document.createElement("p");
        subtitle.textContent = `${order.art_type} · recebido em ${new Date(order.created_at).toLocaleDateString("pt-BR")}`;
        const timeline = document.createElement("div");
        timeline.className = "tracking-timeline";
        if (order.status !== "cancelled") {
            orderStatuses.forEach(([value, label], index) => {
                const step = document.createElement("div");
                step.className = `tracking-step${index < statusIndex ? " is-done" : ""}${index === statusIndex ? " is-current" : ""}`;
                step.textContent = label;
                timeline.append(step);
            });
            trackingResult.append(heading, subtitle, timeline);
        } else trackingResult.append(heading, subtitle);
        trackingResult.hidden = false;
    });
});
