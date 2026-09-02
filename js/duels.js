// ============================================================
// DUELS.JS - COMPLETE DUEL SYSTEM WITH FRIEND REQUESTS
// ============================================================
import { supabase, getCurrentUser } from './app.js';
import { startDuelPlay } from './duelplay.js';

export function initDuels() {
    initDuelsButtons();
    loadFriends();
    loadDuels();
    loadCompletedDuels();
    loadFriendRequests();
    loadDuelInvites();
    
    setInterval(() => {
        loadFriends();
        loadDuels();
        loadCompletedDuels();
        loadFriendRequests();
        loadDuelInvites();
    }, 5000);
}

function initDuelsButtons() {
    const addFriendBtn = document.getElementById('addFriendBtn');
    if (addFriendBtn) {
        addFriendBtn.onclick = async function () {
            const user = getCurrentUser();
            if (!user) return alert('⚠️ Please login first!');

            const input = document.getElementById('friendSearch');
            const username = input.value.trim();
            if (!username) return alert('Enter a username first.');
            if (username.toLowerCase() === user.username.toLowerCase()) {
                return alert("You can't friend yourself.");
            }

            const { data: target } = await supabase
                .from('app_users')
                .select('id, username')
                .ilike('username', username)
                .maybeSingle();

            if (!target) return alert('❌ User not found.');

            const { data: existing } = await supabase
                .from('friend_requests')
                .select('id')
                .or(`and(sender_id.eq.${user.id},receiver_id.eq.${target.id}),and(sender_id.eq.${target.id},receiver_id.eq.${user.id})`)
                .eq('status', 'pending')
                .maybeSingle();

            if (existing) return alert('⏳ There is already a pending request between you two.');

            const { error } = await supabase
                .from('friend_requests')
                .insert({ sender_id: user.id, receiver_id: target.id, status: 'pending' });

            if (error) return alert('Error: ' + error.message);

            input.value = '';
            alert('✅ Friend request sent!');
            loadFriendRequests();
        };
    }

    const createDuelBtn = document.getElementById('createDuelBtn');
    if (createDuelBtn) {
        createDuelBtn.onclick = async function () {
            const user = getCurrentUser();
            if (!user) return alert('⚠️ Please login first!');

            const opponentInput = document.getElementById('duelOpponent');
            const username = opponentInput.value.trim();
            const type = document.getElementById('duelType').value;
            if (!username) return alert('Enter an opponent username first.');
            if (username.toLowerCase() === user.username.toLowerCase()) {
                return alert("You can't duel yourself.");
            }

            const { data: target } = await supabase
                .from('app_users')
                .select('id, username')
                .ilike('username', username)
                .maybeSingle();

            if (!target) return alert('❌ User not found.');

            const { data: existing } = await supabase
                .from('duel_invites')
                .select('id')
                .or(`and(sender_id.eq.${user.id},receiver_id.eq.${target.id}),and(sender_id.eq.${target.id},receiver_id.eq.${user.id})`)
                .eq('status', 'pending')
                .maybeSingle();

            if (existing) return alert('⏳ There is already a pending duel invite between you two.');

            const { error } = await supabase
                .from('duel_invites')
                .insert({ sender_id: user.id, receiver_id: target.id, type, status: 'pending' });

            if (error) return alert('Error: ' + error.message);

            opponentInput.value = '';
            alert('✅ Duel invite sent!');
            loadDuelInvites();
        };
    }
}

async function loadFriendRequests() {
    const user = JSON.parse(localStorage.getItem('tierduel_user'));
    if (!user) return;
    
    const { data } = await supabase
        .from('friend_requests')
        .select('id, sender:sender_id(id,username), receiver:receiver_id(id,username)')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .eq('status', 'pending');
    
    const list = document.getElementById('friendRequests');
    if (!list) return;
    list.innerHTML = '';
    
    if (!data || !data.length) {
        list.innerHTML = '<li class="duel-empty">No pending friend requests</li>';
        return;
    }
    
    data.forEach(req => {
        const isReceiver = req.receiver.id === user.id;
        const other = isReceiver ? req.sender : req.receiver;
        const li = document.createElement('li');
        li.className = 'duel-row';
        if (isReceiver) {
            li.innerHTML = `
                <div class="duel-who">
                    <span class="avatar-chip">${other.username[0]}</span>
                    <div class="duel-who-text">
                        <strong>${other.username}</strong>
                        <span class="duel-meta">sent a friend request</span>
                    </div>
                </div>
                <div class="duel-actions">
                    <button onclick="window.acceptFriendRequest('${req.id}')" class="pixel-btn-small btn-accept">✓ Accept</button>
                    <button onclick="window.declineFriendRequest('${req.id}')" class="pixel-btn-small btn-decline">✕ Decline</button>
                </div>`;
        } else {
            li.innerHTML = `
                <div class="duel-who">
                    <span class="avatar-chip">${other.username[0]}</span>
                    <div class="duel-who-text">
                        <strong>${other.username}</strong>
                        <span class="duel-meta">request sent</span>
                    </div>
                </div>
                <span class="status-pill status-pending">⏳ Pending</span>`;
        }
        list.appendChild(li);
    });
}

