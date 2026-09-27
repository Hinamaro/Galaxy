# Portal privado das comissões

## O que já está configurado

- Banco Supabase conectado ao site por URL e chave publicável.
- Tabelas para disponibilidade pública e pedidos privados.
- A disponibilidade começa fechada para não anunciar vagas por engano.
- As regras atuais ainda exigem autenticador de dois fatores. A versão sem autenticador está preparada, mas precisa da confirmação abaixo e da migração `supabase/remove-mfa.sql` antes de publicar o novo painel.

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

Nome, contato e detalhes dos pedidos ficam privados para as artistas. O aviso de disponibilidade aparece publicamente: não coloque nele informação de cliente.

## O que você encontra no portal Supabase

- **Authentication → Users:** criar e administrar as contas individuais das artistas.
- **SQL Editor:** consultar IDs e adicionar/remover artistas autorizadas. O script inicial já foi executado.
- **Table Editor:** visualizar as tabelas `commission_status` e `commission_orders`. Para atualizar o status do dia a dia, use o painel do site.
- **Project Settings → API Keys:** a chave **publishable** pode ficar no navegador; nunca use a chave **secret** no site.

## Observações

O acompanhamento individual por link para os clientes ainda não está disponível. O painel atual é privado e compartilhado pelas artistas. O domínio do site e as URLs de redirecionamento ainda precisam ser configurados quando vocês escolherem onde publicar.

## Segurança sem autenticador

Ao remover o segundo fator, uma senha válida e a autorização da conta passam a ser suficientes para acessar os dados privados dos pedidos. Mantenham senhas fortes e individuais e não compartilhem contas. A migração substitui apenas as políticas RLS do painel; não apaga pedidos nem usuários.
