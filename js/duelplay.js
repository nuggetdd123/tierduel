// ============================================================
// DUELPLAY.JS - LIVE HEAD-TO-HEAD DUEL GAMEPLAY
// ============================================================

import { supabase, getCurrentUser, getYouTubeEmbedUrl } from './app.js';

const TIER_ORDER = {
    'HT1': 1, 'LT1': 2, 'HT2': 3, 'LT2': 4,
    'HT3': 5, 'LT3': 6, 'HT4': 7, 'LT4': 8,
    'HT5': 9, 'LT5': 10
};

const TIER_COLORS = {
    'HT1': '#ff6b6b', 'LT1': '#ff8787',
    'HT2': '#ffa94d', 'LT2': '#ffc078',
    'HT3': '#ffd43b', 'LT3': '#ffe066',
    'HT4': '#69db7c', 'LT4': '#8ce99a',
    'HT5': '#4dabf7', 'LT5': '#74c0fc'
};

let activeDuelId = null;
let pollTimer = null;
let myRole = null;
let hasGuessedThisRound = false;
let lastRenderedSubmissionId = 'unset';
let ticking = false;
let nextRoundCountdown = null;

export async function startDuelPlay(duelId) {
    const user = getCurrentUser();
    if (!user) { alert('⚠️ Please login first!'); return; }

    activeDuelId = duelId;
    hasGuessedThisRound = false;
    lastRenderedSubmissionId = 'unset';

    document.getElementById('duelsView').style.display = 'none';
    document.getElementById('duelPlayView').style.display = 'block';

    const backBtn = document.getElementById('duelPlayBackBtn');
    if (backBtn) backBtn.onclick = stopDuelPlay;

    document.getElementById('duelPlayOptions').innerHTML = '';
    document.getElementById('duelPlayScoreboard').innerHTML = '';
    document.getElementById('duelPlayStatus').textContent = '⏳ Loading duel...';

    await tick();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(tick, 2500);
}

export function stopDuelPlay() {
    activeDuelId = null;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    if (nextRoundCountdown) clearInterval(nextRoundCountdown);
    nextRoundCountdown = null;

    const iframe = document.getElementById('duelPlayVideo');
    if (iframe) iframe.src = '';

    document.getElementById('duelPlayView').style.display = 'none';
    document.getElementById('duelsView').style.display = 'block';
}

async function tick() {
    if (!activeDuelId || ticking) return;
    ticking = true;
    try {
        const user = getCurrentUser();
        if (!user) { stopDuelPlay(); return; }

        const { data: duel } = await supabase
            .from('duels')
            .select(`
                id, challenger_id, opponent_id, type, status,
                challenger_score, opponent_score, winner_id,
                round_number, current_submission_id, challenger_guess, opponent_guess,
                challenger:challenger_id(username), opponent:opponent_id(username),
                round_results, clip_pool, current_clip_index
            `)
            .eq('id', activeDuelId)
            .single();

        if (!duel) { stopDuelPlay(); return; }

        if (duel.status === 'finished') {
            renderFinished(duel, user);
            return;
        }

        myRole = duel.challenger_id === user.id ? 'challenger' : 'opponent';

        if (!duel.current_submission_id) {
            document.getElementById('duelPlayStatus').textContent = '🎬 Picking a clip...';
            await pickClip(duel);
            ticking = false;
            return;
        }

        await renderRound(duel, user);
    } catch (err) {
        console.error('❌ Tick error:', err);
    } finally {
        ticking = false;
    }
}

async function pickClip(duel) {
    const clipPool = duel.clip_pool || [];
    const currentIndex = duel.current_clip_index || 0;

    if (clipPool.length === 0) {
        document.getElementById('duelPlayStatus').textContent = '❌ No clips available for this duel.';
        return;
    }

    if (currentIndex >= clipPool.length) {
        return;
    }

    const clipId = clipPool[currentIndex];

    await supabase
        .from('duels')
        .update({
            current_submission_id: clipId,
            current_clip_index: currentIndex + 1
        })
        .eq('id', duel.id)
        .is('current_submission_id', null);
}

