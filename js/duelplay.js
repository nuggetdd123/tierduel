// ============================================================
// DUELPLAY.JS - REALTIME HEAD-TO-HEAD DUEL GAMEPLAY
// ============================================================
import { supabase, getCurrentUser, getYouTubeEmbedUrl } from './app.js';

const TIER_ORDER = { HT1: 1, LT1: 2, HT2: 3, LT2: 4, HT3: 5, LT3: 6, HT4: 7, LT4: 8, HT5: 9, LT5: 10 };
const TIER_COLORS = { HT1: '#ff6b6b', LT1: '#ff8787', HT2: '#ffa94d', LT2: '#ffc078', HT3: '#ffd43b', LT3: '#ffe066', HT4: '#69db7c', LT4: '#8ce99a', HT5: '#4dabf7', LT5: '#74c0fc' };
const INACTIVITY_MS = 3 * 60 * 1000;

let activeDuelId = null;
let duelState = null;
let currentUser = null;
let myRole = null;
let channel = null;
let presence = null;
let advanceTimer = null;
let inactivityTimer = null;
let lastOpponentActivity = Date.now();
let lastResultKey = null;
let hasGuessed = false;
let resolvingRound = false;
let cleanups = [];
const guessOrder = new Map();
let outcomeShownFor = null;
let listEventsChannel = null;

const element = id => document.getElementById(id);
const totalRounds = duel => duel?.clip_pool?.length || (duel?.type === 'FT5' ? 5 : 3);
const myGuess = duel => myRole === 'challenger' ? duel.challenger_guess : duel.opponent_guess;
const opponentGuess = duel => myRole === 'challenger' ? duel.opponent_guess : duel.challenger_guess;
const opponentName = duel => myRole === 'challenger' ? duel.opponent?.username : duel.challenger?.username;
const pointsFor = difference => [100, 50, 25, 10, 5][difference] || 0;

function getWinnerId(duel, challengerScore, opponentScore, latestResult = null) {
    if (challengerScore !== opponentScore) {
        return challengerScore > opponentScore ? duel.challenger_id : duel.opponent_id;
    }

    const results = [...(duel.round_results || [])];
    if (latestResult) results.push(latestResult);
    const challengerPoints = results.reduce((total, result) => total + (result.challenger_points || 0), 0);
    const opponentPoints = results.reduce((total, result) => total + (result.opponent_points || 0), 0);
    if (challengerPoints !== opponentPoints) {
        return challengerPoints > opponentPoints ? duel.challenger_id : duel.opponent_id;
    }

    if (latestResult && latestResult.challenger_points !== latestResult.opponent_points) {
        return latestResult.challenger_points > latestResult.opponent_points ? duel.challenger_id : duel.opponent_id;
    }

    return duel.challenger_id;
}

function showStatus(message) {
    const status = element('duelPlayStatus');
    if (status) status.textContent = message;
}

function addCleanup(callback) {
    cleanups.push(callback);
}

function clearTimers() {
    if (advanceTimer) clearTimeout(advanceTimer);
    if (inactivityTimer) clearTimeout(inactivityTimer);
    advanceTimer = null;
    inactivityTimer = null;
}

function cleanup() {
    clearTimers();
    cleanups.splice(0).forEach(callback => {
        try { callback(); } catch (error) { console.error('Duel cleanup error:', error); }
    });
    channel = null;
    presence = null;
}

async function loadDuel() {
    const { data, error } = await supabase.from('duels').select(`
        id, challenger_id, opponent_id, type, status, challenger_score, opponent_score, winner_id,
        round_number, current_submission_id, challenger_guess, opponent_guess,
        challenger:challenger_id(username), opponent:opponent_id(username),
        round_results, clip_pool, current_clip_index
    `).eq('id', activeDuelId).single();
    if (error) throw error;
    return data;
}

