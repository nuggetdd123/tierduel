import { supabase, getCurrentUser, getYouTubeEmbedUrl, showPrompt, showConfirmation, showToast } from './app.js';

let activeModTab = 'clips';

export function initModerator() {
    loadPendingSubmissions();
    loadPendingSuggestions();
    initModTabs();

    document.querySelector('[data-view="moderator"]')?.addEventListener('click', () => {
        setTimeout(() => {
            loadPendingSubmissions();
            loadPendingSuggestions();
        }, 100);
    });
}

// ============================================================
// TABS — Pending Clips / Suggestions
// ============================================================
function initModTabs() {
    document.querySelectorAll('.mod-tab').forEach(button => {
        button.onclick = () => switchModTab(button.dataset.modTab);
    });
}

function switchModTab(tab) {
    activeModTab = tab;

    document.querySelectorAll('.mod-tab').forEach(button => {
        const isActive = button.dataset.modTab === tab;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    const clipsPanel = document.getElementById('modTabClips');
    const suggestionsPanel = document.getElementById('modTabSuggestions');
    if (clipsPanel) clipsPanel.hidden = tab !== 'clips';
    if (suggestionsPanel) suggestionsPanel.hidden = tab !== 'suggestions';
}

async function loadPendingSubmissions() {
    const user = getCurrentUser();
    
    if (!user) {
        const list = document.getElementById('pendingSubmissions');
        if (list) list.innerHTML = '<li>⚠️ Please login first!</li>';
        return;
    }
    
    if (!user.is_moderator) {
        const list = document.getElementById('pendingSubmissions');
        if (list) list.innerHTML = '<li>⚠️ You are not a moderator!</li>';
        return;
    }
    
    const { data } = await supabase
        .from('submissions')
        .select('*, submitter:user_id(username)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
    
    const list = document.getElementById('pendingSubmissions');
    list.innerHTML = '';
    
    updateModTabCount('modClipsCount', data?.length || 0);

    if (!data || data.length === 0) {
        list.innerHTML = '<li class="duel-empty">📋 No pending submissions</li>';
        return;
    }
    
    for (const sub of data) {
        const li = document.createElement('li');
        const embedUrl = getYouTubeEmbedUrl(sub.video_url);
        
        const verificationBadge = sub.verification_status === 'verified' 
            ? '✅ Verified' 
            : sub.verification_status === 'rejected' 
            ? '❌ Rejected' 
            : '⏳ Pending';
        
        li.innerHTML = `
            <div style="flex:1;min-width:200px;">
                <div style="margin-bottom:4px;">
                    <span style="color:var(--gold);font-family:var(--font-mono);font-weight:700;font-size:0.7rem;">👤 Submitted by: ${sub.submitter?.username || 'Unknown user'}</span>
                </div>
                <strong style="color:var(--diamond);">${sub.tier}</strong>
                <br>
                <iframe src="${embedUrl}" style="width:100%;max-width:400px;height:225px;border:2px solid var(--line);border-radius:4px;margin-top:5px;" allowfullscreen></iframe>
                
                <div style="margin-top:8px;padding:8px;background:var(--obsidian);border:2px solid var(--line-soft);border-radius:4px;">
                    <strong style="color:var(--diamond);font-size:0.65rem;font-family:var(--font-mono);">📋 PROOF:</strong>
                    <p style="color:var(--parchment);font-size:0.7rem;margin-top:4px;white-space:pre-wrap;font-family:var(--font-mono);">${sub.proof || '⚠️ No proof provided'}</p>
                    <div style="margin-top:4px;font-size:0.6rem;color:var(--muted);font-family:var(--font-mono);">
                        Status: ${verificationBadge}
                    </div>
                </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:0.5rem;min-width:100px;">
                ${sub.verification_status === 'pending' ? `
                    <button onclick="window.verifySubmission('${sub.id}')" style="padding:0.4rem 1rem;border:none;background:var(--diamond);color:var(--obsidian);cursor:pointer;font-family:var(--font-mono);font-weight:700;font-size:0.6rem;border-radius:4px;">🔍 VERIFY</button>
                    <button onclick="window.rejectProof('${sub.id}')" style="padding:0.4rem 1rem;border:none;background:var(--redstone);color:white;cursor:pointer;font-family:var(--font-mono);font-weight:700;font-size:0.6rem;border-radius:4px;">❌ REJECT</button>
                ` : `
                    <span style="font-size:0.6rem;color:var(--muted);font-family:var(--font-mono);text-align:center;padding:0.3rem;">
                        ${sub.verification_status === 'verified' ? '✅ Verified' : '❌ Rejected'}
                    </span>
                `}
                <button onclick="window.approveSubmission('${sub.id}')" style="padding:0.4rem 1rem;border:none;background:var(--grass);color:var(--obsidian);cursor:pointer;font-family:var(--font-mono);font-weight:700;font-size:0.6rem;border-radius:4px;">✅ APPROVE</button>
                <button onclick="window.denySubmission('${sub.id}')" style="padding:0.4rem 1rem;border:none;background:var(--redstone-dark);color:white;cursor:pointer;font-family:var(--font-mono);font-weight:700;font-size:0.6rem;border-radius:4px;">❌ DENY</button>
            </div>
        `;
        list.appendChild(li);
    }
}

window.verifySubmission = async (id) => {
    const user = getCurrentUser();
    if (!user) return alert('Please login');
    if (!user.is_moderator) return alert('Not a moderator');
    
    const { error } = await supabase
        .from('submissions')
        .update({
            verification_status: 'verified',
            verified_by: user.id,
            verified_at: new Date().toISOString()
        })
        .eq('id', id);
    
    if (error) alert('Error: ' + error.message);
    else {
        alert('✅ Proof verified! This clip can now be approved.');
        loadPendingSubmissions();
    }
};

window.rejectProof = async (id) => {
    const user = getCurrentUser();
    if (!user) return alert('Please login');
    if (!user.is_moderator) return alert('Not a moderator');
    
    const reason = await showPrompt('Why is this proof rejected? (Optional)');
    if (reason === null) return;
    
    const { data: sub } = await supabase
        .from('submissions')
        .select('proof')
        .eq('id', id)
        .single();
    
    const newProof = (sub?.proof || '') + '\n\n--- ❌ PROOF REJECTED ---\nReason: ' + (reason || 'No reason given');
    
    const { error } = await supabase
        .from('submissions')
        .update({
            verification_status: 'rejected',
            proof: newProof
        })
        .eq('id', id);
    
    if (error) alert('Error: ' + error.message);
    else {
        alert('❌ Proof rejected');
        loadPendingSubmissions();
    }
};

window.approveSubmission = async (id) => {
    const { data: sub } = await supabase
        .from('submissions')
        .select('verification_status')
        .eq('id', id)
        .single();
    
    if (sub?.verification_status !== 'verified') {
        alert('⚠️ This clip must be VERIFIED first before approving! Click "VERIFY" after checking proof.');
        return;
    }
    
    const { error } = await supabase
        .from('submissions')
        .update({ status: 'approved' })
        .eq('id', id);
    
    if (error) alert('Error: ' + error.message);
    else {
        alert('✅ Clip approved!');
        loadPendingSubmissions();
    }
};

window.denySubmission = async (id) => {
    const { error } = await supabase
        .from('submissions')
        .update({ status: 'denied' })
        .eq('id', id);
    
    if (error) alert('Error: ' + error.message);
    else {
        alert('❌ Clip denied');
        loadPendingSubmissions();
    }
};

// ============================================================
// SUGGESTIONS TAB — player feature suggestions.
// Denying a suggestion deletes it permanently (no "denied" state
// to keep around, unlike clip submissions).
// ============================================================
function updateModTabCount(elementId, count) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = count;
    el.hidden = count === 0;
}

async function loadPendingSuggestions() {
    const user = getCurrentUser();
    const list = document.getElementById('pendingSuggestions');
    if (!list) return;

    if (!user) {
        list.innerHTML = '<li>⚠️ Please login first!</li>';
        return;
    }

    if (!user.is_moderator) {
        list.innerHTML = '<li>⚠️ You are not a moderator!</li>';
        return;
    }

    const { data, error } = await supabase
        .from('suggestions')
        .select('*, sender:user_id(username)')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Load suggestions error:', error);
        list.innerHTML = '<li class="duel-empty">❌ Error loading suggestions</li>';
        return;
    }

    updateModTabCount('modSuggestionsCount', data?.length || 0);

    list.innerHTML = '';

    if (!data || data.length === 0) {
        list.innerHTML = '<li class="duel-empty">💡 No suggestions yet</li>';
        return;
    }

    for (const suggestion of data) {
        const li = document.createElement('li');
        li.className = 'suggestion-card';
        const submittedAt = suggestion.created_at
            ? new Date(suggestion.created_at).toLocaleString()
            : '';

        li.innerHTML = `
            <div class="suggestion-card-header">
                <span class="suggestion-username">👤 ${suggestion.sender?.username || 'Unknown user'}</span>
                <span class="suggestion-date">${submittedAt}</span>
            </div>
            <p class="suggestion-content"></p>
            <div class="suggestion-actions">
                <button type="button" class="pixel-btn-small btn-deny-suggestion" onclick="window.denySuggestion('${suggestion.id}')">✕ DENY</button>
            </div>
        `;
        // Set as text (not innerHTML) so a suggestion can't inject markup.
        li.querySelector('.suggestion-content').textContent = suggestion.content;
        list.appendChild(li);
    }
}

window.denySuggestion = async (id) => {
    const user = getCurrentUser();
    if (!user) return alert('Please login');
    if (!user.is_moderator) return alert('Not a moderator');

    const confirmed = await showConfirmation('Deny this suggestion? It will be deleted permanently.');
    if (!confirmed) return;

    const { error } = await supabase
        .from('suggestions')
        .delete()
        .eq('id', id);

    if (error) {
        alert('Error: ' + error.message);
        return;
    }

    showToast('🗑️ Suggestion denied and removed.');
    loadPendingSuggestions();
};