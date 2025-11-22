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

            // SỬA: Giảm confidence threshold xuống 0.5
            this.faceDetection.setOptions({
                model: 'short',
                minDetectionConfidence: 0.1  // GIẢM từ 0.7 xuống 0.5
            });

            this.faceDetection.onResults((results) => {
                this.lastResults = results;
                this.handleMediaPipeResults(results);
            });

            this.modelsLoaded = true;
            console.log('✅ MediaPipe Face Detection loaded successfully');
        } catch (error) {
            console.error('❌ Error loading MediaPipe:', error);
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

            // 2. Xử lý detections với filter cân bằng hơn
            const detections = results.detections || [];

            console.log(`🎯 MediaPipe results: ${detections.length} raw detections`);

            // DEBUG: Hiển thị chi tiết từng detection
            detections.forEach((det, index) => {
                console.log(`🔍 Detection ${index}:`, {
                    confidence: det.confidence,
                    boundingBox: det.boundingBox,
                    landmarks: det.landmarks ? det.landmarks.length : 0
                });
            });

            // SỬA: TẠM THỜI CHẤP NHẬN TẤT CẢ DETECTIONS
            const filteredDetections = detections; // Không filter

            console.log(`✅ All detections: ${filteredDetections.length}`);

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
            if (!bbox) {
                console.warn(`⚠️ Detection ${index} has no boundingBox`);
                return null;
            }

            // DEBUG: Kiểm tra cấu trúc boundingBox
            console.log(`🔍 BoundingBox ${index}:`, bbox);

            // Chuyển đổi normalized coordinates sang pixel coordinates
            const widthPx = bbox.width * this.canvas.width;
            const heightPx = bbox.height * this.canvas.height;
            const centerXPx = (bbox.originX + bbox.width / 2) * this.canvas.width;
            const centerYPx = (bbox.originY + bbox.height / 2) * this.canvas.height;

            // SỬA QUAN TRỌNG: Tính toán start coordinates từ originX và originY
            const startXPx = bbox.originX * this.canvas.width;
            const startYPx = bbox.originY * this.canvas.height;

            // Xử lý confidence undefined
            const confidence = det.confidence || 0.8;

            const faceData = {
                x: centerXPx,
                y: centerYPx,
                width: widthPx,
                height: heightPx,
                landmarks: det.landmarks || [],
                // SỬA: TẠO boundingBox mới với start coordinates được tính toán
                boundingBox: {
                    start: [startXPx, startYPx], // SỬ DỤNG TỌA ĐỘ ĐÃ TÍNH
                    end: [startXPx + widthPx, startYPx + heightPx],
                    originX: startXPx,
                    originY: startYPx,
                    width: widthPx,
                    height: heightPx
                },
                confidence: confidence,
                rawConfidence: det.confidence
            };

            console.log(`📝 Formatted face ${index}: confidence=${faceData.confidence}, start=[${startXPx.toFixed(0)},${startYPx.toFixed(0)}], size=${faceData.width.toFixed(0)}x${faceData.height.toFixed(0)}px`);
            return faceData;
        }).filter(face => face !== null);
    }

    drawMediaPipeDetections(detections, trackedFaces) {
        const trackedFaceMap = new Map();
        trackedFaces.forEach(face => {
            trackedFaceMap.set(face.id, face);
        });

        console.log(`🎯 Drawing ${detections.length} detections`);

        detections.forEach((detection, index) => {
            const bbox = detection.boundingBox;
            if (!bbox) {
                console.warn(`⚠️ Detection ${index} has no boundingBox`);
                return;
            }

            // SỬA: SỬ DỤNG TỌA ĐỘ TRỰC TIẾP TỪ FACE DATA NẾU boundingBox.start KHÔNG TỒN TẠI
            let startX, startY;

            if (bbox.start && bbox.start[0] !== undefined && bbox.start[1] !== undefined) {
                startX = bbox.start[0];
                startY = bbox.start[1];
            } else if (bbox.originX !== undefined && bbox.originY !== undefined) {
                // SỬ DỤNG originX, originY nếu start không tồn tại
                startX = bbox.originX;
                startY = bbox.originY;
            } else {
                // TÍNH TOÁN TỪ CENTER NẾU KHÔNG CÓ TỌA ĐỘ START
                startX = detection.x - detection.width / 2;
                startY = detection.y - detection.height / 2;
            }

            const start = [startX, startY];
            const size = [detection.width, detection.height];

            console.log(`🎨 Drawing detection ${index} at [${startX.toFixed(0)}, ${startY.toFixed(0)}] size ${detection.width.toFixed(0)}x${detection.height.toFixed(0)}`);

            // Tìm face được track
            let bestFaceId = null;
            let minDistance = Infinity;

            for (const [faceId, trackedFace] of trackedFaceMap) {
                const distance = Math.sqrt(
                    Math.pow(detection.x - trackedFace.x, 2) +
                    Math.pow(detection.y - trackedFace.y, 2)
                );

                if (distance < 50 && distance < minDistance) {
                    minDistance = distance;
                    bestFaceId = faceId;
                }
            }

            const trackedFace = bestFaceId ? trackedFaceMap.get(bestFaceId) : null;

            // Vẽ bounding box
            const confidence = detection.confidence || 0;
            this.drawStableBoundingBox(start, size, trackedFace, confidence, detection.landmarks?.length >= 6);

            // Vẽ landmarks
            this.drawMediaPipeLandmarks(detection.landmarks);
        });
    }

    // SỬA: Thêm điều kiện kiểm tra landmarks
    drawStableBoundingBox(start, size, trackedFace, confidence, hasGoodLandmarks) {
        // KIỂM TRA TÍNH HỢP LỆ CỦA START COORDINATES
        if (!start || start[0] === undefined || start[1] === undefined ||
            isNaN(start[0]) || isNaN(start[1])) {
            console.warn('⚠️ Invalid start coordinates in drawStableBoundingBox:', start);
            return;
        }

        this.ctx.save();

        // Xác định màu sắc
        let boxColor, textColor;

        if (this.isTracking && trackedFace && trackedFace.isTracked) {
            boxColor = '#00ff00';
            textColor = '#00ff00';
        } else if (confidence >= 0.7) {
            boxColor = '#00ff00';
            textColor = '#00ff00';
        } else if (confidence >= 0.5) {
            boxColor = '#ffff00';
            textColor = '#ffff00';
        } else {
            boxColor = '#ff4444';
            textColor = '#ff4444';
        }

        this.ctx.strokeStyle = boxColor;
        this.ctx.lineWidth = trackedFace ? 3 : 2;
        this.ctx.shadowBlur = 6;
        this.ctx.shadowColor = boxColor;

        // Vẽ bounding box
        this.ctx.strokeRect(start[0], start[1], size[0], size[1]);

        // Vẽ thông tin
        this.ctx.fillStyle = textColor;
        this.ctx.font = 'bold 12px Arial';

        const infoText = trackedFace ?
            `Face ${trackedFace.id}` :
            `Face (${(confidence * 100).toFixed(0)}%)`;

        this.ctx.fillText(infoText, start[0], start[1] - 8);

        this.ctx.restore();

        console.log(`✅ Drew bounding box at [${start[0].toFixed(0)}, ${start[1].toFixed(0)}]`);
    }

    drawMediaPipeLandmarks(landmarks) {
        if (!landmarks || landmarks.length < 6) {
            return; // Chỉ vẽ khi có đủ landmarks
        }

        this.ctx.save();
        this.ctx.fillStyle = '#00ff00'; // Màu xanh lá cho landmarks chất lượng cao
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 1.5;

        // Vẽ các điểm landmarks
        landmarks.forEach((landmark, index) => {
            this.ctx.beginPath();
            this.ctx.arc(landmark.x * this.canvas.width, landmark.y * this.canvas.height, 3, 0, 2 * Math.PI);
            this.ctx.fill();
        });

        // Vẽ connections cho landmarks face
        this.ctx.beginPath();

        // Right eye (0, 1)
        this.ctx.moveTo(landmarks[0].x * this.canvas.width, landmarks[0].y * this.canvas.height);
        this.ctx.lineTo(landmarks[1].x * this.canvas.width, landmarks[1].y * this.canvas.height);

        // Left eye (2, 3)
        this.ctx.moveTo(landmarks[2].x * this.canvas.width, landmarks[2].y * this.canvas.height);
        this.ctx.lineTo(landmarks[3].x * this.canvas.width, landmarks[3].y * this.canvas.height);

        // Nose tip (4) - vẽ chữ thập
        this.ctx.moveTo(landmarks[4].x * this.canvas.width - 4, landmarks[4].y * this.canvas.height);
        this.ctx.lineTo(landmarks[4].x * this.canvas.width + 4, landmarks[4].y * this.canvas.height);
        this.ctx.moveTo(landmarks[4].x * this.canvas.width, landmarks[4].y * this.canvas.height - 4);
        this.ctx.lineTo(landmarks[4].x * this.canvas.width, landmarks[4].y * this.canvas.height + 4);

        // Mouth (5) - vẽ đường ngang
        this.ctx.moveTo(landmarks[5].x * this.canvas.width - 4, landmarks[5].y * this.canvas.height);
        this.ctx.lineTo(landmarks[5].x * this.canvas.width + 4, landmarks[5].y * this.canvas.height);

        this.ctx.stroke();
        this.ctx.restore();
    }

    // GIỮ NGUYÊN các phương thức khác...
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
        }
    }

    // GIỮ NGUYÊN startCamera và các phương thức khác...
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

    // GIỮ NGUYÊN các phương thức tracking và button states...
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

