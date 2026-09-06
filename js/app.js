// ============================================================
// SUPABASE CONFIG
// ============================================================
export const supabaseUrl = 'https://kypwlrthmkijbfqzmtlr.supabase.co';
export const supabaseAnonKey = 'sb_publishable_Y4RcI1KBatr-UH_2c8MOBQ_SylPlcFR';

// Create Supabase client
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

import { applySettings } from './settings.js';

// ============================================================
// STATE
// ============================================================
export let currentUser = null;

// ============================================================
// DOM REFS
// ============================================================
const authSection = document.getElementById('authSection');
const gameView = document.getElementById('gameView');
const uploadView = document.getElementById('uploadView');
const duelsView = document.getElementById('duelsView');
const friendsView = document.getElementById('friendsView');
const settingsView = document.getElementById('settingsView');
const duelPlayView = document.getElementById('duelPlayView');
const moderatorView = document.getElementById('moderatorView');
const badgesView = document.getElementById('badgesView');
const authButton = document.getElementById('authButton');
const userDropdown = document.getElementById('userDropdown');
const userMenuButton = document.getElementById('userMenuButton');
const userMenuName = document.getElementById('userMenuName');
const userMenuPanel = document.getElementById('userMenuPanel');
const myBadgesButton = document.getElementById('myBadgesButton');
const settingsMenuButton = document.getElementById('settingsMenuButton');
const logoutButton = document.getElementById('logoutButton');
const updateNotesButton = document.getElementById('updateNotesButton');
const updateNotesModal = document.getElementById('updateNotesModal');
const closeUpdateNotesButton = document.getElementById('closeUpdateNotesButton');
const appToast = document.getElementById('appToast');
const appToastMessage = document.getElementById('appToastMessage');
const appToastClose = document.getElementById('appToastClose');
const actionToastStack = document.getElementById('actionToastStack');
const confirmModal = document.getElementById('confirmModal');
const confirmMessage = document.getElementById('confirmMessage');
const confirmCancelButton = document.getElementById('confirmCancelButton');
const confirmAcceptButton = document.getElementById('confirmAcceptButton');
const closeConfirmButton = document.getElementById('closeConfirmButton');
const promptModal = document.getElementById('promptModal');
const promptMessage = document.getElementById('promptMessage');
const promptInput = document.getElementById('promptInput');
const promptCancelButton = document.getElementById('promptCancelButton');
const promptAcceptButton = document.getElementById('promptAcceptButton');
const closePromptButton = document.getElementById('closePromptButton');
const moderatorNav = document.getElementById('moderatorNav');
const navLinks = document.querySelectorAll('.nav-link');
let toastTimer = null;

export function showToast(message) {
    if (!appToast || !appToastMessage) return;

    appToastMessage.textContent = message;
    appToast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        appToast.hidden = true;
    }, 4500);
}

function hideToast() {
    if (appToast) appToast.hidden = true;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = null;
}

// ============================================================
// ACTION TOASTS — dismissable notifications with Accept/Decline,
// used for friend requests and duel invites arriving anywhere on
// the site. Stacks in the top-right corner.
// ============================================================
export function showActionToast(message, options = {}) {
    if (!actionToastStack) return null;
    const {
        acceptLabel = '✓ Accept',
        declineLabel = '✕ Decline',
        onAccept = null,
        onDecline = null,
        timeout = 15000
    } = options;

    const toast = document.createElement('div');
    toast.className = 'action-toast';
    toast.innerHTML = `
        <div class="action-toast-message">${message}</div>
        <div class="action-toast-buttons">
            ${onAccept ? `<button type="button" class="pixel-btn-small btn-accept" data-action="accept">${acceptLabel}</button>` : ''}
            ${onDecline ? `<button type="button" class="pixel-btn-small btn-decline" data-action="decline">${declineLabel}</button>` : ''}
            <button type="button" class="action-toast-dismiss" aria-label="Dismiss">×</button>
        </div>
    `;

    let removed = false;
    const remove = () => {
        if (removed) return;
        removed = true;
        toast.classList.add('action-toast-out');
        setTimeout(() => toast.remove(), 200);
    };

    toast.querySelector('[data-action="accept"]')?.addEventListener('click', () => {
        remove();
        onAccept?.();
    });
    toast.querySelector('[data-action="decline"]')?.addEventListener('click', () => {
        remove();
        onDecline?.();
    });
    toast.querySelector('.action-toast-dismiss')?.addEventListener('click', remove);

    actionToastStack.appendChild(toast);
    if (timeout) setTimeout(remove, timeout);
    return toast;
}

export function showConfirmation(message) {
    if (!confirmModal || !confirmMessage || !confirmCancelButton || !confirmAcceptButton) {
        return Promise.resolve(false);
    }

    confirmMessage.textContent = message;
    confirmModal.hidden = false;
    return new Promise(resolve => {
        const finish = confirmed => {
            confirmModal.hidden = true;
            confirmCancelButton.onclick = null;
            confirmAcceptButton.onclick = null;
            closeConfirmButton.onclick = null;
            confirmModal.onclick = null;
            resolve(confirmed);
        };
        confirmCancelButton.onclick = () => finish(false);
        confirmAcceptButton.onclick = () => finish(true);
        closeConfirmButton.onclick = () => finish(false);
        confirmModal.onclick = event => {
            if (event.target === confirmModal) finish(false);
        };
    });
}

