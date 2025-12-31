// modules/index.js
import { loadAuth } from './auth.js';
import { loadVideoData } from './video.js';
import { loadStore, buyItem, equipItem, switchMarketTab } from './store.js';
import { messageAO, State } from './config.js';

window.buyItem = buyItem;
window.equipItem = equipItem;
window.switchMarketTab = switchMarketTab;

async function initNexus() {
    console.log("Nexus W3B: Booting...");
    const loader = document.getElementById("appLoader");

    try {
        // 1. Fire off all requests at the same time (Concurrent)
        const authTask = loadAuth();
        const stateTask = messageAO("GetInitialState");
        const modulesTask = Promise.allSettled([loadVideoData(), loadStore()]);

        // 2. Wait only for the basic state to be ready
        const res = await stateTask;
        if (res.ok && res.data) {
            State.points = res.data.userPoints || 0;
            const headerPoints = document.getElementById("headerPoints");
            if (headerPoints) headerPoints.textContent = `${State.points.toLocaleString()} Crystals`;
        }

        // 3. We don't need to 'await' modulesTask here; they will finish in the background
    } catch (err) {
        console.error("Boot failed:", err);
    } finally {
        // 4. ALWAYS hide the loader as soon as the main state call returns
        if (loader) loader.classList.add("hidden");
    }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initNexus();
} else {
    window.addEventListener('DOMContentLoaded', initNexus);
}