async function syncDuel() {
    try {
        const duel = await loadDuel();
        await renderState(duel);
    } catch (error) {
        console.error('Duel sync error:', error);
        showStatus(`❌ Could not sync duel: ${error.message}`);
    }
}

function trackPresence(status) {
    if (!presence || !currentUser) return;
    presence.track({ user_id: currentUser.id, username: currentUser.username, status, lastActivity: Date.now() })
        .catch(error => console.error('Presence tracking error:', error));
}

function updateOpponentPresence() {
    if (!presence || !duelState) return;
    const state = presence.presenceState();
    const opponentId = myRole === 'challenger' ? duelState.opponent_id : duelState.challenger_id;
    const opponent = Object.values(state).flat().find(entry => entry.user_id === opponentId);
    const statusElement = element('duelOpponentStatus');
    if (statusElement) statusElement.textContent = opponent ? (opponent.status || 'online') : 'offline';
    if (opponent?.lastActivity) lastOpponentActivity = Math.max(lastOpponentActivity, opponent.lastActivity);
    scheduleInactivityTimeout();
}

function scheduleInactivityTimeout() {
    if (!activeDuelId || !duelState || duelState.status !== 'active') return;
    if (inactivityTimer) clearTimeout(inactivityTimer);
    const remaining = Math.max(1000, INACTIVITY_MS - (Date.now() - lastOpponentActivity));
    inactivityTimer = setTimeout(forfeitInactiveOpponent, remaining);
}

async function forfeitInactiveOpponent() {
    if (!duelState || duelState.status !== 'active' || Date.now() - lastOpponentActivity < INACTIVITY_MS) {
        scheduleInactivityTimeout();
        return;
    }
    const winnerId = myRole === 'challenger' ? duelState.challenger_id : duelState.opponent_id;
    try {
        const { error } = await supabase.from('duels').update({ status: 'finished', winner_id: winnerId, finished_at: new Date().toISOString() }).eq('id', activeDuelId).eq('status', 'active');
        if (error) throw error;
    } catch (error) {
        console.error('Inactivity forfeit error:', error);
        showStatus(`❌ Timeout failed: ${error.message}`);
    }
}

function subscribeToDuel() {
    channel = supabase.channel(`duel:${activeDuelId}`)
        .on('broadcast', { event: 'duel-state-changed' }, event => {
            const payload = event.payload || {};
            if (payload.round && payload.role && payload.submittedAt) {
                const roundGuesses = guessOrder.get(payload.round) || {};
                roundGuesses[payload.role] = payload.submittedAt;
                guessOrder.set(payload.round, roundGuesses);
            }
            syncDuel();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'duels', filter: `id=eq.${activeDuelId}` }, () => syncDuel())
        .subscribe(status => {
            if (status === 'SUBSCRIBED') syncDuel();
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') showStatus('🔄 Reconnecting to duel...');
        });
    addCleanup(() => supabase.removeChannel(channel));

    presence = supabase.channel(`duel-presence:${activeDuelId}`, { config: { presence: { key: currentUser.id } } })
        .on('presence', { event: 'sync' }, updateOpponentPresence)
        .on('presence', { event: 'join' }, updateOpponentPresence)
        .on('presence', { event: 'leave' }, updateOpponentPresence)
        .subscribe(async status => {
            if (status === 'SUBSCRIBED') {
                await presence.track({ user_id: currentUser.id, username: currentUser.username, status: 'online', lastActivity: Date.now() });
                updateOpponentPresence();
            }
        });
    addCleanup(() => supabase.removeChannel(presence));
}

async function broadcastStateChange() {
    try {
        await channel?.send({ type: 'broadcast', event: 'duel-state-changed', payload: { duel_id: activeDuelId } });
    } catch (error) {
        console.error('Duel state broadcast error:', error);
    }
}

async function broadcastListEvent(event, payload) {
    if (!listEventsChannel) return;
    try {
        await listEventsChannel.send({ type: 'broadcast', event, payload });
    } catch (error) {
        console.error('Duel list broadcast error:', error);
    }
}