export function showPrompt(message) {
    if (!promptModal || !promptMessage || !promptInput || !promptCancelButton || !promptAcceptButton) {
        return Promise.resolve(null);
    }

    promptMessage.textContent = message;
    promptInput.value = '';
    promptModal.hidden = false;
    promptInput.focus();
    return new Promise(resolve => {
        const finish = value => {
            promptModal.hidden = true;
            promptCancelButton.onclick = null;
            promptAcceptButton.onclick = null;
            closePromptButton.onclick = null;
            promptModal.onclick = null;
            resolve(value);
        };
        promptCancelButton.onclick = () => finish(null);
        closePromptButton.onclick = () => finish(null);
        promptAcceptButton.onclick = () => finish(promptInput.value);
        promptModal.onclick = event => {
            if (event.target === promptModal) finish(null);
        };
    });
}

// ============================================================
// VIEW SWITCHER
// ============================================================
export function switchView(view) {
    const user = getCurrentUser();

    const protectedViews = ['game', 'upload', 'duels', 'friends', 'moderator', 'badges', 'settings'];

    if (protectedViews.includes(view) && !user) {
        alert('⚠️ You must be logged in to access this!');
        view = 'auth';
    }

    [authSection, gameView, uploadView, duelsView, friendsView, settingsView, duelPlayView, moderatorView, badgesView].forEach(el => {
        if (el) el.style.display = 'none';
    });
    navLinks.forEach(l => l.classList.remove('active'));
    myBadgesButton?.classList.remove('active');
    closeUserMenu();

    if (view === 'auth') {
        authSection.style.display = 'block';
    } else if (view === 'game') {
        gameView.style.display = 'block';
        document.querySelector('[data-view="game"]')?.classList.add('active');
        import('./bages.js').then(({ loadOGClaimSection }) => loadOGClaimSection());
    } else if (view === 'upload') {
        uploadView.style.display = 'block';
        document.querySelector('[data-view="upload"]')?.classList.add('active');
    } else if (view === 'duels') {
        duelsView.style.display = 'block';
        document.querySelector('[data-view="duels"]')?.classList.add('active');
    } else if (view === 'friends') {
        friendsView.style.display = 'block';
        document.querySelector('[data-view="friends"]')?.classList.add('active');
        import('./friends.js').then(({ refreshFriends }) => refreshFriends());
    } else if (view === 'settings') {
        settingsView.style.display = 'block';
    } else if (view === 'moderator') {
        moderatorView.style.display = 'block';
        document.querySelector('[data-view="moderator"]')?.classList.add('active');
    } else if (view === 'badges') {
        badgesView.style.display = 'block';
        myBadgesButton?.classList.add('active');
        import('./bages.js').then(({ loadBadges }) => loadBadges());
    }
}

// ============================================================
// GET CURRENT USER
// ============================================================
export function getCurrentUser() {
    const stored = localStorage.getItem('tierduel_user');
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch {
            return null;
        }
    }
    return null;
}

export function isValidUsername(username) {
    return /^[A-Za-z0-9]+$/.test(username);
}

// ============================================================
// IS MODERATOR
// ============================================================
export function isModerator() {
    const user = getCurrentUser();
    return user?.is_moderator || false;
}

// ============================================================
// LOGOUT
// ============================================================
export function logout() {
    localStorage.removeItem('tierduel_user');
    localStorage.removeItem('tierduel_badges');
    currentUser = null;
    return { success: true };
}

// ============================================================
// USERNAME BADGE (top-right nav) — shows the equipped badge's
// icon right next to the username, e.g. "Nugget ⭐".
// ============================================================
export async function refreshUserMenuBadge() {
    const user = getCurrentUser();
    if (!user || !userMenuName) return;
    try {
        const { data, error } = await supabase
            .from('app_users')
            .select('equipped_badge:equipped_badge_id(icon)')
            .eq('id', user.id)
            .maybeSingle();
        if (error) throw error;
        const icon = data?.equipped_badge?.icon;
        userMenuName.textContent = icon ? `${user.username} ${icon}` : user.username;
    } catch (error) {
        console.error('Nav badge lookup error:', error);
        userMenuName.textContent = user.username;
    }
}

// ============================================================
// AUTH UI UPDATE
// ============================================================
function closeUserMenu() {
    if (!userMenuPanel || !userMenuButton) return;
    userMenuPanel.hidden = true;
    userMenuButton.setAttribute('aria-expanded', 'false');
}

