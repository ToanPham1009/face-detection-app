// Face Detection and Recognition functionality
class FaceDetector {
    constructor() {
        this.canvas = document.getElementById('faceCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Face Detection Models
        this.faceDetection = null;
        this.isModelLoading = false;
        this.modelsLoaded = false;

        // Face Tracker
        this.faceTracker = new ProfessionalFaceTracker();
        console.log('🎯 FaceTracker initialized');

        // Camera and Tracking State
        this.stream = null;
        this.isTracking = false;
        this.trackingInterval = null;
        this.sessionId = null;
        this.startTime = null;
        this.totalFacesCount = 0;

        // Face Tracking Data
        this.uniqueFaces = new Map();
        this.faceAppearanceHistory = new Map(); // Lưu lịch sử xuất hiện của từng face

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

        // Performance Settings - TĂNG LÊN 15 FPS
        this.minDetectionInterval = 1000 / 15; // 15 FPS (giảm từ 66ms xuống 66ms)
        this.lastDetectionTime = 0;
        this.canvasInitialized = false;

        console.log('🎯 FaceDetector initialized - Target: 15 FPS');

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
        if (!this.isDetectionRunning) return;

        try {
            this.ctx.save();
            this.drawVideoFrame();

            const detections = results.detections || [];

            // THÊM: Error handling cho quá trình format detections
            let formattedFaces = [];
            try {
                formattedFaces = this.formatDetections(detections);
            } catch (formatError) {
                console.error('❌ Error formatting detections:', formatError);
                formattedFaces = [];
            }

            if (formattedFaces.length > 0) {
                // Tạo embeddings cho tracking với error handling
                try {
                    this.createFaceEmbeddings(formattedFaces);
                } catch (embeddingError) {
                    console.error('❌ Error creating face embeddings:', embeddingError);
                }

                if (!this.faceTracker) {
                    console.error('❌ faceTracker not available for tracking');
                    return;
                }

                // Update tracking với error handling
                let trackedFaces = [];
                try {
                    trackedFaces = this.faceTracker.update(formattedFaces);
                } catch (trackingError) {
                    console.error('❌ Error in face tracking:', trackingError);
                    trackedFaces = [];
                }

                this.drawFaceDetections(formattedFaces, trackedFaces);

                if (this.isTracking) {
                    this.updateTrackingStats(trackedFaces);
                } else {
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

    extractFaceEmbedding(detection) {
        // Sử dụng phiên bản đơn giản hóa trước để tránh lỗi
        const landmarks = detection.landmarks || [];
        const embedding = [
            detection.width / 640,
            detection.height / 480,
            detection.x / 640,
            detection.y / 480,
            detection.confidence
        ];

        // Chỉ thêm landmark features nếu có và không gây lỗi
        try {
            if (landmarks.length >= 6) {
                const eyeDistance = this.calculateStableEyeDistance(landmarks);
                const noseToMouth = this.calculateNoseToMouthDistance(landmarks);

                embedding.push(eyeDistance);
                embedding.push(noseToMouth);
                embedding.push(detection.width / detection.height);
            }
        } catch (error) {
            console.warn('⚠️ Error extracting landmark features:', error);
            // Vẫn trả về embedding cơ bản nếu có lỗi
        }

        return embedding;
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

        // Thêm thông tin counting
        if (trackedFace && this.isTracking) {
            const appearanceCount = this.faceTracker.appearanceCounts.get(trackedFace.id) || 1;
            const countText = `Count: ${appearanceCount}`;

            this.ctx.fillStyle = '#00ff00';
            this.ctx.font = 'bold 11px Arial';
            this.ctx.fillText(countText, start[0], start[1] - 25);
        }
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

    async startDetectionLoop() {
        if (this.isDetectionRunning) return;

        this.isDetectionRunning = true;
        this.lastDetectionTime = 0;

        console.log('🔄 Starting MediaPipe detection loop at 15 FPS...');

        const detectionLoop = async (timestamp) => {
            if (!this.isCameraOn || !this.isDetectionRunning) {
                this.isDetectionRunning = false;
                return;
            }

            const currentTime = Date.now();
            // Đảm bảo chính xác 15 FPS
            if (currentTime - this.lastDetectionTime >= this.minDetectionInterval) {
                this.lastDetectionTime = currentTime;

                try {
                    if (this.video.paused) {
                        await this.video.play();
                    }
                    await this.detectWithMediaPipe();
                } catch (error) {
                    console.error('❌ Error in MediaPipe detection:', error);
                    if (this.isCameraOn) {
                        this.drawVideoFrame();
                    }
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

        // SỬA: Sử dụng getCurrentPersonsCount() thay vì getTrackedFacesCount()
        const currentFaces = this.faceTracker.getCurrentPersonsCount ?
            this.faceTracker.getCurrentPersonsCount() : 0;

        if (this.isTracking) {
            this.ctx.fillText('🎭 Đang Theo Dõi (Professional)', 20, 30);
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`Tổng lượt: ${this.totalFacesCount}`, 20, 50);
            this.ctx.fillText(`Hiện tại: ${currentFaces}`, 20, 70);
        } else if (this.stream) {
            this.ctx.fillText('📷 Camera (Professional)', 20, 30);
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`Khuôn mặt: ${currentFaces}`, 20, 50);
            this.ctx.fillText('⏸️ Sẵn sàng thống kê', 20, 70);
        } else {
            this.ctx.fillText('📷 Camera (Professional)', 20, 30);
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

        // Reset tracker hoàn toàn
        this.faceTracker.resetCompletely();

        this.isTracking = true;
        this.sessionId = Date.now().toString();
        this.startTime = Date.now();
        this.totalFacesCount = 0;

        // UI updates
        const recordingStatus = document.getElementById('recordingStatus');
        if (recordingStatus) {
            recordingStatus.classList.add('active');
        }

        // Time tracking
        if (this.timeInterval) {
            clearInterval(this.timeInterval);
        }

        this.timeInterval = setInterval(() => {
            if (this.isTracking && this.onTrackingTimeUpdate) {
                const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
                this.onTrackingTimeUpdate(elapsedSeconds);

                // Log tracking stats periodically
                if (elapsedSeconds % 5 === 0) {
                    const stats = this.faceTracker.getTrackingStats();
                    console.log(`📊 Tracking Stats [${elapsedSeconds}s]:`, stats);
                }
            }
        }, 1000);

        this.updateButtonStates();
        console.log('✅ Professional face tracking started');
    }

    stopTracking() {
        if (!this.isTracking) return;

        console.log('⏸️ Stopping face tracking...');

        this.isTracking = false;

        // UI updates
        const recordingStatus = document.getElementById('recordingStatus');
        if (recordingStatus) {
            recordingStatus.classList.remove('active');
        }

        if (this.timeInterval) {
            clearInterval(this.timeInterval);
            this.timeInterval = null;
        }

        // Giữ lại số liệu thống kê
        if (this.onFaceCountUpdate) this.onFaceCountUpdate(0);
        if (this.onTotalFacesUpdate) this.onTotalFacesUpdate(this.totalFacesCount);

        // Đảm bảo detection loop vẫn chạy
        if (this.isCameraOn && !this.isDetectionRunning) {
            this.startDetectionLoop();
        }

        // Vẽ lại UI
        if (this.isCameraOn) {
            this.drawVideoFrame();
            this.drawStatusInfo();
        }

        this.updateButtonStates();

        // Log kết quả cuối cùng
        console.log(`📊 Tracking stopped. Total faces detected: ${this.totalFacesCount}`);
        console.log(`⏱️ Tracking duration: ${Math.floor((Date.now() - this.startTime) / 1000)} seconds`);
    }

    // Thêm phương thức để debug FPS
    getCurrentFPS() {
        return 15; // FPS cố định mà chúng ta đặt
    }

    getPerformanceInfo() {
        const trackerInfo = this.faceTracker.getPerformanceInfo ?
            this.faceTracker.getPerformanceInfo() : {};

        return {
            ...trackerInfo,
            isCameraOn: this.isCameraOn,
            isTracking: this.isTracking,
            isDetectionRunning: this.isDetectionRunning,
            modelsLoaded: this.modelsLoaded
        };
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

    updateTrackingStats(trackedFaces) {
        if (!this.isTracking) return;

        try {
            // SỬA: Sử dụng getCurrentPersonsCount() và getTotalAppearances()
            const currentFaceCount = this.faceTracker.getCurrentPersonsCount ?
                this.faceTracker.getCurrentPersonsCount() : trackedFaces.length;

            // Lấy tổng số lượt xuất hiện từ tracker
            this.totalFacesCount = this.faceTracker.getTotalAppearances ?
                this.faceTracker.getTotalAppearances() : this.totalFacesCount;

            // Cập nhật callback
            if (this.onFaceCountUpdate) {
                this.onFaceCountUpdate(currentFaceCount);
            }

            if (this.onTotalFacesUpdate) {
                this.onTotalFacesUpdate(this.totalFacesCount);
            }

            // Log hiệu suất mỗi 5 giây để tránh spam console
            const now = Date.now();
            if (!this.lastStatsLog || now - this.lastStatsLog > 5000) {
                console.log(`📈 Tracking: ${currentFaceCount} faces currently, ${this.totalFacesCount} total appearances`);
                this.lastStatsLog = now;
            }

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

class ProfessionalFaceTracker {
    constructor() {
        this.faces = new Map();
        this.nextPersonId = 1;
        this.maxFramesLost = 30;

        // Tracking thresholds
        this.positionThreshold = 0.6;
        this.recognitionThreshold = 0.7;

        this.positionHistory = new Map();
        this.smoothingFactor = 0.3;

        // Appearance tracking
        this.faceAppearances = new Map(); // personId -> count
        this.faceSignatures = new Map(); // personId -> signature
        this.lastCountTime = new Map(); // personId -> last count timestamp
        this.presenceStatus = new Map(); // personId -> boolean

        // Settings
        this.minCountInterval = 2000;
        this.signatureStabilityThreshold = 0.8;

        // Debug
        this.lastSimilarityLog = 0;

        console.log('🎯 ProfessionalFaceTracker initialized');
    }

    resetCompletely() {
        this.faces.clear();
        this.nextPersonId = 1;
        this.positionHistory.clear();
        this.faceAppearances.clear();
        this.faceSignatures.clear();
        this.lastCountTime.clear();
        this.presenceStatus.clear();
        console.log('🔄 Professional tracker reset completely');
    }

    getPerformanceInfo() {
        return {
            fps: 15, // Fixed FPS
            currentFaces: this.getCurrentPersonsCount(),
            totalAppearances: this.getTotalAppearances(),
            uniquePersons: this.getUniqueFacesCount(),
            trackedPersons: this.trackedPersons.size
        };
    }

    /**
     * Core tracking method - implements the 4-step process
     */
    update(currentFaces) {
        // Đánh dấu tất cả faces hiện tại là không seen
        for (const face of this.faces.values()) {
            face.seen = false;
            face.framesLost++;
        }

        const results = [];
        const usedMatches = new Set();

        // Giai đoạn 1: Match với faces đang được track
        for (const currentFace of currentFaces) {
            let bestMatch = null;
            let bestScore = this.positionThreshold;
            let bestMatchId = null;

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

                // Update embedding với smoothing mạnh hơn
                if (currentFace.embedding && bestMatch.embedding) {
                    for (let i = 0; i < bestMatch.embedding.length; i++) {
                        bestMatch.embedding[i] = this.lerp(
                            bestMatch.embedding[i],
                            currentFace.embedding[i],
                            0.1 // Giảm smoothing để ổn định hơn
                        );
                    }
                }

                usedMatches.add(bestMatchId);

                // Xử lý đếm - CHỈ đếm khi đủ điều kiện
                this.handleFaceCounting(bestMatch);

                results.push({
                    id: bestMatchId,
                    isNew: false,
                    x: bestMatch.x,
                    y: bestMatch.y,
                    width: bestMatch.width,
                    height: bestMatch.height,
                    confidence: bestMatch.confidence
                });

            } else {
                // Tạo face mới
                const newFace = this.createNewFace(currentFace);
                this.faces.set(newFace.id, newFace);

                // Đếm ngay lần đầu tiên xuất hiện
                this.handleFirstAppearance(newFace);

                results.push({
                    id: newFace.id,
                    isNew: true,
                    x: currentFace.x,
                    y: currentFace.y,
                    width: currentFace.width,
                    height: currentFace.height,
                    confidence: currentFace.confidence
                });

                console.log(`🎉 New person created: ID ${newFace.id}`);
            }
        }

        // Dọn dẹp faces mất tích
        this.cleanupLostFaces();

        return results;
    }

    /**
     * Step 1: Process raw detections into standardized format
     */
    processDetections(detections) {
        return detections.map((detection, index) => {
            // Create face embedding (feature vector)
            const embedding = this.extractFaceEmbedding(detection);

            return {
                id: `det_${Date.now()}_${index}`,
                x: detection.x,
                y: detection.y,
                width: detection.width,
                height: detection.height,
                confidence: detection.confidence,
                embedding: embedding,
                timestamp: Date.now()
            };
        });
    } 
    
    processDetections(detections) {
        return detections.map((detection, index) => {
            // Create face embedding (feature vector)
            const embedding = this.extractFaceEmbedding(detection);

            return {
                id: `det_${Date.now()}_${index}`,
                x: detection.x,
                y: detection.y,
                width: detection.width,
                height: detection.height,
                confidence: detection.confidence,
                embedding: embedding,
                timestamp: Date.now()
            };
        });
    }

    /**
     * Step 2: Predict next positions (simplified Kalman Filter)
     */
    predictPositions() {
        for (const [personId, person] of this.trackedPersons) {
            if (person.lastPosition) {
                // Simple velocity-based prediction
                const velocity = person.velocity || { x: 0, y: 0 };
                this.predictedPositions.set(personId, {
                    x: person.lastPosition.x + velocity.x,
                    y: person.lastPosition.y + velocity.y
                });
            }
        }
    }

    /**
     * Step 3: Association - Match detections to existing persons
     */
    associateDetections(currentFaces) {
        const matches = new Map();
        const usedDetections = new Set();
        const usedPersons = new Set();

        // Phase 1: Motion-based matching (high priority)
        for (const face of currentFaces) {
            let bestPersonId = null;
            let bestScore = 0;

            for (const [personId, person] of this.trackedPersons) {
                if (usedPersons.has(personId)) continue;

                const motionScore = this.calculateMotionScore(face, person);
                if (motionScore > bestScore && motionScore > 0.7) {
                    bestScore = motionScore;
                    bestPersonId = personId;
                }
            }

            if (bestPersonId) {
                matches.set(face.id, bestPersonId);
                usedDetections.add(face.id);
                usedPersons.add(bestPersonId);
            }
        }

        // Phase 2: Feature-based matching (for occlusions/re-entries)
        for (const face of currentFaces) {
            if (usedDetections.has(face.id)) continue;

            let bestPersonId = null;
            let bestSimilarity = this.trackingConfig.similarityThreshold;

            for (const [personId, person] of this.trackedPersons) {
                if (usedPersons.has(personId)) continue;

                const similarity = this.calculateFeatureSimilarity(
                    face.embedding,
                    person.embedding
                );

                if (similarity > bestSimilarity) {
                    bestSimilarity = similarity;
                    bestPersonId = personId;
                }
            }

            if (bestPersonId) {
                matches.set(face.id, bestPersonId);
                usedDetections.add(face.id);
                usedPersons.add(bestPersonId);

                // CHỈ log khi có sự thay đổi đáng kể trong similarity
                if (!this.lastSimilarityLog || Date.now() - this.lastSimilarityLog > 2000) {
                    console.log(`🔍 Feature match: Person ${bestPersonId} (similarity: ${bestSimilarity.toFixed(3)})`);
                    this.lastSimilarityLog = Date.now();
                }
            }
        }

        // Phase 3: Create new persons for unmatched detections
        for (const face of currentFaces) {
            if (!usedDetections.has(face.id)) {
                const newPersonId = this.createNewPerson(face);
                matches.set(face.id, newPersonId);
                console.log(`🎉 New person created: ID ${newPersonId}`);
            }
        }

        return matches;
    }

    /**
     * Step 4: Update tracking and handle appearance counting
     */
    updateTracking(matches, currentFaces) {
        const now = Date.now();
        const currentlyPresent = new Set();

        // Update matched persons
        for (const [detectionId, personId] of matches) {
            const face = currentFaces.find(f => f.id === detectionId);
            const person = this.trackedPersons.get(personId);

            if (face && person) {
                // Update person data
                this.updatePersonData(person, face);
                currentlyPresent.add(personId);

                // Handle appearance counting
                this.handleAppearanceCounting(personId, now);
            }
        }

        // Handle persons that left the frame
        this.handleDepartures(currentlyPresent, now);
    }

    /**
     * Handle the core appearance counting logic
     */
    handleAppearanceCounting(personId, currentTime) {
        const person = this.trackedPersons.get(personId);
        if (!person) return;

        const wasPresent = this.presenceStatus.get(personId) || false;

        if (!wasPresent) {
            // Person just entered the frame
            const lastExitTime = person.lastExitTime || 0;
            const timeSinceLastExit = currentTime - lastExitTime;

            // Only count if they've been gone long enough (re-entry)
            if (timeSinceLastExit > this.trackingConfig.reentryCooldown) {
                const currentCount = this.appearanceCounts.get(personId) || 0;
                this.appearanceCounts.set(personId, currentCount + 1);

                console.log(`✅ COUNT: Person ${personId} appearance #${currentCount + 1}`);

                // Record this appearance
                this.recordAppearance(personId, currentTime);
            }

            this.presenceStatus.set(personId, true);
            person.lastEntryTime = currentTime;
        }

        // Update continuous presence
        person.lastSeenTime = currentTime;
        this.presenceStatus.set(personId, true);
    }

    /**
     * Handle persons leaving the frame
     */
    handleDepartures(currentlyPresent, currentTime) {
        for (const [personId, person] of this.trackedPersons) {
            if (!currentlyPresent.has(personId)) {
                const wasPresent = this.presenceStatus.get(personId);

                if (wasPresent) {
                    // Person just left the frame
                    this.presenceStatus.set(personId, false);
                    person.lastExitTime = currentTime;
                    person.framesLost = (person.framesLost || 0) + 1;

                    console.log(`🚪 Person ${personId} left frame`);

                    // Remove if lost for too long
                    if (person.framesLost > this.trackingConfig.maxFramesLost) {
                        console.log(`🗑️ Removing lost person: ID ${personId}`);
                        this.trackedPersons.delete(personId);
                        this.presenceStatus.delete(personId);
                        this.predictedPositions.delete(personId);
                    }
                }
            } else {
                // Reset frames lost counter
                person.framesLost = 0;
            }
        }
    }

    /**
     * Create a new person entry
     */
    createNewPerson(face) {
        const personId = this.nextPersonId++;

        const personData = {
            id: personId,
            embedding: face.embedding,
            firstSeen: Date.now(),
            lastSeenTime: Date.now(),
            lastEntryTime: Date.now(),
            detectionCount: 0,
            isCurrentlyTracked: true,
            lastPosition: { x: face.x, y: face.y },
            velocity: { x: 0, y: 0 }
        };

        this.trackedPersons.set(personId, personData);
        this.appearanceCounts.set(personId, 1); // Count first appearance immediately
        this.presenceStatus.set(personId, true);

        console.log(`✅ FIRST COUNT: Person ${personId} - Total: 1`);

        return personId;
    }

    /**
     * Update existing person data
     */
    updatePersonData(person, face) {
        // Update position with simple velocity calculation
        if (person.lastPosition) {
            const dt = 1; // assuming 1 frame
            person.velocity = {
                x: (face.x - person.lastPosition.x) / dt,
                y: (face.y - person.lastPosition.y) / dt
            };
        }

        person.lastPosition = { x: face.x, y: face.y };
        person.lastSeenTime = Date.now();
        person.detectionCount = (person.detectionCount || 0) + 1;
        person.isCurrentlyTracked = true;

        // Update embedding with smoothing
        if (face.embedding && person.embedding) {
            person.embedding = this.updateEmbedding(person.embedding, face.embedding);
        }
    }

    /**
     * Motion-based scoring (simplified)
     */
    calculateMotionScore(face, person) {
        if (!person.lastPosition) return 0;

        const predicted = this.predictedPositions.get(person.id) || person.lastPosition;
        const distance = Math.sqrt(
            Math.pow(face.x - predicted.x, 2) +
            Math.pow(face.y - predicted.y, 2)
        );

        // Convert distance to score (closer = higher score)
        const maxDistance = this.trackingConfig.distanceThreshold;
        const distanceScore = Math.max(0, 1 - distance / maxDistance);

        // Size similarity
        const sizeScore = this.calculateSizeSimilarity(face, person);

        return (distanceScore * 0.7) + (sizeScore * 0.3);
    }

    /**
     * Feature-based similarity calculation
     */
    calculateFeatureSimilarity(embedding1, embedding2) {
        if (!embedding1 || !embedding2) return 0;

        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < Math.min(embedding1.length, embedding2.length); i++) {
            dotProduct += embedding1[i] * embedding2[i];
            norm1 += embedding1[i] * embedding1[i];
            norm2 += embedding2[i] * embedding2[i];
        }

        norm1 = Math.sqrt(norm1);
        norm2 = Math.sqrt(norm2);

        const similarity = norm1 > 0 && norm2 > 0 ? dotProduct / (norm1 * norm2) : 0;

        return similarity;
    }

    /**
     * Utility methods
     */
    calculateSizeSimilarity(face, person) {
        const currentArea = face.width * face.height;
        const personArea = person.lastPosition ? (person.lastPosition.width * person.lastPosition.height) : currentArea;

        const minArea = Math.min(currentArea, personArea);
        const maxArea = Math.max(currentArea, personArea);

        return maxArea > 0 ? minArea / maxArea : 0;
    }

    extractFaceEmbedding(detection) {
        // Sử dụng ít features hơn để tăng tốc độ
        const landmarks = detection.landmarks || [];
        const embedding = [
            detection.width / 640,
            detection.height / 480,
            detection.x / 640,
            detection.y / 480,
            detection.confidence
        ];

        // Chỉ thêm landmark features nếu thực sự cần
        if (landmarks.length >= 6) {
            // Tính các features ổn định
            const eyeDistance = this.calculateStableEyeDistance(landmarks);
            const noseToMouth = this.calculateNoseToMouthDistance(landmarks);

            embedding.push(eyeDistance);
            embedding.push(noseToMouth);
            embedding.push(detection.width / detection.height);
        }

        return embedding;
    }

    calculateNoseToMouthDistance(landmarks) {
        if (landmarks.length < 6) return 0;

        const nose = landmarks[4];    // Nose tip
        const mouth = landmarks[5];   // Mouth center

        const distance = Math.sqrt(
            Math.pow(nose.x - mouth.x, 2) +
            Math.pow(nose.y - mouth.y, 2)
        );

        return distance;
    }

    calculateStableEyeDistance(landmarks) {
        if (landmarks.length < 4) return 0;

        const leftEye = landmarks[0];
        const rightEye = landmarks[2];
        const distance = Math.sqrt(
            Math.pow(leftEye.x - rightEye.x, 2) +
            Math.pow(leftEye.y - rightEye.y, 2)
        );

        return distance;
    }

    updateEmbedding(oldEmbedding, newEmbedding) {
        // Heavy smoothing for stability
        const smoothingFactor = 0.1;
        const updated = [...oldEmbedding];

        for (let i = 0; i < Math.min(oldEmbedding.length, newEmbedding.length); i++) {
            updated[i] = oldEmbedding[i] * (1 - smoothingFactor) + newEmbedding[i] * smoothingFactor;
        }

        return updated;
    }

    recordAppearance(personId, timestamp) {
        if (!this.detectionHistory.has(personId)) {
            this.detectionHistory.set(personId, []);
        }

        this.detectionHistory.get(personId).push({
            timestamp,
            count: this.appearanceCounts.get(personId)
        });
    }

    /**
     * Public interface methods
     */
    getTotalAppearances() {
        let total = 0;
        for (const count of this.appearanceCounts.values()) {
            total += count;
        }
        return total;
    }

    getUniquePersonsCount() {
        return this.appearanceCounts.size;
    }

    getCurrentPersonsCount() {
        return Array.from(this.presenceStatus.values()).filter(Boolean).length;
    }

    getTrackingStats() {
        return {
            totalAppearances: this.getTotalAppearances(),
            uniquePersons: this.getUniquePersonsCount(),
            currentPersons: this.getCurrentPersonsCount(),
            trackedPersons: this.trackedPersons.size
        };
    }

    /**
     * Get number of currently tracked faces (for compatibility)
     */
    getTrackedFacesCount() {
        return Array.from(this.trackedPersons.values()).filter(person =>
            person.isCurrentlyTracked
        ).length;
    }

    /**
     * Get number of unique persons that have been counted
     */
    getUniqueFacesCount() {
        return this.appearanceCounts.size;
    }

    /**
     * Get current active persons in frame
     */
    getCurrentPersonsCount() {
        return Array.from(this.trackedPersons.values()).filter(person =>
            person.isCurrentlyTracked
        ).length;
    }

    /**
     * Get total appearances across all persons
     */
    getTotalAppearances() {
        let total = 0;
        for (const count of this.appearanceCounts.values()) {
            total += count;
        }
        return total;
    }

    /**
     * Debug method to show all tracked persons
     */
    debugFaceTracking() {
        console.log('🔍 PROFESSIONAL TRACKER DEBUG:');
        console.log('- Tracked persons:', this.trackedPersons.size);
        console.log('- Current in frame:', this.getCurrentPersonsCount());
        console.log('- Unique persons counted:', this.getUniqueFacesCount());
        console.log('- Total appearances:', this.getTotalAppearances());

        console.log('- Tracked persons details:');
        for (const [id, person] of this.trackedPersons) {
            console.log(`  Person ${id}:`, {
                isCurrentlyTracked: person.isCurrentlyTracked,
                appearanceCount: this.appearanceCounts.get(id) || 0,
                lastSeen: new Date(person.lastSeenTime).toLocaleTimeString(),
                detectionCount: person.detectionCount
            });
        }

        console.log('- Appearance counts:', Array.from(this.appearanceCounts.entries()));
    }

    /**
     * Debug method for face signatures
     */
    debugFaceSignatures() {
        console.log('🔍 FACE SIGNATURES DEBUG:');
        console.log('- Total tracked persons:', this.trackedPersons.size);
        console.log('- Face signatures:', Array.from(this.faceSignatures.entries()));
        console.log('- Presence status:', Array.from(this.presenceStatus.entries()));
    }

    debugInfo() {
        console.log('🔍 PROFESSIONAL TRACKER DEBUG:');
        console.log('- Tracked persons:', this.trackedPersons.size);
        console.log('- Unique persons:', this.getUniquePersonsCount());
        console.log('- Current in frame:', this.getCurrentPersonsCount());
        console.log('- Total appearances:', this.getTotalAppearances());
        console.log('- Appearance counts:', Array.from(this.appearanceCounts.entries()));
        console.log('- Presence status:', Array.from(this.presenceStatus.entries()));
    }
}