async function renderRound(duel, user) {
    const targetScore = duel.type === 'FT5' ? 5 : 3;
    const oppName = myRole === 'challenger' ? duel.opponent.username : duel.challenger.username;
    const myScore = myRole === 'challenger' ? duel.challenger_score : duel.opponent_score;
    const oppScore = myRole === 'challenger' ? duel.opponent_score : duel.challenger_score;
    const myGuess = myRole === 'challenger' ? duel.challenger_guess : duel.opponent_guess;
    const oppGuess = myRole === 'challenger' ? duel.opponent_guess : duel.challenger_guess;

    document.getElementById('duelPlayScoreboard').innerHTML = `
        <span class="duel-score">YOU ${myScore} : ${oppScore} ${oppName}</span>
        <span class="pixel-round">first to ${targetScore}</span>
    `;

    if (duel.current_submission_id !== lastRenderedSubmissionId) {
        lastRenderedSubmissionId = duel.current_submission_id;
        hasGuessedThisRound = !!myGuess;

        const { data: sub } = await supabase
            .from('submissions')
            .select('video_url')
            .eq('id', duel.current_submission_id)
            .single();

        if (sub) {
            document.getElementById('duelPlayVideo').src = getYouTubeEmbedUrl(sub.video_url);
        }
        renderOptions(hasGuessedThisRound);
    }

    if (myGuess && oppGuess) {
        document.getElementById('duelPlayStatus').textContent = '⚔️ Resolving round...';
        await resolveRound(duel);
        return;
    }

    if (myGuess && !oppGuess) {
        document.getElementById('duelPlayStatus').textContent = `✅ Guess locked in (${myGuess}). Waiting for ${oppName}...`;
    } else if (!myGuess) {
        document.getElementById('duelPlayStatus').textContent = '🎯 Guess the tier!';
    }
}

function renderOptions(disabled) {
    const container = document.getElementById('duelPlayOptions');
    container.innerHTML = '';
    const tierKeys = Object.keys(TIER_ORDER);
    const shuffled = [...tierKeys].sort(() => Math.random() - 0.5);
    shuffled.forEach(tier => {
        const btn = document.createElement('button');
        btn.textContent = tier;
        btn.style.borderColor = TIER_COLORS[tier] + '44';
        btn.disabled = disabled;
        btn.onclick = () => submitGuess(tier);
        container.appendChild(btn);
    });
}

async function submitGuess(tier) {
    if (!activeDuelId || hasGuessedThisRound) return;
    hasGuessedThisRound = true;

    document.querySelectorAll('#duelPlayOptions button').forEach(b => b.disabled = true);

    const field = myRole === 'challenger' ? 'challenger_guess' : 'opponent_guess';
    await supabase
        .from('duels')
        .update({ [field]: tier })
        .eq('id', activeDuelId);

    document.getElementById('duelPlayStatus').textContent = `✅ Guess locked in (${tier}). Waiting for opponent...`;
    tick();
}

