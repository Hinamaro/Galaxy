# Portal privado das comissões

## O que já está configurado

- Banco Supabase conectado ao site por URL e chave publicável.
- Tabelas para disponibilidade pública e pedidos privados.
- A disponibilidade começa fechada para não anunciar vagas por engano.
- As políticas do Supabase foram atualizadas: o painel aceita senha para as contas autorizadas, sem pedir autenticador.

## Ativar acompanhamento público e remoção de pedidos

Antes de publicar a versão anterior, o projeto executou `supabase/public-tracking-and-order-delete.sql`: essa atualização gera códigos aleatórios, libera a remoção apenas para artistas autorizadas e permite consultar por código dados limitados do pedido. Contato, nome e resumo não são retornados à página pública.

Para habilitar os recursos já preparados, abra **SQL Editor → New query** e execute, nesta ordem, `supabase/studio-workflow-upgrades.sql`, `supabase/business-tools.sql` e `supabase/email-notification-message.sql`. Faça isso uma vez, depois da migração de códigos/exclusão já executada. A primeira cria histórico, solicitações e galeria autorizada; a segunda cria acesso por artista, pagamentos e campos de comunicação; a terceira ativa mensagens privadas por etapa e o histórico de tentativas de e-mail, visível somente às artistas autorizadas. `order-tracking-details.sql` é uma versão anterior da previsão e não precisa ser executada separadamente.

## Pedidos pelo site e entrega privada de arquivos

Para ativar o formulário de encomenda e o envio de esboços/arte final, execute `supabase/commission-delivery-and-intake.sql` no SQL Editor depois das migrações acima. O pedido entra na fila privada com status “Pedido recebido”; o formulário entrega ao cliente um código individual de acompanhamento. Nome, contato, resumo e referências continuam escondidos da consulta pública.

Depois, em **Edge Functions → Deploy a new function → Via Editor**, crie `get-order-delivery` e copie `supabase/functions/get-order-delivery/index.ts`. Desative **Verify JWT** para essa função, pois o endpoint confere o código do pedido e só emite um link temporário para arquivo marcado como disponível ao cliente. Não coloque a chave `service_role` no código do site; a função usa o segredo reservado do próprio Supabase. O arquivo `supabase/config.toml` registra essa configuração caso publique a função pela CLI.

No painel, cada pedido terá um formulário privado de arquivos: escolha esboço, arte final ou outro; escreva um recado; e marque se o cliente pode abrir. Imagens aparecem com prévia na página Status; outros formatos ficam disponíveis para baixar. PDF, ZIP, PSD, CLIP, KRA, Procreate, imagens e vídeo são aceitos pela interface, até 100 MB. A artista pode esconder ou remover arquivos depois.

**Limite do plano:** o projeto gratuito limita cada upload a 50 MB. O envio retomável e a interface aceitam até 100 MB, mas arquivos acima de 50 MB só funcionarão se o plano e o limite global do Storage permitirem. Quando isso estiver habilitado, abra **Storage → Settings**, aumente **Global file size limit** para pelo menos 100 MB e edite o bucket privado `commission-deliveries` para o mesmo limite. Não é necessário alterar o bucket público `commission-gallery`.

O código do pedido é a credencial de acesso do cliente: compartilhe-o somente com a pessoa que encomendou. Links individuais de arquivo expiram depois de alguns minutos. Se o cliente abrir a página Status pelo código, arquivos liberados aparecem ali; o cliente não vê e-mail, contato, valor ou descrição privada do pedido.

## O que falta antes do primeiro acesso

1. No Supabase, abra **Authentication → Users** e crie uma conta individual para cada artista. Não compartilhem a mesma conta.
2. Abra o **SQL Editor** e rode esta consulta para localizar os IDs das contas:

   ```sql
   select id, email from auth.users;
   ```

3. Na mesma área, troque os UUIDs pelos IDs das artistas e execute:

   ```sql
   insert into private.artist_access (user_id, artist_name, can_manage_all)
   values ('UUID-DA-ARTISTA-1', 'Ynnley', false), ('UUID-DA-ARTISTA-2', 'Bonny', false)
   on conflict do nothing;
   ```

   Essa lista autoriza o acesso. Use `Ynnley` ou `Bonny` exatamente como está escrito. Cada artista passa a ver e editar só os pedidos atribuídos a ela. Para uma conta de gestão que precisa ver as duas filas, use `can_manage_all = true`.

