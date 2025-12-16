// Main application controller
class FaceDetectionApp {
    constructor() {
        console.log('🔄 Initializing FaceDetectionApp...');

        // Khởi tạo VideoManager
        this.videoManager = new VideoManager();

        // Đảm bảo DOM đã sẵn sàng
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }

        // Thêm quản lý hình ảnh
        this.capturedImages = [];
        this.currentSessionImages = new Map(); // Map sessionId -> images array
        this.currentSessionId = null;
    }

    initialize() {
        console.log('🎯 Starting app initialization...');

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

        // Khởi tạo FaceDetector với tracking cải tiến
        this.faceDetector = new FaceDetector();

        // QUAN TRỌNG: Thiết lập callbacks trực tiếp
        this.setupFaceDetectorCallbacks();

        // Setup event listeners
        this.setupEventListeners();

        // Setup tab switching
        this.setupTabSwitching();

        // Thêm event listeners cho modal xóa
        this.setupDeleteModal();

        console.log('✅ FaceDetectionApp initialized successfully');
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
            'debugButton': () => {
                console.log('🐛 DEBUG INFO:');
                console.log('- FaceDetector State:', this.faceDetector.getCameraState?.() || 'N/A');
                console.log('- Is Tracking:', this.faceDetector?.isTracking);
                console.log('- Total Faces:', this.faceDetector?.totalFacesCount);

                // Force UI update
                const currentFaces = document.getElementById('currentFaces');
                const totalFaces = document.getElementById('totalFaces');
                if (currentFaces) currentFaces.textContent = this.faceDetector?.totalFacesCount || 0;
                if (totalFaces) totalFaces.textContent = this.faceDetector?.totalFacesCount || 0;

                alert(`Debug Info:\nTracking: ${this.faceDetector?.isTracking ? 'ON' : 'OFF'}\nTotal Faces: ${this.faceDetector?.totalFacesCount || 0}`);
            },
            'debugTracking': () => {
                if (this.faceDetector?.faceTracker) {
                    console.log('🔍 DEBUG FACE TRACKER:');
                    console.log('- Total unique faces:', this.faceDetector.faceTracker.totalUniqueFaces);
                    console.log('- Currently tracked:', this.faceDetector.faceTracker.currentFrameFaces?.size || 0);
                    console.log('- Total appearances:', this.faceDetector.faceTracker.getTotalAppearances?.() || 0);
                    console.log('- Tracked persons:', Array.from(this.faceDetector.faceTracker.trackedPersons?.entries() || []));
                } else {
                    console.log('❌ Face tracker not available');
                }
            },
            'debugTracker': () => {
                console.log('🔍 DEBUG TRACKER');
                if (this.faceDetector?.debugTracker) {
                    this.faceDetector.debugTracker();
                }

                // Test findMatchingFaceId với dummy data
                if (this.faceDetector?.faceTracker?.findMatchingFaceId) {
                    const testDetection = { x: 320, y: 240, confidence: 0.8 };
                    const match = this.faceDetector.faceTracker.findMatchingFaceId(testDetection);
                    console.log(`🧪 Test match result: ${match}`);
                }
            },
            'refreshDisplay': () => {
                console.log('🔄 Refreshing display...');
                // Force redraw
                this.faceDetector.ensureVideoDisplay?.();
            },
            'captureImage': () => {
                this.captureFromCamera();
            },

            'captureFromVideo': () => {
                this.captureFromVideoPlayer();
            }
        };

        for (const [id, handler] of Object.entries(elements)) {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('click', handler);
                console.log(`✅ Event listener added for ${id}`);
            } else {
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

    updateTrackingStats(trackedFaces) {
        if (!this.isTracking) return;

        try {
            let currentFaceCount = 0;

            // Đếm số khuôn mặt đang được track
            if (trackedFaces && trackedFaces.length > 0) {
                currentFaceCount = trackedFaces.filter(face =>
                    face.confidence >= 0.5 && face.isTracked
                ).length;
            }

            // CẬP NHẬT SỐ LIỆU QUAN TRỌNG
            if (currentFaceCount > 0) {
                this.totalFacesCount += currentFaceCount;

                console.log(`📊 UpdateTrackingStats: 
                Current: ${currentFaceCount} faces
                Total: ${this.totalFacesCount}
                Tracked: ${trackedFaces.length}
            `);
            }

            // GỌI CALLBACKS ĐỂ CẬP NHẬT UI
            if (this.onFaceCountUpdate) {
                this.onFaceCountUpdate(currentFaceCount);
            }

            if (this.onTotalFacesUpdate) {
                this.onTotalFacesUpdate(this.totalFacesCount);
            }

            // Cập nhật thời gian tracking
            if (this.onTrackingTimeUpdate && this.startTime) {
                const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
                this.onTrackingTimeUpdate(elapsedSeconds);
            }

        } catch (error) {
            console.error('❌ Error updating tracking stats:', error);
        }
    }

    async startTracking() {
        try {
            console.log('🎬 Starting tracking...');

            // Reset UI trước khi bắt đầu
            document.getElementById('currentFaces').textContent = '0';
            document.getElementById('totalFaces').textContent = '0';
            document.getElementById('trackingTime').textContent = '0s';

            // Hiển thị trạng thái recording
            const recordingStatus = document.getElementById('recordingStatus');
            if (recordingStatus) {
                recordingStatus.style.display = 'flex';
            }

            // Bắt đầu tracking trước
            this.faceDetector.startTracking();
            console.log('✅ Face detector tracking started');

            // Cập nhật nút bấm
            document.getElementById('startTracking').disabled = true;
            document.getElementById('stopTracking').disabled = false;
            document.getElementById('startCamera').disabled = true;
            document.getElementById('stopCamera').disabled = true;

            // Sau đó bắt đầu recording
            if (this.faceDetector.video) {
                await this.videoManager.startRecording(this.faceDetector.video);
                console.log('✅ Video recording started');
            } else {
                console.warn('⚠️ Video element not available for recording');
            }

            // Kiểm tra ngay lập tức xem callbacks có hoạt động không
            setTimeout(() => {
                console.log('🔍 Checking callbacks after 1 second:');
                console.log('- onFaceCountUpdate:', typeof this.faceDetector.onFaceCountUpdate);
                console.log('- onTotalFacesUpdate:', typeof this.faceDetector.onTotalFacesUpdate);
                console.log('- Current tracking state:', this.faceDetector.isTracking);
            }, 1000);

        } catch (error) {
            console.error('❌ Error starting tracking/recording:', error);
            alert('Lỗi khi bắt đầu ghi hình: ' + error.message);
        }
    }

    async stopTracking() {
        try {
            console.log('⏸️ Stopping tracking in app...');

            // Dừng tracking trong faceDetector (vẫn giữ camera chạy)
            this.faceDetector.stopTracking();
            console.log('✅ Face detector tracking stopped');

            // Dừng recording video
            const videoData = await this.videoManager.stopRecording();
            console.log('✅ Video recording stopped:', videoData);

            // Ẩn trạng thái recording
            const recordingStatus = document.getElementById('recordingStatus');
            if (recordingStatus) {
                recordingStatus.style.display = 'none';
            }

            // Cập nhật nút bấm
            document.getElementById('startTracking').disabled = false;
            document.getElementById('stopTracking').disabled = true;
            document.getElementById('startCamera').disabled = false;
            document.getElementById('stopCamera').disabled = false;

            if (videoData && videoData.filename) {
                await this.saveSessionData(videoData);
                console.log('✅ Session data saved with video');
            } else {
                await this.saveSessionData({ filename: null });
                console.log('⚠️ Session data saved without video');
            }

            // HIỂN THỊ THÔNG BÁO
            this.showNotification('⏸️ Đã dừng thống kê. Camera vẫn đang chạy.', 'info');

        } catch (error) {
            console.error('❌ Error stopping tracking/recording:', error);
            await this.saveSessionData({ filename: null });
            this.showNotification('❌ Lỗi khi dừng thống kê', 'error');
        }
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

    // Thêm vào class FaceDetectionApp
    debugCallbacks() {
        console.log('🔍 DEBUG CALLBACKS:');
        console.log('- faceDetector.onFaceCountUpdate:', this.faceDetector?.onFaceCountUpdate ? 'SET' : 'NOT SET');
        console.log('- faceDetector.onTotalFacesUpdate:', this.faceDetector?.onTotalFacesUpdate ? 'SET' : 'NOT SET');
        console.log('- faceDetector.onTrackingTimeUpdate:', this.faceDetector?.onTrackingTimeUpdate ? 'SET' : 'NOT SET');

        console.log('- faceDetector.isTracking:', this.faceDetector?.isTracking);
        console.log('- faceDetector.totalFacesCount:', this.faceDetector?.totalFacesCount);

        // Test gọi callback thủ công
        if (this.faceDetector?.onFaceCountUpdate) {
            console.log('🧪 Testing callback manually...');
            this.faceDetector.onFaceCountUpdate(5);
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
            const response = await fetch('/api/sessions');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const sessions = await response.json();

            const videoList = document.getElementById('videoList');
            videoList.innerHTML = '';

            if (Array.isArray(sessions) && sessions.length > 0) {
                sessions.forEach(session => {
                    const videoItem = this.createVideoItem(session);
                    videoList.appendChild(videoItem);
                });
            } else {
                videoList.innerHTML = '<div class="video-item">No sessions found</div>';
            }
        } catch (error) {
            console.error('Error loading video history:', error);
            const videoList = document.getElementById('videoList');
            videoList.innerHTML = `<div class="video-item">Error loading sessions: ${error.message}</div>`;
        }
    }

    createVideoItem(session) {
        const div = document.createElement('div');
        div.className = 'video-item';

        const hasVideo = session.video_filename && session.video_filename !== 'null';
        const duration = this.formatDuration(session.duration || 0);

        div.innerHTML = `
        <div class="video-item-header">
            <div class="video-title">
                <span class="session-status ${hasVideo ? 'status-recorded' : 'status-no-video'}"></span>
                Session ${session.id ? session.id.substring(0, 8) : 'N/A'}...
            </div>
            <div class="video-actions">
                <button class="delete-btn" data-session-id="${session.id}">
                    🗑️ Xóa
                </button>
            </div>
        </div>
        <div class="video-stats">
            <div class="stat">
                <span class="stat-label">THỜI GIAN:</span>
                <span class="stat-value">${duration}</span>
            </div>
            <div class="stat">
                <span class="stat-label">TỔNG KHUÔN MẶT:</span>
                <span class="stat-value">${session.total_faces || 0}</span>
            </div>
            <div class="stat">
                <span class="stat-label">NGÀY:</span>
                <span class="stat-value">${new Date(session.start_time).toLocaleDateString('vi-VN')}</span>
            </div>
            <div class="stat">
                <span class="stat-label">BẮT ĐẦU:</span>
                <span class="stat-value">${new Date(session.start_time).toLocaleTimeString('vi-VN')}</span>
            </div>
            <div class="stat">
                <span class="stat-label">KẾT THÚC:</span>
                <span class="stat-value">${new Date(session.end_time).toLocaleTimeString('vi-VN')}</span>
            </div>
        </div>
        ${!hasVideo ? '<div style="margin-top: 8px; font-size: 12px; color: #ffc107;">📹 Không có video</div>' : ''}
    `;

        div.addEventListener('click', (event) => {
            if (!event.target.closest('.delete-btn')) {
                this.playVideo(session, event);
            }
        });

        const deleteBtn = div.querySelector('.delete-btn');
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

    formatDuration(seconds) {
        if (!seconds || seconds === 0) return '0s';

        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;

        if (mins === 0) {
            return `${secs}s`;
        } else if (secs === 0) {
            return `${mins}m`;
        } else {
            return `${mins}m ${secs}s`;
        }
    }

    async playVideo(session, event) {
        try {
            const videoPlayer = document.getElementById('playbackVideo');
            const videoInfo = document.getElementById('videoInfo');

            // QUAN TRỌNG: Cập nhật currentSessionId và load ảnh
            this.currentSessionId = session.id;

            // Enable nút chụp từ video
            const captureBtn = document.getElementById('captureFromVideo');
            if (captureBtn) {
                captureBtn.disabled = false;
            }

            // Load ảnh của session này
            this.loadSessionCapturedImages(session.id);

            document.querySelectorAll('.video-item').forEach(item => {
                item.classList.remove('active');
            });
            if (event && event.currentTarget) {
                event.currentTarget.classList.add('active');
            }

            console.log('🎬 Playing video for session:', session.id);

            if (session.video_filename && session.video_filename !== 'null') {
                videoPlayer.src = session.video_filename;
                videoPlayer.style.display = 'block';

                videoPlayer.onerror = () => {
                    console.error('❌ Video playback failed');
                    videoInfo.innerHTML = `
                    <div class="no-video-selected">
                        <div class="icon">❌</div>
                        <div>
                            <h4>Lỗi phát video</h4>
                            <p>Không thể phát video từ URL: ${session.video_filename}</p>
                            <a href="${session.video_filename}" target="_blank" style="color: #007bff;">Thử mở video trong tab mới</a>
                        </div>
                    </div>
                `;
                };

                videoInfo.innerHTML = `
                <div class="info-item">
                    <span class="info-label">Session ID:</span>
                    <span class="info-value">${session.id || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Thời gian bắt đầu:</span>
                    <span class="info-value">${new Date(session.start_time).toLocaleString('vi-VN')}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Thời gian kết thúc:</span>
                    <span class="info-value">${new Date(session.end_time).toLocaleString('vi-VN')}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Tổng khuôn mặt:</span>
                    <span class="info-value">${session.total_faces || 0}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Thời lượng:</span>
                    <span class="info-value">${this.formatDuration(session.duration || 0)}</span>
                </div>
                <div class="info-item" style="border-bottom: none; margin-bottom: 0; padding-bottom: 0;">
                    <span class="info-label">Trạng thái:</span>
                    <span class="info-value" style="color: #28a745;">✅ Video có sẵn</span>
                </div>
                <div style="margin-top: 15px;">
                    <a href="${session.video_filename}" target="_blank" style="color: #007bff; text-decoration: underline;">
                        📹 Mở video trong tab mới
                    </a>
                </div>
            `;
            } else {
                videoPlayer.style.display = 'none';
                videoInfo.innerHTML = `
                <div class="no-video-selected">
                    <div class="icon">⚠️</div>
                    <div>
                        <h4>Không có video cho session này</h4>
                        <p>Session không có file video đi kèm.</p>
                        <div style="margin-top: 20px; text-align: left;">
                            <div class="info-item">
                                <span class="info-label">Session ID:</span>
                                <span class="info-value">${session.id || 'N/A'}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Thời gian:</span>
                                <span class="info-value">${new Date(session.start_time).toLocaleString('vi-VN')}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Tổng khuôn mặt:</span>
                                <span class="info-value">${session.total_faces || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            }
        } catch (error) {
            console.error('Error playing video:', error);
            const videoInfo = document.getElementById('videoInfo');
            videoInfo.innerHTML = `
            <div class="no-video-selected">
                <div class="icon">❌</div>
                <div>
                    <h4>Lỗi tải video</h4>
                    <p>Không thể tải video: ${error.message}</p>
                </div>
            </div>
        `;
        }
    }

    async saveSessionData(videoData) {
        try {
            const sessionData = {
                id: this.faceDetector.sessionId,
                start_time: new Date(this.faceDetector.startTime).toISOString(),
                end_time: new Date().toISOString(),
                total_faces: this.faceDetector.totalFacesCount,
                duration: Math.floor((Date.now() - this.faceDetector.startTime) / 1000),
                video_filename: videoData?.filename || null
            };

            console.log('💾 Saving session data:', sessionData);

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
            this.loadVideoHistory();

        } catch (error) {
            console.error('❌ Error saving session data:', error);
        }
    }
}