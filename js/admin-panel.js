document.addEventListener("DOMContentLoaded", async () => {
    const config = window.GALAXY_BACKEND;
    const backendMessage = document.querySelector("#backend-message");
    const authMessage = document.querySelector("#auth-message");
    const signInPanel = document.querySelector("#signin-panel");
    const passwordResetPanel = document.querySelector("#password-reset-panel");
    const dashboard = document.querySelector("#admin-dashboard");

    let client = null;
    let passwordRecoveryMode = false;
    let assignedArtistName = null;
    let canManageAll = false;

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
        const [{ data: artistName }, { data: managerAccess }, { data: userResult }] = await Promise.all([
            client.rpc("current_artist_name"),
            client.rpc("can_manage_all_commissions"),
            client.auth.getUser()
        ]);
        assignedArtistName = artistName || null;
        canManageAll = managerAccess === true;
        const identity = document.querySelector("#account-identity");
        identity.textContent = `${userResult.user?.email || "Conta autorizada"} · ${canManageAll ? "acesso de gestão" : assignedArtistName || "artista sem vínculo"}`;
        const artistSelect = document.querySelector("#order-artist");
        if (!canManageAll && assignedArtistName) {
            artistSelect.value = assignedArtistName;
            artistSelect.disabled = true;
        }
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
    const emailSuggestions = {
        received: "Seu pedido foi recebido! Vou revisar os detalhes e já retorno com as informações.",
        quote: "Preparei o orçamento da sua comissão. Se quiser ajustar algum detalhe, pode me responder por aqui.",
        payment: "Estou aguardando a confirmação do pagamento combinado. Se já pagou, pode desconsiderar este aviso.",
        queue: "Seu pedido está na fila. Avisarei quando começar a trabalhar nele.",
        sketch: "O esboço da sua arte está pronto; fique à vontade para enviar seus comentários.",
        approval: "Sua aprovação ou sugestões me ajudam a seguir para a finalização.",
        finalizing: "Sua arte está na etapa final. Em breve enviarei a versão concluída.",
        delivered: "Sua comissão foi concluída. Obrigada por apoiar meu trabalho!",
        cancelled: "O pedido foi cancelado. Se precisar conversar sobre isso, estou à disposição."
    };

    async function sendStatusEmail(order) {
        if (!order.email_updates_enabled || !order.client_email) {
            return { skipped: true, message: "Cadastre o e-mail do cliente e confirme a autorização na ficha para ativar os avisos." };
        }
        const { data, error } = await client.functions.invoke("notify-order-status", { body: { orderId: order.id } });
        if (!error) return data?.sent
            ? { sent: true }
            : { skipped: true, message: data?.reason || "O cliente não autorizou avisos por e-mail ou não informou um endereço." };

        const status = error.context?.status;
        let detail = "";
        try {
            if (error.context?.clone) {
                const body = await error.context.clone().json();
                detail = body?.error || body?.message || "";
            }
        } catch { /* O servidor pode responder sem JSON. */ }

        if (status === 404) return { error: "A função de e-mail não está publicada no Supabase. Implante notify-order-status." };
        if (status === 401) return { error: "A sessão expirou ou a função recusou a autenticação. Saia e entre novamente no painel." };
        if (status === 403) return { error: "A conta atual não tem acesso a este pedido para enviar o aviso." };
        if (status === 503) return { error: detail || "Faltam configurações do EmailJS ou o endereço publicado do site nos segredos da Edge Function." };
        if (status === 502) return { error: detail || "O EmailJS recusou o envio. Confira a conexão do e-mail, o modelo e os identificadores configurados." };
        if (error.name === "FunctionsFetchError" || error.name === "TypeError") {
            return { error: "Não foi possível alcançar a função. Confira se ela foi publicada e se o projeto Supabase está acessível." };
        }
        return { error: detail || `Falha ao chamar a função de e-mail${status ? ` (HTTP ${status})` : ""}. Confira os registros da Edge Function no Supabase.` };
    }
    const ordersSearch = document.querySelector("#orders-search");
    const ordersFilter = document.querySelector("#orders-filter");
    const ordersArtistFilter = document.querySelector("#orders-artist-filter");
    const ordersOverview = document.querySelector("#orders-overview");
    const exportOrdersButton = document.querySelector("#export-orders");
    const exportFullBackupButton = document.querySelector("#export-full-backup");
    const financeMonth = document.querySelector("#finance-month");
    const financeSummaryCards = document.querySelector("#finance-summary-cards");
    let cachedOrders = [];
    let cachedPayments = [];
    let cachedGalleryItems = [];

    const localMonth = (() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; })();
    financeMonth.value = localMonth;
    financeMonth.addEventListener("change", renderFinanceSummary);
    const money = value => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);

    function renderFinanceSummary() {
        const month = financeMonth.value || localMonth;
        const monthIncome = cachedPayments.filter(payment => payment.paid_at?.startsWith(month))
            .reduce((sum, payment) => sum + Number(payment.amount), 0);
        const newOrders = cachedOrders.filter(order => order.created_at?.startsWith(month)).length;
        const activeBalance = cachedOrders.filter(order => !["delivered", "cancelled"].includes(order.status))
            .reduce((sum, order) => sum + Math.max(0, Number(order.agreed_amount || 0)
                - (order.payments || []).reduce((paid, payment) => paid + Number(payment.amount), 0)), 0);
        financeSummaryCards.replaceChildren();
        [["Recebido no mês", money(monthIncome)], ["Pedidos novos", String(newOrders)], ["Saldo em aberto", money(activeBalance)]].forEach(([label, value]) => {
            const card = document.createElement("article");
            card.className = "finance-stat";
            const caption = document.createElement("span"); caption.textContent = label;
            const total = document.createElement("strong"); total.textContent = value;
            card.append(caption, total); financeSummaryCards.append(card);
        });
    }

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
            ["Previsão", "estimated_delivery"], ["Código", "tracking_code"],
            ["E-mail para atualização", "client_email"], ["Valor combinado", "agreed_amount"], ["Total recebido", "payments"]
        ];
        const csvCell = value => {
            let text = String(value ?? "");
            if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
            return `"${text.replaceAll('"', '""')}"`;
        };
        const rows = [columns.map(([label]) => csvCell(label)).join(",")];
        cachedOrders.forEach(order => rows.push(columns.map(([, key]) => csvCell(key === "agreed_amount"
            ? money(order[key])
            : key === "payments" ? money((order.payments || []).reduce((sum, item) => sum + Number(item.amount), 0))
                : order[key])).join(",")));
        const blob = new Blob(["\uFEFF", rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const download = document.createElement("a");
        download.href = url;
        download.download = `zoolixianas-pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
        download.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage("Backup da fila baixado neste dispositivo.");
    });

    exportFullBackupButton.addEventListener("click", () => {
        const backup = {
            exported_at: new Date().toISOString(),
            notice: "Arquivo privado. Contém dados pessoais de clientes e informações financeiras. Os arquivos de imagem do Supabase Storage não são incluídos.",
            orders: cachedOrders,
            payments: cachedPayments,
            published_gallery: cachedGalleryItems
        };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const download = document.createElement("a");
        download.href = url;
        download.download = `zoolixianas-backup-dados-${new Date().toISOString().slice(0, 10)}.json`;
        download.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage("Backup completo baixado neste dispositivo. Guarde em local privado.");
    });

    function createOrderFinance(order) {
        const section = document.createElement("section");
        section.className = "order-finances";
        const title = document.createElement("h5"); title.textContent = "Pagamentos · área privada";
        const agreedForm = document.createElement("form"); agreedForm.className = "order-finance-form agreed-value-form";
        const agreedLabel = document.createElement("label"); agreedLabel.textContent = "Valor combinado (R$)";
        const agreed = document.createElement("input"); agreed.type = "number"; agreed.min = "0"; agreed.step = "0.01"; agreed.inputMode = "decimal"; agreed.value = order.agreed_amount ?? "";
        agreed.setAttribute("aria-label", `Valor combinado para ${order.client_name}`);
        const saveAgreed = document.createElement("button"); saveAgreed.type = "submit"; saveAgreed.textContent = "Salvar valor";
        agreedForm.append(agreedLabel, agreed, saveAgreed);
        agreedForm.addEventListener("submit", async event => {
            event.preventDefault(); saveAgreed.disabled = true;
            const amount = agreed.value === "" ? null : Number(agreed.value);
            const { error } = await client.from("commission_orders").update({ agreed_amount: amount }).eq("id", order.id);
            saveAgreed.disabled = false;
            if (error) { setMessage("Não foi possível salvar o valor. Aplique supabase/business-tools.sql.", true); return; }
            order.agreed_amount = amount; setMessage("Valor combinado salvo no painel privado."); renderFinanceSummary();
        });

        const paymentForm = document.createElement("form"); paymentForm.className = "order-finance-form payment-entry-form";
        const amountLabel = document.createElement("label"); amountLabel.textContent = "Recebido (R$)";
        const amount = document.createElement("input"); amount.type = "number"; amount.min = "0.01"; amount.step = "0.01"; amount.inputMode = "decimal"; amount.required = true; amount.placeholder = "0,00";
        amount.setAttribute("aria-label", `Valor recebido no pedido de ${order.client_name}`);
        const dateLabel = document.createElement("label"); dateLabel.textContent = "Data";
        const paidAt = document.createElement("input"); paidAt.type = "date"; const now = new Date(); paidAt.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; paidAt.required = true;
        paidAt.setAttribute("aria-label", `Data do pagamento de ${order.client_name}`);
        const methodLabel = document.createElement("label"); methodLabel.textContent = "Forma";
        const method = document.createElement("select");
        [["Pix", "Pix"], ["Cartão", "Cartão"], ["Transferência", "Transferência"], ["Dinheiro", "Dinheiro"], ["Outro", "Outro"]].forEach(([value, label]) => {
            const option = document.createElement("option"); option.value = value; option.textContent = label; method.append(option);
        });
        const addPayment = document.createElement("button"); addPayment.type = "submit"; addPayment.textContent = "Registrar recebimento";
        paymentForm.append(amountLabel, amount, dateLabel, paidAt, methodLabel, method, addPayment);
        paymentForm.addEventListener("submit", async event => {
            event.preventDefault(); addPayment.disabled = true;
            const { error } = await client.from("commission_payments").insert({ order_id: order.id, amount: Number(amount.value), paid_at: paidAt.value, payment_method: method.value });
            addPayment.disabled = false;
            if (error) { setMessage("Não foi possível registrar o pagamento. Confira se supabase/business-tools.sql foi aplicado.", true); return; }
            setMessage("Recebimento registrado no histórico privado."); await loadOrders();
        });

        const received = order.payments.reduce((sum, item) => sum + Number(item.amount), 0);
        const remaining = Math.max(0, Number(order.agreed_amount || 0) - received);
        const totals = document.createElement("p"); totals.className = "order-finance-totals";
        totals.textContent = `Recebido: ${money(received)} · Falta: ${money(remaining)}`;
        const history = document.createElement("ul"); history.className = "payment-history";
        order.payments.forEach(payment => {
            const item = document.createElement("li");
            const caption = document.createElement("span"); caption.textContent = `${new Date(`${payment.paid_at}T12:00:00`).toLocaleDateString("pt-BR")} · ${payment.payment_method} · ${money(payment.amount)}`;
            const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Remover"; remove.setAttribute("aria-label", `Remover recebimento de ${money(payment.amount)}`);
            remove.addEventListener("click", async () => {
                if (!window.confirm(`Apagar o registro de ${money(payment.amount)} recebido em ${new Date(`${payment.paid_at}T12:00:00`).toLocaleDateString("pt-BR")}?`)) return;
                remove.disabled = true;
                const { error } = await client.from("commission_payments").delete().eq("id", payment.id);
                if (error) { remove.disabled = false; setMessage("Não foi possível remover esse recebimento.", true); return; }
                setMessage("Registro de recebimento removido."); await loadOrders();
            });
            item.append(caption, remove); history.append(item);
        });
        if (!order.payments.length) { const empty = document.createElement("li"); empty.textContent = "Nenhum recebimento registrado."; history.append(empty); }
        section.append(title, agreedForm, paymentForm, totals, history);
        return section;
    }

    function createOrderEmailPrefs(order) {
        const section = document.createElement("section");
        section.className = "order-email-preferences";
        const heading = document.createElement("strong"); heading.textContent = "Avisos por e-mail ao cliente";
        const form = document.createElement("form"); form.className = "order-email-form";
        const email = document.createElement("input"); email.type = "email"; email.maxLength = 254; email.autocomplete = "email";
        email.value = order.client_email || ""; email.placeholder = "cliente@exemplo.com";
        email.setAttribute("aria-label", `E-mail para avisos do pedido de ${order.client_name}`);
        const consentLabel = document.createElement("label"); consentLabel.className = "order-email-consent";
        const consent = document.createElement("input"); consent.type = "checkbox"; consent.checked = order.email_updates_enabled === true;
        consentLabel.append(consent, document.createTextNode(" Cliente autorizou receber atualizações"));
        const save = document.createElement("button"); save.type = "submit"; save.textContent = "Salvar e-mail";
        const help = document.createElement("span"); help.className = "order-email-help";
        help.textContent = "Sem autorização marcada, nenhum aviso automático será enviado.";
        const updateConsentRequirement = () => { consent.required = Boolean(email.value.trim()); };
        email.addEventListener("input", updateConsentRequirement);
        form.append(email, consentLabel, save);
        form.addEventListener("submit", async event => {
            event.preventDefault();
            const address = email.value.trim();
            if (address && !consent.checked) { setMessage("Marque a autorização do cliente antes de salvar o e-mail para avisos.", true); consent.focus(); return; }
            save.disabled = true;
            const { error } = await client.from("commission_orders").update({
                client_email: address || null,
                email_updates_enabled: Boolean(address && consent.checked)
            }).eq("id", order.id);
            save.disabled = false;
            if (error) { setMessage("Não foi possível salvar o e-mail. Confira se business-tools.sql foi aplicado.", true); return; }
            order.client_email = address || null;
            order.email_updates_enabled = Boolean(address && consent.checked);
            setMessage(order.email_updates_enabled ? "E-mail e autorização salvos. Mudanças de status poderão enviar avisos." : "E-mail salvo sem autorização; os avisos automáticos ficam desligados.");
            await loadOrders();
        });
        updateConsentRequirement();
        section.append(heading, form, help);
        return section;
    }

    function createOrderEmailMessage(order) {
        const section = document.createElement("section");
        section.className = "order-email-message";
        const statusLabel = document.createElement("label");
        statusLabel.textContent = "Mensagem para a etapa";
        const statusPicker = document.createElement("select");
        statusPicker.setAttribute("aria-label", "Escolher etapa para editar a mensagem do e-mail");
        orderStatuses.forEach(([value, label]) => { const option = document.createElement("option"); option.value = value; option.textContent = label; statusPicker.append(option); });
        statusPicker.value = order.status;
        const suggestionPicker = document.createElement("select");
        suggestionPicker.setAttribute("aria-label", "Escolher uma mensagem pronta");
        const suggestionPlaceholder = document.createElement("option"); suggestionPlaceholder.value = ""; suggestionPlaceholder.textContent = "Usar uma sugestão pronta…"; suggestionPicker.append(suggestionPlaceholder);
        const label = document.createElement("label");
        label.textContent = "Texto que acompanhará esta etapa";
        const message = document.createElement("textarea");
        message.rows = 2;
        message.maxLength = 500;
        const getStatusMessage = status => order.artist_email_messages?.[status] ?? (status === order.status ? order.artist_email_message : "") ?? "";
        message.value = getStatusMessage(order.status);
        message.placeholder = "Ex.: Se quiser mudar algum detalhe, me responda por este e-mail.";
        message.setAttribute("aria-label", `Mensagem opcional no e-mail do pedido de ${order.client_name}`);
        const save = document.createElement("button");
        save.type = "button";
        save.className = "save-email-message";
        save.textContent = "Salvar mensagem";
        const help = document.createElement("small");
        help.textContent = "Cada etapa pode ter seu próprio texto. A mensagem fica privada no painel e só vai ao cliente junto do aviso.";
        const previewButton = document.createElement("button"); previewButton.type = "button"; previewButton.textContent = "Pré-visualizar e-mail"; previewButton.className = "email-preview-toggle";
        const preview = document.createElement("div"); preview.className = "email-preview"; preview.hidden = true;
        const fillSuggestions = () => { suggestionPicker.replaceChildren(suggestionPlaceholder.cloneNode(true)); const suggestion = emailSuggestions[statusPicker.value]; if (suggestion) { const option = document.createElement("option"); option.value = suggestion; option.textContent = "Mensagem sugerida para esta etapa"; suggestionPicker.append(option); } };
        statusPicker.addEventListener("change", () => { message.value = getStatusMessage(statusPicker.value); fillSuggestions(); preview.hidden = true; });
        suggestionPicker.addEventListener("change", () => { if (suggestionPicker.value) message.value = suggestionPicker.value; });
        fillSuggestions();
        previewButton.addEventListener("click", () => {
            preview.replaceChildren();
            const title = document.createElement("strong"); title.textContent = `Atualização da sua comissão: ${orderStatuses.find(([value]) => value === statusPicker.value)?.[1] || "Pedido atualizado"}`;
            const greeting = document.createElement("p"); greeting.textContent = `Olá, ${order.client_name}!`;
            const info = document.createElement("p"); info.textContent = `${order.art_type} · ${order.tracking_code ? `Código ${order.tracking_code}` : "Pedido em andamento"}`;
            const text = document.createElement("p"); text.textContent = message.value.trim() || "Nenhuma mensagem personalizada para esta etapa.";
            const link = document.createElement("span"); link.textContent = "O e-mail também terá o botão para acompanhar o pedido.";
            preview.append(title, greeting, info, text, link); preview.hidden = false;
        });
        save.addEventListener("click", async () => {
            save.disabled = true;
            const value = message.value.trim();
            const messages = { ...(order.artist_email_messages || {}), [statusPicker.value]: value };
            const { error } = await client.from("commission_orders")
                .update({ artist_email_messages: messages }).eq("id", order.id);
            save.disabled = false;
            if (error) { setMessage("Não foi possível salvar a mensagem. Aplique supabase/email-notification-message.sql no Supabase.", true); return; }
            order.artist_email_messages = messages;
            if (statusPicker.value === order.status) order.artist_email_message = value || null;
            save.textContent = "Mensagem salva";
            setMessage("Mensagem do e-mail salva.");
            window.setTimeout(() => { save.textContent = "Salvar mensagem"; }, 1800);
        });
        section.append(statusLabel, statusPicker, suggestionPicker, label, message, previewButton, preview, save, help);
        return section;
    }

    function createEmailHistory(order) {
        const details = document.createElement("details"); details.className = "email-send-history";
        const summary = document.createElement("summary"); summary.textContent = `Histórico de e-mails (${order.email_notifications?.length || 0})`; details.append(summary);
        const list = document.createElement("ul");
        (order.email_notifications || []).slice(0, 20).forEach(item => {
            const entry = document.createElement("li"); entry.dataset.sent = String(item.sent);
            const status = orderStatuses.find(([value]) => value === item.status)?.[1] || item.status;
            const result = document.createElement("strong"); result.textContent = item.sent ? "Enviado" : "Falhou";
            const when = document.createElement("time"); when.dateTime = item.created_at; when.textContent = new Date(item.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
            const detail = document.createElement("span"); detail.textContent = `${status}${item.detail ? ` · ${item.detail}` : ""}`;
            entry.append(result, when, detail); list.append(entry);
        });
        if (!list.children.length) { const empty = document.createElement("li"); empty.textContent = "Nenhum envio registrado ainda."; list.append(empty); }
        details.append(list); return details;
    }

    function resendCooldownKey(order) {
        return `zoolixianas-email-resend:${order.id}:${order.status}`;
    }

    function createOrderDeliveries(order) {
        const section = document.createElement("section");
        section.className = "order-deliveries";
        const title = document.createElement("h5");
        title.textContent = "Esboços e arquivos do cliente";
        const passwordPanel = document.createElement("div");
        passwordPanel.className = "delivery-password-panel";
        const passwordTitle = document.createElement("strong");
        passwordTitle.textContent = "Senha de acesso aos arquivos";
        const passwordHelp = document.createElement("p");
        passwordHelp.textContent = "Defina uma senha para os arquivos protegidos. O e-mail envia apenas o link; compartilhe a senha com o cliente por outro canal. A senha não pode ser recuperada aqui.";
        const passwordState = document.createElement("p");
        passwordState.className = "delivery-password-state";
        passwordState.textContent = "Conferindo proteção…";
        const passwordForm = document.createElement("form");
        passwordForm.className = "delivery-password-form";
        const passwordLabel = document.createElement("label");
        passwordLabel.textContent = "Nova senha (mínimo 8 caracteres)";
        const passwordInput = document.createElement("input");
        passwordInput.id = `delivery-password-${order.id}`;
        passwordLabel.htmlFor = passwordInput.id;
        passwordInput.type = "password";
        passwordInput.minLength = 8;
        passwordInput.maxLength = 72;
        passwordInput.required = true;
        passwordInput.autocomplete = "new-password";
        passwordInput.placeholder = "Digite uma senha para este pedido";
        const confirmPasswordLabel = document.createElement("label");
        confirmPasswordLabel.textContent = "Confirme a senha";
        const confirmPassword = document.createElement("input");
        confirmPassword.id = `delivery-password-confirm-${order.id}`;
        confirmPasswordLabel.htmlFor = confirmPassword.id;
        confirmPassword.type = "password";
        confirmPassword.required = true;
        confirmPassword.autocomplete = "new-password";
        confirmPassword.placeholder = "Digite novamente a mesma senha";
        const savePassword = document.createElement("button");
        savePassword.type = "submit";
        savePassword.className = "button button-secondary";
        savePassword.textContent = "Salvar senha";
        const copyPassword = document.createElement("button");
        copyPassword.type = "button";
        copyPassword.className = "copy-tracking-code";
        copyPassword.textContent = "Copiar senha";
        copyPassword.addEventListener("click", async () => {
            if (!passwordInput.value) { setMessage("Digite a senha antes de copiá-la.", true); return; }
            try {
                await navigator.clipboard.writeText(passwordInput.value);
                setMessage("Senha copiada. Compartilhe-a com o cliente por outro canal, separada do link.");
            } catch { setMessage("Não foi possível copiar automaticamente. Selecione a senha e copie manualmente.", true); }
        });
        passwordForm.append(passwordLabel, passwordInput, confirmPasswordLabel, confirmPassword, savePassword, copyPassword);
        let passwordConfigured = false;
        const passwordStatePromise = client.rpc("has_commission_delivery_password", { target_order: order.id })
            .then(({ data, error }) => {
                if (error) {
                    passwordState.textContent = "Não foi possível verificar a proteção. Aplique a migração de senha no Supabase.";
                    passwordState.dataset.state = "error";
                    return false;
                }
                passwordConfigured = data === true;
                passwordState.textContent = passwordConfigured
                    ? "Senha configurada. Definir outra substitui a senha atual."
                    : "Nenhuma senha configurada ainda.";
                passwordState.dataset.state = passwordConfigured ? "ready" : "empty";
                return true;
            });
        passwordForm.addEventListener("submit", async event => {
            event.preventDefault();
            const value = passwordInput.value;
            if (value !== confirmPassword.value) {
                setMessage("As duas senhas não coincidem. Confira e tente novamente.", true);
                confirmPassword.focus();
                return;
            }
            if (new TextEncoder().encode(value).length < 8 || new TextEncoder().encode(value).length > 72) {
                setMessage("Use uma senha com pelo menos 8 caracteres e até 72 bytes.", true);
                return;
            }
            savePassword.disabled = true;
            const { error } = await client.rpc("set_commission_delivery_password", {
                target_order: order.id, new_password: value
            });
            savePassword.disabled = false;
            if (error) {
                setMessage("Não foi possível salvar a senha. Confira a migração de proteção de arquivos no Supabase.", true);
                return;
            }
            passwordConfigured = true;
            passwordState.textContent = "Senha configurada. Compartilhe-a por outro canal; ela não será incluída no e-mail.";
            passwordState.dataset.state = "ready";
            setMessage("Senha dos arquivos salva com segurança. Compartilhe o link e a senha separadamente.");
        });
        passwordPanel.append(passwordTitle, passwordHelp, passwordState, passwordForm);
        const list = document.createElement("div");
        list.className = "delivery-file-list";
        const kindNames = { sketch: "Esboço", final: "Arte final", other: "Outro arquivo" };
        const files = order.deliveries || [];
        if (!files.length) {
            const empty = document.createElement("p");
            empty.className = "delivery-empty";
            empty.textContent = "Ainda não há arquivos neste pedido.";
            list.append(empty);
        }
        files.forEach(file => {
            const item = document.createElement("div");
            item.className = "delivery-file-item";
            const name = document.createElement("strong");
            name.textContent = file.original_name;
            const description = document.createElement("span");
            description.textContent = `${kindNames[file.file_kind] || "Arquivo"} · ${(file.file_size / 1048576).toFixed(1)} MB${file.client_visible ? " · disponível para cliente" : " · privado"}${file.password_required ? " · protegido por senha" : ""}`;
            item.append(name, description);
            if (file.note) {
                const note = document.createElement("small");
                note.textContent = file.note;
                item.append(note);
            }
            const controls = document.createElement("div");
            controls.className = "delivery-file-actions";
            const visibleLabel = document.createElement("label");
            visibleLabel.className = "delivery-visible-control";
            const visible = document.createElement("input");
            visible.type = "checkbox";
            visible.checked = file.client_visible;
            visibleLabel.append(visible, document.createTextNode(" Cliente pode abrir"));
            visible.addEventListener("change", async () => {
                await passwordStatePromise;
                if (visible.checked && file.password_required && !passwordConfigured) {
                    visible.checked = false;
                    setMessage("Defina a senha do pedido antes de liberar este arquivo protegido.", true);
                    return;
                }
                visible.disabled = true;
                const { error } = await client.from("commission_deliveries").update({ client_visible: visible.checked }).eq("id", file.id);
                visible.disabled = false;
                if (error) { visible.checked = !visible.checked; setMessage("Não foi possível alterar a visibilidade. Confira a configuração de arquivos privados.", true); }
                else { setMessage(visible.checked ? "Arquivo liberado para o cliente." : "Arquivo ocultado do cliente."); await loadOrders(); }
            });
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "copy-tracking-code";
            remove.textContent = "Remover arquivo";
            remove.addEventListener("click", async () => {
                if (!window.confirm(`Remover o arquivo “${file.original_name}” deste pedido?`)) return;
                remove.disabled = true;
                const { error: storageError } = await client.storage.from("commission-deliveries").remove([file.file_path]);
                if (storageError) { remove.disabled = false; setMessage("Não foi possível remover o arquivo privado.", true); return; }
                const { error } = await client.from("commission_deliveries").delete().eq("id", file.id);
                if (error) { remove.disabled = false; setMessage("Arquivo removido do armazenamento, mas não foi possível atualizar a lista.", true); return; }
                setMessage("Arquivo removido do pedido.");
                await loadOrders();
            });
            controls.append(visibleLabel, remove);
            item.append(controls);
            list.append(item);
        });
        const form = document.createElement("form");
        form.className = "delivery-upload-form";
        const fileLabel = document.createElement("label");
        fileLabel.textContent = "Arquivo";
        const input = document.createElement("input");
        input.type = "file";
        input.required = true;
        input.accept = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.zip,.psd,.clip,.kra,.procreate,.mp4,.mov,.txt";
        input.setAttribute("aria-label", `Escolher arquivo para o pedido de ${order.client_name}`);
        const kindLabel = document.createElement("label");
        kindLabel.textContent = "Categoria";
        const kind = document.createElement("select");
        kind.innerHTML = '<option value="sketch">Esboço</option><option value="final">Arte final</option><option value="other">Outro</option>';
        const noteLabel = document.createElement("label");
        noteLabel.textContent = "Recado para o cliente (opcional)";
        const note = document.createElement("input");
        note.type = "text";
        note.maxLength = 500;
        note.placeholder = "Ex.: veja se a pose está como imaginou";
        const visLabel = document.createElement("label");
        visLabel.className = "delivery-visible-control";
        const vis = document.createElement("input");
        vis.type = "checkbox";
        vis.checked = true;
        visLabel.append(vis, document.createTextNode("Disponibilizar ao cliente agora"));
        const passwordRequiredLabel = document.createElement("label");
        passwordRequiredLabel.className = "delivery-visible-control";
        const passwordRequired = document.createElement("input");
        passwordRequired.type = "checkbox";
        passwordRequired.checked = true;
        passwordRequiredLabel.append(passwordRequired, document.createTextNode("Exigir a senha definida para este pedido"));
        const help = document.createElement("small");
        help.className = "delivery-upload-help";
        help.textContent = "Arquivos protegidos só abrem com a senha configurada acima. Depois, mude a etapa para Aguardando aprovação (esboço) ou Entregue (arte final) para enviar o link ao cliente por e-mail. Até 100 MB quando o plano Supabase permitir.";
        const progress = document.createElement("progress");
        progress.max = 100;
        progress.value = 0;
        progress.hidden = true;
        const submit = document.createElement("button");
        submit.type = "submit";
        submit.className = "button button-secondary";
        submit.textContent = "Enviar arquivo privado";
        form.append(fileLabel, input, kindLabel, kind, noteLabel, note, passwordRequiredLabel, visLabel, help, progress, submit);
        form.addEventListener("submit", async event => {
            event.preventDefault();
            const file = input.files?.[0];
            if (!file) return;
            await passwordStatePromise;
            if (vis.checked && passwordRequired.checked && !passwordConfigured) {
                setMessage("Defina primeiro a senha do pedido para liberar arquivos protegidos.", true);
                return;
            }
            const maxBytes = 100 * 1024 * 1024;
            if (file.size > maxBytes) { setMessage("Este arquivo passa do limite de 100 MB.", true); return; }
            if (!window.tus?.Upload) { setMessage("Não foi possível preparar o envio de arquivo. Atualize a página e tente de novo.", true); return; }
            submit.disabled = true;
            input.disabled = true;
            progress.hidden = false;
            progress.value = 0;
            setMessage("Preparando envio seguro do arquivo…");
            const { data: sessionData, error: sessionError } = await client.auth.getSession();
            const session = sessionData?.session;
            if (sessionError || !session?.access_token) {
                submit.disabled = false; input.disabled = false; progress.hidden = true;
                setMessage("Sua sessão expirou. Entre novamente no painel para enviar arquivos.", true);
                return;
            }
            const cleanName = file.name.normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(-180) || "arquivo";
            const fingerprintText = `${order.id}:${file.name}:${file.size}:${file.lastModified}`;
            let pathHash = 2166136261;
            for (const character of fingerprintText) pathHash = Math.imul(pathHash ^ character.charCodeAt(0), 16777619);
            const path = `${order.id}/${(pathHash >>> 0).toString(16)}-${cleanName}`;
            const projectId = new URL(config.supabaseUrl).hostname.split(".")[0];
            const upload = new window.tus.Upload(file, {
                endpoint: `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`,
                chunkSize: 6 * 1024 * 1024,
                retryDelays: [0, 3000, 5000, 10000, 20000],
                headers: { authorization: `Bearer ${session.access_token}`, apikey: config.publishableKey, "x-upsert": "true" },
                uploadDataDuringCreation: true,
                removeFingerprintOnSuccess: true,
                metadata: { bucketName: "commission-deliveries", objectName: path, contentType: file.type || "application/octet-stream", cacheControl: "3600" },
                onError: async error => {
                    submit.disabled = false; input.disabled = false; progress.hidden = true;
                    if (error?.originalResponse?.getStatus?.() === 413) setMessage("O Supabase recusou: o limite global do projeto é menor que o arquivo. No plano gratuito, o teto é 50 MB.", true);
                    else setMessage("O envio não terminou. Confira o limite do Storage no Supabase e tente novamente.", true);
                },
                onProgress: (uploaded, total) => {
                    const percent = Math.round(uploaded / total * 100);
                    progress.value = percent;
                    setMessage(`Enviando arquivo… ${percent}%`);
                },
                onSuccess: async () => {
                    const { data: userData } = await client.auth.getUser();
                    const { error } = await client.from("commission_deliveries").upsert({
                        order_id: order.id, file_path: path, original_name: file.name.slice(0, 255),
                        file_size: file.size, mime_type: file.type || "application/octet-stream",
                        file_kind: kind.value, note: note.value.trim(), client_visible: vis.checked,
                        password_required: passwordRequired.checked,
                        created_by: userData.user.id
                    }, { onConflict: "file_path" });
                    if (error) {
                        await client.storage.from("commission-deliveries").remove([path]);
                        setMessage("O arquivo chegou, mas não foi possível vinculá-lo ao pedido. Tente novamente.", true);
                    } else setMessage(passwordRequired.checked
                        ? "Arquivo enviado com proteção. Envie a senha separadamente e mude a etapa para notificar o cliente."
                        : "Arquivo enviado. O cliente poderá abri-lo com o código do pedido.");
                    await loadOrders();
                }
            });
            upload.findPreviousUploads().then(previousUploads => {
                if (previousUploads.length) upload.resumeFromPreviousUpload(previousUploads[0]);
                upload.start();
            }).catch(() => upload.start());
        });
        section.append(title, passwordPanel, list, form);
        return section;
    }

    function renderOrders() {
        const container = document.querySelector("#orders-list");
        container.replaceChildren();
        const query = ordersSearch.value.trim().toLocaleLowerCase("pt-BR");
        const filtered = cachedOrders.filter(order => {
            const isStale = (Date.now() - new Date(order.updated_at || order.created_at).getTime()) >= 7 * 86400000;
            const matchesStatus = ordersFilter.value === "all" || (ordersFilter.value === "stale" ? isStale : order.status === ordersFilter.value);
            const matchesArtist = ordersArtistFilter.value === "all" || (order.artist_name || "Sem atribuição") === ordersArtistFilter.value;
            const searchable = `${order.client_name} ${order.tracking_code || ""} ${order.client_email || ""}`.toLocaleLowerCase("pt-BR");
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
            const emailInfo = document.createElement("span");
            emailInfo.className = "order-client-email-note";
            emailInfo.textContent = order.client_email
                ? `${order.client_email} · ${order.email_updates_enabled ? "avisos autorizados" : "sem autorização para avisos"}`
                : "Sem e-mail para atualizações";
            const type = document.createElement("p");
            type.className = "order-type";
            type.textContent = order.art_type;
            const artist = document.createElement("p");
            artist.className = "order-artist-assignment";
            artist.textContent = `Artista responsável: ${order.artist_name || "Sem atribuição"}`;
            if (canManageAll) {
                const assignment = document.createElement("select");
                assignment.className = "order-assignment-select";
                assignment.setAttribute("aria-label", `Alterar artista responsável pelo pedido de ${order.client_name}`);
                [["Sem atribuição", "Sem atribuição"], ["Ynnley", "Ynnley"], ["Bonny", "Bonny"]].forEach(([value, label]) => {
                    const option = document.createElement("option"); option.value = value; option.textContent = label;
                    option.selected = (order.artist_name || "Sem atribuição") === value; assignment.append(option);
                });
                assignment.addEventListener("change", async () => {
                    assignment.disabled = true;
                    const { error } = await client.from("commission_orders").update({ artist_name: assignment.value }).eq("id", order.id);
                    if (error) { assignment.disabled = false; setMessage("Não foi possível alterar a atribuição. Confira as permissões e a migração de artistas.", true); return; }
                    setMessage(`Pedido atribuído a ${assignment.value}.`); await loadOrders();
                });
                artist.append(document.createTextNode(" · "), assignment);
            }
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
                if (order.client_email && order.email_updates_enabled) {
                    const resendEmail = document.createElement("button");
                    resendEmail.type = "button";
                    resendEmail.className = "copy-tracking-code resend-status-email";
                    resendEmail.textContent = "Enviar atualização agora";
                    const cooldownKey = resendCooldownKey(order);
                    const cooldownUntil = Number(sessionStorage.getItem(cooldownKey) || 0);
                    if (cooldownUntil > Date.now()) {
                        resendEmail.disabled = true;
                        resendEmail.textContent = "E-mail enviado há pouco";
                        window.setTimeout(() => {
                            resendEmail.disabled = false;
                            resendEmail.textContent = "Enviar atualização agora";
                            sessionStorage.removeItem(cooldownKey);
                        }, cooldownUntil - Date.now());
                    }
                    resendEmail.addEventListener("click", () => {
                        if (resendEmail.disabled) return;
                        const statusName = orderStatuses.find(([value]) => value === order.status)?.[1] || "atual";
                        if (!window.confirm(`Enviar agora o aviso da etapa “${statusName}” para ${order.client_email}?`)) return;
                        resendEmail.disabled = true;
                        resendEmail.textContent = "Enviando…";
                        void (async () => {
                            let result;
                            try {
                                result = await sendStatusEmail(order);
                            } catch {
                                result = { error: "O envio falhou inesperadamente. Confira sua conexão e tente novamente." };
                            }
                            if (result.sent) {
                                const until = Date.now() + 60000;
                                sessionStorage.setItem(cooldownKey, String(until));
                                resendEmail.textContent = "E-mail enviado há pouco";
                                window.setTimeout(() => {
                                    resendEmail.disabled = false;
                                    resendEmail.textContent = "Enviar atualização agora";
                                    sessionStorage.removeItem(cooldownKey);
                                }, 60000);
                            } else {
                                resendEmail.disabled = false;
                                resendEmail.textContent = "Enviar atualização agora";
                            }
                            setMessage(result.sent
                                ? `Aviso da etapa “${statusName}” enviado para ${order.client_email}. O botão ficará pausado por 1 minuto para evitar duplicidade.`
                                : result.error || result.message, Boolean(result.error));
                        })();
                    });
                    tracking.append(document.createTextNode(" "), resendEmail);
                }
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

            const emailPrefs = createOrderEmailPrefs(order);
            const emailMessage = createOrderEmailMessage(order);
            const finance = createOrderFinance(order);
            details.append(heading, badge, contact, emailInfo, emailPrefs, emailMessage, createEmailHistory(order), type, artist, summary, date, lastUpdated, tracking, finance, createOrderDeliveries(order), historyDetails, requestsDetails);

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
                    const emailResult = await sendStatusEmail(order);
                    const label = select.selectedOptions[0].textContent;
                    setMessage(emailResult.error
                        ? `Etapa atualizada (${label}), mas o e-mail falhou: ${emailResult.error}`
                        : emailResult.sent
                            ? `Etapa atualizada (${label}) e aviso enviado por e-mail.`
                            : `Etapa atualizada (${label}). ${emailResult.message || "Nenhum e-mail foi enviado."}`,
                        Boolean(emailResult.error));
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
                const { data: attachedFiles, error: filesError } = await client.from("commission_deliveries")
                    .select("file_path").eq("order_id", order.id);
                if (filesError) {
                    remove.disabled = false;
                    setMessage("Não foi possível conferir os arquivos privados do pedido. O pedido foi mantido.", true);
                    return;
                }
                if (attachedFiles?.length) {
                    const { error: storageError } = await client.storage.from("commission-deliveries")
                        .remove(attachedFiles.map(file => file.file_path));
                    if (storageError) {
                        remove.disabled = false;
                        setMessage("Não foi possível remover os arquivos privados. O pedido foi mantido.", true);
                        return;
                    }
                }
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
            .select("id, client_name, client_contact, client_email, email_updates_enabled, artist_email_message, artist_email_messages, art_type, summary, status, created_at, updated_at, tracking_code, estimated_delivery, artist_name, agreed_amount")
            .order("created_at", { ascending: false });
        container.setAttribute("aria-busy", "false");
        if (error) {
            container.textContent = error.message?.includes("client_email") || error.message?.includes("email_updates_enabled") || error.message?.includes("agreed_amount") || error.message?.includes("artist_email_message")
                ? "Aplique supabase/business-tools.sql e supabase/email-notification-message.sql no SQL Editor do Supabase para ativar os recursos de e-mail e controle financeiro."
                : error.message?.includes("estimated_delivery")
                    ? "Aplique supabase/order-tracking-details.sql no SQL Editor do Supabase."
                : error.message?.includes("artist_name")
                    ? "Aplique supabase/studio-workflow-upgrades.sql no SQL Editor do Supabase."
                    : "Não foi possível carregar os pedidos.";
            return;
        }
        const orderIds = (data || []).map(order => order.id);
        let historyByOrder = new Map();
        let requestsByOrder = new Map();
        let paymentsByOrder = new Map();
        let emailsByOrder = new Map();
        let deliveriesByOrder = new Map();
        if (orderIds.length) {
            const [historyResult, requestsResult, paymentsResult, emailResult, deliveriesResult] = await Promise.all([
                client.from("commission_order_history").select("order_id, status, changed_at").in("order_id", orderIds).order("changed_at", { ascending: true }),
                client.from("commission_client_requests").select("id, order_id, request_type, message, state, created_at, handled_at").in("order_id", orderIds).order("created_at", { ascending: false }),
                client.from("commission_payments").select("id, order_id, amount, paid_at, payment_method, note").in("order_id", orderIds).order("paid_at", { ascending: false }),
                client.from("commission_email_notifications").select("id, order_id, status, sent, detail, created_at").in("order_id", orderIds).order("created_at", { ascending: false }),
                client.from("commission_deliveries").select("id, order_id, file_path, original_name, file_size, mime_type, file_kind, note, client_visible, password_required, created_at").in("order_id", orderIds).order("created_at", { ascending: false })
            ]);
            if (historyResult.error || requestsResult.error || paymentsResult.error || emailResult.error) {
                setMessage(emailResult.error
                    ? "Aplique supabase/email-notification-message.sql para ativar o histórico privado de e-mails."
                    : paymentsResult.error
                    ? "Aplique supabase/business-tools.sql para ativar o controle de recebimentos."
                    : "Aplique supabase/studio-workflow-upgrades.sql para ativar o histórico e as solicitações dos clientes.", true);
            }
            (historyResult.data || []).forEach(item => {
                if (!historyByOrder.has(item.order_id)) historyByOrder.set(item.order_id, []);
                historyByOrder.get(item.order_id).push(item);
            });
            (requestsResult.data || []).forEach(item => {
                if (!requestsByOrder.has(item.order_id)) requestsByOrder.set(item.order_id, []);
                requestsByOrder.get(item.order_id).push(item);
            });
            cachedPayments = paymentsResult.data || [];
            cachedPayments.forEach(item => {
                if (!paymentsByOrder.has(item.order_id)) paymentsByOrder.set(item.order_id, []);
                paymentsByOrder.get(item.order_id).push(item);
            });
            (emailResult.data || []).forEach(item => { if (!emailsByOrder.has(item.order_id)) emailsByOrder.set(item.order_id, []); emailsByOrder.get(item.order_id).push(item); });
            if (deliveriesResult.error) setMessage("Aplique supabase/commission-delivery-and-intake.sql para ativar os envios privados e os pedidos pelo site.", true);
            (deliveriesResult.data || []).forEach(item => { if (!deliveriesByOrder.has(item.order_id)) deliveriesByOrder.set(item.order_id, []); deliveriesByOrder.get(item.order_id).push(item); });
        } else cachedPayments = [];
        cachedOrders = (data || []).map(order => ({
            ...order,
            history: historyByOrder.get(order.id) || [],
            client_requests: requestsByOrder.get(order.id) || [],
            payments: paymentsByOrder.get(order.id) || [],
            email_notifications: emailsByOrder.get(order.id) || [],
            deliveries: deliveriesByOrder.get(order.id) || []
        }));
        renderFinanceSummary();
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
        const email = document.querySelector("#order-client-email").value.trim();
        const emailConsent = document.querySelector("#order-email-consent").checked;
        if (email && !emailConsent) {
            setMessage("Marque a autorização do cliente antes de ativar avisos por e-mail.", true);
            document.querySelector("#order-email-consent").focus();
            return;
        }
        if (emailConsent && !email) {
            setMessage("Informe o e-mail do cliente ou retire a autorização por e-mail.", true);
            document.querySelector("#order-client-email").focus();
            return;
        }
        const fields = {
            client_name: document.querySelector("#order-client").value.trim(),
            client_contact: document.querySelector("#order-contact").value.trim(),
            client_email: email || null,
            email_updates_enabled: emailConsent && Boolean(email),
            art_type: document.querySelector("#order-type").value.trim(),
            summary: document.querySelector("#order-summary").value.trim(),
            status: "received",
            artist_name: assignedArtistName && !canManageAll ? assignedArtistName : document.querySelector("#order-artist").value,
            estimated_delivery: document.querySelector("#order-estimate").value || null,
            agreed_amount: document.querySelector("#order-agreed-amount").value === "" ? null : Number(document.querySelector("#order-agreed-amount").value)
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
    const emailField = document.querySelector("#order-client-email");
    const emailConsentField = document.querySelector("#order-email-consent");
    emailField.addEventListener("input", () => {
        emailConsentField.required = Boolean(emailField.value.trim());
        if (!emailField.value.trim()) emailConsentField.checked = false;
    });
    const { data: sessionData } = await client.auth.getSession();
    if (sessionData.session && !passwordRecoveryMode) await continueSession();
});
