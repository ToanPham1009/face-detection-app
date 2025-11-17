// Face detection functionality
class FaceDetector {
    constructor() {
        this.canvas = document.getElementById('faceCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.model = null;
        this.stream = null;
        this.isTracking = false;
        this.trackingInterval = null;
        this.sessionId = null;
        this.startTime = null;
        this.totalFacesCount = 0;
        this.uniqueFaces = new Set();
        this.faceTracker = new FaceTracker();

        // Thêm biến để theo dõi lưu theo phút
        this.minuteIntervals = [];
        this.lastMinuteSave = 0;
        this.minuteFaceCounts = new Map();

        this.onFaceCountUpdate = null;
        this.onTotalFacesUpdate = null;
        this.onTrackingTimeUpdate = null;

        // Tạo video element ẩn để lấy stream
        this.video = document.createElement('video');
        this.video.playsInline = true;
        this.video.muted = true;
        this.video.style.display = 'none';

        // Thêm biến để vẽ video ngay cả khi không tracking
        this.isCameraOn = false;
        this.videoDrawInterval = null;

        // 🆕 THÊM CÁC BIẾN CHO DETECTION LOOP
        this.isDetectionRunning = false;
        this.lastDetectionTime = 0;
        this.detectionFrameRate = 15;
        this.minDetectionInterval = 1000 / this.detectionFrameRate;

        this.loadFaceDetectionModel();
    }

    initializeDOMElements() {
        const maxRetries = 5;
        let retries = 0;

        const initElements = () => {
            this.video = document.getElementById('webcamVideo');
            this.canvas = document.getElementById('faceCanvas');

            if (this.video && this.canvas) {
                this.ctx = this.canvas.getContext('2d');
                console.log('✅ DOM elements initialized successfully');
                return true;
            } else {
                retries++;
                if (retries < maxRetries) {
                    console.warn(`⚠️ Retrying DOM elements initialization... (${retries}/${maxRetries})`);
                    setTimeout(initElements, 500);
                } else {
                    console.error('❌ Failed to initialize DOM elements after retries');
                    return false;
                }
            }
        };

        // Bắt đầu khởi tạo
        setTimeout(initElements, 100);
    }

    async loadFaceDetectionModel() {
        try {
            this.model = await blazeface.load();
            console.log('Face detection model loaded');
        } catch (error) {
            console.error('Error loading face detection model:', error);
        }
    }

    async startCamera() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                }
            });

            this.video.srcObject = this.stream;

            this.video.addEventListener('loadedmetadata', () => {
                this.initializeCanvas();
                this.video.play(); // Bắt đầu play video

                // 🆕 BẮT ĐẦU VẼ VIDEO FRAME NGAY KHI CAMERA BẬT
                this.startVideoDrawing();
                // 🆕 BẮT ĐẦU DETECTION LOOP KHI CAMERA BẬT
                this.startDetectionLoop();

            });

            this.isCameraOn = true;
            this.updateButtonStates();
            console.log('Camera started');
        } catch (error) {
            console.error('Error accessing camera:', error);
            alert('Không thể truy cập camera. Vui lòng kiểm tra quyền truy cập.');
        }
    }

    // Khởi tạo canvas với kích thước video
    initializeCanvas() {
        if (this.video.videoWidth > 0 && this.video.videoHeight > 0) {
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;

            // Áp dụng mirror effect cho front camera
            this.ctx.translate(this.canvas.width, 0);
            this.ctx.scale(-1, 1);

            this.canvasInitialized = true;
            console.log('✅ Canvas initialized with dimensions:', this.canvas.width, 'x', this.canvas.height);
        }
    }

    // Hàm khởi tạo canvas dimensions
    initializeCanvasDimensions() {
        if (this.video && this.video.videoWidth > 0 && this.video.videoHeight > 0) {
            this.videoWidth = this.video.videoWidth;
            this.videoHeight = this.video.videoHeight;

            // Đặt kích thước canvas khớp với video
            this.canvas.width = this.videoWidth;
            this.canvas.height = this.videoHeight;

            // Đặt style cho canvas để phủ lên video
            this.canvas.style.position = 'absolute';
            this.canvas.style.top = '0';
            this.canvas.style.left = '0';
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';

            this.canvasInitialized = true;
            console.log('✅ Canvas initialized with dimensions:', this.videoWidth, 'x', this.videoHeight);
        }
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
            this.video.srcObject = null;

            if (this.isTracking) {
                this.stopTracking();
            }

            // 🆕 DỪNG VIDEO DRAWING NHƯNG KHÔNG DỪNG DETECTION LOOP
            this.stopVideoDrawing();

            // Clear canvas
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            // Reset transform
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);

            this.isCameraOn = false;
            this.isDetectionRunning = false; // Dừng detection loop khi tắt camera
            this.updateButtonStates();
            console.log('Camera stopped');
        }
    }

    // 🆕 HÀM MỚI: Bắt đầu vẽ video frame
    startVideoDrawing() {
        if (this.videoDrawInterval) {
            clearInterval(this.videoDrawInterval);
        }

        // Vẽ video frame với tốc độ 30 FPS
        this.videoDrawInterval = setInterval(() => {
            this.drawVideoFrame(); // Chỉ vẽ video, không detection
        }, 1000 / 30); // 30 FPS
    }

    // 🆕 HÀM MỚI: Dừng vẽ video frame
    stopVideoDrawing() {
        if (this.videoDrawInterval) {
            clearInterval(this.videoDrawInterval);
            this.videoDrawInterval = null;
        }
    }

    // 🆕 THÊM HÀM startDetectionLoop
    // 🆕 HÀM MỚI: Bắt đầu detection loop
    startDetectionLoop() {
        if (this.isDetectionRunning) return;

        this.isDetectionRunning = true;
        this.lastDetectionTime = 0;

        const detectionLoop = async () => {
            if (!this.isCameraOn || !this.isDetectionRunning) {
                this.isDetectionRunning = false;
                return;
            }

            const currentTime = Date.now();
            // Chỉ chạy detection nếu đã đủ thời gian giữa các frame
            if (currentTime - this.lastDetectionTime >= this.minDetectionInterval) {
                this.lastDetectionTime = currentTime;
                try {
                    await this.detectFaces();
                } catch (error) {
                    console.error('Error in detection loop:', error);
                    this.isDetectionRunning = false;
                    return;
                }
            }

            // Tiếp tục loop khi camera đang bật
            if (this.isCameraOn && this.isDetectionRunning) {
                requestAnimationFrame(detectionLoop);
            } else {
                this.isDetectionRunning = false;
            }
        };

        // Bắt đầu loop
        requestAnimationFrame(detectionLoop);
    }

    // 🆕 THÊM HÀM drawVideoFrame cho detection mode
    drawVideoFrame() {
        if (this.video.videoWidth === 0 || this.video.videoHeight === 0) return;

        try {
            // Clear canvas trước khi vẽ
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            // Vẽ video frame
            this.ctx.drawImage(
                this.video,
                0, 0,
                this.canvas.width,
                this.canvas.height
            );
        } catch (error) {
            console.error('Error drawing video frame:', error);
        }
    }

    startTracking() {
        if (!this.model) {
            alert('Mô hình nhận diện khuôn mặt chưa sẵn sàng. Vui lòng đợi...');
            return;
        }

        if (!this.stream) {
            alert('Camera chưa được bật. Vui lòng bật camera trước.');
            return;
        }

        this.isTracking = true;
        this.sessionId = Date.now().toString();
        this.startTime = Date.now();
        this.totalFacesCount = 0;
        this.uniqueFaces.clear();
        this.faceTracker.reset();

        // Reset biến theo dõi phút
        this.minuteIntervals = [];
        this.lastMinuteSave = 0;
        this.minuteFaceCounts.clear();

        // Show recording status
        const recordingStatus = document.getElementById('recordingStatus');
        if (recordingStatus) {
            recordingStatus.classList.add('active');
        }

        // 🆕 KHÔNG cần dừng/khởi động lại detection loop
        // Detection loop đã chạy từ khi bật camera

        // Update tracking time và kiểm tra lưu theo phút
        this.timeInterval = setInterval(() => {
            if (this.isTracking && this.onTrackingTimeUpdate) {
                const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
                this.onTrackingTimeUpdate(elapsedSeconds);

                this.checkAndSaveMinuteData(elapsedSeconds);
            }
        }, 1000);

        this.updateButtonStates();
        console.log('Face tracking started');
    }

    // Hàm mới: Kiểm tra và lưu dữ liệu theo phút
    checkAndSaveMinuteData(elapsedSeconds) {
        const currentMinute = Math.floor(elapsedSeconds / 60);

        // Nếu đã qua 1 phút mới so với lần lưu cuối
        if (currentMinute > this.lastMinuteSave) {
            this.saveCurrentMinuteData();
            this.lastMinuteSave = currentMinute;
        }
    }

    // Hàm mới: Lưu dữ liệu của phút hiện tại
    saveCurrentMinuteData() {
        const minuteStart = this.startTime + (this.lastMinuteSave * 60 * 1000);
        const minuteEnd = this.startTime + ((this.lastMinuteSave + 1) * 60 * 1000);
        const currentTime = Date.now();

        // Đảm bảo không lưu khoảng thời gian trong tương lai
        const actualEnd = Math.min(minuteEnd, currentTime);

        // Tính số khuôn mặt trong phút này
        const minuteFaces = this.calculateMinuteFaces();

        const minuteData = {
            session_id: this.sessionId,
            start_time: new Date(minuteStart).toISOString(),
            end_time: new Date(actualEnd).toISOString(),
            face_count: minuteFaces,
            minute_number: this.lastMinuteSave + 1
        };

        console.log(`Saving minute ${minuteData.minute_number} data:`, minuteData);

        // Lưu vào local trước
        this.minuteIntervals.push(minuteData);

        // Gửi lên server
        this.sendMinuteDataToServer(minuteData);

        // Reset đếm cho phút tiếp theo
        this.minuteFaceCounts.clear();
    }

    // Hàm mới: Tính số khuôn mặt trong phút hiện tại
    calculateMinuteFaces() {
        // Đếm số khuôn mặt duy nhất trong phút này
        const currentMinuteFaces = new Set();

        // Lấy tất cả khuôn mặt đã được theo dõi trong phút này
        const trackedFaces = this.faceTracker.getCurrentFaces();
        trackedFaces.forEach(face => {
            if (face.isTracked) {
                currentMinuteFaces.add(face.id);
            }
        });

        return currentMinuteFaces.size;
    }

    // Hàm mới: Gửi dữ liệu phút lên server
    async sendMinuteDataToServer(minuteData) {
        try {
            const response = await fetch('/api/minutes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(minuteData)
            });

            if (!response.ok) {
                console.warn(`Minute ${minuteData.minute_number} data not saved to server`);
                return;
            }

            const result = await response.json();
            console.log(`Minute ${minuteData.minute_number} data saved successfully:`, result);
        } catch (error) {
            console.warn(`Error saving minute ${minuteData.minute_number} data:`, error.message);
        }
    }

    stopTracking() {
        if (!this.isTracking) return;

        this.isTracking = false;

        // Lưu dữ liệu phút cuối cùng
        const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
        const currentMinute = Math.floor(elapsedSeconds / 60);

        if (currentMinute >= this.lastMinuteSave) {
            this.saveCurrentMinuteData();
        }

        this.saveFinalMinuteData(elapsedSeconds);

        // Hide recording status
        const recordingStatus = document.getElementById('recordingStatus');
        if (recordingStatus) {
            recordingStatus.classList.remove('active');
        }

        // Dọn dẹp intervals (chỉ intervals liên quan đến tracking thời gian)
        if (this.timeInterval) {
            clearInterval(this.timeInterval);
            this.timeInterval = null;
        }

        // 🆕 KHÔNG dừng detection loop, chỉ dừng tracking thống kê
        // Detection vẫn tiếp tục chạy, vẫn vẽ khung khuôn mặt

        // Reset các biến thống kê về 0 để hiển thị
        if (this.onFaceCountUpdate) {
            this.onFaceCountUpdate(0);
        }
        if (this.onTotalFacesUpdate) {
            this.onTotalFacesUpdate(0);
        }
        if (this.onTrackingTimeUpdate) {
            this.onTrackingTimeUpdate(0);
        }

        this.updateButtonStates();
        console.log('Face tracking stopped (detection continues)');
    }

    // Hàm mới: Lưu dữ liệu tổng thể khi kết thúc
    saveFinalMinuteData(elapsedSeconds) {
        const finalData = {
            session_id: this.sessionId,
            start_time: new Date(this.startTime).toISOString(),
            end_time: new Date().toISOString(),
            face_count: this.totalFacesCount,
            duration: elapsedSeconds,
            total_minutes: this.minuteIntervals.length
        };

        console.log('Final tracking data:', finalData);
    }

    async detectFaces() {
        // Cho phép detection ngay cả khi không tracking
        if (!this.model || !this.stream) return;

        try {
            // 🆕 ĐẢM BẢO VIDEO LUÔN HIỂN THỊ
            this.ensureVideoDisplay();

            // Kiểm tra video đã sẵn sàng chưa
            if (this.video.videoWidth === 0 || this.video.videoHeight === 0) {
                return;
            }

            // Khởi tạo canvas dimensions nếu chưa
            if (!this.canvasInitialized) {
                this.initializeCanvas();
            }

            // VẼ VIDEO FRAME (luôn vẽ dù có tracking hay không)
            this.drawVideoFrame();

            const predictions = await this.model.estimateFaces(this.video, false);

            // Chuẩn bị faces data cho tracker
            const facesData = predictions.map(pred => {
                const start = pred.topLeft;
                const end = pred.bottomRight;
                const centerX = (start[0] + end[0]) / 2;
                const centerY = (start[1] + end[1]) / 2;
                const width = end[0] - start[0];
                const height = end[1] - start[1];

                return {
                    x: centerX,
                    y: centerY,
                    width: width,
                    height: height,
                    landmarks: pred.landmarks,
                    boundingBox: { start, end },
                    confidence: pred.probability ? pred.probability[0] : 1.0
                };
            });

            // LUÔN cập nhật face tracker để vẽ khung chính xác
            const trackedFaces = this.faceTracker.update(facesData);

            if (predictions.length > 0) {
                // Chỉ update thống kê nếu đang tracking
                if (this.isTracking) {
                    if (this.onFaceCountUpdate) {
                        this.onFaceCountUpdate(predictions.length);
                    }

                    // Track unique faces chỉ khi đang tracking
                    const newFacesCount = this.trackUniqueFaces(trackedFaces);

                    if (newFacesCount > 0 && this.onTotalFacesUpdate) {
                        this.onTotalFacesUpdate(this.totalFacesCount);
                    }
                }

                // VẼ KHUNG KHUÔN MẶT (luôn vẽ dù có tracking hay không)
                this.drawFaceDetections(predictions, trackedFaces);
            } else {
                // Chỉ update thống kê nếu đang tracking
                if (this.isTracking && this.onFaceCountUpdate) {
                    this.onFaceCountUpdate(0);
                }

                // Vẽ thông tin khi không có khuôn mặt
                this.drawNoFacesInfo();
            }

            // Vẽ thông tin trạng thái
            this.drawStatusInfo();

        } catch (error) {
            console.error('Error detecting faces:', error);
        }
    }

    // 🆕 Đảm bảo video luôn hiển thị
    ensureVideoDisplay() {
        if (this.video && this.video.srcObject && this.video.paused) {
            this.video.play().catch(e => {
                console.warn('Video play failed, retrying...', e);
                setTimeout(() => {
                    if (this.video && this.video.srcObject) {
                        this.video.play();
                    }
                }, 100);
            });
        }
    }

    drawStatusInfo() {
        // Vẽ background cho text
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(10, 10, 200, 80);

        // Text information
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'left';

        if (this.isTracking) {
            this.ctx.fillText('🎭 Face Tracking', 20, 30);
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`Total: ${this.totalFacesCount}`, 20, 50);
            this.ctx.fillText(`Current: ${this.faceTracker.getCurrentFaces().filter(f => f.isTracked).length}`, 20, 70);
            this.ctx.fillText(`Minute: ${this.lastMinuteSave + 1}`, 20, 90);
        } else {
            this.ctx.fillText('📷 Camera Mode', 20, 30);
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`Faces Detected: ${this.faceTracker.getTrackedFacesCount()}`, 20, 50);
            this.ctx.fillText('⏸️ Tracking Paused', 20, 70);
        }
    }

    // Thêm phương thức vẽ thông tin camera khi không tracking
    drawCameraInfo() {
        // Vẽ background cho text
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(10, 10, 200, 60);

        // Text information
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText('📷 Camera Mode', 20, 30);

        this.ctx.font = '12px Arial';
        this.ctx.fillText(`Faces: ${this.faceTracker.getTrackedFacesCount()}`, 20, 50);
        this.ctx.fillText('⏸️ Tracking Paused', 20, 70);
    }

    // Vẽ video frame lên canvas
    drawVideoFrame() {
        if (this.video.videoWidth === 0 || this.video.videoHeight === 0) return;

        try {
            // Clear canvas trước khi vẽ
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            // Vẽ video frame
            this.ctx.drawImage(
                this.video,
                0, 0,
                this.canvas.width,
                this.canvas.height
            );
        } catch (error) {
            console.error('Error drawing video frame:', error);
        }
    }


    // Vẽ thông tin khi không có khuôn mặt
    drawNoFacesInfo() {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('🔍 Đang tìm khuôn mặt...', this.canvas.width / 2, 30);
    }

    // Thuật toán theo dõi khuôn mặt cải tiến
    trackUniqueFaces(trackedFaces) {
        let newFaces = 0;

        // Kiểm tra trackedFaces có tồn tại và là array
        if (!trackedFaces || !Array.isArray(trackedFaces)) {
            return 0;
        }

        trackedFaces.forEach(face => {
            // Kiểm tra face object có tồn tại và có đủ properties
            if (face && face.isNew && face.confidence > 0.8) {
                this.uniqueFaces.add(face.id);
                this.totalFacesCount++;
                newFaces++;
            }
        });

        return newFaces;
    }

    // Vẽ detection boxes và landmarks
    // Vẽ detection boxes và landmarks với trackedFaces
    // Vẽ detection boxes và landmarks với trackedFaces
    drawFaceDetections(predictions, trackedFaces = null) {
        // Nếu không có trackedFaces được truyền vào, lấy từ tracker
        if (!trackedFaces) {
            trackedFaces = this.faceTracker.getCurrentFaces();
        }

        predictions.forEach((prediction) => {
            const start = prediction.topLeft;
            const end = prediction.bottomRight;
            const size = [end[0] - start[0], end[1] - start[1]];
            const centerX = (start[0] + end[0]) / 2;
            const centerY = (start[1] + end[1]) / 2;

            // Tìm faceId từ tracker
            let faceId = null;
            let isTracked = false;

            for (const trackedFace of trackedFaces) {
                const distance = Math.sqrt(
                    Math.pow(centerX - trackedFace.x, 2) +
                    Math.pow(centerY - trackedFace.y, 2)
                );

                if (distance < 50) {
                    faceId = trackedFace.id;
                    isTracked = trackedFace.isTracked;
                    break;
                }
            }

            // Vẽ khung với màu sắc khác nhau
            if (this.isTracking && isTracked) {
                this.ctx.strokeStyle = '#00ff00'; // Xanh lá - đang tracked trong session
                this.ctx.fillStyle = '#00ff00';
                this.ctx.lineWidth = 3;
            } else if (faceId !== null) {
                this.ctx.strokeStyle = '#ffff00'; // Vàng - được detect nhưng không tracking
                this.ctx.fillStyle = '#ffff00';
                this.ctx.lineWidth = 2;
            } else {
                this.ctx.strokeStyle = '#ff0000'; // Đỏ - mới detect
                this.ctx.fillStyle = '#ff0000';
                this.ctx.lineWidth = 2;
            }

            // Vẽ bounding box
            this.ctx.strokeRect(start[0], start[1], size[0], size[1]);

            // Vẽ điểm trung tâm
            this.ctx.fillRect(centerX - 3, centerY - 3, 6, 6);

            // Vẽ ID nếu có
            if (faceId !== null) {
                this.ctx.fillStyle = '#ffffff';
                this.ctx.font = 'bold 14px Arial';
                this.ctx.fillText(`Face ${faceId}`, start[0], start[1] - 8);
            }

            // Vẽ các điểm đánh dấu khuôn mặt (landmarks)
            this.ctx.fillStyle = '#00ffff';
            prediction.landmarks.forEach(landmark => {
                this.ctx.fillRect(landmark[0] - 2, landmark[1] - 2, 4, 4);
            });
        });
    }

    drawTrackingInfo() {
        // Vẽ background cho text
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(10, 10, 200, 80);

        // Text information
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText('🎭 Face Detection', 20, 30);

        this.ctx.font = '12px Arial';
        this.ctx.fillText(`Total: ${this.totalFacesCount}`, 20, 50);
        this.ctx.fillText(`Current: ${this.faceTracker.getCurrentFaces().filter(f => f.isTracked).length}`, 20, 70);
        this.ctx.fillText(`Minute: ${this.lastMinuteSave + 1}`, 20, 90);
    }

    async saveMinuteData(elapsedSeconds) {
        try {
            const minuteData = {
                session_id: this.sessionId,
                start_time: new Date(this.startTime).toISOString(),
                end_time: new Date().toISOString(),
                face_count: this.totalFacesCount
            };

            const response = await fetch('/api/minutes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(minuteData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Error saving minute data:', errorData);
                return;
            }

            console.log('Minute data saved successfully');
        } catch (error) {
            console.error('Error saving minute data:', error);
        }
    }

    updateButtonStates() {
        const hasCamera = !!this.stream;
        const isTracking = this.isTracking;

        const buttons = {
            'startCamera': document.getElementById('startCamera'),
            'stopCamera': document.getElementById('stopCamera'),
            'startTracking': document.getElementById('startTracking'),
            'stopTracking': document.getElementById('stopTracking')
        };

        for (const [id, button] of Object.entries(buttons)) {
            if (button) {
                switch (id) {
                    case 'startCamera':
                        button.disabled = hasCamera;
                        break;
                    case 'stopCamera':
                        button.disabled = !hasCamera;
                        break;
                    case 'startTracking':
                        button.disabled = !hasCamera || isTracking;
                        break;
                    case 'stopTracking':
                        button.disabled = !hasCamera || !isTracking;
                        break;
                }
            }
        }

        // 🆕 Cập nhật text cho stopTracking button để rõ hơn
        const stopTrackingBtn = document.getElementById('stopTracking');
        if (stopTrackingBtn) {
            stopTrackingBtn.textContent = '⏸️ Dừng Thống Kê';
        }
    }
}

