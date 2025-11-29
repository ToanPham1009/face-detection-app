// Face Detection and Recognition functionality
class FaceDetector {
    constructor() {
        this.canvas = document.getElementById('faceCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Face Detection Models
        this.faceDetection = null;
        this.isModelLoading = false;
        this.modelsLoaded = false;

        // QUAN TRỌNG: ĐẢM BẢO faceTracker được khởi tạo
        this.faceTracker = new ImprovedFaceTracker();
        console.log('🎯 FaceTracker initialized');

        // Camera and Tracking State
        this.stream = null;
        this.isTracking = false;
        this.trackingInterval = null;
        this.sessionId = null;
        this.startTime = null;
        this.totalFacesCount = 0;

        // Thêm dòng này - khai báo uniqueFaces
        this.uniqueFaces = new Map(); // ← THÊM DÒNG NÀY

        // MediaPipe Variables
        this.lastResults = null;
        this.isDetectionRunning = false;

        // Video Element
        this.video = document.createElement('video');
        this.video.playsInline = true;
        this.video.muted = true;
        this.video.style.display = 'none';

        // Callbacks
        this.onFaceCountUpdate = null;
        this.onTotalFacesUpdate = null;
        this.onTrackingTimeUpdate = null;

        // Performance Settings
        this.minDetectionInterval = 1000 / 15; // 15 FPS
        this.canvasInitialized = false;

        console.log('🎯 FaceDetector initialized');

        this.loadMediaPipeModel();
    }

    async loadMediaPipeModel() {
        if (this.isModelLoading) return;

        this.isModelLoading = true;
        try {
            console.log('🔄 Loading MediaPipe Face Detection...');

            // Load Face Detection
            this.faceDetection = new FaceDetection({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`;
                }
            });

            this.faceDetection.setOptions({
                model: 'short',
                minDetectionConfidence: 0.7,
                minSuppressionThreshold: 0.3,
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

    async loadFaceLandmarker() {
        try {
            console.log('🔄 Loading MediaPipe Face Landmarker...');

            // Note: This requires the MediaPipe Tasks Vision library
            if (typeof FaceLandmarker === 'undefined') {
                console.warn('⚠️ FaceLandmarker not available, recognition disabled');
                this.recognitionModelsLoaded = false;
                return;
            }

            this.faceLandmarker = new FaceLandmarker({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/${file}`;
                }
            });

            await this.faceLandmarker.setOptions({
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                    delegate: "GPU"
                },
                runningMode: "VIDEO",
                numFaces: 10,
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: true,
            });

            this.recognitionModelsLoaded = true;
            console.log('✅ MediaPipe Face Landmarker loaded successfully');
        } catch (error) {
            console.error('❌ Error loading Face Landmarker:', error);
            this.recognitionModelsLoaded = false;
        }
    }

    handleMediaPipeResults(results) {
        // QUAN TRỌNG: Luôn xử lý kết quả ngay cả khi không tracking
        // để duy trì video display
        if (!this.isDetectionRunning) return;

        try {
            this.ctx.save();
            this.drawVideoFrame(); // Luôn vẽ video frame

            const detections = results.detections || [];

            // Chỉ log khi có tracking hoặc debug
            if (this.isTracking && detections.length > 0) {
                console.log(`🎯 MediaPipe detected: ${detections.length} faces`);
            }

            const formattedFaces = this.formatDetections(detections);

            if (formattedFaces.length > 0) {
                // Tạo simple embeddings từ các đặc điểm khuôn mặt
                this.createFaceEmbeddings(formattedFaces);

                // SAFE CHECK: Đảm bảo faceTracker tồn tại
                if (!this.faceTracker) {
                    console.error('❌ faceTracker not available for tracking');
                    return;
                }

                const trackedFaces = this.faceTracker.update(formattedFaces);
                this.drawFaceDetections(formattedFaces, trackedFaces);

                if (this.isTracking) {
                    this.updateTrackingStats(trackedFaces);
                } else {
                    // Vẫn cập nhật số khuôn mặt hiện tại ngay cả khi không tracking
                    if (this.onFaceCountUpdate) {
                        this.onFaceCountUpdate(trackedFaces.length);
                    }
                }
            } else {
                this.drawNoFacesInfo();
                if (this.onFaceCountUpdate) {
                    this.onFaceCountUpdate(0);
                }
            }

            this.drawStatusInfo();
            this.ctx.restore();

        } catch (error) {
            console.error('❌ Error handling MediaPipe results:', error);
            this.ctx.restore();

            // Vẽ lại video frame nếu có lỗi
            if (this.isCameraOn) {
                this.drawVideoFrame();
            }
        }
    }

    createFaceEmbeddings(faces) {
        faces.forEach(face => {
            // Tạo embedding đơn giản dựa trên hình dạng và vị trí khuôn mặt
            face.embedding = this.createSimpleFaceEmbedding(face);
        });
    }

    createSimpleFaceEmbedding(face) {
        const landmarks = face.landmarks || [];
        const embedding = [
            // Tỷ lệ và kích thước
            face.width / this.canvas.width,
            face.height / this.canvas.height,
            face.width / face.height, // Aspect ratio

            // Vị trí chuẩn hóa
            face.x / this.canvas.width,
            face.y / this.canvas.height,

            // Độ tin cậy
            face.confidence
        ];

        // Thêm thông tin từ landmarks nếu có
        if (landmarks.length >= 6) {
            // Khoảng cách giữa hai mắt
            const leftEye = landmarks[0];
            const rightEye = landmarks[2];
            const eyeDistance = Math.sqrt(
                Math.pow(leftEye.x - rightEye.x, 2) +
                Math.pow(leftEye.y - rightEye.y, 2)
            );
            embedding.push(eyeDistance);

            // Vị trí mắt trái
            embedding.push(leftEye.x);
            embedding.push(leftEye.y);

            // Vị trí mắt phải
            embedding.push(rightEye.x);
            embedding.push(rightEye.y);

            // Vị trí mũi
            const nose = landmarks[4];
            embedding.push(nose.x);
            embedding.push(nose.y);

            // Vị trí miệng
            const mouth = landmarks[5];
            embedding.push(mouth.x);
            embedding.push(mouth.y);
        }

        return embedding;
    }

    async extractFaceEmbeddings(faces) {
        if (!this.video || this.video.videoWidth === 0) return;

        try {
            for (const face of faces) {
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');

                tempCanvas.width = face.width;
                tempCanvas.height = face.height;

                // Extract face region from video
                tempCtx.drawImage(
                    this.video,
                    face.boundingBox.originX, face.boundingBox.originY,
                    face.width, face.height,
                    0, 0,
                    face.width, face.height
                );

                const imageData = tempCtx.getImageData(0, 0, face.width, face.height);
                const result = await this.faceLandmarker.detect(imageData);

                if (result.faceLandmarks && result.faceLandmarks.length > 0) {
                    face.embedding = this.extractEmbeddingFromLandmarks(result.faceLandmarks[0]);
                }
            }
        } catch (error) {
            console.error('❌ Error extracting face embeddings:', error);
        }
    }

    createSimpleEmbeddings(faces) {
        faces.forEach(face => {
            if (!face.embedding) {
                face.embedding = this.createSimpleEmbedding(face);
            }
        });
    }

    extractEmbeddingFromLandmarks(landmarks) {
        const embedding = [];
        const keyLandmarks = [10, 33, 61, 199, 291, 13, 14, 78, 308, 0, 267, 37, 84, 17, 61, 291, 405];

        keyLandmarks.forEach(index => {
            if (landmarks[index]) {
                embedding.push(landmarks[index].x);
                embedding.push(landmarks[index].y);
                embedding.push(landmarks[index].z || 0);
            }
        });

        return embedding;
    }

    createSimpleEmbedding(face) {
        const landmarks = face.landmarks || [];
        const embedding = [
            face.width / this.canvas.width,
            face.height / this.canvas.height,
            face.x / this.canvas.width,
            face.y / this.canvas.height,
            face.confidence
        ];

        if (landmarks.length >= 6) {
            const eyeDistance = Math.sqrt(
                Math.pow(landmarks[0].x - landmarks[2].x, 2) +
                Math.pow(landmarks[0].y - landmarks[2].y, 2)
            );
            embedding.push(eyeDistance);
            embedding.push(face.width / face.height);
        }

        return embedding;
    }

    formatDetections(detections) {
        const filteredDetections = detections
            .map((det, index) => {
                if (det.confidence < 0.6) {
                    return null;
                }

                const bbox = det.boundingBox;
                if (!bbox) {
                    return null;
                }

                let widthPx, heightPx, startXPx, startYPx;

                if (bbox.xCenter !== undefined && bbox.yCenter !== undefined) {
                    widthPx = bbox.width * this.canvas.width;
                    heightPx = bbox.height * this.canvas.height;

                    // SỬA: Không flip tọa độ X nữa, để MediaPipe tự xử lý
                    const originalStartX = (bbox.xCenter - bbox.width / 2) * this.canvas.width;
                    const originalStartY = (bbox.yCenter - bbox.height / 2) * this.canvas.height;

                    startXPx = originalStartX; // KHÔNG flip
                    startYPx = originalStartY;

                } else if (bbox.originX !== undefined && bbox.originY !== undefined) {
                    widthPx = bbox.width * this.canvas.width;
                    heightPx = bbox.height * this.canvas.height;

                    startXPx = bbox.originX * this.canvas.width; // KHÔNG flip
                    startYPx = bbox.originY * this.canvas.height;
                } else {
                    return null;
                }

                // Validate face size
                const minFaceSize = 80;
                const maxFaceSize = 350;

                if (widthPx < minFaceSize || heightPx < minFaceSize ||
                    widthPx > maxFaceSize || heightPx > maxFaceSize) {
                    return null;
                }

                // Validate aspect ratio
                const aspectRatio = widthPx / heightPx;
                if (aspectRatio < 0.7 || aspectRatio > 1.5) {
                    return null;
                }

                const centerXPx = startXPx + widthPx / 2;
                const centerYPx = startYPx + heightPx / 2;

                const faceData = {
                    x: centerXPx,
                    y: centerYPx,
                    width: widthPx,
                    height: heightPx,
                    landmarks: det.landmarks || [],
                    boundingBox: {
                        start: [startXPx, startYPx],
                        end: [startXPx + widthPx, startYPx + heightPx],
                        originX: startXPx,
                        originY: startYPx,
                        width: widthPx,
                        height: heightPx
                    },
                    confidence: det.confidence || 0.8,
                    rawConfidence: det.confidence
                };

                if (isNaN(faceData.x) || isNaN(faceData.y) || isNaN(faceData.width) || isNaN(faceData.height)) {
                    return null;
                }

                return faceData;
            })
            .filter(face => face !== null);

        // Áp dụng Non-Maximum Suppression
        return this.applyNonMaximumSuppression(filteredDetections);
    }

    applyNonMaximumSuppression(detections, iouThreshold = 0.4) {
        if (detections.length <= 1) {
            return detections;
        }

        const sortedDetections = [...detections].sort((a, b) => b.confidence - a.confidence);
        const selectedDetections = [];

        while (sortedDetections.length > 0) {
            const bestDetection = sortedDetections.shift();
            selectedDetections.push(bestDetection);

            for (let i = sortedDetections.length - 1; i >= 0; i--) {
                const iou = this.calculateDetectionIoU(bestDetection, sortedDetections[i]);
                if (iou > iouThreshold) {
                    sortedDetections.splice(i, 1);
                }
            }
        }

        return selectedDetections;
    }

    calculateDetectionIoU(face1, face2) {
        try {
            const box1 = {
                left: face1.boundingBox.originX,
                top: face1.boundingBox.originY,
                right: face1.boundingBox.originX + face1.boundingBox.width,
                bottom: face1.boundingBox.originY + face1.boundingBox.height
            };

            const box2 = {
                left: face2.boundingBox.originX,
                top: face2.boundingBox.originY,
                right: face2.boundingBox.originX + face2.boundingBox.width,
                bottom: face2.boundingBox.originY + face2.boundingBox.height
            };

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
            return 0;
        }
    }

    drawFaceDetections(formattedFaces, trackedFaces) {
        const trackedFaceMap = new Map();
        trackedFaces.forEach(face => {
            trackedFaceMap.set(face.id, face);
        });

        formattedFaces.forEach((face) => {
            const startX = face.boundingBox.start[0];
            const startY = face.boundingBox.start[1];
            const width = face.width;
            const height = face.height;

            if (isNaN(startX) || isNaN(startY) || isNaN(width) || isNaN(height)) {
                return;
            }

            // Tìm face được track tương ứng
            let trackedFace = null;
            let minDistance = Infinity;

            for (const [faceId, tFace] of trackedFaceMap) {
                const distance = Math.sqrt(
                    Math.pow(face.x - tFace.x, 2) +
                    Math.pow(face.y - tFace.y, 2)
                );

                if (distance < 50 && distance < minDistance) {
                    minDistance = distance;
                    trackedFace = tFace;
                }
            }

            this.drawBoundingBox([startX, startY], [width, height], trackedFace, face.confidence);
            this.drawLandmarks(face.landmarks);
        });
    }

    drawBoundingBox(start, size, trackedFace, confidence) {
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // KHÔNG flip

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
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = boxColor;

        // Vẽ bounding box
        this.ctx.strokeRect(start[0], start[1], size[0], size[1]);

        // Vẽ ID khuôn mặt - CHỮ SẼ HIỂN THỊ ĐÚNG
        this.ctx.fillStyle = textColor;
        this.ctx.font = 'bold 12px Arial';

        const infoText = trackedFace ?
            `Face ${trackedFace.id}` :
            `Face (${(confidence * 100).toFixed(0)}%)`;

        this.ctx.fillText(infoText, start[0], start[1] - 8);

        this.ctx.restore();
    }

    drawLandmarks(landmarks) {
        if (!landmarks || landmarks.length < 6) return;

        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // KHÔNG flip

        this.ctx.fillStyle = '#00ff00';
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 1.5;

        // Vẽ các điểm landmarks - KHÔNG flip
        landmarks.forEach((landmark) => {
            const x = landmark.x * this.canvas.width;
            const y = landmark.y * this.canvas.height;

            this.ctx.beginPath();
            this.ctx.arc(x, y, 3, 0, 2 * Math.PI);
            this.ctx.fill();
        });

        // Vẽ đường nối các landmarks
        this.ctx.beginPath();

        // Mắt phải
        this.ctx.moveTo(landmarks[0].x * this.canvas.width, landmarks[0].y * this.canvas.height);
        this.ctx.lineTo(landmarks[1].x * this.canvas.width, landmarks[1].y * this.canvas.height);

        // Mắt trái
        this.ctx.moveTo(landmarks[2].x * this.canvas.width, landmarks[2].y * this.canvas.height);
        this.ctx.lineTo(landmarks[3].x * this.canvas.width, landmarks[3].y * this.canvas.height);

        // Mũi (chữ thập)
        const noseX = landmarks[4].x * this.canvas.width;
        const noseY = landmarks[4].y * this.canvas.height;
        this.ctx.moveTo(noseX - 4, noseY);
        this.ctx.lineTo(noseX + 4, noseY);
        this.ctx.moveTo(noseX, noseY - 4);
        this.ctx.lineTo(noseX, noseY + 4);

        // Miệng
        const mouthX = landmarks[5].x * this.canvas.width;
        const mouthY = landmarks[5].y * this.canvas.height;
        this.ctx.moveTo(mouthX - 4, mouthY);
        this.ctx.lineTo(mouthX + 4, mouthY);

        this.ctx.stroke();
        this.ctx.restore();
    }

    getBoundingBoxFromFace(face) {
        return {
            left: face.boundingBox.originX,
            top: face.boundingBox.originY,
            right: face.boundingBox.originX + face.boundingBox.width,
            bottom: face.boundingBox.originY + face.boundingBox.height
        };
    }

    drawMediaPipeDetections(formattedFaces, trackedFaces) {
        const trackedFaceMap = new Map();
        trackedFaces.forEach(face => {
            trackedFaceMap.set(face.id, face);
        });

        formattedFaces.forEach((face, index) => {
            const startX = face.boundingBox.start[0];
            const startY = face.boundingBox.start[1];
            const width = face.width;
            const height = face.height;

            if (isNaN(startX) || isNaN(startY) || isNaN(width) || isNaN(height)) {
                return;
            }

            const start = [startX, startY];
            const size = [width, height];

            // Find matching tracked face
            let bestFaceId = null;
            let minDistance = Infinity;

            for (const [faceId, trackedFace] of trackedFaceMap) {
                if (!trackedFace || isNaN(trackedFace.x) || isNaN(trackedFace.y)) {
                    continue;
                }

                const distance = Math.sqrt(
                    Math.pow(face.x - trackedFace.x, 2) +
                    Math.pow(face.y - trackedFace.y, 2)
                );

                if (distance < 50 && distance < minDistance) {
                    minDistance = distance;
                    bestFaceId = faceId;
                }
            }

            const trackedFace = bestFaceId ? trackedFaceMap.get(bestFaceId) : null;
            const confidence = face.confidence || 0;

            this.drawStableBoundingBox(start, size, trackedFace, confidence, face.landmarks?.length >= 6);
            this.drawMediaPipeLandmarks(face.landmarks);
        });
    }

    drawStableBoundingBox(start, size, trackedFace, confidence, hasGoodLandmarks) {
        if (!start || start[0] === undefined || start[1] === undefined ||
            isNaN(start[0]) || isNaN(start[1]) || isNaN(size[0]) || isNaN(size[1])) {
            return;
        }

        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);

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
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = boxColor;

        this.ctx.strokeRect(start[0], start[1], size[0], size[1]);

        this.ctx.fillStyle = textColor;
        this.ctx.font = 'bold 12px Arial';

        const infoText = trackedFace ?
            `Face ${trackedFace.id}` :
            `Face (${(confidence * 100).toFixed(0)}%)`;

        this.ctx.fillText(infoText, start[0], start[1] - 8);

        this.ctx.restore();
        this.ctx.translate(this.canvas.width, 0);
        this.ctx.scale(-1, 1);
    }

    drawMediaPipeLandmarks(landmarks) {
        if (!landmarks || landmarks.length < 6) {
            return;
        }

        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);

        this.ctx.fillStyle = '#00ff00';
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 1.5;

        landmarks.forEach((landmark) => {
            const flippedX = this.canvas.width - (landmark.x * this.canvas.width);
            const y = landmark.y * this.canvas.height;

            this.ctx.beginPath();
            this.ctx.arc(flippedX, y, 3, 0, 2 * Math.PI);
            this.ctx.fill();
        });

        // Draw face connections
        this.ctx.beginPath();

        // Right eye
        const flippedX0 = this.canvas.width - (landmarks[0].x * this.canvas.width);
        const flippedX1 = this.canvas.width - (landmarks[1].x * this.canvas.width);
        this.ctx.moveTo(flippedX0, landmarks[0].y * this.canvas.height);
        this.ctx.lineTo(flippedX1, landmarks[1].y * this.canvas.height);

        // Left eye
        const flippedX2 = this.canvas.width - (landmarks[2].x * this.canvas.width);
        const flippedX3 = this.canvas.width - (landmarks[3].x * this.canvas.width);
        this.ctx.moveTo(flippedX2, landmarks[2].y * this.canvas.height);
        this.ctx.lineTo(flippedX3, landmarks[3].y * this.canvas.height);

        // Nose
        const flippedX4 = this.canvas.width - (landmarks[4].x * this.canvas.width);
        this.ctx.moveTo(flippedX4 - 4, landmarks[4].y * this.canvas.height);
        this.ctx.lineTo(flippedX4 + 4, landmarks[4].y * this.canvas.height);
        this.ctx.moveTo(flippedX4, landmarks[4].y * this.canvas.height - 4);
        this.ctx.lineTo(flippedX4, landmarks[4].y * this.canvas.height + 4);

        // Mouth
        const flippedX5 = this.canvas.width - (landmarks[5].x * this.canvas.width);
        this.ctx.moveTo(flippedX5 - 4, landmarks[5].y * this.canvas.height);
        this.ctx.lineTo(flippedX5 + 4, landmarks[5].y * this.canvas.height);

        this.ctx.stroke();
        this.ctx.restore();
        this.ctx.translate(this.canvas.width, 0);
        this.ctx.scale(-1, 1);
    }

    startDetectionLoop() {
        if (this.isDetectionRunning) return;

        this.isDetectionRunning = true;
        this.lastDetectionTime = 0;

        console.log('🔄 Starting MediaPipe detection loop...');

        const detectionLoop = async (timestamp) => {
            // QUAN TRỌNG: Luôn chạy khi camera đang bật, không phụ thuộc vào tracking
            if (!this.isCameraOn || !this.isDetectionRunning) {
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
                    // Vẽ lại video frame nếu có lỗi detection
                    if (this.isCameraOn) {
                        this.drawVideoFrame();
                    }
                }
            }

            // QUAN TRỌNG: Luôn tiếp tục loop khi camera đang bật
            if (this.isCameraOn && this.isDetectionRunning) {
                requestAnimationFrame(detectionLoop);
            } else {
                this.isDetectionRunning = false;
            }
        };

        requestAnimationFrame(detectionLoop);
    }

    // Thêm vào class FaceDetector
    ensureVideoDisplay() {
        if (!this.isCameraOn) return;

        console.log('🔄 Ensuring video display...');

        // Force redraw
        this.drawVideoFrame();
        this.drawStatusInfo();

        // Kiểm tra và khởi động lại detection loop nếu cần
        if (!this.isDetectionRunning) {
            console.log('🔄 Restarting detection loop...');
            this.startDetectionLoop();
        }
    }

    async detectWithMediaPipe() {
        if (!this.faceDetection || !this.video || this.video.videoWidth === 0) {
            return;
        }

        try {
            await this.faceDetection.send({ image: this.video });
        } catch (error) {
            console.error('❌ MediaPipe detection error:', error);
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

            if (!this.video.parentNode) {
                document.body.appendChild(this.video);
            }

            this.video.srcObject = this.stream;

            await new Promise((resolve, reject) => {
                let resolved = false;

                this.video.onloadedmetadata = () => {
                    if (!resolved) {
                        resolved = true;
                        resolve();
                    }
                };

                this.video.onerror = (error) => {
                    if (!resolved) {
                        reject(error);
                    }
                };

                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        resolve();
                    }
                }, 5000);
            });

            this.initializeCanvas();
            await this.video.play();

            this.isCameraOn = true;

            // Wait for models if not loaded
            if (!this.modelsLoaded) {
                let attempts = 0;
                while (!this.modelsLoaded && attempts < 30) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    attempts++;
                }
            }

            this.startDetectionLoop();
            this.updateButtonStates();

            console.log('✅ Camera started successfully');

        } catch (error) {
            console.error('❌ Error accessing camera:', error);
            alert('Không thể truy cập camera. Vui lòng kiểm tra quyền truy cập.');
            this.isCameraOn = false;
            this.updateButtonStates();
        }
    }

    drawNoFacesInfo() {
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // KHÔNG flip cho text

        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';

        if (this.isTracking) {
            this.ctx.fillText('🔍 Đang tìm khuôn mặt...', this.canvas.width / 2, 30);
            this.ctx.font = '12px Arial';
            this.ctx.fillText('Camera đang hoạt động - Chờ phát hiện khuôn mặt', this.canvas.width / 2, 50);
        } else if (this.stream) {
            this.ctx.fillText('📷 Camera đang chạy', this.canvas.width / 2, 30);
            this.ctx.font = '12px Arial';
            this.ctx.fillText('Nhấn "Bắt đầu Theo dõi" để thống kê khuôn mặt', this.canvas.width / 2, 50);
        } else {
            this.ctx.fillText('📷 Camera đã tắt', this.canvas.width / 2, 30);
            this.ctx.font = '12px Arial';
            this.ctx.fillText('Nhấn "Bật Camera" để bắt đầu', this.canvas.width / 2, 50);
        }

        this.ctx.restore();
    }

    drawStatusInfo() {
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // KHÔNG flip cho text

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(10, 10, 250, 80);

        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'left';

        if (this.isTracking) {
            this.ctx.fillText('🎭 Đang Theo Dõi (MediaPipe)', 20, 30);
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`Tổng lượt: ${this.totalFacesCount}`, 20, 50);
            this.ctx.fillText(`Hiện tại: ${this.faceTracker.getTrackedFacesCount()}`, 20, 70);
        } else if (this.stream) {
            this.ctx.fillText('📷 Camera (MediaPipe)', 20, 30);
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`Khuôn mặt: ${this.faceTracker.getTrackedFacesCount()}`, 20, 50);
            this.ctx.fillText('⏸️ Sẵn sàng thống kê', 20, 70);
        } else {
            this.ctx.fillText('📷 Camera (MediaPipe)', 20, 30);
            this.ctx.font = '12px Arial';
            this.ctx.fillText('🛑 Camera đã tắt', 20, 50);
            this.ctx.fillText('Nhấn "Bật Camera"', 20, 70);
        }

        this.ctx.restore();
    }

    initializeCanvas() {
        if (!this.video || this.video.videoWidth === 0) {
            setTimeout(() => this.initializeCanvas(), 100);
            return;
        }

        try {
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;

            // Reset transform - video sẽ được flip khi vẽ frame
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);

            this.canvasInitialized = true;
            this.drawVideoFrame();

        } catch (error) {
            console.error('❌ Canvas initialization error:', error);
        }
    }

    drawVideoFrame() {
        if (!this.video || this.video.videoWidth === 0 || this.video.videoHeight === 0) {
            this.ctx.save();
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.fillStyle = '#000000';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.restore();
            return;
        }

        try {
            this.ctx.save();
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.fillStyle = '#000000';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            // Vẽ video KHÔNG flip - để hiển thị đúng hướng
            this.ctx.drawImage(
                this.video,
                0, 0,
                this.canvas.width,
                this.canvas.height
            );

            this.ctx.restore();

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

        // ĐẢM BẢO faceTracker tồn tại
        if (!this.faceTracker) {
            console.error('❌ faceTracker not initialized, creating new one');
            this.faceTracker = new ImprovedFaceTracker();
        }

        // RESET HOÀN TOÀN trước khi bắt đầu
        this.faceTracker.resetCompletely();


        this.isTracking = true;
        this.sessionId = Date.now().toString();
        this.startTime = Date.now();
        this.totalFacesCount = 0;
        this.uniqueFaces.clear();
        this.faceTracker.reset();

        // Đảm bảo uniqueFaces được khởi tạo
        if (!this.uniqueFaces) {
            this.uniqueFaces = new Map();
        } else {
            this.uniqueFaces.clear();
        }

        const recordingStatus = document.getElementById('recordingStatus');
        if (recordingStatus) {
            recordingStatus.classList.add('active');
        }

        // Đảm bảo timeInterval được khởi tạo đúng
        if (this.timeInterval) {
            clearInterval(this.timeInterval);
        }

        this.timeInterval = setInterval(() => {
            if (this.isTracking && this.onTrackingTimeUpdate) {
                const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
                this.onTrackingTimeUpdate(elapsedSeconds);
            }
        }, 1000);

        this.updateButtonStates();
        console.log('✅ Face tracking started');
    }

    stopTracking() {
        if (!this.isTracking) return;

        console.log('⏸️ Stopping face tracking...');

        this.isTracking = false;

        const recordingStatus = document.getElementById('recordingStatus');
        if (recordingStatus) {
            recordingStatus.classList.remove('active');
        }

        if (this.timeInterval) {
            clearInterval(this.timeInterval);
            this.timeInterval = null;
        }

        // KHÔNG reset totalFacesCount - giữ lại số đã đếm
        // this.totalFacesCount = 0;

        // KHÔNG xóa uniqueFaces
        // if (this.uniqueFaces) {
        //     this.uniqueFaces.clear();
        // }

        if (this.onFaceCountUpdate) this.onFaceCountUpdate(0);
        if (this.onTotalFacesUpdate) this.onTotalFacesUpdate(this.totalFacesCount); // Giữ tổng số
        if (this.onTrackingTimeUpdate) this.onTrackingTimeUpdate(0);

        // QUAN TRỌNG: Đảm bảo detection loop vẫn chạy
        if (this.isCameraOn && !this.isDetectionRunning) {
            this.startDetectionLoop();
        }

        // Vẽ lại video frame ngay lập tức
        if (this.isCameraOn) {
            this.drawVideoFrame();
            this.drawStatusInfo();
        }

        this.updateButtonStates();
        console.log('✅ Face tracking stopped - camera still running');
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

        // Dừng tracking trước
        if (this.isTracking) {
            this.stopTracking();
        }

        if (this.faceDetection) {
            try {
                this.faceDetection.close();
            } catch (error) {
                console.log('MediaPipe cleanup:', error);
            }
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        if (this.video) {
            this.video.pause();
            this.video.srcObject = null;
        }

        // Xóa interval nếu tồn tại
        if (this.timeInterval) {
            clearInterval(this.timeInterval);
            this.timeInterval = null;
        }

        if (this.isTracking) {
            this.stopTracking();
        }

        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);

            this.ctx.fillStyle = '#000000';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('📷 Camera đã tắt', this.canvas.width / 2, this.canvas.height / 2 - 20);
            this.ctx.font = '14px Arial';
            this.ctx.fillText('Nhấn "Bật Camera" để bắt đầu', this.canvas.width / 2, this.canvas.height / 2 + 10);
        }

        this.isCameraOn = false;
        this.updateButtonStates();
        console.log('✅ Camera stopped');
    }

    setCallbacks(callbacks) {
        this.onFaceCountUpdate = callbacks.onFaceCountUpdate;
        this.onTotalFacesUpdate = callbacks.onTotalFacesUpdate;
        this.onTrackingTimeUpdate = callbacks.onTrackingTimeUpdate;
        console.log('✅ Callbacks set');
    }

    // SỬA updateTrackingStats để debug
    // SỬA PHƯƠNG THỨC updateTrackingStats
    updateTrackingStats(trackedFaces) {
        if (!this.isTracking) return;

        try {
            const currentFaceCount = trackedFaces.length;

            // DEBUG: Kiểm tra faceTracker tồn tại
            if (!this.faceTracker) {
                console.error('❌ faceTracker is undefined!');
                return;
            }

            // DEBUG: Log face appearances map
            console.log('🔍 FaceAppearances Map:', Array.from(this.faceTracker.faceAppearances.entries()));

            let newAppearances = 0;
            trackedFaces.forEach(face => {
                if (face.isNew) {
                    newAppearances++;
                    console.log(`🎉 TRULY NEW APPEARANCE: face ${face.id}`);
                }
            });

            // Lấy tổng số lượt xuất hiện từ tracker
            this.totalFacesCount = this.faceTracker.getTotalAppearances();

            // DEBUG: Verify total count
            console.log(`🔢 Total faces count: ${this.totalFacesCount}`);

            if (this.onFaceCountUpdate) {
                this.onFaceCountUpdate(currentFaceCount);
            }

            if (this.onTotalFacesUpdate) {
                this.onTotalFacesUpdate(this.totalFacesCount);
            }

            console.log(`📈 Stats: current=${currentFaceCount}, new=${newAppearances}, total_appearances=${this.totalFacesCount}`);

        } catch (error) {
            console.error('❌ Error updating tracking stats:', error);
        }
    }

    // Thêm vào class FaceDetector trong faceDetection.js
    debugVideoState() {
        console.log('🐛 DEBUG VIDEO STATE:');
        console.log('- Camera on:', this.isCameraOn);
        console.log('- Tracking:', this.isTracking);
        console.log('- Stream:', this.stream ? 'Active' : 'None');
        console.log('- Video readyState:', this.video?.readyState);
        console.log('- Video width:', this.video?.videoWidth);
        console.log('- Video height:', this.video?.videoHeight);
        console.log('- Canvas width:', this.canvas?.width);
        console.log('- Canvas height:', this.canvas?.height);
        console.log('- Detection running:', this.isDetectionRunning);
        console.log('- Models loaded:', this.modelsLoaded);

        // Kiểm tra xem video có đang phát không
        if (this.video) {
            console.log('- Video paused:', this.video.paused);
            console.log('- Video currentTime:', this.video.currentTime);
            console.log('- Video duration:', this.video.duration);
        }

        // Force redraw nếu camera đang chạy
        if (this.isCameraOn) {
            this.drawVideoFrame();
            this.drawStatusInfo();
            console.log('🔄 Forced redraw completed');
        }
    }
    // Thêm vào class FaceDetector
    getCameraState() {
        return {
            isCameraOn: this.isCameraOn,
            isTracking: this.isTracking,
            isDetectionRunning: this.isDetectionRunning,
            stream: !!this.stream,
            videoReady: this.video && this.video.readyState > 0,
            modelsLoaded: this.modelsLoaded
        };
    }
}