// CLASS TRACKER - TĂNG ĐỘ CHÍNH XÁC
class ImprovedFaceTracker {
    constructor() {
        this.faces = new Map();
        this.nextId = 1;
        this.maxFramesLost = 25;
        this.trackingThreshold = 0.1;  // GIẢM từ 0.4 xuống 0.3
        this.smoothingFactor = 0.3;
        this.positionHistory = new Map();
    }

    reset() {
        this.faces.clear();
        this.nextId = 1;
        this.positionHistory.clear();
    }

    update(currentFaces) {
        console.log(`🔄 Updating tracker with ${currentFaces.length} faces`);

        // Đánh dấu tất cả faces là không seen
        for (const face of this.faces.values()) {
            face.seen = false;
            face.framesLost++;
        }

        const results = [];

        for (const currentFace of currentFaces) {
            console.log(`🔍 Processing face: conf=${currentFace.confidence}, size=${currentFace.width.toFixed(0)}x${currentFace.height.toFixed(0)}`);

            // KIỂM TRA FACE HỢP LỆ TRƯỚC KHI XỬ LÝ
            if (!this.isValidFace(currentFace)) {
                console.log(`🚫 Skipping invalid face`);
                continue;
            }

            let bestMatch = null;
            let bestScore = 0;

            for (const [id, knownFace] of this.faces.entries()) {
                if (knownFace.seen) continue;

                // SỬA: THÊM KIỂM TRA ĐỂ TRÁNH NaN
                const iouScore = this.calculateIoU(currentFace, knownFace);
                const centerDistance = this.calculateDistance(currentFace, knownFace);
                const sizeSimilarity = this.calculateSizeSimilarity(currentFace, knownFace);

                // ĐẢM BẢO KHÔNG CÓ NaN
                const safeIou = isNaN(iouScore) ? 0 : iouScore;
                const safeDistance = isNaN(centerDistance) ? 100 : centerDistance;
                const safeSizeSimilarity = isNaN(sizeSimilarity) ? 0 : sizeSimilarity;

                const totalScore = (safeIou * 0.5) +
                    (Math.max(0, 1 - safeDistance / 80) * 0.4) +
                    (safeSizeSimilarity * 0.1);

                console.log(`🎯 Matching score: ${totalScore.toFixed(3)} (IoU: ${safeIou.toFixed(3)}, dist: ${safeDistance.toFixed(1)})`);

                if (totalScore > 0.3 && totalScore > bestScore) {
                    bestScore = totalScore;
                    bestMatch = knownFace;
                }
            }

            if (bestMatch) {
                console.log(`✅ Matched with existing face ${bestMatch.id}`);

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
                console.log(`🆕 Creating new face`);
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
            }
        }

        // Dọn dẹp faces mất tích
        this.cleanupLostFaces();

        console.log(`📊 Tracker results: ${results.length} faces`);
        return results;
    }

