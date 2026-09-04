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

let submissions = [];
let currentRound = 0;
let totalRounds = 10;
let score = 0;
let streak = 0;
let gameActive = false;
let currentSubmission = null;
let roundStartedAt = 0;

function calculateScore(actualTier, guessedTier) {
    const actualPos = TIER_ORDER[actualTier];
    const guessPos = TIER_ORDER[guessedTier];
    const diff = Math.abs(actualPos - guessPos);
    
    const accuracyPoints = [100, 50, 25, 10, 5, 2][Math.min(diff, 5)];
    let feedback = '';
    let emoji = '';
    
    if (diff === 0) {
        feedback = '🎯 PERFECT!';
        emoji = '🏆';
    } else if (diff === 1) {
        feedback = '🔥 CLOSE!';
        emoji = '🔥';
    } else if (diff === 2) {
        feedback = '👍 GOOD!';
        emoji = '👌';
    } else if (diff === 3) {
        feedback = '📊 OKAY';
        emoji = '📊';
    } else if (diff === 4) {
        feedback = '😬 OFF';
        emoji = '😬';
    } else {
        feedback = '💀 MISS';
        emoji = '💀';
    }
    
    const nextStreak = diff === 0 ? streak + 1 : 0;
    const streakMultiplier = nextStreak >= 5 ? 3 : nextStreak >= 3 ? 2 : 1;
    const speedMultiplier = Date.now() - roundStartedAt <= 5000 ? 1.2 : 1;
    const difficultyMultiplier = 1 + Math.abs(actualPos - 5.5) * 0.08;
    const finalPoints = Math.round(accuracyPoints * speedMultiplier * streakMultiplier * difficultyMultiplier);
    
    return {
        points: finalPoints,
        diff,
        feedback,
        emoji,
        multiplier: speedMultiplier * streakMultiplier * difficultyMultiplier,
        speedMultiplier,
        streakMultiplier,
        difficultyMultiplier,
        nextStreak,
        actual: actualTier,
        guessed: guessedTier,
        color: getColorForDiff(diff)
    };
}

function getColorForDiff(diff) {
    if (diff === 0) return '#44ff88';
    if (diff === 1) return '#ffd43b';
    if (diff === 2) return '#ffa94d';
    if (diff === 3) return '#4dabf7';
    if (diff === 4) return '#cc99ff';
    return '#ff6b6b';
}

export function initGame() {
    const startBtn = document.getElementById('startGameBtn');
    const nextBtn = document.getElementById('nextRoundBtn');
    
    if (startBtn) {
        startBtn.onclick = async function() {
            const user = getCurrentUser();
            if (!user) {
                document.getElementById('gameStatus').textContent = '⚠️ Please login first!';
                alert('⚠️ You must be logged in to play!');
                return;
            }
            
            const { data } = await supabase
                .from('submissions')
                .select('*')
                .eq('status', 'approved')
                .eq('verification_status', 'verified');
            
            submissions = [...new Map(
                data.map(submission => [getYouTubeEmbedUrl(submission.video_url.trim()), submission])
            ).values()].sort(() => Math.random() - 0.5);

            if (submissions.length < 3) {
                document.getElementById('gameStatus').textContent = '❌ Not enough unique clips. Need at least 3.';
                return;
            }
            score = 0;
            streak = 0;
            currentRound = 0;
            gameActive = true;
            totalRounds = Math.min(3, submissions.length);
            
            document.getElementById('gameScoreDisplay').textContent = 'SCORE: 0';
            document.getElementById('gameStreak').textContent = '🔥 STREAK: 0';
            document.getElementById('startGameBtn').style.display = 'none';
            document.getElementById('gameResult').style.display = 'none';
            document.getElementById('gameStatus').textContent = '🎮 Game started!';
            
            startRound();
        };
    }
    
    if (nextBtn) {
        nextBtn.onclick = startRound;
    }
}

