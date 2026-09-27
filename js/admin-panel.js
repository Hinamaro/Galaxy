document.addEventListener("DOMContentLoaded", async () => {
    const config = window.GALAXY_BACKEND;
    const backendMessage = document.querySelector("#backend-message");
    const authMessage = document.querySelector("#auth-message");
    const signInPanel = document.querySelector("#signin-panel");
    const passwordResetPanel = document.querySelector("#password-reset-panel");
    const dashboard = document.querySelector("#admin-dashboard");

    let client = null;
    let passwordRecoveryMode = false;

    const setMessage = (message, isError = false) => {
        authMessage.textContent = message;
        authMessage.hidden = !message;
        authMessage.classList.toggle("is-error", isError);
        authMessage.classList.toggle("is-success", !isError && Boolean(message));
    };

    const showOnly = panel => {
        [signInPanel, passwordResetPanel].forEach(item => item.hidden = item !== panel);
        dashboard.hidden = true;
    };

    if (!window.supabase?.createClient || !config?.supabaseUrl || !config?.publishableKey) {
        backendMessage.textContent = "O painel está pronto, mas ainda precisa ser conectado ao projeto de dados. Veja o arquivo SUPABASE_SETUP.md incluído no site.";
        showOnly(signInPanel);
        return;
    }

    client = window.supabase.createClient(config.supabaseUrl, config.publishableKey);
    backendMessage.hidden = true;

    client.auth.onAuthStateChange(event => {
        if (event === "PASSWORD_RECOVERY") {
            passwordRecoveryMode = true;
            showOnly(passwordResetPanel);
        }
    });

    document.querySelector("#forgot-password").addEventListener("click", async () => {
        const emailInput = document.querySelector("#signin-email");
        const email = emailInput.value.trim();
        if (!emailInput.checkValidity() || !email) {
            emailInput.reportValidity();
            setMessage("Informe o e-mail da conta para receber a recuperação de senha.", true);
            emailInput.focus();
            return;
        }
        const { error } = await client.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}${window.location.pathname}`
        });
        if (error) {
            setMessage("Não foi possível enviar a recuperação. Confira se o endereço do site está permitido nas configurações de autenticação.", true);
            return;
        }
        setMessage("Se o endereço estiver cadastrado, você receberá um link para criar outra senha.");
    });

    document.querySelector("#password-reset-form").addEventListener("submit", async event => {
        event.preventDefault();
        const password = new FormData(event.currentTarget).get("password");
        const { error } = await client.auth.updateUser({ password });
        if (error) {
            setMessage("Não foi possível atualizar a senha. Abra novamente o link de recuperação mais recente.", true);
            return;
        }
        await client.auth.signOut();
        showOnly(signInPanel);
        setMessage("Senha atualizada. Entre com sua nova senha.");
    });

    async function checkArtist() {
        const { data, error } = await client.rpc("is_artist");
        if (error) throw new Error("Não foi possível confirmar o acesso de artista. Confira a lista de contas autorizadas no sistema.");
        if (data !== true) throw new Error("Esta conta não está autorizada para acessar o painel.");
    }

    async function loadDashboard() {
        await checkArtist();
        const { data: availability, error } = await client
            .from("commission_status")
            .select("state, slots_left, public_note")
            .eq("id", 1)
            .single();
        if (error) throw error;

        document.querySelector("#availability-state").value = availability.state;
        document.querySelector("#availability-slots").value = availability.slots_left;
        document.querySelector("#availability-note").value = availability.public_note || "";
        showOnly(null);
        dashboard.hidden = false;
        await loadOrders();
    }

    async function continueSession() {
        try {
            await loadDashboard();
        } catch (error) {
            setMessage(error.message || "Não foi possível validar o acesso.", true);
            await client.auth.signOut();
            showOnly(signInPanel);
        }
    }

    document.querySelector("#signin-form").addEventListener("submit", async event => {
        event.preventDefault();
        setMessage("");
        const form = new FormData(event.currentTarget);
        const { error } = await client.auth.signInWithPassword({
            email: form.get("email").trim(),
            password: form.get("password")
        });
        if (error) {
            setMessage("Não foi possível entrar. Confira o e-mail e a senha da conta autorizada.", true);
            return;
        }
        await continueSession();
    });

    document.querySelector("#signout-button").addEventListener("click", async () => {
        await client.auth.signOut();
        showOnly(signInPanel);
        setMessage("Sessão encerrada.");
    });

    document.querySelector("#availability-form").addEventListener("submit", async event => {
        event.preventDefault();
        const { error } = await client.from("commission_status").update({
            state: document.querySelector("#availability-state").value,
            slots_left: Number(document.querySelector("#availability-slots").value),
            public_note: document.querySelector("#availability-note").value.trim()
        }).eq("id", 1);
        if (error) {
            setMessage("Não foi possível salvar a disponibilidade. Confira se sua conta está autorizada no Supabase.", true);
            return;
        }
        setMessage("Disponibilidade atualizada na página pública.");
    });

    const orderStatuses = [
        ["received", "Pedido recebido"],
        ["quote", "Orçamento enviado"],
        ["payment", "Aguardando pagamento"],
        ["queue", "Na fila"],
        ["sketch", "Esboço"],
        ["approval", "Aguardando aprovação"],
        ["finalizing", "Finalização"],
        ["delivered", "Entregue"],
        ["cancelled", "Cancelado"]
    ];
    const ordersSearch = document.querySelector("#orders-search");
    const ordersFilter = document.querySelector("#orders-filter");
    const ordersOverview = document.querySelector("#orders-overview");
    let cachedOrders = [];

    function renderOrdersOverview() {
        ordersOverview.replaceChildren();
        const filters = [["all", "Todos", cachedOrders.length], ...orderStatuses.map(([value, label]) => [
            value,
            label,
            cachedOrders.filter(order => order.status === value).length
        ])];
        filters.forEach(([value, label, count]) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "order-count-chip";
            chip.dataset.status = value;
            chip.setAttribute("aria-pressed", String(ordersFilter.value === value));
            const number = document.createElement("strong");
            number.textContent = count;
            const caption = document.createElement("span");
            caption.textContent = label;
            chip.append(number, caption);
            chip.addEventListener("click", () => {
                ordersFilter.value = value;
                renderOrdersOverview();
                renderOrders();
            });
            ordersOverview.append(chip);
        });
    }

    ordersSearch.addEventListener("input", renderOrders);
    ordersFilter.addEventListener("change", () => {
        renderOrdersOverview();
        renderOrders();
    });

    function renderOrders() {
        const container = document.querySelector("#orders-list");
        container.replaceChildren();
        const query = ordersSearch.value.trim().toLocaleLowerCase("pt-BR");
        const filtered = cachedOrders.filter(order => {
            const matchesStatus = ordersFilter.value === "all" || order.status === ordersFilter.value;
            const searchable = `${order.client_name} ${order.tracking_code || ""}`.toLocaleLowerCase("pt-BR");
            return matchesStatus && searchable.includes(query);
        });
        if (!filtered.length) {
            container.textContent = cachedOrders.length
                ? "Nenhum pedido corresponde à busca e ao filtro selecionados."
                : "Ainda não há pedidos cadastrados.";
            return;
        }

        filtered.forEach(order => {
            const row = document.createElement("article");
            row.className = "order-row";
            row.dataset.status = order.status;
            const details = document.createElement("div");
            const heading = document.createElement("h4");
            heading.textContent = order.client_name;
            const badge = document.createElement("span");
            badge.className = "order-status-badge";
            badge.dataset.status = order.status;
            badge.textContent = orderStatuses.find(([value]) => value === order.status)?.[1] || "Em andamento";
            const contact = document.createElement("p");
            contact.className = "order-contact";
            contact.textContent = order.client_contact;
            const type = document.createElement("p");
            type.className = "order-type";
            type.textContent = order.art_type;
            const summary = document.createElement("p");
            summary.className = "order-summary";
            summary.textContent = order.summary;
            const date = document.createElement("span");
            date.className = "order-date";
            date.textContent = new Date(order.created_at).toLocaleDateString("pt-BR");
            const lastUpdated = document.createElement("span");
            const updatedDay = new Date(order.updated_at || order.created_at);
            const today = new Date();
            updatedDay.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);
            const daysSinceUpdate = Math.max(0, Math.floor((today - updatedDay) / 86400000));
            lastUpdated.className = `order-last-updated${daysSinceUpdate >= 7 ? " is-stale" : ""}`;
            lastUpdated.textContent = daysSinceUpdate === 0 ? "Atualizado hoje" : daysSinceUpdate === 1 ? "Atualizado ontem" : `Sem atualização há ${daysSinceUpdate} dias`;
            const tracking = document.createElement("p");
            tracking.className = "order-tracking-code";
            tracking.textContent = `Código para o cliente: ${order.tracking_code || " indisponível"}`;
            if (order.tracking_code) {
                const copyCode = document.createElement("button");
                copyCode.type = "button";
                copyCode.className = "copy-tracking-code";
                copyCode.textContent = "Copiar código";
                copyCode.addEventListener("click", async () => {
                    try {
                        await navigator.clipboard.writeText(order.tracking_code);
                        setMessage(`Código ${order.tracking_code} copiado para compartilhar com o cliente.`);
                    } catch {
                        setMessage(`Copie este código para o cliente: ${order.tracking_code}`);
                    }
                });
                tracking.append(document.createTextNode(" "), copyCode);
            }
            details.append(heading, badge, contact, type, summary, date, lastUpdated, tracking);

            const select = document.createElement("select");
            select.dataset.status = order.status;
            select.setAttribute("aria-label", `Etapa do pedido de ${order.client_name}`);
            orderStatuses.forEach(([value, label]) => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                option.selected = order.status === value;
                select.append(option);
            });
            select.addEventListener("change", async () => {
                select.disabled = true;
                const newStatus = select.value;
                const { error: updateError } = await client.from("commission_orders")
                    .update({ status: newStatus }).eq("id", order.id);
                select.disabled = false;
                if (updateError) {
                    setMessage("Não foi possível atualizar a etapa do pedido.", true);
                    await loadOrders();
                } else {
                    order.status = newStatus;
                    order.updated_at = new Date().toISOString();
                    setMessage(`Etapa atualizada: ${select.selectedOptions[0].textContent}.`);
                    renderOrdersOverview();
                    renderOrders();
                }
            });

            const estimateControl = document.createElement("div");
            estimateControl.className = "order-estimate-control";
            const estimateLabel = document.createElement("label");
            estimateLabel.textContent = "Previsão de entrega";
            const estimateInput = document.createElement("input");
            estimateInput.type = "date";
            estimateInput.value = order.estimated_delivery || "";
            estimateInput.setAttribute("aria-label", `Previsão de entrega do pedido de ${order.client_name}`);
            estimateInput.title = "Opcional: ficará visível ao cliente";
            estimateInput.addEventListener("change", async () => {
                estimateInput.disabled = true;
                const { error: estimateError } = await client.from("commission_orders")
                    .update({ estimated_delivery: estimateInput.value || null }).eq("id", order.id);
                estimateInput.disabled = false;
                if (estimateError) {
                    setMessage("Não foi possível salvar a previsão. Atualize a migração de acompanhamento no Supabase.", true);
                    estimateInput.value = order.estimated_delivery || "";
                } else {
                    order.estimated_delivery = estimateInput.value || null;
                    order.updated_at = new Date().toISOString();
                    lastUpdated.textContent = "Atualizado hoje";
                    lastUpdated.classList.remove("is-stale");
                    setMessage(order.estimated_delivery ? "Previsão salva e visível ao cliente." : "Previsão removida da consulta do cliente.");
                }
            });
            estimateControl.append(estimateLabel, estimateInput);

            const controls = document.createElement("div");
            controls.className = "order-controls";
            controls.append(select, estimateControl);
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "button button-secondary order-delete";
            remove.textContent = "Remover pedido";
            remove.setAttribute("aria-label", `Remover pedido de ${order.client_name}`);
            remove.addEventListener("click", async () => {
                if (!window.confirm(`Remover permanentemente o pedido de ${order.client_name}?`)) return;
                remove.disabled = true;
                const { error: deleteError } = await client.from("commission_orders").delete().eq("id", order.id);
                if (deleteError) {
                    remove.disabled = false;
                    setMessage("Não foi possível remover o pedido. Confira se a permissão de exclusão foi aplicada no Supabase.", true);
                    return;
                }
                setMessage("Pedido removido.");
                await loadOrders();
            });
            controls.append(remove);
            row.append(details, controls);
            container.append(row);
        });
    }

    async function loadOrders() {
        const container = document.querySelector("#orders-list");
        container.replaceChildren();
        container.setAttribute("aria-busy", "true");
        const { data, error } = await client
            .from("commission_orders")
            .select("id, client_name, client_contact, art_type, summary, status, created_at, updated_at, tracking_code, estimated_delivery")
            .order("created_at", { ascending: false });
        container.setAttribute("aria-busy", "false");
        if (error) {
            container.textContent = error.message?.includes("estimated_delivery")
                ? "Aplique a atualização supabase/order-tracking-details.sql para carregar a previsão e a fila de pedidos."
                : "Não foi possível carregar os pedidos.";
            return;
        }
        cachedOrders = data || [];
        renderOrdersOverview();
        renderOrders();
    }

    document.querySelector("#order-form").addEventListener("submit", async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const fields = {
            client_name: document.querySelector("#order-client").value.trim(),
            client_contact: document.querySelector("#order-contact").value.trim(),
            art_type: document.querySelector("#order-type").value.trim(),
            summary: document.querySelector("#order-summary").value.trim(),
            status: "received",
            estimated_delivery: document.querySelector("#order-estimate").value || null
        };
        const { data: newOrder, error } = await client.from("commission_orders").insert(fields).select("tracking_code").single();
        if (error) {
            setMessage("Não foi possível adicionar o pedido. Confira a conexão e a autenticação.", true);
            return;
        }
        form.reset();
        setMessage(newOrder?.tracking_code
            ? `Pedido adicionado. Código de acompanhamento para enviar ao cliente: ${newOrder.tracking_code}`
            : "Pedido adicionado à fila privada.");
        await loadOrders();
    });

    document.querySelector("#availability-form").setAttribute("aria-label", "Atualizar disponibilidade pública");
    const { data: sessionData } = await client.auth.getSession();
    if (sessionData.session && !passwordRecoveryMode) await continueSession();
});