// Improved Face Tracker with Appearance Counting - PHIÊN BẢN ĐÃ SỬA
class ImprovedFaceTracker {
    constructor() {
        this.faces = new Map();
        this.nextId = 1;
        this.maxFramesLost = 30;

        // Tracking thresholds
        this.positionThreshold = 0.6;
        this.recognitionThreshold = 0.8;

        this.positionHistory = new Map();
        this.smoothingFactor = 0.3;

        // Appearance tracking
        this.faceAppearances = new Map(); // faceSignature -> count
        this.departedFaces = new Map(); // faceSignature -> faceData
        this.activeFaces = new Set(); // faceSignature của các khuôn mặt đang trong khung hình

        // Thêm biến để theo dõi trạng thái
        this.faceInFrameStatus = new Map(); // faceSignature -> boolean (đang trong khung hình hay không)
        this.lastAppearanceTime = new Map(); // ← THÊM DÒNG NÀY
        this.minReappearanceDelay = 3000; // ← THÊM: 3 giây giữa các lần đếm
    }

    reset() {
        this.faces.clear();
        this.nextId = 1;
        this.positionHistory.clear();
        this.faceAppearances.clear();
        this.departedFaces.clear();
        this.activeFaces.clear();
        this.faceInFrameStatus.clear();
    }