    // GIỮ NGUYÊN các phương thức helper...
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
        try {
            const box1 = this.getBoundingBox(face1);
            const box2 = this.getBoundingBox(face2);

            // KIỂM TRA TÍNH HỢP LỆ CỦA BOUNDING BOX
            if (!box1 || !box2 ||
                isNaN(box1.left) || isNaN(box1.right) ||
                isNaN(box2.left) || isNaN(box2.right)) {
                console.warn('⚠️ Invalid bounding box in IoU calculation');
                return 0;
            }

            const x1 = Math.max(box1.left, box2.left);
            const y1 = Math.max(box1.top, box2.top);
            const x2 = Math.min(box1.right, box2.right);
            const y2 = Math.min(box1.bottom, box2.bottom);

            const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
            const area1 = (box1.right - box1.left) * (box1.bottom - box1.top);
            const area2 = (box2.right - box2.left) * (box2.bottom - box2.top);
            const union = area1 + area2 - intersection;

            return union > 0 ? intersection / union : 0;
        } catch (error) {
            console.error('❌ Error in IoU calculation:', error);
            return 0;
        }
    }

    getBoundingBox(face) {
        try {
            // KIỂM TRA TÍNH HỢP LỆ CỦA FACE
            if (!face || isNaN(face.x) || isNaN(face.y) || isNaN(face.width) || isNaN(face.height)) {
                console.warn('⚠️ Invalid face in getBoundingBox:', face);
                return { left: 0, top: 0, right: 0, bottom: 0 };
            }

            const halfWidth = face.width / 2;
            const halfHeight = face.height / 2;
            return {
                left: face.x - halfWidth,
                top: face.y - halfHeight,
                right: face.x + halfWidth,
                bottom: face.y + halfHeight
            };
        } catch (error) {
            console.error('❌ Error in getBoundingBox:', error);
            return { left: 0, top: 0, right: 0, bottom: 0 };
        }
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

    // SỬA: KIỂM TRA NGHIÊM NGẶT HƠN
    isValidFace(face) {
        // SỬA: Sử dụng pixel coordinates để kiểm tra
        console.log(`🔍 Validating face: conf=${face.confidence}, size=${face.width.toFixed(0)}x${face.height.toFixed(0)}px, landmarks=${face.landmarks?.length || 0}`);

        // 1. Confidence - xử lý undefined
        if (face.confidence < 0.3) { // Giảm ngưỡng vì confidence có thể thấp
            console.log(`❌ Low confidence: ${face.confidence}`);
            return false;
        }

        // 2. Landmarks - vẫn yêu cầu
        if (!face.landmarks || face.landmarks.length < 6) {
            console.log(`❌ Insufficient landmarks: ${face.landmarks?.length || 0}`);
            return false;
        }

        // 3. Kích thước - sử dụng pixel coordinates
        const minFaceSize = 40; // pixel
        const maxFaceSize = 400; // pixel

        if (face.width < minFaceSize || face.height < minFaceSize) {
            console.log(`❌ Face too small: ${face.width.toFixed(0)}x${face.height.toFixed(0)}px`);
            return false;
        }

        if (face.width > maxFaceSize || face.height > maxFaceSize) {
            console.log(`❌ Face too large: ${face.width.toFixed(0)}x${face.height.toFixed(0)}px`);
            return false;
        }

        // 4. Tỷ lệ
        const aspectRatio = face.width / face.height;
        const validAspectRatio = aspectRatio >= 0.5 && aspectRatio <= 2.0;

        if (!validAspectRatio) {
            console.log(`❌ Invalid face aspect ratio: ${aspectRatio.toFixed(2)}`);
            return false;
        }

        console.log(`✅ Valid face: ${face.width.toFixed(0)}x${face.height.toFixed(0)}px, ratio: ${aspectRatio.toFixed(2)}`);
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