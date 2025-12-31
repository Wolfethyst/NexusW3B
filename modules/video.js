import { messageAO, escapeHtml, PLACEHOLDER_IMG, BUNNY_HOSTNAME, State } from './config.js';
import { openVodEditModal } from './admin.js';

let allPlayedGames = [];
let vodsData = []; 

export async function loadVideoData() {
    await loadGames();
    await loadStreamTitle();
    await loadVods();
}

async function loadGames() {
    const response = await messageAO("GetPlayedGames");
    if (response.ok && response.data) {
        allPlayedGames = response.data.games || [];
        renderHubGames();
    }
}

async function loadVods() {
    const response = await messageAO("GetVods");
    if (response.ok && response.data) {
        vodsData = response.data.streams || [];
    }
}

async function loadStreamTitle() {
  const response = await messageAO("GetStreamStatus");
  if (response.ok && response.data) {
    const label = document.getElementById("streamTitleLabel");
    if (label) label.textContent = response.data.title || "Untitled Stream";
  }
}

export function renderHubGames() {
    const grid = document.getElementById('hubGamesGrid');
    if(!grid) return;
    grid.innerHTML = allPlayedGames.map(g => `
        <div class="hub-game-card" onclick="window.openGameDetails('${g.name}')">
            <img src="${g.cover}" onerror="this.src='${PLACEHOLDER_IMG}'">
            <div class="hub-game-title">${escapeHtml(g.name)}</div>
        </div>
    `).join("");
}

export function renderHubGrid(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = items.map(item => `
        <div class="video-card">
            <div class="video-card-thumb"><img src="${item.cover}" onerror="this.src='${PLACEHOLDER_IMG}'"></div>
            <div class="video-card-body"><div class="video-card-title">${escapeHtml(item.title)}</div></div>
        </div>
    `).join("");
}

window.openGameDetails = async function(gameName) {
    const game = allPlayedGames.find(g => g.name === gameName);
    if (!game) return;
    document.getElementById('hub-home-view')?.classList.add('hidden');
    document.getElementById('hub-details-view')?.classList.remove('hidden');
    
    const response = await messageAO("GetVodsByGame", { game: game.name });
    renderHubGrid('hub-content-vods', response.ok ? response.data.streams : []);
};