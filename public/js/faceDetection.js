// Face Detection and Recognition functionality
class FaceDetector {
    constructor() {
        this.canvas = document.getElementById('faceCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Face Detection Models
        this.faceDetection = null;
        this.isModelLoading = false;
        this.modelsLoaded = false;

        // Face Tracker - THÊM KIỂM TRA TỒN TẠI
        this.faceTracker = null;
        this.initializeFaceTracker();

        // Camera and Tracking State
        this.stream = null;
        this.isTracking = false;
        this.trackingInterval = null;
        this.sessionId = null;
        this.startTime = null;
        this.totalFacesCount = 0;

        // Face Tracking Data
        this.uniqueFaces = new Map();
        this.faceAppearanceHistory = new Map();

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
        this.minDetectionInterval = 1000 / 15;
        this.lastDetectionTime = 0;
        this.canvasInitialized = false;

        console.log('🎯 FaceDetector initialized');

        this.loadMediaPipeModel();
    }

    // SỬA LẠI initializeFaceTracker - THÊM PHƯƠNG THỨC UPDATE ĐÚNG
    initializeFaceTracker() {
        this.faceTracker = {
            trackedPersons: new Map(),
            faceAppearanceCount: new Map(),
            totalUniqueFaces: 0,
            currentFrameFaces: new Set(),
            nextId: 1,
            lastFrameTime: Date.now(),

            // SỬA: ĐỔI TÊN PHƯƠNG THỨC THÀNH 'update' ĐỂ PHÙ HỢP
            update: (detections) => {
                const now = Date.now();
                const frameInterval = now - this.faceTracker.lastFrameTime;
                this.faceTracker.lastFrameTime = now;

                // Reset faces cho frame hiện tại
                this.faceTracker.currentFrameFaces.clear();

                // Nếu không có detections, xử lý cleanup
                if (!detections || detections.length === 0) {
                    this.faceTracker.cleanupOldTracks();
                    return [];
                }

                const trackedResults = [];

                // CẬP NHẬT VÀ ĐẾM
                detections.forEach((detection) => {
                    if (detection.confidence >= 0.5) {
                        // Tìm ID phù hợp
                        let faceId = this.faceTracker.findMatchingFaceId(detection);

                        if (!faceId) {
                            // Tạo ID mới
                            faceId = `face_${this.faceTracker.nextId++}`;
                            this.faceTracker.totalUniqueFaces++;
                            console.log(`🆕 New face detected: ${faceId}`);
                        }

                        // Cập nhật tracked person
                        this.faceTracker.trackedPersons.set(faceId, {
                            id: faceId,
                            x: detection.x || detection.boundingBox.start[0],
                            y: detection.y || detection.boundingBox.start[1],
                            isTracked: true,
                            lastSeen: now,
                            confidence: detection.confidence
                        });

                        // CẬP NHẬT BỘ ĐẾM XUẤT HIỆN
                        const currentCount = this.faceTracker.faceAppearanceCount.get(faceId) || 0;
                        this.faceTracker.faceAppearanceCount.set(faceId, currentCount + 1);

                        // Thêm vào frame hiện tại
                        this.faceTracker.currentFrameFaces.add(faceId);

                        // Thêm vào kết quả
                        trackedResults.push({
                            id: faceId,
                            isNew: currentCount === 0,
                            x: detection.x || detection.boundingBox.start[0],
                            y: detection.y || detection.boundingBox.start[1],
                            width: detection.width || 100,
                            height: detection.height || 100,
                            confidence: detection.confidence,
                            isTracked: true
                        });
                    }
                });

                // Clean up old tracks
                this.faceTracker.cleanupOldTracks();

                console.log(`📊 Tracking: ${trackedResults.length} faces in frame`);
                return trackedResults;
            },

            findMatchingFaceId: (detection) => {
                const detectionX = detection.x || detection.boundingBox.start[0];
                const detectionY = detection.y || detection.boundingBox.start[1];
                let bestMatchId = null;
                let minDistance = 50;

                for (const [faceId, face] of this.faceTracker.trackedPersons) {
                    const distance = Math.sqrt(
                        Math.pow(detectionX - face.x, 2) +
                        Math.pow(detectionY - face.y, 2)
                    );

                    if (distance < minDistance) {
                        minDistance = distance;
                        bestMatchId = faceId;
                    }
                }

                return bestMatchId;
            },

            cleanupOldTracks: () => {
                const now = Date.now();
                const maxAge = 2000;

                for (const [faceId, face] of this.faceTracker.trackedPersons) {
                    if (now - face.lastSeen > maxAge) {
                        this.faceTracker.trackedPersons.delete(faceId);
                        this.faceTracker.faceAppearanceCount.delete(faceId);
                        console.log(`🗑️ Removed old track: ${faceId}`);
                    }
                }
            },

            getCurrentPersonsCount: () => {
                return this.faceTracker.currentFrameFaces.size;
            },

            getTotalAppearances: () => {
                let total = 0;
                for (const count of this.faceTracker.faceAppearanceCount.values()) {
                    total += count;
                }
                return total;
            },

            getUniqueFacesCount: () => {
                return this.faceTracker.totalUniqueFaces;
            },

            resetCompletely: () => {
                this.faceTracker.trackedPersons.clear();
                this.faceTracker.faceAppearanceCount.clear();
                this.faceTracker.totalUniqueFaces = 0;
                this.faceTracker.currentFrameFaces.clear();
                this.faceTracker.nextId = 1;
                console.log('🔄 Face tracker completely reset');
            }
        };
    }

    // THÊM FALLBACK TRACKER ĐƠN GIẢN
    createFallbackTracker() {
        console.log('🔄 Creating fallback tracker');
        return {
            trackedPersons: new Map(),
            update: (faces) => {
                return faces.map((face, index) => ({
                    id: index + 1,
                    isNew: true,
                    x: face.x,
                    y: face.y,
                    width: face.width,
                    height: face.height,
                    confidence: face.confidence
                }));
            },
            resetCompletely: () => {
                this.trackedPersons?.clear();
                console.log('🔄 Fallback tracker reset');
            },
            getCurrentPersonsCount: () => this.trackedPersons?.size || 0,
            getTotalAppearances: () => this.totalFacesCount || 0,
            getTrackingStats: () => ({
                totalAppearances: this.totalFacesCount || 0,
                uniquePersons: this.trackedPersons?.size || 0,
                currentPersons: this.trackedPersons?.size || 0,
                trackedPersons: this.trackedPersons?.size || 0
            })
        };
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

    // TRONG handleMediaPipeResults - SỬA LỖI GỌI TRACKER
    handleMediaPipeResults(results) {
        if (!this.isDetectionRunning) return;

        try {
            this.ctx.save();
            this.drawVideoFrame();

            const detections = results.detections || [];
            let formattedFaces = [];

            try {
                formattedFaces = this.formatDetections(detections);
            } catch (formatError) {
                console.error('❌ Error formatting detections:', formatError);
                formattedFaces = [];
            }

            // SỬA: KIỂM TRA TRƯỚC KHI GỌI UPDATE
            let trackedFaces = [];

            // CHỈ GỌI TRACKER NẾU CÓ KHUÔN MẶT
            if (formattedFaces.length > 0 && this.faceTracker && this.faceTracker.updateTrackedPersons) {
                try {
                    // Gọi updateTrackedPersons - ĐÂY LÀ PHƯƠNG THỨC BỊ LỖI
                    this.faceTracker.updateTrackedPersons(formattedFaces);

                    // Lấy kết quả từ tracker
                    trackedFaces = this.getTrackedFacesFromTracker(formattedFaces);
                } catch (trackingError) {
                    console.error('❌ Error in face tracking:', trackingError);
                    trackedFaces = this.getFallbackTrackedFaces(formattedFaces);
                }
            } else {
                trackedFaces = this.getFallbackTrackedFaces(formattedFaces);
            }

            // VẼ KHUÔN MẶT
            if (formattedFaces.length > 0) {
                this.drawFaceDetections(formattedFaces, trackedFaces);

                // CẬP NHẬT SỐ LIỆU
                if (this.isTracking) {
                    this.updateTrackingStats(trackedFaces);
                } else {
                    // Khi không tracking, chỉ hiển thị số khuôn mặt hiện tại
                    if (this.onFaceCountUpdate) {
                        this.onFaceCountUpdate(formattedFaces.length);
                    }
                }
            } else {
                // KHÔNG CÓ KHUÔN MẶT
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

    // THÊM PHƯƠNG THỨC MỚI
    getTrackedFacesFromTracker(formattedFaces) {
        if (!this.faceTracker || !this.faceTracker.trackedPersons) {
            return this.getFallbackTrackedFaces(formattedFaces);
        }

        return Array.from(this.faceTracker.trackedPersons.entries())
            .filter(([faceId, face]) => face.isTracked)
            .map(([faceId, face], index) => ({
                id: faceId,
                isNew: false,
                x: face.x,
                y: face.y,
                width: 100, // Giá trị mặc định
                height: 100, // Giá trị mặc định
                confidence: face.confidence || 0.7,
                isTracked: true
            }));
    }

    getFallbackTrackedFaces(faces) {
        return faces.map((face, index) => ({
            id: index + 1,
            isNew: true,
            x: face.x,
            y: face.y,
            width: face.width,
            height: face.height,
            confidence: face.confidence,
            isTracked: true
        }));
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

        // ĐẾM SỐ KHUÔN MẶT TRONG FRAME HIỆN TẠI
        let currentFaceCount = 0;
        let highConfidenceFaces = 0;

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
            let matchedFaceId = null;

            for (const [faceId, tFace] of trackedFaceMap) {
                const distance = Math.sqrt(
                    Math.pow(startX - tFace.x, 2) +
                    Math.pow(startY - tFace.y, 2)
                );

                if (distance < 50 && distance < minDistance) {
                    minDistance = distance;
                    trackedFace = tFace;
                    matchedFaceId = faceId;
                }
            }

            // ĐẾM KHUÔN MẶT CÓ ĐỘ TIN CẬY CAO
            if (face.confidence >= 0.5) {
                currentFaceCount++;
                if (face.confidence >= 0.7) {
                    highConfidenceFaces++;
                }
            }

            this.drawBoundingBox([startX, startY], [width, height], trackedFace, face.confidence, matchedFaceId);
            this.drawLandmarks(face.landmarks);
        });

        // QUAN TRỌNG: CẬP NHẬT BỘ ĐẾM CHÍNH
        if (this.isTracking && currentFaceCount > 0) {
            // Tăng tổng số khuôn mặt
            this.totalFacesCount += currentFaceCount;

            // Cập nhật UI thông qua callback
            if (this.onFaceCountUpdate) {
                this.onFaceCountUpdate(currentFaceCount);
            }

            if (this.onTotalFacesUpdate) {
                this.onTotalFacesUpdate(this.totalFacesCount);
            }

            // Log để debug
            console.log(`🎯 Detected ${currentFaceCount} faces (${highConfidenceFaces} high confidence), Total: ${this.totalFacesCount}`);
        } else if (this.isTracking && currentFaceCount === 0) {
            // Cập nhật về 0 nếu không có khuôn mặt
            if (this.onFaceCountUpdate) {
                this.onFaceCountUpdate(0);
            }
        }

        // Cập nhật tracker với các khuôn mặt mới
        if (this.isTracking && this.faceTracker && formattedFaces.length > 0) {
            this.faceTracker.updateTrackedPersons(formattedFaces);
        }
    }

    drawBoundingBox(start, size, trackedFace, confidence, faceId = null) {
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);

        let boxColor, textColor;
        let isCurrentlyTracked = false;

        // XÁC ĐỊNH TRẠNG THÁI TRACKING
        if (this.isTracking && trackedFace) {
            boxColor = '#00ff00';
            textColor = '#00ff00';
            isCurrentlyTracked = true;
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
        this.ctx.lineWidth = isCurrentlyTracked ? 3 : 2;
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = boxColor;

        // Vẽ bounding box
        this.ctx.strokeRect(start[0], start[1], size[0], size[1]);

        // Vẽ thông tin
        this.ctx.fillStyle = textColor;
        this.ctx.font = 'bold 12px Arial';

        const infoText = isCurrentlyTracked ?
            `Face ${faceId || trackedFace?.id || '?'}` :
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
    }

    drawStatusInfo() {
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(10, 10, 250, 80);

        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'left';

        // Lấy số khuôn mặt hiện tại
        let currentFaces = 0;
        if (this.faceTracker && typeof this.faceTracker.getCurrentPersonsCount === 'function') {
            try {
                currentFaces = this.faceTracker.getCurrentPersonsCount();
            } catch (error) {
                console.warn('⚠️ Error getting current persons count:', error);
            }
        }

        if (this.isTracking) {
            this.ctx.fillText('🎭 Đang Theo Dõi', 20, 30);
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`Tổng lượt: ${this.totalFacesCount}`, 20, 50);
            this.ctx.fillText(`Hiện tại: ${currentFaces}`, 20, 70);
        } else if (this.stream) {
            this.ctx.fillText('📷 Camera đang chạy', 20, 30);
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`Khuôn mặt: ${currentFaces}`, 20, 50);
            this.ctx.fillText('⏸️ Đã dừng thống kê', 20, 70);
        } else {
            this.ctx.fillText('📷 Camera đã tắt', 20, 30);
            this.ctx.font = '12px Arial';
            this.ctx.fillText('🛑 Nhấn "Bật Camera"', 20, 50);
            this.ctx.fillText('để bắt đầu', 20, 70);
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

            // CẬP NHẬT KÍCH THƯỚC CANVAS CHO TRACKER
            if (this.faceTracker && this.faceTracker.canvasWidth !== undefined) {
                this.faceTracker.canvasWidth = this.canvas.width;
                this.faceTracker.canvasHeight = this.canvas.height;
                console.log(`🔄 Updated tracker canvas size: ${this.canvas.width}x${this.canvas.height}`);
            }

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

    // SỬA LẠI startTracking
    startTracking() {
        if (!this.modelsLoaded) {
            alert('Mô hình MediaPipe chưa sẵn sàng. Vui lòng đợi...');
            return;
        }

        if (!this.stream) {
            alert('Camera chưa được bật. Vui lòng bật camera trước.');
            return;
        }

        // Reset tracking state
        this.isTracking = true;
        this.sessionId = Date.now().toString();
        this.startTime = Date.now();
        this.totalFacesCount = 0;

        // Reset tracker
        if (this.faceTracker && this.faceTracker.resetCompletely) {
            this.faceTracker.resetCompletely();
        }

        // Gọi callbacks để reset UI
        if (this.onFaceCountUpdate) {
            this.onFaceCountUpdate(0);
        }
        if (this.onTotalFacesUpdate) {
            this.onTotalFacesUpdate(0);
        }
        if (this.onTrackingTimeUpdate) {
            this.onTrackingTimeUpdate(0);
        }

        console.log('✅ Professional face tracking started');
    }

    stopTracking() {
        if (!this.isTracking) return;

        console.log('⏸️ Stopping face tracking...');

        this.isTracking = false;

        // UI updates - chỉ tắt tracking indicator, không tắt camera
        const recordingStatus = document.getElementById('recordingStatus');
        if (recordingStatus) {
            recordingStatus.classList.remove('active');
        }

        if (this.timeInterval) {
            clearInterval(this.timeInterval);
            this.timeInterval = null;
        }

        // QUAN TRỌNG: KHÔNG dừng detection loop, chỉ dừng tracking
        // Giữ lại số liệu thống kê
        if (this.onFaceCountUpdate) this.onFaceCountUpdate(0);
        if (this.onTotalFacesUpdate) this.onTotalFacesUpdate(this.totalFacesCount);

        // ĐẢM BẢO CAMERA VẪN HOẠT ĐỘNG VÀ VẼ LẠI
        if (this.isCameraOn) {
            // Force redraw để xóa tracking info
            this.drawVideoFrame();
            this.drawStatusInfo();

            // Đảm bảo detection loop vẫn chạy
            if (!this.isDetectionRunning) {
                this.startDetectionLoop();
            }
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

        // Dừng tracking trước nếu đang tracking
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
            let currentFaceCount = trackedFaces?.length || 0;

            // Đếm khuôn mặt có độ tin cậy cao
            if (trackedFaces && trackedFaces.length > 0) {
                currentFaceCount = trackedFaces.filter(face => face.confidence >= 0.5).length;

                // Tăng tổng số khuôn mặt
                if (currentFaceCount > 0) {
                    this.totalFacesCount += currentFaceCount;
                    console.log(`🎯 UpdateTrackingStats: ${currentFaceCount} faces, Total: ${this.totalFacesCount}`);
                }
            }

            // QUAN TRỌNG: Gọi callbacks để cập nhật UI
            if (this.onFaceCountUpdate && typeof this.onFaceCountUpdate === 'function') {
                this.onFaceCountUpdate(currentFaceCount);
            } else {
                console.warn('⚠️ onFaceCountUpdate callback not available or not a function');
            }

            if (this.onTotalFacesUpdate && typeof this.onTotalFacesUpdate === 'function') {
                this.onTotalFacesUpdate(this.totalFacesCount);
            } else {
                console.warn('⚠️ onTotalFacesUpdate callback not available or not a function');
            }

        } catch (error) {
            console.error('❌ Error updating tracking stats:', error);
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

class SmartFaceTracker {
    constructor() {
        this.trackedPersons = new Map();
        this.nextPersonId = 1;

        // Thông tin về canvas
        this.canvasWidth = 640;
        this.canvasHeight = 480;
        this.frameMargin = 100; // Tăng margin lên

        this.minDisappearanceTime = 800; // 0.8 giây
        this.framesWithoutFace = 0;
        this.maxFramesWithoutFace = 10; // ~0.7s không thấy mặt = biến mất

        this.facePresenceState = new Map();
        this.faceAppearanceCount = new Map();

        console.log('🧠 SmartFaceTracker - Detects when face is truly gone');
    }

    update(currentFaces) {
        const results = [];
        const usedMatches = new Set();
        const now = Date.now();

        // NẾU KHÔNG CÓ TRACKER HOẶC ĐANG KHÔNG TRACKING, TRẢ VỀ FALLBACK
        if (!this.isTracking) {
            return this.getSimpleDetection(currentFaces);
        }

        // Đếm frames không có khuôn mặt
        if (currentFaces.length === 0) {
            this.framesWithoutFace++;
            console.log(`📉 No faces detected (${this.framesWithoutFace}/${this.maxFramesWithoutFace} frames)`);
        } else {
            this.framesWithoutFace = 0;
        }

        // Đánh dấu tất cả persons là không seen
        for (const person of this.trackedPersons.values()) {
            person.seen = false;
        }

        // Xử lý từng khuôn mặt hiện tại
        for (const currentFace of currentFaces) {
            let bestMatch = null;
            let bestScore = 0.3;
            let bestMatchId = null;

            for (const [id, knownPerson] of this.trackedPersons.entries()) {
                if (knownPerson.seen || usedMatches.has(id)) continue;

                const score = this.calculateMatchScore(currentFace, knownPerson);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = knownPerson;
                    bestMatchId = id;
                }
            }

            if (bestMatch && bestMatchId) {
                bestMatch.seen = true;
                bestMatch.isTracked = true;
                usedMatches.add(bestMatchId);

                // CẬP NHẬT VÀ KIỂM TRA
                this.updateFacePosition(bestMatchId, currentFace, now);

                results.push({
                    id: bestMatchId,
                    isNew: false,
                    x: currentFace.x,
                    y: currentFace.y,
                    width: currentFace.width,
                    height: currentFace.height,
                    confidence: currentFace.confidence,
                    appearanceCount: this.faceAppearanceCount.get(bestMatchId) || 1
                });

            } else {
                const newPerson = this.createNewPerson(currentFace);
                const newPersonId = newPerson.id;
                this.trackedPersons.set(newPersonId, newPerson);

                this.initializeFace(newPersonId, now, currentFace);
                results.push({
                    id: newPersonId,
                    isNew: true,
                    x: currentFace.x,
                    y: currentFace.y,
                    width: currentFace.width,
                    height: currentFace.height,
                    confidence: currentFace.confidence,
                    appearanceCount: 1
                });
            }
        }

        // XỬ LÝ TRƯỜNG HỢP KHÔNG CÓ KHUÔN MẶT
        this.handleNoFacesSituation(now);

        // XỬ LÝ KHUÔN MẶT KHÔNG ĐƯỢC THẤY
        this.handleUnseenFaces(now);

        return results;
    }

    getSimpleDetection(currentFaces) {
        // Chỉ trả về detection đơn giản, không tracking
        return currentFaces.map((face, index) => ({
            id: index + 1,
            isNew: true,
            x: face.x,
            y: face.y,
            width: face.width,
            height: face.height,
            confidence: face.confidence,
            appearanceCount: 1
        }));
    }

    // Thêm property để kiểm tra trạng thái tracking
    setTrackingStatus(isTracking) {
        this.isTracking = isTracking;
        if (!isTracking) {
            // Reset một số state khi dừng tracking
            this.framesWithoutFace = 0;
        }
    }

    updateFacePosition(personId, face, now) {
        const presenceState = this.facePresenceState.get(personId);

        if (!presenceState) {
            this.initializeFace(personId, now, face);
            return;
        }

        // KIỂM TRA VỊ TRÍ HIỆN TẠI
        const isOutOfFrame = this.isFaceOutOfFrame(face);

        // LƯU VỊ TRÍ
        presenceState.lastPosition = {
            x: face.x,
            y: face.y,
            width: face.width,
            height: face.height,
            timestamp: now
        };

        // NẾU ĐANG NGOÀI FRAME VÀ TRƯỚC ĐÓ TRONG FRAME → VỪA RA NGOÀI
        if (isOutOfFrame && presenceState.isInFrame) {
            presenceState.isInFrame = false;
            presenceState.lastExitTime = now;
            console.log(`🚪 Person ${personId} DISAPPEARED (left frame)`);
        }
        // NẾU ĐANG TRONG FRAME VÀ TRƯỚC ĐÓ NGOÀI FRAME → VỪA VÀO LẠI
        else if (!isOutOfFrame && !presenceState.isInFrame) {
            const timeSinceExit = now - presenceState.lastExitTime;
            if (timeSinceExit >= this.minDisappearanceTime) {
                presenceState.isInFrame = true;
                presenceState.lastEnterTime = now;

                const currentCount = this.faceAppearanceCount.get(personId) || 0;
                const newCount = currentCount + 1;
                this.faceAppearanceCount.set(personId, newCount);

                console.log(`🎉 Person ${personId} RE-APPEARED - Appearance #${newCount} (after ${timeSinceExit}ms)`);
            }
        }
    }

    handleNoFacesSituation(now) {
        // Nếu đã nhiều frames không thấy mặt, đánh dấu tất cả persons là biến mất
        if (this.framesWithoutFace >= this.maxFramesWithoutFace) {
            for (const [personId, presenceState] of this.facePresenceState.entries()) {
                if (presenceState.isInFrame) {
                    presenceState.isInFrame = false;
                    presenceState.lastExitTime = now;
                    console.log(`👻 Person ${personId} DISAPPEARED (no detection for ${this.framesWithoutFace} frames)`);
                }
            }
        }
    }

    handleUnseenFaces(now) {
        for (const [personId, person] of this.trackedPersons.entries()) {
            const presenceState = this.facePresenceState.get(personId);

            if (!presenceState || !presenceState.lastPosition) continue;

            if (!person.seen) {
                // Kiểm tra xem có phải đã ra khỏi frame từ lâu không
                const timeSinceLastSeen = now - presenceState.lastPosition.timestamp;
                const isOutOfFrame = this.isFaceOutOfFrame(presenceState.lastPosition);

                if (isOutOfFrame && presenceState.isInFrame && timeSinceLastSeen > 500) {
                    presenceState.isInFrame = false;
                    presenceState.lastExitTime = now;
                    console.log(`🚪 Person ${personId} DISAPPEARED (unseen and out of frame for ${timeSinceLastSeen}ms)`);
                }
            }
        }
    }

    isFaceOutOfFrame(face) {
        const faceLeft = face.x - face.width / 2;
        const faceRight = face.x + face.width / 2;
        const faceTop = face.y - face.height / 2;
        const faceBottom = face.y + face.height / 2;

        // Kiểm tra xem phần lớn khuôn mặt có nằm ngoài frame không
        const visibleWidth = Math.min(faceRight, this.canvasWidth) - Math.max(faceLeft, 0);
        const visibleHeight = Math.min(faceBottom, this.canvasHeight) - Math.max(faceTop, 0);
        const visibleArea = visibleWidth * visibleHeight;
        const totalArea = face.width * face.height;

        const visibilityRatio = visibleArea / totalArea;
        const isMostlyOutOfFrame = visibilityRatio < 0.3; // Chỉ còn 30% trong frame

        return isMostlyOutOfFrame;
    }

    initializeFace(personId, now, face) {
        const isInitiallyOutOfFrame = this.isFaceOutOfFrame(face);

        this.facePresenceState.set(personId, {
            isInFrame: !isInitiallyOutOfFrame,
            lastExitTime: isInitiallyOutOfFrame ? now : 0,
            lastEnterTime: isInitiallyOutOfFrame ? 0 : now,
            lastPosition: {
                x: face.x,
                y: face.y,
                width: face.width,
                height: face.height,
                timestamp: now
            }
        });
        this.faceAppearanceCount.set(personId, 1);

        console.log(`👶 NEW FACE: Person ${personId} - First appearance`);
    }

    calculateMatchScore(currentFace, knownPerson) {
        const distance = Math.sqrt(
            Math.pow(currentFace.x - knownPerson.x, 2) +
            Math.pow(currentFace.y - knownPerson.y, 2)
        );
        return Math.max(0, 1 - distance / 200);
    }

    createNewPerson(face) {
        const personId = this.nextPersonId++;
        return {
            id: personId,
            x: face.x,
            y: face.y,
            width: face.width,
            height: face.height,
            confidence: face.confidence,
            firstSeen: Date.now(),
            lastSeen: Date.now(),
            isTracked: true,
            seen: true
        };
    }

    getCurrentPersonsCount() {
        return Array.from(this.trackedPersons.values()).filter(person =>
            person.isTracked
        ).length;
    }

    getUniqueFacesCount() {
        return this.faceAppearanceCount.size;
    }

    getTotalAppearances() {
        let total = 0;
        for (const count of this.faceAppearanceCount.values()) {
            total += count;
        }
        return total;
    }

    getTrackingStats() {
        return {
            totalAppearances: this.getTotalAppearances(),
            uniquePersons: this.getUniqueFacesCount(),
            currentPersons: this.getCurrentPersonsCount(),
            trackedPersons: this.trackedPersons.size,
            method: "smart_tracking"
        };
    }

    resetCompletely() {
        this.trackedPersons.clear();
        this.facePresenceState.clear();
        this.faceAppearanceCount.clear();
        this.nextPersonId = 1;
        this.framesWithoutFace = 0;
        console.log('🔄 Smart tracker reset completely');
    }
}