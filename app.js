/* ====================================================
   デュエマ所持管理 — app.js
   ==================================================== */

// ★ここを自分のSupabaseの情報に書き換えてください
const SUPABASE_URL = "https://ここにProject_URLを貼り付ける";
const SUPABASE_KEY = "ここにanon_public_keyを貼り付ける";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

let cards      = [];
let collection = {};  // { id: { count, memo } }
let lists      = {};  // { name: [id, ...] }
let decks      = {};  // { name: { memo, cards: { id: count } } }

let currentCard = null;
let currentList = null;
let currentDeck = null;
let activeTab   = "collection";

const modeState = {
  nameMode: "OR",
  raceMode: "OR",
  memoMode: "OR"
};

// ================================================================
// 起動
// ================================================================
async function init() {

  console.log("init start");

  const [colRes, listRes, deckRes] = await Promise.all([
    db.from("collection").select("*"),
    db.from("lists").select("*"),
    db.from("decks").select("*"),
  ]);

  console.log("collection:", colRes);
  console.log("lists:", listRes);
  console.log("decks:", deckRes);

  if (!colRes.error && colRes.data) {
    colRes.data.forEach(r => {
      collection[r.id] = {
        count: r.count,
        memo: r.memo
      };
    });
  }

  if (!listRes.error && listRes.data) {
    listRes.data.forEach(r => {
      lists[r.name] = r.card_ids || [];
    });
  }

  if (!deckRes.error && deckRes.data) {
    deckRes.data.forEach(r => {
      decks[r.name] = {
        memo: r.memo || "",
        cards: r.cards || {}
      };
    });
  }

  fetch("./data/cards.json")
    .then(r => {
      console.log("cards.json status:", r.status);

      if (!r.ok) {
        throw new Error("cards.json が見つかりません");
      }

      return r.json();
    })
    .then(data => {

      console.log("cards loaded:", data.length);

      cards = data.map(card => {

        if (!card.image) {

          const set = (card.set || "").toLowerCase();
          const num = card.number || card.id || "";

          card.image =
            `data/images/${set}-${num}.jpg`;
        }

        return {
          ...card,
          civilizations: card.civilizations || [],
          races: card.races || [],
          cost: Number(card.cost || 0)
        };
      });

      renderSidebar();
      applyFilter();
      updateHeader();
    })
    .catch(err => {

      console.error(err);

      document.getElementById("cardTable").innerHTML = `
        <tr>
          <td colspan="4" style="color:#e85d3a;padding:20px">
            ⚠️ ${err.message}
          </td>
        </tr>
      `;
    });
}

// ================================================================
// Supabase 保存
// ================================================================
async function saveCollection(id) {

  const d = collection[id] || {
    count: 0,
    memo: ""
  };

  const res = await db.from("collection").upsert({
    id,
    count: d.count,
    memo: d.memo
  });

  console.log("saveCollection:", res);
}

async function saveList(name) {

  const res = await db.from("lists").upsert({
    name,
    card_ids: lists[name] || []
  });

  console.log("saveList:", res);
}

async function saveDeck(name) {

  const d = decks[name] || {
    memo: "",
    cards: {}
  };

  const res = await db.from("decks").upsert({
    name,
    memo: d.memo,
    cards: d.cards
  });

  console.log("saveDeck:", res);
}

// ================================================================
// タブ切り替え
// ================================================================
function switchTab(tab) {

  activeTab = tab;

  document.querySelectorAll(".tab-btn").forEach(b => {
    b.classList.remove("active");
  });

  const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);

  if (btn) {
    btn.classList.add("active");
  }

  currentList = null;
  currentDeck = null;

  renderSidebar();
  applyFilter();
}

// ================================================================
// サイドバー描画
// ================================================================
function renderSidebar() {

  const el = document.getElementById("sidebarContent");

  if (!el) return;

  el.innerHTML =
    activeTab === "collection"
      ? renderCollectionSidebarHTML()
      : renderDeckSidebarHTML();

  bindFilterEvents();

  const mfb = document.getElementById("mobileFilterBody");

  if (mfb) {
    mfb.innerHTML = renderFilterHTML();
    bindFilterEvents();
  }
}

