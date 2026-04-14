/**
 * all.js - 極簡穩定版
 */

const CONFIG = {
    CLIENT_ID: '415971804460-9fp8s295pnf0odolbs4mkhte5iqo34ie.apps.googleusercontent.com',
    API_KEY: 'AIzaSyAc59MDK3cy-62QbATDh9ZEoS8ciaHYUXc',
    SPREADSHEET_ID: '1MAhpBxQpdxx39J_5KLSl3v-BJ7EaL6WLP-FKuts87dA',
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets email profile',
    DISCOVERY_DOCS: ['https://sheets.googleapis.com/$discovery/rest?version=v4']
};

let tokenClient, currentUser, masterMenu = [], todayRestaurants = [], orderingOpen = true, masterOrders = [];

window.onload = () => { gapi.load('client', initGapi); google.accounts.id.initialize({ client_id: CONFIG.CLIENT_ID, callback: handleAuthResponse }); initGis(); };
function initGapi() { gapi.client.init({ apiKey: CONFIG.API_KEY, discoveryDocs: CONFIG.DISCOVERY_DOCS }).then(checkAuth); }
function initGis() { tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CONFIG.CLIENT_ID, scope: CONFIG.SCOPES, callback: (r) => { if (r.error) return; const ex = Date.now() + (r.expires_in * 1000); sessionStorage.setItem('g_token', JSON.stringify({...r, expires_at: ex})); loadUserData(); } }); }
function checkAuth() { const t = JSON.parse(sessionStorage.getItem('g_token')); if (t && t.expires_at > Date.now()) { gapi.client.setToken(t); loadUserData(); } else { showView('loginView'); } }
function handleAuthResponse(r) { const ex = Date.now() + (r.expires_in * 1000); sessionStorage.setItem('g_token', JSON.stringify({...r, expires_at: ex})); loadUserData(); }

document.getElementById('loginBtn').onclick = () => tokenClient.requestAccessToken();
document.getElementById('logoutBtn').onclick = () => { sessionStorage.removeItem('g_token'); location.reload(); };

