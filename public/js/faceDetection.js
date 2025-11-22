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

            // SỬA: TĂNG confidence threshold để giảm false positive
            this.faceDetection.setOptions({
                model: 'short',
                minDetectionConfidence: 0.7  // TĂNG từ 0.3 lên 0.7
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

            // THÊM: Lọc detections theo confidence
            const filteredDetections = detections.filter(det => {
                const confidence = det.confidence || 0;
                console.log(`📊 Detection confidence: ${confidence}`);
                return confidence >= 0.7; // Chỉ lấy detection có confidence cao
            });

            console.log(`✅ Filtered detections: ${filteredDetections.length}/${detections.length}`);

            if (filteredDetections.length > 0) {
                const facesData = this.formatDetections(filteredDetections);
                const trackedFaces = this.faceTracker.update(facesData);
                this.drawMediaPipeDetections(filteredDetections, trackedFaces);

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
                confidence: det.confidence || 0
            };

            console.log(`📝 Formatted face ${index}: confidence=${faceData.confidence}, size=${bbox.width}x${bbox.height}`);
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

            // Tìm face được track
            let bestFaceId = null;
            let minDistance = Infinity;

            for (const [faceId, trackedFace] of trackedFaceMap) {
                const distance = Math.sqrt(
                    Math.pow(centerX - trackedFace.x, 2) +
                    Math.pow(centerY - trackedFace.y, 2)
                );

                if (distance < 100 && distance < minDistance) {
                    minDistance = distance;
                    bestFaceId = faceId;
                }
            }

            const trackedFace = bestFaceId ? trackedFaceMap.get(bestFaceId) : null;

            // THÊM: Kiểm tra confidence trước khi vẽ
            const confidence = detection.confidence || 0;
            if (confidence < 0.7) {
                console.log(`🚫 Skipping low confidence detection: ${confidence}`);
                return; // Bỏ qua detection có confidence thấp
            }

            // Vẽ bounding box
            this.drawStableBoundingBox(start, size, trackedFace, confidence);

            // Vẽ landmarks MediaPipe
            this.drawMediaPipeLandmarks(detection.landmarks);
        });
    }

    // SỬA: Thêm tham số confidence để hiển thị
    drawStableBoundingBox(start, size, trackedFace, confidence) {
        this.ctx.save();

        // Xác định màu sắc dựa trên confidence và tracking status
        let boxColor, textColor;
        
        if (this.isTracking && trackedFace && trackedFace.isTracked) {
            boxColor = '#00ff00'; // Xanh lá - đang tracked
            textColor = '#00ff00';
        } else if (confidence >= 0.8) {
            boxColor = '#ffff00'; // Vàng - confidence cao
            textColor = '#ffff00';
        } else if (confidence >= 0.7) {
            boxColor = '#ffa500'; // Cam - confidence trung bình
            textColor = '#ffa500';
        } else {
            boxColor = '#ff4444'; // Đỏ - confidence thấp
            textColor = '#ff4444';
        }

        this.ctx.strokeStyle = boxColor;
        this.ctx.lineWidth = trackedFace ? 3 : 2;

        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = boxColor;

        this.ctx.strokeRect(start[0], start[1], size[0], size[1]);

        // Vẽ thông tin
        if (trackedFace) {
            this.ctx.fillStyle = textColor;
            this.ctx.font = 'bold 14px Arial';
            this.ctx.fillText(`Face ${trackedFace.id} (${(confidence * 100).toFixed(0)}%)`, start[0], start[1] - 8);
        } else {
            this.ctx.fillStyle = textColor;
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText(`${(confidence * 100).toFixed(0)}%`, start[0], start[1] - 5);
        }

        this.ctx.restore();
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
            this.ctx.arc(landmark.x * this.canvas.width, landmark.y * this.canvas.height, 2, 0, 2 * Math.PI);
            this.ctx.fill();
        });

        // Chỉ vẽ connections nếu có đủ 6 landmarks
        if (landmarks.length >= 6) {
            this.ctx.beginPath();

            // Right eye (0, 1)
            this.ctx.moveTo(landmarks[0].x * this.canvas.width, landmarks[0].y * this.canvas.height);
            this.ctx.lineTo(landmarks[1].x * this.canvas.width, landmarks[1].y * this.canvas.height);

            // Left eye (2, 3)
            this.ctx.moveTo(landmarks[2].x * this.canvas.width, landmarks[2].y * this.canvas.height);
            this.ctx.lineTo(landmarks[3].x * this.canvas.width, landmarks[3].y * this.canvas.height);

            // Nose tip (4)
            this.ctx.moveTo(landmarks[4].x * this.canvas.width - 3, landmarks[4].y * this.canvas.height);
            this.ctx.lineTo(landmarks[4].x * this.canvas.width + 3, landmarks[4].y * this.canvas.height);
            this.ctx.moveTo(landmarks[4].x * this.canvas.width, landmarks[4].y * this.canvas.height - 3);
            this.ctx.lineTo(landmarks[4].x * this.canvas.width, landmarks[4].y * this.canvas.height + 3);

            // Mouth (5)
            this.ctx.moveTo(landmarks[5].x * this.canvas.width - 3, landmarks[5].y * this.canvas.height);
            this.ctx.lineTo(landmarks[5].x * this.canvas.width + 3, landmarks[5].y * this.canvas.height);

            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    // Các phương thức khác giữ nguyên...
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
                    if (this.video.paused) {
                        await this.video.play();
                    }

                    await this.detectWithMediaPipe();

                } catch (error) {
                    console.error('❌ Error in MediaPipe detection:', error);
                }
            }

            if (this.isCameraOn && this.isDetectionRunning) {
                requestAnimationFrame(detectionLoop);
            } else {
                this.isDetectionRunning = false;
                console.log('🛑 Detection loop stopped');
            }
        };

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
            this.ctx.fillStyle = '#ff0000';
            this.ctx.font = '14px Arial';
            this.ctx.fillText('MediaPipe Error - Check Console', 20, this.canvas.height - 30);
        }
    }

    async startCamera() {
        try {
            console.log('🎯 Starting camera...');

            if (this.stream) {
                this.stopCamera();
                await new Promise(resolve => setTimeout(resolve, 500));
            }

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

            if (!this.video || this.video.parentNode === null) {
                this.video = document.createElement('video');
                this.video.playsInline = true;
                this.video.muted = true;
                this.video.style.display = 'none';
                document.body.appendChild(this.video);
                console.log('✅ Video element created');
            }

            this.video.srcObject = this.stream;

            await new Promise((resolve, reject) => {
                let resolved = false;

                this.video.onloadedmetadata = () => {
                    if (!resolved) {
                        console.log('📹 Video metadata loaded:', this.video.videoWidth, 'x', this.video.videoHeight);
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

                setTimeout(() => {
                    if (!resolved) {
                        console.log('⚠️ Video load timeout, continuing...');
                        resolved = true;
                        resolve();
                    }
                }, 5000);
            });

            this.initializeCanvas();

            try {
                await this.video.play();
                console.log('✅ Video playing successfully');
            } catch (playError) {
                console.error('❌ Video play failed:', playError);
                throw playError;
            }

            this.isCameraOn = true;

            if (!this.modelsLoaded) {
                console.log('⏳ Waiting for MediaPipe models...');
                let attempts = 0;
                while (!this.modelsLoaded && attempts < 30) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    attempts++;
                }
            }

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

    drawNoFacesInfo() {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('🔍 Đang tìm khuôn mặt...', this.canvas.width / 2, 30);
    }

    drawStatusInfo() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(10, 10, 250, 80);

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
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;

            console.log('📐 Canvas dimensions set:', this.canvas.width, 'x', this.canvas.height);

            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.translate(this.canvas.width, 0);
            this.ctx.scale(-1, 1);

            this.canvasInitialized = true;
            this.drawVideoFrame();
            console.log('✅ Canvas initialized and first frame drawn');

        } catch (error) {
            console.error('❌ Canvas initialization error:', error);
        }
    }

    drawVideoFrame() {
        if (!this.video || this.video.videoWidth === 0 || this.video.videoHeight === 0) {
            return;
        }

        try {
            this.ctx.fillStyle = '#000000';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

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

    // Các phương thức tracking và button states giữ nguyên...
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

        const recordingStatus = document.getElementById('recordingStatus');
        if (recordingStatus) {
            recordingStatus.classList.add('active');
        }

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
        this.isDetectionRunning = false;

        if (this.faceDetection) {
            try {
                this.faceDetection.close();
            } catch (error) {
                console.log('MediaPipe cleanup:', error);
            }
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.stop();
            });
            this.stream = null;
        }

        if (this.video) {
            this.video.srcObject = null;
            this.video.remove();
        }

        if (this.isTracking) {
            this.stopTracking();
        }

        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
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

            trackedFaces.forEach(face => {
                this.uniqueFaces.add(face.id);
            });

            this.totalFacesCount = Math.max(this.totalFacesCount, this.uniqueFaces.size);

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

// CLASS TRACKER CẢI TIẾN - TĂNG ĐỘ CHÍNH XÁC
class ImprovedFaceTracker {
    constructor() {
        this.faces = new Map();
        this.nextId = 1;
        this.maxFramesLost = 30; // Giảm thời gian mất tích
        this.trackingThreshold = 0.4; // TĂNG ngưỡng tracking
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

        // MATCHING với điều kiện CHẶT CHẼ hơn
        for (const currentFace of currentFaces) {
            // THÊM: Bỏ qua face có confidence thấp
            if (currentFace.confidence < 0.7) {
                console.log(`🚫 Skipping low confidence face: ${currentFace.confidence}`);
                continue;
            }

            let bestMatch = null;
            let bestScore = 0;

            for (const [id, knownFace] of this.faces.entries()) {
                if (knownFace.seen) continue;

                const iouScore = this.calculateIoU(currentFace, knownFace);
                const centerDistance = this.calculateDistance(currentFace, knownFace);
                const sizeSimilarity = this.calculateSizeSimilarity(currentFace, knownFace);

                // SCORE TỔNG HỢP - TĂNG TRỌNG SỐ cho IoU và distance
                const totalScore = (iouScore * 0.6) + // TĂNG trọng số IoU
                    (Math.max(0, 1 - centerDistance / 80) * 0.3) + // GIẢM khoảng cách cho phép
                    (sizeSimilarity * 0.1); // GIẢM trọng số kích thước

                console.log(`🎯 Matching score: ${totalScore.toFixed(3)} (IoU: ${iouScore.toFixed(3)}, dist: ${centerDistance.toFixed(1)})`);

                // SỬA: TĂNG ngưỡng matching lên 0.4
                if (totalScore > 0.4 && totalScore > bestScore) {
                    bestScore = totalScore;
                    bestMatch = knownFace;
                }
            }

            if (bestMatch) {
                console.log(`✅ Matched with existing face ${bestMatch.id}, score: ${bestScore.toFixed(3)}`);

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
                // Face mới - KIỂM TRA NGHIÊM NGẶT HƠN
                if (this.isValidFace(currentFace)) {
                    console.log(`🆕 Creating new face from detection (conf: ${currentFace.confidence})`);
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

    // SỬA: TĂNG ĐỘ CHẶT CHẼ CỦA VALID FACE
    isValidFace(face) {
        // 1. Kiểm tra confidence (QUAN TRỌNG)
        if (face.confidence < 0.7) {
            console.log(`❌ Low confidence: ${face.confidence}`);
            return false;
        }

        // 2. Kiểm tra kích thước hợp lý cho khuôn mặt
        const minFaceSize = 20; // TĂNG kích thước tối thiểu
        const maxFaceSize = 400; // Thêm kích thước tối đa
        
        if (face.width < minFaceSize || face.height < minFaceSize) {
            console.log(`❌ Face too small: ${face.width}x${face.height}`);
            return false;
        }
        
        if (face.width > maxFaceSize || face.height > maxFaceSize) {
            console.log(`❌ Face too large: ${face.width}x${face.height}`);
            return false;
        }

        // 3. Kiểm tra tỷ lệ aspect ratio của khuôn mặt
        const aspectRatio = face.width / face.height;
        const validAspectRatio = aspectRatio >= 0.5 && aspectRatio <= 2.0; // Tỷ lệ khuôn mặt thực tế
        
        if (!validAspectRatio) {
            console.log(`❌ Invalid face aspect ratio: ${aspectRatio.toFixed(2)}`);
            return false;
        }

        // 4. Kiểm tra vị trí (không quá gần biên)
        const margin = 30;
        if (face.x < margin || face.x > (640 - margin) || 
            face.y < margin || face.y > (480 - margin)) {
            console.log(`❌ Face too close to edge: (${face.x}, ${face.y})`);
            return false;
        }

        console.log(`✅ Valid face: ${face.width}x${face.height}, ratio: ${aspectRatio.toFixed(2)}, conf: ${face.confidence}`);
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
                console.log(`🗑️ Removing lost face ${id}`);
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