4. Se as contas já existiam antes de rodar `business-tools.sql`, atualize os registros existentes para vincular cada login. No lugar do e-mail, use o endereço cadastrado em **Authentication → Users**:

   ```sql
   update private.artist_access as access
   set artist_name = 'Ynnley', can_manage_all = false
   from auth.users as account
   where account.id = access.user_id and lower(account.email) = lower('EMAIL-DA-YNNLEY');

   update private.artist_access as access
   set artist_name = 'Bonny', can_manage_all = false
   from auth.users as account
   where account.id = access.user_id and lower(account.email) = lower('EMAIL-DA-BONNY');
   ```

   Deixe pelo menos uma conta de gestão com `can_manage_all = true` para administrar a fila completa. Faça e confira esses vínculos antes de usar a nova restrição por artista. A conta de gestão atual preserva esse acesso após a migração; você define qual login continua como gestora.
5. Quando o site tiver um endereço HTTPS, abra **Authentication → URL Configuration** e configure o endereço do site como URL principal e nas URLs de redirecionamento permitidas.
   Inclua também o endereço da página `painel.html` nas URLs permitidas para que o link de recuperação de senha volte ao formulário correto.
6. Publique a pasta do site em um host HTTPS. O Supabase cuida do banco e do login; ele não publica os arquivos HTML do site.

## Como as artistas usam o painel

1. Clique em **Área das artistas** no menu ou rodapé do site para abrir `painel.html`. Entre com o e-mail e a senha da conta individual. Se necessário, use **Esqueci minha senha** para receber um link de recuperação no próprio e-mail.
2. Na versão sem autenticador, basta entrar com e-mail e senha.
3. Em **Disponibilidade das comissões**, escolha abertas, poucas vagas ou fechadas; informe as vagas e um aviso que possa ser público; salve. A página pública de status reflete a mudança.
4. Em **Pedidos**, registre nome, contato, tipo de arte e resumo. Se o cliente autorizar, inclua o e-mail e marque a autorização para avisos. Pedidos que já existiam precisam ter o endereço salvo na própria ficha e a autorização confirmada; por segurança, a migração não ativa e-mail para registros antigos automaticamente. Registre também o valor combinado, se já souber. Depois, atualize a etapa do pedido no seletor da ficha.
   O painel mostra um código/link e uma mensagem pronta para compartilhar com o cliente; inclui busca, filtros, contagens, avisos de pedidos parados, histórico de etapas, solicitações recebidas, filtro por artista e exportação CSV. A previsão é opcional. Use **Remover pedido** na ficha e confirme para excluir permanentemente.
5. Para publicar uma entrega na galeria, escolha um pedido concluído, envie a imagem e marque a confirmação de autorização expressa do cliente. Trabalhos sem essa confirmação não são aceitos pelo banco.
6. Em cada ficha, registre recebimentos parciais com valor, data e forma. O resumo financeiro permite escolher o mês e mostra o que entrou, quantos pedidos chegaram e o saldo dos pedidos ativos. Valores não são públicos.

7. Quando uma etapa muda, o painel tenta enviar um e-mail automático somente se o cliente autorizou e foi informado um endereço válido. Veja a seção **Ativar avisos automáticos por e-mail** abaixo; sem ela, a atualização continua salva e vocês podem usar **Copiar mensagem** para avisar manualmente.

Nome, contatos, resumo e pagamentos ficam privados. Cada conta vinculada a Ynnley ou Bonny só consulta os pedidos atribuídos a ela; a conta de gestão pode ver as duas filas. O público só vê disponibilidade geral e, ao informar o código individual, o tipo de arte, a etapa e a data. Não coloque informação de cliente no aviso público.

## Ativar avisos automáticos por e-mail

O envio foi preparado com EmailJS ligado ao endereço `MikiMwk@hotmail.com`. A artista inicia o envio pelo painel; uma Edge Function no Supabase confirma a sessão e a autorização do cliente antes de solicitar o e-mail. O navegador não recebe configurações de envio.

