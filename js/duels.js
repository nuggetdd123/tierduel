// ============================================================
// DUELS.JS - REALTIME DUEL LISTS, FRIENDS, AND INVITES
// ============================================================
import { startDuelPlay } from './duelplay.js';
import { supabase, getCurrentUser, getYouTubeEmbedUrl, showConfirmation, showToast } from './app.js';
let realtimeChannel = null;
let refreshInProgress = false;
let refreshQueued = false;
const duelLaunches = new Set();

async function db(operation, label, notify = false) {
    try {
        const result = await operation();
        if (result.error) throw result.error;
        return result;
    } catch (error) {
        console.error(`${label} error:`, error);
        if (notify) alert(`❌ ${label}: ${error.message}`);
        return { data: null, error };
    }
}

function userFromStorage() {
    return getCurrentUser();
}

export function initDuels() {
    initButtons();
    subscribeToChanges();
    refreshLists();
}

function subscribeToChanges() {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    realtimeChannel = supabase.channel('duel-lists')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'duel_invites' }, payload => {
            refreshLists();
            const user = userFromStorage();
            if (payload.eventType === 'INSERT' && user && payload.new?.receiver_id === user.id) {
                showToast('⚔️ You received a new duel request!');
            }
        })
        .on('broadcast', { event: 'duel-started' }, payload => {
            const user = userFromStorage();
            const duel = payload.payload;
            refreshLists();
            if (user && duel?.status === 'active' &&
                (duel.challenger_id === user.id || duel.opponent_id === user.id)) {
                openDuel(duel.id);
            }
        })
        .on('broadcast', { event: 'duel-invite-created' }, payload => {
            const user = userFromStorage();
            refreshLists();
            if (user && payload.payload?.receiver_id === user.id) {
                showToast(`⚔️ ${payload.payload.sender_username || 'A player'} sent you a duel request!`);
            }
        })
        .on('broadcast', { event: 'duel-finished' }, refreshLists)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'duels' }, payload => {
            refreshLists();
            const user = userFromStorage();
            const duel = payload.new;
            if (payload.eventType === 'INSERT' && user && duel?.status === 'active' &&
                (duel.challenger_id === user.id || duel.opponent_id === user.id)) {
                openDuel(duel.id);
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, refreshLists)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friends' }, refreshLists)
        .subscribe(status => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') alert('🔄 Duel list connection lost. Reconnecting...');
        });
}

function openDuel(duelId) {
    if (!duelId || duelLaunches.has(duelId)) return;
    duelLaunches.add(duelId);
    startDuelPlay(duelId).catch(error => {
        console.error('Open duel error:', error);
        alert(`❌ Could not open duel: ${error.message}`);
    }).finally(() => duelLaunches.delete(duelId));
}

async function broadcastDuelEvent(event, payload) {
    try {
        await realtimeChannel?.send({ type: 'broadcast', event, payload });
    } catch (error) {
        console.error('Duel realtime broadcast error:', error);
    }
}

async function refreshLists() {
    const user = userFromStorage();
    if (!user) return;
    if (refreshInProgress) {
        refreshQueued = true;
        return;
    }
    refreshInProgress = true;
    try {
        await Promise.all([loadFriends(), loadDuels(), loadCompletedDuels(), loadFriendRequests(), loadDuelInvites()]);
    } finally {
        refreshInProgress = false;
        if (refreshQueued) {
            refreshQueued = false;
            refreshLists();
        }
    }
}

function initButtons() {
    initDuelTypePicker();
    const addFriendButton = document.getElementById('addFriendBtn');
    if (addFriendButton) addFriendButton.onclick = sendFriendRequest;
    const createDuelButton = document.getElementById('createDuelBtn');
    if (createDuelButton) createDuelButton.onclick = createDuelInvite;
    const clearHistoryButton = document.getElementById('clearDuelHistoryBtn');
    if (clearHistoryButton) clearHistoryButton.onclick = clearDuelHistory;
}

