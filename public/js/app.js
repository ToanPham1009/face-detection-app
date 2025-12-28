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

        // KHÔNG gọi initialize() ở đây nữa
        // Thay vào đó, đợi DOM sẵn sàng
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

    async loadCapturesForSession(sessionId) {
        try {
            console.log(`📷 Loading captures for session: ${sessionId}`);

            // Gọi API mới (giống video)
            const response = await fetch(`/api/captures/session/${sessionId}`);

            if (response.ok) {
                const captures = await response.json();

                // Đảm bảo tất cả URL đều dùng HTTPS
                const securedCaptures = captures.map(capture => ({
                    ...capture,
                    url: this.ensureHttpsUrl(capture.url)
                }));

                console.log(`✅ Loaded ${securedCaptures.length} captures from database`);

                // Lưu vào currentSessionImages
                this.currentSessionImages.set(sessionId, securedCaptures);

                // Cập nhật localStorage
                this.saveSessionImagesToLocalStorage(sessionId, securedCaptures);

                // Hiển thị hình ảnh
                this.displaySessionCaptures(securedCaptures);

                return securedCaptures;
            } else {
                console.warn(`⚠️ No captures found for session: ${sessionId}`);
                // Load từ localStorage nếu có
                const localImages = this.currentSessionImages.get(sessionId) || [];
                this.displaySessionCaptures(localImages);
                return localImages;
            }
        } catch (error) {
            console.error('❌ Error loading captures:', error);
            // Fallback: load từ localStorage
            const localImages = this.currentSessionImages.get(sessionId) || [];
            this.displaySessionCaptures(localImages);
            return localImages;
        }
    }

    displaySessionCaptures(captures) {
        const container = document.getElementById('sessionCapturedImages');
        if (!container) return;

        if (!captures || captures.length === 0) {
            container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📷</div>
                <h4 class="empty-state-title">Chưa có hình ảnh</h4>
                <p class="empty-state-description">
                    Chưa có hình ảnh nào được chụp từ session này.<br>
                    Bạn có thể chụp ảnh từ video bằng nút "Chụp từ video".
                </p>
            </div>
        `;
            return;
        }

        container.innerHTML = '';

        // Sắp xếp theo thời gian mới nhất trước
        captures.sort((a, b) => new Date(b.created_at || b.timestamp) - new Date(a.created_at || a.timestamp));

        // Giới hạn hiển thị 12 ảnh
        const displayCaptures = captures.slice(0, 12);

        displayCaptures.forEach(capture => {
            const imageElement = this.createCaptureElement(capture);
            container.appendChild(imageElement);
        });

        // Hiển thị thông báo nếu có nhiều hơn 12 ảnh
        if (captures.length > 12) {
            const moreText = document.createElement('div');
            moreText.className = 'more-images-text';
            moreText.textContent = `+ ${captures.length - 12} hình ảnh khác`;
            container.appendChild(moreText);
        }
    }

    createCaptureElement(capture, index) {
        const div = document.createElement('div');
        div.className = 'captured-image-grid-item';
        div.dataset.captureId = capture.id || index;
        div.dataset.publicId = capture.public_id || '';

        // Đảm bảo URL dùng HTTPS
        const secureUrl = this.ensureHttpsUrl(capture.url);

        // Format thời gian
        const time = new Date(capture.created_at || capture.timestamp);
        const timeText = time.toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit'
        });

        // Thêm thông tin video time nếu có
        let videoTimeText = '';
        if (capture.video_time !== undefined && capture.video_time !== null) {
            const mins = Math.floor(capture.video_time / 60);
            const secs = Math.floor(capture.video_time % 60);
            videoTimeText = `⏱️ ${mins}:${secs.toString().padStart(2, '0')}`;
        }

        div.innerHTML = `
        <div class="capture-image-container">
            <img src="${secureUrl}" 
                 alt="Captured image ${index + 1}" 
                 loading="lazy"
                 onerror="this.onerror=null; this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNmOGY5ZmEiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjNjM2NjY5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+SW1hZ2Ugbm90IGZvdW5kPC90ZXh0Pjwvc3ZnPg='">
        </div>
        <div class="captured-image-grid-info">
            <div class="time">${timeText}</div>
            ${videoTimeText ? `<div class="video-time">${videoTimeText}</div>` : ''}
            <div class="source">${capture.source === 'camera' ? '📸 Chụp trực tiếp' : '🎬 Từ video'}</div>
        </div>
    `;

        // Thêm sự kiện click để xem ảnh lớn
        div.addEventListener('click', () => {
            this.showImageModal(capture);
        });

        return div;
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
                this.captureFromCamera();
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

            // Tạo canvas tạm để chụp
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            const tempCtx = tempCanvas.getContext('2d');

            // Vẽ nội dung từ canvas chính
            tempCtx.drawImage(canvas, 0, 0);

            // Chuyển sang blob và lưu
            tempCanvas.toBlob(async (blob) => {
                const imageData = await this.saveCapturedImage(blob, 'camera');
                this.addCapturedImageToUI(imageData, 'live');
                this.showNotification('📸 Đã chụp hình từ camera!', 'success');
            }, 'image/jpeg', 0.9);

        } catch (error) {
            console.error('❌ Error capturing image:', error);
            this.showNotification('❌ Lỗi khi chụp hình: ' + error.message, 'error');
        }
    }

    // Phương thức chụp từ video player
    async captureFromVideoPlayer() {
        try {
            const videoPlayer = document.getElementById('playbackVideo');
            if (!videoPlayer || videoPlayer.style.display === 'none') {
                this.showNotification('📹 Vui lòng chọn và phát video trước', 'warning');
                return;
            }

            if (videoPlayer.paused) {
                this.showNotification('⏸️ Video đang dừng. Vui lòng phát video để chụp', 'warning');
                return;
            }

            // Tạo canvas để chụp frame từ video
            const canvas = document.createElement('canvas');
            canvas.width = videoPlayer.videoWidth || 640;
            canvas.height = videoPlayer.videoHeight || 480;
            const ctx = canvas.getContext('2d');

            // Vẽ frame hiện tại của video
            ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);

            // Thêm timestamp lên ảnh
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(10, canvas.height - 40, 200, 30);
            ctx.fillStyle = 'white';
            ctx.font = '14px Arial';

            const currentTime = this.formatVideoTime(videoPlayer.currentTime);
            ctx.fillText(`⏱️ ${currentTime}`, 15, canvas.height - 20);

            // Chuyển sang blob và lưu
            canvas.toBlob(async (blob) => {
                const imageData = await this.saveCapturedImage(blob, 'video', {
                    videoTime: videoPlayer.currentTime,
                    sessionId: this.currentSessionId
                });
                this.addCapturedImageToUI(imageData, 'session');
                this.showNotification('📸 Đã chụp hình từ video!', 'success');
            }, 'image/jpeg', 0.9);

        } catch (error) {
            console.error('❌ Error capturing from video:', error);
            this.showNotification('❌ Lỗi khi chụp từ video: ' + error.message, 'error');
        }
    }

    async saveCapturedImage(blob, source = 'camera', metadata = {}) {
        try {
            const timestamp = new Date().getTime();
            const filename = `capture_${timestamp}.jpg`;

            console.log(`📤 Uploading captured image to Cloudinary: ${filename}`);

            // Tạo FormData cho upload (giống video upload)
            const formData = new FormData();
            formData.append('image', blob, filename);
            formData.append('source', source);
            formData.append('timestamp', timestamp.toString());
            formData.append('sessionId', this.currentSessionId || 'live');

            // Thêm metadata nếu có
            if (metadata.videoTime) {
                formData.append('videoTime', metadata.videoTime.toString());
            }
            if (this.faceDetector?.totalFacesCount) {
                formData.append('faceCount', this.faceDetector.totalFacesCount.toString());
            }

            // Gửi đến API để upload lên Cloudinary (giống video)
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
            console.log('✅ Image uploaded to Cloudinary:', result);

            // Đảm bảo URL dùng HTTPS
            const secureUrl = this.ensureHttpsUrl(result.url);

            const imageData = {
                id: result.id || timestamp,
                url: secureUrl,
                public_id: result.public_id,
                filename: result.filename || filename,
                timestamp: timestamp,
                source: source,
                sessionId: this.currentSessionId || 'live',
                created_at: result.created_at || new Date().toISOString(),
                timeString: new Date(timestamp).toLocaleTimeString('vi-VN'),
                metadata: metadata
            };

            // Lưu vào local storage và current session
            this.saveToLocalStorage(imageData);

            // Thêm vào current session images
            if (this.currentSessionId && this.currentSessionId !== 'live') {
                if (!this.currentSessionImages.has(this.currentSessionId)) {
                    this.currentSessionImages.set(this.currentSessionId, []);
                }
                const sessionImages = this.currentSessionImages.get(this.currentSessionId);
                sessionImages.unshift(imageData);

                // Giới hạn 50 ảnh mỗi session
                if (sessionImages.length > 50) {
                    sessionImages.pop();
                }

                // Cập nhật UI nếu đang xem session này
                if (document.getElementById('sessionCapturedImages')) {
                    this.displaySessionCaptures(sessionImages);
                }
            }

            return imageData;

        } catch (error) {
            console.error('❌ Error uploading image to Cloudinary:', error);

            // Fallback cho development (không có Cloudinary)
            const tempUrl = URL.createObjectURL(blob);
            const timestamp = new Date().getTime();

            const imageData = {
                id: timestamp,
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

            // Vẫn lưu vào local storage
            this.saveToLocalStorage(imageData);

            return imageData;
        }
    }

    // Thêm vào class FaceDetectionApp
    ensureHttpsUrl(url) {
        if (!url) return url;

        // Kiểm tra xem URL có bắt đầu bằng http:// không
        if (url.startsWith('http://')) {
            console.log(`🔄 Converting HTTP to HTTPS: ${url}`);
            return url.replace('http://', 'https://');
        }

        // Nếu URL không có protocol, thêm https://
        if (url.startsWith('//')) {
            console.log(`🔄 Adding HTTPS protocol: ${url}`);
            return 'https:' + url;
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

            // Dừng tracking trong faceDetector và nhận session info
            const sessionInfo = this.faceDetector.stopTracking();
            console.log('✅ Face detector tracking stopped, session info:', sessionInfo);

            // Dừng recording video
            const videoData = await this.videoManager.stopRecording();
            console.log('✅ Video recording stopped:', videoData);

            // Ẩn trạng thái recording
            const recordingStatus = document.getElementById('recordingStatus');
            if (recordingStatus) {
                recordingStatus.style.display = 'none';
            }

            // Cập nhật nút bấm
            this.updateTrackingButtons(false);

            // Lưu session data với sessionInfo từ faceDetector
            await this.saveSessionData(videoData, sessionInfo);

            // HIỂN THỊ THÔNG BÁO
            this.showNotification('⏸️ Đã dừng thống kê. Camera vẫn đang chạy.', 'info');

        } catch (error) {
            console.error('❌ Error stopping tracking/recording:', error);

            // Vẫn cố gắng lưu session data (có thể không có video)
            await this.saveSessionData({ filename: null }, null);

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

    // Thêm vào class FaceDetectionApp
    cleanupVideoPlayer() {
        console.log('🧹 Cleaning up video player...');

        const videoPlayer = document.getElementById('playbackVideo');
        if (videoPlayer) {
            try {
                // Dừng video
                videoPlayer.pause();
                videoPlayer.currentTime = 0;

                // Xóa source và event listeners
                videoPlayer.src = '';
                videoPlayer.load();

                // Clone để xóa event listeners cũ
                const newVideo = videoPlayer.cloneNode(true);
                if (videoPlayer.parentNode) {
                    videoPlayer.parentNode.replaceChild(newVideo, videoPlayer);
                    newVideo.id = 'playbackVideo';
                    newVideo.controls = true;
                    newVideo.style.display = 'block';
                }

                console.log('✅ Video player cleaned up');
            } catch (error) {
                console.warn('⚠️ Error during cleanup:', error);
            }
        }

        // Xóa video event handlers nếu có
        if (this.videoEventHandlers) {
            this.videoEventHandlers = {};
        }
    }

    async playVideo(session, event) {
        try {
            console.log('🎬 Playing video for session:', session);

            // Cleanup trước khi load video mới
            this.cleanupVideoPlayer();

            // Lấy các DOM elements
            const videoPlayer = document.getElementById('playbackVideo');
            const videoWrapper = document.querySelector('.video-wrapper');
            const videoInfo = document.getElementById('videoInfo');

            // Kiểm tra DOM elements
            if (!videoPlayer || !videoWrapper || !videoInfo) {
                console.error('❌ Missing DOM elements');
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

            // Enable capture button
            const captureBtn = document.getElementById('captureFromVideo');
            if (captureBtn) {
                captureBtn.disabled = false;
                captureBtn.innerHTML = '📸 Chụp từ video';
            }

            // Kiểm tra video URL
            const videoUrl = session.video_filename;
            if (!videoUrl || videoUrl === 'null') {
                console.log('📭 No video for this session');

                // Ẩn video player, hiển thị thông báo
                videoPlayer.style.display = 'none';
                videoInfo.innerHTML = this.createNoVideoHTML(session);

                // Load hình ảnh của session
                await this.loadCapturesForSession(session.id);
                return;
            }

            console.log('🎯 Video URL found:', videoUrl);

            // Reset video player
            videoPlayer.style.display = 'block';

            // Show loading
            const loadingOverlay = videoWrapper.querySelector('.video-loading-overlay') ||
                this.createLoadingOverlay();
            if (!loadingOverlay.parentNode) {
                videoWrapper.appendChild(loadingOverlay);
            }
            loadingOverlay.style.display = 'flex';

            // Hiển thị loading state trong video info
            videoInfo.innerHTML = this.createVideoInfoHTML(session, videoUrl);

            // Set video source với cache busting
            const timestamp = new Date().getTime();
            const videoUrlWithCacheBust = `${videoUrl}${videoUrl.includes('?') ? '&' : '?'}_t=${timestamp}`;

            console.log('🔗 Setting video src (with cache bust):', videoUrlWithCacheBust);

            // Đặt source
            videoPlayer.src = videoUrlWithCacheBust;
            videoPlayer.load();

            console.log('✅ Video src set and load() called');

            // Setup event listeners
            this.setupVideoEventListeners(videoPlayer, session, videoInfo, loadingOverlay);

            // Load hình ảnh của session
            await this.loadCapturesForSession(session.id);

            console.log('✅ Video setup complete');

        } catch (error) {
            console.error('❌ Error in playVideo:', error);
            this.showVideoError(error, session);
        }
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

    setupVideoEventListeners(videoPlayer, session, videoInfo) {
        if (!videoPlayer || !videoInfo) return;

        console.log('🎧 Setting up video event listeners...');

        // Lưu reference đến this để dùng trong event handlers
        const app = this;

        // Xử lý khi video bắt đầu load
        videoPlayer.onloadstart = () => {
            console.log('📥 Video loading started');
            app.updateVideoStatus('Đang tải video...', 'loading', videoInfo);
        };

        // Xử lý khi có đủ dữ liệu để phát
        videoPlayer.onloadeddata = () => {
            console.log('✅ Video data loaded');
            app.updateVideoStatus('Đã tải xong', 'loaded', videoInfo);

            // Cập nhật thông tin chi tiết
            videoInfo.innerHTML = app.createVideoInfoHTML(session, videoPlayer.src);
        };

        // Xử lý khi video bắt đầu phát
        videoPlayer.onplaying = () => {
            console.log('▶️ Video is now playing');
            app.updateVideoStatus('Đang phát', 'playing', videoInfo);
        };

        // Xử lý khi video dừng
        videoPlayer.onpause = () => {
            console.log('⏸️ Video paused');
            app.updateVideoStatus('Đang dừng', 'paused', videoInfo);
        };

        // Xử lý lỗi
        videoPlayer.onerror = (e) => {
            console.error('❌ Video error:', videoPlayer.error);

            let errorMessage = 'Không thể phát video';
            if (videoPlayer.error) {
                switch (videoPlayer.error.code) {
                    case 1: errorMessage = 'Video bị hủy'; break;
                    case 2: errorMessage = 'Lỗi mạng khi tải video'; break;
                    case 3: errorMessage = 'Lỗi giải mã video'; break;
                    case 4: errorMessage = 'Định dạng video không được hỗ trợ'; break;
                }
            }

            app.updateVideoStatus('Lỗi: ' + errorMessage, 'error', videoInfo);
            app.showVideoError(new Error(errorMessage), session);
        };

        // Xử lý khi video kết thúc
        videoPlayer.onended = () => {
            console.log('🏁 Video ended');
            app.updateVideoStatus('Đã kết thúc', 'ended', videoInfo);
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

    // Thêm method showVideoError
    showVideoError(error, session) {
        console.error('❌ Video error:', error);

        const videoInfo = document.getElementById('videoInfo');
        if (!videoInfo) return;

        const errorHTML = `
        <div class="video-error-state">
            <div class="error-icon">❌</div>
            <h4 class="error-title">Lỗi tải video</h4>
            <p class="error-message">${error.message || 'Không xác định'}</p>
            <div class="error-details">
                <p><strong>Session ID:</strong> ${session.id || 'N/A'}</p>
                <p><strong>Thời gian:</strong> ${new Date(session.start_time).toLocaleString('vi-VN')}</p>
                ${session.video_filename ?
                `<p><strong>Video URL:</strong> <small>${session.video_filename.substring(0, 50)}...</small></p>` :
                '<p><strong>Video:</strong> Không có</p>'
            }
            </div>
            <div class="error-actions">
                <button onclick="window.faceDetectionApp.retryVideoPlayback()" class="btn btn-primary">
                    🔄 Thử lại
                </button>
                ${session.video_filename ?
                `<a href="${session.video_filename}" target="_blank" class="btn btn-secondary">
                        📹 Mở trong tab mới
                    </a>` :
                ''
            }
            </div>
        </div>
    `;

        videoInfo.innerHTML = errorHTML;
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

    // Thêm phương thức để kiểm tra video URL
    async testVideoUrl(url) {
        try {
            const response = await fetch(url, { method: 'HEAD' });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    async saveSessionData(videoData, sessionInfo) {
        try {
            // Sử dụng sessionInfo từ FaceDetector nếu có
            const sessionData = {
                id: sessionInfo?.sessionId || this.faceDetector.sessionId,
                start_time: new Date(sessionInfo?.startTime || this.faceDetector.startTime).toISOString(),
                end_time: new Date().toISOString(),
                total_faces: sessionInfo?.totalFaces || this.faceDetector.totalFacesCount,
                duration: sessionInfo?.duration || Math.floor((Date.now() - this.faceDetector.startTime) / 1000),
                video_filename: videoData?.filename || null
            };

            console.log('💾 Saving session data:', sessionData);

            // Kiểm tra và fix dữ liệu nếu cần
            if (!sessionData.id) {
                console.warn('⚠️ Session ID is null, generating new ID');
                sessionData.id = Date.now().toString();
            }

            if (!sessionData.start_time) {
                console.warn('⚠️ Start time is null, using current time');
                sessionData.start_time = new Date().toISOString();
            }

            if (typeof sessionData.total_faces !== 'number' || isNaN(sessionData.total_faces)) {
                console.warn('⚠️ Total faces is invalid, setting to 0');
                sessionData.total_faces = 0;
            }

            if (typeof sessionData.duration !== 'number' || isNaN(sessionData.duration)) {
                console.warn('⚠️ Duration is invalid, calculating from start time');
                sessionData.duration = sessionData.start_time ?
                    Math.floor((Date.now() - new Date(sessionData.start_time).getTime()) / 1000) : 0;
            }

            const response = await fetch('/api/sessions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
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