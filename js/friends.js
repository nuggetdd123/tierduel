// ============================================================
// FRIENDS.JS - FRIEND LIST, REQUESTS, AND REALTIME NOTIFICATIONS
// Split out of duels.js so the Friends tab is fully self-contained.
// ============================================================
import { supabase, getCurrentUser, showConfirmation, showActionToast } from './app.js';
import { getEquippedBadgeMap, equippedBadgeChip } from './bages.js';

let realtimeChannel = null;
let refreshInProgress = false;
let refreshQueued = false;

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

export function initFriends() {
    const addFriendButton = document.getElementById('addFriendBtn');
    if (addFriendButton) addFriendButton.onclick = sendFriendRequest;

    subscribeToChanges();
    refreshFriends();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            subscribeToChanges();
            refreshFriends();
        }
    });
}

function subscribeToChanges() {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    realtimeChannel = supabase.channel('friend-lists')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friend_requests' }, payload => {
            refreshFriends();
            const user = userFromStorage();
            const request = payload.new;
            if (user && request?.receiver_id === user.id) {
                notifyFriendRequest(request);
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, refreshFriends)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friends' }, refreshFriends)
        .subscribe(status => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') alert('🔄 Friends list connection lost. Reconnecting...');
        });
}

async function notifyFriendRequest(request) {
    try {
        const { data: sender } = await supabase.from('app_users').select('username').eq('id', request.sender_id).maybeSingle();
        const name = sender?.username || 'Someone';
        showActionToast(`📨 <strong>${name}</strong> sent you a friend request!`, {
            acceptLabel: '✓ Accept',
            declineLabel: '✕ Decline',
            onAccept: () => window.acceptFriendRequest(request.id),
            onDecline: () => window.declineFriendRequest(request.id)
        });
    } catch (error) {
        console.error('Friend request notification error:', error);
    }
}

export async function refreshFriends() {
    const user = userFromStorage();
    if (!user) return;
    if (refreshInProgress) {
        refreshQueued = true;
        return;
    }
    refreshInProgress = true;
    try {
        await Promise.all([loadFriends(), loadFriendRequests()]);
    } finally {
        refreshInProgress = false;
        if (refreshQueued) {
            refreshQueued = false;
            refreshFriends();
        }
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
        if (!result.error) { input.value = ''; alert('✅ Friend request sent!'); refreshFriends(); }
    } catch (error) {
        console.error('Friend request flow error:', error);
        alert(`❌ Could not send friend request: ${error.message}`);
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

    const friends = result.data
        .map(relation => relation.friend?.id === user.id ? relation.user : relation.friend)
        .filter(Boolean);
    const equippedMap = await getEquippedBadgeMap(friends.map(friend => friend.id));

    friends.forEach(friend => {
        const li = document.createElement('li');
        li.className = 'duel-row';
        const chip = equippedBadgeChip(equippedMap.get(friend.id));
        li.innerHTML = `<div class="duel-who"><span class="avatar-chip">${friend.username[0]}</span><div class="duel-who-text"><strong>${friend.username}${chip}</strong></div></div><div class="duel-actions"><button onclick="window.sendDuelInvite('${friend.id}')" class="pixel-btn-small btn-duel">⚔ Duel</button><button onclick="window.removeFriend('${friend.id}')" class="pixel-btn-small btn-remove">✕</button></div>`;
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
        if (!created.error) refreshFriends();
    } catch (error) { console.error('Accept friend flow error:', error); alert(`❌ Could not accept request: ${error.message}`); }
};

window.declineFriendRequest = async id => { const result = await db(() => supabase.from('friend_requests').delete().eq('id', id), 'Decline friend request', true); if (!result.error) refreshFriends(); };

window.removeFriend = async friendId => {
    const user = userFromStorage();
    if (!user) return alert('Please login');
    if (!await showConfirmation('Remove this friend?')) return;
    const result = await db(() => supabase.from('friends').delete().or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`), 'Remove friend', true);
    if (!result.error) refreshFriends();
};