export const AO_PROCESS_ID = "cjQJlHPPY0OhttRa--cF3KKGzC_zjsdNuWMO8tkAK6I"; 

export const BUNNY_LIBRARY_ID = "563857"; 
export const BUNNY_HOSTNAME = "vz-564d87dc-3df.b-cdn.net"; 
export const PLACEHOLDER_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23222'/%3E%3C/svg%3E";

export const State = {
    userAddress: null,
    isOwner: false,
    points: 0,
    inventory: [],
    activeDecoration: null,
    activeMessageDecoration: null
};

export const escapeHtml = (str) => String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));
export const formatCompact = (n) => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : n;

export async function messageAO(action, data = {}) {
    if (!window.ao || !window.arweaveWallet) return { ok: false, error: "Dependencies missing" };
    try {
        const { message, createDataItemSigner, result } = window.ao;
        const msgId = await message({
            process: AO_PROCESS_ID,
            signer: createDataItemSigner(window.arweaveWallet),
            tags: [{ name: "Action", value: action }],
            data: JSON.stringify(data)
        });
        
        const { Messages } = await result({ process: AO_PROCESS_ID, message: msgId });
        if (Messages && Messages.length > 0) {
            try { return { ok: true, data: JSON.parse(Messages[0].Data) }; } 
            catch (e) { return { ok: true, data: Messages[0].Data }; }
        }
        return { ok: true, msgId };
    } catch (e) {
        console.error("AO Error:", e);
        return { ok: false, error: e.message };
    }
}

export function showCustomConfirm(title, message, onConfirm) {
    if (confirm(`${title}\n\n${message}`)) onConfirm();
}