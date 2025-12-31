// Main application controller
class FaceDetectionApp {
    constructor() {
        console.log('🔄 Initializing FaceDetectionApp...');

        // Khởi tạo VideoManager
        this.videoManager = new VideoManager();
        this.capturedImages = [];
        this.currentSessionImages = new Map();
        this.currentSessionId = null;

        // Load từ localStorage
        this.loadFromLocalStorage();

        // KHỞI TẠO VOICE CONTROL
        this.voiceControl = null;

        // Khởi tạo sự kiện chụp hình
        this.initCaptureEvents();

        // Biến theo dõi
        this.handleCaptureClick = null;
        this.isCapturing = false;

        // Thêm Set để theo dõi blob URLs
        this.blobUrls = new Set();

        // Setup cleanup listeners
        this.setupCleanupListeners();

        this.eventListenersAttached = false; // Thêm dòng này

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            // DOM đã sẵn sàng
            setTimeout(() => this.initialize(), 100);
        }
    }

    initialize() {
        console.log('🎯 Starting app initialization...');

        // Kiểm tra DOM elements
        const requiredElements = [
            'startCamera', 'stopCamera', 'startTracking', 'stopTracking',
            'faceCanvas', 'currentFaces', 'totalFaces', 'trackingTime'
        ];

        const missingElements = requiredElements.filter(id => !document.getElementById(id));

        if (missingElements.length > 0) {
            console.error('❌ Missing required DOM elements:', missingElements);
            setTimeout(() => this.initialize(), 1000);
            return;
        }

        console.log('✅ All DOM elements found');

        // Khởi tạo FaceDetector
        this.faceDetector = new FaceDetector();

        // QUAN TRỌNG: Thiết lập callbacks trực tiếp
        this.setupFaceDetectorCallbacks();

        // Setup event listeners
        this.setupEventListeners();

        // Setup tab switching
        this.setupTabSwitching();

        // Thêm event listeners cho modal xóa
        this.setupDeleteModal();

        // KHỞI TẠO VOICE CONTROL (sau khi DOM sẵn sàng)
        this.initializeVoiceControl();

        console.log('✅ FaceDetectionApp initialized successfully');
    }

    initializeVoiceControl() {
        try {
            this.voiceControl = new VoiceControl();
            console.log('✅ Voice Control initialized');
        } catch (error) {
            console.warn('⚠️ Voice Control initialization failed:', error);
        }
    }

    showBasicHelp() {
        const helpText = `
        🎤 Lệnh điều khiển bằng giọng nói:
        
        • "Bật camera" - Khởi động camera
        • "Tắt camera" - Dừng camera
        • "Bắt đầu theo dõi" - Bắt đầu đếm khuôn mặt
        • "Dừng theo dõi" - Dừng đếm khuôn mặt
        • "Chụp hình" - Chụp ảnh từ camera
        • "Xem lịch sử" - Xem video đã lưu
        • "Quay lại live" - Quay về tab live
        • "Refresh" - Làm mới giao diện
        
        📝 Mẹo: Nói rõ ràng, tự nhiên. Có thể thêm "xin", "hãy", "...đi"
    `;

        alert(helpText);
    }

    // Thêm vào class FaceDetectionApp trong app.js
    updateFaceCount(count) {
        const faceCountElement = document.getElementById('faceCount');
        if (faceCountElement) {
            faceCountElement.textContent = count;
        }
    }

    updateTotalFaces(total) {
        const totalFacesElement = document.getElementById('totalFaces');
        if (totalFacesElement) {
            totalFacesElement.textContent = total;
        }
    }

    updateTrackingTime(seconds) {
        const trackingTimeElement = document.getElementById('trackingTime');
        if (trackingTimeElement) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            trackingTimeElement.textContent = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
    }

    setupDeleteModal() {
        this.deleteModal = document.getElementById('deleteModal');
        this.closeModal = document.querySelector('.close');
        this.cancelDelete = document.getElementById('cancelDelete');
        this.confirmDelete = document.getElementById('confirmDelete');
        this.deleteSessionInfo = document.getElementById('deleteSessionInfo');

        // Event listeners cho modal
        this.closeModal.addEventListener('click', () => this.hideDeleteModal());
        this.cancelDelete.addEventListener('click', () => this.hideDeleteModal());
        this.confirmDelete.addEventListener('click', () => this.executeDelete());

        // Đóng modal khi click bên ngoài
        window.addEventListener('click', (e) => {
            if (e.target === this.deleteModal) {
                this.hideDeleteModal();
            }
        });
    }

    hideDeleteModal() {
        this.deleteModal.style.display = 'none';
        this.currentDeleteSession = null;
    }

    // Phương thức setup cleanup listeners
    setupCleanupListeners() {
        // Cleanup khi trang bị đóng
        window.addEventListener('beforeunload', () => {
            this.cleanupBlobUrls();
            console.log('🧹 Cleanup before unload');
        });

        // Cleanup khi tab bị ẩn
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                console.log('👁️ Tab hidden, cleaning up old blob URLs...');
                this.cleanupOldBlobUrls(10); // Cleanup URLs cũ hơn 10 phút
            }
        });

        // Auto-cleanup mỗi 5 phút
        this.autoCleanupInterval = setInterval(() => {
            this.cleanupOldBlobUrls(10); // Cleanup URLs cũ hơn 10 phút
        }, 5 * 60 * 1000); // 5 phút

        console.log('✅ Cleanup listeners setup');
    }

    // Cleanup blob URLs cũ hơn X phút
    cleanupOldBlobUrls(minutesOld = 10) {
        console.log(`⏰ Running auto-cleanup for URLs older than ${minutesOld} minutes...`);
        let cleanedCount = 0;

        const cutoffTime = Date.now() - (minutesOld * 60 * 1000);

        // Duyệt qua tất cả blob URLs
        this.blobUrls.forEach(url => {
            try {
                // Lấy timestamp từ URL nếu có
                // (hoặc theo dõi thời gian tạo riêng)
                URL.revokeObjectURL(url);
                this.blobUrls.delete(url);
                cleanedCount++;
            } catch (e) {
                console.warn('⚠️ Failed to cleanup blob URL:', e);
            }
        });

        if (cleanedCount > 0) {
            console.log(`🧹 Auto-cleaned ${cleanedCount} old blob URLs`);
        }
    }

    // Thêm vào khi tạo blob URL
    createBlobUrl(blob) {
        const blobUrl = URL.createObjectURL(blob);
        this.blobUrls.add(blobUrl);
        return blobUrl;
    }

    // Cleanup khi xóa session hoặc chuyển tab
    cleanupSessionResources(sessionId) {
        console.log(`🧹 Cleaning up resources for session: ${sessionId}`);

        // 1. Dừng video nếu đang phát
        const videoPlayer = document.getElementById('playbackVideo');
        if (videoPlayer) {
            videoPlayer.pause();
            videoPlayer.src = '';
            videoPlayer.load();
        }

        // 2. Cleanup blob URLs của session này
        // (Cần lưu thêm metadata để biết URL nào thuộc session nào)
    }

    // Thêm vào khi xóa capture
    async deleteCapture(captureId, sessionId) {
        try {
            // Tìm capture trong session
            const sessionImages = this.currentSessionImages.get(sessionId) || [];
            const capture = sessionImages.find(img => img.id === captureId);

            if (capture) {
                // Cleanup blob URL nếu có
                if (capture.url && capture.url.startsWith('blob:')) {
                    this.removeBlobUrl(capture.url);
                }

                // Xóa từ UI
                const index = sessionImages.findIndex(img => img.id === captureId);
                if (index !== -1) {
                    sessionImages.splice(index, 1);
                    this.currentSessionImages.set(sessionId, sessionImages);
                    this.displaySessionCaptures(sessionImages);
                }

                // Xóa từ database (gọi API)
                if (!capture.isLocal) {
                    await fetch(`/api/captures/${capture.public_id}`, {
                        method: 'DELETE'
                    });
                }

                console.log(`🗑️ Deleted capture ${captureId}`);
                this.showNotification('✅ Đã xóa hình ảnh', 'success');
            }
        } catch (error) {
            console.error('❌ Error deleting capture:', error);
            this.showNotification('❌ Lỗi khi xóa hình ảnh', 'error');
        }
    }

    async executeDelete() {
        if (!this.currentDeleteSession) return;

        const deleteBtn = this.confirmDelete;
        const originalText = deleteBtn.innerHTML;

        try {
            deleteBtn.innerHTML = '<span class="loading"></span> Đang xóa...';
            deleteBtn.disabled = true;

            const sessionId = this.currentDeleteSession.id;

            console.log(`🗑️ Đang xóa session: ${sessionId}`);

            const response = await fetch(`/api/sessions/${sessionId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ Session deleted successfully:', result);
                this.hideDeleteModal();
                this.showNotification('✅ Session đã được xóa thành công', 'success');
                await this.loadVideoHistory();

                // Clear video player nếu đang phát session bị xóa
                const videoPlayer = document.getElementById('playbackVideo');
                const videoInfo = document.getElementById('videoInfo');
                if (videoPlayer && videoInfo) {
                    videoPlayer.style.display = 'none';
                    videoInfo.innerHTML = `
                    <div class="no-video-selected">
                        <div class="icon">📹</div>
                        <div>
                            <h4>Chưa có video được chọn</h4>
                            <p>Vui lòng chọn một session từ danh sách bên trái để xem video và thông tin chi tiết.</p>
                        </div>
                    </div>
                `;
                }
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Lỗi khi xóa session');
            }
        } catch (error) {
            console.error('❌ Error deleting session:', error);
            this.showNotification(`❌ Lỗi khi xóa session: ${error.message}`, 'error');
        } finally {
            deleteBtn.innerHTML = 'Xác nhận xóa';
            deleteBtn.disabled = false;
        }
    }

    // Tải hình ảnh cho session
    async loadCapturesForSession(sessionId) {
        try {
            console.log(`📷 Loading captures for session: ${sessionId}`);

            // Tải từ database
            const response = await fetch(`/api/captures/session/${sessionId}`);

            if (response.ok) {
                const captures = await response.json();
                console.log(`✅ Loaded ${captures.length} captures from database for session ${sessionId}`);

                // Cập nhật currentSessionImages
                this.currentSessionImages.set(sessionId, captures);

                // Hiển thị trong UI
                this.displaySessionCaptures(captures);

                return captures;
            } else {
                console.log('⚠️ No captures found in database, trying local storage');

                // Fallback: Tải từ local storage
                const allCaptures = this.getAllCapturesFromLocalStorage();
                const sessionCaptures = allCaptures.filter(capture =>
                    capture.sessionId === sessionId
                );

                console.log(`📁 Loaded ${sessionCaptures.length} captures from local storage`);

                // Cập nhật currentSessionImages
                this.currentSessionImages.set(sessionId, sessionCaptures);

                // Hiển thị trong UI
                this.displaySessionCaptures(sessionCaptures);

                return sessionCaptures;
            }

        } catch (error) {
            console.error('❌ Error loading captures:', error);

            // Fallback cuối cùng
            const allCaptures = this.getAllCapturesFromLocalStorage();
            const sessionCaptures = allCaptures.filter(capture =>
                capture.sessionId === sessionId
            );

            this.displaySessionCaptures(sessionCaptures);
            return sessionCaptures;
        }
    }

    // Hiển thị hình ảnh trong session
    displaySessionCaptures(captures) {
        const container = document.getElementById('sessionCapturedImages');
        if (!container) {
            console.error('❌ Session captures container not found');
            return;
        }

        // Xóa nội dung cũ
        container.innerHTML = '';

        if (!captures || captures.length === 0) {
            container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📷</div>
                <p>Chưa có hình ảnh nào được chụp trong session này</p>
            </div>
        `;
            return;
        }

        console.log(`🖼️ Displaying ${captures.length} captures`);

        // Sắp xếp theo thời gian (mới nhất đầu tiên)
        const sortedCaptures = captures.sort((a, b) => b.timestamp - a.timestamp);

        // Hiển thị từng hình ảnh
        sortedCaptures.forEach((capture, index) => {
            const captureElement = this.createCaptureElement(capture, index);
            container.appendChild(captureElement);
        });

        // Cập nhật số lượng
        const countElement = document.getElementById('sessionCaptureCount');
        if (countElement) {
            countElement.textContent = `(${captures.length})`;
        }
    }

    async loadSessionVideo(sessionId) {
        console.log(`🎬 Loading video for session: ${sessionId}`);

        const videoPlayer = document.getElementById('playbackVideo');
        const videoLoading = document.getElementById('videoLoading');
        const noVideoOverlay = document.getElementById('noVideoOverlay');
        const videoInfo = document.getElementById('videoInfo');
        const captureFromVideoBtn = document.getElementById('captureFromVideo');

        // Lưu session hiện tại
        this.currentSessionId = sessionId;

        // Reset trạng thái
        videoPlayer.style.display = 'none';
        videoPlayer.classList.remove('video-error');
        if (noVideoOverlay) noVideoOverlay.style.display = 'flex';
        if (videoLoading) videoLoading.style.display = 'none';
        if (videoInfo) videoInfo.style.display = 'none';
        if (captureFromVideoBtn) captureFromVideoBtn.disabled = true;

        // Tạm dừng và reset video
        videoPlayer.pause();
        videoPlayer.src = '';
        videoPlayer.removeAttribute('src');
        videoPlayer.load();

        try {
            // THÊM LOG CHI TIẾT
            console.log(`🔍 Calling API: /api/sessions/${sessionId}`);
            console.log(`🔑 Token: ${window.authManager?.token ? 'Present' : 'Missing'}`);

            // Lấy thông tin session từ API
            const response = await fetch(`/api/sessions/${sessionId}`, {
                headers: {
                    'Authorization': `Bearer ${window.authManager?.token || localStorage.getItem('authToken')}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log(`📊 Response status: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ API Error Response:', errorText);
                throw new Error(`Failed to load session: ${response.status} - ${response.statusText}`);
            }

            const session = await response.json();
            console.log('📊 Session data from API:', JSON.stringify(session, null, 2));

            // DEBUG: Kiểm tra các trường quan trọng
            console.log('🔍 Field check:');
            console.log('- video_filename:', session.video_filename);
            console.log('- Type of video_filename:', typeof session.video_filename);
            console.log('- Is video_filename null?', session.video_filename === null);
            console.log('- Is video_filename "null"?', session.video_filename === 'null');
            console.log('- Is video_filename empty?', !session.video_filename);
            console.log('- Has video property?', 'video' in session);

            // Kiểm tra video_filename (Cloudinary URL)
            const videoUrl = session.video_filename;

            if (!videoUrl || videoUrl === 'null' || videoUrl === null) {
                console.warn('⚠️ Session has no video_filename');
                throw new Error('Session không có video file');
            }

            console.log(`📺 Video URL: ${videoUrl}`);

            // Kiểm tra nếu URL hợp lệ
            if (!this.isValidUrl(videoUrl)) {
                console.warn('⚠️ URL không hợp lệ, attempting to fix...');
                const fixedUrl = this.fixCloudinaryUrl(videoUrl);
                console.log(`🔄 Fixed URL: ${fixedUrl}`);
                session.video_filename = fixedUrl;
            }

            // HIỂN THỊ LOADING
            if (noVideoOverlay) noVideoOverlay.style.display = 'none';
            if (videoLoading) videoLoading.style.display = 'flex';

            // TẢI VIDEO TỪ CLOUDINARY
            await this.loadCloudinaryVideo(videoPlayer, session.video_filename, session);

        } catch (error) {
            console.error('❌ Error loading video:', error);
            this.showVideoError(error.message || 'Không thể tải thông tin session');
        }
    }

    // Thêm helper functions
    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    fixCloudinaryUrl(url) {
        // Nếu URL chỉ là public_id hoặc filename
        if (!url.includes('cloudinary.com')) {
            // Giả sử đây là public_id
            const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'dmscst4x8';
            return `https://res.cloudinary.com/${cloudName}/video/upload/${url}`;
        }

        // Nếu URL thiếu protocol
        if (url.startsWith('//')) {
            return `https:${url}`;
        }

        // Nếu URL bắt đầu với res.cloudinary.com (không có https)
        if (url.startsWith('res.cloudinary.com')) {
            return `https://${url}`;
        }

        return url;
    }

    async loadVideoWithProxy(videoPlayer, videoUrl, session) {
        console.log('🔄 Loading video through proxy method');

        const videoLoading = document.getElementById('videoLoading');
        const isCloudinary = videoUrl.includes('cloudinary.com');

        // Đối với Cloudinary, thử phương pháp đặc biệt
        if (isCloudinary) {
            console.log('☁️ Detected Cloudinary video, using optimized loader');
            await this.loadCloudinaryVideo(videoPlayer, videoUrl, session);
        } else {
            // Đối với URL thông thường
            await this.loadDirectVideo(videoPlayer, videoUrl, session);
        }
    }

    async loadCloudinaryVideo(videoPlayer, cloudinaryUrl, session) {
        console.log('🌩️ Loading Cloudinary video:', cloudinaryUrl);

        const videoLoading = document.getElementById('videoLoading');
        const noVideoOverlay = document.getElementById('noVideoOverlay');

        try {
            // 1. CHUẨN BỊ VIDEO PLAYER
            videoPlayer.style.display = 'none';
            videoPlayer.crossOrigin = 'anonymous';

            // 2. XỬ LÝ URL
            let videoUrl = cloudinaryUrl.trim();

            // Đảm bảo URL hợp lệ
            if (!this.isValidUrl(videoUrl)) {
                videoUrl = this.fixCloudinaryUrl(videoUrl);
            }

            // Thêm timestamp để tránh cache
            const separator = videoUrl.includes('?') ? '&' : '?';
            const finalUrl = `${videoUrl}${separator}_t=${Date.now()}`;

            console.log('🔗 Final video URL:', finalUrl);

            // 3. TEST URL TRƯỚC KHI GÁN
            const canLoad = await this.testVideoUrl(finalUrl);

            if (!canLoad) {
                throw new Error('Video URL không thể tải');
            }

            // 4. SETUP EVENT HANDLERS ĐƠN GIẢN
            const cleanup = () => {
                videoPlayer.removeEventListener('loadedmetadata', onLoaded);
                videoPlayer.removeEventListener('error', onError);
                videoPlayer.removeEventListener('canplay', onCanPlay);
            };

            const onLoaded = () => {
                cleanup();
                console.log('✅ Video metadata loaded');
                if (videoLoading) videoLoading.style.display = 'none';
                videoPlayer.style.display = 'block';
                this.displayVideoInfo(session, videoPlayer);
            };

            const onError = (e) => {
                cleanup();
                console.error('❌ Video error:', videoPlayer.error);

                let errorMsg = 'Lỗi tải video';
                if (videoPlayer.error) {
                    switch (videoPlayer.error.code) {
                        case 1: errorMsg = 'Video loading aborted'; break;
                        case 2: errorMsg = 'Network error'; break;
                        case 3: errorMsg = 'Video decode error'; break;
                        case 4: errorMsg = 'Video format not supported'; break;
                    }
                }

                this.showVideoError(errorMsg, finalUrl);
            };

            const onCanPlay = () => {
                cleanup();
                console.log('▶️ Video ready to play');
                if (videoLoading) videoLoading.style.display = 'none';
            };

            videoPlayer.addEventListener('loadedmetadata', onLoaded);
            videoPlayer.addEventListener('error', onError);
            videoPlayer.addEventListener('canplay', onCanPlay);

            // 5. GÁN SRC VÀ LOAD
            videoPlayer.src = finalUrl;
            videoPlayer.preload = 'auto';
            videoPlayer.load();

            // Timeout sau 10 giây
            setTimeout(() => {
                if (videoPlayer.readyState === 0) { // HAVE_NOTHING
                    console.warn('⚠️ Video loading timeout');
                    cleanup();
                    this.showVideoError('Video tải quá lâu, có thể URL không khả dụng', finalUrl);
                }
            }, 10000);

        } catch (error) {
            console.error('❌ Cloudinary video error:', error);
            this.showVideoError(error.message, cloudinaryUrl);
        }
    }


    setupVideoHandlers(videoPlayer, session) {
        const videoLoading = document.getElementById('videoLoading');
        const noVideoOverlay = document.getElementById('noVideoOverlay');
        const videoInfo = document.getElementById('videoInfo');
        const captureFromVideoBtn = document.getElementById('captureFromVideo');

        // Xóa event listeners cũ
        const newVideo = videoPlayer.cloneNode();
        videoPlayer.parentNode.replaceChild(newVideo, videoPlayer);
        const freshVideo = newVideo;
        freshVideo.id = 'playbackVideo';

        let hasMetadataLoaded = false;

        // LOADED METADATA - Video đã sẵn sàng
        freshVideo.onloadedmetadata = () => {
            console.log('✅ Video metadata loaded');
            console.log(`⏱️ Duration: ${freshVideo.duration}s`);
            console.log(`📏 Dimensions: ${freshVideo.videoWidth}x${freshVideo.videoHeight}`);

            hasMetadataLoaded = true;
            if (videoLoading) videoLoading.style.display = 'none';
            freshVideo.style.display = 'block';

            // Hiển thị thông tin video
            if (videoInfo) {
                videoInfo.innerHTML = `
                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-label">📅 Ngày tạo:</span>
                        <span class="info-value">${this.formatDate(session.created_at || session.start_time)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">⏱️ Thời lượng:</span>
                        <span class="info-value">${Math.round(freshVideo.duration)}s</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">👤 Số khuôn mặt:</span>
                        <span class="info-value">${session.total_faces || session.face_count || 0}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">💾 Nguồn:</span>
                        <span class="info-value">Cloudinary</span>
                    </div>
                </div>
            `;
                videoInfo.style.display = 'block';
            }

            if (captureFromVideoBtn) captureFromVideoBtn.disabled = false;

            // Load hình ảnh đã chụp
            this.loadSessionImages(session.id);
        };

        // CAN PLAY - Có thể bắt đầu phát
        freshVideo.oncanplay = () => {
            console.log('▶️ Video ready to play');
            if (videoLoading) videoLoading.style.display = 'none';

            // Thử phát tự động (muted để vượt qua autoplay policy)
            freshVideo.muted = true;
            freshVideo.play().catch(e => {
                console.log('ℹ️ Auto-play blocked, user interaction required');
            });
        };

        // ERROR - Xử lý lỗi
        freshVideo.onerror = (e) => {
            console.error('❌ Video error event:', e);
            console.error('Video error details:', freshVideo.error);

            if (videoLoading) videoLoading.style.display = 'none';

            let errorMsg = 'Lỗi tải video từ Cloudinary';
            if (freshVideo.error) {
                switch (freshVideo.error.code) {
                    case 1: errorMsg = 'MEDIA_ERR_ABORTED: Tải video bị hủy'; break;
                    case 2: errorMsg = 'MEDIA_ERR_NETWORK: Lỗi mạng'; break;
                    case 3: errorMsg = 'MEDIA_ERR_DECODE: Không thể giải mã video'; break;
                    case 4: errorMsg = 'MEDIA_ERR_SRC_NOT_SUPPORTED: Định dạng video không được hỗ trợ'; break;
                }
            }

            this.showVideoError(errorMsg, freshVideo.src);
        };

        // WAITING/STALLED - Đang buffer
        freshVideo.onwaiting = freshVideo.onstalled = () => {
            console.log('⏳ Video buffering...');
            if (!hasMetadataLoaded && videoLoading) {
                videoLoading.style.display = 'flex';
            }
        };

        // PLAYING - Đang phát
        freshVideo.onplaying = () => {
            console.log('🎬 Video playing');
            if (videoLoading) videoLoading.style.display = 'none';
        };

        return freshVideo;
    }

    // Thêm hàm utility để hiển thị video thông thường
    async loadDirectVideo(videoPlayer, videoUrl, session) {
        console.log('🔗 Loading direct video');

        const videoLoading = document.getElementById('videoLoading');

        try {
            videoPlayer.crossOrigin = 'anonymous';
            videoPlayer.preload = 'metadata';

            // Đặt src với timestamp
            const timestamp = Date.now();
            const separator = videoUrl.includes('?') ? '&' : '?';
            videoPlayer.src = `${videoUrl}${separator}_t=${timestamp}`;

            // Thiết lập event handlers đơn giản
            const onLoaded = () => {
                console.log('✅ Direct video loaded');
                if (videoLoading) videoLoading.style.display = 'none';
                videoPlayer.style.display = 'block';
                this.displayVideoInfo(session, videoPlayer);
            };

            const onError = () => {
                console.error('❌ Direct video error');
                this.showVideoError('Không thể tải video trực tiếp');
            };

            videoPlayer.addEventListener('loadedmetadata', onLoaded, { once: true });
            videoPlayer.addEventListener('error', onError, { once: true });

            videoPlayer.load();

        } catch (error) {
            console.error('❌ Direct load error:', error);
            this.showVideoError('Lỗi khi tải video trực tiếp');
        }
    }

    setupVideoEventHandlers(videoPlayer, session) {
        console.log('🎧 Setting up video event handlers...');

        const videoLoading = document.getElementById('videoLoading');
        const noVideoOverlay = document.getElementById('noVideoOverlay');
        const videoInfo = document.getElementById('videoInfo');

        // QUAN TRỌNG: Reset overlay trạng thái
        if (videoLoading) {
            videoLoading.style.display = 'flex'; // Hiện loading khi bắt đầu
        }
        if (noVideoOverlay) {
            noVideoOverlay.style.display = 'none'; // Ẩn no-video overlay
        }

        // Xóa event listeners cũ nếu có
        const newVideo = videoPlayer.cloneNode(true);
        videoPlayer.parentNode.replaceChild(newVideo, videoPlayer);
        const freshVideo = newVideo;
        freshVideo.id = 'playbackVideo';

        // 1. LOADED METADATA - Khi video đã load xong metadata
        freshVideo.addEventListener('loadedmetadata', () => {
            console.log('✅ Video metadata loaded');
            console.log(`⏱️ Duration: ${freshVideo.duration}s`);

            // ẨN LOADING OVERLAY - QUAN TRỌNG!
            if (videoLoading) {
                videoLoading.style.display = 'none';
            }

            // Hiển thị video
            freshVideo.style.display = 'block';

            // Hiển thị thông tin video
            if (videoInfo) {
                videoInfo.innerHTML = `
                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-label">📅 Ngày tạo:</span>
                        <span class="info-value">${this.formatDate(session.start_time)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">⏱️ Thời lượng:</span>
                        <span class="info-value">${Math.round(freshVideo.duration)}s</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">👤 Số khuôn mặt:</span>
                        <span class="info-value">${session.total_faces || 0}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">💾 Nguồn:</span>
                        <span class="info-value">Cloudinary</span>
                    </div>
                </div>
            `;
                videoInfo.style.display = 'block';
            }

        }, { once: true });

        // 2. CAN PLAY - Khi video có thể phát được
        freshVideo.addEventListener('canplay', () => {
            console.log('▶️ Video ready to play');

            // Đảm bảo loading overlay đã ẩn
            if (videoLoading) {
                videoLoading.style.display = 'none';
            }

            // Thử phát tự động (muted để vượt qua autoplay policy)
            freshVideo.muted = true;
            freshVideo.play().catch(e => {
                console.log('ℹ️ Auto-play blocked, waiting for user interaction');
            });

        }, { once: true });

        // 3. ERROR - Xử lý lỗi
        freshVideo.addEventListener('error', (e) => {
            console.error('❌ Video error event:', e);
            console.error('Video error details:', freshVideo.error);

            // Ẩn loading, hiển thị lỗi
            if (videoLoading) {
                videoLoading.style.display = 'none';
            }

            if (noVideoOverlay) {
                noVideoOverlay.innerHTML = `
                <div class="empty-icon">❌</div>
                <h4>Lỗi video</h4>
                <p>Không thể tải video</p>
                <small>Mã lỗi: ${freshVideo.error?.code || 'unknown'}</small>
            `;
                noVideoOverlay.style.display = 'flex';
            }

        }, { once: true });

        // 4. PLAYING - Khi video bắt đầu phát
        freshVideo.addEventListener('playing', () => {
            console.log('🎬 Video playing');

            // Đảm bảo loading đã ẩn
            if (videoLoading) {
                videoLoading.style.display = 'none';
            }

        }, { once: true });

        // 5. WAITING/STALLED - Đang buffer
        freshVideo.addEventListener('waiting', () => {
            console.log('⏳ Video buffering...');
            if (videoLoading) {
                videoLoading.style.display = 'flex';
            }
        });

        freshVideo.addEventListener('stalled', () => {
            console.log('⏳ Video stalled...');
            if (videoLoading) {
                videoLoading.style.display = 'flex';
            }
        });

        // 6. LOAD START - Bắt đầu tải
        freshVideo.addEventListener('loadstart', () => {
            console.log('📥 Video loading started');
            if (videoLoading) {
                videoLoading.style.display = 'flex';
            }
        }, { once: true });

        return freshVideo;
    }

    async loadSessionImages(sessionId) {
        console.log(`📷 Loading images for session: ${sessionId}`);

        const container = document.getElementById('sessionCapturedImages');
        const countElement = document.getElementById('capturesCount');

        if (!container) return;

        // Hiển thị loading
        container.innerHTML = `
        <div class="loading-state">
            <div class="spinner-small"></div>
            <p>Đang tải hình ảnh...</p>
        </div>
    `;

        try {
            // Gọi API để lấy hình ảnh
            const response = await fetch(`/api/sessions/${sessionId}/images`, {
                headers: {
                    'Authorization': `Bearer ${window.authManager?.token || localStorage.getItem('authToken')}`
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to load images: ${response.status}`);
            }

            const images = await response.json();
            console.log(`📸 Loaded ${images.length} images`);

            // Cập nhật số lượng
            if (countElement) {
                countElement.textContent = `(${images.length} ảnh)`;
            }

            // Hiển thị hình ảnh
            this.displaySessionImages(container, images);

        } catch (error) {
            console.error('❌ Error loading images:', error);

            container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">❌</div>
                <p>Không thể tải hình ảnh</p>
                <small>${error.message || 'Lỗi kết nối'}</small>
            </div>
        `;

            if (countElement) {
                countElement.textContent = '(0 ảnh)';
            }
        }
    }

    displaySessionImages(container, images) {
        if (!images || images.length === 0) {
            container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📷</div>
                <p>Không có hình ảnh nào được chụp</p>
            </div>
        `;
            return;
        }

        // Tạo HTML cho từng hình ảnh
        const imagesHTML = images.map((image, index) => {
            const timestamp = image.timestamp || image.created_at;
            const date = timestamp ? new Date(timestamp).toLocaleTimeString('vi-VN') : '';

            return `
            <div class="captured-image-item" data-index="${index}">
                <img src="${image.url || image.thumbnail_url || '#'}" 
                     alt="Ảnh chụp ${index + 1}"
                     onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEyMCAxMjAiIGZpbGw9IiNmMGYwZjAiPjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIiByeD0iNiIvPjx0ZXh0IHg9IjYwIiB5PSI2MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOTk5Ij7Im4XhuqNwIDx0c3Bhbj4kKGlbmRleCsxKTwvdHNwYW4+PC90ZXh0Pjwvc3ZnPg=='">
                <div class="capture-time">${date}</div>
            </div>
        `;
        }).join('');

        container.innerHTML = imagesHTML;
    }

    displayVideoInfo(session, videoPlayer = null) {
        const videoInfo = document.getElementById('videoInfo');
        const captureFromVideoBtn = document.getElementById('captureFromVideo');

        if (!videoInfo) return;

        // Lấy thông tin từ session và video element
        const duration = videoPlayer ? Math.round(videoPlayer.duration) : session.duration;
        const fileSize = session.file_size || session.size;

        videoInfo.innerHTML = `
        <div class="info-grid">
            <div class="info-item">
                <span class="info-label">📅 Ngày tạo:</span>
                <span class="info-value" id="videoDate">${this.formatDate(session.created_at || session.timestamp)}</span>
            </div>
            <div class="info-item">
                <span class="info-label">⏱️ Thời lượng:</span>
                <span class="info-value" id="videoDuration">${duration ? duration + 's' : '--'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">👤 Số khuôn mặt:</span>
                <span class="info-value" id="videoFaces">${session.total_faces || session.face_count || 0}</span>
            </div>
            <div class="info-item">
                <span class="info-label">💾 Kích thước:</span>
                <span class="info-value" id="videoSize">${fileSize ? this.formatFileSize(fileSize) : '--'}</span>
            </div>
        </div>
    `;

        videoInfo.style.display = 'block';
        if (captureFromVideoBtn) captureFromVideoBtn.disabled = false;

        // Load hình ảnh đã chụp
        this.loadSessionImages(session.id || session.sessionId);
    }

    formatDate(dateString) {
        if (!dateString) return '--/--/----';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return dateString;
        }
    }

    formatFileSize(bytes) {
        if (!bytes) return '--';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    // Tạo element cho hình ảnh
    createCaptureElement(capture, index) {
        const div = document.createElement('div');
        div.className = 'captured-image-item';
        div.dataset.id = capture.id;
        div.dataset.sessionId = capture.sessionId;

        // Xác định loại
        const typeIcon = capture.source === 'video' ? '🎬' : '📱';
        const typeLabel = capture.source === 'video' ? 'Từ video' : 'Từ camera';

        // Thời gian
        const time = capture.metadata?.videoTime
            ? this.formatVideoTime(capture.metadata.videoTime)
            : capture.timeString;

        // Nội dung
        div.innerHTML = `
        <div class="image-wrapper">
            <img src="${capture.url}" alt="Capture ${index + 1}" 
                 onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjE1MCIgdmlld0JveD0iMCAwIDE1MCAxNTAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjE1MCIgaGVpZ2h0PSIxNTAiIGZpbGw9IiNGMEYwRjAiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjODA4MDgwIj5JbWFnZSBub3QgZm91bmQ8L3RleHQ+PC9zdmc+'"
                 loading="lazy" />
            <div class="image-overlay">
                <span class="image-type">${typeIcon} ${typeLabel}</span>
                <span class="image-time">${time}</span>
            </div>
            ${capture.metadata?.videoTime ?
                `<div class="video-time-badge">
                    ⏱️ ${this.formatVideoTime(capture.metadata.videoTime)}
                </div>` : ''}
        </div>
        <div class="image-actions">
            <button class="btn-view" onclick="window.open('${capture.url}', '_blank')">
                👁️ Xem
            </button>
            <button class="btn-download" onclick="this.downloadImage('${capture.url}', '${capture.filename}')">
                ⬇️ Tải
            </button>
        </div>
    `;

        return div;
    }

    // Phương thức download
    downloadImage(url, filename) {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Lưu session images vào localStorage
    saveSessionImagesToLocalStorage(sessionId, images) {
        try {
            // Chỉ lưu 20 ảnh gần nhất mỗi session
            const limitedImages = images.slice(0, 20);
            this.currentSessionImages.set(sessionId, limitedImages);

            // Lưu vào localStorage
            const sessionArray = Array.from(this.currentSessionImages.entries());
            localStorage.setItem('sessionImages', JSON.stringify(sessionArray));
        } catch (error) {
            console.error('❌ Error saving session images to localStorage:', error);
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;

        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';

        notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-message">${icon} ${message}</span>
            <button class="notification-close">&times;</button>
        </div>
    `;

        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);

        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
    }

    setupEventListeners() {
        console.log('🔗 Setting up event listeners...');

        // Kiểm tra đã gắn listeners chưa
        if (this.eventListenersAttached) {
            console.log('ℹ️ Event listeners already attached, skipping...');
            return;
        }

        const elements = {
            'startCamera': async () => {
                try {
                    await this.faceDetector.startCamera();
                } catch (error) {
                    console.error('❌ Error starting camera:', error);
                    alert('Lỗi khi bật camera: ' + error.message);
                }
            },
            'stopCamera': () => {
                this.faceDetector.stopCamera();
            },
            'startTracking': async () => {
                await this.startTracking();
            },
            'stopTracking': async () => {
                await this.stopTracking();
            },
            'captureImage': () => {
                this.handleCaptureClick();
            },

            'captureFromVideo': () => {
                this.captureFromVideoPlayer();
            },
            // Thêm voice control listeners
            'toggleVoice': () => {
                if (this.voiceControl) {
                    this.voiceControl.toggle();
                } else {
                    alert('Voice Control chưa được khởi tạo. Vui lòng refresh trang.');
                }
            },

            'helpVoice': () => {
                if (this.voiceControl) {
                    this.voiceControl.showHelp();
                } else {
                    this.showBasicHelp();
                }
            }
        };

        if (!document.getElementById('toggleVoice')) {
            console.warn('⚠️ Voice control buttons not found in DOM');
        }

        for (const [id, handler] of Object.entries(elements)) {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('click', handler);
                console.log(`✅ Event listener added for ${id}`);
            } else if (id.startsWith('debug') || id === 'refreshDisplay') {
                // Bỏ qua debug buttons nếu không có
                continue;
            } else if (!id.includes('Voice')) { // Không log warning cho voice buttons nếu chưa có HTML
                console.warn(`⚠️ Element not found: ${id}`);
            }
        }

        this.eventListenersAttached = true; // Đánh dấu đã gắn listeners
    }

    // Thêm vào class FaceDetectionApp
    handleCaptureClick() {
        // Kiểm tra biến cờ tránh chụp nhiều lần
        if (this.isCapturing) {
            console.log('⏳ Đang chụp ảnh, vui lòng đợi...');
            return;
        }

        console.log('📸 Capture button clicked - checking conditions...');

        // ĐIỀU KIỆN QUAN TRỌNG: Chỉ chụp khi đang theo dõi
        if (!this.faceDetector?.isTrackingActive) {
            this.showNotification('⏸️ Vui lòng bắt đầu theo dõi (Start Tracking) trước khi chụp hình', 'warning');
            return;
        }

        // Kiểm tra camera có bật không
        if (!this.faceDetector?.isCameraOn) {
            this.showNotification('📷 Vui lòng bật camera trước khi chụp hình', 'warning');
            return;
        }

        // Đặt cờ đang chụp
        this.isCapturing = true;

        // Gọi hàm chụp ảnh
        this.captureFromCamera().finally(() => {
            // Reset cờ sau khi chụp xong (dù thành công hay thất bại)
            this.isCapturing = false;
            console.log('✅ Capture process completed, ready for next capture');
        });
    }

    // Phương thức chụp từ camera live
    async captureFromCamera() {
        try {
            if (!this.faceDetector || !this.faceDetector.isCameraOn) {
                this.showNotification('📷 Vui lòng bật camera trước khi chụp hình', 'warning');
                return;
            }

            const canvas = document.getElementById('faceCanvas');
            if (!canvas) {
                throw new Error('Canvas not found');
            }

            console.log('📱 Capturing from camera...');

            // Kiểm tra canvas có dữ liệu không
            if (canvas.width === 0 || canvas.height === 0) {
                this.showNotification('📷 Camera chưa sẵn sàng', 'warning');
                return;
            }

            // Tạo canvas tạm để chụp
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            const tempCtx = tempCanvas.getContext('2d');

            // Vẽ nội dung từ canvas chính
            tempCtx.drawImage(canvas, 0, 0);

            // Kiểm tra canvas có dữ liệu không
            const imageData = tempCtx.getImageData(0, 0, 1, 1).data;
            if (imageData[3] === 0) {
                this.showNotification('📷 Không có hình ảnh để chụp', 'warning');
                return;
            }

            // Thêm timestamp và thông tin
            tempCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            tempCtx.fillRect(10, tempCanvas.height - 40, 300, 30);
            tempCtx.fillStyle = 'white';
            tempCtx.font = '14px Arial';

            const timeString = new Date().toLocaleTimeString('vi-VN');
            const faceCount = this.faceDetector?.currentFaceCount || 0;
            tempCtx.fillText(`📱 Camera | ⏰ ${timeString} | 👤 ${faceCount} faces`, 15, tempCanvas.height - 20);

            // Tạo blob từ canvas
            const blob = await new Promise((resolve) => {
                tempCanvas.toBlob((blobResult) => {
                    resolve(blobResult);
                }, 'image/jpeg', 0.9);
            });

            if (!blob) {
                throw new Error('Failed to create image blob');
            }

            // QUAN TRỌNG: Lấy sessionId hiện tại từ faceDetector
            const currentSessionId = this.faceDetector?.sessionId;
            console.log('🎯 Current session ID for capture:', currentSessionId);

            // Tạo metadata với sessionId
            const metadata = {
                sessionId: currentSessionId,
                faceCount: this.faceDetector?.currentFaceCount || 0,
                timestamp: Date.now()
            };

            // Lưu hình ảnh
            const imageDataResult = await this.saveCapturedImage(blob, 'camera');

            // Thêm vào UI
            this.addCapturedImageToUI(imageDataResult, 'live');

            // Hiển thị thông báo
            this.showNotification('📸 Đã chụp hình từ camera!', 'success');

            console.log('✅ Camera capture successful');

        } catch (error) {
            console.error('❌ Error capturing image:', error);
            this.showNotification('❌ Lỗi khi chụp hình: ' + error.message, 'error');
            throw error;
        }
    }

    // Phương thức chụp từ video player
    async captureFromVideoPlayer() {
        try {
            const videoPlayer = document.getElementById('playbackVideo');

            // Kiểm tra kỹ hơn
            if (!videoPlayer) {
                this.showNotification('📹 Không tìm thấy trình phát video', 'warning');
                return;
            }

            const isVideoVisible = window.getComputedStyle(videoPlayer).display !== 'none';
            if (!isVideoVisible) {
                this.showNotification('📹 Vui lòng chọn và phát video trước', 'warning');
                return;
            }

            if (videoPlayer.paused || videoPlayer.ended) {
                this.showNotification('⏸️ Video đang dừng. Vui lòng phát video để chụp', 'warning');
                return;
            }

            // Kiểm tra video có kích thước hợp lệ không
            if (videoPlayer.videoWidth === 0 || videoPlayer.videoHeight === 0) {
                this.showNotification('📹 Video chưa sẵn sàng, vui lòng đợi...', 'warning');
                return;
            }

            console.log('🎬 Capturing from video...');
            console.log('Video dimensions:', videoPlayer.videoWidth, 'x', videoPlayer.videoHeight);

            // Tạo canvas để chụp frame từ video
            const canvas = document.createElement('canvas');
            canvas.width = videoPlayer.videoWidth;
            canvas.height = videoPlayer.videoHeight;
            const ctx = canvas.getContext('2d');

            // Vẽ frame hiện tại của video
            ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);

            // Kiểm tra canvas có dữ liệu không
            const imageData = ctx.getImageData(0, 0, 1, 1).data;
            if (imageData[3] === 0) {
                this.showNotification('📹 Không thể chụp frame từ video', 'warning');
                return;
            }

            // Thêm timestamp và thông tin
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(10, canvas.height - 60, 350, 50);
            ctx.fillStyle = 'white';
            ctx.font = '14px Arial';

            const currentTime = this.formatVideoTime(videoPlayer.currentTime);
            const duration = this.formatVideoTime(videoPlayer.duration);
            const progress = ((videoPlayer.currentTime / videoPlayer.duration) * 100).toFixed(1);

            ctx.fillText(`🎬 Video | ⏱️ ${currentTime} / ${duration} (${progress}%)`, 15, canvas.height - 40);
            ctx.fillText(`📅 ${this.currentSessionId || 'Session'}`, 15, canvas.height - 20);

            // Tạo blob từ canvas
            const blob = await new Promise((resolve) => {
                canvas.toBlob((blobResult) => {
                    resolve(blobResult);
                }, 'image/jpeg', 0.9);
            });

            if (!blob) {
                throw new Error('Failed to create image blob from video');
            }

            // Lưu hình ảnh với metadata
            const metadata = {
                videoTime: videoPlayer.currentTime,
                videoDuration: videoPlayer.duration,
                sessionId: this.currentSessionId,
                progress: progress
            };

            const imageDataResult = await this.saveCapturedImage(blob, 'video', metadata);

            // Thêm vào UI
            this.addCapturedImageToUI(imageDataResult, 'session');

            // Hiển thị thông báo
            this.showNotification('📸 Đã chụp hình từ video!', 'success');

            console.log('✅ Video capture successful');

        } catch (error) {
            console.error('❌ Error capturing from video:', error);
            this.showNotification('❌ Lỗi khi chụp từ video: ' + error.message, 'error');
        }
    }

    // Thêm phương thức để xác định đang ở chế độ nào
    getCurrentMode() {
        const videoPlayer = document.getElementById('playbackVideo');
        const cameraCanvas = document.getElementById('faceCanvas');

        // Kiểm tra video có đang hiển thị không
        if (videoPlayer && window.getComputedStyle(videoPlayer).display !== 'none') {
            return 'video';
        }

        // Kiểm tra camera có đang hoạt động không
        if (cameraCanvas && this.faceDetector?.isCameraOn) {
            return 'camera';
        }

        return 'none';
    }

    // Phương thức format thời gian video
    formatVideoTime(seconds) {
        if (!seconds || isNaN(seconds)) return '00:00';

        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    initCaptureEvents() {
        const captureButton = document.getElementById('captureImage');
        if (captureButton) {
            // Xóa event listener cũ nếu có
            captureButton.removeEventListener('click', this.handleCaptureClick);

            // Thêm event listener mới
            this.handleCaptureClick = this.handleCaptureClick.bind(this);
            captureButton.addEventListener('click', this.handleCaptureClick);

            console.log('✅ Capture button event initialized');
        }
    }

    // Phương thức xử lý click nút chụp
    handleCaptureClick() {
        console.log('📸 Capture button clicked');

        // Kiểm tra đang ở chế độ nào
        const videoPlayer = document.getElementById('playbackVideo');
        const isVideoMode = videoPlayer && videoPlayer.style.display !== 'none';

        console.log('Video mode:', isVideoMode);
        console.log('Video playing:', videoPlayer?.paused === false);

        if (isVideoMode) {
            // Đang xem video
            this.captureFromVideoPlayer();
        } else {
            // Đang xem camera live
            this.captureFromCamera();
        }
    }

    async saveCapturedImage(blob, source = 'camera', metadata = {}) {
        try {
            const timestamp = new Date().getTime();
            const filename = `capture_${timestamp}.jpg`;

            console.log(`📤 Uploading captured image to Cloudinary: ${filename}`);

            // Tạo FormData
            const formData = new FormData();
            formData.append('image', blob, filename);
            formData.append('source', source);
            formData.append('timestamp', timestamp.toString());
            formData.append('sessionId', this.currentSessionId || 'live');

            // Thêm metadata
            if (metadata.videoTime) {
                formData.append('videoTime', metadata.videoTime.toString());
            }
            if (metadata.videoDuration) {
                formData.append('videoDuration', metadata.videoDuration.toString());
            }
            if (this.faceDetector?.totalFacesCount) {
                formData.append('faceCount', this.faceDetector.totalFacesCount.toString());
            }

            // Gửi đến API captures/upload
            const response = await fetch('/api/captures/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Upload failed:', errorText);
                throw new Error('Upload failed: ' + errorText);
            }

            const result = await response.json();
            console.log('✅ Image uploaded:', result);

            // Tạo imageData từ result
            const imageData = {
                id: result.id || `capture_${timestamp}`,
                url: result.url,
                public_id: result.public_id,
                filename: result.filename || filename,
                timestamp: timestamp,
                source: source,
                sessionId: this.currentSessionId || 'live',
                created_at: result.created_at || new Date().toISOString(),
                timeString: new Date(timestamp).toLocaleTimeString('vi-VN'),
                metadata: metadata
            };

            // Lưu vào current session images
            if (this.currentSessionId && this.currentSessionId !== 'live') {
                if (!this.currentSessionImages.has(this.currentSessionId)) {
                    this.currentSessionImages.set(this.currentSessionId, []);
                }
                const sessionImages = this.currentSessionImages.get(this.currentSessionId);
                sessionImages.unshift(imageData);

                if (sessionImages.length > 50) {
                    sessionImages.pop();
                }

                console.log(`💾 Added to session ${this.currentSessionId}, total: ${sessionImages.length} images`);
            }

            return imageData;

        } catch (error) {
            console.error('❌ Error uploading image:', error);

            // Fallback: tạo local blob URL
            const tempUrl = URL.createObjectURL(blob);
            const timestamp = new Date().getTime();

            const imageData = {
                id: `local_${timestamp}`,
                url: tempUrl,
                filename: `capture_${timestamp}.jpg`,
                timestamp: timestamp,
                source: source,
                sessionId: this.currentSessionId || 'live',
                created_at: new Date().toISOString(),
                timeString: new Date(timestamp).toLocaleTimeString('vi-VN'),
                metadata: metadata,
                isLocal: true
            };

            // Track blob URL
            this.blobUrls.add(tempUrl);

            return imageData;
        }
    }

    // Phương thức cleanup blob URLs
    cleanupBlobUrls() {
        console.log('🧹 Cleaning up blob URLs...');
        let cleanedCount = 0;

        this.blobUrls.forEach(url => {
            try {
                URL.revokeObjectURL(url);
                cleanedCount++;
            } catch (e) {
                console.warn('⚠️ Failed to revoke blob URL:', e);
            }
        });

        this.blobUrls.clear();
        console.log(`✅ Cleaned up ${cleanedCount} blob URLs`);
    }

    // Phương thức thêm blob URL vào tracking
    addBlobUrl(url) {
        if (url && url.startsWith('blob:')) {
            this.blobUrls.add(url);
        }
        return url;
    }

    // Phương thức xóa blob URL cụ thể
    removeBlobUrl(url) {
        if (this.blobUrls.has(url)) {
            try {
                URL.revokeObjectURL(url);
                this.blobUrls.delete(url);
                console.log('🗑️ Removed blob URL:', url.substring(0, 50) + '...');
            } catch (e) {
                console.warn('⚠️ Failed to remove blob URL:', e);
            }
        }
    }

    // Lưu hình ảnh vào database
    async saveCaptureToDatabase(captureData) {
        try {
            console.log(`💾 Saving capture to database: ${captureData.id}`);

            const response = await fetch('/api/captures/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: captureData.id,
                    url: captureData.url,
                    filename: captureData.filename,
                    timestamp: captureData.timestamp,
                    source: captureData.source,
                    sessionId: captureData.sessionId,
                    created_at: captureData.created_at,
                    metadata: captureData.metadata,
                    isLocal: captureData.isLocal || false
                })
            });

            if (!response.ok) {
                throw new Error(`Database save failed: ${response.status}`);
            }

            const result = await response.json();
            console.log('✅ Capture saved to database:', result);
            return result;

        } catch (error) {
            console.error('❌ Error saving capture to database:', error);
            throw error;
        }
    }

    // Đảm bảo URL sử dụng HTTPS
    ensureHttpsUrl(url) {
        if (!url) return url;

        // Nếu là data URL hoặc đã là HTTPS thì giữ nguyên
        if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('https://')) {
            return url;
        }

        // Chuyển HTTP thành HTTPS
        if (url.startsWith('http://')) {
            return url.replace('http://', 'https://');
        }

        // Thêm HTTPS nếu không có protocol
        if (!url.startsWith('http')) {
            return `https://${url}`;
        }

        return url;
    }

    // Lưu vào localStorage
    saveToLocalStorage(imageData) {
        try {
            // Thêm vào mảng capturedImages
            this.capturedImages.unshift(imageData); // Thêm vào đầu mảng

            // Giới hạn số lượng ảnh lưu trữ
            if (this.capturedImages.length > 50) {
                this.capturedImages = this.capturedImages.slice(0, 50);
            }

            // Lưu theo session
            if (imageData.sessionId && imageData.sessionId !== 'live') {
                if (!this.currentSessionImages.has(imageData.sessionId)) {
                    this.currentSessionImages.set(imageData.sessionId, []);
                }
                const sessionImages = this.currentSessionImages.get(imageData.sessionId);
                sessionImages.unshift(imageData);

                // Giới hạn 20 ảnh mỗi session
                if (sessionImages.length > 20) {
                    sessionImages.pop();
                }
            }

            // Lưu vào localStorage
            localStorage.setItem('capturedImages', JSON.stringify(this.capturedImages));
            localStorage.setItem('sessionImages', JSON.stringify(Array.from(this.currentSessionImages.entries())));

        } catch (error) {
            console.error('❌ Error saving to localStorage:', error);
        }
    }

    // Tải từ localStorage
    loadFromLocalStorage() {
        try {
            const savedImages = localStorage.getItem('capturedImages');
            if (savedImages) {
                this.capturedImages = JSON.parse(savedImages);
            }

            const savedSessionImages = localStorage.getItem('sessionImages');
            if (savedSessionImages) {
                this.currentSessionImages = new Map(JSON.parse(savedSessionImages));
            }
        } catch (error) {
            console.error('❌ Error loading from localStorage:', error);
        }
    }

    // Thêm hình ảnh vào UI
    addCapturedImageToUI(imageData, target = 'live') {
        const imageElement = this.createImageElement(imageData);

        if (target === 'live') {
            const container = document.getElementById('liveCapturedImages');
            if (container) {
                // Thêm vào đầu danh sách
                container.insertBefore(imageElement, container.firstChild);

                // Giới hạn hiển thị 6 ảnh gần nhất
                const maxDisplay = 6;
                while (container.children.length > maxDisplay) {
                    container.removeChild(container.lastChild);
                }

                // Thêm hiệu ứng
                imageElement.classList.add('new-capture');
                setTimeout(() => {
                    imageElement.classList.remove('new-capture');
                }, 1000);
            }
        } else if (target === 'session' && this.currentSessionId) {
            this.loadSessionCapturedImages(this.currentSessionId);
        }
    }

    // Tạo element hình ảnh
    createImageElement(imageData) {
        const div = document.createElement('div');
        div.className = imageData.source === 'camera' ? 'captured-image-item' : 'captured-image-grid-item';

        const timeText = imageData.source === 'video' && imageData.metadata?.videoTime
            ? `${imageData.timeString} (⏱️ ${this.formatVideoTime(imageData.metadata.videoTime)})`
            : imageData.timeString;

        div.innerHTML = `
            <img src="${imageData.url}" alt="Captured image" loading="lazy">
            <div class="${imageData.source === 'camera' ? 'captured-image-info' : 'captured-image-grid-info'}">
                <div class="${imageData.source === 'camera' ? 'captured-image-time' : 'time'}">
                    ${timeText}
                </div>
                ${imageData.source === 'video'
                ? `<div class="source">Từ video</div>`
                : `<div class="captured-image-size">${imageData.source === 'camera' ? 'Chụp trực tiếp' : ''}</div>`
            }
            </div>
        `;

        // Thêm sự kiện click để xem ảnh lớn
        div.addEventListener('click', () => {
            this.showImageModal(imageData);
        });

        return div;
    }

    // Load ảnh của session
    loadSessionCapturedImages(sessionId) {
        const container = document.getElementById('sessionCapturedImages');
        if (!container) return;

        const sessionImages = this.currentSessionImages.get(sessionId) || [];

        if (sessionImages.length === 0) {
            container.innerHTML = `
                <div class="empty-captured-images">
                    <div class="icon">📷</div>
                    <h4>Chưa có hình ảnh nào</h4>
                    <p>Nhấn nút "Chụp từ video" để chụp hình từ video này</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        sessionImages.forEach(imageData => {
            const imageElement = this.createImageElement(imageData);
            container.appendChild(imageElement);
        });
    }

    // Modal xem ảnh lớn
    showImageModal(imageData) {
        const modal = document.createElement('div');
        modal.className = 'image-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.9);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 90%; max-height: 90%; position: relative;">
                <button class="close-modal" style="
                    position: absolute;
                    top: 15px;
                    right: 15px;
                    background: #ff4757;
                    color: white;
                    border: none;
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    font-size: 20px;
                    cursor: pointer;
                    z-index: 1001;
                ">×</button>
                <img src="${imageData.url}" alt="Full size" style="
                    max-width: 100%;
                    max-height: 80vh;
                    border-radius: 5px;
                ">
                <div style="color: white; text-align: center; margin-top: 15px;">
                    <div>📅 ${new Date(imageData.timestamp).toLocaleString('vi-VN')}</div>
                    <div>${imageData.source === 'camera' ? '📸 Chụp trực tiếp' : '🎬 Chụp từ video'}</div>
                    ${imageData.metadata?.videoTime
                ? `<div>⏱️ Thời gian video: ${this.formatVideoTime(imageData.metadata.videoTime)}</div>`
                : ''
            }
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Sự kiện đóng modal
        modal.querySelector('.close-modal').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    // Format thời gian video
    formatVideoTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // THÊM PHƯƠNG THỨC KIỂM TRA CALLBACKS
    testCallbacks() {
        console.log('🧪 Testing callbacks...');

        // Test direct update
        if (this.faceDetector.onFaceCountUpdate) {
            const testCount = 5;
            this.faceDetector.onFaceCountUpdate(testCount);
            console.log(`✅ Called onFaceCountUpdate with ${testCount}`);
        }

        if (this.faceDetector.onTotalFacesUpdate) {
            const testTotal = 25;
            this.faceDetector.onTotalFacesUpdate(testTotal);
            console.log(`✅ Called onTotalFacesUpdate with ${testTotal}`);
        }

        if (this.faceDetector.onTrackingTimeUpdate) {
            const testTime = 120;
            this.faceDetector.onTrackingTimeUpdate(testTime);
            console.log(`✅ Called onTrackingTimeUpdate with ${testTime}s`);
        }
    }

    async startTracking() {
        try {
            console.log('🎬 Starting tracking...');

            // Reset UI
            document.getElementById('currentFaces').textContent = '0';
            document.getElementById('totalFaces').textContent = '0';
            document.getElementById('trackingTime').textContent = '0:00';

            // Show recording status
            const recordingStatus = document.getElementById('recordingStatus');
            if (recordingStatus) {
                recordingStatus.style.display = 'flex';
            }

            // Start face detector tracking
            this.faceDetector.startTracking();
            console.log('✅ Face detector tracking started');

            // Start video recording
            if (this.faceDetector.video) {
                await this.videoManager.startRecording(this.faceDetector.video);
                console.log('✅ Video recording started');
            }

            // Update buttons
            this.updateTrackingButtons(true);

        } catch (error) {
            console.error('❌ Error starting tracking:', error);
            this.showNotification('❌ Lỗi khi bắt đầu thống kê', 'error');
        }
    }

    async stopTracking() {
        try {
            console.log('⏸️ Stopping tracking in app...');

            // 1. Dừng tracking và LẤY sessionInfo
            const sessionInfo = this.faceDetector.stopTracking();
            console.log('📦 Session info from faceDetector:', sessionInfo);

            // 2. Dừng recording video - sessionId đã được truyền trong videoManager
            const videoData = await this.videoManager.stopRecording();
            console.log('✅ Video recording stopped. Data:', videoData);

            // 3. Gộp dữ liệu từ sessionInfo và videoData
            const mergedData = {
                ...sessionInfo,
                ...videoData,
                // Ưu tiên sessionId từ faceDetector nếu videoData không có
                sessionId: sessionInfo.sessionId || videoData?.sessionId
            };

            console.log('🔗 Merged data for saving:', mergedData);

            // 4. Lưu session data với thông tin đầy đủ
            await this.saveSessionData(mergedData);

            this.showNotification('✅ Đã dừng thống kê và lưu session!', 'success');

        } catch (error) {
            console.error('❌ Error stopping tracking/recording:', error);
            this.showNotification('❌ Lỗi khi dừng thống kê', 'error');
        }
    }

    // Thêm phương thức helper
    updateTrackingButtons(isTracking) {
        const startBtn = document.getElementById('startTracking');
        const stopBtn = document.getElementById('stopTracking');
        const startCameraBtn = document.getElementById('startCamera');
        const stopCameraBtn = document.getElementById('stopCamera');

        if (startBtn) startBtn.disabled = isTracking;
        if (stopBtn) stopBtn.disabled = !isTracking;
        if (startCameraBtn) startCameraBtn.disabled = isTracking;
        if (stopCameraBtn) stopCameraBtn.disabled = isTracking;
    }

    setupFaceDetectorCallbacks() {
        console.log('🔗 Setting up face detector callbacks...');

        // Thiết lập callback trực tiếp cho faceDetector
        if (this.faceDetector) {
            this.faceDetector.onFaceCountUpdate = (count) => {
                console.log(`📊 onFaceCountUpdate called: ${count}`);
                const element = document.getElementById('currentFaces');
                if (element) {
                    element.textContent = count;
                    // Thêm hiệu ứng visual
                    element.classList.add('updated');
                    setTimeout(() => element.classList.remove('updated'), 300);
                }
            };

            this.faceDetector.onTotalFacesUpdate = (total) => {
                console.log(`📊 onTotalFacesUpdate called: ${total}`);
                const element = document.getElementById('totalFaces');
                if (element) {
                    element.textContent = total;
                    // Thêm hiệu ứng visual
                    element.classList.add('updated');
                    setTimeout(() => element.classList.remove('updated'), 300);
                }
            };

            this.faceDetector.onTrackingTimeUpdate = (seconds) => {
                console.log(`⏱️ onTrackingTimeUpdate called: ${seconds}s`);
                const element = document.getElementById('trackingTime');
                if (element) {
                    const minutes = Math.floor(seconds / 60);
                    const remainingSeconds = seconds % 60;
                    element.textContent = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
                }
            };

            console.log('✅ Face detector callbacks setup complete');
        }
    }

    setupTabSwitching() {
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
    }

    switchTab(tabName) {
        const tabContents = document.querySelectorAll('.tab-content');
        tabContents.forEach(tab => tab.classList.remove('active'));

        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => button.classList.remove('active'));

        const selectedTab = document.getElementById(`${tabName}-tab`);
        const selectedButton = document.querySelector(`[data-tab="${tabName}"]`);

        if (selectedTab) selectedTab.classList.add('active');
        if (selectedButton) selectedButton.classList.add('active');

        if (tabName === 'history') {
            this.loadVideoHistory();
        }
    }

    async loadVideoHistory() {
        try {
            const videoList = document.getElementById('videoList');

            // Hiển thị loading state
            videoList.innerHTML = `
            <div class="video-list-loading">
                <div class="loading-spinner"></div>
                <div class="loading-text">Đang tải danh sách session...</div>
            </div>
        `;

            const response = await fetch('/api/sessions');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const sessions = await response.json();

            if (Array.isArray(sessions) && sessions.length > 0) {
                // Sắp xếp theo thời gian mới nhất trước
                sessions.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

                // GIỚI HẠN: Chỉ hiển thị 8 session gần nhất
                const displaySessions = sessions.slice(0, 8);

                videoList.innerHTML = '';

                // Thêm tiêu đề
                const listHeader = document.createElement('div');
                listHeader.className = 'video-list-header';
                listHeader.innerHTML = `
                <h3>📁 Danh sách session (${sessions.length})</h3>
                <div class="session-count">Hiển thị ${displaySessions.length} session gần nhất</div>
            `;
                videoList.appendChild(listHeader);

                // Thêm session items
                displaySessions.forEach(session => {
                    const videoItem = this.createVideoItem(session);
                    videoList.appendChild(videoItem);
                });

                // Nếu có nhiều hơn 8 session, thêm nút "Xem thêm"
                if (sessions.length > 8) {
                    const viewMoreBtn = document.createElement('button');
                    viewMoreBtn.className = 'view-more-btn';
                    viewMoreBtn.textContent = `📋 Xem thêm ${sessions.length - 8} session cũ hơn`;
                    viewMoreBtn.addEventListener('click', () => {
                        this.showAllSessions(sessions);
                    });
                    videoList.appendChild(viewMoreBtn);
                }

            } else {
                videoList.innerHTML = `
                <div class="empty-video-list">
                    <div class="empty-icon">📁</div>
                    <h3>Chưa có session nào</h3>
                    <p>Bắt đầu theo dõi khuôn mặt để tạo session đầu tiên!</p>
                    <button class="empty-action-btn" onclick="app.switchTab('live')">
                        🎥 Chuyển đến Live View
                    </button>
                </div>
            `;
            }
        } catch (error) {
            console.error('Error loading video history:', error);
            const videoList = document.getElementById('videoList');
            videoList.innerHTML = `
            <div class="video-list-error">
                <div class="error-icon">❌</div>
                <h3>Lỗi tải danh sách</h3>
                <p>Không thể tải danh sách session: ${error.message}</p>
                <button class="retry-btn" onclick="app.loadVideoHistory()">
                    🔄 Thử lại
                </button>
            </div>
        `;
        }
    }

    // Phương thức để hiển thị tất cả session (khi nhấn "Xem thêm")
    showAllSessions(allSessions) {
        const videoList = document.getElementById('videoList');

        videoList.innerHTML = '';

        // Tiêu đề với nút quay lại
        const header = document.createElement('div');
        header.className = 'all-sessions-header';
        header.innerHTML = `
        <div class="header-top">
            <button class="back-btn" onclick="app.loadVideoHistory()">
                ← Quay lại
            </button>
            <h3>📁 Tất cả session (${allSessions.length})</h3>
        </div>
        <div class="session-count">Đang hiển thị tất cả session</div>
    `;
        videoList.appendChild(header);

        // Hiển thị tất cả session
        allSessions.forEach(session => {
            const videoItem = this.createVideoItem(session);
            videoList.appendChild(videoItem);
        });

        // Nút quay lại ở cuối
        const footer = document.createElement('div');
        footer.className = 'all-sessions-footer';
        footer.innerHTML = `
        <button class="back-btn bottom" onclick="app.loadVideoHistory()">
            ↑ Quay lại danh sách rút gọn
        </button>
    `;
        videoList.appendChild(footer);
    }

    createVideoItem(session) {
        const div = document.createElement('div');
        div.className = 'video-item';

        const hasVideo = session.video_filename && session.video_filename !== 'null';
        const duration = this.formatDuration(session.duration || 0);
        const startDate = new Date(session.start_time);
        const endDate = new Date(session.end_time);
        const sessionDate = startDate.toLocaleDateString('vi-VN');
        const startTime = startDate.toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const endTime = endDate.toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit'
        });

        div.innerHTML = `
        <div class="video-card">
            <div class="video-card-header">
                <div class="video-card-title">
                    <span class="video-icon ${hasVideo ? 'has-video' : 'no-video'}">
                        ${hasVideo ? '📹' : '📋'}
                    </span>
                    <span class="session-id">${session.id ? session.id.substring(0, 8) + '...' : 'N/A'}</span>
                </div>
                <button class="video-card-delete" data-session-id="${session.id}" title="Xóa session">
                    🗑️
                </button>
            </div>
            
            <div class="video-card-date">
                <span class="date-icon">📅</span>
                <span class="date-text">${sessionDate}</span>
            </div>
            
            <div class="video-card-stats">
                <div class="stat-row">
                    <div class="stat-item">
                        <span class="stat-label">BẮT ĐẦU</span>
                        <span class="stat-value">${startTime}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">KẾT THÚC</span>
                        <span class="stat-value">${endTime}</span>
                    </div>
                </div>
                <div class="stat-row">
                    <div class="stat-item">
                        <span class="stat-label">THỜI GIAN</span>
                        <span class="stat-value">${duration}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">KHUÔN MẶT</span>
                        <span class="stat-value">${session.total_faces || 0}</span>
                    </div>
                </div>
            </div>
            
            ${!hasVideo ?
                '<div class="no-video-badge">Không có video</div>' :
                ''
            }
        </div>
    `;

        div.addEventListener('click', (event) => {
            if (!event.target.closest('.video-card-delete')) {
                this.playVideo(session, event);
            }
        });

        const deleteBtn = div.querySelector('.video-card-delete');
        deleteBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            this.showDeleteModal(session);
        });

        return div;
    }

    showDeleteModal(session) {
        this.currentDeleteSession = session;
        this.deleteSessionInfo.innerHTML = `
        <div><strong>Session ID:</strong> <span>${session.id ? session.id.substring(0, 12) + '...' : 'N/A'}</span></div>
        <div><strong>Thời gian bắt đầu:</strong> <span>${new Date(session.start_time).toLocaleString('vi-VN')}</span></div>
        <div><strong>Thời gian kết thúc:</strong> <span>${new Date(session.end_time).toLocaleString('vi-VN')}</span></div>
        <div><strong>Tổng khuôn mặt:</strong> <span>${session.total_faces || 0}</span></div>
        <div><strong>Thời lượng:</strong> <span>${this.formatDuration(session.duration || 0)}</span></div>
        <div><strong>Video:</strong> <span>${session.video_filename && session.video_filename !== 'null' ? '✅ Có' : '❌ Không có'}</span></div>
    `;

        this.deleteModal.style.display = 'block';
    }

    cleanupVideoPlayer() {
        console.log('🧹 Cleaning up video player...');

        const videoPlayer = document.getElementById('playbackVideo');
        const videoLoading = document.getElementById('videoLoading');
        const noVideoOverlay = document.getElementById('noVideoOverlay');

        if (videoPlayer) {
            // KHÔNG reset src nếu đang có video đang phát
            // Chỉ pause nếu đang phát
            if (!videoPlayer.paused) {
                videoPlayer.pause();
            }

            // Reset currentTime về 0
            videoPlayer.currentTime = 0;

            // KHÔNG gọi videoPlayer.load() ở đây
        }

        // Reset overlay trạng thái
        if (videoLoading) videoLoading.style.display = 'none';
        if (noVideoOverlay) noVideoOverlay.style.display = 'none';

        console.log('✅ Video player cleaned up');
    }

    async playVideo(session, event) {
        try {
            console.log('🎬 Playing video for session:', session);

            // Lấy các DOM elements
            const videoPlayer = document.getElementById('playbackVideo');
            const videoWrapper = videoPlayer?.parentElement;
            const videoLoading = document.getElementById('videoLoading');
            const noVideoOverlay = document.getElementById('noVideoOverlay');
            const videoInfo = document.getElementById('videoInfo');
            const captureFromVideoBtn = document.getElementById('captureFromVideo');

            // Kiểm tra DOM elements
            if (!videoPlayer || !videoWrapper) {
                console.error('❌ Missing video DOM elements');
                return;
            }

            console.log('✅ All DOM elements found');

            // Highlight selected session
            document.querySelectorAll('.video-item').forEach(item => {
                item.classList.remove('active');
            });
            if (event && event.currentTarget) {
                event.currentTarget.classList.add('active');
            }

            // Cập nhật currentSessionId
            this.currentSessionId = session.id;

            // Reset trạng thái
            if (noVideoOverlay) noVideoOverlay.style.display = 'none';
            if (videoLoading) videoLoading.style.display = 'flex'; // Hiện loading
            if (videoInfo) videoInfo.style.display = 'none';
            if (captureFromVideoBtn) captureFromVideoBtn.disabled = true;

            // Dừng video hiện tại nếu đang phát
            if (!videoPlayer.paused) {
                videoPlayer.pause();
            }
            videoPlayer.currentTime = 0;

            // Kiểm tra video URL
            const videoUrl = session.video_filename;
            if (!videoUrl || videoUrl === 'null') {
                console.log('📭 No video for this session');

                // Ẩn loading, hiện no-video
                if (videoLoading) videoLoading.style.display = 'none';
                if (noVideoOverlay) {
                    noVideoOverlay.innerHTML = `
                    <div class="empty-icon">📹</div>
                    <h4>Không có video</h4>
                    <p>Session này không có file video.</p>
                `;
                    noVideoOverlay.style.display = 'flex';
                }

                // Ẩn video player
                videoPlayer.style.display = 'none';

                // Hiển thị thông tin session
                if (videoInfo) {
                    videoInfo.innerHTML = this.createNoVideoHTML(session);
                    videoInfo.style.display = 'block';
                }

                // Load hình ảnh của session
                await this.loadCapturesForSession(session.id);
                return;
            }

            console.log('🎯 Video URL found:', videoUrl);

            // Đặt video source với cache busting
            const timestamp = Date.now();
            const separator = videoUrl.includes('?') ? '&' : '?';
            const finalUrl = `${videoUrl}${separator}_t=${timestamp}`;

            console.log('🔗 Final video URL:', finalUrl);

            // Tạo video element mới để reset event listeners
            const newVideo = document.createElement('video');
            newVideo.id = 'playbackVideo';
            newVideo.controls = true;
            newVideo.playsInline = true;
            newVideo.preload = 'auto';
            newVideo.crossOrigin = 'anonymous';
            newVideo.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: contain;
            background: #000;
            display: none;
            position: relative;
            z-index: 2;
        `;

            // Thay thế video cũ
            videoPlayer.parentNode.replaceChild(newVideo, videoPlayer);
            const freshVideo = newVideo;

            // Setup event handlers đơn giản
            this.setupSimpleVideoHandlers(freshVideo, session, videoLoading, noVideoOverlay, videoInfo, captureFromVideoBtn);

            // Đặt src và load
            freshVideo.src = finalUrl;
            freshVideo.load();

            console.log('✅ Video src set and load() called');

            // Load hình ảnh của session
            await this.loadCapturesForSession(session.id);

            console.log('✅ Video setup complete');

        } catch (error) {
            console.error('❌ Error in playVideo:', error);
            this.showVideoError(error.message || 'Lỗi tải video');
        }
    }

    setupSimpleVideoHandlers(videoPlayer, session, videoLoading, noVideoOverlay, videoInfo, captureFromVideoBtn) {
        console.log('🎧 Setting up simple video handlers...');

        // LOADED METADATA
        videoPlayer.addEventListener('loadedmetadata', () => {
            console.log('✅ Video metadata loaded');
            console.log(`⏱️ Duration: ${videoPlayer.duration}s`);

            // Ẩn loading overlay
            if (videoLoading) videoLoading.style.display = 'none';

            // Hiển thị video
            videoPlayer.style.display = 'block';

            // Hiển thị thông tin
            if (videoInfo) {
                const duration = Math.round(videoPlayer.duration);
                const date = new Date(session.start_time).toLocaleDateString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                videoInfo.innerHTML = `
                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-label">📅 Thời gian:</span>
                        <span class="info-value">${date}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">⏱️ Thời lượng:</span>
                        <span class="info-value">${duration}s</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">👤 Khuôn mặt:</span>
                        <span class="info-value">${session.total_faces || 0}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">💾 Nguồn:</span>
                        <span class="info-value">Cloudinary</span>
                    </div>
                </div>
            `;
                videoInfo.style.display = 'block';
            }

            // Enable capture button
            if (captureFromVideoBtn) {
                captureFromVideoBtn.disabled = false;
            }

            // Auto-play với âm lượng 0
            videoPlayer.muted = true;
            videoPlayer.play().catch(e => {
                console.log('ℹ️ Auto-play prevented');
            });

        }, { once: true });

        // CAN PLAY
        videoPlayer.addEventListener('canplay', () => {
            console.log('▶️ Video ready to play');

            // Đảm bảo loading đã ẩn
            if (videoLoading) videoLoading.style.display = 'none';

        }, { once: true });

        // ERROR
        videoPlayer.addEventListener('error', (e) => {
            console.error('❌ Video error:', videoPlayer.error);

            // Ẩn loading
            if (videoLoading) videoLoading.style.display = 'none';

            // Hiển thị lỗi
            if (noVideoOverlay) {
                let errorMsg = 'Lỗi tải video';
                if (videoPlayer.error) {
                    switch (videoPlayer.error.code) {
                        case 1: errorMsg = 'Video loading aborted'; break;
                        case 2: errorMsg = 'Network error'; break;
                        case 3: errorMsg = 'Video decode error'; break;
                        case 4: errorMsg = 'Video format not supported'; break;
                    }
                }

                noVideoOverlay.innerHTML = `
                <div class="empty-icon">❌</div>
                <h4>${errorMsg}</h4>
                <p>Không thể phát video từ Cloudinary</p>
            `;
                noVideoOverlay.style.display = 'flex';
            }

            // Ẩn video
            videoPlayer.style.display = 'none';

        }, { once: true });

        // PLAYING
        videoPlayer.addEventListener('playing', () => {
            console.log('🎬 Video playing');

            // Đảm bảo loading đã ẩn
            if (videoLoading) videoLoading.style.display = 'none';

        }, { once: true });

        // LOAD START
        videoPlayer.addEventListener('loadstart', () => {
            console.log('📥 Video loading started');

            // Hiện loading
            if (videoLoading) videoLoading.style.display = 'flex';

        }, { once: true });
    }

    createLoadingOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'video-loading-overlay';
        overlay.innerHTML = `
        <div class="spinner"></div>
        <p>Đang tải video...</p>
    `;
        return overlay;
    }

    setupVideoEventListeners(videoPlayer, session, videoInfo, loadingOverlay) {
        if (!videoPlayer || !videoInfo) return;

        console.log('🎧 Setting up video event listeners...');

        // Xử lý khi video bắt đầu load
        videoPlayer.onloadstart = () => {
            console.log('📥 Video loading started');
            this.updateVideoStatus('Đang tải video...', 'loading', videoInfo);
        };

        // Xử lý khi có đủ dữ liệu để phát
        videoPlayer.onloadeddata = () => {
            console.log('✅ Video data loaded');
            this.updateVideoStatus('Đã tải xong', 'loaded', videoInfo);

            // QUAN TRỌNG: Ẩn loading overlay
            if (loadingOverlay) {
                loadingOverlay.style.display = 'none';
            }

            // Cập nhật thông tin chi tiết
            videoInfo.innerHTML = this.createVideoInfoHTML(session, videoPlayer.src);
        };

        // Xử lý khi video bắt đầu phát
        videoPlayer.onplaying = () => {
            console.log('▶️ Video is now playing');
            this.updateVideoStatus('Đang phát', 'playing', videoInfo);

            // Đảm bảo loading overlay đã ẩn
            if (loadingOverlay) {
                loadingOverlay.style.display = 'none';
            }
        };

        // Xử lý lỗi
        videoPlayer.onerror = (e) => {
            console.error('❌ Video error:', videoPlayer.error);

            // QUAN TRỌNG: Ẩn loading overlay khi có lỗi
            if (loadingOverlay) {
                loadingOverlay.style.display = 'none';
            }

            let errorMessage = 'Không thể phát video';
            if (videoPlayer.error) {
                switch (videoPlayer.error.code) {
                    case 1: errorMessage = 'Video bị hủy'; break;
                    case 2: errorMessage = 'Lỗi mạng khi tải video'; break;
                    case 3: errorMessage = 'Lỗi giải mã video'; break;
                    case 4: errorMessage = 'Định dạng video không được hỗ trợ'; break;
                }
            }

            this.updateVideoStatus('Lỗi: ' + errorMessage, 'error', videoInfo);
            this.showVideoError(new Error(errorMessage), session);
        };
    }

    updateVideoStatus(message, status, videoInfo) {
        if (!videoInfo) return;

        console.log(`🎬 Video status: ${status} - ${message}`);

        const statusElement = videoInfo.querySelector('#videoStatusBadge') ||
            videoInfo.querySelector('.video-status');

        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `status-badge ${status}`;

            // Thêm icon tương ứng
            let icon = '';
            switch (status) {
                case 'loading': icon = '⏳'; break;
                case 'loaded': icon = '✅'; break;
                case 'playing': icon = '▶️'; break;
                case 'paused': icon = '⏸️'; break;
                case 'error': icon = '❌'; break;
                case 'ended': icon = '🏁'; break;
            }

            if (icon) {
                statusElement.innerHTML = `<span>${icon}</span> ${message}`;
            }
        }
    }


    showVideoError(error, videoUrl = '') {
        console.error('❌ Video error:', error);

        const videoPlayer = document.getElementById('playbackVideo');
        const videoLoading = document.getElementById('videoLoading');
        const noVideoOverlay = document.getElementById('noVideoOverlay');
        const videoInfo = document.getElementById('videoInfo');
        const captureFromVideoBtn = document.getElementById('captureFromVideo');

        // Ẩn các phần tử
        if (videoPlayer) videoPlayer.style.display = 'none';
        if (videoLoading) videoLoading.style.display = 'none';
        if (videoInfo) videoInfo.style.display = 'none';
        if (captureFromVideoBtn) captureFromVideoBtn.disabled = true;

        // Lấy error message
        let errorMessage = 'Không thể phát video';
        if (typeof error === 'string') {
            errorMessage = error;
        } else if (error?.message) {
            errorMessage = error.message;
        }

        // Chuyển videoUrl sang string
        const videoUrlStr = String(videoUrl || '');

        // Hiển thị thông báo lỗi
        if (noVideoOverlay) {
            noVideoOverlay.innerHTML = `
            <div class="empty-icon">❌</div>
            <h4>Không thể phát video</h4>
            <p>${errorMessage}</p>
            
            ${videoUrlStr ? `
            <div class="debug-info">
                <small><strong>URL đang thử:</strong></small>
                <div class="url-preview">${videoUrlStr.length > 100 ? videoUrlStr.substring(0, 100) + '...' : videoUrlStr}</div>
            </div>
            ` : ''}
            
            <div class="error-actions">
                <button onclick="window.faceDetectionApp?.retryVideoLoad()" class="btn btn-sm btn-primary">
                    🔄 Thử lại
                </button>
                
                ${videoUrlStr ? `
                <button onclick="window.open('${videoUrlStr}', '_blank')" class="btn btn-sm btn-info">
                    🌐 Mở trong tab mới
                </button>
                
                <button onclick="window.faceDetectionApp?.downloadVideo('${videoUrlStr}')" class="btn btn-sm btn-warning">
                    ⬇️ Tải xuống
                </button>
                ` : ''}
            </div>
        `;
            noVideoOverlay.style.display = 'flex';
        }
    }

    retryVideoLoad() {
        if (this.currentSessionId) {
            console.log('🔄 Retrying video load...');
            this.loadSessionVideo(this.currentSessionId);
        }
    }

    downloadVideo(videoUrl) {
        if (!videoUrl) return;

        const link = document.createElement('a');
        link.href = videoUrl;
        link.download = `video-${this.currentSessionId || 'session'}.mp4`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }


    // Thêm phương thức để xóa event listeners cũ
    removeVideoEventListeners(videoPlayer) {
        if (!videoPlayer) return;

        // Clone video element để xóa tất cả event listeners
        const newVideo = videoPlayer.cloneNode(true);
        if (videoPlayer.parentNode) {
            videoPlayer.parentNode.replaceChild(newVideo, videoPlayer);
        }

        // Update reference
        const newVideoElement = document.getElementById('playbackVideo');

        // Set lại các thuộc tính quan trọng
        if (newVideoElement) {
            newVideoElement.controls = true;
            newVideoElement.style.display = 'block';
        }

        return newVideoElement;
    }

    createVideoInfoHTML(session, videoUrl) {
        try {
            const startDate = new Date(session.start_time);
            const endDate = new Date(session.end_time);
            const duration = this.formatDuration(session.duration || 0);

            // Format dates với try-catch
            let formattedStart = 'N/A';
            let formattedEnd = 'N/A';

            try {
                formattedStart = startDate.toLocaleString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });

                formattedEnd = endDate.toLocaleString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
            } catch (dateError) {
                console.warn('⚠️ Date formatting error:', dateError);
                formattedStart = startDate.toISOString();
                formattedEnd = endDate.toISOString();
            }

            // Kiểm tra URL video
            let displayUrl = 'N/A';
            if (videoUrl && videoUrl !== 'null') {
                displayUrl = videoUrl.length > 50 ? videoUrl.substring(0, 50) + '...' : videoUrl;
            }

            return `
            <div class="video-details-container">
                <div class="details-header">
                    <h4>📋 Chi tiết session</h4>
                    <div class="session-id-small">ID: ${session.id ? session.id.substring(0, 12) + '...' : 'N/A'}</div>
                </div>
                
                <div class="details-grid">
                    <div class="detail-card">
                        <div class="detail-icon">⏰</div>
                        <div class="detail-content">
                            <div class="detail-label">BẮT ĐẦU</div>
                            <div class="detail-value">${formattedStart}</div>
                        </div>
                    </div>
                    
                    <div class="detail-card">
                        <div class="detail-icon">🏁</div>
                        <div class="detail-content">
                            <div class="detail-label">KẾT THÚC</div>
                            <div class="detail-value">${formattedEnd}</div>
                        </div>
                    </div>
                    
                    <div class="detail-card">
                        <div class="detail-icon">⏱️</div>
                        <div class="detail-content">
                            <div class="detail-label">THỜI LƯỢNG</div>
                            <div class="detail-value">${duration}</div>
                        </div>
                    </div>
                    
                    <div class="detail-card">
                        <div class="detail-icon">👤</div>
                        <div class="detail-content">
                            <div class="detail-label">TỔNG KHUÔN MẶT</div>
                            <div class="detail-value">${session.total_faces || 0}</div>
                        </div>
                    </div>
                </div>
                
                <div class="video-status-section">
                    <div class="status-header">
                        <span class="status-label">Trạng thái video:</span>
                        <span class="status-badge loading" id="videoStatusBadge">
                            <span class="spinner"></span>
                            Đang tải...
                        </span>
                    </div>
                    
                    <div class="video-source-info">
                        <div class="source-label">Đường dẫn:</div>
                        <div class="source-value" title="${videoUrl || 'Không có'}">
                            ${displayUrl}
                        </div>
                    </div>
                    
                    <div class="video-actions">
                        ${videoUrl && videoUrl !== 'null' ? `
                            <a href="${videoUrl}" target="_blank" class="video-action-btn">
                                <span class="action-icon">📹</span>
                                Mở video trong tab mới
                            </a>
                        ` : ''}
                        <button class="video-action-btn secondary" onclick="app.refreshVideoPlayer()">
                            <span class="action-icon">🔄</span>
                            Tải lại video
                        </button>
                    </div>
                </div>
            </div>
        `;
        } catch (error) {
            console.error('❌ Error creating video info HTML:', error);
            return `
            <div class="video-details-container">
                <div class="error-state">
                    <div class="error-icon">❌</div>
                    <h4>Lỗi hiển thị thông tin</h4>
                    <p>Không thể hiển thị thông tin chi tiết của session.</p>
                </div>
            </div>
        `;
        }
    }
    // Thêm phương thức refreshVideoPlayer
    refreshVideoPlayer() {
        const videoPlayer = document.getElementById('playbackVideo');
        const currentSession = this.currentDeleteSession || this.currentSessionId;

        if (videoPlayer && currentSession) {
            videoPlayer.load();
            this.showNotification('🔄 Đang tải lại video...', 'info');
        }
    }

    displaySessionCaptures(captures) {
        const container = document.getElementById('sessionCapturedImages');
        const countElement = document.getElementById('capturesCount');

        if (!container) return;

        if (!captures || captures.length === 0) {
            container.innerHTML = `
            <div class="empty-captures">
                <div class="empty-icon">📷</div>
                <h4 class="empty-title">Chưa có hình ảnh</h4>
                <p class="empty-description">
                    Chưa có hình ảnh nào được chụp từ session này.<br>
                    Bạn có thể chụp ảnh từ video bằng nút "📸 Chụp từ video".
                </p>
            </div>
        `;

            if (countElement) {
                countElement.textContent = '(0 ảnh)';
            }
            return;
        }

        // Cập nhật số lượng
        if (countElement) {
            countElement.textContent = `(${captures.length} ảnh)`;
        }

        // Xóa nội dung cũ
        container.innerHTML = '';

        // Sắp xếp theo thời gian mới nhất trước
        captures.sort((a, b) => new Date(b.created_at || b.timestamp) - new Date(a.created_at || a.timestamp));

        // Hiển thị tất cả ảnh (không giới hạn)
        captures.forEach((capture, index) => {
            const imageElement = this.createCaptureElement(capture, index);
            container.appendChild(imageElement);
        });
    }


    // Tạo HTML khi không có video
    createNoVideoHTML(session) {
        return `
        <div class="empty-state">
            <div class="empty-state-icon">📹</div>
            <h4 class="empty-state-title">Không có video</h4>
            <p class="empty-state-description">
                Session này không có file video đi kèm.
            </p>
            <div class="empty-state-details">
                <div class="detail-item">
                    <span class="detail-label">Session ID:</span>
                    <span class="detail-value">${session.id ? session.id.substring(0, 12) + '...' : 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Thời gian:</span>
                    <span class="detail-value">${new Date(session.start_time).toLocaleString('vi-VN')}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Tổng khuôn mặt:</span>
                    <span class="detail-value">${session.total_faces || 0}</span>
                </div>
            </div>
        </div>
    `;
    }

    // Tạo HTML khi có lỗi
    createErrorHTML(error, session) {
        return `
        <div class="empty-state error-state">
            <div class="empty-state-icon">❌</div>
            <h4 class="empty-state-title">Lỗi tải video</h4>
            <p class="empty-state-description">
                Không thể tải video: ${error.message}
            </p>
            ${session.id ? `
                <div class="empty-state-details">
                    <div class="detail-item">
                        <span class="detail-label">Session ID:</span>
                        <span class="detail-value">${session.id.substring(0, 12)}...</span>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
    }

    setupVideoPlayerEvents(videoPlayer, session) {
        if (!videoPlayer) return;

        const videoInfo = document.getElementById('videoInfo');

        // Tạo một wrapper function để bắt lỗi
        const safeHandler = (handler) => {
            return (event) => {
                try {
                    handler(event);
                } catch (error) {
                    console.warn('⚠️ Video event handler error:', error);
                }
            };
        };

        // Store handlers để có thể remove sau
        this.videoEventHandlers = this.videoEventHandlers || {};

        // Cleanup old handlers first
        if (this.videoEventHandlers[session.id]) {
            const handlers = this.videoEventHandlers[session.id];
            Object.keys(handlers).forEach(eventType => {
                videoPlayer.removeEventListener(eventType, handlers[eventType]);
            });
        }

        this.videoEventHandlers[session.id] = {};

        // Helper function để update status
        const updateStatus = (status, className, icon = null) => {
            try {
                const statusBadge = videoInfo.querySelector('#videoStatusBadge');
                if (statusBadge) {
                    statusBadge.textContent = status;
                    statusBadge.className = 'status-badge ' + className;

                    if (icon) {
                        statusBadge.innerHTML = `<span>${icon}</span> ${status}`;
                    }
                }
            } catch (error) {
                console.warn('⚠️ Error updating status:', error);
            }
        };

        // Define handlers
        const onLoadedData = safeHandler(() => {
            console.log('✅ Video loaded successfully');
            updateStatus('✅ Đã tải xong', 'ready', '✅');

            // Try to play
            videoPlayer.play().catch(e => {
                console.log('Auto-play prevented:', e);
                updateStatus('⏸️ Nhấn để phát', 'ready', '⏸️');
            });
        });

        const onPlay = safeHandler(() => {
            updateStatus('▶️ Đang phát', 'playing', '▶️');
        });

        const onPause = safeHandler(() => {
            updateStatus('⏸️ Đang dừng', 'ready', '⏸️');
        });

        const onWaiting = safeHandler(() => {
            updateStatus('⏳ Đang tải...', 'loading', '<span class="spinner"></span>');
        });

        const onError = safeHandler((e) => {
            console.error('❌ Video playback error:', e);
            console.error('Video error details:', videoPlayer.error);

            updateStatus('❌ Lỗi phát video', 'error', '❌');

            // Show error details
            let errorMessage = 'Không thể phát video';
            if (videoPlayer.error) {
                switch (videoPlayer.error.code) {
                    case MediaError.MEDIA_ERR_ABORTED:
                        errorMessage = 'Video playback was aborted';
                        break;
                    case MediaError.MEDIA_ERR_NETWORK:
                        errorMessage = 'Network error - video may be unavailable';
                        break;
                    case MediaError.MEDIA_ERR_DECODE:
                        errorMessage = 'Video format not supported';
                        break;
                    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                        errorMessage = 'Video format or source not supported';
                        break;
                    default:
                        errorMessage = 'Unknown video error';
                }
            }

            // Add error details to UI
            const errorDiv = document.createElement('div');
            errorDiv.className = 'video-error-details';
            errorDiv.innerHTML = `
            <div style="margin-top: 10px; padding: 10px; background: #f8d7da; border-radius: 5px;">
                <p style="color: #721c24; margin: 0; font-size: 12px;">
                    ${errorMessage}
                </p>
                ${session.video_filename ?
                    `<p style="color: #721c24; margin: 5px 0 0 0; font-size: 11px;">
                        URL: ${session.video_filename.substring(0, 50)}...
                    </p>` : ''
                }
            </div>
        `;

            const existingError = videoInfo.querySelector('.video-error-details');
            if (existingError) {
                existingError.remove();
            }

            videoInfo.appendChild(errorDiv);
        });

        const onEnded = safeHandler(() => {
            updateStatus('🏁 Đã kết thúc', 'ready', '🏁');
        });

        // Store handlers
        this.videoEventHandlers[session.id] = {
            loadeddata: onLoadedData,
            play: onPlay,
            pause: onPause,
            waiting: onWaiting,
            error: onError,
            ended: onEnded
        };

        // Add event listeners
        videoPlayer.addEventListener('loadeddata', onLoadedData);
        videoPlayer.addEventListener('play', onPlay);
        videoPlayer.addEventListener('pause', onPause);
        videoPlayer.addEventListener('waiting', onWaiting);
        videoPlayer.addEventListener('error', onError);
        videoPlayer.addEventListener('ended', onEnded);
    }

    // Thêm phương thức formatDuration nếu chưa có
    formatDuration(seconds) {
        if (!seconds || seconds === 0) return '0s';

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }

    async testVideoUrl(url) {
        return new Promise((resolve) => {
            console.log('🧪 Testing video URL:', url);

            const testVideo = document.createElement('video');
            testVideo.crossOrigin = 'anonymous';
            testVideo.preload = 'metadata';
            testVideo.style.display = 'none';

            testVideo.onloadedmetadata = () => {
                console.log('✅ URL test passed');
                document.body.removeChild(testVideo);
                resolve(true);
            };

            testVideo.onerror = () => {
                console.error('❌ URL test failed');
                document.body.removeChild(testVideo);
                resolve(false);
            };

            // Thêm vào DOM để test
            document.body.appendChild(testVideo);
            testVideo.src = url;
            testVideo.load();

            // Timeout sau 5 giây
            setTimeout(() => {
                if (testVideo.parentNode) {
                    document.body.removeChild(testVideo);
                }
                console.warn('⚠️ URL test timeout');
                resolve(false);
            }, 5000);
        });
    }

    async saveSessionData(data) {
        try {
            // data bây giờ chứa cả sessionInfo và videoData
            const sessionData = {
                id: data.sessionId, // Lấy từ data (đã merge)
                start_time: new Date(data.startTime || this.faceDetector.startTime).toISOString(),
                end_time: new Date().toISOString(),
                total_faces: data.totalFaces || this.faceDetector.totalFacesCount || 0,
                duration: data.duration || Math.floor((Date.now() - this.faceDetector.startTime) / 1000),
                // QUAN TRỌNG: Lấy từ videoData trong data
                video_filename: data.filename || null,
                video_public_id: data.public_id || null
            };

            console.log('💾 Saving session data with video info:', sessionData);

            // Log để debug
            console.log('🔍 DEBUG data structure:', {
                inputData: data,
                sessionData: sessionData,
                faceDetectorSessionId: this.faceDetector.sessionId
            });

            const response = await fetch('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sessionData)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }

            const result = await response.json();
            console.log('✅ Session saved successfully:', result);

            // Reset session ID sau khi lưu thành công
            this.faceDetector.sessionId = null;
            this.faceDetector.startTime = null;

            // Load lại lịch sử
            this.loadVideoHistory();

        } catch (error) {
            console.error('❌ Error saving session data:', error);
            // Vẫn reset session ID ngay cả khi có lỗi
            this.faceDetector.sessionId = null;
            this.faceDetector.startTime = null;
        }
    }

    // Thêm vào app.js
    validateSessionData(sessionData) {
        const errors = [];

        if (!sessionData.id) {
            errors.push('Session ID is required');
        }

        if (!sessionData.start_time) {
            errors.push('Start time is required');
        }

        if (typeof sessionData.total_faces !== 'number') {
            errors.push('Total faces must be a number');
        }

        if (typeof sessionData.duration !== 'number') {
            errors.push('Duration must be a number');
        }

        if (errors.length > 0) {
            console.warn('⚠️ Session data validation errors:', errors);
            return false;
        }

        return true;
    }
}