// ================================================================
// 所持サイドバー
// ================================================================
function renderCollectionSidebarHTML() {

  return `
    <h3>📦 所持リスト</h3>

    <div class="list-tab ${currentList===null?'active':''}"
      onclick="switchList(null)">
      📋 全カード
    </div>

    ${Object.keys(lists).map(n => `
      <div class="list-tab ${currentList===n?'active':''}"
        onclick="switchList('${escAttr(n)}')">

        📁 ${escHtml(n)}

        <span class="list-delete"
          onclick="event.stopPropagation();removeList('${escAttr(n)}')">
          ✕
        </span>
      </div>
    `).join("")}

    <div class="list-add">
      <input type="text"
        id="newListName"
        placeholder="新しいリスト名">

      <button onclick="addList()">＋</button>
    </div>

    <hr style="border-color:#2e3350;margin:12px 0">

    <h3>🔍 絞り込み</h3>

    ${renderFilterHTML()}

    <button class="btn-search" onclick="applyFilter()">検索</button>
    <button class="btn-reset" onclick="resetFilter()">リセット</button>

    <div class="stats-box" id="statsBox"></div>
  `;
}

// ================================================================
// デッキサイドバー
// ================================================================
function renderDeckSidebarHTML() {

  return `
    <h3>🃏 デッキ</h3>

    <div class="list-tab ${currentDeck===null?'active':''}"
      onclick="switchDeck(null)">
      📋 全カード表示
    </div>

    ${Object.keys(decks).map(n => `
      <div class="list-tab ${currentDeck===n?'active':''}"
        onclick="switchDeck('${escAttr(n)}')">

        🃏 ${escHtml(n)}

        <span class="list-delete"
          onclick="event.stopPropagation();removeDeck('${escAttr(n)}')">
          ✕
        </span>
      </div>
    `).join("")}

    <div class="list-add">
      <input type="text"
        id="newDeckName"
        placeholder="新しいデッキ名">

      <button onclick="addDeck()">＋</button>
    </div>

    <hr style="border-color:#2e3350;margin:12px 0">

    <h3>🔍 絞り込み</h3>

    ${renderFilterHTML()}

    <button class="btn-search" onclick="applyFilter()">検索</button>
    <button class="btn-reset" onclick="resetFilter()">リセット</button>

    <div class="stats-box" id="statsBox"></div>
  `;
}

// ================================================================
// フィルター
// ================================================================
function renderFilterHTML() {

  return `
    <div class="filter-block">

      <label class="filter-label">カード名</label>

      <input type="text"
        class="name-input"
        placeholder="カード検索">

    </div>

    <div class="filter-block">

      <label class="toggle-label">
        <input type="checkbox" id="ownedOnly">
        所持カードのみ
      </label>

    </div>

    <div class="filter-block">

      <label class="filter-label">並び替え</label>

      <select id="sortSelect">
        <option value="name">名前順</option>
        <option value="cost_asc">コスト昇順</option>
        <option value="cost_desc">コスト降順</option>
        <option value="count">所持枚数順</option>
      </select>

    </div>
  `;
}

// ================================================================
// フィルターイベント
// ================================================================
function bindFilterEvents() {

  document.querySelectorAll(
    ".name-input,#ownedOnly,#sortSelect"
  ).forEach(el => {

    el.addEventListener("input", applyFilter);
    el.addEventListener("change", applyFilter);
  });
}

