import { supabase, getCurrentUser, getYouTubeEmbedUrl } from './app.js';

export function initModerator() {
    loadPendingSubmissions();
    
    document.querySelector('[data-view="moderator"]')?.addEventListener('click', () => {
        setTimeout(loadPendingSubmissions, 100);
    });
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
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
    
    const list = document.getElementById('pendingSubmissions');
    list.innerHTML = '';
    
    if (!data || data.length === 0) {
        list.innerHTML = '<li>📋 No pending submissions</li>';
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
    
    const reason = prompt('Why is this proof rejected? (Optional)');
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