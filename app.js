/* =========================================================
   デュエマ管理 app.js
========================================================= */

// =========================
// Supabase
// =========================
const SUPABASE_URL = "https://ckbzdrngzpcjufzowvsl.supabase.co";
const SUPABASE_KEY = "YOUR_SUPABASE_KEY";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// =========================
// 状態
// =========================
let cards = [];
let collection = {};
let currentCard = null;
let activeTab = "collection";

// =========================
// 起動
// =========================
window.addEventListener("DOMContentLoaded", init);

async function init() {
  console.log("init start");

  // cards.json 読み込み
  try {
    const res = await fetch("./data/cards.json");

    if (!res.ok) {
      throw new Error(`cards.json load failed : ${res.status}`);
    }

    cards = await res.json();

    console.log("cards loaded:", cards.length);

    render(cards);
    updateHeader();

  } catch (err) {
    console.error(err);

    document.getElementById("cardTable").innerHTML = `
      <tr>
        <td colspan="4" style="padding:20px;color:red;">
          cards.json の読み込みに失敗
        </td>
      </tr>
    `;
  }
}

// =========================
// 描画
// =========================
function render(list) {

  const tbody = document.getElementById("cardTable");

  tbody.innerHTML = "";

  if (!list || list.length === 0) {

    tbody.innerHTML = `
      <tr>
        <td colspan="4">カードがありません</td>
      </tr>
    `;

    return;
  }

  list.forEach(card => {

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${escapeHtml(card.name || "")}</td>
      <td>${(card.civilizations || []).join(" / ")}</td>
      <td>${card.cost ?? "-"}</td>
      <td>${collection[card.id]?.count || 0}</td>
    `;

    tr.addEventListener("click", () => {
      showDetail(card);
    });

    tbody.appendChild(tr);
  });

  document.getElementById("resultCount").textContent =
    `${list.length} 件`;
}

// =========================
// 詳細表示
// =========================
function showDetail(card) {

  currentCard = card;

  const detail = document.getElementById("detail");

  const imgHtml = card.image
    ? `<img src="${card.image}" style="width:100%;border-radius:8px;">`
    : `<div>画像なし</div>`;

  detail.innerHTML = `
    <div class="detail-card">

      ${imgHtml}

      <h2>${escapeHtml(card.name)}</h2>

      <p><strong>ID:</strong> ${card.id}</p>

      <p>
        <strong>文明:</strong>
        ${(card.civilizations || []).join(" / ")}
      </p>

      <p>
        <strong>コスト:</strong>
        ${card.cost}
      </p>

      <p>
        <strong>種族:</strong>
        ${(card.races || []).join(" / ")}
      </p>

    </div>
  `;
}

// =========================
// タブ切替
// =========================
function switchTab(tab) {

  activeTab = tab;

  document.querySelectorAll(".tab-btn")
    .forEach(btn => btn.classList.remove("active"));

  const target = document.querySelector(
    `.tab-btn[data-tab="${tab}"]`
  );

  if (target) {
    target.classList.add("active");
  }

  render(cards);
}

// =========================
// ヘッダー
// =========================
function updateHeader() {

  document.getElementById("totalCount").textContent =
    `カード ${cards.length} 件`;
}

// =========================
// スマホ
// =========================
function showMobileTab(tab) {

  document.querySelectorAll(".mobile-nav-btn")
    .forEach(btn => btn.classList.remove("active"));

  if (event?.currentTarget) {
    event.currentTarget.classList.add("active");
  }

  if (tab === "filter") {
    document
      .getElementById("mobileFilterPanel")
      .classList.add("open");
  } else {
    closeMobileFilter();
  }
}

function closeMobileFilter() {
  document
    .getElementById("mobileFilterPanel")
    .classList.remove("open");
}

function closeMobileModal() {
  document
    .getElementById("mobileModal")
    .classList.remove("open");
}

// =========================
// util
// =========================
function escapeHtml(str) {

  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}