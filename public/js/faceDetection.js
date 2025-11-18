// Face detection functionality với tracking cải tiến
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
        this.faceTracker = new ImprovedFaceTracker();

        // Biến theo dõi lưu theo phút
        this.minuteIntervals = [];
        this.lastMinuteSave = 0;
        this.minuteFaceCounts = new Map();

        this.onFaceCountUpdate = null;
        this.onTotalFacesUpdate = null;
        this.onTrackingTimeUpdate = null;

        // Video element ẩn
        this.video = document.createElement('video');
        this.video.playsInline = true;
        this.video.muted = true;
        this.video.style.display = 'none';

        // Biến trạng thái
        this.isCameraOn = false;
        this.isDetectionRunning = false;
        this.lastDetectionTime = 0;
        this.detectionFrameRate = 15;
        this.minDetectionInterval = 1000 / this.detectionFrameRate;

        this.loadFaceDetectionModel();
    }

    async loadFaceDetectionModel() {
        try {
            this.model = await blazeface.load();
            console.log('✅ Face detection model loaded');
        } catch (error) {
            console.error('❌ Error loading face detection model:', error);
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
                this.video.play();
                
                // 🎯 BẮT ĐẦU DETECTION LOOP TÍCH HỢP
                this.startDetectionLoop();
            });

            this.isCameraOn = true;
            this.updateButtonStates();
            console.log('✅ Camera started');
        } catch (error) {
            console.error('❌ Error accessing camera:', error);
            alert('Không thể truy cập camera. Vui lòng kiểm tra quyền truy cập.');
        }
    }

    initializeCanvas() {
        if (this.video.videoWidth > 0 && this.video.videoHeight > 0) {
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;

            // Mirror effect cho front camera
            this.ctx.translate(this.canvas.width, 0);
            this.ctx.scale(-1, 1);

            this.canvasInitialized = true;
            console.log('✅ Canvas initialized with dimensions:', this.canvas.width, 'x', this.canvas.height);
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

            // Dừng detection loop
            this.isDetectionRunning = false;

            // Clear canvas
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);

            this.isCameraOn = false;
            this.updateButtonStates();
            console.log('✅ Camera stopped');
        }
    }

    // 🎯 PHƯƠNG THỨC MỚI: Detection loop tích hợp
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
            if (currentTime - this.lastDetectionTime >= this.minDetectionInterval) {
                this.lastDetectionTime = currentTime;
                try {
                    // 🎯 TÍCH HỢP: Detection và rendering trong cùng 1 frame
                    await this.detectAndRenderFaces();
                } catch (error) {
                    console.error('❌ Error in detection loop:', error);
                    this.isDetectionRunning = false;
                    return;
                }
            }

            if (this.isCameraOn && this.isDetectionRunning) {
                requestAnimationFrame(detectionLoop);
            } else {
                this.isDetectionRunning = false;
            }
        };

        requestAnimationFrame(detectionLoop);
    }

    // 🎯 PHƯƠNG THỨC MỚI: Tích hợp detection và rendering
    async detectAndRenderFaces() {
        if (!this.model || !this.stream) return;

        try {
            this.ensureVideoDisplay();

            if (this.video.videoWidth === 0 || this.video.videoHeight === 0) {
                return;
            }

            if (!this.canvasInitialized) {
                this.initializeCanvas();
            }

            // 🎯 BẮT ĐẦU 1 FRAME HOÀN CHỈNH
            this.ctx.save();

            // 1. Vẽ video frame (nền) - LUÔN VẼ DÙ CÓ TRACKING HAY KHÔNG
            this.drawVideoFrame();

            // 2. Chạy face detection - LUÔN CHẠY DÙ CÓ TRACKING HAY KHÔNG
            const predictions = await this.model.estimateFaces(this.video, false);

            // 3. Xử lý tracking - LUÔN CẬP NHẬT TRACKER
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

            // 4. Cập nhật tracker với smoothing - LUÔN CẬP NHẬT
            const trackedFaces = this.faceTracker.update(facesData);

            // 5. Vẽ khung khuôn mặt với anti-flicker - LUÔN VẼ DÙ CÓ TRACKING HAY KHÔNG
            if (predictions.length > 0) {
                this.drawFaceDetections(predictions, trackedFaces);
            } else {
                this.drawNoFacesInfo();
            }

            // 6. Vẽ thông tin trạng thái
            this.drawStatusInfo();

            this.ctx.restore();

            // 7. Cập nhật thống kê (CHỈ KHI ĐANG TRACKING)
            if (this.isTracking && predictions.length > 0) {
                this.updateTrackingStats(trackedFaces);
            }

        } catch (error) {
            console.error('❌ Error in detectAndRenderFaces:', error);
            this.ctx.restore();
        }
    }

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

    drawVideoFrame() {
        if (this.video.videoWidth === 0 || this.video.videoHeight === 0) return;

        try {
            // 🎯 QUAN TRỌNG: Luôn clear và vẽ video frame
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
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

    // 🎯 PHƯƠNG THỨC MỚI: Vẽ khung ổn định, chống nháy
    drawFaceDetections(predictions, trackedFaces = null) {
        if (!trackedFaces) {
            trackedFaces = this.faceTracker.getCurrentFaces();
        }

        // Tạo map để tra cứu nhanh
        const trackedFaceMap = new Map();
        trackedFaces.forEach(face => {
            trackedFaceMap.set(face.id, face);
        });

        predictions.forEach((prediction) => {
            const start = prediction.topLeft;
            const end = prediction.bottomRight;
            const size = [end[0] - start[0], end[1] - start[1]];
            const centerX = (start[0] + end[0]) / 2;
            const centerY = (start[1] + end[1]) / 2;

            // Tìm face được track với khoảng cách gần nhất
            let bestFaceId = null;
            let minDistance = Infinity;

            for (const [faceId, trackedFace] of trackedFaceMap) {
                const distance = Math.sqrt(
                    Math.pow(centerX - trackedFace.x, 2) +
                    Math.pow(centerY - trackedFace.y, 2)
                );

                if (distance < 50 && distance < minDistance) {
                    minDistance = distance;
                    bestFaceId = faceId;
                }
            }

            const trackedFace = bestFaceId ? trackedFaceMap.get(bestFaceId) : null;

            // 🎯 VẼ KHUNG VỚI ANTI-FLICKER - LUÔN VẼ DÙ CÓ TRACKING HAY KHÔNG
            this.drawStableBoundingBox(start, size, trackedFace);
            
            // Vẽ landmarks với độ mờ
            this.drawSmoothLandmarks(prediction.landmarks);
        });
    }

    drawStableBoundingBox(start, size, trackedFace) {
        this.ctx.save();
        
        // 🎯 THAY ĐỔI: Luôn vẽ khung màu vàng khi không tracking, xanh lá khi tracking
        if (this.isTracking && trackedFace && trackedFace.isTracked) {
            this.ctx.strokeStyle = '#00ff00'; // Xanh lá - đang tracking
            this.ctx.lineWidth = 3;
        } else {
            this.ctx.strokeStyle = '#ffff00'; // Vàng - chỉ detect, không tracking
            this.ctx.lineWidth = 2;
        }

        // Thêm shadow để khung mượt hơn
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = this.ctx.strokeStyle;
        
        this.ctx.strokeRect(start[0], start[1], size[0], size[1]);
        
        // Vẽ ID nếu có tracked face
        if (trackedFace) {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.fillText(`Face ${trackedFace.id}`, start[0], start[1] - 8);
        }
        
        this.ctx.restore();
    }

    drawSmoothLandmarks(landmarks) {
        this.ctx.save();
        this.ctx.fillStyle = '#00ffff';
        this.ctx.shadowBlur = 4;
        this.ctx.shadowColor = '#00ffff';
        
        landmarks.forEach(landmark => {
            this.ctx.fillRect(landmark[0] - 2, landmark[1] - 2, 4, 4);
        });
        this.ctx.restore();
    }

    drawNoFacesInfo() {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('🔍 Đang tìm khuôn mặt...', this.canvas.width / 2, 30);
    }

    drawStatusInfo() {
        // Vẽ background cho text
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(10, 10, 220, 80);

        // Text information
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'left';

        if (this.isTracking) {
            this.ctx.fillText('🎭 Đang Theo Dõi', 20, 30);
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`Tổng: ${this.totalFacesCount}`, 20, 50);
            this.ctx.fillText(`Hiện tại: ${this.faceTracker.getTrackedFacesCount()}`, 20, 70);
            this.ctx.fillText(`Phút: ${this.lastMinuteSave + 1}`, 20, 90);
        } else {
            this.ctx.fillText('📷 Chế Độ Camera', 20, 30);
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`Khuôn mặt: ${this.faceTracker.getTrackedFacesCount()}`, 20, 50);
            this.ctx.fillText('⏸️ Tạm dừng thống kê', 20, 70);
        }
    }

    updateTrackingStats(trackedFaces) {
        if (!this.isTracking) return;

        if (this.onFaceCountUpdate) {
            this.onFaceCountUpdate(trackedFaces.filter(f => f.isTracked).length);
        }

        // Track unique faces - CHỈ KHI ĐANG TRACKING
        const newFacesCount = this.trackUniqueFaces(trackedFaces);
        if (newFacesCount > 0 && this.onTotalFacesUpdate) {
            this.onTotalFacesUpdate(this.totalFacesCount);
        }
    }

    trackUniqueFaces(trackedFaces) {
        let newFaces = 0;

        if (!trackedFaces || !Array.isArray(trackedFaces)) {
            return 0;
        }

        trackedFaces.forEach(face => {
            if (face && face.isNew && face.confidence > 0.8) {
                this.uniqueFaces.add(face.id);
                this.totalFacesCount++;
                newFaces++;
            }
        });

        return newFaces;
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
        
        // 🎯 QUAN TRỌNG: KHÔNG reset faceTracker để tiếp tục theo dõi khuôn mặt
        // this.faceTracker.reset(); // DÒNG NÀY ĐÃ BỊ COMMENT

        // Reset biến theo dõi phút
        this.minuteIntervals = [];
        this.lastMinuteSave = 0;
        this.minuteFaceCounts.clear();

        // Show recording status
        const recordingStatus = document.getElementById('recordingStatus');
        if (recordingStatus) {
            recordingStatus.classList.add('active');
        }

        // Update tracking time và kiểm tra lưu theo phút
        this.timeInterval = setInterval(() => {
            if (this.isTracking && this.onTrackingTimeUpdate) {
                const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
                this.onTrackingTimeUpdate(elapsedSeconds);
                this.checkAndSaveMinuteData(elapsedSeconds);
            }
        }, 1000);

        this.updateButtonStates();
        console.log('✅ Face tracking started');
    }

    checkAndSaveMinuteData(elapsedSeconds) {
        const currentMinute = Math.floor(elapsedSeconds / 60);
        if (currentMinute > this.lastMinuteSave) {
            this.saveCurrentMinuteData();
            this.lastMinuteSave = currentMinute;
        }
    }

    saveCurrentMinuteData() {
        const minuteStart = this.startTime + (this.lastMinuteSave * 60 * 1000);
        const minuteEnd = this.startTime + ((this.lastMinuteSave + 1) * 60 * 1000);
        const currentTime = Date.now();

        const actualEnd = Math.min(minuteEnd, currentTime);
        const minuteFaces = this.calculateMinuteFaces();

        const minuteData = {
            session_id: this.sessionId,
            start_time: new Date(minuteStart).toISOString(),
            end_time: new Date(actualEnd).toISOString(),
            face_count: minuteFaces,
            minute_number: this.lastMinuteSave + 1
        };

        console.log(`💾 Saving minute ${minuteData.minute_number} data:`, minuteData);
        this.minuteIntervals.push(minuteData);
        this.sendMinuteDataToServer(minuteData);
        this.minuteFaceCounts.clear();
    }

    calculateMinuteFaces() {
        const currentMinuteFaces = new Set();
        const trackedFaces = this.faceTracker.getCurrentFaces();
        
        trackedFaces.forEach(face => {
            if (face.isTracked) {
                currentMinuteFaces.add(face.id);
            }
        });

        return currentMinuteFaces.size;
    }

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
            console.log(`✅ Minute ${minuteData.minute_number} data saved successfully:`, result);
        } catch (error) {
            console.warn(`⚠️ Error saving minute ${minuteData.minute_number} data:`, error.message);
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

        // Dọn dẹp intervals
        if (this.timeInterval) {
            clearInterval(this.timeInterval);
            this.timeInterval = null;
        }

        // 🎯 QUAN TRỌNG: CHỈ reset thống kê hiển thị về 0, KHÔNG dừng detection
        if (this.onFaceCountUpdate) {
            this.onFaceCountUpdate(0);
        }
        if (this.onTotalFacesUpdate) {
            this.onTotalFacesUpdate(0);
        }
        if (this.onTrackingTimeUpdate) {
            this.onTrackingTimeUpdate(0);
        }

        // 🎯 QUAN TRỌNG: KHÔNG reset faceTracker, tiếp tục detect khuôn mặt
        // this.faceTracker.reset(); // DÒNG NÀY ĐÃ BỊ COMMENT

        this.updateButtonStates();
        console.log('⏸️ Face tracking stopped (detection continues)');
    }

    saveFinalMinuteData(elapsedSeconds) {
        const finalData = {
            session_id: this.sessionId,
            start_time: new Date(this.startTime).toISOString(),
            end_time: new Date().toISOString(),
            face_count: this.totalFacesCount,
            duration: elapsedSeconds,
            total_minutes: this.minuteIntervals.length
        };

        console.log('📊 Final tracking data:', finalData);
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

        const stopTrackingBtn = document.getElementById('stopTracking');
        if (stopTrackingBtn) {
            stopTrackingBtn.textContent = '⏸️ Dừng Thống Kê';
        }
    }
}