function getDuelScore(actualTier, guessedTier, speedMultiplier, streak) {
    const difference = Math.abs(TIER_ORDER[actualTier] - TIER_ORDER[guessedTier]);
    const accuracyPoints = [100, 50, 25, 10, 5, 2][Math.min(difference, 5)];
    const streakMultiplier = streak >= 5 ? 3 : streak >= 3 ? 2 : 1;
    const difficultyMultiplier = 1 + Math.abs(TIER_ORDER[actualTier] - 5.5) * 0.08;
    return {
        points: Math.round(accuracyPoints * speedMultiplier * streakMultiplier * difficultyMultiplier),
        difference,
        speedMultiplier,
        streakMultiplier,
        difficultyMultiplier
    };
}

function getPreviousStreak(results, player) {
    let streak = 0;
    for (let index = results.length - 1; index >= 0; index--) {
        const result = results[index];
        const guessedTier = player === 'challenger' ? result.challenger_guess : result.opponent_guess;
        if (result.actual_tier === guessedTier) streak++;
        else break;
    }
    return streak;
}

async function renderState(duel) {
    if (!duel || duel.id !== activeDuelId) return;
    duelState = duel;
    myRole = duel.challenger_id === currentUser.id ? 'challenger' : 'opponent';
    updateOpponentPresence();
    if (duel.status === 'finished') return renderFinished(duel);

    if (!duel.current_submission_id) {
        const result = duel.round_results?.at(-1);
        const key = result ? `${result.round}:${result.clip_id}` : null;
        if (result && key !== lastResultKey) {
            lastResultKey = key;
            hasGuessed = false;
            return showRoundResult(result, duel);
        }
        showStatus('🎬 Preparing next round...');
        if (!advanceTimer) scheduleAdvance();
        return;
    }
    await renderRound(duel);
}

async function renderRound(duel) {
    const round = duel.round_number || 1;
    const opponent = opponentName(duel);
    element('duelPlayScoreboard').innerHTML = `<span class="duel-score">YOU ${myRole === 'challenger' ? duel.challenger_score : duel.opponent_score} : ${myRole === 'challenger' ? duel.opponent_score : duel.challenger_score} ${opponent}</span><span id="duelOpponentStatus" class="pixel-round">online</span><span class="pixel-round">ROUND ${round}/${totalRounds(duel)}</span>`;
    if (!element('duelPlayOptions').querySelector('button') || lastResultKey !== duel.current_submission_id) {
        lastResultKey = duel.current_submission_id;
        const { data: submission, error } = await supabase.from('submissions').select('video_url').eq('id', duel.current_submission_id).single();
        if (error) throw error;
        if (submission) element('duelPlayVideo').src = getYouTubeEmbedUrl(submission.video_url);
        renderOptions(Boolean(myGuess(duel)));
    }
    updateOpponentPresence();
    hasGuessed = Boolean(myGuess(duel));
    trackPresence(hasGuessed ? 'waiting' : 'guessing');
    if (myGuess(duel) && opponentGuess(duel)) await tryResolveRound(duel);
    else showStatus(hasGuessed ? `✅ Guess locked in (${myGuess(duel)}). Waiting for ${opponent}...` : '🎯 Guess the tier!');
}

function renderOptions(disabled) {
    const container = element('duelPlayOptions');
    container.innerHTML = '';
    Object.keys(TIER_ORDER).forEach(tier => {
        const button = document.createElement('button');
        button.textContent = tier;
        button.dataset.tier = tier;
        button.disabled = disabled;
        button.style.borderColor = `${TIER_COLORS[tier]}44`;
        button.onfocus = () => trackPresence('typing');
        button.onblur = () => trackPresence(hasGuessed ? 'waiting' : 'guessing');
        button.onclick = () => submitGuess(tier);
        container.appendChild(button);
    });
}