async function loadUserData() {
    showLoading(true);
    try {
        const [uResp, info] = await Promise.all([
            gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'Users!A2:C' }),
            fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${gapi.client.getToken().access_token}` } }).then(res => res.json())
        ]);
        const userEmail = (info.email || '').trim().toLowerCase();
        alert(`[DEBUG] 你登入的 Google 帳號是：\n${userEmail}\n\n若顯示未授權，請將此 email 加入 Users 分頁 B 欄`);
        const rows = uResp.result.values || [];
        const matched = rows.find(row => (row[1] || '').trim().toLowerCase() === userEmail);
        if (!matched) { 
            alert(`未授權！\n您的登入帳號 (${userEmail}) 不在系統白名單內。\n請聯繫管理員確認 Users 分頁中 B 欄的 Email 是否正確。`); 
            return; 
        }
        currentUser = { name: matched[0], email: matched[1], role: matched[2] };
        document.getElementById('userName').innerText = currentUser.name;
        if (currentUser.role === '管理員') document.getElementById('adminTab').classList.remove('hidden');
        await loadAppContent();
        showView('mainView');
    } catch (e) { showView('loginView'); } finally { showLoading(false); }
}

async function loadAppContent() {
    const [m, c, o] = await Promise.all([
        gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'Menu!A2:D' }),
        gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'TodayConfig!A2:B' }),
        gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'Orders!A2:F' })
    ]);
    masterMenu = m.result.values || [];
    todayRestaurants = (c.result.values || []).map(r => r[0]).filter(r => r);
    orderingOpen = (c.result.values && c.result.values[0] && c.result.values[0][1] === 'OPEN');

    const statusLabel = document.getElementById('orderStatusLabel');
    if (statusLabel) statusLabel.innerText = orderingOpen ? '🟢 收單中' : '🔴 已結單';

    const statusDesc = document.getElementById('currentStatusDesc');
    if (statusDesc) statusDesc.innerText = `目前狀態：${orderingOpen ? '收單中' : '已結單'}`;

    const activeDiv = document.getElementById('activeRestaurants');
    if (activeDiv) activeDiv.innerHTML = todayRestaurants.map(r => `<span class="tag">${r}</span>`).join('');

    renderOrderView();
    renderConfirmView(o.result.values || []);
    renderMyOrderView(o.result.values || []);
    renderAdminView();
}

function renderOrderView() {
    const grid = document.getElementById('menuGrid');
    const filtered = masterMenu.filter(i => todayRestaurants.includes(i[0]));
    if (!filtered.length) { 
        grid.innerHTML = `<div style="text-align:center; padding: 60px 20px; grid-column: 1 / -1; background: rgba(255, 255, 255, 0.95); border-radius: 20px; box-shadow: 0 8px 30px rgba(0,0,0,0.12); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.3);">
            <div style="font-size: 80px; margin-bottom: 20px; opacity: 0.9;">🍽️</div>
            <h2 style="color: #1e293b; margin-bottom: 10px; font-weight: 800;">今日尚未開放訂餐</h2>
            <p style="color: #475569; font-size: 1.1rem; font-weight: 500;">大內總管尚未設定今日開放的餐廳，請稍候或提醒大內總管！</p>
        </div>`; 
        return; 
    }
    grid.innerHTML = [...new Set(filtered.map(i => i[0]))].map(res => {
        const items = filtered.filter(i => i[0] === res);
        return res.includes('滷') ? renderChecklist(res, items) : `<div class="restaurant-section"><div class="section-header"><h2>🍱 ${res}</h2></div><div class="menu-grid">${items.map(i => `<div class="menu-card"><div class="menu-card-header"><div class="menu-info"><h3>${i[1]}</h3><div class="price">$${i[2]}</div></div></div><button class="btn btn-secondary" style="width:100%" onclick="submitOrder('${res}','${i[1]}','${i[2]}','')" ${!orderingOpen ? 'disabled' : ''}>${orderingOpen ? '點餐' : '已收單'}</button></div>`).join('')}</div></div>`;
    }).join('');
}

function renderChecklist(res, items) {
    const addons = items.filter(i => (i[3]||'').includes('加購')), prefs = items.filter(i => (i[3]||'').includes('口味')), mains = items.filter(i => !addons.includes(i) && !prefs.includes(i));
    let h = `<div class="restaurant-section checklist-container" style="background:#fff;color:#000;padding:20px;border-radius:15px;"><h2>🏮 ${res}</h2>`;
    [...new Set(mains.map(i => i[3]))].forEach(cat => {
        h += `<b>${cat}</b><div class="checklist-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">${mains.filter(i => i[3] === cat).map(i => `<label style="display:block;padding:10px;background:#f0f0f0;"><input type="checkbox" class="braised-cb" data-price="${i[2]}" data-name="${i[1]}"> ${i[1]} ($${i[2]})</label>`).join('')}</div>`;
    });
    if(addons.length) h += `<br><b>加購</b><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">${addons.map(i => `<label><input type="checkbox" class="braised-addon" data-price="${i[2]}" data-name="${i[1]}"> ${i[1]} (+$${i[2]})</label>`).join('')}</div>`;
    if(prefs.length) h += `<br><b>口味</b><div>${prefs.map(i => `<label><input type="checkbox" class="braised-pref" data-name="${i[1]}"> ${i[1]}</label> `).join('')}</div>`;
    h += `<div class="batch-order-action"><button class="batch-btn" onclick="submitBatch('${res}')" ${!orderingOpen ? 'disabled' : ''}>${orderingOpen ? '確認下單' : '已收單'}</button></div></div>`;
    return h;
}

async function checkRestaurantStatus(res) {
    const c = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'TodayConfig!A2:B' });
    const todayRes = (c.result.values || []).map(r => r[0]).filter(r => r);
    const isOpen = c.result.values && c.result.values[0] && c.result.values[0][1] === 'OPEN';
    if (!isOpen) { alert('目前已經收單，無法繼續點餐！'); await loadAppContent(); return false; }
    if (res && !todayRes.includes(res)) { alert('餐廳設定已變更，請重新點餐！'); await loadAppContent(); return false; }
    return true;
}

