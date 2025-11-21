// Face detection functionality với tracking cải tiến
class FaceDetector {
    constructor() {
        this.canvas = document.getElementById('faceCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.faceDetection = null;
        this.isModelLoading = false;
        this.modelsLoaded = false;

        // Giữ nguyên các biến hiện có
        this.stream = null;
        this.isTracking = false;
        this.trackingInterval = null;
        this.sessionId = null;
        this.startTime = null;
        this.totalFacesCount = 0;
        this.uniqueFaces = new Set();
        this.faceTracker = new ImprovedFaceTracker();

        // Biến MediaPipe
        this.lastResults = null;
        this.isDetectionRunning = false;

        // Video element ẩn
        this.video = document.createElement('video');
        this.video.playsInline = true;
        this.video.muted = true;
        this.video.style.display = 'none';

        // THÊM: Khởi tạo callbacks
        this.onFaceCountUpdate = null;
        this.onTotalFacesUpdate = null;
        this.onTrackingTimeUpdate = null;

        // THÊM BIẾN NÀY
        this.minDetectionInterval = 1000 / 15; // 15 FPS
        this.canvasInitialized = false;

        console.log('🎯 FaceDetector constructor completed');

        this.loadMediaPipeModel();
    }

    async loadMediaPipeModel() {
        if (this.isModelLoading) return;

        this.isModelLoading = true;
        try {
            console.log('🔄 Loading MediaPipe Face Detection...');

            this.faceDetection = new FaceDetection({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`;
                }
            });

            // SỬA: Giảm confidence threshold để phát hiện nhiều khuôn mặt hơn
            this.faceDetection.setOptions({
                model: 'short',
                minDetectionConfidence: 0.3  // GIẢM từ 0.5 xuống 0.3
            });

            this.faceDetection.onResults((results) => {
                this.lastResults = results;
                this.handleMediaPipeResults(results);
            });

            this.modelsLoaded = true;
            console.log('✅ MediaPipe Face Detection loaded successfully');
        } catch (error) {
            console.error('❌ Error loading MediaPipe:', error);
            // Fallback để không break ứng dụng
            this.modelsLoaded = true;
        } finally {
            this.isModelLoading = false;
        }
    }

    handleMediaPipeResults(results) {
        if (!this.isDetectionRunning) return;

        try {
            this.ctx.save();

            // 1. Vẽ video frame
            this.drawVideoFrame();

            // 2. Xử lý detections
            const detections = results.detections || [];

            console.log(`🎯 MediaPipe results: ${detections.length} detections`);

            if (detections.length > 0) {
                const facesData = this.formatDetections(detections);
                const trackedFaces = this.faceTracker.update(facesData);
                this.drawMediaPipeDetections(detections, trackedFaces);

                // 3. Cập nhật thống kê
                if (this.isTracking) {
                    this.updateTrackingStats(trackedFaces);
                }
            } else {
                this.drawNoFacesInfo();

                // Cập nhật 0 faces khi không có detection
                if (this.isTracking && this.onFaceCountUpdate) {
                    this.onFaceCountUpdate(0);
                }
            }

            // 4. Vẽ thông tin trạng thái
            this.drawStatusInfo();

            this.ctx.restore();

        } catch (error) {
            console.error('❌ Error handling MediaPipe results:', error);
            this.ctx.restore();
        }
    }

    formatDetections(detections) {
        console.log(`📊 Formatting ${detections.length} detections`);

        return detections.map((det, index) => {
            const bbox = det.boundingBox;
            const start = [bbox.originX, bbox.originY];
            const end = [bbox.originX + bbox.width, bbox.originY + bbox.height];
            const centerX = bbox.originX + bbox.width / 2;
            const centerY = bbox.originY + bbox.height / 2;

            const faceData = {
                x: centerX,
                y: centerY,
                width: bbox.width,
                height: bbox.height,
                landmarks: det.landmarks || [],
                boundingBox: { start, end },
                confidence: det.confidence || 0.9
            };

            console.log(`📝 Formatted face ${index}:`, `(x: ${centerX}, y: ${centerY}, width: ${bbox.width}, height: ${bbox.height})`);
            return faceData;
        });
    }

    drawMediaPipeDetections(detections, trackedFaces) {
        const trackedFaceMap = new Map();
        trackedFaces.forEach(face => {
            trackedFaceMap.set(face.id, face);
        });

        console.log(`🎯 Drawing ${detections.length} detections, ${trackedFaces.length} tracked faces`);

        detections.forEach((detection, index) => {
            const bbox = detection.boundingBox;
            const start = [bbox.originX, bbox.originY];
            const size = [bbox.width, bbox.height];
            const centerX = bbox.originX + bbox.width / 2;
            const centerY = bbox.originY + bbox.height / 2;

            // Tìm face được track - TĂNG NGƯỠNG KHOẢNG CÁCH
            let bestFaceId = null;
            let minDistance = Infinity;

            for (const [faceId, trackedFace] of trackedFaceMap) {
                const distance = Math.sqrt(
                    Math.pow(centerX - trackedFace.x, 2) +
                    Math.pow(centerY - trackedFace.y, 2)
                );

                // SỬA: Tăng ngưỡng khoảng cách lên 150px
                if (distance < 150 && distance < minDistance) {
                    minDistance = distance;
                    bestFaceId = faceId;
                }
            }

            const trackedFace = bestFaceId ? trackedFaceMap.get(bestFaceId) : null;

            // Vẽ bounding box - LUÔN VẼ DÙ CÓ TRACKED HAY KHÔNG
            this.drawStableBoundingBox(start, size, trackedFace);

            // Vẽ landmarks MediaPipe
            this.drawMediaPipeLandmarks(detection.landmarks);
        });
    }

    drawMediaPipeLandmarks(landmarks) {
        if (!landmarks || landmarks.length === 0) return;

        this.ctx.save();
        this.ctx.fillStyle = '#00ffff';
        this.ctx.strokeStyle = '#00ffff';
        this.ctx.lineWidth = 1;

        // Vẽ các điểm landmarks
        landmarks.forEach(landmark => {
            this.ctx.beginPath();
            this.ctx.arc(landmark.x * this.canvas.width, landmark.y * this.canvas.height, 3, 0, 2 * Math.PI);
            this.ctx.fill();
        });

        // Vẽ connections cho landmarks face
        if (landmarks.length >= 6) {
            this.ctx.beginPath();

            // Right eye (0, 1)
            this.ctx.moveTo(landmarks[0].x * this.canvas.width, landmarks[0].y * this.canvas.height);
            this.ctx.lineTo(landmarks[1].x * this.canvas.width, landmarks[1].y * this.canvas.height);

            // Left eye (2, 3)
            this.ctx.moveTo(landmarks[2].x * this.canvas.width, landmarks[2].y * this.canvas.height);
            this.ctx.lineTo(landmarks[3].x * this.canvas.width, landmarks[3].y * this.canvas.height);

            // Nose tip (4)
            this.ctx.moveTo(landmarks[4].x * this.canvas.width - 5, landmarks[4].y * this.canvas.height);
            this.ctx.lineTo(landmarks[4].x * this.canvas.width + 5, landmarks[4].y * this.canvas.height);
            this.ctx.moveTo(landmarks[4].x * this.canvas.width, landmarks[4].y * this.canvas.height - 5);
            this.ctx.lineTo(landmarks[4].x * this.canvas.width, landmarks[4].y * this.canvas.height + 5);

            // Mouth (5)
            this.ctx.moveTo(landmarks[5].x * this.canvas.width - 4, landmarks[5].y * this.canvas.height);
            this.ctx.lineTo(landmarks[5].x * this.canvas.width + 4, landmarks[5].y * this.canvas.height);

            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    // PHƯƠNG THỨC MỚI: Detection loop cho MediaPipe
    startDetectionLoop() {
        if (this.isDetectionRunning) {
            console.log('⚠️ Detection loop already running');
            return;
        }

        this.isDetectionRunning = true;
        this.lastDetectionTime = 0;

        console.log('🔄 Starting MediaPipe detection loop...');

        const detectionLoop = async (timestamp) => {
            if (!this.isCameraOn || !this.isDetectionRunning) {
                console.log('🛑 Stopping detection loop - camera off');
                this.isDetectionRunning = false;
                return;
            }

            const currentTime = Date.now();
            if (currentTime - this.lastDetectionTime >= this.minDetectionInterval) {
                this.lastDetectionTime = currentTime;

                try {
                    // ĐẢM BẢO VIDEO ĐANG PLAY
                    if (this.video.paused) {
                        console.log('▶️ Video paused, attempting to play...');
                        await this.video.play();
                    }

                    // GỌI MEDIAPIPE DETECTION
                    await this.detectWithMediaPipe();

                } catch (error) {
                    console.error('❌ Error in MediaPipe detection:', error);
                }
            }

            // TIẾP TỤC LOOP
            if (this.isCameraOn && this.isDetectionRunning) {
                requestAnimationFrame(detectionLoop);
            } else {
                this.isDetectionRunning = false;
                console.log('🛑 Detection loop stopped');
            }
        };

        // BẮT ĐẦU LOOP
        requestAnimationFrame(detectionLoop);
        console.log('✅ Detection loop started');
    }

    async detectWithMediaPipe() {
        if (!this.faceDetection) {
            console.log('⏳ MediaPipe not ready yet');
            return;
        }

        if (!this.video || this.video.videoWidth === 0) {
            console.log('⏳ Video not ready for detection');
            return;
        }

        try {
            await this.faceDetection.send({ image: this.video });

        } catch (error) {
            console.error('❌ MediaPipe detection error:', error);

            // VẼ THÔNG BÁO LỖI
            this.ctx.fillStyle = '#ff0000';
            this.ctx.font = '14px Arial';
            this.ctx.fillText('MediaPipe Error - Check Console', 20, this.canvas.height - 30);
        }
    }

    // CẬP NHẬT startCamera để dùng MediaPipe
    async startCamera() {
        try {
            console.log('🎯 Starting camera...');

            // Dừng camera trước nếu đang chạy
            if (this.stream) {
                this.stopCamera();
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // LẤY CAMERA STREAM
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user',
                    frameRate: { ideal: 30 }
                },
                audio: false
            });

            console.log('✅ Camera stream obtained');

            // TẠO VIDEO ELEMENT
            if (!this.video || this.video.parentNode === null) {
                this.video = document.createElement('video');
                this.video.playsInline = true;
                this.video.muted = true;
                this.video.style.display = 'none';
                document.body.appendChild(this.video);
                console.log('✅ Video element created');
            }

            this.video.srcObject = this.stream;

            // ĐỢI VIDEO READY
            await new Promise((resolve, reject) => {
                let resolved = false;

                this.video.onloadedmetadata = () => {
                    if (!resolved) {
                        console.log('📹 Video metadata loaded:', this.video.videoWidth, 'x', this.video.videoHeight);
                        resolved = true;
                        resolve();
                    }
                };

                this.video.onloadeddata = () => {
                    if (!resolved) {
                        console.log('📹 Video data loaded');
                        resolved = true;
                        resolve();
                    }
                };

                this.video.onerror = (error) => {
                    console.error('❌ Video error:', error);
                    if (!resolved) {
                        reject(error);
                    }
                };

                // Timeout fallback
                setTimeout(() => {
                    if (!resolved) {
                        console.log('⚠️ Video load timeout, continuing...');
                        resolved = true;
                        resolve();
                    }
                }, 5000);
            });

            // KHỞI TẠO CANVAS
            this.initializeCanvas();

            // BẮT ĐẦU PLAY VIDEO
            try {
                await this.video.play();
                console.log('✅ Video playing successfully');
            } catch (playError) {
                console.error('❌ Video play failed:', playError);
                throw playError;
            }

            this.isCameraOn = true;

            // ĐỢI MEDIAPIPE LOAD
            if (!this.modelsLoaded) {
                console.log('⏳ Waiting for MediaPipe models...');
                let attempts = 0;
                while (!this.modelsLoaded && attempts < 30) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    attempts++;
                }

                if (!this.modelsLoaded) {
                    console.warn('⚠️ MediaPipe models not loaded, continuing without detection');
                } else {
                    console.log('✅ MediaPipe models loaded');
                }
            }

            // BẮT ĐẦU DETECTION LOOP
            this.startDetectionLoop();
            this.updateButtonStates();

            console.log('✅ Camera started successfully with MediaPipe');

        } catch (error) {
            console.error('❌ Error accessing camera:', error);
            alert('Không thể truy cập camera. Vui lòng kiểm tra quyền truy cập.\nError: ' + error.message);

            this.isCameraOn = false;
            this.updateButtonStates();
        }
    }

    drawStableBoundingBox(start, size, trackedFace) {
        this.ctx.save();

        if (this.isTracking && trackedFace && trackedFace.isTracked) {
            this.ctx.strokeStyle = '#00ff00';
            this.ctx.lineWidth = 3;
        } else {
            this.ctx.strokeStyle = '#ffff00';
            this.ctx.lineWidth = 2;
        }

        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = this.ctx.strokeStyle;

        this.ctx.strokeRect(start[0], start[1], size[0], size[1]);

        if (trackedFace) {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.fillText(`Face ${trackedFace.id}`, start[0], start[1] - 8);
        }

        this.ctx.restore();
    }

    drawNoFacesInfo() {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('🔍 Đang tìm khuôn mặt...', this.canvas.width / 2, 30);
    }

    drawStatusInfo() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(10, 10, 220, 80);

        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'left';

        if (this.isTracking) {
            this.ctx.fillText('🎭 Đang Theo Dõi (MediaPipe)', 20, 30);
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`Tổng: ${this.totalFacesCount}`, 20, 50);
            this.ctx.fillText(`Hiện tại: ${this.faceTracker.getTrackedFacesCount()}`, 20, 70);
        } else {
            this.ctx.fillText('📷 Camera (MediaPipe)', 20, 30);
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`Khuôn mặt: ${this.faceTracker.getTrackedFacesCount()}`, 20, 50);
            this.ctx.fillText('⏸️ Tạm dừng thống kê', 20, 70);
        }
    }

    initializeCanvas() {
        if (!this.video || this.video.videoWidth === 0) {
            console.warn('⚠️ Video not ready for canvas initialization, retrying...');
            setTimeout(() => this.initializeCanvas(), 100);
            return;
        }

        try {
            console.log('🎨 Starting canvas initialization...');

            // Đặt kích thước canvas CHÍNH XÁC bằng video
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;

            console.log('📐 Canvas dimensions set:', this.canvas.width, 'x', this.canvas.height);

            // RESET transform trước
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);

            // Mirror effect cho front camera
            this.ctx.translate(this.canvas.width, 0);
            this.ctx.scale(-1, 1);

            this.canvasInitialized = true;

            // Vẽ frame đầu tiên NGAY LẬP TỨC
            this.drawVideoFrame();
            console.log('✅ Canvas initialized and first frame drawn');

        } catch (error) {
            console.error('❌ Canvas initialization error:', error);
        }
    }

    drawVideoFrame() {
        if (!this.video || this.video.videoWidth === 0 || this.video.videoHeight === 0) {
            console.log('⏳ Video not ready for drawing');
            return;
        }

        try {
            // Clear canvas với màu đen trước
            this.ctx.fillStyle = '#000000';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            // Vẽ video frame
            this.ctx.drawImage(
                this.video,
                0, 0,
                this.canvas.width,
                this.canvas.height
            );

        } catch (error) {
            console.error('❌ Error drawing video frame:', error);
        }
    }

    startTracking() {
        if (!this.modelsLoaded) {
            alert('Mô hình MediaPipe chưa sẵn sàng. Vui lòng đợi...');
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

        // Show recording status
        const recordingStatus = document.getElementById('recordingStatus');
        if (recordingStatus) {
            recordingStatus.classList.add('active');
        }

        // Update tracking time
        this.timeInterval = setInterval(() => {
            if (this.isTracking && this.onTrackingTimeUpdate) {
                const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
                this.onTrackingTimeUpdate(elapsedSeconds);
            }
        }, 1000);

        this.updateButtonStates();
        console.log('✅ Face tracking started with MediaPipe');
    }

    stopTracking() {
        if (!this.isTracking) return;

        this.isTracking = false;

        // Hide recording status
        const recordingStatus = document.getElementById('recordingStatus');
        if (recordingStatus) {
            recordingStatus.classList.remove('active');
        }

        if (this.timeInterval) {
            clearInterval(this.timeInterval);
            this.timeInterval = null;
        }

        if (this.onFaceCountUpdate) this.onFaceCountUpdate(0);
        if (this.onTotalFacesUpdate) this.onTotalFacesUpdate(0);
        if (this.onTrackingTimeUpdate) this.onTrackingTimeUpdate(0);

        this.updateButtonStates();
        console.log('⏸️ Face tracking stopped');
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
    }

    stopCamera() {
        console.log('🛑 Stopping camera...');

        // Dừng detection loop trước
        this.isDetectionRunning = false;

        // Dừng MediaPipe detection
        if (this.faceDetection) {
            try {
                this.faceDetection.close();
            } catch (error) {
                console.log('MediaPipe cleanup:', error);
            }
        }

        // Dừng stream camera
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.stop();
            });
            this.stream = null;
        }

        // Clear video
        if (this.video) {
            this.video.srcObject = null;
            this.video.remove();
        }

        // Dừng tracking nếu đang chạy
        if (this.isTracking) {
            this.stopTracking();
        }

        // Clear canvas
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
        }

        this.isCameraOn = false;
        this.updateButtonStates();
        console.log('✅ Camera stopped completely');
    }

    setCallbacks(callbacks) {
        this.onFaceCountUpdate = callbacks.onFaceCountUpdate;
        this.onTotalFacesUpdate = callbacks.onTotalFacesUpdate;
        this.onTrackingTimeUpdate = callbacks.onTrackingTimeUpdate;
        console.log('✅ Callbacks set successfully');
    }

    updateTrackingStats(trackedFaces) {
        if (!this.isTracking) return;

        try {
            const currentFaceCount = trackedFaces.length;

            // Thêm vào unique faces set
            trackedFaces.forEach(face => {
                this.uniqueFaces.add(face.id);
            });

            // Cập nhật tổng số khuôn mặt đếm được
            this.totalFacesCount = Math.max(this.totalFacesCount, this.uniqueFaces.size);

            // Gọi callback để cập nhật UI
            if (this.onFaceCountUpdate) {
                this.onFaceCountUpdate(currentFaceCount);
            }

            if (this.onTotalFacesUpdate) {
                this.onTotalFacesUpdate(this.totalFacesCount);
            }

        } catch (error) {
            console.error('❌ Error updating tracking stats:', error);
        }
    }
}

// CLASS TRACKER CẢI TIẾN - SỬA LỖI FACE TOO SMALL
class ImprovedFaceTracker {
    constructor() {
        this.faces = new Map();
        this.nextId = 1;
        this.maxFramesLost = 45;
        this.trackingThreshold = 0.2; // GIẢM ngưỡng tracking
        this.smoothingFactor = 0.3;
        this.positionHistory = new Map();
    }

    reset() {
        this.faces.clear();
        this.nextId = 1;
        this.positionHistory.clear();
    }

    update(currentFaces) {
        console.log(`🔄 Updating tracker with ${currentFaces.length} current faces`);

        // Đánh dấu tất cả faces là không seen
        for (const face of this.faces.values()) {
            face.seen = false;
            face.framesLost++;
        }

        const results = [];

        // MATCHING với điều kiện dễ dàng hơn
        for (const currentFace of currentFaces) {
            let bestMatch = null;
            let bestScore = 0;

            for (const [id, knownFace] of this.faces.entries()) {
                if (knownFace.seen) continue;

                const iouScore = this.calculateIoU(currentFace, knownFace);
                const centerDistance = this.calculateDistance(currentFace, knownFace);
                const sizeSimilarity = this.calculateSizeSimilarity(currentFace, knownFace);

                // SCORE TỔNG HỢP - GIẢM NGƯỠNG
                const totalScore = (iouScore * 0.4) +
                    (Math.max(0, 1 - centerDistance / 200) * 0.4) +
                    (sizeSimilarity * 0.2);

                // SỬA: Giảm ngưỡng tracking xuống 0.15
                if (totalScore > 0.15 && totalScore > bestScore) {
                    bestScore = totalScore;
                    bestMatch = knownFace;
                }
            }

            if (bestMatch) {
                console.log(`✅ Matched with existing face ${bestMatch.id}`);

                // SMOOTHING MẠNH với lịch sử vị trí
                this.updateFaceWithSmoothing(bestMatch, currentFace);
                bestMatch.seen = true;
                bestMatch.framesLost = 0;
                bestMatch.isTracked = true;
                bestMatch.confidence = currentFace.confidence;
                bestMatch.lastSeen = Date.now();

                results.push({
                    id: bestMatch.id,
                    isNew: false,
                    ...this.getSmoothedPosition(bestMatch)
                });
            } else {
                // Face mới - QUAN TRỌNG: SỬA ĐIỀU KIỆN VALID FACE
                if (this.isValidFace(currentFace)) {
                    console.log(`🆕 Creating new face from detection`);
                    const newFace = this.createNewFace(currentFace);
                    this.faces.set(newFace.id, newFace);

                    this.positionHistory.set(newFace.id, [{
                        x: currentFace.x,
                        y: currentFace.y,
                        width: currentFace.width,
                        height: currentFace.height,
                        timestamp: Date.now()
                    }]);

                    results.push({
                        id: newFace.id,
                        isNew: true,
                        ...currentFace
                    });
                } else {
                    console.log(`❌ Face rejected - confidence: ${currentFace.confidence}, valid: ${this.isValidFace(currentFace)}`);
                }
            }
        }

        // Dọn dẹp faces mất tích
        this.cleanupLostFaces();

        console.log(`📊 Tracker results: ${results.length} faces`);
        return results;
    }

    updateFaceWithSmoothing(knownFace, currentFace) {
        const history = this.positionHistory.get(knownFace.id) || [];
        history.push({
            x: currentFace.x,
            y: currentFace.y,
            width: currentFace.width,
            height: currentFace.height,
            timestamp: Date.now()
        });

        if (history.length > 5) {
            history.shift();
        }
        this.positionHistory.set(knownFace.id, history);

        const smoothed = this.calculateMovingAverage(history);

        knownFace.x = this.lerp(knownFace.x, smoothed.x, this.smoothingFactor);
        knownFace.y = this.lerp(knownFace.y, smoothed.y, this.smoothingFactor);
        knownFace.width = this.lerp(knownFace.width, smoothed.width, this.smoothingFactor * 0.5);
        knownFace.height = this.lerp(knownFace.height, smoothed.height, this.smoothingFactor * 0.5);
    }

    calculateMovingAverage(history) {
        if (history.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

        const sum = history.reduce((acc, point) => ({
            x: acc.x + point.x,
            y: acc.y + point.y,
            width: acc.width + point.width,
            height: acc.height + point.height
        }), { x: 0, y: 0, width: 0, height: 0 });

        const count = history.length;
        return {
            x: sum.x / count,
            y: sum.y / count,
            width: sum.width / count,
            height: sum.height / count
        };
    }

    getSmoothedPosition(face) {
        const history = this.positionHistory.get(face.id);
        if (history && history.length > 0) {
            return this.calculateMovingAverage(history);
        }
        return face;
    }

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

    calculateSizeSimilarity(face1, face2) {
        const area1 = face1.width * face1.height;
        const area2 = face2.width * face2.height;
        const minArea = Math.min(area1, area2);
        const maxArea = Math.max(area1, area2);
        return minArea / maxArea;
    }

    calculateDistance(face1, face2) {
        return Math.sqrt(
            Math.pow(face1.x - face2.x, 2) +
            Math.pow(face1.y - face2.y, 2)
        );
    }

    lerp(start, end, factor) {
        return start * (1 - factor) + end * factor;
    }

    // QUAN TRỌNG: SỬA PHƯƠNG THỨC isValidFace
    isValidFace(face) {
        // SỬA: GIẢM kích thước tối thiểu XUỐNG 10px (thay vì 15px)
        const minFaceSize = 10;
        
        // SỬA: THÊM điều kiện - nếu confidence cao (>0.8) thì bỏ qua kích thước
        if (face.confidence > 0.8) {
            console.log(`✅ High confidence face accepted: ${face.width}x${face.height}`);
            return true;
        }
        
        if (face.width < minFaceSize || face.height < minFaceSize) {
            console.log(`❌ Face too small: ${face.width}x${face.height}`);
            return false;
        }

        // SỬA: MỞ RỘNG tỷ lệ cho phép
        const aspectRatio = face.width / face.height;
        if (aspectRatio < 0.2 || aspectRatio > 4.0) {
            console.log(`❌ Invalid aspect ratio: ${aspectRatio}`);
            return false;
        }

        console.log(`✅ Valid face: ${face.width}x${face.height}, ratio: ${aspectRatio.toFixed(2)}`);
        return true;
    }

    createNewFace(faceData) {
        return {
            id: this.nextId++,
            x: faceData.x,
            y: faceData.y,
            width: faceData.width,
            height: faceData.height,
            seen: true,
            framesLost: 0,
            isTracked: true,
            confidence: faceData.confidence,
            firstSeen: Date.now(),
            lastSeen: Date.now()
        };
    }

    cleanupLostFaces() {
        for (const [id, face] of this.faces.entries()) {
            if (face.framesLost > this.maxFramesLost) {
                this.faces.delete(id);
                this.positionHistory.delete(id);
            } else if (!face.seen) {
                face.isTracked = false;
            }
        }
    }

    getCurrentFaces() {
        return Array.from(this.faces.values());
    }

    getTrackedFacesCount() {
        return Array.from(this.faces.values()).filter(face => face.isTracked).length;
    }
}