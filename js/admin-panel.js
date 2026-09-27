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
    const customerStatusNotes = {
        received: "Recebi seu pedido e vou revisar os detalhes.",
        quote: "Estou combinando o valor e os detalhes da comissão.",
        payment: "Estou aguardando a confirmação do pagamento combinado.",
        queue: "Tudo certo! Seu pedido está aguardando a vez na fila.",
        sketch: "Estou preparando o esboço da sua arte.",
        approval: "O esboço está pronto e aguarda sua aprovação ou comentários.",
        finalizing: "Sua arte está nos ajustes finais antes da entrega.",
        delivered: "Sua comissão foi finalizada e entregue. Obrigada pelo apoio!",
        cancelled: "O pedido foi cancelado. Se quiser conversar sobre isso, estou à disposição."
    };
    const ordersSearch = document.querySelector("#orders-search");
    const ordersFilter = document.querySelector("#orders-filter");
    const ordersArtistFilter = document.querySelector("#orders-artist-filter");
    const ordersOverview = document.querySelector("#orders-overview");
    const exportOrdersButton = document.querySelector("#export-orders");
    let cachedOrders = [];
    let cachedGalleryItems = [];

    function renderOrdersOverview() {
        ordersOverview.replaceChildren();
        const attention = document.querySelector("#orders-attention");
        const staleCount = cachedOrders.filter(order => Date.now() - new Date(order.updated_at || order.created_at).getTime() >= 7 * 86400000).length;
        const approvalCount = cachedOrders.filter(order => order.status === "approval").length;
        const pendingRequestCount = cachedOrders.reduce((total, order) => total + (order.client_requests || []).filter(request => request.state === "pending").length, 0);
        attention.replaceChildren();
        const attentionParts = [];
        if (staleCount) attentionParts.push(`${staleCount} pedido${staleCount === 1 ? "" : "s"} sem atualização há 7 dias ou mais`);
        if (approvalCount) attentionParts.push(`${approvalCount} aguardando aprovação do cliente`);
        if (pendingRequestCount) attentionParts.push(pendingRequestCount === 1
            ? "1 solicitação do cliente pendente"
            : `${pendingRequestCount} solicitações do cliente pendentes`);
        if (attentionParts.length) {
            attention.append(document.createTextNode(`✦ Atenção: ${attentionParts.join(" · ")}. `));
            const view = document.createElement("button");
            view.type = "button";
            view.textContent = "Ver pedidos";
            view.addEventListener("click", () => {
                if (pendingRequestCount) {
                    ordersFilter.value = "all";
                    ordersArtistFilter.value = "all";
                    ordersSearch.value = "";
                } else ordersFilter.value = staleCount ? "stale" : "approval";
                renderOrdersOverview();
                renderOrders();
                if (pendingRequestCount) {
                    document.querySelectorAll(".order-client-requests").forEach(details => {
                        if (details.querySelector(".client-request-card.is-pending")) details.open = true;
                    });
                }
            });
            attention.append(view);
            attention.hidden = false;
        } else attention.hidden = true;
        const filters = [["all", "Todos", cachedOrders.length], ...orderStatuses.map(([value, label]) => [
            value,
            label,
            cachedOrders.filter(order => order.status === value).length
        ]), ["stale", "Sem atualização 7+ dias", cachedOrders.filter(order =>
            Date.now() - new Date(order.updated_at || order.created_at).getTime() >= 7 * 86400000
        ).length]];
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
    ordersArtistFilter.addEventListener("change", renderOrders);

    exportOrdersButton.addEventListener("click", () => {
        const columns = [
            ["Cliente", "client_name"], ["Contato privado", "client_contact"],
            ["Tipo de arte", "art_type"], ["Resumo privado", "summary"],
            ["Status", "status"], ["Artista", "artist_name"],
            ["Criado em", "created_at"], ["Atualizado em", "updated_at"],
            ["Previsão", "estimated_delivery"], ["Código", "tracking_code"]
        ];
        const csvCell = value => {
            let text = String(value ?? "");
            if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
            return `"${text.replaceAll('"', '""')}"`;
        };
        const rows = [columns.map(([label]) => csvCell(label)).join(",")];
        cachedOrders.forEach(order => rows.push(columns.map(([, key]) => csvCell(order[key])).join(",")));
        const blob = new Blob(["\uFEFF", rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const download = document.createElement("a");
        download.href = url;
        download.download = `zoolixianas-pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
        download.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage("Backup da fila baixado neste dispositivo.");
    });

    function renderOrders() {
        const container = document.querySelector("#orders-list");
        container.replaceChildren();
        const query = ordersSearch.value.trim().toLocaleLowerCase("pt-BR");
        const filtered = cachedOrders.filter(order => {
            const isStale = (Date.now() - new Date(order.updated_at || order.created_at).getTime()) >= 7 * 86400000;
            const matchesStatus = ordersFilter.value === "all" || (ordersFilter.value === "stale" ? isStale : order.status === ordersFilter.value);
            const matchesArtist = ordersArtistFilter.value === "all" || (order.artist_name || "Sem atribuição") === ordersArtistFilter.value;
            const searchable = `${order.client_name} ${order.tracking_code || ""}`.toLocaleLowerCase("pt-BR");
            return matchesStatus && matchesArtist && searchable.includes(query);
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
            const artist = document.createElement("p");
            artist.className = "order-artist-assignment";
            artist.textContent = `Artista responsável: ${order.artist_name || "Sem atribuição"}`;
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
                const statusLink = new URL("status.html", window.location.href);
                statusLink.searchParams.set("codigo", order.tracking_code);
                const copyLink = document.createElement("button");
                copyLink.type = "button";
                copyLink.className = "copy-tracking-code";
                copyLink.textContent = "Copiar link direto";
                copyLink.addEventListener("click", async () => {
                    try {
                        await navigator.clipboard.writeText(statusLink.href);
                        setMessage("Link direto de acompanhamento copiado.");
                    } catch {
                        setMessage(`Copie este link para o cliente: ${statusLink.href}`);
                    }
                });
                const copyMessage = document.createElement("button");
                copyMessage.type = "button";
                copyMessage.className = "copy-tracking-code";
                copyMessage.textContent = "Copiar mensagem";
                copyMessage.addEventListener("click", async () => {
                    const statusLabel = orderStatuses.find(([value]) => value === order.status)?.[1] || "Pedido em andamento";
                    const eta = order.estimated_delivery
                        ? ` Previsão informada: ${new Date(`${order.estimated_delivery}T12:00:00`).toLocaleDateString("pt-BR")}.`
                        : "";
                    const message = `Oi, ${order.client_name}! Atualização da sua comissão (${order.art_type}): ${statusLabel}. ${customerStatusNotes[order.status] || "Estou cuidando do seu pedido."}${eta}\n\nAcompanhe pelo link: ${statusLink.href}`;
                    try {
                        await navigator.clipboard.writeText(message);
                        setMessage("Mensagem pronta copiada. É só colar na conversa com o cliente.");
                    } catch {
                        setMessage(message);
                    }
                });
                tracking.append(document.createTextNode(" "), copyCode, document.createTextNode(" "), copyLink, document.createTextNode(" "), copyMessage);
            }
            const historyDetails = document.createElement("details");
            historyDetails.className = "order-history-details";
            const historySummary = document.createElement("summary");
            historySummary.textContent = `Histórico de etapas (${order.history?.length || 0})`;
            historyDetails.append(historySummary);
            const historyList = document.createElement("ol");
            historyList.className = "order-history-list";
            (order.history || []).forEach(item => {
                const entry = document.createElement("li");
                const label = orderStatuses.find(([value]) => value === item.status)?.[1] || item.status;
                entry.textContent = `${label} · ${new Date(item.changed_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`;
                historyList.append(entry);
            });
            historyDetails.append(historyList);

            const requestsDetails = document.createElement("details");
            requestsDetails.className = "order-client-requests";
            const pendingRequests = (order.client_requests || []).filter(item => item.state === "pending").length;
            const requestsSummary = document.createElement("summary");
            requestsSummary.textContent = `Solicitações do cliente (${pendingRequests} pendente${pendingRequests === 1 ? "" : "s"})`;
            requestsDetails.append(requestsSummary);
            (order.client_requests || []).forEach(request => {
                const requestCard = document.createElement("div");
                requestCard.className = `client-request-card${request.state === "pending" ? " is-pending" : ""}`;
                const requestHeading = document.createElement("strong");
                const requestNames = { revision: "Solicitação de alteração", cancellation: "Conversa sobre cancelamento", question: "Pergunta" };
                requestHeading.textContent = `${requestNames[request.request_type] || "Solicitação"} · ${request.state === "pending" ? "Pendente" : "Concluída"}`;
                const requestText = document.createElement("p");
                requestText.textContent = request.message;
                const requestDate = document.createElement("small");
                requestDate.textContent = new Date(request.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
                requestCard.append(requestHeading, requestText, requestDate);
                if (request.state === "pending") {
                    const handledButton = document.createElement("button");
                    handledButton.type = "button";
                    handledButton.className = "copy-tracking-code";
                    handledButton.textContent = "Marcar como resolvida";
                    handledButton.addEventListener("click", async () => {
                        handledButton.disabled = true;
                        const { error: requestError } = await client.from("commission_client_requests")
                            .update({ state: "handled", handled_at: new Date().toISOString() }).eq("id", request.id);
                        if (requestError) {
                            handledButton.disabled = false;
                            setMessage("Não foi possível atualizar essa solicitação.", true);
                        } else {
                            setMessage("Solicitação marcada como resolvida.");
                            await loadOrders();
                        }
                    });
                    requestCard.append(handledButton);
                }
                requestsDetails.append(requestCard);
            });

            details.append(heading, badge, contact, type, artist, summary, date, lastUpdated, tracking, historyDetails, requestsDetails);

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
                    await loadOrders();
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
            .select("id, client_name, client_contact, art_type, summary, status, created_at, updated_at, tracking_code, estimated_delivery, artist_name")
            .order("created_at", { ascending: false });
        container.setAttribute("aria-busy", "false");
        if (error) {
            container.textContent = error.message?.includes("estimated_delivery")
                ? "Aplique supabase/order-tracking-details.sql no SQL Editor do Supabase."
                : error.message?.includes("artist_name")
                    ? "Aplique supabase/studio-workflow-upgrades.sql no SQL Editor do Supabase."
                    : "Não foi possível carregar os pedidos.";
            return;
        }
        const orderIds = (data || []).map(order => order.id);
        let historyByOrder = new Map();
        let requestsByOrder = new Map();
        if (orderIds.length) {
            const [historyResult, requestsResult] = await Promise.all([
                client.from("commission_order_history").select("order_id, status, changed_at").in("order_id", orderIds).order("changed_at", { ascending: true }),
                client.from("commission_client_requests").select("id, order_id, request_type, message, state, created_at, handled_at").in("order_id", orderIds).order("created_at", { ascending: false })
            ]);
            if (historyResult.error || requestsResult.error) {
                setMessage("Aplique supabase/studio-workflow-upgrades.sql para ativar o histórico e as solicitações dos clientes.", true);
            }
            (historyResult.data || []).forEach(item => {
                if (!historyByOrder.has(item.order_id)) historyByOrder.set(item.order_id, []);
                historyByOrder.get(item.order_id).push(item);
            });
            (requestsResult.data || []).forEach(item => {
                if (!requestsByOrder.has(item.order_id)) requestsByOrder.set(item.order_id, []);
                requestsByOrder.get(item.order_id).push(item);
            });
        }
        cachedOrders = (data || []).map(order => ({
            ...order,
            history: historyByOrder.get(order.id) || [],
            client_requests: requestsByOrder.get(order.id) || []
        }));
        renderOrdersOverview();
        renderOrders();
        await loadGalleryItems();
    }

    async function loadGalleryItems() {
        const list = document.querySelector("#artist-gallery-list");
        const orderSelect = document.querySelector("#gallery-order");
        if (!list || !orderSelect) return;
        const { data, error } = await client.from("commission_gallery")
            .select("id, order_id, title, category, artist_name, image_path, created_at")
            .order("created_at", { ascending: false });
        if (error) {
            list.textContent = "Aplique supabase/studio-workflow-upgrades.sql para ativar a galeria autorizada.";
            return;
        }
        cachedGalleryItems = data || [];
        orderSelect.replaceChildren();
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Escolha um pedido concluído";
        orderSelect.append(placeholder);
        const deliveredOrders = cachedOrders.filter(order => order.status === "delivered" && !cachedGalleryItems.some(item => item.order_id === order.id));
        deliveredOrders.forEach(order => {
            const option = document.createElement("option");
            option.value = order.id;
            option.textContent = `${order.client_name} · ${order.art_type}`;
            orderSelect.append(option);
        });
        if (!deliveredOrders.length) placeholder.textContent = "Nenhum pedido entregue disponível";
        list.replaceChildren();
        if (!cachedGalleryItems.length) {
            list.textContent = "Ainda não há trabalhos publicados por esta área.";
            return;
        }
        cachedGalleryItems.forEach(item => {
            const card = document.createElement("article");
            card.className = "artist-gallery-item";
            const photo = document.createElement("img");
            photo.src = client.storage.from("commission-gallery").getPublicUrl(item.image_path).data.publicUrl;
            photo.alt = "";
            photo.loading = "lazy";
            const copy = document.createElement("div");
            const title = document.createElement("strong");
            title.textContent = item.title;
            const category = document.createElement("span");
            category.textContent = `${item.artist_name} · ${item.category}`;
            copy.append(title, category);
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "button button-secondary order-delete";
            remove.textContent = "Retirar da galeria";
            remove.addEventListener("click", async () => {
                if (!window.confirm(`Retirar “${item.title}” da galeria pública?`)) return;
                remove.disabled = true;
                const { error: rowError } = await client.from("commission_gallery").delete().eq("id", item.id);
                if (rowError) {
                    remove.disabled = false;
                    setMessage("Não foi possível retirar a arte da galeria.", true);
                    return;
                }
                await client.storage.from("commission-gallery").remove([item.image_path]);
                setMessage("Arte retirada da galeria pública.");
                await loadGalleryItems();
            });
            card.append(photo, copy, remove);
            list.append(card);
        });
    }

    document.querySelector("#gallery-upload-form").addEventListener("submit", async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const order = cachedOrders.find(item => item.id === document.querySelector("#gallery-order").value);
        const file = document.querySelector("#gallery-image").files[0];
        if (!order || order.status !== "delivered" || !file || !document.querySelector("#gallery-consent").checked) {
            setMessage("Escolha um pedido entregue, uma imagem e confirme a autorização do cliente.", true);
            return;
        }
        if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 8 * 1024 * 1024) {
            setMessage("Use PNG, JPG ou WebP com até 8 MB.", true);
            return;
        }
        const submit = form.querySelector("button[type=submit]");
        submit.disabled = true;
        const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
        const path = `${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await client.storage.from("commission-gallery").upload(path, file, {
            cacheControl: "3600", upsert: false, contentType: file.type
        });
        if (uploadError) {
            submit.disabled = false;
            setMessage("Não foi possível enviar a imagem. Confira se a migração da galeria foi aplicada.", true);
            return;
        }
        const { error: galleryError } = await client.from("commission_gallery").insert({
            order_id: order.id,
            title: document.querySelector("#gallery-title").value.trim(),
            category: document.querySelector("#gallery-category").value,
            artist_name: order.artist_name || "Zoolixianas",
            image_path: path,
            consent_confirmed: true,
            published: true
        });
        if (galleryError) {
            await client.storage.from("commission-gallery").remove([path]);
            submit.disabled = false;
            setMessage("Não foi possível publicar. O pedido pode já ter uma arte na galeria.", true);
            return;
        }
        form.reset();
        submit.disabled = false;
        setMessage("Arte publicada na galeria. Obrigada por confirmar a autorização do cliente.");
        await loadGalleryItems();
    });

    document.querySelector("#order-form").addEventListener("submit", async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const fields = {
            client_name: document.querySelector("#order-client").value.trim(),
            client_contact: document.querySelector("#order-contact").value.trim(),
            art_type: document.querySelector("#order-type").value.trim(),
            summary: document.querySelector("#order-summary").value.trim(),
            status: "received",
            artist_name: document.querySelector("#order-artist").value,
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