async function resolveRound(duel) {
    const user = getCurrentUser();
    if (!user) return;

    const { data: sub } = await supabase
        .from('submissions')
        .select('tier')
        .eq('id', duel.current_submission_id)
        .single();

    if (!sub) return;
    const actualTier = sub.tier;

    const isChallenger = duel.challenger_id === user.id;
    const myGuess = isChallenger ? duel.challenger_guess : duel.opponent_guess;
    const oppGuess = isChallenger ? duel.opponent_guess : duel.challenger_guess;
    const oppName = isChallenger ? duel.opponent.username : duel.challenger.username;

    const myDiff = Math.abs(TIER_ORDER[actualTier] - TIER_ORDER[myGuess]);
    const oppDiff = Math.abs(TIER_ORDER[actualTier] - TIER_ORDER[oppGuess]);

    function getPoints(diff) {
        if (diff === 0) return 100;
        if (diff === 1) return 50;
        if (diff === 2) return 25;
        if (diff === 3) return 10;
        if (diff === 4) return 5;
        return 0;
    }

    // Points are shown per-round for feedback only. They must NOT be added
    // straight into challenger_score/opponent_score, because those are
    // compared against targetScore (3 for FT3, 5 for FT5) to end the duel —
    // adding raw points (up to 100) there made almost every duel end after
    // round 1. The actual match score is "rounds won" (closer guess wins).
    const myPoints = getPoints(myDiff);
    const oppPoints = getPoints(oppDiff);

    const challengerDiff = isChallenger ? myDiff : oppDiff;
    const opponentDiff = isChallenger ? oppDiff : myDiff;

    let newChallengerScore = duel.challenger_score;
    let newOpponentScore = duel.opponent_score;
    let roundWinner = null; // 'challenger' | 'opponent' | null (tie)

    if (challengerDiff < opponentDiff) {
        newChallengerScore += 1;
        roundWinner = 'challenger';
    } else if (opponentDiff < challengerDiff) {
        newOpponentScore += 1;
        roundWinner = 'opponent';
    }
    // equal diff = tie round, nobody's score increases, duel continues

    const roundResult = {
        round: (duel.round_number || 1),
        clip_id: duel.current_submission_id,
        actual_tier: actualTier,
        challenger_guess: duel.challenger_guess,
        opponent_guess: duel.opponent_guess,
        challenger_points: isChallenger ? myPoints : oppPoints,
        opponent_points: isChallenger ? oppPoints : myPoints,
        round_winner: roundWinner,
        challenger_score: newChallengerScore,
        opponent_score: newOpponentScore
    };

    const existingResults = duel.round_results || [];
    existingResults.push(roundResult);

    const targetScore = duel.type === 'FT5' ? 5 : 3;
    const finished = newChallengerScore >= targetScore || newOpponentScore >= targetScore;
    const winnerId = finished
        ? (newChallengerScore > newOpponentScore ? duel.challenger_id : duel.opponent_id)
        : null;

    await supabase
        .from('duels')
        .update({
            challenger_score: newChallengerScore,
            opponent_score: newOpponentScore,
            current_submission_id: null,
            challenger_guess: null,
            opponent_guess: null,
            round_number: (duel.round_number || 1) + 1,
            status: finished ? 'finished' : 'active',
            winner_id: winnerId,
            round_results: existingResults
        })
        .eq('id', duel.id)
        .eq('current_submission_id', duel.current_submission_id);

    showRoundResult(roundResult, isChallenger, oppName);

    lastRenderedSubmissionId = 'unset';
    hasGuessedThisRound = false;
}

function showRoundResult(result, isChallenger, oppName) {
    const myPoints = isChallenger ? result.challenger_points : result.opponent_points;
    const oppPoints = isChallenger ? result.opponent_points : result.challenger_points;
    const myGuess = isChallenger ? result.challenger_guess : result.opponent_guess;
    const oppGuess = isChallenger ? result.opponent_guess : result.challenger_guess;

    const actualColor = TIER_COLORS[result.actual_tier] || '#ffffff';
    const myColor = TIER_COLORS[myGuess] || '#ffffff';
    const oppColor = TIER_COLORS[oppGuess] || '#ffffff';

    const myDiff = Math.abs(TIER_ORDER[result.actual_tier] - TIER_ORDER[myGuess]);
    const oppDiff = Math.abs(TIER_ORDER[result.actual_tier] - TIER_ORDER[oppGuess]);

    function getDiffEmoji(diff) {
        if (diff === 0) return '🎯 PERFECT!';
        if (diff === 1) return '🔥 CLOSE!';
        if (diff === 2) return '👍 GOOD!';
        if (diff === 3) return '📊 OKAY';
        if (diff === 4) return '😬 OFF';
        return '💀 MISS';
    }

    const statusDiv = document.getElementById('duelPlayStatus');
    statusDiv.innerHTML = `
        <div style="text-align:center;padding:0.5rem;background:var(--obsidian);border:2px solid var(--gold-dark);border-radius:8px;">
            <div style="font-size:0.9rem;color:var(--gold);margin-bottom:0.5rem;">⚔️ ROUND ${result.round} RESULT</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;text-align:center;">
                <div>
                    <div style="font-size:0.7rem;color:var(--parchment-bright);">YOU</div>
                    <div style="font-size:1.1rem;color:${myColor};">${myGuess}</div>
                    <div style="font-size:0.6rem;color:${myDiff === 0 ? '#44ff88' : '#ffd43b'};">${getDiffEmoji(myDiff)}</div>
                    <div style="font-size:0.8rem;color:#44ff88;">+${myPoints}</div>
                </div>
                <div>
                    <div style="font-size:0.7rem;color:var(--parchment-bright);">${oppName}</div>
                    <div style="font-size:1.1rem;color:${oppColor};">${oppGuess}</div>
                    <div style="font-size:0.6rem;color:${oppDiff === 0 ? '#44ff88' : '#ffd43b'};">${getDiffEmoji(oppDiff)}</div>
                    <div style="font-size:0.8rem;color:#ff6b6b;">+${oppPoints}</div>
                </div>
            </div>
            <div style="margin-top:0.5rem;font-size:0.7rem;color:#4a5060;">
                Actual tier: <strong style="color:${actualColor};">${result.actual_tier}</strong>
            </div>
        </div>
    `;

    if (nextRoundCountdown) clearInterval(nextRoundCountdown);

    let secondsLeft = 3;
    const optionsContainer = document.getElementById('duelPlayOptions');
    optionsContainer.innerHTML = `
        <button id="nextRoundBtn" onclick="window.startNextRound()" class="pixel-btn pixel-btn-primary" style="width:100%;">▶ NEXT ROUND (${secondsLeft})</button>
    `;

    // ✅ VISIBLE 3-SECOND COUNTDOWN, AUTO-ADVANCES (click still skips instantly)
    nextRoundCountdown = setInterval(() => {
        secondsLeft--;
        const btn = document.getElementById('nextRoundBtn');
        if (btn) btn.textContent = `▶ NEXT ROUND (${secondsLeft})`;

        if (secondsLeft <= 0) {
            clearInterval(nextRoundCountdown);
            nextRoundCountdown = null;
            window.startNextRound();
        }
    }, 1000);
}