function initDuelTypePicker() {
    const button = document.getElementById('duelTypeButton');
    const menu = document.getElementById('duelTypeMenu');
    const select = document.getElementById('duelType');
    if (!button || !menu || !select) return;

    button.onclick = () => {
        menu.hidden = !menu.hidden;
        button.setAttribute('aria-expanded', String(!menu.hidden));
    };
    menu.querySelectorAll('[data-value]').forEach(option => {
        option.onclick = () => {
            select.value = option.dataset.value;
            button.textContent = option.textContent;
            menu.querySelectorAll('[data-value]').forEach(item => item.setAttribute('aria-selected', String(item === option)));
            menu.hidden = true;
            button.setAttribute('aria-expanded', 'false');
        };
    });
    document.addEventListener('click', event => {
        if (!event.target.closest('.duel-type-picker')) {
            menu.hidden = true;
            button.setAttribute('aria-expanded', 'false');
        }
    });
}

async function clearDuelHistory() {
    const user = userFromStorage();
    if (!user) return alert('Please login');
    if (!await showConfirmation('Clear all your completed duel history? This cannot be undone.')) return;

    try {
        const result = await db(() => supabase
            .from('duels')
            .delete()
            .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
            .eq('status', 'finished'), 'Clear duel history', true);
        if (!result.error) {
            alert('✅ Duel history cleared.');
            refreshLists();
        }
    } catch (error) {
        console.error('Clear duel history flow error:', error);
        alert(`❌ Could not clear duel history: ${error.message}`);
    }
}

async function sendFriendRequest() {
    const user = userFromStorage();
    const input = document.getElementById('friendSearch');
    if (!user) return alert('⚠️ Please login first!');
    const username = input.value.trim();
    if (!username) return alert('Enter a username first.');
    if (username.toLowerCase() === user.username.toLowerCase()) return alert("You can't friend yourself.");

    try {
        const targetResult = await db(() => supabase.from('app_users').select('id, username').ilike('username', username).maybeSingle(), 'Find user');
        if (!targetResult.data) return alert('❌ User not found.');
        const existing = await db(() => supabase.from('friend_requests').select('id').or(`and(sender_id.eq.${user.id},receiver_id.eq.${targetResult.data.id}),and(sender_id.eq.${targetResult.data.id},receiver_id.eq.${user.id})`).eq('status', 'pending').maybeSingle(), 'Check friend request');
        if (existing.data) return alert('⏳ There is already a pending request between you two.');
        const result = await db(() => supabase.from('friend_requests').insert({ sender_id: user.id, receiver_id: targetResult.data.id, status: 'pending' }), 'Send friend request', true);
        if (!result.error) { input.value = ''; alert('✅ Friend request sent!'); refreshLists(); }
    } catch (error) {
        console.error('Friend request flow error:', error);
        alert(`❌ Could not send friend request: ${error.message}`);
    }
}

async function createDuelInvite() {
    const user = userFromStorage();
    const input = document.getElementById('duelOpponent');
    if (!user) return alert('⚠️ Please login first!');
    const username = input.value.trim();
    const type = document.getElementById('duelType').value;
    if (!username) return alert('Enter an opponent username first.');
    if (username.toLowerCase() === user.username.toLowerCase()) return alert("You can't duel yourself.");

    try {
        const targetResult = await db(() => supabase.from('app_users').select('id, username').ilike('username', username).maybeSingle(), 'Find opponent');
        if (!targetResult.data) return alert('❌ User not found.');
        const existing = await db(() => supabase.from('duel_invites').select('id').or(`and(sender_id.eq.${user.id},receiver_id.eq.${targetResult.data.id}),and(sender_id.eq.${targetResult.data.id},receiver_id.eq.${user.id})`).eq('status', 'pending').maybeSingle(), 'Check duel invite');
        if (existing.data) return alert('⏳ There is already a pending duel invite between you two.');
        const result = await db(() => supabase.from('duel_invites').insert({ sender_id: user.id, receiver_id: targetResult.data.id, type, status: 'pending' }), 'Send duel invite', true);
        if (!result.error) {
            input.value = '';
            alert('✅ Duel invite sent!');
            refreshLists();
            await broadcastDuelEvent('duel-invite-created', { receiver_id: targetResult.data.id, sender_username: user.username });
        }
    } catch (error) {
        console.error('Duel invite flow error:', error);
        alert(`❌ Could not send duel invite: ${error.message}`);
    }
}

