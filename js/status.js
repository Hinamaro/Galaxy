document.addEventListener("DOMContentLoaded", async () => {
    const card = document.querySelector(".status-card");
    const title = document.querySelector("#status-title");
    const description = document.querySelector("#status-description");
    const slots = document.querySelector("#status-slots");
    const note = document.querySelector("#status-note");
    const updated = document.querySelector("#status-updated");
    const config = window.GALAXY_BACKEND;

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
        return;
    }

    const client = window.supabase.createClient(config.supabaseUrl, config.publishableKey);
    const { data, error } = await client
        .from("commission_status")
        .select("state, slots_left, public_note, updated_at")
        .eq("id", 1)
        .single();

    if (error || !data) {
        showUnavailable("Não foi possível carregar o status", "Tente novamente mais tarde ou fale conosco para confirmar a disponibilidade.");
        return;
    }

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
        slots.textContent = Number(data.slots_left) === 1
            ? "1 vaga disponível"
            : `${Number(data.slots_left)} vagas disponíveis`;
        slots.hidden = false;
    } else {
        slots.hidden = true;
    }

    if (data.public_note?.trim()) {
        note.textContent = data.public_note.trim();
        note.hidden = false;
    } else {
        note.hidden = true;
    }

    if (data.updated_at) {
        const date = new Date(data.updated_at);
        updated.textContent = `Atualizado em ${date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`;
    }
});