// Class theo dõi khuôn mặt chuyên dụng
// Class theo dõi khuôn mặt chuyên dụng - CẢI TIẾN
class FaceTracker {
    constructor() {
        this.faces = new Map();
        this.nextId = 1;
        this.maxFramesLost = 30; // Tăng thời gian mất tích lên 30 frames
        this.trackingThreshold = 0.4; // Giảm ngưỡng tracking để dễ matching hơn
        this.smoothingFactor = 0.2; // Thêm smoothing để giảm jitter
    }

    reset() {
        this.faces.clear();
        this.nextId = 1;
    }

    update(currentFaces) {
        // Đánh dấu tất cả faces là không được nhìn thấy
        for (const face of this.faces.values()) {
            face.seen = false;
            face.framesLost++;
        }

        const results = [];

        // CẢI THIỆN matching algorithm với IoU (Intersection over Union)
        for (const currentFace of currentFaces) {
            let bestMatch = null;
            let bestScore = 0;

            for (const [id, knownFace] of this.faces.entries()) {
                if (knownFace.seen) continue;

                // Tính toán IoU score thay vì chỉ khoảng cách
                const iouScore = this.calculateIoU(currentFace, knownFace);

                // Tính khoảng cách giữa centers
                const centerDistance = Math.sqrt(
                    Math.pow(currentFace.x - knownFace.x, 2) +
                    Math.pow(currentFace.y - knownFace.y, 2)
                );

                // Tính similarity về kích thước
                const sizeSimilarity = this.calculateSizeSimilarity(currentFace, knownFace);

                // Tổng hợp score (ưu tiên IoU cao nhất)
                const totalScore = (iouScore * 0.7) +
                    (Math.max(0, 1 - centerDistance / 200) * 0.2) +
                    (sizeSimilarity * 0.1);

                if (totalScore > this.trackingThreshold && totalScore > bestScore) {
                    bestScore = totalScore;
                    bestMatch = knownFace;
                }
            }

            if (bestMatch) {
                // Cập nhật face đã biết với smoothing
                bestMatch.x = this.lerp(bestMatch.x, currentFace.x, this.smoothingFactor);
                bestMatch.y = this.lerp(bestMatch.y, currentFace.y, this.smoothingFactor);
                bestMatch.width = this.lerp(bestMatch.width, currentFace.width, this.smoothingFactor);
                bestMatch.height = this.lerp(bestMatch.height, currentFace.height, this.smoothingFactor);

                bestMatch.seen = true;
                bestMatch.framesLost = 0;
                bestMatch.isTracked = true;
                bestMatch.confidence = currentFace.confidence;
                bestMatch.lastSeen = Date.now();

                results.push({
                    id: bestMatch.id,
                    isNew: false,
                    ...currentFace
                });
            } else {
                // Face mới - chỉ thêm nếu confidence đủ cao và không phải là false positive
                if (currentFace.confidence > 0.7 && this.isValidFace(currentFace)) {
                    const newFace = {
                        id: this.nextId++,
                        x: currentFace.x,
                        y: currentFace.y,
                        width: currentFace.width,
                        height: currentFace.height,
                        seen: true,
                        framesLost: 0,
                        isTracked: true,
                        confidence: currentFace.confidence,
                        firstSeen: Date.now(),
                        lastSeen: Date.now()
                    };

                    this.faces.set(newFace.id, newFace);
                    results.push({
                        id: newFace.id,
                        isNew: true,
                        ...currentFace
                    });
                }
            }
        }

        // Xóa faces đã mất tích quá lâu
        for (const [id, face] of this.faces.entries()) {
            if (face.framesLost > this.maxFramesLost) {
                this.faces.delete(id);
            } else if (!face.seen) {
                face.isTracked = false;
                results.push({
                    id: face.id,
                    isNew: false,
                    x: face.x,
                    y: face.y,
                    width: face.width,
                    height: face.height
                });
            }
        }

        return results;
    }