    // THÊM PHƯƠNG THỨC registerFaceSignature
    registerFaceSignature(face) {
        if (!face.embedding) return null;

        const signature = this.getFaceSignature(face);
        if (signature) {
            // Chỉ tạo mới nếu chưa tồn tại
            if (!this.faceAppearances.has(signature)) {
                this.faceAppearances.set(signature, 0); // Khởi tạo count = 0
                console.log(`📝 Registered new face signature: ${signature}`);
            }
            // Luôn cập nhật trạng thái vào khung hình
            this.faceInFrameStatus.set(signature, true);
        }
        return signature;
    }

    update(currentFaces) {
        // Đánh dấu tất cả faces hiện tại là không seen
        for (const face of this.faces.values()) {
            face.seen = false;
            face.framesLost++;
        }

        const results = [];
        const usedMatches = new Set();

        // Theo dõi khuôn mặt đang active trong frame hiện tại
        const currentActiveSignatures = new Set();

        // Giai đoạn 1: Match với faces đang được track
        for (const currentFace of currentFaces) {
            let bestMatch = null;
            let bestScore = this.positionThreshold;
            let bestMatchId = null;

            // Tạo signature cho khuôn mặt hiện tại
            const currentSignature = this.getFaceSignature(currentFace);
            if (currentSignature) {
                currentActiveSignatures.add(currentSignature);
            }

            // Tìm match tốt nhất
            for (const [id, knownFace] of this.faces.entries()) {
                if (knownFace.seen || usedMatches.has(id)) continue;

                const score = this.calculateMatchScore(currentFace, knownFace);

                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = knownFace;
                    bestMatchId = id;
                }
            }

            if (bestMatch && bestMatchId) {
                // Match found - update existing face
                this.updateFaceWithSmoothing(bestMatch, currentFace);
                bestMatch.seen = true;
                bestMatch.framesLost = 0;
                bestMatch.isTracked = true;
                bestMatch.confidence = currentFace.confidence;
                bestMatch.lastSeen = Date.now();

                // Update embedding để cải thiện recognition
                if (currentFace.embedding) {
                    // Smooth embedding update
                    if (!bestMatch.embedding) {
                        bestMatch.embedding = currentFace.embedding;
                    } else {
                        // Cập nhật embedding với smoothing
                        for (let i = 0; i < bestMatch.embedding.length; i++) {
                            bestMatch.embedding[i] = this.lerp(
                                bestMatch.embedding[i],
                                currentFace.embedding[i],
                                0.3
                            );
                        }
                    }
                }

                usedMatches.add(bestMatchId);

                // Kiểm tra xem khuôn mặt này vừa mới vào khung hình
                const faceSignature = this.getFaceSignature(bestMatch);
                const isNewAppearance = this.checkAndUpdateFrameEntry(faceSignature);

                results.push({
                    id: bestMatchId,
                    isNew: isNewAppearance,
                    x: bestMatch.x,
                    y: bestMatch.y,
                    width: bestMatch.width,
                    height: bestMatch.height,
                    confidence: bestMatch.confidence
                });

                // TĂNG ĐẾM NẾU LÀ XUẤT HIỆN MỚI
                if (isNewAppearance) {
                    this.incrementAppearanceCount(bestMatch);
                    console.log(`🎉 Face ${bestMatchId} entered frame - COUNT: ${this.faceAppearances.get(faceSignature)}`);
                }

            } else {
                // Thử fallback matching nếu không tìm thấy match chính
                const fallbackMatch = this.findFallbackMatch(currentFace);

                if (fallbackMatch && fallbackMatch.distance < 50) {
                    console.log(`🔄 Using fallback match for face ${fallbackMatch.id}, distance: ${fallbackMatch.distance.toFixed(1)}`);
                    bestMatch = fallbackMatch.face;
                    bestMatchId = fallbackMatch.id;

                    // Update existing face với fallback
                    this.updateFaceWithSmoothing(bestMatch, currentFace);
                    bestMatch.seen = true;
                    bestMatch.framesLost = 0;
                    bestMatch.isTracked = true;
                    bestMatch.confidence = currentFace.confidence;
                    bestMatch.lastSeen = Date.now();

                    // Update embedding với smoothing mạnh hơn
                    if (currentFace.embedding && bestMatch.embedding) {
                        for (let i = 0; i < bestMatch.embedding.length; i++) {
                            bestMatch.embedding[i] = this.lerp(
                                bestMatch.embedding[i],
                                currentFace.embedding[i],
                                0.5 // Tăng smoothing
                            );
                        }
                    }

                    usedMatches.add(bestMatchId);

                    const faceSignature = this.getFaceSignature(bestMatch);
                    const isNewAppearance = this.checkAndUpdateFrameEntry(faceSignature);

                    results.push({
                        id: bestMatchId,
                        isNew: isNewAppearance,
                        x: bestMatch.x,
                        y: bestMatch.y,
                        width: bestMatch.width,
                        height: bestMatch.height,
                        confidence: bestMatch.confidence
                    });

                    if (isNewAppearance) {
                        this.incrementAppearanceCount(bestMatch);
                        console.log(`🎉 Face ${bestMatchId} entered frame (fallback) - COUNT: ${this.faceAppearances.get(faceSignature)}`);
                    }

                } else {
                    // Tạo face mới thực sự
                    const newFace = this.createNewFace(currentFace);
                    this.faces.set(newFace.id, newFace);

                    // Đăng ký face signature và đánh dấu là vào khung hình
                    const faceSignature = this.registerFaceSignature(newFace);

                    // QUAN TRỌNG: Luôn tăng count cho face mới (không check time)
                    if (faceSignature) {
                        const currentCount = this.faceAppearances.get(faceSignature) || 0;
                        this.faceAppearances.set(faceSignature, currentCount + 1);
                        this.lastAppearanceTime.set(faceSignature, Date.now());
                        console.log(`🎉 Face ${newFace.id} FIRST APPEARANCE - COUNT: ${currentCount + 1}`);
                    }

                    results.push({
                        id: newFace.id,
                        isNew: true,
                        x: currentFace.x,
                        y: currentFace.y,
                        width: currentFace.width,
                        height: currentFace.height,
                        confidence: currentFace.confidence
                    });
                }
            }
        }