async function loadFriends() {
    const user = JSON.parse(localStorage.getItem('tierduel_user'));
    if (!user) return;
    
    const { data } = await supabase
        .from('friends')
        .select('id, friend:friend_id(id,username), user:user_id(id,username)')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
    
    const list = document.getElementById('friendList');
    if (!list) return;
    list.innerHTML = '';
    
    if (!data || !data.length) {
        list.innerHTML = '<li class="duel-empty">No friends yet — search a username above</li>';
        return;
    }
    
    data.forEach(rel => {
        const friend = rel.friend?.id === user.id ? rel.user : rel.friend;
        if (!friend) return;
        const li = document.createElement('li');
        li.className = 'duel-row';
        li.innerHTML = `
            <div class="duel-who">
                <span class="avatar-chip">${friend.username[0]}</span>
                <div class="duel-who-text"><strong>${friend.username}</strong></div>
            </div>
            <div class="duel-actions">
                <button onclick="window.sendDuelInvite('${friend.id}')" class="pixel-btn-small btn-duel">⚔ Duel</button>
                <button onclick="window.removeFriend('${friend.id}')" class="pixel-btn-small btn-remove">✕</button>
            </div>`;
        list.appendChild(li);
    });
}

async function loadDuelInvites() {
    const user = JSON.parse(localStorage.getItem('tierduel_user'));
    if (!user) return;
    
    const { data } = await supabase
        .from('duel_invites')
        .select('id, sender:sender_id(id,username), receiver:receiver_id(id,username), type')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .eq('status', 'pending');
    
    const list = document.getElementById('duelInvites');
    if (!list) return;
    list.innerHTML = '';
    
    if (!data || !data.length) {
        list.innerHTML = '<li class="duel-empty">No pending duel invites</li>';
        return;
    }
    
    data.forEach(inv => {
        const isReceiver = inv.receiver.id === user.id;
        const other = isReceiver ? inv.sender : inv.receiver;
        const li = document.createElement('li');
        li.className = 'duel-row';
        if (isReceiver) {
            li.innerHTML = `
                <div class="duel-who">
                    <span class="avatar-chip vs">⚔</span>
                    <div class="duel-who-text">
                        <strong>${other.username}</strong>
                        <span class="duel-meta">challenges you • ${inv.type}</span>
                    </div>
                </div>
                <div class="duel-actions">
                    <button onclick="window.acceptDuelInvite('${inv.id}')" class="pixel-btn-small btn-accept">✓ Accept</button>
                    <button onclick="window.declineDuelInvite('${inv.id}')" class="pixel-btn-small btn-decline">✕ Decline</button>
                </div>`;
        } else {
            li.innerHTML = `
                <div class="duel-who">
                    <span class="avatar-chip vs">⚔</span>
                    <div class="duel-who-text">
                        <strong>${other.username}</strong>
                        <span class="duel-meta">invite sent • ${inv.type}</span>
                    </div>
                </div>
                <div class="duel-actions">
                    <button onclick="window.cancelDuelInvite('${inv.id}')" class="pixel-btn-small btn-cancel">✕ Cancel</button>
                </div>`;
        }
        list.appendChild(li);
    });
}