async function submitBatch(res) {
    if (!orderingOpen) { alert('目前已收單，無法點餐'); return; }
    showLoading(true);
    try {
        const ok = await checkRestaurantStatus(res);
        if (!ok) return;
        const items = document.querySelectorAll('.braised-cb:checked');
        if(!items.length) return;
        const ads = Array.from(document.querySelectorAll('.braised-addon:checked')).map(c => c.dataset.name);
        const prs = Array.from(document.querySelectorAll('.braised-pref:checked')).map(c => c.dataset.name);
        const batchId = Math.floor(1000 + Math.random() * 9000);
        const baseNote = [...ads, ...prs].join(', ');
        const note = baseNote ? `${baseNote} #B${batchId}` : `#B${batchId}`;
        const time = new Date().toLocaleString();
        const data = Array.from(items).map(c => [time, currentUser.email, res, c.dataset.name, c.dataset.price, note]);
        await gapi.client.sheets.spreadsheets.values.append({ spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'Orders!A:F', valueInputOption: 'USER_ENTERED', resource: { values: data } });
        await loadAppContent();
    } finally {
        showLoading(false);
    }
}

async function submitOrder(res, item, price, note) {
    if (!orderingOpen) { alert('目前已收單，無法點餐'); return; }
    showLoading(true);
    try {
        const ok = await checkRestaurantStatus(res);
        if (!ok) return;
        const batchId = Math.floor(1000 + Math.random() * 9000);
        const finalNote = note ? `${note} #B${batchId}` : `#B${batchId}`;
        await gapi.client.sheets.spreadsheets.values.append({ spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'Orders!A:F', valueInputOption: 'USER_ENTERED', resource: { values: [[new Date().toLocaleString(), currentUser.email, res, item, price, finalNote]] } });
        await loadAppContent();
    } finally {
        showLoading(false);
    }
}

