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

function calculateScore(actualTier, guessedTier) {
    const actualPos = TIER_ORDER[actualTier];
    const guessPos = TIER_ORDER[guessedTier];
    const diff = Math.abs(actualPos - guessPos);
    
    let points = 0;
    let feedback = '';
    let emoji = '';
    
    if (diff === 0) {
        points = 100;
        feedback = '🎯 PERFECT!';
        emoji = '🏆';
    } else if (diff === 1) {
        points = 50;
        feedback = '🔥 CLOSE!';
        emoji = '🔥';
    } else if (diff === 2) {
        points = 25;
        feedback = '👍 GOOD!';
        emoji = '👌';
    } else if (diff === 3) {
        points = 10;
        feedback = '📊 OKAY';
        emoji = '📊';
    } else if (diff === 4) {
        points = 5;
        feedback = '😬 OFF';
        emoji = '😬';
    } else {
        points = 0;
        feedback = '💀 MISS';
        emoji = '💀';
    }
    
    const multiplier = streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1;
    const finalPoints = Math.round(points * multiplier);
    
    return {
        points: finalPoints,
        diff,
        feedback,
        emoji,
        multiplier,
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
            
            if (!data || data.length < 3) {
                document.getElementById('gameStatus').textContent = '❌ Not enough verified clips. Need at least 3.';
                return;
            }
            
            submissions = data.sort(() => Math.random() - 0.5);
            score = 0;
            streak = 0;
            currentRound = 0;
            gameActive = true;
            totalRounds = Math.min(10, submissions.length);
            
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
    
    const embedUrl = getYouTubeEmbedUrl(currentSubmission.video_url);
    
    // Set iframe src
    const iframe = document.getElementById('gameVideo');
    iframe.src = embedUrl;
    
    document.getElementById('gameRound').textContent = `ROUND ${currentRound}/${totalRounds}`;
    document.getElementById('gameStatus').textContent = '🎯 Choose the tier!';
    document.getElementById('gameResult').style.display = 'none';
    document.getElementById('nextRoundBtn').style.display = 'none';
    
    const tierKeys = Object.keys(TIER_ORDER);
    const shuffled = [...tierKeys].sort(() => Math.random() - 0.5);
    
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
    streak = points > 0 ? streak + 1 : 0;
    
    const resultDiv = document.getElementById('gameResult');
    resultDiv.style.display = 'block';
    resultDiv.style.borderColor = result.color;
    resultDiv.style.background = 'rgba(0,0,0,0.8)';
    resultDiv.style.border = `3px solid ${result.color}`;
    resultDiv.style.padding = '1rem';
    resultDiv.style.borderRadius = '8px';
    resultDiv.style.marginBottom = '1rem';
    resultDiv.style.textAlign = 'center';
    
    const multiplierText = result.multiplier > 1 ? ` (${result.multiplier}x streak!)` : '';
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