window.startNextRound = function() {
    if (nextRoundCountdown) {
        clearInterval(nextRoundCountdown);
        nextRoundCountdown = null;
    }
    document.getElementById('duelPlayOptions').innerHTML = '';
    document.getElementById('duelPlayStatus').textContent = '⏳ Loading next round...';
    tick();
};

function renderFinished(duel, user) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    if (nextRoundCountdown) clearInterval(nextRoundCountdown);
    nextRoundCountdown = null;

    const won = duel.winner_id === user.id;
    const myScore = duel.challenger_id === user.id ? duel.challenger_score : duel.opponent_score;
    const oppScore = duel.challenger_id === user.id ? duel.opponent_score : duel.challenger_score;
    const oppName = duel.challenger_id === user.id ? duel.opponent.username : duel.challenger.username;

    document.getElementById('duelPlayOptions').innerHTML = '';
    document.getElementById('duelPlayScoreboard').innerHTML = '';

    let historyHtml = '';
    const results = duel.round_results || [];
    if (results.length > 0) {
        historyHtml = `
            <div style="margin-top:0.5rem;max-height:150px;overflow-y:auto;width:100%;">
                <div style="font-size:0.6rem;color:#4a5060;margin-bottom:0.3rem;">📊 ROUND HISTORY</div>
                ${results.map((r, i) => `
                    <div style="display:flex;justify-content:space-between;font-size:0.55rem;padding:0.15rem 0;border-bottom:1px solid var(--line-soft);">
                        <span style="color:#4a5060;">R${i+1}</span>
                        <span style="color:${TIER_COLORS[r.actual_tier] || '#fff'};">${r.actual_tier}</span>
                        <span style="color:${TIER_COLORS[r.challenger_guess] || '#fff'};">${r.challenger_guess}</span>
                        <span style="color:${TIER_COLORS[r.opponent_guess] || '#fff'};">${r.opponent_guess}</span>
                        <span style="color:#44ff88;">${r.challenger_points}</span>
                        <span style="color:#ff6b6b;">${r.opponent_points}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    document.getElementById('duelPlayStatus').innerHTML = `
        <div style="text-align:center;padding:1rem;">
            <div style="font-size:1.5rem;color:${won ? 'var(--grass-bright)' : '#ff8b80'};margin-bottom:0.5rem;">
                ${won ? '🏆 YOU WON THE DUEL!' : '💀 YOU LOST THIS ONE'}
            </div>
            <div style="font-size:1.2rem;color:var(--gold);">
                ${myScore} : ${oppScore}
            </div>
            <div style="font-size:0.8rem;color:var(--parchment-bright);">
                vs ${oppName}
            </div>
            ${historyHtml}
            <button onclick="stopDuelPlay()" class="pixel-btn pixel-btn-secondary" style="margin-top:1rem;width:auto;padding:0.5rem 2rem;display:inline-block;">
                ◀ BACK TO DUELS
            </button>
        </div>
    `;
}