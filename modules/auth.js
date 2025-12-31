import { State } from './config.js';

export async function loadAuth() {
    if (window.arweaveWallet) {
        try {
            await window.arweaveWallet.connect(['ACCESS_ADDRESS', 'SIGN_TRANSACTION']);
            const address = await window.arweaveWallet.getActiveAddress();
            
            State.userAddress = address;
            State.isOwner = (address === "9N1zO4VAUkzweAA6kedaEF1bVXdr1S6V980srj8tfUQ"); 

            renderLoggedInUI(address);
        } catch (err) {
            console.error("Auth Error", err);
        }
    }
}

function renderLoggedInUI(address) {
    const loginArea = document.getElementById("loginArea");
    if (!loginArea) return;
    const display = `${address.slice(0, 5)}...${address.slice(-5)}`;
    loginArea.innerHTML = `<div id="welcomeText" style="color:white; font-weight:bold;">${display}</div>`;
}