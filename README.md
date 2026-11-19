# Rifa Tupperware — site com reservas em tempo real

Projeto inicial de uma página responsiva para a rifa de 50 números, com PostgreSQL e Socket.IO.

## O que já está implementado

- Página pública com o flyer e o preço de R$ 15,00.
- Grade interativa de 01 a 50.
- Reserva com nome e telefone.
- Um número reservado deixa de aparecer como disponível para todos os visitantes.
- Sincronização em tempo real com Socket.IO.
- Reservas expiram após 20 minutos, liberando o número automaticamente na próxima consulta.
- Área administrativa protegida por chave: consultar compradores, marcar como vendido ou liberar um número.
- Atualização concorrente protegida no banco: duas pessoas não conseguem reservar o mesmo número ao mesmo tempo.

## Requisitos

- Node.js 20 ou superior.
- PostgreSQL 14 ou superior.

## Rodar localmente

1. Descompacte o projeto.
2. Crie o arquivo `.env` copiando `.env.example`.
3. Ajuste `DATABASE_URL` para seu PostgreSQL e troque `ADMIN_TOKEN` por uma chave longa.
4. Instale as dependências e inicie:

```bash
npm install
npm start
```

Abra `http://localhost:3000`.

### PostgreSQL local com Docker

Se você tiver Docker instalado, pode iniciar somente o banco com:

```bash
docker compose up -d
```

A configuração padrão do `docker-compose.yml` corresponde à `DATABASE_URL` do `.env.example`.

## Publicar na internet

Para funcionar para todos, publique o servidor Node em um serviço de hospedagem e crie um banco PostgreSQL gerenciado. Configure no painel do provedor as variáveis:

- `DATABASE_URL`: string de conexão do PostgreSQL.
- `PGSSL=true`: quando o provedor exigir SSL.
- `ADMIN_TOKEN`: chave administrativa forte e exclusiva.
- `RESERVATION_MINUTES=20`: duração da reserva pendente.
- `PORT`: normalmente definido automaticamente pelo provedor.

Aponte o serviço para este repositório/pasta e use `npm start` como comando de inicialização. O servidor precisa aceitar conexões WebSocket (Socket.IO).

## Como administrar

1. Abra a página publicada.
2. Expanda “Área do responsável pela rifa”.
3. Informe o valor de `ADMIN_TOKEN`.
4. Use “Marcar vendido” após confirmar o pagamento.
5. Use “Liberar” para cancelar uma reserva ou corrigir uma marcação.

## Observações importantes antes de divulgar

- A reserva online é provisória; o pagamento não é processado pelo site.
- Combine com o comprador como será feito o pagamento e a confirmação.
- Não publique o site antes de trocar a chave administrativa.
- Configure HTTPS no provedor de hospedagem.
- Faça um teste com duas janelas/celulares para verificar a sincronização.

## API

- `GET /api/numbers` — lista pública dos números.
- `POST /api/reservations` — solicita reserva.
- `GET /api/admin/numbers` — lista administrativa (Bearer token).
- `PATCH /api/admin/numbers/:number` — marca `sold` ou `available` (Bearer token).