function groupOrders(ordersList) {
    const map = new Map();
    ordersList.forEach((o, i) => {
        const time = o[0], email = o[1], res = o[2];
        const noteRaw = o[5] || '';
        const batchMatch = noteRaw.match(/#B(\d+)/);
        const batchKey = batchMatch ? batchMatch[0] : time;
        const key = batchKey + '|' + email; 
        
        let cleanNote = noteRaw.replace(/#B\d+/g, '').trim();
        if (cleanNote === '') cleanNote = '-';
        if (cleanNote.endsWith(',')) cleanNote = cleanNote.slice(0, -1);

        if (!map.has(key)) map.set(key, { key, time, email, res, name: email.split('@')[0], itemCounts: {}, total: 0, indices: [] });
        const g = map.get(key);
        
        const itemName = o[3];
        const itemNote = cleanNote && cleanNote !== '-' ? `(${cleanNote})` : '';
        const fullItemName = itemName + (itemNote ? ` ${itemNote}` : '');
        
        g.itemCounts[fullItemName] = (g.itemCounts[fullItemName] || 0) + 1;
        g.total += parseInt(o[4] || 0, 10);
        g.indices.push(i);
    });
    const grouped = Array.from(map.values());
    grouped.forEach((g, idx) => { 
        g.orderId = 'ORD-' + String(idx + 1).padStart(3, '0'); 
        g.indices.sort((a, b) => b - a); 
        g.items = Object.entries(g.itemCounts).map(([name, count]) => count > 1 ? `${name} x${count}` : name);
    });
    return grouped.reverse();
}

function renderConfirmView(orders) {
    masterOrders = orders;
    const listBody = document.getElementById('orderListBody');
    const isAdmin = currentUser && currentUser.role === '管理員';
    const grouped = groupOrders(orders);
    
    if (!grouped.length) {
        listBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px; font-weight: 500; color: #64748b;">目前尚未有任何餐點訂單</td></tr>`;
        const totalDisp = document.getElementById('totalAmountDisplay');
        if (totalDisp) totalDisp.innerText = `$0`;
    } else {
        listBody.innerHTML = grouped.map(g => {
            const delBtn = isAdmin ? `<button class="btn-icon" style="color:var(--hot); font-weight:900;" title="刪除整筆訂單" onclick="deleteOrder(${g.indices.join(',')})">X</button>` : `<span style="color:#94a3b8;font-size:0.8rem;">-</span>`;
            return `<tr><td>${g.orderId}</td><td>${g.name}</td><td>${g.items.join('<br>')}</td><td>$${g.total}</td><td style="color:#94a3b8;">-</td><td>${delBtn}</td></tr>`;
        }).join('');
        const total = grouped.reduce((sum, g) => sum + g.total, 0);
        const totalDisp = document.getElementById('totalAmountDisplay');
        if (totalDisp) totalDisp.innerText = `$${total}`;
    }
}

function renderMyOrderView(orders) {
    const listBody = document.getElementById('myOrderListBody');
    if (!listBody) return;
    const grouped = groupOrders(orders).filter(g => currentUser && g.email === currentUser.email);
    
    if (!grouped.length) {
        listBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px; font-weight: 500; color: #64748b;">你今日尚未點餐</td></tr>`;
        const totalDisp = document.getElementById('myTotalAmountDisplay');
        if (totalDisp) totalDisp.innerText = `$0`;
    } else {
        listBody.innerHTML = grouped.map(g => {
            return `<tr><td>${g.orderId}</td><td>${g.res}</td><td>${g.items.join('<br>')}</td><td>$${g.total}</td><td style="color:#94a3b8;">-</td><td><button class="btn-icon" style="color:var(--hot); font-weight:900;" title="刪除我的整筆訂單" onclick="deleteOrder(${g.indices.join(',')})">X</button></td></tr>`;
        }).join('');
        const total = grouped.reduce((sum, g) => sum + g.total, 0);
        const totalDisp = document.getElementById('myTotalAmountDisplay');
        if (totalDisp) totalDisp.innerText = `$${total}`;
    }
}

async function deleteOrder(...indices) {
    if (!confirm('確定要刪除這筆訂單嗎？(這將會刪除此筆訂單內包含的所有項目)')) return;
    showLoading(true);
    try {
        const r = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'Orders!A2:F1000' });
        let rows = r.result.values || [];
        const idxArray = [].concat(...indices).sort((a, b) => b - a);
        idxArray.forEach(idx => rows.splice(idx, 1));
        
        await gapi.client.sheets.spreadsheets.values.clear({ spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'Orders!A2:F1000' });
        if(rows.length) await gapi.client.sheets.spreadsheets.values.update({ spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'Orders!A2', valueInputOption: 'USER_ENTERED', resource: { values: rows } });
        await loadAppContent();
    } finally {
        showLoading(false);
    }
}

function renderAdminView() {
    const list = [...new Set(masterMenu.map(i => i[0]))];
    const emptyRadio = `<label class="checkbox-item"><input type="radio" name="restaurantSetting" value="" ${todayRestaurants.length===0?'checked':''}> (清空，今日不訂餐)</label>`;
    document.getElementById('restaurantSettings').innerHTML = emptyRadio + list.map(r => `<label class="checkbox-item"><input type="radio" name="restaurantSetting" value="${r}" ${todayRestaurants.includes(r)?'checked':''}> ${r}</label>`).join('');
}

