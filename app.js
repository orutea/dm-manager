/* ====================================================
   デュエマ所持管理 — app.js
   ==================================================== */

// ★ここを自分のSupabaseの情報に書き換えてください
const SUPABASE_URL = "https://rohpwisxpzpbnsqvyvzb.supabase.co";
const SUPABASE_KEY = "sb_publishable_QmfPgzSkLR7oFIRu4vYcQQ_os4Gadqk";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

let cards       = [];
let collection  = {};
let lists       = {};
let decks       = {};

let currentCard = null;
let currentList = null;
let currentDeck = null;
let activeTab   = "collection";

const modeState = { nameMode: "OR", raceMode: "OR", memoMode: "OR" };

const PAGE_SIZE    = 50;
let   currentPage  = 1;
let   filteredCards = [];

// ================================================================
// 起動
// ================================================================
async function init() {
  const [colRes, listRes, deckRes] = await Promise.all([
    db.from("collection").select("*"),
    db.from("lists").select("*"),
    db.from("decks").select("*"),
  ]);

  if (!colRes.error)  colRes.data.forEach(r => { collection[r.id] = { count: r.count, memo: r.memo }; });
  if (!listRes.error) listRes.data.forEach(r => { lists[r.name]   = r.card_ids || []; });
  if (!deckRes.error) deckRes.data.forEach(r => { decks[r.name]   = { memo: r.memo || "", cards: r.cards || {} }; });

  fetch("data/cards.json")
    .then(r => { if (!r.ok) throw new Error("cards.json が見つかりません"); return r.json(); })
    .then(data => {
      cards = data;
      renderSidebar();
      applyFilter();
      updateHeader();
    })
    .catch(err => {
      document.getElementById("cardTable").innerHTML =
        `<tr><td colspan="4" style="color:#e85d3a;padding:20px">⚠️ ${err.message}</td></tr>`;
    });
}

// ================================================================
// Supabase 保存
// ================================================================
async function saveCollection(id) {
  const d = collection[id] || { count: 0, memo: "" };
  await db.from("collection").upsert({ id, count: d.count, memo: d.memo });
}
async function saveList(name) {
  await db.from("lists").upsert({ name, card_ids: lists[name] || [] });
}
async function saveDeck(name) {
  const d = decks[name] || { memo: "", cards: {} };
  await db.from("decks").upsert({ name, memo: d.memo, cards: d.cards });
}

// ================================================================
// タブ切り替え（PC）
// ================================================================
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  if (btn) btn.classList.add("active");
  currentList = null;
  currentDeck = null;
  currentPage = 1;
  renderSidebar();
  applyFilter();
}

// ================================================================
// PC サイドバー描画
// ================================================================
function renderSidebar() {
  const el = document.getElementById("sidebarContent");
  if (!el) return;
  el.innerHTML = activeTab === "collection"
    ? renderCollectionSidebarHTML()
    : renderDeckSidebarHTML();
}