// ================================================================
// フィルター適用
// ================================================================
function applyFilter() {

  const ownedOnly =
    document.getElementById("ownedOnly")?.checked || false;

  const sort =
    document.getElementById("sortSelect")?.value || "name";

  const keyword =
    document.querySelector(".name-input")?.value?.trim() || "";

  let base = cards;

  if (activeTab === "collection" && currentList !== null) {
    base = cards.filter(c =>
      lists[currentList]?.includes(c.id)
    );
  }

  if (activeTab === "deck" && currentDeck !== null) {
    base = cards.filter(c =>
      (decks[currentDeck]?.cards[c.id] || 0) > 0
    );
  }

  let filtered = base.filter(card => {

    if (
      keyword &&
      !card.name.includes(keyword)
    ) {
      return false;
    }

    if (
      ownedOnly &&
      !((collection[card.id] || {}).count > 0)
    ) {
      return false;
    }

    return true;
  });

  filtered.sort((a, b) => {

    if (sort === "cost_asc") {
      return a.cost - b.cost;
    }

    if (sort === "cost_desc") {
      return b.cost - a.cost;
    }

    if (sort === "count") {
      return (
        ((collection[b.id] || {}).count || 0)
        -
        ((collection[a.id] || {}).count || 0)
      );
    }

    return a.name.localeCompare(b.name, "ja");
  });

  render(filtered);

  document.getElementById("resultCount").textContent =
    `${filtered.length} 件`;
}

