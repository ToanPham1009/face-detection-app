// Face Detection and Recognition functionality
class FaceDetector {
    constructor() {
        this.canvas = document.getElementById('faceCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Face Recognition Models
        this.faceLandmarker = null;
        this.isRecognitionModelLoading = false;
        this.recognitionModelsLoaded = false;

        // Face Detection Models
        this.faceDetection = null;
        this.isModelLoading = false;
        this.modelsLoaded = false;

        // Camera and Tracking State
        this.stream = null;
        this.isTracking = false;
        this.trackingInterval = null;
        this.sessionId = null;
        this.startTime = null;
        this.totalFacesCount = 0;
        this.uniqueFaces = new Set();
        this.faceTracker = new ImprovedFaceTracker();

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

        console.log('🎯 FaceDetector with Recognition initialized');

        this.loadMediaPipeModels();
    }

    async loadMediaPipeModels() {
        if (this.isModelLoading) return;

        this.isModelLoading = true;
        try {
            console.log('🔄 Loading MediaPipe Face Detection and Recognition...');

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

            // Try to load Face Landmarker for recognition (optional)
            await this.loadFaceLandmarker();

            this.modelsLoaded = true;
            console.log('✅ MediaPipe Face Detection loaded successfully');

        } catch (error) {
            console.error('❌ Error loading MediaPipe models:', error);
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

    async handleMediaPipeResults(results) {
        if (!this.isDetectionRunning) return;

        try {
            this.ctx.save();
            this.drawVideoFrame();

            const detections = results.detections || [];
            console.log(`🎯 MediaPipe detected: ${detections.length} faces`);

            const formattedFaces = this.formatDetections(detections);
            console.log(`✅ Formatted faces: ${formattedFaces.length}`);

            if (formattedFaces.length > 0) {
                // Extract face embeddings if recognition is available
                if (this.recognitionModelsLoaded && this.faceLandmarker) {
                    await this.extractFaceEmbeddings(formattedFaces);
                } else {
                    // Fallback: create simple embeddings from face features
                    this.createSimpleEmbeddings(formattedFaces);
                }

                const trackedFaces = this.faceTracker.update(formattedFaces);
                this.drawMediaPipeDetections(formattedFaces, trackedFaces);

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
        }
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

                    const originalStartX = (bbox.xCenter - bbox.width / 2) * this.canvas.width;
                    const originalStartY = (bbox.yCenter - bbox.height / 2) * this.canvas.height;

                    startXPx = this.canvas.width - originalStartX - widthPx;
                    startYPx = originalStartY;

                } else if (bbox.originX !== undefined && bbox.originY !== undefined) {
                    widthPx = bbox.width * this.canvas.width;
                    heightPx = bbox.height * this.canvas.height;

                    startXPx = this.canvas.width - (bbox.originX * this.canvas.width) - widthPx;
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

        const finalDetections = this.applyNonMaximumSuppression(filteredDetections);
        return finalDetections;
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
            const box1 = this.getBoundingBoxFromFace(face1);
            const box2 = this.getBoundingBoxFromFace(face2);

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
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);

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
        this.ctx.translate(this.canvas.width, 0);
        this.ctx.scale(-1, 1);
    }

    drawStatusInfo() {
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);

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
        this.ctx.translate(this.canvas.width, 0);
        this.ctx.scale(-1, 1);
    }

    initializeCanvas() {
        if (!this.video || this.video.videoWidth === 0) {
            setTimeout(() => this.initializeCanvas(), 100);
            return;
        }

        try {
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;

            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.translate(this.canvas.width, 0);
            this.ctx.scale(-1, 1);

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
            
            this.ctx.translate(this.canvas.width, 0);
            this.ctx.scale(-1, 1);

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

        this.isTracking = true;
        this.sessionId = Date.now().toString();
        this.startTime = Date.now();
        this.totalFacesCount = 0;
        this.uniqueFaces.clear();
        this.faceTracker.reset();

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

        if (this.onFaceCountUpdate) this.onFaceCountUpdate(0);
        if (this.onTotalFacesUpdate) this.onTotalFacesUpdate(0);
        if (this.onTrackingTimeUpdate) this.onTrackingTimeUpdate(0);

        this.updateButtonStates();
        console.log('✅ Face tracking stopped');
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
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        if (this.video) {
            this.video.pause();
            this.video.srcObject = null;
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
            const currentFaceCount = trackedFaces.length;

            // Count new appearances
            trackedFaces.forEach(face => {
                if (face.isNew) {
                    console.log(`🎉 NEW APPEARANCE: face ${face.id}`);
                }
            });

            // Get total appearances from tracker
            this.totalFacesCount = this.faceTracker.getTotalAppearances();

            if (this.onFaceCountUpdate) {
                this.onFaceCountUpdate(currentFaceCount);
            }

            if (this.onTotalFacesUpdate) {
                this.onTotalFacesUpdate(this.totalFacesCount);
            }

            console.log(`📈 Stats: current=${currentFaceCount}, total_appearances=${this.totalFacesCount}`);

        } catch (error) {
            console.error('❌ Error updating tracking stats:', error);
        }
    }
}

// Improved Face Tracker with Appearance Counting
class ImprovedFaceTracker {
    constructor() {
        this.faces = new Map();
        this.nextId = 1;
        this.maxFramesLost = 30;
        this.trackingThreshold = 0.6;
        this.smoothingFactor = 0.3;
        this.positionHistory = new Map();

        // Face recognition and appearance tracking
        this.recognitionThreshold = 0.85;
        this.faceAppearances = new Map();
        this.faceSignatureToId = new Map();
        this.departedFaces = new Map();
    }

    reset() {
        this.faces.clear();
        this.nextId = 1;
        this.positionHistory.clear();
        this.faceAppearances.clear();
        this.faceSignatureToId.clear();
        this.departedFaces.clear();
    }

    update(currentFaces) {
        // Mark all current faces as not seen
        for (const face of this.faces.values()) {
            face.seen = false;
            face.framesLost++;
        }

        const results = [];
        const usedMatches = new Set();

        // Phase 1: Match with existing faces (priority: recognition > position)
        for (const currentFace of currentFaces) {
            let bestMatch = null;
            let bestScore = this.trackingThreshold;
            let bestMatchId = null;
            let matchType = 'position';

            // Try recognition matching first
            if (currentFace.embedding) {
                const recognitionMatch = this.findRecognitionMatch(currentFace);
                if (recognitionMatch) {
                    bestMatch = recognitionMatch.face;
                    bestScore = recognitionMatch.score;
                    bestMatchId = recognitionMatch.id;
                    matchType = 'recognition';
                }
            }

            // Fallback to positional matching
            if (!bestMatch) {
                for (const [id, knownFace] of this.faces.entries()) {
                    if (knownFace.seen || usedMatches.has(id)) continue;

                    const positionalScore = this.calculatePositionalScore(currentFace, knownFace);
                    if (positionalScore > bestScore) {
                        bestScore = positionalScore;
                        bestMatch = knownFace;
                        bestMatchId = id;
                        matchType = 'position';
                    }
                }
            }

            if (bestMatch && bestMatchId) {
                this.updateFaceWithSmoothing(bestMatch, currentFace);
                bestMatch.seen = true;
                bestMatch.framesLost = 0;
                bestMatch.isTracked = true;
                bestMatch.confidence = currentFace.confidence;
                bestMatch.lastSeen = Date.now();

                // Update embedding if available
                if (matchType === 'recognition' && currentFace.embedding) {
                    bestMatch.embedding = currentFace.embedding;
                }

                usedMatches.add(bestMatchId);

                results.push({
                    id: bestMatchId,
                    isNew: false, // Not a new appearance
                    x: bestMatch.x,
                    y: bestMatch.y,
                    width: bestMatch.width,
                    height: bestMatch.height,
                    confidence: bestMatch.confidence,
                    matchType: matchType
                });
            } else {
                // Check for face reappearance
                const reappearedFace = this.checkFaceReappearance(currentFace);
                
                if (reappearedFace) {
                    this.updateFaceWithSmoothing(reappearedFace, currentFace);
                    reappearedFace.seen = true;
                    reappearedFace.framesLost = 0;
                    reappearedFace.isTracked = true;
                    reappearedFace.confidence = currentFace.confidence;
                    reappearedFace.lastSeen = Date.now();

                    usedMatches.add(reappearedFace.id);

                    results.push({
                        id: reappearedFace.id,
                        isNew: true, // This is a NEW appearance
                        x: reappearedFace.x,
                        y: reappearedFace.y,
                        width: reappearedFace.width,
                        height: reappearedFace.height,
                        confidence: reappearedFace.confidence,
                        matchType: 'reappearance'
                    });

                    // Increment appearance count
                    this.incrementAppearanceCount(reappearedFace);

                } else {
                    // Create truly new face
                    const newFace = this.createNewFace(currentFace);
                    this.faces.set(newFace.id, newFace);

                    // Register face signature
                    this.registerFaceSignature(newFace);

                    results.push({
                        id: newFace.id,
                        isNew: true, // First appearance
                        x: currentFace.x,
                        y: currentFace.y,
                        width: currentFace.width,
                        height: currentFace.height,
                        confidence: currentFace.confidence,
                        matchType: 'new'
                    });
                }
            }
        }

        // Handle departed faces
        this.handleDepartedFaces();
        this.cleanupLostFaces();

        return results;
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
                // Restore face from departed
                const reappearedFace = { ...faceData.face };
                reappearedFace.id = faceData.face.id;
                reappearedFace.framesLost = 0;
                reappearedFace.isTracked = true;
                reappearedFace.lastSeen = Date.now();
                reappearedFace.embedding = currentFace.embedding;

                this.departedFaces.delete(signature);
                this.faces.set(reappearedFace.id, reappearedFace);

                return reappearedFace;
            }
        }

        return null;
    }

    handleDepartedFaces() {
        for (const [id, face] of this.faces.entries()) {
            if (!face.seen && face.framesLost > 10) {
                const signature = this.getFaceSignature(face);
                if (signature) {
                    this.departedFaces.set(signature, {
                        face: { ...face },
                        embedding: face.embedding,
                        departedAt: Date.now()
                    });
                }

                this.faces.delete(id);
                this.positionHistory.delete(id);
            }
        }

        // Cleanup old departed faces (older than 30 seconds)
        const now = Date.now();
        for (const [signature, faceData] of this.departedFaces.entries()) {
            if (now - faceData.departedAt > 30000) {
                this.departedFaces.delete(signature);
            }
        }
    }

    calculateEmbeddingSimilarity(embedding1, embedding2) {
        if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) return 0;

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

        return norm1 === 0 || norm2 === 0 ? 0 : dotProduct / (norm1 * norm2);
    }

