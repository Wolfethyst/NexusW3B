import { messageAO, State } from './config.js';
import { loadVideoData } from './video.js';

export function openVodEditModal(e, vodId) {
    if (e) e.stopPropagation(); 
    const modal = document.getElementById('vodEditModal');
    const idInput = document.getElementById('editVodId');
    if (idInput) idInput.value = vodId;
    if (modal) modal.classList.add('open');
}

export async function executeClearChat() {
    const response = await messageAO("ClearChat");
    if (!response.ok) alert("AO Action Failed");
}

const saveVodBtn = document.getElementById('saveVodBtn');
if (saveVodBtn) {
    saveVodBtn.onclick = async () => {
        const data = {
            id: document.getElementById('editVodId').value,
            title: document.getElementById('editVodTitle').value,
            game: document.getElementById('editVodGame').value
        };
        const response = await messageAO("UpdateVod", data);
        if(response.ok) {
            document.getElementById('vodEditModal').classList.remove('open');
            loadVideoData();
        }
    };
}