async function submitGuess(tier) {
    if (!duelState?.current_submission_id || hasGuessed) return;
    hasGuessed = true;
    renderOptions(true);
    trackPresence('waiting');
    const field = myRole === 'challenger' ? 'challenger_guess' : 'opponent_guess';
    const submittedAt = Date.now();
    const roundGuesses = guessOrder.get(duelState.round_number) || {};
    roundGuesses[myRole] = submittedAt;
    guessOrder.set(duelState.round_number, roundGuesses);
    try {
        const { error } = await supabase.from('duels').update({ [field]: tier }).eq('id', activeDuelId).eq('status', 'active').is(field, null);
        if (error) throw error;
        showStatus(`✅ Guess locked in (${tier}). Waiting for opponent...`);
        await channel?.send({
            type: 'broadcast',
            event: 'duel-state-changed',
            payload: { duel_id: activeDuelId, round: duelState.round_number, role: myRole, submittedAt: Date.now() }
        });
        await syncDuel();
    } catch (error) {
        hasGuessed = false;
        renderOptions(false);
        showStatus(`❌ Could not submit guess: ${error.message}`);
    }
}

async function tryResolveRound(duel) {
    if (resolvingRound) return;
    resolvingRound = true;
    const round = duel.round_number || 1;
    const clipId = duel.current_submission_id;
    try {
        const { data: submission, error: submissionError } = await supabase.from('submissions').select('tier').eq('id', clipId).single();
        if (submissionError) throw submissionError;
        const guessTimes = guessOrder.get(round) || {};
        const bothGuessTimesKnown = Number.isFinite(guessTimes.challenger) && Number.isFinite(guessTimes.opponent);
        const challengerFirst = bothGuessTimesKnown && guessTimes.challenger <= guessTimes.opponent;
        const challengerSpeed = bothGuessTimesKnown ? (challengerFirst ? 1.2 : 1) : 1;
        const opponentSpeed = bothGuessTimesKnown ? (challengerFirst ? 1 : 1.2) : 1;
        const previousChallengerStreak = getPreviousStreak(duel.round_results || [], 'challenger');
        const previousOpponentStreak = getPreviousStreak(duel.round_results || [], 'opponent');
        const challengerIsCorrect = submission.tier === duel.challenger_guess;
        const opponentIsCorrect = submission.tier === duel.opponent_guess;
        const challengerScoreResult = getDuelScore(submission.tier, duel.challenger_guess, challengerSpeed, challengerIsCorrect ? previousChallengerStreak + 1 : 0);
        const opponentScoreResult = getDuelScore(submission.tier, duel.opponent_guess, opponentSpeed, opponentIsCorrect ? previousOpponentStreak + 1 : 0);
        const challengerDifference = challengerScoreResult.difference;
        const opponentDifference = opponentScoreResult.difference;
        const challengerScore = duel.challenger_score + (challengerDifference < opponentDifference ? 1 : 0);
        const opponentScore = duel.opponent_score + (opponentDifference < challengerDifference ? 1 : 0);
        const finished = round >= totalRounds(duel);
        const result = { round, clip_id: clipId, actual_tier: submission.tier, challenger_guess: duel.challenger_guess, opponent_guess: duel.opponent_guess, challenger_points: challengerScoreResult.points, opponent_points: opponentScoreResult.points, challenger_speed_multiplier: challengerSpeed, opponent_speed_multiplier: opponentSpeed, challenger_streak_multiplier: challengerScoreResult.streakMultiplier, opponent_streak_multiplier: opponentScoreResult.streakMultiplier, challenger_difficulty_multiplier: challengerScoreResult.difficultyMultiplier, opponent_difficulty_multiplier: opponentScoreResult.difficultyMultiplier, round_winner: challengerDifference === opponentDifference ? null : challengerDifference < opponentDifference ? 'challenger' : 'opponent', challenger_score: challengerScore, opponent_score: opponentScore };
        const winnerId = finished ? getWinnerId(duel, challengerScore, opponentScore, result) : null;
        const { error } = await supabase.from('duels').update({ challenger_score: challengerScore, opponent_score: opponentScore, current_submission_id: null, challenger_guess: null, opponent_guess: null, round_number: round + 1, status: finished ? 'finished' : 'active', winner_id: winnerId, round_results: [...(duel.round_results || []), result] }).eq('id', duel.id).eq('status', 'active').eq('round_number', round).eq('current_submission_id', clipId).eq('challenger_guess', duel.challenger_guess).eq('opponent_guess', duel.opponent_guess);
        if (error) throw error;
        await syncDuel();
        if (finished) await broadcastListEvent('duel-finished', { duel_id: duel.id });
    } catch (error) {
        console.error('Round resolution error:', error);
        showStatus(`❌ Could not resolve round: ${error.message}`);
    } finally {
        resolvingRound = false;
    }
}

