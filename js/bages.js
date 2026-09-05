// js/badges.js
import { supabase, getCurrentUser, showToast } from './app.js';

const OG_CLAIM_LIMIT = 100;
let ogClaimBadge = null;
let ogCountTimer = null;

function getOGClaimEls() {
    return {
        section: document.getElementById('ogClaimSection'),
        count: document.getElementById('ogClaimCount'),
        button: document.getElementById('ogClaimButton'),
        status: document.getElementById('ogClaimedStatus')
    };
}

function hideOGClaimSection() {
    const { section } = getOGClaimEls();
    if (section) section.hidden = true;
}

async function fetchOGBadge() {
    const { data, error } = await supabase
        .from('badges')
        .select('*')
        .order('created_at', { ascending: true });

    if (error) throw error;

    return (data || []).find(badge => /og/i.test(badge.name || '')) || null;
}

function remainingSpots(badge) {
    const limit = badge?.claim_limit ?? OG_CLAIM_LIMIT;
    const claimed = badge?.claimed_count ?? 0;
    return Math.max(0, limit - claimed);
}

export async function loadOGClaimSection() {
    const { section, count, button, status } = getOGClaimEls();
    if (!section) return;

    const user = getCurrentUser();
    if (!user) {
        hideOGClaimSection();
        return;
    }

    try {
        const badge = await fetchOGBadge();
        ogClaimBadge = badge;

        if (!badge) {
            hideOGClaimSection();
            return;
        }

        const { data: owned, error: ownedError } = await supabase
            .from('user_badges')
            .select('badge_id')
            .eq('user_id', user.id)
            .eq('badge_id', badge.id)
            .maybeSingle();

        if (ownedError) throw ownedError;

        const remaining = remainingSpots(badge);
        const alreadyClaimed = Boolean(owned);

        if (!alreadyClaimed && remaining <= 0) {
            hideOGClaimSection();
            return;
        }

        section.hidden = false;
        if (count) {
            count.textContent = `Available: ${remaining}/${badge.claim_limit ?? OG_CLAIM_LIMIT} remaining`;
        }

        if (alreadyClaimed) {
            if (button) button.hidden = true;
            if (status) status.hidden = false;
            section.classList.add('og-claim-owned');
        } else {
            if (button) {
                button.hidden = false;
                button.disabled = false;
            }
            if (status) status.hidden = true;
            section.classList.remove('og-claim-owned');
        }
    } catch (error) {
        console.error('OG claim section error:', error);
        hideOGClaimSection();
    }
}

export function initOGClaim() {
    const { button } = getOGClaimEls();
    if (button) {
        button.onclick = () => {
            if (!ogClaimBadge?.id) return;
            claimBadge(ogClaimBadge.id);
        };
    }

    loadOGClaimSection();
    if (ogCountTimer) clearInterval(ogCountTimer);
    ogCountTimer = setInterval(loadOGClaimSection, 30000);
}

export async function loadBadges() {
    const user = getCurrentUser();
    if (!user) {
        document.getElementById('badgeContainer').innerHTML =
            '<p style="color:var(--muted);font-size:0.8rem;">⚠️ Please login to view badges.</p>';
        return;
    }

    try {
        const { data: badges, error: badgesError } = await supabase
            .from('badges')
            .select('*')
            .order('created_at', { ascending: true });

        if (badgesError) throw badgesError;

        const { data: userBadges, error: userBadgesError } = await supabase
            .from('user_badges')
            .select('badge_id, claimed_at')
            .eq('user_id', user.id);

        if (userBadgesError) throw userBadgesError;

        const claimedMap = new Map();
        userBadges?.forEach(b => claimedMap.set(b.badge_id, b.claimed_at));

        localStorage.setItem('tierduel_badges', JSON.stringify([...claimedMap.keys()]));

        renderBadgeList(badges || [], claimedMap);

    } catch (error) {
        console.error('Load badges error:', error);
        document.getElementById('badgeContainer').innerHTML =
            '<p style="color:var(--redstone);font-size:0.8rem;">❌ Error loading badges.</p>';
    }
}

function renderBadgeList(badges, claimedMap) {
    const container = document.getElementById('badgeContainer');
    if (!container) return;

    if (!badges || badges.length === 0) {
        container.innerHTML = '<p style="color:var(--muted);font-size:0.8rem;">No badges available yet.</p>';
        return;
    }

    container.innerHTML = badges.map(badge => {
        const isClaimed = claimedMap.has(badge.id);

        return `
            <div class="badge-card ${isClaimed ? 'claimed' : ''}">
                <div class="badge-icon" style="background:${badge.color}33;border-color:${badge.color};">${badge.icon}</div>
                <div class="badge-info">
                    <h4>${badge.icon} ${badge.name}</h4>
                    <p>${badge.description || ''}</p>
                    <small>${isClaimed ? '✅ Claimed on ' + new Date(claimedMap.get(badge.id)).toLocaleDateString() : '🔒 Not claimed'}</small>
                </div>
            </div>
        `;
    }).join('');
}

export async function claimBadge(badgeId) {
    const user = getCurrentUser();
    if (!user) {
        alert('⚠️ Please login first!');
        return;
    }

    const { button } = getOGClaimEls();
    if (button) button.disabled = true;

    try {
        const { data: existing, error: existingError } = await supabase
            .from('user_badges')
            .select('*')
            .eq('user_id', user.id)
            .eq('badge_id', badgeId)
            .maybeSingle();

        if (existingError) throw existingError;

        if (existing) {
            alert('✅ You already have this badge!');
            await loadOGClaimSection();
            return;
        }

        const { data: badge, error: badgeError } = await supabase
            .from('badges')
            .select('*')
            .eq('id', badgeId)
            .single();

        if (badgeError) throw badgeError;
        if (!badge) {
            alert('❌ Badge not found.');
            return;
        }
        if (badge.claimed_count >= badge.claim_limit) {
            alert('❌ This badge is no longer available.');
            await loadOGClaimSection();
            return;
        }

        const { error: claimError } = await supabase
            .from('user_badges')
            .insert({ user_id: user.id, badge_id: badgeId });

        if (claimError) throw claimError;

        const { error: updateError } = await supabase
            .from('badges')
            .update({ claimed_count: badge.claimed_count + 1 })
            .eq('id', badgeId);

        if (updateError) throw updateError;

        const currentBadges = JSON.parse(localStorage.getItem('tierduel_badges') || '[]');
        currentBadges.push(badgeId);
        localStorage.setItem('tierduel_badges', JSON.stringify(currentBadges));

        showToast(`🎉 You claimed the ${badge.icon} ${badge.name} badge!`);
        await loadOGClaimSection();
        loadBadges();

    } catch (error) {
        console.error('Claim badge error:', error);
        alert(`❌ Could not claim badge: ${error.message}`);
        if (button) button.disabled = false;
    }
}

export async function addBadge(name, description, icon = '⭐', color = '#e3b23c', claimLimit = 100) {
    const user = getCurrentUser();
    if (!user?.is_moderator) {
        alert('❌ Only moderators can add badges.');
        return;
    }

    try {
        const { error } = await supabase
            .from('badges')
            .insert({
                name,
                description,
                icon,
                color,
                claim_limit: claimLimit,
                claimed_count: 0
            });

        if (error) throw error;
        showToast(`✅ Badge "${name}" created!`);
        loadBadges();
        loadOGClaimSection();

    } catch (error) {
        console.error('Add badge error:', error);
        alert(`❌ Could not add badge: ${error.message}`);
    }
}

window.claimBadge = claimBadge;
window.addBadge = addBadge;
