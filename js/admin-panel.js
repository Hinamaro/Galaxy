document.addEventListener("DOMContentLoaded", async () => {
    const config = window.GALAXY_BACKEND;
    const backendMessage = document.querySelector("#backend-message");
    const authMessage = document.querySelector("#auth-message");
    const signInPanel = document.querySelector("#signin-panel");
    const mfaPanel = document.querySelector("#mfa-panel");
    const enrollPanel = document.querySelector("#enroll-panel");
    const passwordResetPanel = document.querySelector("#password-reset-panel");
    const dashboard = document.querySelector("#admin-dashboard");

    let client = null;
    let pendingFactorId = null;
    let passwordRecoveryMode = false;

    const setMessage = (message, isError = false) => {
        authMessage.textContent = message;
        authMessage.hidden = !message;
        authMessage.classList.toggle("is-error", isError);
        authMessage.classList.toggle("is-success", !isError && Boolean(message));
    };

    const showOnly = panel => {
        [signInPanel, mfaPanel, enrollPanel, passwordResetPanel].forEach(item => item.hidden = item !== panel);
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
        setMessage("Senha atualizada. Entre com sua nova senha e configure o autenticador.");
    });

    async function checkArtist() {
        const { data, error } = await client.rpc("is_artist");
        if (error) throw new Error("Não foi possível confirmar o acesso de artista. Confira a lista de contas autorizadas no sistema.");
        if (data !== true) throw new Error("Esta conta não está autorizada para acessar o painel.");
    }

    async function showAuthenticatorChallenge() {
        const { data, error } = await client.auth.mfa.listFactors();
        if (error) throw error;
        const factor = data.totp?.find(item => item.status === "verified");
        if (!factor) {
            // Clear incomplete enrollments left by an interrupted first-time setup.
            for (const pending of (data.totp || []).filter(item => item.status === "unverified")) {
                await client.auth.mfa.unenroll({ factorId: pending.id });
            }
            showOnly(enrollPanel);
            return;
        }
        pendingFactorId = factor.id;
        showOnly(mfaPanel);
        document.querySelector("#mfa-code").focus();
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
            await checkArtist();
            const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
            if (error) throw error;
            if (data.currentLevel === "aal2") {
                await loadDashboard();
            } else {
                await showAuthenticatorChallenge();
            }
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

    document.querySelector("#mfa-form").addEventListener("submit", async event => {
        event.preventDefault();
        setMessage("");
        const code = new FormData(event.currentTarget).get("code").trim();
        const { error } = await client.auth.mfa.challengeAndVerify({ factorId: pendingFactorId, code });
        if (error) {
            setMessage("Código inválido ou expirado. Confira o autenticador e tente novamente.", true);
            return;
        }
        await continueSession();
    });

    document.querySelector("#start-enroll").addEventListener("click", async event => {
        event.currentTarget.disabled = true;
        setMessage("");
        const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Painel das comissões" });
        event.currentTarget.disabled = false;
        if (error) {
            setMessage("Não foi possível iniciar a configuração do autenticador. Tente novamente.", true);
            return;
        }
        pendingFactorId = data.id;
        document.querySelector("#auth-qr").src = data.totp.qr_code;
        document.querySelector("#auth-secret").textContent = data.totp.secret;
        document.querySelector("#enroll-details").hidden = false;
        document.querySelector("#enroll-code").focus();
    });

    document.querySelector("#enroll-form").addEventListener("submit", async event => {
        event.preventDefault();
        setMessage("");
        const code = new FormData(event.currentTarget).get("code").trim();
        const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId: pendingFactorId });
        if (challengeError) {
            setMessage("Não foi possível verificar o código. Gere outro QR code e tente novamente.", true);
            return;
        }
        const { error } = await client.auth.mfa.verify({ factorId: pendingFactorId, challengeId: challenge.id, code });
        if (error) {
            setMessage("Código inválido ou expirado. Confira o aplicativo autenticador e tente novamente.", true);
            return;
        }
        setMessage("Autenticador ativado com sucesso.");
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
            setMessage("Não foi possível salvar a disponibilidade. A sessão precisa estar autenticada com o segundo fator.", true);
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

    async function loadOrders() {
        const container = document.querySelector("#orders-list");
        container.replaceChildren();
        container.setAttribute("aria-busy", "true");
        const { data, error } = await client
            .from("commission_orders")
            .select("id, client_name, client_contact, art_type, summary, status, created_at")
            .order("created_at", { ascending: false });
        container.setAttribute("aria-busy", "false");
        if (error) {
            container.textContent = "Não foi possível carregar os pedidos.";
            return;
        }
        if (!data.length) {
            container.textContent = "Ainda não há pedidos cadastrados.";
            return;
        }

        data.forEach(order => {
            const row = document.createElement("article");
            row.className = "order-row";
            const details = document.createElement("div");
            const heading = document.createElement("h4");
            heading.textContent = order.client_name;
            const contact = document.createElement("p");
            contact.textContent = order.client_contact;
            const type = document.createElement("p");
            type.textContent = order.art_type;
            const summary = document.createElement("p");
            summary.textContent = order.summary;
            const date = document.createElement("span");
            date.className = "order-date";
            date.textContent = new Date(order.created_at).toLocaleDateString("pt-BR");
            details.append(heading, contact, type, summary, date);

            const select = document.createElement("select");
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
                const { error: updateError } = await client.from("commission_orders")
                    .update({ status: select.value }).eq("id", order.id);
                select.disabled = false;
                if (updateError) {
                    setMessage("Não foi possível atualizar a etapa do pedido.", true);
                    await loadOrders();
                } else {
                    setMessage(`Etapa atualizada: ${select.selectedOptions[0].textContent}.`);
                }
            });
            row.append(details, select);
            container.append(row);
        });
    }

    document.querySelector("#order-form").addEventListener("submit", async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const fields = {
            client_name: document.querySelector("#order-client").value.trim(),
            client_contact: document.querySelector("#order-contact").value.trim(),
            art_type: document.querySelector("#order-type").value.trim(),
            summary: document.querySelector("#order-summary").value.trim(),
            status: "received"
        };
        const { error } = await client.from("commission_orders").insert(fields);
        if (error) {
            setMessage("Não foi possível adicionar o pedido. Confira a conexão e a autenticação.", true);
            return;
        }
        form.reset();
        setMessage("Pedido adicionado à fila privada.");
        await loadOrders();
    });

    document.querySelector("#availability-form").setAttribute("aria-label", "Atualizar disponibilidade pública");
    const { data: sessionData } = await client.auth.getSession();
    if (sessionData.session && !passwordRecoveryMode) await continueSession();
});
