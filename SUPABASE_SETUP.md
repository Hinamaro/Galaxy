# Portal privado das comissões

## O que já está configurado

- Banco Supabase conectado ao site por URL e chave publicável.
- Tabelas para disponibilidade pública e pedidos privados.
- A disponibilidade começa fechada para não anunciar vagas por engano.
- As políticas do Supabase foram atualizadas: o painel aceita senha para as contas autorizadas, sem pedir autenticador.

## Ativar acompanhamento público e remoção de pedidos

Antes de publicar a versão anterior, o projeto executou `supabase/public-tracking-and-order-delete.sql`: essa atualização gera códigos aleatórios, libera a remoção apenas para artistas autorizadas e permite consultar por código dados limitados do pedido. Contato, nome e resumo não são retornados à página pública.

Para habilitar as melhorias novas, abra **SQL Editor → New query** e execute `supabase/studio-workflow-upgrades.sql` uma vez, depois da migração de códigos/exclusão já executada. Ela adiciona organização por artista, histórico, solicitações privadas, galeria com autorização e inclui previsão/data no acompanhamento. `order-tracking-details.sql` é a versão anterior da parte de previsão e não precisa ser executada separadamente se você executar a migração nova.

## O que falta antes do primeiro acesso

1. No Supabase, abra **Authentication → Users** e crie uma conta individual para cada artista. Não compartilhem a mesma conta.
2. Abra o **SQL Editor** e rode esta consulta para localizar os IDs das contas:

   ```sql
   select id, email from auth.users;
   ```

3. Na mesma área, troque os UUIDs pelos IDs das artistas e execute:

   ```sql
   insert into private.artist_access (user_id)
   values ('UUID-DA-ARTISTA-1'), ('UUID-DA-ARTISTA-2')
   on conflict do nothing;
   ```

   Essa lista é a autorização para entrar no painel. Uma conta não incluída nela não terá acesso aos pedidos.

4. Quando o site tiver um endereço HTTPS, abra **Authentication → URL Configuration** e configure o endereço do site como URL principal e nas URLs de redirecionamento permitidas.
   Inclua também o endereço da página `painel.html` nas URLs permitidas para que o link de recuperação de senha volte ao formulário correto.
5. Publique a pasta do site em um host HTTPS. O Supabase cuida do banco e do login; ele não publica os arquivos HTML do site.

## Como as artistas usam o painel

1. Clique em **Área das artistas** no menu ou rodapé do site para abrir `painel.html`. Entre com o e-mail e a senha da conta individual. Se necessário, use **Esqueci minha senha** para receber um link de recuperação no próprio e-mail.
2. Na versão sem autenticador, basta entrar com e-mail e senha.
3. Em **Disponibilidade das comissões**, escolha abertas, poucas vagas ou fechadas; informe as vagas e um aviso que possa ser público; salve. A página pública de status reflete a mudança.
4. Em **Pedidos**, registre nome, contato, tipo de arte e resumo. Depois, atualize a etapa do pedido no seletor da ficha.
   O painel mostra um código/link e uma mensagem pronta para compartilhar com o cliente; inclui busca, filtros, contagens, avisos de pedidos parados, histórico de etapas, solicitações recebidas, filtro por artista e exportação CSV. A previsão é opcional. Use **Remover pedido** na ficha e confirme para excluir permanentemente.
5. Para publicar uma entrega na galeria, escolha um pedido concluído, envie a imagem e marque a confirmação de autorização expressa do cliente. Trabalhos sem essa confirmação não são aceitos pelo banco.
6. Pedidos podem ser atribuídos a Ynnley ou Bonny. A seleção organiza a fila e os filtros; as duas contas de artista autorizadas continuam vendo a fila compartilhada.

Nome, contato e resumo dos pedidos ficam privados para as artistas. O público só vê a disponibilidade geral e, ao informar o código individual, o tipo de arte, a etapa e a data. Não coloque informação de cliente no aviso público.

## O que você encontra no portal Supabase

- **Authentication → Users:** criar e administrar as contas individuais das artistas.
- **SQL Editor:** consultar IDs e adicionar/remover artistas autorizadas. O script inicial já foi executado.
- **Table Editor:** visualizar as tabelas `commission_status` e `commission_orders`. Para atualizar o status do dia a dia, use o painel do site.
- **Project Settings → API Keys:** a chave **publishable** pode ficar no navegador; nunca use a chave **secret** no site.

## Observações

O acompanhamento individual é feito por código ou link, que a artista compartilha manualmente com o cliente. O formulário público permite enviar pedidos de alteração, cancelamento ou dúvida; a artista responde pelo canal de contato combinado. O painel atual é privado e compartilhado pelas artistas. O domínio do site e as URLs de redirecionamento ainda precisam ser configurados quando vocês escolherem onde publicar.

## Segurança do painel

Uma senha válida e a autorização da conta são suficientes para acessar os dados privados dos pedidos. Mantenham senhas fortes e individuais e não compartilhem contas. A migração substitui apenas as políticas RLS do painel; não apaga pedidos nem usuários.
