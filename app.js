/* ====================================================
   デュエマ所持管理 — app.js（Supabase + レスポンシブ対応版）
   ==================================================== */

const SUPABASE_URL = "https://rohpwisxpzpbnsqvyvzb.supabase.co";
const SUPABASE_KEY = "sb_publishable_QmfPgzSkLR7oFIRu4vYcQQ_os4Gadqk";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

let cards       = [];
let collection  = {};
let lists       = {};
let currentCard = null;
let currentList = null;

// ================================================================
// 起動
// ================================================================
async function init() {
  const { data: colData, error: colErr } = await db.from("collection").select("*");
  if (colErr) console.error("collection読み込みエラー:", colErr.message);
  else colData.forEach(r => { collection[r.id] = { count: r.count, memo: r.memo }; });

  const { data: listData, error: listErr } = await db.from("lists").select("*");
  if (listErr) console.error("lists読み込みエラー:", listErr.message);
  else listData.forEach(r => { lists[r.name] = r.card_ids || []; });

  fetch("data/cards.json")
    .then(res => { if (!res.ok) throw new Error("cards.json が見つかりません"); return res.json(); })
    .then(data => {
      cards = data;
      renderListSelector();
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
async function saveToSupabase(id, count, memo) {
  const { error } = await db.from("collection").upsert({ id, count, memo });
  if (error) console.error("保存エラー:", error.message);
}

async function saveList(name, cardIds) {
  const { error } = await db.from("lists").upsert({ name, card_ids: cardIds });
  if (error) console.error("リスト保存エラー:", error.message);
}

async function deleteListFromDB(name) {
  const { error } = await db.from("lists").delete().eq("name", name);
  if (error) console.error("リスト削除エラー:", error.message);
}

// ================================================================
// リストUI
// ================================================================
function renderListSelector() {
  const box = document.getElementById("listSelector");
  const names = Object.keys(lists);
  box.innerHTML = `
    <div class="list-tab ${currentList === null ? 'active' : ''}" onclick="switchList(null)">📋 全カード</div>
    ${names.map(n => `
      <div class="list-tab ${currentList === n ? 'active' : ''}" onclick="switchList('${escAttr(n)}')">
        📁 ${escHtml(n)}
        <span class="list-delete" onclick="event.stopPropagation();removeList('${escAttr(n)}')">✕</span>
      </div>
    `).join("")}
    <div class="list-add">
      <input type="text" id="newListName" placeholder="新しいリスト名">
      <button onclick="addList()">＋</button>
    </div>
  `;
}

function switchList(name) { currentList = name; renderListSelector(); applyFilter(); }

async function addList() {
  const input = document.getElementById("newListName");
  const name  = input.value.trim();
  if (!name || lists[name] !== undefined) return;
  lists[name] = [];
  await saveList(name, []);
  input.value = "";
  renderListSelector();
}

async function removeList(name) {
  if (!confirm(`「${name}」を削除しますか？`)) return;
  delete lists[name];
  await deleteListFromDB(name);
  if (currentList === name) currentList = null;
  renderListSelector(); applyFilter();
}

async function toggleCardInList(cardId, listName) {
  if (!lists[listName]) return;
  const idx = lists[listName].indexOf(cardId);
  if (idx === -1) lists[listName].push(cardId);
  else lists[listName].splice(idx, 1);
  await saveList(listName, lists[listName]);
  if (currentCard && currentCard.id === cardId) showDetail(currentCard);
}

// ================================================================
// フィルター
// ================================================================
function applyFilter() {
  const civs      = Array.from(document.querySelectorAll(".civ:checked")).map(e => e.value);
  const costMax   = parseInt(document.getElementById("costMax").value) || 20;
  const race      = document.getElementById("raceSearch").value.trim();
  const name      = document.getElementById("nameSearch").value.trim();
  const ownedOnly = document.getElementById("ownedOnly").checked;
  const sort      = document.getElementById("sortSelect").value;

  let base = currentList !== null
    ? cards.filter(c => lists[currentList].includes(c.id))
    : cards;

  let filtered = base.filter(card => {
    if (civs.length && !card.civilizations.some(c => civs.includes(c))) return false;
    if (card.cost > costMax) return false;
    if (race && !card.races.join("").includes(race)) return false;
    if (name && !card.name.includes(name)) return false;
    if (ownedOnly && !((collection[card.id] || {}).count > 0)) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (sort === "cost")  return a.cost - b.cost;
    if (sort === "count") return ((collection[b.id]||{}).count||0) - ((collection[a.id]||{}).count||0);
    return a.name.localeCompare(b.name, "ja");
  });

  render(filtered);
  updateStats(filtered);
  document.getElementById("resultCount").textContent = `${filtered.length} 件`;
}

// ================================================================
// テーブル描画（PC・スマホ共通）
// ================================================================
function render(list) {
  const tbody = document.getElementById("cardTable");
  tbody.innerHTML = "";

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:30px;color:#6b7399">該当するカードが見つかりませんでした</td></tr>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  list.forEach(card => {
    const data = collection[card.id] || { count: 0, memo: "" };
    const tr   = document.createElement("tr");
    if (currentCard && currentCard.id === card.id) tr.classList.add("selected");

    tr.innerHTML = `
      <td class="col-name">${escHtml(card.name)}</td>
      <td class="col-civ">${civBadges(card.civilizations)}</td>
      <td class="col-cost">${card.cost}</td>
      <td class="col-count">
        <div class="count-ctrl">
          <button class="count-btn minus" onclick="event.stopPropagation();changeCount('${escAttr(card.id)}',-1)">−</button>
          <span class="count-val">${data.count}</span>
          <button class="count-btn plus" onclick="event.stopPropagation();changeCount('${escAttr(card.id)}',1)">＋</button>
        </div>
      </td>
    `;
    tr.addEventListener("click", () => {
      document.querySelectorAll("#cardTable tr.selected").forEach(r => r.classList.remove("selected"));
      tr.classList.add("selected");
      // スマホ（768px以下）はモーダル、PCは詳細パネル
      if (window.innerWidth <= 768) {
        showMobileDetail(card);
      } else {
        showDetail(card);
      }
    });
    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment);
}

// ================================================================
// PC版詳細パネル
// ================================================================
function showDetail(card) {
  currentCard = card;
  const data  = collection[card.id] || { count: 0, memo: "" };
  const panel = document.getElementById("detail");

  const listNames   = Object.keys(lists);
  const listButtons = listNames.length === 0
    ? `<p style="color:#6b7399;font-size:.8rem">リストがありません</p>`
    : listNames.map(n => {
        const inList = lists[n].includes(card.id);
        return `<button class="btn-list-toggle ${inList ? 'in-list' : ''}"
                  onclick="toggleCardInList('${escAttr(card.id)}','${escAttr(n)}')">
                  ${inList ? '✅' : '＋'} ${escHtml(n)}
                </button>`;
      }).join("");

  const imgHtml = card.image
    ? `<img src="${escAttr(card.image)}" alt="${escAttr(card.name)}"
            onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'no-image',textContent:'画像なし'}))">`
    : `<div class="no-image">画像なし</div>`;

  panel.innerHTML = `
    <div class="detail-card">
      ${imgHtml}
      <h3>${escHtml(card.name)}</h3>
      <div class="detail-row"><span class="detail-key">文明</span><span class="detail-val">${civBadges(card.civilizations)}</span></div>
      <div class="detail-row"><span class="detail-key">コスト</span><span class="detail-val">${card.cost}</span></div>
      <div class="detail-row"><span class="detail-key">種族</span><span class="detail-val">${escHtml(card.races.join(" / ")) || "—"}</span></div>
      <div class="detail-row">
        <span class="detail-key">所持枚数</span>
        <span class="detail-val">
          <div class="count-ctrl">
            <button class="count-btn minus" onclick="changeCount('${escAttr(card.id)}',-1)">−</button>
            <span class="count-val" id="detail-count">${data.count}</span>
            <button class="count-btn plus" onclick="changeCount('${escAttr(card.id)}',1)">＋</button>
          </div>
        </span>
      </div>
      <h4>📁 リストに追加</h4>
      <div class="list-buttons">${listButtons}</div>
      <h4>メモ</h4>
      <textarea placeholder="メモを入力…" onchange="updateMemo('${escAttr(card.id)}',this.value)">${escHtml(data.memo)}</textarea>
    </div>
  `;
}

// ================================================================
// スマホ版モーダル
// ================================================================
function showMobileDetail(card) {
  currentCard = card;
  const data  = collection[card.id] || { count: 0, memo: "" };

  const listNames   = Object.keys(lists);
  const listButtons = listNames.length === 0
    ? `<p style="color:#6b7399;font-size:.8rem">リストがありません</p>`
    : listNames.map(n => {
        const inList = lists[n].includes(card.id);
        return `<button class="btn-list-toggle ${inList ? 'in-list' : ''}"
                  onclick="toggleCardInList('${escAttr(card.id)}','${escAttr(n)}')">
                  ${inList ? '✅' : '＋'} ${escHtml(n)}
                </button>`;
      }).join("");

  const imgHtml = card.image
    ? `<img src="${escAttr(card.image)}" alt="${escAttr(card.name)}"
            style="width:140px;border-radius:8px;display:block;margin:0 auto 12px;"
            onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'no-image',textContent:'画像なし'}))">`
    : `<div class="no-image" style="height:80px;margin-bottom:12px;">画像なし</div>`;

  const modal = document.getElementById("mobileModal");
  document.getElementById("mobileModalContent").innerHTML = `
    ${imgHtml}
    <h3 style="font-size:.95rem;color:#f7c94f;margin-bottom:10px;">${escHtml(card.name)}</h3>
    <div class="mobile-detail-row"><span>文明</span><span>${civBadges(card.civilizations)}</span></div>
    <div class="mobile-detail-row"><span>コスト</span><span>${card.cost}</span></div>
    <div class="mobile-detail-row"><span>種族</span><span>${escHtml(card.races.join(" / ")) || "—"}</span></div>
    <div class="mobile-detail-row">
      <span>所持枚数</span>
      <div class="count-ctrl">
        <button class="count-btn minus" onclick="changeCount('${escAttr(card.id)}',-1)">−</button>
        <span class="count-val" id="modal-count">${data.count}</span>
        <button class="count-btn plus" onclick="changeCount('${escAttr(card.id)}',1)">＋</button>
      </div>
    </div>
    <p style="font-size:.75rem;color:#6b7399;margin:12px 0 4px;text-transform:uppercase;letter-spacing:.05em;">📁 リストに追加</p>
    <div class="list-buttons">${listButtons}</div>
    <p style="font-size:.75rem;color:#6b7399;margin:12px 0 4px;text-transform:uppercase;letter-spacing:.05em;">メモ</p>
    <textarea placeholder="メモを入力…" style="width:100%;height:70px;background:#22263a;border:1px solid #2e3350;border-radius:8px;color:#e4e8f7;padding:8px;font-size:.83rem;"
      onchange="updateMemo('${escAttr(card.id)}',this.value)">${escHtml(data.memo)}</textarea>
  `;
  modal.classList.add("open");
}

function closeMobileModal() {
  document.getElementById("mobileModal").classList.remove("open");
}

// ================================================================
// 所持枚数変更（＋/−ボタン）
// ================================================================
async function changeCount(id, delta) {
  if (!collection[id]) collection[id] = { count: 0, memo: "" };
  collection[id].count = Math.max(0, (collection[id].count || 0) + delta);
  const newCount = collection[id].count;

  // テーブル行の表示を更新
  document.querySelectorAll(".count-val").forEach(el => {
    const btn = el.closest(".count-ctrl");
    if (btn && btn.closest("tr")) {
      const tr = btn.closest("tr");
      if (tr.dataset.id === id || tr.querySelector(`[onclick*="'${id}'"]`)) {
        el.textContent = newCount;
      }
    }
  });

  // 全 count-val を再描画（シンプルな方法）
  renderCountValues();
  updateHeader();
  await saveToSupabase(id, newCount, collection[id].memo);
}

function renderCountValues() {
  // テーブル内の全行を走査して最新の枚数を反映
  document.querySelectorAll("#cardTable tr").forEach(tr => {
    const minusBtn = tr.querySelector(".count-btn.minus");
    if (!minusBtn) return;
    const onclick = minusBtn.getAttribute("onclick") || "";
    const m = onclick.match(/'([^']+)'/);
    if (!m) return;
    const id = m[1];
    const val = tr.querySelector(".count-val");
    if (val) val.textContent = (collection[id] || {}).count || 0;
  });

  // 詳細パネルとモーダルの枚数も更新
  if (currentCard) {
    const cnt = (collection[currentCard.id] || {}).count || 0;
    const dc = document.getElementById("detail-count");
    const mc = document.getElementById("modal-count");
    if (dc) dc.textContent = cnt;
    if (mc) mc.textContent = cnt;
  }
}

async function updateMemo(id, val) {
  if (!collection[id]) collection[id] = { count: 0, memo: "" };
  collection[id].memo = val;
  await saveToSupabase(id, collection[id].count, val);
}

// ================================================================
// ヘッダー・統計
// ================================================================
function updateHeader() {
  const total = Object.values(collection).reduce((s, v) => s + (v.count || 0), 0);
  const kinds = Object.values(collection).filter(v => v.count > 0).length;
  document.getElementById("totalCount").textContent = `所持: ${kinds} 種 / ${total} 枚`;
}

function updateStats(filtered) {
  const civMap = {};
  let totalOwned = 0;
  filtered.forEach(card => {
    const cnt = (collection[card.id] || {}).count || 0;
    totalOwned += cnt;
    card.civilizations.forEach(c => { civMap[c] = (civMap[c] || 0) + 1; });
  });
  const civLines = Object.entries(civMap).sort((a,b)=>b[1]-a[1])
    .map(([c,n])=>`<span class="civ-badge civ-${c}">${c}</span> ${n}枚`).join("<br>");
  document.getElementById("statsBox").innerHTML =
    `<strong>表示中: ${filtered.length} 枚</strong><br>所持合計: ${totalOwned} 枚<br><br>${civLines||"—"}`;
}

// ================================================================
// リセット・スマホ検索パネル
// ================================================================
function resetFilter() {
  document.querySelectorAll(".civ").forEach(el => el.checked = false);
  document.getElementById("costMax").value = 20;
  document.getElementById("costVal").textContent = "20";
  document.getElementById("raceSearch").value = "";
  document.getElementById("nameSearch").value = "";
  document.getElementById("ownedOnly").checked = false;
  document.getElementById("sortSelect").value = "name";
  applyFilter();
}

function toggleMobileFilter() {
  document.getElementById("mobileFilterPanel").classList.toggle("open");
}

function closeMobileFilter() {
  document.getElementById("mobileFilterPanel").classList.remove("open");
}

// ================================================================
// ユーティリティ
// ================================================================
const CIV_MAP = {"火":"火","水":"水","自然":"自然","光":"光","闇":"闇","ゼロ":"ゼロ"};

function civBadges(civs) {
  return (civs||[]).map(c=>{
    const cls = CIV_MAP[c] ? `civ-${c}` : "civ-other";
    return `<span class="civ-badge ${cls}">${escHtml(c)}</span>`;
  }).join("");
}

function escHtml(str) {
  return String(str||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function escAttr(str) { return String(str||"").replace(/'/g,"\\'"); }

// イベントリスナー
["raceSearch","nameSearch"].forEach(id =>
  document.getElementById(id).addEventListener("input", ()=>applyFilter())
);
document.getElementById("costMax").addEventListener("input", ()=>applyFilter());
document.getElementById("ownedOnly").addEventListener("change", ()=>applyFilter());
document.querySelectorAll(".civ").forEach(el=>el.addEventListener("change",()=>applyFilter()));

// スマホ：モーダル外タップで閉じる
document.getElementById("mobileModal").addEventListener("click", function(e) {
  if (e.target === this) closeMobileModal();
});

init();
