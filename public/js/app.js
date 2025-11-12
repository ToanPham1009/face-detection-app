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
    }

    initialize() {
        console.log('🎯 Starting app initialization...');

        // CẬP NHẬT: Xóa 'webcamVideo' khỏi required elements
        const requiredElements = [
            'startCamera', 'stopCamera', 'startTracking', 'stopTracking',
            'faceCanvas', 'currentFaces', 'totalFaces', 'trackingTime'
        ];

        const missingElements = requiredElements.filter(id => !document.getElementById(id));

        if (missingElements.length > 0) {
            console.error('❌ Missing required DOM elements:', missingElements);
            // Thử lại sau 1 giây
            setTimeout(() => this.initialize(), 1000);
            return;
        }

        console.log('✅ All DOM elements found');

        // Khởi tạo FaceDetector
        this.faceDetector = new FaceDetector();

        // Setup event listeners
        this.setupEventListeners();

        // Setup face detector callbacks
        this.setupFaceDetectorCallbacks();

        // Setup tab switching
        this.setupTabSwitching();

        console.log('✅ FaceDetectionApp initialized successfully');
    }

    setupEventListeners() {
        console.log('🔗 Setting up event listeners...');

        // CẬP NHẬT: Sử dụng các hàm mới đã được định nghĩa
        const elements = {
            'startCamera': () => this.faceDetector.startCamera(),
            'stopCamera': () => this.faceDetector.stopCamera(),
            'startTracking': () => this.startTracking(), // Sửa: gọi this.startTracking()
            'stopTracking': () => this.stopTracking()    // Sửa: gọi this.stopTracking()
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

    // Hàm mới: Bắt đầu tracking và recording
    async startTracking() {
        try {
            // Bắt đầu face detection
            this.faceDetector.startTracking();
            
            // Bắt đầu recording video - sử dụng video element ẩn từ FaceDetector
            if (this.faceDetector.video) {
                await this.videoManager.startRecording(this.faceDetector.video);
                console.log('✅ Video recording started');
            } else {
                console.warn('⚠️ Video element not available for recording');
            }
            
        } catch (error) {
            console.error('❌ Error starting tracking/recording:', error);
            alert('Lỗi khi bắt đầu ghi hình: ' + error.message);
        }
    }

    // Hàm mới: Dừng tracking và recording
    async stopTracking() {
        try {
            // Dừng face detection
            this.faceDetector.stopTracking();
            
            // Dừng recording và lưu video
            const videoData = await this.videoManager.stopRecording();
            console.log('✅ Video recording stopped:', videoData);
            
            // Lưu session data
            if (videoData && videoData.filename) {
                await this.saveSessionData(videoData);
                console.log('✅ Session data saved with video');
            } else {
                await this.saveSessionData({ filename: null });
                console.log('⚠️ Session data saved without video');
            }
            
        } catch (error) {
            console.error('❌ Error stopping tracking/recording:', error);
            // Vẫn lưu session data ngay cả khi có lỗi video
            await this.saveSessionData({ filename: null });
        }
    }

    setupFaceDetectorCallbacks() {
        this.faceDetector.onFaceCountUpdate = (count) => {
            const element = document.getElementById('currentFaces');
            if (element) element.textContent = count;
        };

        this.faceDetector.onTotalFacesUpdate = (count) => {
            const element = document.getElementById('totalFaces');
            if (element) element.textContent = count;
        };

        this.faceDetector.onTrackingTimeUpdate = (time) => {
            const element = document.getElementById('trackingTime');
            if (element) element.textContent = time + 's';
        };
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
        // Ẩn tất cả tab content
        const tabContents = document.querySelectorAll('.tab-content');
        tabContents.forEach(tab => tab.classList.remove('active'));

        // Bỏ active tất cả tab buttons
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => button.classList.remove('active'));

        // Hiển thị tab được chọn
        const selectedTab = document.getElementById(`${tabName}-tab`);
        const selectedButton = document.querySelector(`[data-tab="${tabName}"]`);

        if (selectedTab) selectedTab.classList.add('active');
        if (selectedButton) selectedButton.classList.add('active');

        // Nếu chuyển sang tab history, load dữ liệu
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
            <div class="video-date">${new Date(session.start_time).toLocaleDateString()}</div>
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
                <span class="stat-label">BẮT ĐẦU:</span>
                <span class="stat-value">${new Date(session.start_time).toLocaleTimeString()}</span>
            </div>
            <div class="stat">
                <span class="stat-label">KẾT THÚC:</span>
                <span class="stat-value">${new Date(session.end_time).toLocaleTimeString()}</span>
            </div>
        </div>
        ${!hasVideo ? '<div style="margin-top: 8px; font-size: 12px; color: #ffc107;">📹 Không có video</div>' : ''}
    `;

        div.addEventListener('click', (event) => {
            this.playVideo(session, event);
        });

        return div;
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

            // Update active video item
            document.querySelectorAll('.video-item').forEach(item => {
                item.classList.remove('active');
            });
            if (event && event.currentTarget) {
                event.currentTarget.classList.add('active');
            }

            console.log('🎬 Playing video for session:', session.id);

            // Load video if available
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

            // Reload video history
            this.loadVideoHistory();

        } catch (error) {
            console.error('❌ Error saving session data:', error);
        }
    }
}