function setUserMenuOpen(open) {
    if (!userMenuPanel || !userMenuButton) return;
    userMenuPanel.hidden = !open;
    userMenuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function initUserMenu() {
    if (userMenuButton) {
        userMenuButton.onclick = (e) => {
            e.stopPropagation();
            setUserMenuOpen(userMenuPanel.hidden);
        };
    }

    if (myBadgesButton) {
        myBadgesButton.onclick = () => {
            closeUserMenu();
            switchView('badges');
        };
    }

    if (settingsMenuButton) {
        settingsMenuButton.onclick = () => {
            closeUserMenu();
            switchView('settings');
        };
    }

    if (logoutButton) {
        logoutButton.onclick = () => {
            closeUserMenu();
            logout();
            location.reload();
        };
    }

    document.addEventListener('click', (e) => {
        if (userDropdown && !userDropdown.contains(e.target)) {
            closeUserMenu();
        }
    });
}

export async function updateAuthUI() {
    const user = getCurrentUser();
    const uploadLink = document.querySelector('[data-view="upload"]');
    const duelsLink = document.querySelector('[data-view="duels"]');
    const friendsLink = document.querySelector('[data-view="friends"]');
    const gameLink = document.querySelector('[data-view="game"]');
    const modLink = document.querySelector('[data-view="moderator"]');

    if (user) {
        currentUser = user;
        if (authButton) authButton.style.display = 'none';
        if (userDropdown) userDropdown.hidden = false;
        if (userMenuName) userMenuName.textContent = user.username;
        refreshUserMenuBadge();
        closeUserMenu();

        if (uploadLink) uploadLink.style.display = 'block';
        if (duelsLink) duelsLink.style.display = 'block';
        if (friendsLink) friendsLink.style.display = 'block';
        if (gameLink) gameLink.style.display = 'block';
        if (updateNotesButton) updateNotesButton.style.display = 'block';

        moderatorNav.style.display = user.is_moderator ? 'block' : 'none';

        if (authSection.style.display !== 'none') {
            switchView('game');
        }
    } else {
        currentUser = null;
        closeUserMenu();
        if (userDropdown) userDropdown.hidden = true;
        if (userMenuName) userMenuName.textContent = '';
        if (authButton) {
            authButton.style.display = 'block';
            authButton.textContent = '🔐 Login';
            authButton.onclick = (e) => {
                e.preventDefault();
                switchView('auth');
            };
        }

        if (uploadLink) uploadLink.style.display = 'none';
        if (duelsLink) duelsLink.style.display = 'none';
        if (friendsLink) friendsLink.style.display = 'none';
        if (gameLink) gameLink.style.display = 'none';
        if (updateNotesButton) updateNotesButton.style.display = 'none';
        if (modLink) modLink.style.display = 'none';

        moderatorNav.style.display = 'none';
        switchView('auth');
    }
}

// ============================================================
// NAVIGATION
// ============================================================
function initNavigation() {
    document.querySelectorAll('[data-view]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = e.target.dataset.view;

            const protectedViews = ['upload', 'duels', 'friends', 'moderator'];
            const user = getCurrentUser();

            if (protectedViews.includes(view) && !user) {
                alert('⚠️ You must be logged in to access this!');
                switchView('auth');
                return;
            }

            switchView(view);
        });
    });
}

// ============================================================
// HELPER: Get YouTube Embed URL
// ============================================================
export function getYouTubeEmbedUrl(url) {
    if (!url) return '';
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : url;
}

export function isSupportedVideoUrl(url) {
    if (!url) return false;
    return /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i.test(url);
}

// ============================================================
// ANIMATION HELPERS
// Restart a CSS animation on an element that only has its text
// content updated (score/streak counters etc.) by forcing reflow.
// ============================================================
export function bumpAnimation(el, className) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth; // force reflow so the animation replays
    el.classList.add(className);
}

// ============================================================
// INIT
// ============================================================
async function initApp() {
    console.log('🚀 TierDuel starting...');
    console.log('📡 Connected to:', supabaseUrl);

    // Apply saved appearance settings before anything else renders.
    applySettings();

    initNavigation();
    initUserMenu();
    window.alert = showToast;
    if (appToastClose) appToastClose.onclick = hideToast;
    if (updateNotesButton) {
        updateNotesButton.onclick = () => {
            if (updateNotesModal) updateNotesModal.hidden = false;
        };
    }
    if (closeUpdateNotesButton) {
        closeUpdateNotesButton.onclick = () => {
            if (updateNotesModal) updateNotesModal.hidden = true;
        };
    }
    if (updateNotesModal) {
        updateNotesModal.onclick = (event) => {
            if (event.target === updateNotesModal) updateNotesModal.hidden = true;
        };
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') updateNotesModal.hidden = true;
        });
    }
    await updateAuthUI();

    const { initAuth } = await import('./auth.js');
    const { initUpload } = await import('./upload.js');
    const { initGame } = await import('./game.js');
    const { initDuels } = await import('./duels.js');
    const { initFriends } = await import('./friends.js');
    const { initModerator } = await import('./moderator.js');
    const { initOGClaim } = await import('./bages.js');
    const { initSettings } = await import('./settings.js');
    const { initSuggestions } = await import('./suggestions.js');

    initAuth();
    initUpload();
    initGame();
    initDuels();
    initFriends();
    initModerator();
    initOGClaim();
    initSettings();
    initSuggestions();

    if (!currentUser) {
        switchView('auth');
    }

    console.log('✅ TierDuel ready!');
}

document.addEventListener('DOMContentLoaded', initApp);