async function loadFriendRequests() {
    const user = userFromStorage();
    const list = document.getElementById('friendRequests');
    if (!user || !list) return;
    const result = await db(() => supabase.from('friend_requests').select('id, sender:sender_id(id,username), receiver:receiver_id(id,username)').or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).eq('status', 'pending'), 'Load friend requests');
    list.innerHTML = '';
    if (!result.data?.length) return void (list.innerHTML = '<li class="duel-empty">No pending friend requests</li>');
    result.data.forEach(request => {
        const receiver = request.receiver?.id === user.id;
        const other = receiver ? request.sender : request.receiver;
        const li = document.createElement('li');
        li.className = 'duel-row';
        li.innerHTML = `<div class="duel-who"><span class="avatar-chip">${other.username[0]}</span><div class="duel-who-text"><strong>${other.username}</strong><span class="duel-meta">${receiver ? 'sent a friend request' : 'request sent'}</span></div></div>${receiver ? `<div class="duel-actions"><button onclick="window.acceptFriendRequest('${request.id}')" class="pixel-btn-small btn-accept">✓ Accept</button><button onclick="window.declineFriendRequest('${request.id}')" class="pixel-btn-small btn-decline">✕ Decline</button></div>` : '<span class="status-pill status-pending">⏳ Pending</span>'}`;
        list.appendChild(li);
    });
}

async function loadFriends() {
    const user = userFromStorage();
    const list = document.getElementById('friendList');
    if (!user || !list) return;
    const result = await db(() => supabase.from('friends').select('id, friend:friend_id(id,username), user:user_id(id,username)').or(`user_id.eq.${user.id},friend_id.eq.${user.id}`), 'Load friends');
    list.innerHTML = '';
    if (!result.data?.length) return void (list.innerHTML = '<li class="duel-empty">No friends yet — search a username above</li>');
    result.data.forEach(relation => {
        const friend = relation.friend?.id === user.id ? relation.user : relation.friend;
        if (!friend) return;
        const li = document.createElement('li');
        li.className = 'duel-row';
        li.innerHTML = `<div class="duel-who"><span class="avatar-chip">${friend.username[0]}</span><div class="duel-who-text"><strong>${friend.username}</strong></div></div><div class="duel-actions"><button onclick="window.sendDuelInvite('${friend.id}')" class="pixel-btn-small btn-duel">⚔ Duel</button><button onclick="window.removeFriend('${friend.id}')" class="pixel-btn-small btn-remove">✕</button></div>`;
        list.appendChild(li);
    });
}

async function loadDuelInvites() {
    const user = userFromStorage();
    const list = document.getElementById('duelInvites');
    if (!user || !list) return;
    const result = await db(() => supabase.from('duel_invites').select('id, sender:sender_id(id,username), receiver:receiver_id(id,username), type').or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).eq('status', 'pending'), 'Load duel invites');
    list.innerHTML = '';
    if (!result.data?.length) return void (list.innerHTML = '<li class="duel-empty">No pending duel invites</li>');
    result.data.forEach(invite => {
        const receiver = invite.receiver?.id === user.id;
        const other = receiver ? invite.sender : invite.receiver;
        const action = receiver ? `<button onclick="window.acceptDuelInvite('${invite.id}')" class="pixel-btn-small btn-accept">✓ Accept</button><button onclick="window.declineDuelInvite('${invite.id}')" class="pixel-btn-small btn-decline">✕ Decline</button>` : `<button onclick="window.cancelDuelInvite('${invite.id}')" class="pixel-btn-small btn-cancel">✕ Cancel</button>`;
        const li = document.createElement('li');
        li.className = 'duel-row';
        li.innerHTML = `<div class="duel-who"><span class="avatar-chip vs">⚔</span><div class="duel-who-text"><strong>${other.username}</strong><span class="duel-meta">${receiver ? 'challenges you' : 'invite sent'} • ${invite.type}</span></div></div><div class="duel-actions">${action}</div>`;
        list.appendChild(li);
    });
}