document.getElementById('saveConfigBtn').onclick = async () => {
    const sel = document.querySelector('#restaurantSettings input:checked');
    if (!sel) return alert('請選擇設定');
    const chosenRes = sel.value;
    showLoading(true);
    try {
        await gapi.client.sheets.spreadsheets.values.clear({ spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'TodayConfig!A2:A50' });
        if (chosenRes) await gapi.client.sheets.spreadsheets.values.update({ spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'TodayConfig!A2', valueInputOption: 'USER_ENTERED', resource: { values: [[chosenRes]] } });
        const r = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'Orders!A2:F1000' });
        let rows = r.result.values || [];
        const initialLen = rows.length;
        rows = rows.filter(o => chosenRes && o[2] === chosenRes);
        if (rows.length !== initialLen) {
            await gapi.client.sheets.spreadsheets.values.clear({ spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'Orders!A2:F1000' });
            if (rows.length) await gapi.client.sheets.spreadsheets.values.update({ spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'Orders!A2', valueInputOption: 'USER_ENTERED', resource: { values: rows } });
        }
        alert('成功更新設定'); await loadAppContent();
    } finally {
        showLoading(false);
    }
};

const cpBtn = document.getElementById('copyOrderBtn');
if (cpBtn) {
    cpBtn.onclick = () => {
        if (!masterOrders || masterOrders.length === 0) return alert('目前沒有訂單可以複製');
        const grouped = groupOrders(masterOrders).reverse();
        const resName = grouped[0] && grouped[0].res ? grouped[0].res : todayRestaurants[0] || '餐廳';
        let txt = `🍱 今日點餐：${resName}\n---------------------\n`;
        let total = 0;
        grouped.forEach(g => {
            txt += `[${g.orderId}] ${g.name}：${g.items.join(' + ')} $${g.total}\n`;
            total += g.total;
        });
        txt += `---------------------\n📝 總計金額：$${total}`;
        navigator.clipboard.writeText(txt).then(() => alert('已成功複製訂單')).catch(() => alert('複製失敗'));
    };
}

const toggleBtn = document.getElementById('toggleOrderBtn');
if (toggleBtn) {
    toggleBtn.onclick = async () => {
        showLoading(true);
        try {
            const newStatus = orderingOpen ? 'CLOSED' : 'OPEN';
            await gapi.client.sheets.spreadsheets.values.update({ 
                spreadsheetId: CONFIG.SPREADSHEET_ID, 
                range: 'TodayConfig!B2', 
                valueInputOption: 'USER_ENTERED', 
                resource: { values: [[newStatus]] } 
            });
            alert(`已變更收單狀態為：${newStatus}`);
            await loadAppContent();
        } finally {
            showLoading(false);
        }
    };
}

const clearBtn = document.getElementById('clearOrdersBtn');
if (clearBtn) {
    clearBtn.onclick = async () => {
        if(!confirm('確定要清空今日所有點餐紀錄嗎？這會清除資料表上的記錄！')) return;
        showLoading(true);
        try {
            await Promise.all([
                gapi.client.sheets.spreadsheets.values.clear({ spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'Orders!A2:F1000' }),
                gapi.client.sheets.spreadsheets.values.clear({ spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'TodayConfig!A2:A50' })
            ]);
            alert('已清空今日點餐與餐廳設定');
            await loadAppContent();
        } finally {
            showLoading(false);
        }
    };
}

function showView(id) { document.querySelectorAll('.view').forEach(v => v.classList.add('hidden')); document.getElementById(id).classList.remove('hidden'); }
function showLoading(s) { document.getElementById('loadingMask').classList.toggle('hidden', !s); }
document.querySelectorAll('.tab-item').forEach(tab => tab.onclick = () => { document.querySelectorAll('.tab-item, .tab-pane').forEach(el => el.classList.remove('active')); tab.classList.add('active'); document.getElementById(tab.dataset.view).classList.add('active'); if(tab.dataset.view === 'adminView') renderAdminView(); });