function startRound() {
    if (!gameActive || currentRound >= totalRounds) {
        endGame();
        return;
    }
    
    const available = submissions.filter(s => s.id !== currentSubmission?.id);
    if (available.length === 0) {
        document.getElementById('gameStatus').textContent = 'No more clips available.';
        return;
    }
    
    currentSubmission = available[Math.floor(Math.random() * available.length)];
    currentRound++;
    roundStartedAt = Date.now();
    
    const iframe = document.getElementById('gameVideo');
    iframe.src = getYouTubeEmbedUrl(currentSubmission.video_url);
    
    document.getElementById('gameRound').textContent = `ROUND ${currentRound}/${totalRounds}`;
    document.getElementById('gameStatus').textContent = '🎯 Choose the tier!';
    document.getElementById('gameResult').style.display = 'none';
    document.getElementById('nextRoundBtn').style.display = 'none';
    
    const tierKeys = Object.keys(TIER_ORDER);
    const shuffled = tierKeys;
    
    const container = document.getElementById('gameOptions');
    container.innerHTML = '';
    
    shuffled.forEach(tier => {
        const btn = document.createElement('button');
        btn.textContent = tier;
        btn.style.borderColor = TIER_COLORS[tier] + '44';
        btn.dataset.tier = tier;
        btn.onclick = function() {
            handleGuess(tier);
        };
        container.appendChild(btn);
    });
}

function handleGuess(guessedTier) {
    if (!currentSubmission) return;
    
    const actualTier = currentSubmission.tier;
    const result = calculateScore(actualTier, guessedTier);
    
    const points = result.points;
    score += points;
    streak = result.nextStreak;
    
    const resultDiv = document.getElementById('gameResult');
    resultDiv.style.display = 'block';
    resultDiv.style.borderColor = result.color;
    resultDiv.style.background = 'rgba(0,0,0,0.8)';
    resultDiv.style.border = `3px solid ${result.color}`;
    resultDiv.style.padding = '1rem';
    resultDiv.style.borderRadius = '8px';
    resultDiv.style.marginBottom = '1rem';
    resultDiv.style.textAlign = 'center';
    
    const multiplierText = result.multiplier > 1 ? ` (${result.multiplier.toFixed(2)}x bonus)` : '';
    resultDiv.innerHTML = `
        <div style="font-size:1.2rem;color:${result.color};margin-bottom:0.5rem;">
            ${result.emoji} ${result.feedback}
        </div>
        <div style="font-size:0.8rem;color:#88ccff;">
            Actual: <strong style="color:${TIER_COLORS[actualTier]}">${actualTier}</strong> |
            Guessed: <strong style="color:${TIER_COLORS[guessedTier]}">${guessedTier}</strong>
            ${result.diff > 0 ? `(${result.diff} off)` : ''}
        </div>
        <div style="font-size:1rem;color:#ffd43b;margin-top:0.5rem;">
            +${points} points${multiplierText}
        </div>
    `;
    
    document.getElementById('gameScoreDisplay').textContent = `SCORE: ${score}`;
    document.getElementById('gameStreak').textContent = `🔥 STREAK: ${streak}`;
    document.getElementById('gameStatus').textContent = `✅ +${points} points`;
    
    document.querySelectorAll('#gameOptions button').forEach(b => {
        b.disabled = true;
        const tier = b.dataset.tier;
        if (tier === actualTier) {
            b.style.borderColor = '#44ff88';
            b.style.background = 'rgba(0,200,100,0.2)';
        } else if (tier === guessedTier && guessedTier !== actualTier) {
            b.style.borderColor = '#ff4444';
            b.style.background = 'rgba(200,0,0,0.2)';
        }
    });
    
    if (currentRound < totalRounds) {
        document.getElementById('nextRoundBtn').style.display = 'block';
    } else {
        setTimeout(endGame, 1500);
    }
}

function endGame() {
    gameActive = false;
    document.getElementById('nextRoundBtn').style.display = 'none';
    document.getElementById('gameStatus').innerHTML = `
        <div style="text-align:center;">
            <div style="font-size:1.5rem;color:#ffd43b;margin-bottom:0.5rem;">🎮 GAME OVER!</div>
            <div style="font-size:1.2rem;color:#44ff88;">Final Score: ${score}</div>
            <div style="font-size:0.8rem;color:#88ccff;">Best Streak: ${streak}</div>
        </div>
    `;
    document.getElementById('startGameBtn').style.display = 'block';
    document.getElementById('gameResult').style.display = 'none';
}