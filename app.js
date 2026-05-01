/* ====================================================
   デュエマ所持管理 — app.js（Supabase + リスト機能対応版）
   ==================================================== */

// ================================================================
// ★ここを自分のSupabaseの情報に書き換えてください
// ================================================================
const SUPABASE_URL = "https://rohpwisxpzpbnsqvyvzb.supabase.co";
const SUPABASE_KEY = "sb_publishable_QmfPgzSkLR7oFIRu4vYcQQ_os4Gadqk";
// ================================================================

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

let cards       = [];
let collection  = {};   // { "カードID": { count: 0, memo: "" } }
let lists       = {};   // { "リスト名": ["カードID", ...] }
let currentCard = null;
let currentList = null; // null = 全カード表示

// ================================================================
// 起動
// ================================================================
async function init() {
  // Supabaseから所持データ取得
  const { data: colData, error: colErr } = await db.from("collection").select("*");
  if (colErr) {
    console.error("collection読み込みエラー:", colErr.message);
  } else {
    colData.forEach(row => {
      collection[row.id] = { count: row.count, memo: row.memo };
    });
  }

  // Supabaseからリストデータ取得
  const { data: listData, error: listErr } = await db.from("lists").select("*");
  if (listErr) {
    console.error("lists読み込みエラー:", listErr.message);
  } else {
    listData.forEach(row => {
      lists[row.name] = row.card_ids || [];
    });
  }

  // cards.json読み込み
  fetch("data/cards.json")
    .then(res => {
      if (!res.ok) throw new Error("cards.json が見つかりません");
      return res.json();
    })
    .then(data => {
      cards = data;
      renderListSelector();
      applyFilter();
      updateHeader();
    })
    .catch(err => {
      document.getElementById("cardTable").innerHTML =
        `<tr><td colspan="4" style="color:#e85d3a;padding:20px">
           ⚠️ ${err.message}
         </td></tr>`;
    });
}

// ================================================================
// Supabase: 所持データ保存
// ================================================================
async function saveToSupabase(id, count, memo) {
  const { error } = await db.from("collection").upsert({ id, count, memo });
  if (error) console.error("保存エラー:", error.message);
}

// ================================================================
// Supabase: リスト保存
// ================================================================
async function saveList(name, cardIds) {
  const { error } = await db.from("lists").upsert({ name, card_ids: cardIds });
  if (error) console.error("リスト保存エラー:", error.message);
}

// ================================================================
// Supabase: リスト削除
// ================================================================
async function deleteListFromDB(name) {
  const { error } = await db.from("lists").delete().eq("name", name);
  if (error) console.error("リスト削除エラー:", error.message);
}

// ================================================================
// リストセレクターを描画（左パネルの上部）
// ================================================================
function renderListSelector() {
  const box = document.getElementById("listSelector");
  const names = Object.keys(lists);

  box.innerHTML = `
    <div class="list-tab ${currentList === null ? 'active' : ''}"
         onclick="switchList(null)">📋 全カード</div>
    ${names.map(n => `
      <div class="list-tab ${currentList === n ? 'active' : ''}"
           onclick="switchList('${escAttr(n)}')">
        📁 ${escHtml(n)}
        <span class="list-delete" onclick="event.stopPropagation(); removeList('${escAttr(n)}')">✕</span>
      </div>
    `).join("")}
    <div class="list-add">
      <input type="text" id="newListName" placeholder="新しいリスト名">
      <button onclick="addList()">＋</button>
    </div>
  `;
}

// ================================================================
// リスト切り替え
// ================================================================
function switchList(name) {
  currentList = name;
  renderListSelector();
  applyFilter();
}

// ================================================================
// リスト追加
// ================================================================
async function addList() {
  const input = document.getElementById("newListName");
  const name  = input.value.trim();
  if (!name || lists[name] !== undefined) return;
  lists[name] = [];
  await saveList(name, []);
  input.value = "";
  renderListSelector();
}

// ================================================================
// リスト削除
// ================================================================
async function removeList(name) {
  if (!confirm(`「${name}」を削除しますか？`)) return;
  delete lists[name];
  await deleteListFromDB(name);
  if (currentList === name) currentList = null;
  renderListSelector();
  applyFilter();
}

// ================================================================
// カードをリストに追加 / 削除
// ================================================================
async function toggleCardInList(cardId, listName) {
  if (!lists[listName]) return;
  const idx = lists[listName].indexOf(cardId);
  if (idx === -1) {
    lists[listName].push(cardId);
  } else {
    lists[listName].splice(idx, 1);
  }
  await saveList(listName, lists[listName]);
  // 詳細パネルを再描画してチェック状態を更新
  if (currentCard && currentCard.id === cardId) {
    showDetail(currentCard);
  }
}