function showRoundResult(result, duel) {
    const challengerPoints = result.challenger_points;
    const opponentPoints = result.opponent_points;
    const myPoints = myRole === 'challenger' ? challengerPoints : opponentPoints;
    const otherPoints = myRole === 'challenger' ? opponentPoints : challengerPoints;
    const myGuessValue = myRole === 'challenger' ? result.challenger_guess : result.opponent_guess;
    const otherGuessValue = myRole === 'challenger' ? result.opponent_guess : result.challenger_guess;
    const actualPosition = TIER_ORDER[result.actual_tier];
    const myDifference = Math.abs(actualPosition - TIER_ORDER[myGuessValue]);
    const otherDifference = Math.abs(actualPosition - TIER_ORDER[otherGuessValue]);
    const getChoiceState = difference => difference === 0
        ? { className: 'correct', label: '✅ CORRECT' }
        : difference === 1
            ? { className: 'close', label: '⚠️ CLOSE' }
            : { className: 'wrong', label: '❌ WRONG' };
    const myState = getChoiceState(myDifference);
    const otherState = getChoiceState(otherDifference);
    const roundWinner = result.round_winner === null
        ? 'Round tied! 🤝'
        : (result.round_winner === (myRole === 'challenger' ? 'challenger' : 'opponent') ? 'You win the round! 🎉' : `${opponentName(duel)} wins the round! 🎉`);
    const tierCard = (guess, state, points) => `
        <div class="duel-choice-card ${state.className}">
            <strong style="background:${TIER_COLORS[guess] || '#343b48'}55;border-color:${TIER_COLORS[guess] || '#343b48'};">${guess}</strong>
            <span>${state.label}</span>
            <b>+${points} pts</b>
        </div>`;

    element('duelPlayStatus').innerHTML = `
        <div class="duel-result-panel">
            <div class="duel-result-title">⚔️ ROUND ${result.round} RESULT</div>
            <div class="duel-result-grid">
                <div class="duel-player-result">
                    <strong>[YOU]</strong>
                    ${tierCard(myGuessValue, myState, myPoints)}
                </div>
                <div class="duel-player-result">
                    <strong>[${opponentName(duel).toUpperCase()}]</strong>
                    ${tierCard(otherGuessValue, otherState, otherPoints)}
                </div>
            </div>
            <div class="duel-actual-tier">Actual tier: <strong>${result.actual_tier}</strong></div>
            <div class="duel-result-summary">${roundWinner}</div>
        </div>`;
    trackPresence('online');
    scheduleAdvance();
}