async function loadDuels() {
    const user = userFromStorage();
    const list = document.getElementById('duelList');
    if (!user || !list) return;
    const result = await db(() => supabase.from('duels').select('id, challenger:challenger_id(id,username), opponent:opponent_id(id,username), type, status, challenger_score, opponent_score').or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`).eq('status', 'active'), 'Load active duels');
    list.innerHTML = '';
    if (!result.data?.length) return void (list.innerHTML = '<li class="duel-empty">No active duels — challenge a friend!</li>');
    result.data.forEach(duel => {
        const challenger = duel.challenger?.id === user.id;
        const opponent = challenger ? duel.opponent : duel.challenger;
        const myScore = challenger ? duel.challenger_score : duel.opponent_score;
        const opponentScore = challenger ? duel.opponent_score : duel.challenger_score;
        const li = document.createElement('li');
        li.className = 'duel-row';
        li.innerHTML = `<div class="duel-who"><span class="avatar-chip vs">⚔</span><div class="duel-who-text"><strong>${opponent.username}</strong><span class="duel-meta">${duel.type}</span></div></div><div class="duel-score">${myScore} : ${opponentScore}</div><div class="duel-actions"><button onclick="window.playDuel('${duel.id}')" class="pixel-btn-small btn-play">▶ Play</button><button onclick="window.forfeitDuel('${duel.id}')" class="pixel-btn-small btn-remove">✕</button></div>`;
        list.appendChild(li);
    });
}

async function loadCompletedDuels() {
    const user = userFromStorage();
    const list = document.getElementById('completedDuelsList');
    if (!user || !list) return;
    const result = await db(() => supabase.from('duels').select('id, challenger:challenger_id(id,username), opponent:opponent_id(id,username), type, status, challenger_score, opponent_score, winner_id, finished_at').or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`).eq('status', 'finished').order('finished_at', { ascending: false }).limit(20), 'Load completed duels');
    list.innerHTML = '';
    if (!result.data?.length) return void (list.innerHTML = '<li class="duel-empty">No completed duels yet</li>');
    result.data.forEach(duel => {
        const challenger = duel.challenger?.id === user.id;
        const opponent = challenger ? duel.opponent : duel.challenger;
        const won = duel.winner_id === user.id;
        const li = document.createElement('li');
        li.className = 'duel-row';
        li.innerHTML = `<div class="duel-who"><span class="avatar-chip vs">⚔</span><div class="duel-who-text"><strong>${opponent.username}</strong><span class="duel-meta">${duel.type}</span></div></div><div class="duel-score">${challenger ? duel.challenger_score : duel.opponent_score} : ${challenger ? duel.opponent_score : duel.challenger_score}</div><span class="status-pill ${won ? 'status-won' : 'status-lost'}">${won ? '🏆 Won' : '💀 Lost'}</span>`;
        list.appendChild(li);
    });
}

window.acceptFriendRequest = async id => {
    const user = userFromStorage();
    if (!user) return alert('Please login');
    try {
        const request = await db(() => supabase.from('friend_requests').select('sender_id, receiver_id').eq('id', id).single(), 'Load friend request');
        if (!request.data) return;
        const updated = await db(() => supabase.from('friend_requests').update({ status: 'accepted' }).eq('id', id), 'Accept friend request', true);
        if (updated.error) return;
        const created = await db(() => supabase.from('friends').insert({ user_id: request.data.sender_id, friend_id: request.data.receiver_id }), 'Create friendship', true);
        if (!created.error) refreshLists();
    } catch (error) { console.error('Accept friend flow error:', error); alert(`❌ Could not accept request: ${error.message}`); }
};

