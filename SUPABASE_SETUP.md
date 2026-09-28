# Portal privado das comissões

## O que já está configurado

- Banco Supabase conectado ao site por URL e chave publicável.
- Tabelas para disponibilidade pública e pedidos privados.
- A disponibilidade começa fechada para não anunciar vagas por engano.
- As políticas do Supabase foram atualizadas: o painel aceita senha para as contas autorizadas, sem pedir autenticador.

## Ativar acompanhamento público e remoção de pedidos

Antes de publicar a versão anterior, o projeto executou `supabase/public-tracking-and-order-delete.sql`: essa atualização gera códigos aleatórios, libera a remoção apenas para artistas autorizadas e permite consultar por código dados limitados do pedido. Contato, nome e resumo não são retornados à página pública.

Para habilitar os recursos já preparados, abra **SQL Editor → New query** e execute, nesta ordem, `supabase/studio-workflow-upgrades.sql` e depois `supabase/business-tools.sql`. Faça isso uma vez, depois da migração de códigos/exclusão já executada. A primeira cria histórico, solicitações e galeria autorizada; a segunda cria acesso por artista, pagamentos e campos de comunicação. `order-tracking-details.sql` é uma versão anterior da previsão e não precisa ser executada separadamente.

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
4. Em **Pedidos**, registre nome, contato, tipo de arte e resumo. Se o cliente autorizar, inclua o e-mail e marque a autorização para avisos. Registre também o valor combinado, se já souber. Depois, atualize a etapa do pedido no seletor da ficha.
   O painel mostra um código/link e uma mensagem pronta para compartilhar com o cliente; inclui busca, filtros, contagens, avisos de pedidos parados, histórico de etapas, solicitações recebidas, filtro por artista e exportação CSV. A previsão é opcional. Use **Remover pedido** na ficha e confirme para excluir permanentemente.
5. Para publicar uma entrega na galeria, escolha um pedido concluído, envie a imagem e marque a confirmação de autorização expressa do cliente. Trabalhos sem essa confirmação não são aceitos pelo banco.
6. Em cada ficha, registre recebimentos parciais com valor, data e forma. O resumo financeiro permite escolher o mês e mostra o que entrou, quantos pedidos chegaram e o saldo dos pedidos ativos. Valores não são públicos.

7. Quando uma etapa muda, o painel tenta enviar um e-mail automático somente se o cliente autorizou e foi informado um endereço válido. Veja a seção **Ativar avisos automáticos por e-mail** abaixo; sem ela, a atualização continua salva e vocês podem usar **Copiar mensagem** para avisar manualmente.

Nome, contatos, resumo e pagamentos ficam privados. Cada conta vinculada a Ynnley ou Bonny só consulta os pedidos atribuídos a ela; a conta de gestão pode ver as duas filas. O público só vê disponibilidade geral e, ao informar o código individual, o tipo de arte, a etapa e a data. Não coloque informação de cliente no aviso público.

## Ativar avisos automáticos por e-mail

O código do envio está em `supabase/functions/notify-order-status/index.ts`. É necessário implantar essa função no Supabase, criar uma chave em um provedor de envio de e-mail e configurar um domínio/remetente autorizado por esse provedor. No painel Supabase, abra **Edge Functions → Deploy a new function → Via Editor**, crie a função com o nome `notify-order-status` e copie o conteúdo desse arquivo para o editor. O Supabase também documenta implantação de funções pelo Dashboard e a configuração de segredos [na documentação de Edge Functions](https://supabase.com/docs/guides/functions/quickstart-dashboard).

Depois, abra **Edge Functions → Secrets** e cadastre `RESEND_API_KEY`, `MAIL_FROM` (remetente verificado, por exemplo `Zoolixianas <avisos@seudominio.com>`) e `SITE_URL` (endereço HTTPS publicado, sem barra final). Não coloque a chave do provedor no HTML, em `backend-config.js` ou no Git. O código usa o token da sessão da artista para respeitar as políticas de acesso do pedido.

Na criação do pedido, informe o e-mail apenas se a pessoa autorizar receber atualizações. Cada mudança de etapa dispara um aviso com a etapa e o link público de acompanhamento. Se o envio falhar, o painel avisa, mantém a etapa salva e deixa a mensagem manual disponível. Teste com um endereço da equipe antes de ativar para clientes.

## Pagamentos e cópias de segurança

Os recebimentos são lançamentos internos e podem ser corrigidos ou removidos na ficha. O botão **Backup completo (.JSON)** baixa pedidos, histórico e pagamentos no dispositivo; o arquivo inclui dados pessoais e deve ficar guardado em local privado. No plano Free, mantenha exportações externas frequentes; os backups diários gerenciados do Supabase ficam disponíveis nos planos Pro, Team e Enterprise, com períodos de retenção diferentes. Os backups do banco não incluem os arquivos do Storage, conforme a [documentação oficial de backups](https://supabase.com/docs/guides/platform/backups).

## O que você encontra no portal Supabase

- **Authentication → Users:** criar e administrar as contas individuais das artistas.
- **SQL Editor:** consultar IDs e adicionar/remover artistas autorizadas. O script inicial já foi executado.
- **Table Editor:** visualizar `commission_status`, pedidos, histórico e recebimentos. Para tarefas diárias, use o painel do site.
- **Project Settings → API Keys:** a chave **publishable** pode ficar no navegador; nunca use a chave **secret** no site.

## Observações

O acompanhamento público usa código ou link. O formulário público recebe pedidos de alteração, cancelamento ou dúvida, que as artistas respondem pelo canal combinado. O backup para baixar é manual; para cópia diária gerenciada, consulte **Database → Backups** no Supabase. O domínio do site e as URLs de redirecionamento precisam corresponder ao endereço publicado.

## Segurança do painel

Uma senha válida e a autorização da conta são suficientes para acessar os dados privados dos pedidos. Mantenham senhas fortes e individuais e não compartilhem contas. A migração substitui apenas as políticas RLS do painel; não apaga pedidos nem usuários.