// ================================================================
// フィルター適用
// ================================================================
function applyFilter() {
  const civs      = Array.from(document.querySelectorAll(".civ:checked")).map(e => e.value);
  const costMax   = parseInt(document.getElementById("costMax").value) || 20;
  const race      = document.getElementById("raceSearch").value.trim();
  const name      = document.getElementById("nameSearch").value.trim();
  const ownedOnly = document.getElementById("ownedOnly").checked;
  const sort      = document.getElementById("sortSelect").value;

  // 現在のリストでフィルタ
  let base = currentList !== null
    ? cards.filter(c => lists[currentList].includes(c.id))
    : cards;

  let filtered = base.filter(card => {
    if (civs.length && !card.civilizations.some(c => civs.includes(c))) return false;
    if (card.cost > costMax) return false;
    if (race && !card.races.join("").includes(race)) return false;
    if (name && !card.name.includes(name)) return false;
    if (ownedOnly) {
      if (!((collection[card.id] || {}).count > 0)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (sort === "cost")  return a.cost - b.cost;
    if (sort === "count") {
      return ((collection[b.id]||{}).count||0) - ((collection[a.id]||{}).count||0);
    }
    return a.name.localeCompare(b.name, "ja");
  });

  render(filtered);
  updateStats(filtered);
  document.getElementById("resultCount").textContent = `${filtered.length} 件`;
}

// ================================================================
// テーブル描画
// ================================================================
function render(list) {
  const tbody = document.getElementById("cardTable");
  tbody.innerHTML = "";

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:30px;color:#6b7399">
      該当するカードが見つかりませんでした
    </td></tr>`;
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
        <input type="number" value="${data.count}" min="0" max="99"
          onclick="event.stopPropagation()"
          onchange="updateCount('${escAttr(card.id)}', this.value)">
      </td>
    `;
    tr.addEventListener("click", () => {
      document.querySelectorAll("#cardTable tr.selected")
        .forEach(r => r.classList.remove("selected"));
      tr.classList.add("selected");
      showDetail(card);
    });
    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment);
}

// ================================================================
// 詳細パネル
// ================================================================
function showDetail(card) {
  currentCard = card;
  const data  = collection[card.id] || { count: 0, memo: "" };
  const panel = document.getElementById("detail");

  // リストへの追加/削除ボタンを生成
  const listNames = Object.keys(lists);
  const listButtons = listNames.length === 0
    ? `<p style="color:#6b7399;font-size:.8rem">リストがありません</p>`
    : listNames.map(n => {
        const inList = lists[n].includes(card.id);
        return `<button class="btn-list-toggle ${inList ? 'in-list' : ''}"
                  onclick="toggleCardInList('${escAttr(card.id)}', '${escAttr(n)}')">
                  ${inList ? '✅' : '＋'} ${escHtml(n)}
                </button>`;
      }).join("");

  const imgHtml = card.image
    ? `<img src="${escAttr(card.image)}" alt="${escAttr(card.name)}"
            onerror="this.replaceWith(Object.assign(document.createElement('div'),
              {className:'no-image',textContent:'画像なし'}))">`
    : `<div class="no-image">画像なし</div>`;

  panel.innerHTML = `
    <div class="detail-card">
      ${imgHtml}
      <h3>${escHtml(card.name)}</h3>
      <div class="detail-row">
        <span class="detail-key">文明</span>
        <span class="detail-val">${civBadges(card.civilizations)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-key">コスト</span>
        <span class="detail-val">${card.cost}</span>
      </div>
      <div class="detail-row">
        <span class="detail-key">種族</span>
        <span class="detail-val">${escHtml(card.races.join(" / ")) || "—"}</span>
      </div>
      <div class="detail-row">
        <span class="detail-key">所持枚数</span>
        <span class="detail-val">
          <input type="number" value="${data.count}" min="0" max="99" style="width:60px"
            onchange="updateCount('${escAttr(card.id)}', this.value)">
        </span>
      </div>
      <h4>📁 リストに追加</h4>
      <div class="list-buttons">${listButtons}</div>
      <h4>メモ</h4>
      <textarea placeholder="メモを入力…"
        onchange="updateMemo('${escAttr(card.id)}', this.value)">${escHtml(data.memo)}</textarea>
    </div>
  `;
}

// ================================================================
// 更新系
// ================================================================
async function updateCount(id, val) {
  const count = Math.max(0, parseInt(val) || 0);
  if (!collection[id]) collection[id] = { count: 0, memo: "" };
  collection[id].count = count;
  updateHeader();
  await saveToSupabase(id, count, collection[id].memo);
}

async function updateMemo(id, val) {
  if (!collection[id]) collection[id] = { count: 0, memo: "" };
  collection[id].memo = val;
  await saveToSupabase(id, collection[id].count, val);
}

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
  const civLines = Object.entries(civMap)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `<span class="civ-badge civ-${c}">${c}</span> ${n}枚`)
    .join("<br>");
  document.getElementById("statsBox").innerHTML = `
    <strong>表示中: ${filtered.length} 枚</strong><br>
    所持合計: ${totalOwned} 枚<br><br>${civLines || "—"}
  `;
}

// ================================================================
// リセット
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

// ================================================================
// ユーティリティ
// ================================================================
const CIV_MAP = {"火":"火","水":"水","自然":"自然","光":"光","闇":"闇","ゼロ":"ゼロ"};

function civBadges(civs) {
  return (civs || []).map(c => {
    const cls = CIV_MAP[c] ? `civ-${c}` : "civ-other";
    return `<span class="civ-badge ${cls}">${escHtml(c)}</span>`;
  }).join("");
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function escAttr(str) {
  return String(str || "").replace(/'/g,"\\'");
}

// リアルタイム検索
["raceSearch","nameSearch"].forEach(id =>
  document.getElementById(id).addEventListener("input", () => applyFilter())
);
document.getElementById("costMax").addEventListener("input", () => applyFilter());
document.getElementById("ownedOnly").addEventListener("change", () => applyFilter());
document.querySelectorAll(".civ").forEach(el =>
  el.addEventListener("change", () => applyFilter())
);

init();