function scheduleAdvance() {
    if (advanceTimer) return;
    element('duelPlayOptions').innerHTML = '<div class="duel-countdown">▶ NEXT ROUND IN 3</div>';
    advanceTimer = setTimeout(async () => {
        advanceTimer = null;
        if (duelState?.status !== 'active') return;
        const clipPool = duelState.clip_pool || [];
        const nextIndex = duelState.current_clip_index || 0;
        if (nextIndex >= clipPool.length) return;
        try {
            const { error } = await supabase.from('duels').update({ current_submission_id: clipPool[nextIndex], current_clip_index: nextIndex + 1 }).eq('id', duelState.id).eq('status', 'active').is('current_submission_id', null);
            if (error) throw error;
            await syncDuel();
        } catch (error) {
            console.error('Next round error:', error);
            showStatus(`❌ Could not start next round: ${error.message}`);
        }
    }, 3000);
}

function renderFinished(duel) {
    clearTimers();
    const forfeitButton = element('duelPlayForfeitBtn');
    if (forfeitButton) forfeitButton.style.display = 'none';
    const winnerId = duel.winner_id || getWinnerId(duel, duel.challenger_score, duel.opponent_score);
    const won = winnerId === currentUser.id;
    const myScore = myRole === 'challenger' ? duel.challenger_score : duel.opponent_score;
    const otherScore = myRole === 'challenger' ? duel.opponent_score : duel.challenger_score;
    const outcomeModal = element('duelOutcomeModal');
    const outcomePanel = element('duelOutcomePanel');
    if (outcomeModal && outcomeShownFor !== duel.id) {
        outcomeShownFor = duel.id;
        element('duelOutcomeMark').textContent = won ? '✓' : '×';
        element('duelOutcomeTitle').textContent = won ? 'YOU WON!' : 'YOU LOST';
        element('duelOutcomeScore').textContent = `${myScore} : ${otherScore}`;
        outcomePanel.classList.toggle('duel-outcome-win', won);
        outcomePanel.classList.toggle('duel-outcome-loss', !won);
        outcomeModal.hidden = false;
    }
    const lastResult = duel.round_results?.at(-1);
    const myRoundPoints = lastResult ? (myRole === 'challenger' ? lastResult.challenger_points : lastResult.opponent_points) : 0;
    const otherRoundPoints = lastResult ? (myRole === 'challenger' ? lastResult.opponent_points : lastResult.challenger_points) : 0;
    const myTotalPoints = (duel.round_results || []).reduce((total, result) => total + (myRole === 'challenger' ? result.challenger_points : result.opponent_points), 0);
    const otherTotalPoints = (duel.round_results || []).reduce((total, result) => total + (myRole === 'challenger' ? result.opponent_points : result.challenger_points), 0);
    const finalGuesses = lastResult ? {
        mine: myRole === 'challenger' ? lastResult.challenger_guess : lastResult.opponent_guess,
        other: myRole === 'challenger' ? lastResult.opponent_guess : lastResult.challenger_guess
    } : null;
    const finalChoice = (guess, points) => {
        const difference = lastResult ? Math.abs(TIER_ORDER[lastResult.actual_tier] - TIER_ORDER[guess]) : 5;
        const state = difference === 0
            ? { className: 'correct', label: '✅ CORRECT' }
            : difference === 1
                ? { className: 'close', label: '⚠️ CLOSE' }
                : { className: 'wrong', label: '❌ WRONG' };
        return `<div class="duel-choice-card ${state.className}"><strong style="background:${TIER_COLORS[guess] || '#343b48'}55;border-color:${TIER_COLORS[guess] || '#343b48'};">${guess || '—'}</strong><span>${state.label}</span><b>+${points} pts</b></div>`;
    };
    const finalRoundHtml = lastResult && finalGuesses ? `
        <div class="duel-final-round">
            <div class="duel-result-title">⚔️ ROUND ${lastResult.round} RESULT</div>
            <div class="duel-result-grid">
                <div class="duel-player-result"><strong>[YOU]</strong>${finalChoice(finalGuesses.mine, myRoundPoints)}</div>
                <div class="duel-player-result"><strong>[${opponentName(duel).toUpperCase()}]</strong>${finalChoice(finalGuesses.other, otherRoundPoints)}</div>
            </div>
            <div class="duel-actual-tier">Actual tier: <strong>${lastResult.actual_tier}</strong></div>
            <div class="duel-result-summary">${lastResult.round_winner === null ? 'Round tied! 🤝' : lastResult.round_winner === (myRole === 'challenger' ? 'challenger' : 'opponent') ? 'You win the round! 🎉' : `${opponentName(duel)} wins the round! 🎉`}</div>
        </div>` : '';
    element('duelPlayOptions').innerHTML = `<button class="pixel-btn pixel-btn-primary" onclick="window.rematchDuel('${duel.id}')">⚔ REMATCH</button><button class="pixel-btn pixel-btn-secondary" onclick="window.stopDuelPlay()">◀ BACK TO DUELS</button>`;
    element('duelPlayScoreboard').innerHTML = '';
    element('duelPlayStatus').innerHTML = `<div class="duel-finished-panel"><div>${won ? '🏆 YOU WON THE DUEL!' : '💀 YOU LOST THIS ONE'}</div><strong>${myScore} : ${otherScore}</strong><span>vs ${opponentName(duel)}</span>${finalRoundHtml}<div class="duel-final-points"><b>+${myRoundPoints}</b><span>LAST ROUND POINTS</span><b>+${otherRoundPoints}</b></div><div class="duel-total-points">TOTAL POINTS: ${myTotalPoints} : ${otherTotalPoints}</div></div>`;
    trackPresence('finished');
}

