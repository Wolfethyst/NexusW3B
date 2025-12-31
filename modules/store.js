import { State, messageAO, showCustomConfirm, escapeHtml, formatCompact } from './config.js';

let storeItems = [];

export async function loadLeaderboard() {
  const response = await messageAO("GetLeaderboard");
  if (response.ok && response.data) {
      State.points = response.data.userPoints || 0;
      document.getElementById("headerPoints").textContent = `${formatCompact(State.points)} Crystals`; 
      const lbEl = document.getElementById("leaderboard");
      if (lbEl && response.data.leaderboard) {
          lbEl.innerHTML = response.data.leaderboard.map((u, i) => `
              <div class="lbRow">
                <div class="lbPos">${i+1}</div>
                <div class="lbName">${escapeHtml(u.name)}</div>
                <div class="lbRight">${formatCompact(u.points)}</div>
              </div>
          `).join("");
      }
  }
}

export async function loadStore() { 
    await loadLeaderboard(); 
    const response = await messageAO("GetStoreItems"); 
    if(response.ok && response.data) { 
        storeItems = response.data.items || []; 
        renderStore(); 
    } 
}

export function switchMarketTab(tab) {
    document.getElementById("tabStoreBtn")?.classList.toggle("active", tab === "store");
    renderStore();
}

export function renderStore() {
    const grid = document.getElementById("storeGrid");
    if (!grid) return;
    grid.innerHTML = storeItems.map(item => `
        <div class="store-card">
            <div class="store-card-name">${escapeHtml(item.name)}</div>
            <div class="store-card-cost">${item.cost} Crystals</div>
            <button class="store-btn" onclick="window.buyItem('${item.id}')">Buy</button>
        </div>
    `).join("");
}

export async function buyItem(itemId) {
    const item = storeItems.find(i => i.id === itemId);
    showCustomConfirm("Purchase", `Spend ${item.cost} Crystals?`, async () => {
        const response = await messageAO("Purchase", { itemId });
        if(response.ok) {
            State.points = response.data.balance;
            renderStore();
            loadLeaderboard();
        }
    });
}

export async function equipItem(itemId) {
    await messageAO("Equip", { itemId });
    renderStore();
}