### 1. Conectar o Hotmail no EmailJS

1. Crie/acesse sua conta em [EmailJS](https://www.emailjs.com/) e abra **Email Services → Add New Service**.
2. Escolha a integração Microsoft/Outlook disponível e conecte `MikiMwk@hotmail.com` pela tela oficial da Microsoft. Não informe sua senha em nenhum formulário do site Zoolixianas. Se o EmailJS não aceitar o endereço Hotmail nessa integração, pare e me avise; não tente contornar as proteções da Microsoft.
3. Envie um e-mail de teste pela página do serviço para confirmar que a conexão foi aceita. As contas pessoais são adequadas apenas para baixo volume e podem ter limites do provedor.

### 2. Criar o modelo de e-mail

Em **Email Templates**, crie um modelo. No campo de destinatário (**To Email**), coloque `{{to_email}}`; use `{{subject}}` no assunto. Um corpo HTML simples pode ser:

```html
<style>@media only screen and (max-width:600px){.zx-wrap{padding:18px!important}.zx-title{font-size:24px!important}.zx-button{display:block!important;text-align:center!important}}</style>
<div class="zx-wrap" style="width:100%;max-width:560px;box-sizing:border-box;margin:0 auto;padding:26px;color:#482651;background:#fff8fc;border:1px solid #eed6e8;border-radius:18px;font-family:Arial,sans-serif">
  <p style="margin:0 0 16px;color:#a34f80;font-weight:bold;letter-spacing:.08em">ZOOLIXIANAS · COMISSÕES</p>
  <h1 class="zx-title" style="margin:0 0 16px;font-size:28px;line-height:1.2">Oi, {{client_name}}!</h1>
  <p style="margin:0 0 16px;line-height:1.55">Sua comissão <strong>{{art_type}}</strong> recebeu uma atualização:</p>
  <div style="margin:0 0 16px;padding:14px 16px;border-radius:12px;background:{{status_color}};color:#fff;font-weight:bold;line-height:1.4">{{status_label}}</div>
  <p style="margin:0 0 14px">Código do pedido: <strong style="color:#a34f80;letter-spacing:2px">{{tracking_code}}</strong></p>
  {{#has_eta}}<p style="margin:0 0 16px">Previsão de entrega: <strong>{{eta}}</strong></p>{{/has_eta}}
  {{#has_artist_message}}<div style="margin:0 0 18px;padding:14px 16px;border-left:4px solid #c97dac;border-radius:10px;background:#f8eafa;line-height:1.55;white-space:pre-line"><strong>Mensagem da artista</strong><br>{{artist_message}}</div>{{/has_artist_message}}
  <p style="margin:20px 0"><a class="zx-button" href="{{tracking_url}}" style="display:inline-block;padding:13px 20px;background:#d987b5;color:#fff;text-decoration:none;border-radius:999px;font-weight:bold">Acompanhar pedido pelo site</a></p>
  <p style="margin:18px 0 0;color:#88778b;font-size:13px;line-height:1.5">Você recebe este aviso porque autorizou atualizações por e-mail.</p>
</div>
```

O remetente deve ser o endereço conectado (`MikiMwk@hotmail.com`). Salve o modelo e copie os identificadores do serviço e do modelo. Em **Account → General**, copie a **Public Key**. Não compartilhe senha nem token da Microsoft.

Como o envio parte da função de servidor do Supabase, em **Account → Security** habilite **Allow EmailJS API for non-browser applications** e mantenha **Use Private Key** ativada. O teste feito dentro do EmailJS roda no navegador; ele não confirma autorização para chamadas do Supabase.

### 3. Configurar e publicar no Supabase

O código da função está em `supabase/functions/notify-order-status/index.ts`. No painel Supabase, abra **Edge Functions → Deploy a new function → Via Editor**, crie `notify-order-status` e copie o arquivo para o editor. O Supabase explica esse processo [na documentação oficial](https://supabase.com/docs/guides/functions/quickstart-dashboard).

Em **Edge Functions → Secrets**, cadastre estes nomes com os valores mostrados pelo EmailJS e o endereço HTTPS publicado do site:

| Nome do segredo | Valor |
| --- | --- |
| `EMAILJS_PUBLIC_KEY` | Public Key da sua conta EmailJS |
| `EMAILJS_ACCESS_TOKEN` | Private Key da conta EmailJS, usada apenas pela função no servidor |
| `EMAILJS_SERVICE_ID` | ID do serviço conectado ao Hotmail |
| `EMAILJS_TEMPLATE_ID` | ID do modelo criado acima |
| `SITE_URL` | URL HTTPS do site publicado, sem barra final |

Não coloque esses valores no HTML, no `backend-config.js` nem em repositórios públicos. A Private Key deve ficar somente como segredo da Edge Function do Supabase; nunca a envie pelo chat. O código usa a sessão da artista para consultar o pedido e só tenta enviar quando o cliente autorizou avisos.

Na criação do pedido, informe o e-mail apenas se a pessoa autorizar receber atualizações. Para pedidos antigos, abra a ficha, preencha **Avisos por e-mail ao cliente**, marque a autorização e salve. Cada mudança de etapa dispara um aviso com a etapa e o link público de acompanhamento; a ficha também oferece **Reenviar e-mail de status** para uma tentativa manual. Se o envio falhar, o painel mostra o motivo provável e mantém a etapa salva.

Na criação do pedido, informe o e-mail apenas se a pessoa autorizar receber atualizações. Para pedidos antigos, abra a ficha, preencha **Avisos por e-mail ao cliente**, marque a autorização e salve. Cada mudança de etapa dispara um aviso; a ficha também oferece **Reenviar e-mail de status**. Se falhar, o painel mostra o motivo provável e mantém a etapa salva.

Depois de implantar a função e cadastrar os cinco segredos, publique a versão atualizada do site na Vercel. Faça um teste com um pedido de teste e um e-mail da equipe; confira também spam/lixo eletrônico. Se não chegar, consulte **Edge Functions → notify-order-status → Invocations** para o código HTTP e os detalhes da resposta, e tente o reenvio. Uma etapa pode aparecer atualizada mesmo quando o serviço de e-mail recusou o envio. Para grande volume, troque o serviço pessoal por um provedor transacional; EmailJS indica integrações pessoais para desenvolvimento ou volume muito baixo ([orientação do EmailJS](https://www.emailjs.com/docs/user-guide/connecting-email-services/)).

## Pagamentos e cópias de segurança

Os recebimentos são lançamentos internos e podem ser corrigidos ou removidos na ficha. O botão **Baixar backup dos dados (.JSON)** baixa pedidos, histórico e pagamentos no dispositivo; o arquivo inclui dados pessoais e deve ficar guardado em local privado. No plano Free, mantenha exportações externas frequentes; os backups diários gerenciados do Supabase ficam disponíveis nos planos Pro, Team e Enterprise, com períodos de retenção diferentes. Os backups do banco não incluem os arquivos do Storage, conforme a [documentação oficial de backups](https://supabase.com/docs/guides/platform/backups).

## O que você encontra no portal Supabase

- **Authentication → Users:** criar e administrar as contas individuais das artistas.
- **SQL Editor:** consultar IDs e adicionar/remover artistas autorizadas. O script inicial já foi executado.
- **Table Editor:** visualizar `commission_status`, pedidos, histórico e recebimentos. Para tarefas diárias, use o painel do site.
- **Project Settings → API Keys:** a chave **publishable** pode ficar no navegador; nunca use a chave **secret** no site.

## Observações

O acompanhamento público usa código ou link. O formulário público recebe pedidos de alteração, cancelamento ou dúvida, que as artistas respondem pelo canal combinado. O backup para baixar é manual; para cópia diária gerenciada, consulte **Database → Backups** no Supabase. O domínio do site e as URLs de redirecionamento precisam corresponder ao endereço publicado.

## Segurança do painel

Uma senha válida e a autorização da conta são suficientes para acessar os dados privados dos pedidos. Mantenham senhas fortes e individuais e não compartilhem contas. A migração substitui apenas as políticas RLS do painel; não apaga pedidos nem usuários.