export async function startDuelPlay(duelId) {
    stopDuelPlay();
    currentUser = getCurrentUser();
    if (!currentUser) return alert('⚠️ Please login first!');
    activeDuelId = duelId;
    lastResultKey = null;
    outcomeShownFor = null;
    lastOpponentActivity = Date.now();
    resolvingRound = false;
    element('duelsView').style.display = 'none';
    element('duelPlayView').style.display = 'block';
    element('duelPlayOptions').innerHTML = '';
    element('duelPlayScoreboard').innerHTML = '';
    showStatus('⏳ Connecting to duel...');
    const outcomeModal = element('duelOutcomeModal');
    const closeOutcomeButton = element('closeDuelOutcomeButton');
    if (outcomeModal) {
        outcomeModal.hidden = true;
        outcomeModal.onclick = event => {
            if (event.target === outcomeModal) outcomeModal.hidden = true;
        };
    }
    if (closeOutcomeButton) closeOutcomeButton.onclick = () => {
        if (outcomeModal) outcomeModal.hidden = true;
    };
    const forfeitButton = element('duelPlayForfeitBtn');
    if (forfeitButton) {
        forfeitButton.style.display = 'inline-block';
        forfeitButton.onclick = () => window.forfeitDuel(activeDuelId);
        addCleanup(() => {
            forfeitButton.onclick = null;
            forfeitButton.style.display = 'none';
        });
    }
    addCleanup(() => window.removeEventListener('online', handleReconnect));
    addCleanup(() => window.removeEventListener('offline', handleDisconnect));
    window.addEventListener('online', handleReconnect);
    window.addEventListener('offline', handleDisconnect);
    subscribeToDuel();
    listEventsChannel = supabase.channel('duel-lists').subscribe();
    addCleanup(() => supabase.removeChannel(listEventsChannel));
    await syncDuel();
}

function handleReconnect() { showStatus('🟢 Connection restored. Syncing duel...'); syncDuel(); }
function handleDisconnect() { showStatus('🔴 Offline. Waiting for connection...'); }

export function stopDuelPlay() {
    cleanup();
    activeDuelId = null;
    outcomeShownFor = null;
    duelState = null;
    currentUser = null;
    myRole = null;
    resolvingRound = false;
    element('duelPlayVideo').src = '';
    element('duelPlayView').style.display = 'none';
    if (element('duelOutcomeModal')) element('duelOutcomeModal').hidden = true;
    element('duelsView').style.display = 'block';
}

window.stopDuelPlay = stopDuelPlay;