async function loadDuels() {
    const user = JSON.parse(localStorage.getItem('tierduel_user'));
    if (!user) return;
    
    const { data } = await supabase
        .from('duels')
        .select('id, challenger:challenger_id(id,username), opponent:opponent_id(id,username), type, status, challenger_score, opponent_score, winner_id, clip_pool, current_clip_index, round_results')
        .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
        .eq('status', 'active');
    
    const list = document.getElementById('duelList');
    if (!list) return;
    list.innerHTML = '';
    
    if (!data || !data.length) {
        list.innerHTML = '<li class="duel-empty">No active duels — challenge a friend!</li>';
        return;
    }
    
    data.forEach(duel => {
        const isChallenger = duel.challenger.id === user.id;
        const opp = isChallenger ? duel.opponent : duel.challenger;
        const li = document.createElement('li');
        li.className = 'duel-row';
        const myScore = isChallenger ? duel.challenger_score : duel.opponent_score;
        const oppScore = isChallenger ? duel.opponent_score : duel.challenger_score;
        li.innerHTML = `
            <div class="duel-who">
                <span class="avatar-chip vs">⚔</span>
                <div class="duel-who-text">
                    <strong>${opp.username}</strong>
                    <span class="duel-meta">${duel.type}</span>
                </div>
            </div>
            <div class="duel-score">${myScore} : ${oppScore}</div>
            <div class="duel-actions">
                <button onclick="window.playDuel('${duel.id}')" class="pixel-btn-small btn-play">▶ Play</button>
                <button onclick="window.forfeitDuel('${duel.id}')" class="pixel-btn-small btn-remove">✕</button>
            </div>`;
        list.appendChild(li);
    });
}

async function loadCompletedDuels() {
    const user = JSON.parse(localStorage.getItem('tierduel_user'));
    if (!user) return;
    
    const { data } = await supabase
        .from('duels')
        .select('id, challenger:challenger_id(id,username), opponent:opponent_id(id,username), type, status, challenger_score, opponent_score, winner_id, finished_at')
        .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
        .eq('status', 'finished')
        .order('finished_at', { ascending: false })
        .limit(20);
    
    const list = document.getElementById('completedDuelsList');
    if (!list) return;
    list.innerHTML = '';
    
    if (!data || !data.length) {
        list.innerHTML = '<li class="duel-empty">No completed duels yet</li>';
        return;
    }
    
    data.forEach(duel => {
        const isChallenger = duel.challenger.id === user.id;
        const opp = isChallenger ? duel.opponent : duel.challenger;
        const won = duel.winner_id === user.id;
        const li = document.createElement('li');
        li.className = 'duel-row';
        const myScore = isChallenger ? duel.challenger_score : duel.opponent_score;
        const oppScore = isChallenger ? duel.opponent_score : duel.challenger_score;
        li.innerHTML = `
            <div class="duel-who">
                <span class="avatar-chip vs">⚔</span>
                <div class="duel-who-text">
                    <strong>${opp.username}</strong>
                    <span class="duel-meta">${duel.type}</span>
                </div>
            </div>
            <div class="duel-score">${myScore} : ${oppScore}</div>
            <span class="status-pill ${won ? 'status-won' : 'status-lost'}">${won ? '🏆 Won' : '💀 Lost'}</span>
        `;
        list.appendChild(li);
    });
}

// ============================================================
// WINDOW-SCOPED HANDLERS
// ============================================================

window.acceptFriendRequest = async (id) => {
    const user = getCurrentUser();
    if (!user) return alert('Please login');

    const { data: req } = await supabase
        .from('friend_requests')
        .select('sender_id, receiver_id')
        .eq('id', id)
        .single();

    if (!req) return;

    const { error: updateError } = await supabase
        .from('friend_requests')
        .update({ status: 'accepted' })
        .eq('id', id);

    if (updateError) return alert('Error: ' + updateError.message);

    const { error: insertError } = await supabase
        .from('friends')
        .insert({ user_id: req.sender_id, friend_id: req.receiver_id });

    if (insertError) return alert('Error: ' + insertError.message);

    loadFriendRequests();
    loadFriends();
};

window.declineFriendRequest = async (id) => {
    await supabase
        .from('friend_requests')
        .delete()
        .eq('id', id);

    loadFriendRequests();
};

window.removeFriend = async (friendId) => {
    const user = getCurrentUser();
    if (!user) return alert('Please login');
    if (!confirm('Remove this friend?')) return;

    const { error } = await supabase
        .from('friends')
        .delete()
        .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`);

    if (error) return alert('Error: ' + error.message);
    loadFriends();
};

window.sendDuelInvite = async (friendId) => {
    const user = getCurrentUser();
    if (!user) return alert('Please login');

    const { data: existing } = await supabase
        .from('duel_invites')
        .select('id')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`)
        .eq('status', 'pending')
        .maybeSingle();

    if (existing) {
        alert('⏳ You already have a pending duel invite with this user!');
        return;
    }

    const type = document.getElementById('duelType')?.value || 'FT3';

    const { error } = await supabase
        .from('duel_invites')
        .insert({ sender_id: user.id, receiver_id: friendId, type, status: 'pending' });

    if (error) return alert('Error: ' + error.message);
    alert('✅ Duel invite sent!');
    loadDuelInvites();
};

