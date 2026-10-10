import { URL } from "node:url";
import { connect, games, isReady, mapGame, toId, users } from "./db.js";
import { createApp, readJson, sendEmpty, sendJson, serveStatic } from "./http.js";
import { getUserFromRequest, hashPassword, signToken, verifyPassword } from "./middleware/auth.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
function usernameQuery(username) { return new RegExp("^" + username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"); }
function requireUser(req, res) { const user = getUserFromRequest(req); if (!user) { sendJson(res, 401, { error: "No autenticado" }); return null; } return user; }

const server = createApp(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;
  const method = req.method || "GET";
  if (pathname === "/health") return sendJson(res, 200, { ok: true, db: isReady() });
  if (pathname.startsWith("/api/") && !isReady()) return sendJson(res, 503, { error: "Base no lista" });
  if (!pathname.startsWith("/api/")) return serveStatic(req, res);

  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!USERNAME_RE.test(username)) return sendJson(res, 400, { error: "Usuario: 3-20 caracteres, letras, numeros y _" });
    if (password.length < 6) return sendJson(res, 400, { error: "La contrasena debe tener al menos 6 caracteres" });
    if (await users().findOne({ username: usernameQuery(username) })) return sendJson(res, 409, { error: "Ese usuario ya existe" });
    const result = await users().insertOne({ username, passwordHash: hashPassword(password), createdAt: new Date() });
    const user = { id: String(result.insertedId), username };
    return sendJson(res, 201, { user, token: signToken(user) });
  }
  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const row = await users().findOne({ username: usernameQuery(username) });
    if (!row || !verifyPassword(String(body.password || ""), row.passwordHash)) return sendJson(res, 401, { error: "Usuario o contrasena incorrectos" });
    const user = { id: String(row._id), username: row.username };
    return sendJson(res, 200, { user, token: signToken(user) });
  }
  if (method === "GET" && pathname === "/api/auth/me") {
    const user = requireUser(req, res);
    if (!user) return;
    return sendJson(res, 200, { user });
  }

  const user = requireUser(req, res);
  if (!user) return;
  const userId = user.id;

  if (method === "GET" && pathname === "/api/games") {
    const rows = await games().find({ userId }).sort({ createdAt: -1 }).limit(20).toArray();
    return sendJson(res, 200, { games: rows.map(mapGame) });
  }
  if (method === "POST" && pathname === "/api/games") {
    const body = await readJson(req);
    const name = String(body.name || "Partida").trim();
    const result = await games().insertOne({ userId, name: name.slice(0, 40), fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR", turn: "w", moves: [], createdAt: new Date() });
    return sendJson(res, 201, { game: mapGame(await games().findOne({ _id: result.insertedId })) });
  }
  const move = pathname.match(/^\/api\/games\/([a-fA-F0-9]{24})\/move$/);
  if (move && method === "POST") {
    const body = await readJson(req);
    const from = String(body.from || "").trim();
    const to = String(body.to || "").trim();
    if (!from || !to) return sendJson(res, 400, { error: "Casillas obligatorias" });
    const row = await games().findOne({ _id: toId(move[1]), userId });
    if (!row) return sendJson(res, 404, { error: "Partida no encontrada" });
    const nextTurn = row.turn === "w" ? "b" : "w";
    await games().updateOne({ _id: row._id }, { $set: { turn: nextTurn, fen: body.fen || row.fen }, $push: { moves: `${from}-${to}` } });
    return sendJson(res, 200, { game: mapGame(await games().findOne({ _id: row._id })) });
  }
  const del = pathname.match(/^\/api\/games\/([a-fA-F0-9]{24})$/);
  if (del && method === "DELETE") {
    const result = await games().deleteOne({ _id: toId(del[1]), userId });
    if (!result.deletedCount) return sendJson(res, 404, { error: "Partida no encontrada" });
    return sendEmpty(res, 204);
  }
  sendJson(res, 404, { error: "Ruta no encontrada" });
});

server.listen(PORT, HOST, () => console.log(`Ajedrez en http://${HOST}:${PORT}`));
async function bootDb() { for (;;) { try { await connect(); return; } catch (err) { console.error("Mongo no disponible:", err.message); await new Promise((resolve) => setTimeout(resolve, 5000)); } } }
bootDb();