// ================================================================
// テーブル描画
// ================================================================
function render(list) {

  const tbody = document.getElementById("cardTable");

  tbody.innerHTML = "";

  if (list.length === 0) {

    tbody.innerHTML = `
      <tr>
        <td colspan="4"
          style="text-align:center;padding:30px;color:#6b7399">
          該当するカードがありません
        </td>
      </tr>
    `;

    return;
  }

  list.forEach(card => {

    const colData =
      collection[card.id] || {
        count: 0,
        memo: ""
      };

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td class="col-name">${escHtml(card.name)}</td>

      <td class="col-civ">
        ${civBadges(card.civilizations)}
      </td>

      <td class="col-cost">
        ${card.cost}
      </td>

      <td class="col-count">

        <div class="count-ctrl">

          <button class="count-btn minus"
            onclick="event.stopPropagation();changeCount('${escAttr(card.id)}',-1)">
            −
          </button>

          <span class="count-val">
            ${colData.count}
          </span>

          <button class="count-btn plus"
            onclick="event.stopPropagation();changeCount('${escAttr(card.id)}',1)">
            ＋
          </button>

        </div>

      </td>
    `;

    tr.addEventListener("click", () => {

      if (window.innerWidth <= 768) {
        showMobileDetail(card);
      } else {
        showDetail(card);
      }
    });

    tbody.appendChild(tr);
  });
}

// ================================================================
// 詳細
// ================================================================
function showDetail(card) {

  currentCard = card;

  const colData =
    collection[card.id] || {
      count: 0,
      memo: ""
    };

  const imgHtml = card.image
    ? `
      <img src="${escAttr(card.image)}"
        alt="${escAttr(card.name)}">
    `
    : `
      <div class="no-image">画像なし</div>
    `;

  document.getElementById("detail").innerHTML = `
    <div class="detail-card">

      ${imgHtml}

      <h3>${escHtml(card.name)}</h3>

      <div class="detail-row">
        <span class="detail-key">文明</span>
        <span class="detail-val">
          ${civBadges(card.civilizations)}
        </span>
      </div>

      <div class="detail-row">
        <span class="detail-key">コスト</span>
        <span class="detail-val">${card.cost}</span>
      </div>

      <div class="detail-row">
        <span class="detail-key">所持枚数</span>

        <span class="detail-val">

          <div class="count-ctrl">

            <button class="count-btn minus"
              onclick="changeCount('${escAttr(card.id)}',-1)">
              −
            </button>

            <span class="count-val">
              ${colData.count}
            </span>

            <button class="count-btn plus"
              onclick="changeCount('${escAttr(card.id)}',1)">
              ＋
            </button>

          </div>

        </span>
      </div>

    </div>
  `;
}

// ================================================================
// スマホ詳細
// ================================================================
function showMobileDetail(card) {

  showDetail(card);

  document.getElementById("mobileModal").classList.add("open");

  document.getElementById("mobileModalContent").innerHTML =
    document.getElementById("detail").innerHTML;
}

function closeMobileModal() {

  document.getElementById("mobileModal").classList.remove("open");
}

// ================================================================
// 枚数変更
// ================================================================
async function changeCount(id, delta) {

  if (!collection[id]) {

    collection[id] = {
      count: 0,
      memo: ""
    };
  }

  collection[id].count =
    Math.max(
      0,
      (collection[id].count || 0) + delta
    );

  await saveCollection(id);

  applyFilter();

  if (currentCard?.id === id) {
    showDetail(currentCard);
  }

  updateHeader();
}

// ================================================================
// リスト操作
// ================================================================
function switchList(name) {

  currentList = name;

  renderSidebar();

  applyFilter();
}

async function addList() {

  const input =
    document.getElementById("newListName");

  const name =
    input.value.trim();

  if (!name) return;

  if (lists[name] !== undefined) return;

  lists[name] = [];

  await saveList(name);

  input.value = "";

  renderSidebar();
}

async function removeList(name) {

  if (!confirm(`「${name}」を削除しますか？`)) {
    return;
  }

  delete lists[name];

  await db.from("lists")
    .delete()
    .eq("name", name);

  if (currentList === name) {
    currentList = null;
  }

  renderSidebar();

  applyFilter();
}

// ================================================================
// デッキ操作
// ================================================================
function switchDeck(name) {

  currentDeck = name;

  renderSidebar();

  applyFilter();
}

async function addDeck() {

  const input =
    document.getElementById("newDeckName");

  const name =
    input.value.trim();

  if (!name) return;

  if (decks[name] !== undefined) return;

  decks[name] = {
    memo: "",
    cards: {}
  };

  await saveDeck(name);

  input.value = "";

  renderSidebar();
}

async function removeDeck(name) {

  if (!confirm(`「${name}」を削除しますか？`)) {
    return;
  }

  delete decks[name];

  await db.from("decks")
    .delete()
    .eq("name", name);

  if (currentDeck === name) {
    currentDeck = null;
  }

  renderSidebar();

  applyFilter();
}

// ================================================================
// ヘッダー
// ================================================================
function updateHeader() {

  const total =
    Object.values(collection)
      .reduce((s, v) => s + (v.count || 0), 0);

  const kinds =
    Object.values(collection)
      .filter(v => v.count > 0)
      .length;

  document.getElementById("totalCount").textContent =
    `所持: ${kinds} 種 / ${total} 枚`;
}

// ================================================================
// リセット
// ================================================================
function resetFilter() {

  document.querySelectorAll(".name-input")
    .forEach(el => el.value = "");

  const owned =
    document.getElementById("ownedOnly");

  if (owned) {
    owned.checked = false;
  }

  const sort =
    document.getElementById("sortSelect");

  if (sort) {
    sort.value = "name";
  }

  applyFilter();
}

// ================================================================
// スマホ
// ================================================================
function showMobileTab(tab) {

  document.querySelectorAll(".mobile-nav-btn")
    .forEach(b => b.classList.remove("active"));

  if (event?.currentTarget) {
    event.currentTarget.classList.add("active");
  }

  document.getElementById("mobileFilterPanel")
    .classList.remove("open");

  if (tab === "filter") {

    document.getElementById("mobileFilterPanel")
      .classList.add("open");

    const mfb =
      document.getElementById("mobileFilterBody");

    if (mfb) {

      mfb.innerHTML = renderFilterHTML();

      bindFilterEvents();
    }
  }
}

function closeMobileFilter() {

  document.getElementById("mobileFilterPanel")
    .classList.remove("open");
}

// ================================================================
// ユーティリティ
// ================================================================
function civBadges(civs) {

  return (civs || []).map(c => `
    <span class="civ-badge civ-${c}">
      ${escHtml(c)}
    </span>
  `).join("");
}

function escHtml(str) {

  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(str) {

  return String(str || "")
    .replace(/'/g, "\\'");
}

document.getElementById("mobileModal")
  .addEventListener("click", function(e) {

    if (e.target === this) {
      closeMobileModal();
    }
  });

init();