window.declineFriendRequest = async id => { const result = await db(() => supabase.from('friend_requests').delete().eq('id', id), 'Decline friend request', true); if (!result.error) refreshLists(); };
window.removeFriend = async friendId => {
    const user = userFromStorage();
    if (!user) return alert('Please login');
    if (!await showConfirmation('Remove this friend?')) return;
    const result = await db(() => supabase.from('friends').delete().or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`), 'Remove friend', true);
    if (!result.error) refreshLists();
};
window.sendDuelInvite = async friendId => {
    const user = userFromStorage();
    if (!user) return alert('Please login');
    const type = document.getElementById('duelType')?.value || 'FT3';
    const existing = await db(() => supabase.from('duel_invites').select('id').or(`and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`).eq('status', 'pending').maybeSingle(), 'Check duel invite');
    if (existing.data) return alert('⏳ You already have a pending duel invite with this user!');
    const result = await db(() => supabase.from('duel_invites').insert({ sender_id: user.id, receiver_id: friendId, type, status: 'pending' }), 'Send duel invite', true);
    if (!result.error) {
        alert('✅ Duel invite sent!');
        refreshLists();
        await broadcastDuelEvent('duel-invite-created', { receiver_id: friendId, sender_username: user.username });
    }
};

window.acceptDuelInvite = async id => {
    const user = userFromStorage();
    if (!user) return alert('Please login');
    try {
        const invite = await db(() => supabase.from('duel_invites').select('sender_id, receiver_id, type').eq('id', id).single(), 'Load duel invite');
        if (!invite.data) return alert('Invite not found');
        const clipsResult = await db(() => supabase.from('submissions').select('id, video_url').eq('status', 'approved'), 'Load duel clips');
        const uniqueClips = [...new Map((clipsResult.data || []).map(clip => [getYouTubeEmbedUrl(clip.video_url.trim()), clip])).values()];
        const rounds = invite.data.type === 'FT5' ? 5 : 3;
        if (uniqueClips.length < rounds) return alert(`❌ Not enough unique clips. Need ${rounds}.`);
        const clipIds = uniqueClips.sort(() => Math.random() - 0.5).slice(0, rounds).map(clip => clip.id);
        const duelResult = await db(() => supabase.from('duels').insert({ challenger_id: invite.data.sender_id, opponent_id: invite.data.receiver_id, type: invite.data.type, status: 'active', challenger_score: 0, opponent_score: 0, clip_pool: clipIds, current_clip_index: 0, round_results: [] }).select().single(), 'Create duel', true);
        if (duelResult.error) return;
        const removed = await db(() => supabase.from('duel_invites').delete().eq('id', id), 'Remove duel invite', true);
        if (removed.error) return;
        alert('⚔️ Duel started!');
        refreshLists();
        openDuel(duelResult.data.id);
        await realtimeChannel?.send({
            type: 'broadcast',
            event: 'duel-started',
            payload: {
                id: duelResult.data.id,
                status: 'active',
                challenger_id: invite.data.sender_id,
                opponent_id: invite.data.receiver_id
            }
        });
    } catch (error) { console.error('Accept duel flow error:', error); alert(`❌ Could not start duel: ${error.message}`); }
};

window.declineDuelInvite = async id => { const result = await db(() => supabase.from('duel_invites').delete().eq('id', id), 'Decline duel invite', true); if (!result.error) refreshLists(); };
window.cancelDuelInvite = async id => { if (!await showConfirmation('Cancel this duel invite?')) return; const result = await db(() => supabase.from('duel_invites').delete().eq('id', id), 'Cancel duel invite', true); if (!result.error) refreshLists(); };
window.forfeitDuel = async id => {
    const user = userFromStorage();
    if (!user) return alert('Please login');
    if (!await showConfirmation('Forfeit this duel? This counts as a loss.')) return;
    try {
        const duel = await db(() => supabase.from('duels').select('challenger_id, opponent_id').eq('id', id).eq('status', 'active').single(), 'Load duel');
        if (!duel.data) return;
        const winnerId = duel.data.challenger_id === user.id ? duel.data.opponent_id : duel.data.challenger_id;
        const result = await db(() => supabase.from('duels').update({ status: 'finished', winner_id: winnerId, finished_at: new Date().toISOString() }).eq('id', id).eq('status', 'active'), 'Forfeit duel', true);
        if (!result.error) refreshLists();
    } catch (error) { console.error('Forfeit flow error:', error); alert(`❌ Could not forfeit duel: ${error.message}`); }
};

window.rematchDuel = async id => {
    const user = userFromStorage();
    if (!user) return alert('Please login');
    try {
        const duel = await db(() => supabase.from('duels').select('challenger_id, opponent_id, type').eq('id', id).single(), 'Load rematch');
        if (!duel.data) return;
        const opponentId = duel.data.challenger_id === user.id ? duel.data.opponent_id : duel.data.challenger_id;
        const result = await db(() => supabase.from('duel_invites').insert({ sender_id: user.id, receiver_id: opponentId, type: duel.data.type, status: 'pending' }), 'Send rematch invite', true);
        if (!result.error) alert('✅ Rematch invite sent!');
    } catch (error) { console.error('Rematch flow error:', error); alert(`❌ Could not send rematch: ${error.message}`); }
};

window.playDuel = id => startDuelPlay(id);
