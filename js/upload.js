import { supabase, getCurrentUser } from './app.js';

export function initUpload() {
    const uploadBtn = document.getElementById('uploadBtn');

    if (uploadBtn) {
        uploadBtn.onclick = async function () {
            const user = getCurrentUser();
            
            if (!user) {
                const status = document.getElementById('uploadStatus');
                status.innerHTML = '<div class="error">⚠️ You must be logged in!</div>';
                return;
            }

            const videoUrl = document.getElementById('videoUrl').value.trim();
            const tier = document.getElementById('tierSelect').value;
            const proof = document.getElementById('proofText').value.trim();
            const status = document.getElementById('uploadStatus');

            // --- Validation ---
            if (!videoUrl) {
                status.innerHTML = '<div class="error">❌ Please enter a YouTube URL.</div>';
                return;
            }
            if (!tier) {
                status.innerHTML = '<div class="error">❌ Select a tier.</div>';
                return;
            }
            if (!proof) {
                status.innerHTML = '<div class="error">❌ Please provide proof of your tier!</div>';
                return;
            }

            // Validate YouTube URL
            const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
            if (!youtubeRegex.test(videoUrl)) {
                status.innerHTML = '<div class="error">❌ Invalid YouTube URL. Please paste a valid YouTube link.</div>';
                return;
            }

            status.innerHTML = '⏳ Submitting...';

            try {
                // Save to database with YouTube URL
                const { error: dbError } = await supabase
                    .from('submissions')
                    .insert({
                        user_id: user.id,
                        video_url: videoUrl,
                        tier: tier,
                        proof: proof,
                        status: 'pending',
                        verification_status: 'pending'
                    });

                if (dbError) {
                    console.error('❌ DB error:', dbError);
                    throw new Error(dbError.message);
                }

                status.innerHTML = '<div class="success">✅ Upload successful! Pending review & verification.</div>';
                document.getElementById('videoUrl').value = '';
                document.getElementById('tierSelect').value = 'HT3';
                document.getElementById('proofText').value = '';

            } catch (error) {
                console.error('❌ Upload error:', error);
                status.innerHTML = `<div class="error">❌ Upload failed: ${error.message}</div>`;
            }
        };
    }
}