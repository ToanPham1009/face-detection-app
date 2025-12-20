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

    // Thêm phương thức để load hình ảnh từ database
    async loadCapturesForSession(sessionId) {
        try {
            console.log(`📷 Loading captures for session: ${sessionId}`);

            const response = await fetch(`/api/captures/session/${sessionId}`);

            if (response.ok) {
                const captures = await response.json();
                console.log(`✅ Loaded ${captures.length} captures from database`);

                // Lưu vào currentSessionImages
                this.currentSessionImages.set(sessionId, captures);

                // Cập nhật localStorage
                this.saveSessionImagesToLocalStorage(sessionId, captures);

                // Hiển thị hình ảnh
                this.displaySessionCaptures(captures);

                return captures;
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

    // Tạo element cho ảnh capture (sửa lại từ createImageElement)
    createCaptureElement(capture) {
        const div = document.createElement('div');
        div.className = 'captured-image-grid-item';

        const time = new Date(capture.created_at || capture.timestamp);
        const timeText = capture.video_time
            ? `${time.toLocaleTimeString('vi-VN')} (⏱️ ${this.formatVideoTime(capture.video_time)})`
            : time.toLocaleTimeString('vi-VN');

        div.innerHTML = `
        <img src="${capture.url}" alt="Captured image" loading="lazy">
        <div class="captured-image-grid-info">
            <div class="time">${timeText}</div>
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

    // Lưu hình ảnh lên server
    async saveCapturedImage(blob, source = 'camera', metadata = {}) {
        try {
            const formData = new FormData();
            const timestamp = new Date().getTime();
            const filename = `capture_${timestamp}.jpg`;

            formData.append('image', blob, filename);
            formData.append('source', source);
            formData.append('timestamp', timestamp);
            formData.append('sessionId', this.currentSessionId || 'live');

            // Thêm metadata nếu có
            if (metadata.videoTime) {
                formData.append('videoTime', metadata.videoTime);
            }
            if (this.faceDetector?.totalFacesCount) {
                formData.append('faceCount', this.faceDetector.totalFacesCount);
            }

            console.log(`📤 Uploading captured image: ${filename}`);

            const response = await fetch('/api/captures/upload', {
                method: 'POST',
                // KHÔNG thêm headers khi dùng FormData
                body: formData
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ Image saved:', result);

                const imageData = {
                    id: result.id || timestamp,
                    url: result.url,
                    filename: result.filename,
                    timestamp: timestamp,
                    source: source,
                    sessionId: this.currentSessionId || 'live',
                    timeString: new Date(timestamp).toLocaleTimeString('vi-VN'),
                    metadata: metadata
                };

                // Lưu vào local storage
                this.saveToLocalStorage(imageData);

                return imageData;
            } else {
                const errorText = await response.text();
                console.error('❌ Upload failed:', errorText);
                throw new Error('Upload failed');
            }
        } catch (error) {
            console.error('❌ Error saving image:', error);

            // Fallback: tạo URL tạm từ blob
            const tempUrl = URL.createObjectURL(blob);
            const timestamp = new Date().getTime();

            const imageData = {
                id: timestamp,
                url: tempUrl,
                filename: `capture_${timestamp}.jpg`,
                timestamp: timestamp,
                source: source,
                sessionId: this.currentSessionId || 'live',
                timeString: new Date(timestamp).toLocaleTimeString('vi-VN'),
                metadata: metadata,
                isLocal: true // Đánh dấu là ảnh local
            };

            // Lưu vào local storage
            this.saveToLocalStorage(imageData);

            return imageData;
        }
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

    async playVideo(session, event) {
        try {
            const videoPlayer = document.getElementById('playbackVideo');
            const videoWrapper = document.querySelector('.video-wrapper');
            const videoInfo = document.getElementById('videoInfo');

            console.log('🎬 Playing video for session:', session.id);

            // Xóa active class từ tất cả items
            document.querySelectorAll('.video-item').forEach(item => {
                item.classList.remove('active');
            });

            // Thêm active class cho item được chọn
            if (event && event.currentTarget) {
                event.currentTarget.classList.add('active');
            }

            // Cập nhật currentSessionId
            this.currentSessionId = session.id;

            // Enable nút chụp từ video
            const captureBtn = document.getElementById('captureFromVideo');
            if (captureBtn) {
                captureBtn.disabled = false;
            }

            if (session.video_filename && session.video_filename !== 'null') {
                // Hiển thị video wrapper
                videoWrapper.style.display = 'block';
                videoWrapper.classList.add('active');

                // Kiểm tra xem video URL có hợp lệ không
                const videoUrl = session.video_filename;
                console.log('Setting video src to:', videoUrl);

                videoPlayer.src = videoUrl;
                videoPlayer.style.display = 'block';
                videoPlayer.controls = true;

                // Setup event listeners cho video
                this.setupVideoPlayerEvents(videoPlayer, session);

                // Hiển thị thông tin video
                videoInfo.innerHTML = this.createVideoInfoHTML(session, videoUrl);

            } else {
                // Không có video - hiển thị empty state
                videoWrapper.style.display = 'none';
                videoWrapper.classList.remove('active');
                videoInfo.innerHTML = this.createNoVideoHTML(session);
            }

            // Load hình ảnh của session này
            await this.loadCapturesForSession(session.id);

        } catch (error) {
            console.error('Error playing video:', error);
            const videoInfo = document.getElementById('videoInfo');
            videoInfo.innerHTML = this.createErrorHTML(error, session);
        }
    }

    // Tạo HTML cho thông tin video
    createVideoInfoHTML(session, videoUrl) {
        const startDate = new Date(session.start_time);
        const endDate = new Date(session.end_time);

        return `
        <div class="video-details">
            <div class="detail-header">
                <h4>📋 Chi tiết session</h4>
            </div>
            <div class="detail-content">
                <div class="detail-item">
                    <span class="detail-label">Thời gian kết thúc:</span>
                    <span class="detail-value">${endDate.toLocaleString('vi-VN')}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Tổng khuôn mặt:</span>
                    <span class="detail-value">${session.total_faces || 0}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Thời lượng:</span>
                    <span class="detail-value">${this.formatDuration(session.duration || 0)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Trạng thái video:</span>
                    <span class="detail-value status-loading">⏳ Đang tải...</span>
                </div>
            </div>
            <div class="detail-actions">
                <a href="${videoUrl}" target="_blank" class="external-link">
                    📹 Mở video trong tab mới
                </a>
            </div>
        </div>
    `;
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

    // Setup events cho video player
    setupVideoPlayerEvents(videoPlayer, session) {
        const videoInfo = document.getElementById('videoInfo');

        videoPlayer.onloadeddata = () => {
            console.log('✅ Video loaded successfully');
            // Cập nhật trạng thái
            const statusElement = videoInfo.querySelector('.status-loading');
            if (statusElement) {
                statusElement.textContent = '✅ Đã tải';
                statusElement.className = 'detail-value status-loaded';
            }

            // Cố gắng play video
            videoPlayer.play().catch(e => {
                console.log('Auto-play prevented:', e);
            });
        };

        videoPlayer.onerror = (e) => {
            console.error('❌ Video playback error:', e);
            const statusElement = videoInfo.querySelector('.status-loading');
            if (statusElement) {
                statusElement.textContent = '❌ Lỗi tải video';
                statusElement.className = 'detail-value status-error';
            }
        };

        videoPlayer.onwaiting = () => {
            const statusElement = videoInfo.querySelector('.status-loading');
            if (statusElement) {
                statusElement.textContent = '⏳ Đang tải...';
                statusElement.className = 'detail-value status-loading';
            }
        };

        videoPlayer.onplaying = () => {
            const statusElement = videoInfo.querySelector('.status-loading');
            if (statusElement) {
                statusElement.textContent = '▶️ Đang phát';
                statusElement.className = 'detail-value status-playing';
            }
        };
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