    registerFaceSignature(face) {
        if (!face.embedding) return;

        const signature = this.getFaceSignature(face);
        if (signature && !this.faceAppearances.has(signature)) {
            this.faceAppearances.set(signature, 1);
            this.faceSignatureToId.set(signature, face.id);
        }
    }

    incrementAppearanceCount(face) {
        if (!face.embedding) return;

        const signature = this.getFaceSignature(face);
        if (signature && this.faceAppearances.has(signature)) {
            const currentCount = this.faceAppearances.get(signature);
            this.faceAppearances.set(signature, currentCount + 1);
        }
    }

    getFaceSignature(face) {
        if (!face.embedding) return null;
        return face.embedding.slice(0, 10).map(val => val.toFixed(3)).join('-');
    }

    getTotalAppearances() {
        let total = 0;
        for (const count of this.faceAppearances.values()) {
            total += count;
        }
        return total;
    }

    getUniqueFacesCount() {
        return this.faceAppearances.size;
    }

    getTrackedFacesCount() {
        return Array.from(this.faces.values()).filter(face => face.isTracked).length;
    }

    calculatePositionalScore(currentFace, knownFace) {
        const iouScore = this.calculateIoU(currentFace, knownFace);
        const centerDistance = this.calculateDistance(currentFace, knownFace);
        
        if (iouScore < 0.3 && centerDistance > 80) return 0;

        const sizeSimilarity = this.calculateSizeSimilarity(currentFace, knownFace);

        return (iouScore * 0.7) +
               (Math.max(0, 1 - centerDistance / 120) * 0.2) +
               (sizeSimilarity * 0.1);
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
            } else if (!face.seen) {
                face.isTracked = false;
            }
        }
    }
}