// 🎯 CLASS TRACKER CẢI TIẾN với smoothing mạnh
class ImprovedFaceTracker {
    constructor() {
        this.faces = new Map();
        this.nextId = 1;
        this.maxFramesLost = 45;
        this.trackingThreshold = 0.3;
        this.smoothingFactor = 0.3;
        this.positionHistory = new Map();
    }

    reset() {
        this.faces.clear();
        this.nextId = 1;
        this.positionHistory.clear();
    }

    update(currentFaces) {
        // Đánh dấu tất cả faces là không seen
        for (const face of this.faces.values()) {
            face.seen = false;
            face.framesLost++;
        }

        const results = [];

        // MATCHING với smoothing mạnh
        for (const currentFace of currentFaces) {
            let bestMatch = null;
            let bestScore = 0;

            for (const [id, knownFace] of this.faces.entries()) {
                if (knownFace.seen) continue;

                const iouScore = this.calculateIoU(currentFace, knownFace);
                const centerDistance = this.calculateDistance(currentFace, knownFace);
                const sizeSimilarity = this.calculateSizeSimilarity(currentFace, knownFace);
                const velocityScore = this.calculateVelocityScore(knownFace, currentFace);

                // SCORE TỔNG HỢP với trọng số thông minh
                const totalScore = (iouScore * 0.5) +
                    (Math.max(0, 1 - centerDistance / 150) * 0.3) +
                    (sizeSimilarity * 0.1) +
                    (velocityScore * 0.1);

                if (totalScore > this.trackingThreshold && totalScore > bestScore) {
                    bestScore = totalScore;
                    bestMatch = knownFace;
                }
            }

            if (bestMatch) {
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
                // Face mới
                if (currentFace.confidence > 0.6 && this.isValidFace(currentFace)) {
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
        }

        // Dọn dẹp faces mất tích
        this.cleanupLostFaces();
        
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

    calculateVelocityScore(knownFace, currentFace) {
        const history = this.positionHistory.get(knownFace.id);
        if (!history || history.length < 2) return 1.0;

        const lastPoint = history[history.length - 1];
        const expectedX = knownFace.x + (knownFace.x - lastPoint.x);
        const expectedY = knownFace.y + (knownFace.y - lastPoint.y);

        const distance = Math.sqrt(
            Math.pow(currentFace.x - expectedX, 2) +
            Math.pow(currentFace.y - expectedY, 2)
        );

        return Math.max(0, 1 - distance / 100);
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

    isValidFace(face) {
        const minFaceSize = 20;
        if (face.width < minFaceSize || face.height < minFaceSize) {
            return false;
        }

        const aspectRatio = face.width / face.height;
        if (aspectRatio < 0.5 || aspectRatio > 2.0) {
            return false;
        }

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
            isTracked: true, // 🎯 LUÔN là true để tiếp tục vẽ khung
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
        // 🎯 Đếm tất cả faces đang được detect, không chỉ tracking
        return Array.from(this.faces.values()).filter(face => face.isTracked).length;
    }
}