        // Xử lý các khuôn mặt rời khung hình
        this.handleFrameExits(currentActiveSignatures);

        // Xử lý faces rời khung hình
        this.handleDepartedFaces();

        // Dọn dẹp faces mất tích
        this.cleanupLostFaces();

        return results;
    }

    // PHƯƠNG THỨC MỚI: Kiểm tra và cập nhật trạng thái vào khung hình
    // TRONG ImprovedFaceTracker class - SỬA PHƯƠNG THỨC NÀY
    checkAndUpdateFrameEntry(faceSignature) {
        if (!faceSignature) return false;

        const wasInFrame = this.faceInFrameStatus.get(faceSignature) || false;
        const currentTime = Date.now();

        if (!wasInFrame) {
            // Kiểm tra thời gian tối thiểu giữa các lần xuất hiện (ít nhất 2 giây)
            const lastAppearanceTime = this.lastAppearanceTime.get(faceSignature) || 0;
            const timeSinceLastAppearance = currentTime - lastAppearanceTime;

            // CHỈ tính là xuất hiện mới nếu đã qua ít nhất 2-3 giây
            if (timeSinceLastAppearance > 2000) { // 2000ms = 2 giây
                this.faceInFrameStatus.set(faceSignature, true);
                this.lastAppearanceTime.set(faceSignature, currentTime);
                console.log(`🎯 Face ${faceSignature} ENTERED frame after ${timeSinceLastAppearance}ms`);
                return true;
            } else {
                // Vẫn đánh dấu là trong frame nhưng không tính là xuất hiện mới
                this.faceInFrameStatus.set(faceSignature, true);
                return false;
            }
        }

        return false;
    }

    // PHƯƠNG THỨC MỚI: Xử lý các khuôn mặt rời khung hình
    handleFrameExits(currentActiveSignatures) {
        // Duyệt qua tất cả các khuôn mặt đã từng xuất hiện
        for (const [signature, wasInFrame] of this.faceInFrameStatus.entries()) {
            if (wasInFrame && !currentActiveSignatures.has(signature)) {
                // Khuôn mặt đã rời khung hình
                this.faceInFrameStatus.set(signature, false);
                console.log(`🚪 Face ${signature} left the frame`);
            }
        }
    }

    // SỬA PHƯƠNG THỨC NÀY
    // SỬA PHƯƠNG THỨC incrementAppearanceCount
    incrementAppearanceCount(face) {
        if (!face.embedding) {
            console.log('❌ No embedding for face, cannot count');
            return;
        }

        const signature = this.getFaceSignature(face);
        if (!signature) {
            console.log('❌ No signature for face, cannot count');
            return;
        }

        const currentTime = Date.now();
        const lastTime = this.lastAppearanceTime.get(signature) || 0;

        // DEBUG: Log timing info
        console.log(`⏰ Face timing: current=${currentTime}, last=${lastTime}, diff=${currentTime - lastTime}`);

        // CHỈ tăng count nếu đã qua đủ thời gian (3 giây)
        if (currentTime - lastTime >= this.minReappearanceDelay) {
            const currentCount = this.faceAppearances.get(signature) || 0;
            const newCount = currentCount + 1;
            this.faceAppearances.set(signature, newCount);
            this.lastAppearanceTime.set(signature, currentTime);
            console.log(`✅ 📈 Face ${face.id} appearance count: ${newCount} (after ${currentTime - lastTime}ms)`);
            return true; // Đếm thành công
        } else {
            console.log(`⏸️ Face ${face.id} skipped - too soon: ${currentTime - lastTime}ms`);
            return false; // Không đếm
        }
    }

    getFaceSignature(face) {
        if (!face.embedding || face.embedding.length < 8) return null;

        // Tạo signature từ 8 giá trị đầu của embedding với độ chính xác thấp hơn
        // để giảm sensitivity với thay đổi nhỏ
        return face.embedding.slice(0, 8).map(val => {
            // Làm tròn đến 2 chữ số thập phân để ổn định hơn (giảm từ 3 xuống 2)
            return Math.round(val * 100) / 100;
        }).join('-');
    }

    getTotalAppearances() {
        let total = 0;
        for (const count of this.faceAppearances.values()) {
            total += count;
        }
        console.log(`🔢 getTotalAppearances: ${total} from ${this.faceAppearances.size} signatures`);
        return total;
    }

    getUniqueFacesCount() {
        return this.faceAppearances.size;
    }

    getTrackedFacesCount() {
        return Array.from(this.faces.values()).filter(face => face.isTracked).length;
    }

    // CÁC PHƯƠNG THỨC HIỆN CÓ KHÁC - GIỮ NGUYÊN
    calculateMatchScore(currentFace, knownFace) {
        // Tính điểm dựa trên vị trí trước
        const positionalScore = this.calculatePositionalScore(currentFace, knownFace);

        // Nếu positional score quá thấp, không cần kiểm tra embedding
        if (positionalScore < 0.3) {
            return 0;
        }

        let recognitionScore = 0;
        if (currentFace.embedding && knownFace.embedding) {
            recognitionScore = this.calculateEmbeddingSimilarity(currentFace.embedding, knownFace.embedding);

            // DEBUG: Log similarity score
            if (recognitionScore > 0.5) {
                console.log(`🔍 Face matching: positional=${positionalScore.toFixed(2)}, recognition=${recognitionScore.toFixed(2)}`);
            }

            // Nếu recognition score cao, ưu tiên hơn
            if (recognitionScore > 0.85) {
                return 0.9 + (recognitionScore * 0.1);
            } else if (recognitionScore > 0.7) {
                return 0.7 + (recognitionScore * 0.3);
            } else if (recognitionScore > 0.6) {
                return 0.5 + (recognitionScore * 0.2);
            }
        }

        // Nếu không có embedding hoặc recognition score thấp, dùng positional
        return positionalScore;
    }

    calculateEmbeddingSimilarity(embedding1, embedding2) {
        if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
            return 0;
        }

        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < embedding1.length; i++) {
            dotProduct += embedding1[i] * embedding2[i];
            norm1 += embedding1[i] * embedding1[i];
            norm2 += embedding2[i] * embedding2[i];
        }

        norm1 = Math.sqrt(norm1);
        norm2 = Math.sqrt(norm2);

        const similarity = norm1 === 0 || norm2 === 0 ? 0 : dotProduct / (norm1 * norm2);

        // Giảm threshold để dễ match hơn
        return similarity > 0.4 ? similarity : 0;
    }

    calculatePositionalScore(currentFace, knownFace) {
        const iouScore = this.calculateIoU(currentFace, knownFace);
        const distance = this.calculateDistance(currentFace, knownFace);

        // Tăng tolerance - cho phép khoảng cách lớn hơn
        if (iouScore < 0.1 && distance > 150) {
            return 0;
        }

        const sizeSimilarity = this.calculateSizeSimilarity(currentFace, knownFace);

        const score = (iouScore * 0.5) +
            (Math.max(0, 1 - distance / 200) * 0.4) + // Tăng max distance
            (sizeSimilarity * 0.1);

        // DEBUG
        if (score > 0.4) {
            console.log(`📍 Positional score: iou=${iouScore.toFixed(2)}, dist=${distance.toFixed(0)}, size=${sizeSimilarity.toFixed(2)}, total=${score.toFixed(2)}`);
        }

        return score;
    }

    findRecognitionMatch(currentFace) {
        if (!currentFace.embedding) return null;

        let bestMatch = null;
        let bestScore = 0;

        for (const [id, knownFace] of this.faces.entries()) {
            if (!knownFace.embedding) continue;

            const similarity = this.calculateEmbeddingSimilarity(
                currentFace.embedding,
                knownFace.embedding
            );

            if (similarity > this.recognitionThreshold && similarity > bestScore) {
                bestScore = similarity;
                bestMatch = knownFace;
                bestMatchId = id;
            }
        }

        return bestMatch ? { face: bestMatch, id: bestMatchId, score: bestScore } : null;
    }

    checkFaceReappearance(currentFace) {
        if (!currentFace.embedding) return null;

        for (const [signature, faceData] of this.departedFaces.entries()) {
            if (!faceData.embedding) continue;

            const similarity = this.calculateEmbeddingSimilarity(
                currentFace.embedding,
                faceData.embedding
            );

            if (similarity > this.recognitionThreshold) {
                // Khôi phục face từ departed
                const reappearedFace = { ...faceData.face };
                reappearedFace.id = faceData.face.id;
                reappearedFace.framesLost = 0;
                reappearedFace.isTracked = true;
                reappearedFace.lastSeen = Date.now();
                reappearedFace.embedding = currentFace.embedding;

                // Xóa khỏi departed
                this.departedFaces.delete(signature);
                // Thêm lại vào active tracking
                this.faces.set(reappearedFace.id, reappearedFace);

                return reappearedFace;
            }
        }

        return null;
    }

    handleDepartedFaces() {
        for (const [id, face] of this.faces.entries()) {
            if (!face.seen && face.framesLost > 15) { // Sau 15 frames không thấy
                const signature = this.getFaceSignature(face);
                if (signature) {
                    this.departedFaces.set(signature, {
                        face: { ...face },
                        embedding: face.embedding,
                        departedAt: Date.now()
                    });
                }

                // Xóa khỏi active tracking
                this.faces.delete(id);
                this.positionHistory.delete(id);
            }
        }

        // Dọn dẹp departed faces cũ (quá 60 giây)
        const now = Date.now();
        for (const [signature, faceData] of this.departedFaces.entries()) {
            if (now - faceData.departedAt > 60000) {
                this.departedFaces.delete(signature);
            }
        }
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

        if (history.length > 5) history.shift();
        this.positionHistory.set(knownFace.id, history);

        const smoothed = this.calculateSimpleAverage(history);

        knownFace.x = this.lerp(knownFace.x, smoothed.x, this.smoothingFactor);
        knownFace.y = this.lerp(knownFace.y, smoothed.y, this.smoothingFactor);
        knownFace.width = this.lerp(knownFace.width, smoothed.width, this.smoothingFactor * 0.5);
        knownFace.height = this.lerp(knownFace.height, smoothed.height, this.smoothingFactor * 0.5);
    }

    calculateSimpleAverage(history) {
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

    calculateIoU(face1, face2) {
        try {
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
        } catch (error) {
            return 0;
        }
    }

    getBoundingBox(face) {
        try {
            if (!face || isNaN(face.x) || isNaN(face.y) || isNaN(face.width) || isNaN(face.height)) {
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
            return { left: 0, top: 0, right: 0, bottom: 0 };
        }
    }

    calculateSizeSimilarity(face1, face2) {
        try {
            const area1 = face1.width * face1.height;
            const area2 = face2.width * face2.height;
            const minArea = Math.min(area1, area2);
            const maxArea = Math.max(area1, area2);
            return maxArea > 0 ? minArea / maxArea : 0;
        } catch (error) {
            return 0;
        }
    }

    calculateDistance(face1, face2) {
        try {
            return Math.sqrt(
                Math.pow(face1.x - face2.x, 2) +
                Math.pow(face1.y - face2.y, 2)
            );
        } catch (error) {
            return 1000;
        }
    }

    lerp(start, end, factor) {
        return start * (1 - factor) + end * factor;
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
            lastSeen: Date.now(),
            embedding: faceData.embedding || null
        };
    }

    cleanupLostFaces() {
        for (const [id, face] of this.faces.entries()) {
            if (face.framesLost > this.maxFramesLost) {
                this.faces.delete(id);
                this.positionHistory.delete(id);
            }
        }
    }

    // Thêm phương thức mới vào ImprovedFaceTracker
    findFallbackMatch(currentFace) {
        let bestMatch = null;
        let bestDistance = Infinity;

        for (const [id, knownFace] of this.faces.entries()) {
            if (knownFace.seen) continue;

            const distance = this.calculateDistance(currentFace, knownFace);

            // Nếu khoảng cách gần và kích thước tương tự
            if (distance < 80 && this.calculateSizeSimilarity(currentFace, knownFace) > 0.6) {
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestMatch = knownFace;
                    bestMatchId = id;
                }
            }
        }

        return bestMatch ? { face: bestMatch, id: bestMatchId, distance: bestDistance } : null;
    }

    // THÊM PHƯƠNG THỨC DEBUG
    debugFaceSignatures() {
        console.log('🔍 DEBUG Face Signatures:');
        console.log('- Total tracked faces:', this.faces.size);
        console.log('- Total unique signatures:', this.faceAppearances.size);
        console.log('- Face appearances:', Array.from(this.faceAppearances.entries()));
        console.log('- Face in frame status:', Array.from(this.faceInFrameStatus.entries()));
    }

    // Thêm debug cho face signatures
    debugFaceTracking() {
        console.log('🔍 FACE TRACKING DEBUG:');
        console.log(`- Tracked faces: ${this.faces.size}`);
        console.log(`- Unique signatures: ${this.faceAppearances.size}`);

        let signatureCounts = {};
        for (const face of this.faces.values()) {
            const signature = this.getFaceSignature(face);
            signatureCounts[signature] = (signatureCounts[signature] || 0) + 1;
        }

        console.log('- Signature distribution:', signatureCounts);
        console.log('- Face appearances:', Array.from(this.faceAppearances.entries()));
    }

    // THÊM VÀO ImprovedFaceTracker
    resetCompletely() {
        this.faces.clear();
        this.nextId = 1;
        this.positionHistory.clear();
        this.faceAppearances.clear();
        this.departedFaces.clear();
        this.activeFaces.clear();
        this.faceInFrameStatus.clear();
        this.lastAppearanceTime.clear();
        console.log('🔄 Face tracker reset completely');
    }
}
