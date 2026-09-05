import { supabase, switchView, updateAuthUI, isValidUsername } from './app.js';

// ============================================================
// SIMPLE PASSWORD HASH
// ============================================================
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'tierduel_salt');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
// SHOW MESSAGE
// ============================================================
function showMessage(text, type) {
    const msg = document.getElementById('authMessage');
    if (msg) {
        msg.style.display = 'block';
        msg.textContent = text;
        msg.className = 'auth-message ' + type;
    }
}

// ============================================================
// INIT AUTH
// ============================================================
export function initAuth() {
    console.log('🔐 initAuth started');
    
    // ============================================================
    // LOGIN BUTTON
    // ============================================================
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.onclick = async function(e) {
            e.preventDefault();
            console.log('🔑 Login button clicked!');
            
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;
            
            if (!username || !password) {
                showMessage('Please enter username and password.', 'error');
                return;
            }
            
            try {
                const { data: user } = await supabase
                    .from('app_users')
                    .select('*')
                    .eq('username', username)
                    .maybeSingle();
                
                if (!user) {
                    showMessage('❌ User not found.', 'error');
                    return;
                }
                
                const hashedInput = await hashPassword(password);
                
                if (hashedInput !== user.password_hash) {
                    showMessage('❌ Wrong password.', 'error');
                    return;
                }
                
                localStorage.setItem('tierduel_user', JSON.stringify({
                    id: user.id,
                    username: user.username,
                    is_moderator: user.is_moderator || false
                }));
                
                // Load user's badges after login
                const { data: userBadges } = await supabase
                    .from('user_badges')
                    .select('badge_id')
                    .eq('user_id', user.id);
                
                const badgeIds = userBadges?.map(b => b.badge_id) || [];
                localStorage.setItem('tierduel_badges', JSON.stringify(badgeIds));
                
                showMessage('✅ Login successful!', 'success');
                setTimeout(() => {
                    updateAuthUI();
                    switchView('game');
                }, 500);
            } catch (error) {
                showMessage('❌ ' + error.message, 'error');
            }
        };
        console.log('✅ Login button attached');
    } else {
        console.error('❌ Login button NOT found!');
    }
    
    // ============================================================
    // REGISTER BUTTON
    // ============================================================
    const registerBtn = document.getElementById('registerBtn');
    if (registerBtn) {
        registerBtn.onclick = async function(e) {
            e.preventDefault();
            console.log('📝 Register button clicked!');
            
            const username = document.getElementById('registerUsername').value.trim();
            const password = document.getElementById('registerPassword').value;
            
            if (!username || !password) {
                showMessage('Please enter username and password.', 'error');
                return;
            }

            if (!isValidUsername(username)) {
                showMessage('Username can only contain letters and numbers.', 'error');
                return;
            }
            
            if (password.length < 6) {
                showMessage('Password must be at least 6 characters.', 'error');
                return;
            }
            
            try {
                const { data: existing } = await supabase
                    .from('app_users')
                    .select('username')
                    .eq('username', username)
                    .maybeSingle();
                
                if (existing) {
                    showMessage('❌ Username already taken.', 'error');
                    return;
                }
                
                const password_hash = await hashPassword(password);
                
                const { error } = await supabase
                    .from('app_users')
                    .insert({
                        username: username,
                        password_hash: password_hash,
                        is_moderator: false
                    });
                
                if (error) throw error;
                
                showMessage('✅ Registration successful! Please login.', 'success');
                document.getElementById('registerUsername').value = '';
                document.getElementById('registerPassword').value = '';
                
                setTimeout(() => {
                    document.getElementById('loginForm').style.display = 'block';
                    document.getElementById('registerForm').style.display = 'none';
                    document.getElementById('authMessage').innerHTML = '';
                }, 1500);
            } catch (error) {
                showMessage('❌ ' + error.message, 'error');
            }
        };
        console.log('✅ Register button attached');
    } else {
        console.error('❌ Register button NOT found!');
    }
    
    // ============================================================
    // SWITCH FORMS
    // ============================================================
    const showRegister = document.getElementById('showRegister');
    if (showRegister) {
        showRegister.onclick = function(e) {
            e.preventDefault();
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('registerForm').style.display = 'block';
            document.getElementById('authMessage').innerHTML = '';
        };
    }
    
    const showLogin = document.getElementById('showLogin');
    if (showLogin) {
        showLogin.onclick = function(e) {
            e.preventDefault();
            document.getElementById('loginForm').style.display = 'block';
            document.getElementById('registerForm').style.display = 'none';
            document.getElementById('authMessage').innerHTML = '';
        };
    }
    
    // ============================================================
    // ENTER KEY SUPPORT
    // ============================================================
    document.getElementById('loginPassword')?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') document.getElementById('loginBtn')?.click();
    });
    document.getElementById('registerPassword')?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') document.getElementById('registerBtn')?.click();
    });
}