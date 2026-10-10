import { api, setSession, clearSession, getToken } from "./api.js";
const authView = document.querySelector("#auth-view");
const appView = document.querySelector("#app-view");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");
const authSubmit = document.querySelector("#auth-submit");
const listEl = document.querySelector("#list");
const form = document.querySelector("#game-form");
const formError = document.querySelector("#form-error");
let mode = "login";
const showError = (el, message) => { el.hidden = !message; el.textContent = message || ""; };
const PIECES = { r:"\u265c", n:"\u265e", b:"\u265d", q:"\u265b", k:"\u265a", p:"\u265f", R:"\u2656", N:"\u2658", B:"\u2657", Q:"\u2655", K:"\u2654", P:"\u2659" };

function parseFen(fen) {
  const board = [];
  const rows = fen.split(" ")[0].split("/");
  rows.forEach((row) => {
    const line = [];
    for (const c of row) {
      if (/\d/.test(c)) for (let i = 0; i < Number(c); i++) line.push("");
      else line.push(c);
    }
    board.push(line);
  });
  return board;
}

function setMode(next) {
  mode = next;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  authSubmit.textContent = mode === "login" ? "Entrar" : "Crear cuenta";
}
async function refresh() {
  const data = await api("/api/games");
  listEl.innerHTML = "";
  data.games.forEach((g) => {
    const box = document.createElement("div");
    box.className = "game";
    const title = document.createElement("div");
    title.innerHTML = `<strong>${g.name}</strong> \u00b7 turno ${g.turn === "w" ? "blancas" : "negras"}`;
    box.append(title);
    const boardEl = document.createElement("div");
    boardEl.className = "board";
    const board = parseFen(g.fen);
    let selected = null;
    board.forEach((row, r) => {
      row.forEach((cell, c) => {
        const sq = document.createElement("div");
        sq.className = "sq " + ((r + c) % 2 === 0 ? "light" : "dark");
        sq.textContent = PIECES[cell] || "";
        sq.dataset.pos = `${r}${c}`;
        sq.addEventListener("click", async () => {
          if (!selected) { selected = sq; sq.classList.add("selected"); return; }
          const from = selected.dataset.pos;
          const to = sq.dataset.pos;
          selected.classList.remove("selected");
          selected = null;
          if (from === to) return;
          await api(`/api/games/${g.id}/move`, { method: "POST", body: JSON.stringify({ from, to, fen: g.fen }) });
          await refresh();
        });
        boardEl.append(sq);
      });
    });
    box.append(boardEl);
    const del = document.createElement("button");
    del.className = "ghost";
    del.textContent = "Borrar";
    del.addEventListener("click", async () => { await api(`/api/games/${g.id}`, { method: "DELETE" }); await refresh(); });
    box.append(del);
    listEl.append(box);
  });
}
async function boot() {
  if (!getToken()) return;
  try {
    const { user } = await api("/api/auth/me");
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    document.querySelector("#user-name").textContent = user.username;
    await refresh();
  } catch { clearSession(); }
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(authError, "");
  const fd = new FormData(authForm);
  try {
    const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", { method: "POST", body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }) });
    setSession(data.token);
    authForm.reset();
    await boot();
  } catch (err) { showError(authError, err.message); }
});
document.querySelector("#logout").addEventListener("click", () => { clearSession(); appView.classList.add("hidden"); authView.classList.remove("hidden"); });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(formError, "");
  try {
    await api("/api/games", { method: "POST", body: JSON.stringify({ name: document.querySelector("#name").value.trim() || "Partida" }) });
    form.reset();
    await refresh();
  } catch (err) { showError(formError, err.message); }
});
boot();
