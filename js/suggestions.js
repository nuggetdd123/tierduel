// ============================================================
// SUGGESTIONS.JS — player-facing "Suggest a Feature" box.
// Moderator-side review lives in moderator.js.
// ============================================================
import { supabase, getCurrentUser, showToast } from './app.js';

const CHAR_LIMIT = 500;

function getEls() {
    return {
        openButton: document.getElementById('suggestFeatureButton'),
        modal: document.getElementById('suggestionModal'),
        closeButton: document.getElementById('closeSuggestionButton'),
        cancelButton: document.getElementById('cancelSuggestionButton'),
        submitButton: document.getElementById('submitSuggestionButton'),
        input: document.getElementById('suggestionInput'),
        message: document.getElementById('suggestionMessage'),
        userMenuPanel: document.getElementById('userMenuPanel')
    };
}

function showSuggestionMessage(text, type) {
    const { message } = getEls();
    if (!message) return;
    message.style.display = 'block';
    message.textContent = text;
    message.className = 'auth-message ' + type;
}

function openSuggestionModal() {
    const user = getCurrentUser();
    if (!user) {
        alert('⚠️ Please login first!');
        return;
    }

    const { modal, input, message, userMenuPanel } = getEls();
    if (!modal) return;

    if (userMenuPanel) userMenuPanel.hidden = true;
    if (input) input.value = '';
    if (message) {
        message.style.display = 'none';
        message.textContent = '';
    }

    modal.hidden = false;
    input?.focus();
}

function closeSuggestionModal() {
    const { modal } = getEls();
    if (modal) modal.hidden = true;
}

async function submitSuggestion() {
    const user = getCurrentUser();
    if (!user) {
        alert('⚠️ Please login first!');
        return;
    }

    const { input, submitButton } = getEls();
    const content = input?.value.trim();

    if (!content) {
        showSuggestionMessage('Please write a suggestion first.', 'error');
        return;
    }
    if (content.length > CHAR_LIMIT) {
        showSuggestionMessage(`Keep it under ${CHAR_LIMIT} characters.`, 'error');
        return;
    }

    if (submitButton) submitButton.disabled = true;

    try {
        const { error } = await supabase
            .from('suggestions')
            .insert({ user_id: user.id, content });

        if (error) throw error;

        showSuggestionMessage('✅ Suggestion sent to the moderators. Thanks!', 'success');
        showToast('💡 Suggestion submitted!');
        setTimeout(closeSuggestionModal, 1200);
    } catch (error) {
        console.error('Submit suggestion error:', error);
        showSuggestionMessage('❌ ' + error.message, 'error');
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

export function initSuggestions() {
    const { openButton, closeButton, cancelButton, submitButton, modal, input } = getEls();

    if (openButton) openButton.onclick = openSuggestionModal;
    if (closeButton) closeButton.onclick = closeSuggestionModal;
    if (cancelButton) cancelButton.onclick = closeSuggestionModal;
    if (submitButton) submitButton.onclick = submitSuggestion;

    if (modal) {
        modal.onclick = (event) => {
            if (event.target === modal) closeSuggestionModal();
        };
    }

    input?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            submitSuggestion();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal && !modal.hidden) closeSuggestionModal();
    });
}