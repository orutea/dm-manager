/* ====================================================
   デュエマ所持管理 — app.js
   ==================================================== */

// ★ここを自分のSupabaseの情報に書き換えてください
const SUPABASE_URL = "https://ckbzdrngzpcjufzowvsl.supabase.co";
const SUPABASE_KEY = "sb_publishable_FtT7aDlhc7HlRc_0KgE-ug_0i2bVrZr";

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

const modeState = { nameMode: "OR", raceMode: "OR", memoMode: "OR" };

// ================================================================
// 起動
// ================================================================
async function init() {
  const [colRes, listRes, deckRes] = await Promise.all([
    db.from("collection").select("*"),
    db.from("lists").select("*"),
    db.from("decks").select("*"),
  ]);

  if (!colRes.error) {
    colRes.data.forEach(r => {
      collection[r.id] = {
        count: r.count,
        memo: r.memo
      };
    });
  }

  if (!listRes.error) {
    listRes.data.forEach(r => {
      lists[r.name] = r.card_ids || [];
    });
  }

  if (!deckRes.error) {
    deckRes.data.forEach(r => {
      decks[r.name] = {
        memo: r.memo || "",
        cards: r.cards || {}
      };
    });
  }

  // ★ここだけ修正
  fetch("json/cards.json")
    .then(r => {
      if (!r.ok) throw new Error("cards.json が見つかりません");
      return r.json();
    })
    .then(data => {
      cards = data;

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

init();