// ============================================================
// 🔥 FIXED: ACCEPT DUEL INVITE WITH CLIP POOL
// ============================================================
window.acceptDuelInvite = async (id) => {
    console.log('⚔️ Accepting duel invite:', id);
    const user = getCurrentUser();
    if (!user) return alert('Please login');

    // Check if user already has an active duel
    const { data: activeDuel } = await supabase
        .from('duels')
        .select('id')
        .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
        .eq('status', 'active')
        .maybeSingle();
    if (activeDuel) {
        console.log('❌ User already has active duel:', activeDuel);
        return alert('❌ You already have an active duel!');
    }

    // Get the invite
    const { data: inv } = await supabase
        .from('duel_invites')
        .select('sender_id, receiver_id, type')
        .eq('id', id)
        .single();

    if (!inv) {
        console.log('❌ Invite not found');
        return alert('Invite not found');
    }
    console.log('📋 Invite data:', inv);

    // Check if opponent has an active duel
    const { data: opponentActive } = await supabase
        .from('duels')
        .select('id')
        .or(`challenger_id.eq.${inv.sender_id},opponent_id.eq.${inv.sender_id}`)
        .eq('status', 'active')
        .maybeSingle();
    if (opponentActive) {
        console.log('❌ Opponent has active duel:', opponentActive);
        return alert('❌ Opponent already has an active duel!');
    }

    // ✅ Get approved clips for the duel
    const { data: clips } = await supabase
        .from('submissions')
        .select('id')
        .eq('status', 'approved')
        .eq('verification_status', 'verified');

    console.log('📦 Clips found:', clips?.length || 0);

    if (!clips || clips.length === 0) {
        return alert('❌ No verified clips available. Please upload some clips first!');
    }

    // ✅ Shuffle and select clips based on duel type
    const totalRounds = inv.type === 'FT3' ? 3 : 5;
    console.log('🎯 Duel type:', inv.type, 'Total rounds needed:', totalRounds);
    
    const shuffled = clips.sort(() => Math.random() - 0.5);
    const selectedClips = shuffled.slice(0, totalRounds);
    console.log('✅ Selected clips:', selectedClips.length);

    if (selectedClips.length < totalRounds) {
        return alert(`❌ Not enough clips! Need ${totalRounds} clips for ${inv.type}, only have ${selectedClips.length}.`);
    }

    const clipIds = selectedClips.map(c => c.id);
    console.log('🎯 Clip pool:', clipIds);

    // ✅ Create the duel with clip_pool
    const { data: duel, error: insertError } = await supabase
        .from('duels')
        .insert({
            challenger_id: inv.sender_id,
            opponent_id: inv.receiver_id,
            type: inv.type,
            status: 'active',
            challenger_score: 0,
            opponent_score: 0,
            clip_pool: clipIds,
            current_clip_index: 0,
            round_results: []
        })
        .select()
        .single();

    if (insertError) {
        console.error('❌ Insert error:', insertError);
        return alert('Error: ' + insertError.message);
    }

    console.log('✅ Duel created with clip_pool:', duel.clip_pool);

    // ✅ Delete the invite
    await supabase
        .from('duel_invites')
        .delete()
        .eq('id', id);

    alert('⚔️ Duel started!');
    loadDuelInvites();
    loadDuels();
    
    // ✅ Start duel play
    startDuelPlay(duel.id);
};

window.declineDuelInvite = async (id) => {
    await supabase
        .from('duel_invites')
        .delete()
        .eq('id', id);

    alert('❌ Duel declined');
    loadDuelInvites();
};

window.cancelDuelInvite = async (id) => {
    if (!confirm('Cancel this duel invite?')) return;
    await supabase
        .from('duel_invites')
        .delete()
        .eq('id', id);
    alert('❌ Cancelled');
    loadDuelInvites();
};

window.forfeitDuel = async (id) => {
    const user = getCurrentUser();
    if (!user) return alert('Please login');
    if (!confirm('Forfeit this duel? This counts as a loss.')) return;

    const { data: duel } = await supabase
        .from('duels')
        .select('challenger_id, opponent_id')
        .eq('id', id)
        .single();

    if (!duel) return;

    const winnerId = duel.challenger_id === user.id ? duel.opponent_id : duel.challenger_id;

    const { error } = await supabase
        .from('duels')
        .update({ status: 'finished', winner_id: winnerId, finished_at: new Date().toISOString() })
        .eq('id', id);

    if (error) return alert('Error: ' + error.message);
    loadDuels();
    loadCompletedDuels();
};

window.playDuel = (id) => {
    startDuelPlay(id);
};