    // Hàm tính IoU (Intersection over Union)
    calculateIoU(face1, face2) {
        const box1 = this.getBoundingBox(face1);
        const box2 = this.getBoundingBox(face2);

        const x1 = Math.max(box1.left, box2.left);
        const y1 = Math.max(box1.top, box2.top);
        const x2 = Math.min(box1.right, box2.right);
        const y2 = Math.min(box1.bottom, box2.bottom);

        const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
        const area1 = (box1.right - box1.left) * (box1.bottom - box1.top);
        const area2 = (box2.right - box2.left) * (box2.bottom - box2.top);
        const union = area1 + area2 - intersection;

        return union > 0 ? intersection / union : 0;
    }

    // Lấy bounding box từ face data
    getBoundingBox(face) {
        const halfWidth = face.width / 2;
        const halfHeight = face.height / 2;
        return {
            left: face.x - halfWidth,
            top: face.y - halfHeight,
            right: face.x + halfWidth,
            bottom: face.y + halfHeight
        };
    }

    // Tính similarity về kích thước
    calculateSizeSimilarity(face1, face2) {
        const area1 = face1.width * face1.height;
        const area2 = face2.width * face2.height;
        const minArea = Math.min(area1, area2);
        const maxArea = Math.max(area1, area2);
        return minArea / maxArea;
    }

    // Linear interpolation cho smoothing
    lerp(start, end, factor) {
        return start * (1 - factor) + end * factor;
    }

    // Kiểm tra face có hợp lệ không (tránh false positive)
    isValidFace(face) {
        // Kiểm tra kích thước tối thiểu
        const minFaceSize = 20;
        if (face.width < minFaceSize || face.height < minFaceSize) {
            return false;
        }

        // Kiểm tra tỷ lệ khuôn mặt (thường là ~1:1 đến 1:1.5)
        const aspectRatio = face.width / face.height;
        if (aspectRatio < 0.5 || aspectRatio > 2.0) {
            return false;
        }

        return true;
    }

    getCurrentFaces() {
        return Array.from(this.faces.values());
    }

    // Lấy số lượng faces đang được tracked
    getTrackedFacesCount() {
        return Array.from(this.faces.values()).filter(face => face.isTracked).length;
    }
}