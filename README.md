# Site de Comissões de Arte

Primeira versão do portfólio de comissões em português.

## Estrutura

- `index.html` — página inicial
- `gallery.html` — galeria com filtros e modal
- `commissions.html` — serviços e preços
- `about.html` — sobre o artista
- `contact.html` — formulário de solicitação
- `css/` — estilos
- `js/` — funcionalidades
- `data/` — dados editáveis
- `assets/` — logo, banners e artes
- `assets/branding/share-card.jpg` — cartão de prévia para links e download para redes sociais
- `api/share.js` — prévia com o título da obra ao compartilhar links individuais (função Vercel)

O endpoint `api/share.js` precisa ser publicado pelo Vercel junto com o restante do projeto para que os links individuais da galeria mostrem o título da obra nos aplicativos de mensagem.

## Próximos passos

1. Substituir `assets/hero/` pelos banners reais.
2. Substituir os placeholders da galeria pelas artes.
3. Definir nome/logo e redes sociais.
4. Alterar os preços `R$ XX`.
5. Conectar o formulário a e-mail, Discord ou banco de dados.
