require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = Number(process.env.PORT || 3000);
const reservationMinutes = Math.max(5, Number(process.env.RESERVATION_MINUTES || 20));

if (!process.env.DATABASE_URL) {
  console.error("Defina DATABASE_URL no arquivo .env.");
  process.exit(1);
}
if (!process.env.ADMIN_TOKEN || process.env.ADMIN_TOKEN.includes("troque-esta-chave")) {
  console.warn("ATENÇÃO: configure ADMIN_TOKEN com uma chave forte antes de publicar.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS raffle_numbers (
      number INTEGER PRIMARY KEY CHECK (number BETWEEN 1 AND 50),
      status TEXT NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'reserved', 'sold')),
      buyer_name TEXT,
      buyer_phone TEXT,
      reserved_until TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    INSERT INTO raffle_numbers (number)
    SELECT generate_series(1, 50)
    ON CONFLICT (number) DO NOTHING;
  `);
}

async function releaseExpiredReservations() {
  const result = await pool.query(`
    UPDATE raffle_numbers
    SET status = 'available', buyer_name = NULL, buyer_phone = NULL,
        reserved_until = NULL, updated_at = NOW()
    WHERE status = 'reserved' AND reserved_until <= NOW()
    RETURNING number;
  `);
  if (result.rowCount) io.emit("numbers:updated");
  return result.rowCount;
}

async function getNumbers() {
  await releaseExpiredReservations();
  const { rows } = await pool.query(`
    SELECT number, status,
           CASE WHEN status = 'reserved' THEN reserved_until ELSE NULL END AS reserved_until
    FROM raffle_numbers ORDER BY number;
  `);
  return rows;
}

function requireAdmin(req, res, next) {
  const token = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: "Chave administrativa inválida." });
  }
  next();
}

app.get("/api/numbers", async (_req, res) => {
  try {
    res.json(await getNumbers());
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Não foi possível carregar os números." });
  }
});

app.post("/api/reservations", async (req, res) => {
  const number = Number(req.body.number);
  const name = String(req.body.name || "").trim().slice(0, 100);
  const phone = String(req.body.phone || "").trim().slice(0, 30);

  if (!Number.isInteger(number) || number < 1 || number > 50) {
    return res.status(400).json({ error: "Escolha um número válido entre 01 e 50." });
  }
  if (name.length < 2 || phone.length < 8) {
    return res.status(400).json({ error: "Informe seu nome e um telefone válido." });
  }

  try {
    await releaseExpiredReservations();
    const { rows } = await pool.query(`
      UPDATE raffle_numbers
      SET status = 'reserved', buyer_name = $2, buyer_phone = $3,
          reserved_until = NOW() + ($4 * INTERVAL '1 minute'), updated_at = NOW()
      WHERE number = $1
        AND (status = 'available' OR (status = 'reserved' AND reserved_until <= NOW()))
      RETURNING number, status, reserved_until;
    `, [number, name, phone, reservationMinutes]);

    if (!rows.length) {
      return res.status(409).json({ error: "Esse número não está mais disponível. Atualize a página e escolha outro." });
    }
    io.emit("numbers:updated");
    res.status(201).json({
      message: `Número ${String(number).padStart(2, "0")} reservado por ${reservationMinutes} minutos. Aguarde a confirmação do responsável.`,
      reservation: rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Não foi possível realizar a reserva." });
  }
});

app.get("/api/admin/numbers", requireAdmin, async (_req, res) => {
  try {
    await releaseExpiredReservations();
    const { rows } = await pool.query(`
      SELECT number, status, buyer_name, buyer_phone, reserved_until, updated_at
      FROM raffle_numbers ORDER BY number;
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao carregar painel administrativo." });
  }
});

app.patch("/api/admin/numbers/:number", requireAdmin, async (req, res) => {
  const number = Number(req.params.number);
  const status = req.body.status;
  if (!Number.isInteger(number) || number < 1 || number > 50 ||
      !["available", "sold"].includes(status)) {
    return res.status(400).json({ error: "Número ou status inválido." });
  }
  try {
    const { rows } = await pool.query(`
      UPDATE raffle_numbers
      SET status = $2,
          buyer_name = CASE WHEN $2 = 'available' THEN NULL ELSE buyer_name END,
          buyer_phone = CASE WHEN $2 = 'available' THEN NULL ELSE buyer_phone END,
          reserved_until = NULL, updated_at = NOW()
      WHERE number = $1
      RETURNING number, status;
    `, [number, status]);
    if (!rows.length) return res.status(404).json({ error: "Número não encontrado." });
    io.emit("numbers:updated");
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Não foi possível atualizar o número." });
  }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

io.on("connection", socket => {
  socket.emit("connected", { ok: true });
});

initializeDatabase()
  .then(() => {
    server.listen(port, () => console.log(`Rifa disponível em http://localhost:${port}`));
  })
  .catch(error => {
    console.error("Falha ao inicializar o banco de dados:", error);
    process.exit(1);
  });