function renderCollectionSidebarHTML() {
  return `
    <h3>📁 リスト</h3>
    <div class="list-tab ${currentList===null?'active':''}" onclick="switchList(null)">📋 全カード</div>
    ${Object.keys(lists).map(n => `
      <div class="list-tab ${currentList===n?'active':''}" onclick="switchList('${escAttr(n)}')">
        📁 ${escHtml(n)}
        <span class="list-delete" onclick="event.stopPropagation();removeList('${escAttr(n)}')">✕</span>
      </div>`).join("")}
    <div class="list-add">
      <input type="text" id="newListName" placeholder="新しいリスト名">
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

function renderDeckSidebarHTML() {
  return `
    <h3>🃏 デッキ</h3>
    <div class="list-tab ${currentDeck===null?'active':''}" onclick="switchDeck(null)">📋 全カード表示</div>
    ${Object.keys(decks).map(n => `
      <div class="list-tab ${currentDeck===n?'active':''}" onclick="switchDeck('${escAttr(n)}')">
        🃏 ${escHtml(n)}
        <span class="list-delete" onclick="event.stopPropagation();removeDeck('${escAttr(n)}')">✕</span>
      </div>`).join("")}
    <div class="list-add">
      <input type="text" id="newDeckName" placeholder="新しいデッキ名">
      <button onclick="addDeck()">＋</button>
    </div>
    ${currentDeck ? `
      <div class="deck-info">
        <div class="deck-stats">合計 <strong>${getDeckTotal(currentDeck)}</strong> 枚</div>
        <h4 style="margin:10px 0 4px;font-size:.75rem;color:#6b7399;text-transform:uppercase;">デッキメモ</h4>
        <textarea class="deck-memo" placeholder="デッキのメモ..."
          onchange="updateDeckMemo('${escAttr(currentDeck)}',this.value)">${escHtml(decks[currentDeck]?.memo||"")}</textarea>
      </div>` : ""}
    <hr style="border-color:#2e3350;margin:12px 0">
    <h3>🔍 絞り込み</h3>
    ${renderFilterHTML()}
    <button class="btn-search" onclick="applyFilter()">検索</button>
    <button class="btn-reset" onclick="resetFilter()">リセット</button>
    <div class="stats-box" id="statsBox"></div>
  `;
}

function getDeckTotal(name) {
  if (!decks[name]) return 0;
  return Object.values(decks[name].cards).reduce((s, v) => s + v, 0);
}

// ================================================================
// スマホ パネル管理
// ================================================================
function showMobileTab(tab, btnEl) {
  // ナビボタンのアクティブ状態
  document.querySelectorAll(".mobile-nav-btn").forEach(b => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");

  // 全パネルを閉じる
  ["mobileFilterPanel","mobileListPanel","mobileDeckPanel"].forEach(id => {
    document.getElementById(id)?.classList.remove("open");
  });

  if (tab === "filter") {
    const body = document.getElementById("mobileFilterBody");
    if (body) body.innerHTML = renderFilterHTML();
    document.getElementById("mobileFilterPanel").classList.add("open");

  } else if (tab === "mylist") {
    renderMobileListPanel();
    document.getElementById("mobileListPanel").classList.add("open");

  } else if (tab === "deck") {
    // スマホのデッキタブはデッキパネルを開く
    renderMobileDeckPanel();
    document.getElementById("mobileDeckPanel").classList.add("open");
  }
  // tab === "list" の場合はパネルを閉じるだけ（一覧表示）
}

function closeMobilePanel(id) {
  document.getElementById(id)?.classList.remove("open");
}

// ================================================================
// スマホ リストパネル描画
// ================================================================
function renderMobileListPanel() {
  const body = document.getElementById("mobileListBody");
  if (!body) return;

  const listItems = Object.keys(lists).map(n => `
    <div class="mobile-list-item ${currentList===n?'active':''}" onclick="selectMobileList('${escAttr(n)}')">
      <span>📁 ${escHtml(n)}</span>
      <div style="display:flex;gap:6px;align-items:center;">
        <span style="font-size:.75rem;color:#6b7399;">${lists[n].length}枚</span>
        <button class="mobile-delete-btn" onclick="event.stopPropagation();removeList('${escAttr(n)}')">✕</button>
      </div>
    </div>`).join("");

  body.innerHTML = `
    <div class="mobile-list-item ${currentList===null?'active':''}" onclick="selectMobileList(null)">
      📋 全カード表示
    </div>
    ${listItems}
    <div style="margin-top:12px;">
      <p style="font-size:.75rem;color:#6b7399;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">新しいリストを作成</p>
      <div class="list-add">
        <input type="text" id="mobileNewListName" placeholder="リスト名を入力">
        <button onclick="addMobileList()">＋</button>
      </div>
    </div>
    ${currentList ? `
      <div style="margin-top:12px;padding:10px;background:#22263a;border-radius:8px;border:1px solid #2e3350;">
        <p style="font-size:.78rem;color:#4f8ef7;font-weight:bold;margin-bottom:4px;">📁 ${escHtml(currentList)}</p>
        <p style="font-size:.75rem;color:#6b7399;">${lists[currentList]?.length||0}枚 登録中</p>
      </div>` : ""}
  `;
}

function selectMobileList(name) {
  currentList = name;
  currentPage = 1;
  activeTab   = "collection";
  renderMobileListPanel();
  applyFilter();
  // PC側も同期
  renderSidebar();
}

async function addMobileList() {
  const input = document.getElementById("mobileNewListName");
  const name  = input?.value.trim();
  if (!name || lists[name] !== undefined) return;
  lists[name] = [];
  await saveList(name);
  input.value = "";
  renderMobileListPanel();
  renderSidebar();
}

// ================================================================
// スマホ デッキパネル描画
// ================================================================
function renderMobileDeckPanel() {
  const body = document.getElementById("mobileDeckBody");
  if (!body) return;

  const deckItems = Object.keys(decks).map(n => `
    <div class="mobile-list-item ${currentDeck===n?'active':''}" onclick="selectMobileDeck('${escAttr(n)}')">
      <span>🃏 ${escHtml(n)}</span>
      <div style="display:flex;gap:6px;align-items:center;">
        <span style="font-size:.75rem;color:#6b7399;">${getDeckTotal(n)}枚</span>
        <button class="mobile-delete-btn" onclick="event.stopPropagation();removeDeck('${escAttr(n)}')">✕</button>
      </div>
    </div>`).join("");

  body.innerHTML = `
    <div class="mobile-list-item ${currentDeck===null?'active':''}" onclick="selectMobileDeck(null)">
      📋 全カード表示
    </div>
    ${deckItems}
    <div style="margin-top:12px;">
      <p style="font-size:.75rem;color:#6b7399;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">新しいデッキを作成</p>
      <div class="list-add">
        <input type="text" id="mobileNewDeckName" placeholder="デッキ名を入力">
        <button onclick="addMobileDeck()">＋</button>
      </div>
    </div>
    ${currentDeck ? `
      <div style="margin-top:12px;padding:10px;background:#22263a;border-radius:8px;border:1px solid #2e3350;">
        <p style="font-size:.78rem;color:#4f8ef7;font-weight:bold;margin-bottom:6px;">🃏 ${escHtml(currentDeck)}</p>
        <p style="font-size:.75rem;color:#6b7399;margin-bottom:6px;">合計 ${getDeckTotal(currentDeck)} 枚</p>
        <textarea style="width:100%;height:60px;background:#1a1d27;border:1px solid #2e3350;border-radius:8px;color:#e4e8f7;padding:7px;font-size:.8rem;"
          placeholder="デッキのメモ..."
          onchange="updateDeckMemo('${escAttr(currentDeck)}',this.value)">${escHtml(decks[currentDeck]?.memo||"")}</textarea>
      </div>` : ""}
  `;
}

function selectMobileDeck(name) {
  currentDeck = name;
  currentPage = 1;
  activeTab   = "deck";
  renderMobileDeckPanel();
  applyFilter();
  renderSidebar();
}

async function addMobileDeck() {
  const input = document.getElementById("mobileNewDeckName");
  const name  = input?.value.trim();
  if (!name || decks[name] !== undefined) return;
  decks[name] = { memo: "", cards: {} };
  await saveDeck(name);
  input.value = "";
  renderMobileDeckPanel();
  renderSidebar();
}

// ================================================================
// フィルターHTML
// ================================================================
function renderFilterHTML() {
  return `
    <div class="filter-block">
      <label class="filter-label">文明（含む）</label>
      <div class="civ-grid">
        <label class="civ-label fire">  <input type="checkbox" value="火"  class="civ-include"> 火</label>
        <label class="civ-label water"> <input type="checkbox" value="水"  class="civ-include"> 水</label>
        <label class="civ-label nature"><input type="checkbox" value="自然" class="civ-include"> 自然</label>
        <label class="civ-label light"> <input type="checkbox" value="光"  class="civ-include"> 光</label>
        <label class="civ-label dark">  <input type="checkbox" value="闇"  class="civ-include"> 闇</label>
      </div>
    </div>
    <div class="filter-block">
      <label class="filter-label">文明（除外）</label>
      <div class="civ-grid">
        <label class="civ-label fire">  <input type="checkbox" value="火"  class="civ-exclude"> 火</label>
        <label class="civ-label water"> <input type="checkbox" value="水"  class="civ-exclude"> 水</label>
        <label class="civ-label nature"><input type="checkbox" value="自然" class="civ-exclude"> 自然</label>
        <label class="civ-label light"> <input type="checkbox" value="光"  class="civ-exclude"> 光</label>
        <label class="civ-label dark">  <input type="checkbox" value="闇"  class="civ-exclude"> 闇</label>
      </div>
    </div>
    <div class="filter-block">
      <label class="filter-label">色の数</label>
      <select id="colorCount">
        <option value="all">指定なし</option>
        <option value="mono">単色のみ</option>
        <option value="multi">多色のみ</option>
      </select>
    </div>
    <div class="filter-block">
      <label class="filter-label">コスト</label>
      <div style="display:flex;gap:6px;align-items:center;">
        <input type="number" id="costMin" min="0" max="99" value="0" style="width:55px;text-align:center;">
        <span style="color:#6b7399;flex-shrink:0;">〜</span>
        <input type="number" id="costMax" min="0" max="99" value="99" style="width:55px;text-align:center;">
      </div>
    </div>
    <div class="filter-block">
      <label class="filter-label">
        カード名
        <span class="and-or-toggle" id="nameMode" onclick="toggleMode('nameMode')">OR</span>
      </label>
      <div class="multi-search">
        <input type="text" class="name-input" placeholder="例: ボルシャック">
        <input type="text" class="name-input" placeholder="例: ドラゴン">
        <input type="text" class="name-input" placeholder="">
        <input type="text" class="name-input" placeholder="">
      </div>
    </div>
    <div class="filter-block">
      <label class="filter-label">
        種族
        <span class="and-or-toggle" id="raceMode" onclick="toggleMode('raceMode')">OR</span>
      </label>
      <div class="multi-search">
        <input type="text" class="race-input" placeholder="例: ドラゴン">
        <input type="text" class="race-input" placeholder="例: メカ">
        <input type="text" class="race-input" placeholder="">
        <input type="text" class="race-input" placeholder="">
      </div>
    </div>
    <div class="filter-block">
      <label class="filter-label">
        メモ
        <span class="and-or-toggle" id="memoMode" onclick="toggleMode('memoMode')">OR</span>
      </label>
      <div class="multi-search">
        <input type="text" class="memo-input" placeholder="例: マナ">
        <input type="text" class="memo-input" placeholder="例: ドロー">
        <input type="text" class="memo-input" placeholder="">
        <input type="text" class="memo-input" placeholder="">
      </div>
    </div>
    <div class="filter-block">
      <label class="toggle-label"><input type="checkbox" id="ownedOnly"> 所持カードのみ</label>
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

function toggleMode(id) {
  modeState[id] = modeState[id] === "OR" ? "AND" : "OR";
  document.querySelectorAll(`#${id}`).forEach(el => {
    el.textContent = modeState[id];
    el.classList.toggle("and-mode", modeState[id] === "AND");
  });
}

// ================================================================
// フィルター適用
// ================================================================
function applyFilter() {
  const civInclude = Array.from(document.querySelectorAll(".civ-include:checked")).map(e => e.value);
  const civExclude = Array.from(document.querySelectorAll(".civ-exclude:checked")).map(e => e.value);
  const colorCount = document.getElementById("colorCount")?.value || "all";
  const costMin    = parseInt(document.getElementById("costMin")?.value) || 0;
  const costMax    = parseInt(document.getElementById("costMax")?.value) ?? 99;
  const ownedOnly  = document.getElementById("ownedOnly")?.checked || false;
  const sort       = document.getElementById("sortSelect")?.value || "name";

  const nameWords = Array.from(document.querySelectorAll(".name-input")).map(e => e.value.trim()).filter(Boolean);
  const raceWords = Array.from(document.querySelectorAll(".race-input")).map(e => e.value.trim()).filter(Boolean);
  const memoWords = Array.from(document.querySelectorAll(".memo-input")).map(e => e.value.trim()).filter(Boolean);

  let base = cards;
  if (activeTab === "collection" && currentList !== null) {
    base = cards.filter(c => lists[currentList].includes(c.id));
  } else if (activeTab === "deck" && currentDeck !== null) {
    base = cards.filter(c => (decks[currentDeck]?.cards[c.id] || 0) > 0);
  }

  filteredCards = base.filter(card => {
    if (civInclude.length && !card.civilizations.some(c => civInclude.includes(c))) return false;
    if (civExclude.length &&  card.civilizations.some(c => civExclude.includes(c))) return false;
    if (colorCount === "mono"  && card.civilizations.length !== 1) return false;
    if (colorCount === "multi" && card.civilizations.length <= 1)  return false;
    if (card.cost < costMin || card.cost > costMax) return false;
    if (nameWords.length) {
      const ok = modeState.nameMode === "AND"
        ? nameWords.every(w => card.name.includes(w))
        : nameWords.some(w  => card.name.includes(w));
      if (!ok) return false;
    }
    if (raceWords.length) {
      const str = card.races.join("");
      const ok = modeState.raceMode === "AND"
        ? raceWords.every(w => str.includes(w))
        : raceWords.some(w  => str.includes(w));
      if (!ok) return false;
    }
    if (memoWords.length) {
      const memo = (collection[card.id] || {}).memo || "";
      const ok = modeState.memoMode === "AND"
        ? memoWords.every(w => memo.includes(w))
        : memoWords.some(w  => memo.includes(w));
      if (!ok) return false;
    }
    if (ownedOnly && !((collection[card.id]||{}).count > 0)) return false;
    return true;
  });

  filteredCards.sort((a, b) => {
    if (sort === "cost_asc")  return a.cost - b.cost;
    if (sort === "cost_desc") return b.cost - a.cost;
    if (sort === "count") return ((collection[b.id]||{}).count||0) - ((collection[a.id]||{}).count||0);
    return a.name.localeCompare(b.name, "ja");
  });

  currentPage = 1;
  renderPage();
  updateStats(filteredCards);
}

// ================================================================
// ページ描画
// ================================================================
function renderPage() {
  const total      = filteredCards.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const start      = (currentPage - 1) * PAGE_SIZE;
  const pageCards  = filteredCards.slice(start, start + PAGE_SIZE);

  document.getElementById("resultCount").textContent = `${total} 件`;
  render(pageCards);
  renderPager(totalPages);
}

function renderPager(totalPages) {
  let el = document.getElementById("pager");
  if (!el) {
    el = document.createElement("div");
    el.id = "pager";
    el.className = "pager";
    document.querySelector("main.list").appendChild(el);
  }

  if (totalPages <= 1) { el.innerHTML = ""; return; }

  let html = "";
  if (currentPage > 1)
    html += `<button class="page-btn" onclick="goPage(${currentPage-1})">‹</button>`;

  const s = Math.max(1, currentPage - 2);
  const e = Math.min(totalPages, currentPage + 2);
  if (s > 1) html += `<button class="page-btn" onclick="goPage(1)">1</button>`;
  if (s > 2) html += `<span class="page-ellipsis">…</span>`;
  for (let i = s; i <= e; i++)
    html += `<button class="page-btn ${i===currentPage?'active':''}" onclick="goPage(${i})">${i}</button>`;
  if (e < totalPages - 1) html += `<span class="page-ellipsis">…</span>`;
  if (e < totalPages)
    html += `<button class="page-btn" onclick="goPage(${totalPages})">${totalPages}</button>`;

  if (currentPage < totalPages)
    html += `<button class="page-btn" onclick="goPage(${currentPage+1})">›</button>`;

  el.innerHTML = html;
}

function goPage(page) {
  currentPage = page;
  renderPage();
  document.querySelector("main.list").scrollTo(0, 0);
}

// ================================================================
// テーブル描画
// ================================================================
function render(list) {
  const tbody = document.getElementById("cardTable");
  tbody.innerHTML = "";

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:30px;color:#6b7399">
      該当するカードが見つかりませんでした</td></tr>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  list.forEach(card => {
    const colData   = collection[card.id] || { count: 0, memo: "" };
    const deckCount = activeTab === "deck" && currentDeck
      ? (decks[currentDeck]?.cards[card.id] || 0) : null;
    const tr = document.createElement("tr");
    if (currentCard?.id === card.id) tr.classList.add("selected");

    const countHTML = activeTab === "deck" && currentDeck
      ? `<div class="count-ctrl">
           <button class="count-btn minus" onclick="event.stopPropagation();changeDeckCount('${escAttr(currentDeck)}','${escAttr(card.id)}',-1)">−</button>
           <span class="count-val">${deckCount}</span>
           <button class="count-btn plus"  onclick="event.stopPropagation();changeDeckCount('${escAttr(currentDeck)}','${escAttr(card.id)}',1)">＋</button>
         </div>`
      : `<div class="count-ctrl">
           <button class="count-btn minus" onclick="event.stopPropagation();changeCount('${escAttr(card.id)}',-1)">−</button>
           <span class="count-val">${colData.count}</span>
           <button class="count-btn plus"  onclick="event.stopPropagation();changeCount('${escAttr(card.id)}',1)">＋</button>
         </div>`;

    tr.innerHTML = `
      <td class="col-name">${escHtml(card.name)}</td>
      <td class="col-civ">${civBadges(card.civilizations)}</td>
      <td class="col-cost">${card.cost}</td>
      <td class="col-count">${countHTML}</td>
    `;
    tr.addEventListener("click", () => {
      document.querySelectorAll("#cardTable tr.selected").forEach(r => r.classList.remove("selected"));
      tr.classList.add("selected");
      if (window.innerWidth <= 768) showMobileDetail(card);
      else showDetail(card);
    });
    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment);
}

// ================================================================
// PC 詳細パネル
// ================================================================
function showDetail(card) {
  currentCard = card;
  const colData = collection[card.id] || { count: 0, memo: "" };

  const listButtons = Object.keys(lists).length === 0
    ? `<p style="color:#6b7399;font-size:.78rem">リストがありません</p>`
    : Object.keys(lists).map(n => {
        const inList = lists[n].includes(card.id);
        return `<button class="btn-list-toggle ${inList?'in-list':''}"
                  onclick="toggleCardInList('${escAttr(card.id)}','${escAttr(n)}')">
                  ${inList?'✅':'＋'} ${escHtml(n)}</button>`;
      }).join("");

  const deckButtons = Object.keys(decks).length === 0
    ? `<p style="color:#6b7399;font-size:.78rem">デッキがありません</p>`
    : Object.keys(decks).map(n => {
        const cnt = decks[n]?.cards[card.id] || 0;
        return `<div class="deck-card-row">
                  <span>🃏 ${escHtml(n)}</span>
                  <div class="count-ctrl" style="gap:4px;">
                    <button class="count-btn minus" style="width:24px;height:24px;font-size:.9rem;"
                      onclick="changeDeckCount('${escAttr(n)}','${escAttr(card.id)}',-1)">−</button>
                    <span class="count-val" style="min-width:18px;font-size:.88rem;" id="dcnt-${escAttr(n)}-${escAttr(card.id)}">${cnt}</span>
                    <button class="count-btn plus" style="width:24px;height:24px;font-size:.9rem;"
                      onclick="changeDeckCount('${escAttr(n)}','${escAttr(card.id)}',1)">＋</button>
                  </div>
                </div>`;
      }).join("");

  const imgHtml = card.image
    ? `<img src="${escAttr(card.image)}" alt="${escAttr(card.name)}"
            onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'no-image',textContent:'画像なし'}))">`
    : `<div class="no-image">画像なし</div>`;

  document.getElementById("detail").innerHTML = `
    <div class="detail-card">
      ${imgHtml}
      <h3>${escHtml(card.name)}</h3>
      <div class="detail-row"><span class="detail-key">文明</span><span class="detail-val">${civBadges(card.civilizations)}</span></div>
      <div class="detail-row"><span class="detail-key">コスト</span><span class="detail-val">${card.cost}</span></div>
      <div class="detail-row"><span class="detail-key">種族</span><span class="detail-val">${escHtml(card.races.join(" / "))||"—"}</span></div>
      <div class="detail-row">
        <span class="detail-key">所持枚数</span>
        <span class="detail-val">
          <div class="count-ctrl">
            <button class="count-btn minus" onclick="changeCount('${escAttr(card.id)}',-1)">−</button>
            <span class="count-val" id="detail-count">${colData.count}</span>
            <button class="count-btn plus"  onclick="changeCount('${escAttr(card.id)}',1)">＋</button>
          </div>
        </span>
      </div>
      <h4>📁 リスト</h4>
      <div class="list-buttons">${listButtons}</div>
      <h4>🃏 デッキ枚数</h4>
      <div class="deck-buttons">${deckButtons}</div>
      <h4>メモ</h4>
      <textarea placeholder="メモを入力…"
        onchange="updateMemo('${escAttr(card.id)}',this.value)">${escHtml(colData.memo)}</textarea>
    </div>
  `;
}

// ================================================================
// スマホ カード詳細モーダル
// ================================================================
function showMobileDetail(card) {
  currentCard = card;
  const colData = collection[card.id] || { count: 0, memo: "" };

  const deckButtons = Object.keys(decks).map(n => {
    const cnt = decks[n]?.cards[card.id] || 0;
    return `<div class="deck-card-row">
              <span>🃏 ${escHtml(n)}</span>
              <div class="count-ctrl" style="gap:4px;">
                <button class="count-btn minus" style="width:28px;height:28px;"
                  onclick="changeDeckCount('${escAttr(n)}','${escAttr(card.id)}',-1)">−</button>
                <span class="count-val" style="min-width:20px;font-size:.9rem;">${cnt}</span>
                <button class="count-btn plus" style="width:28px;height:28px;"
                  onclick="changeDeckCount('${escAttr(n)}','${escAttr(card.id)}',1)">＋</button>
              </div>
            </div>`;
  }).join("") || `<p style="color:#6b7399;font-size:.78rem">デッキがありません</p>`;

  const listButtons = Object.keys(lists).map(n => {
    const inList = lists[n].includes(card.id);
    return `<button class="btn-list-toggle ${inList?'in-list':''}"
              onclick="toggleCardInList('${escAttr(card.id)}','${escAttr(n)}');renderMobileListPanel()">
              ${inList?'✅':'＋'} ${escHtml(n)}</button>`;
  }).join("") || `<p style="color:#6b7399;font-size:.78rem">リストがありません</p>`;

  const imgHtml = card.image
    ? `<img src="${escAttr(card.image)}" style="width:140px;border-radius:8px;display:block;margin:0 auto 12px;"
            onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'no-image',textContent:'画像なし'}))">`
    : `<div class="no-image" style="height:80px;margin-bottom:12px;">画像なし</div>`;

  document.getElementById("mobileModalContent").innerHTML = `
    ${imgHtml}
    <h3 style="font-size:.95rem;color:#f7c94f;margin-bottom:10px;">${escHtml(card.name)}</h3>
    <div class="mobile-detail-row"><span>文明</span><span>${civBadges(card.civilizations)}</span></div>
    <div class="mobile-detail-row"><span>コスト</span><span>${card.cost}</span></div>
    <div class="mobile-detail-row"><span>種族</span><span>${escHtml(card.races.join("/"))||"—"}</span></div>
    <div class="mobile-detail-row">
      <span>所持</span>
      <div class="count-ctrl">
        <button class="count-btn minus" onclick="changeCount('${escAttr(card.id)}',-1)">−</button>
        <span class="count-val" id="modal-count">${colData.count}</span>
        <button class="count-btn plus"  onclick="changeCount('${escAttr(card.id)}',1)">＋</button>
      </div>
    </div>
    <p style="font-size:.72rem;color:#6b7399;margin:10px 0 5px;text-transform:uppercase;letter-spacing:.05em;">📁 リスト</p>
    <div class="list-buttons">${listButtons}</div>
    <p style="font-size:.72rem;color:#6b7399;margin:10px 0 5px;text-transform:uppercase;letter-spacing:.05em;">🃏 デッキ枚数</p>
    <div>${deckButtons}</div>
    <p style="font-size:.72rem;color:#6b7399;margin:10px 0 5px;text-transform:uppercase;letter-spacing:.05em;">メモ</p>
    <textarea style="width:100%;height:60px;background:#22263a;border:1px solid #2e3350;border-radius:8px;color:#e4e8f7;padding:8px;font-size:.82rem;"
      onchange="updateMemo('${escAttr(card.id)}',this.value)">${escHtml(colData.memo)}</textarea>
  `;
  document.getElementById("mobileModal").classList.add("open");
}

function closeMobileModal() {
  document.getElementById("mobileModal").classList.remove("open");
}

// ================================================================
// 所持枚数変更
// ================================================================
async function changeCount(id, delta) {
  if (!collection[id]) collection[id] = { count: 0, memo: "" };
  collection[id].count = Math.max(0, (collection[id].count || 0) + delta);
  const cnt = collection[id].count;

  document.querySelectorAll("#cardTable tr").forEach(tr => {
    const btn = tr.querySelector(".count-btn.minus");
    if (!btn) return;
    const m = (btn.getAttribute("onclick")||"").match(/'([^']+)'/);
    if (m && m[1] === id) {
      const val = tr.querySelector(".count-val");
      if (val) val.textContent = cnt;
    }
  });
  const dc = document.getElementById("detail-count");
  const mc = document.getElementById("modal-count");
  if (dc && currentCard?.id === id) dc.textContent = cnt;
  if (mc && currentCard?.id === id) mc.textContent = cnt;

  updateHeader();
  await saveCollection(id);
}

async function updateMemo(id, val) {
  if (!collection[id]) collection[id] = { count: 0, memo: "" };
  collection[id].memo = val;
  await saveCollection(id);
}

// ================================================================
// デッキ枚数変更
// ================================================================
async function changeDeckCount(deckName, cardId, delta) {
  if (!decks[deckName]) decks[deckName] = { memo: "", cards: {} };
  const cur  = decks[deckName].cards[cardId] || 0;
  const next = Math.max(0, cur + delta);
  if (next === 0) delete decks[deckName].cards[cardId];
  else decks[deckName].cards[cardId] = next;
  await saveDeck(deckName);

  const statsEl = document.querySelector(".deck-stats strong");
  if (statsEl && currentDeck === deckName) statsEl.textContent = getDeckTotal(deckName);
  const cntEl = document.getElementById(`dcnt-${deckName}-${cardId}`);
  if (cntEl) cntEl.textContent = next;
  if (activeTab === "deck" && currentDeck === deckName) renderPage();
}

async function updateDeckMemo(name, val) {
  if (!decks[name]) decks[name] = { memo: "", cards: {} };
  decks[name].memo = val;
  await saveDeck(name);
}

// ================================================================
// リスト操作
// ================================================================
function switchList(name) { currentList = name; currentPage = 1; renderSidebar(); applyFilter(); }

async function addList() {
  const input = document.getElementById("newListName");
  const name  = input?.value.trim();
  if (!name || lists[name] !== undefined) return;
  lists[name] = [];
  await saveList(name);
  input.value = "";
  renderSidebar();
}

async function removeList(name) {
  if (!confirm(`「${name}」を削除しますか？`)) return;
  delete lists[name];
  await db.from("lists").delete().eq("name", name);
  if (currentList === name) currentList = null;
  renderSidebar();
  renderMobileListPanel();
  applyFilter();
}

async function toggleCardInList(cardId, listName) {
  if (!lists[listName]) return;
  const idx = lists[listName].indexOf(cardId);
  if (idx === -1) lists[listName].push(cardId);
  else lists[listName].splice(idx, 1);
  await saveList(listName);
  if (currentCard?.id === cardId) showDetail(currentCard);
}

// ================================================================
// デッキ操作
// ================================================================
function switchDeck(name) { currentDeck = name; currentPage = 1; renderSidebar(); applyFilter(); }

async function addDeck() {
  const input = document.getElementById("newDeckName");
  const name  = input?.value.trim();
  if (!name || decks[name] !== undefined) return;
  decks[name] = { memo: "", cards: {} };
  await saveDeck(name);
  input.value = "";
  renderSidebar();
}

async function removeDeck(name) {
  if (!confirm(`「${name}」を削除しますか？`)) return;
  delete decks[name];
  await db.from("decks").delete().eq("name", name);
  if (currentDeck === name) currentDeck = null;
  renderSidebar();
  renderMobileDeckPanel();
  applyFilter();
}

// ================================================================
// ヘッダー・統計
// ================================================================
function updateHeader() {
  const total = Object.values(collection).reduce((s, v) => s + (v.count||0), 0);
  const kinds = Object.values(collection).filter(v => v.count > 0).length;
  document.getElementById("totalCount").textContent = `所持: ${kinds} 種 / ${total} 枚`;
}

function updateStats(list) {
  const civMap = {}; let totalOwned = 0;
  list.forEach(card => {
    const cnt = (collection[card.id]||{}).count||0;
    totalOwned += cnt;
    card.civilizations.forEach(c => { civMap[c] = (civMap[c]||0) + 1; });
  });
  const civLines = Object.entries(civMap).sort((a,b)=>b[1]-a[1])
    .map(([c,n]) => `<span class="civ-badge civ-${c}">${c}</span> ${n}枚`).join("<br>");
  const el = document.getElementById("statsBox");
  if (el) el.innerHTML =
    `<strong>表示中: ${list.length} 枚</strong><br>所持合計: ${totalOwned} 枚<br><br>${civLines||"—"}`;
}

// ================================================================
// リセット
// ================================================================
function resetFilter() {
  document.querySelectorAll(".civ-include,.civ-exclude").forEach(el => el.checked = false);
  const defaults = { colorCount:"all", costMin:0, costMax:99, sortSelect:"name" };
  Object.entries(defaults).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });
  const oo = document.getElementById("ownedOnly");
  if (oo) oo.checked = false;
  document.querySelectorAll(".name-input,.race-input,.memo-input").forEach(el => el.value = "");
  ["nameMode","raceMode","memoMode"].forEach(id => {
    modeState[id] = "OR";
    document.querySelectorAll(`#${id}`).forEach(el => {
      el.textContent = "OR"; el.classList.remove("and-mode");
    });
  });
  applyFilter();
}

// ================================================================
// ユーティリティ
// ================================================================
const CIV_MAP = {"火":"火","水":"水","自然":"自然","光":"光","闇":"闇","ゼロ":"ゼロ"};

function civBadges(civs) {
  return (civs||[]).map(c =>
    `<span class="civ-badge civ-${CIV_MAP[c]?c:'other'}">${escHtml(c)}</span>`
  ).join("");
}

function escHtml(str) {
  return String(str||"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function escAttr(str) {
  return String(str||"").replace(/'/g,"\\'");
}

document.getElementById("mobileModal").addEventListener("click", function(e) {
  if (e.target === this) closeMobileModal();
});

init();