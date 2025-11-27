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

        // THÊM: Biến cho face recognition
        this.faceRecognizer = new SimpleFaceRecognizer();
        this.recognitionEnabled = true;

        console.log('🎯 FaceDetector with Recognition constructor completed');

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

            // SỬA: Tăng confidence threshold và điều chỉnh parameters
            this.faceDetection.setOptions({
                model: 'short',
                minDetectionConfidence: 0.7,  // TĂNG từ 0.1 lên 0.7
                minSuppressionThreshold: 0.3, // THÊM: Giảm overlapping detections
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

            // SỬA: TẠO FORMATTED FACES TRƯỚC
            const formattedFaces = this.formatDetections(detections);

            console.log(`✅ Formatted faces: ${formattedFaces.length}`);

            if (formattedFaces.length > 0) {
                // THÊM: Trích xuất embedding cho recognition
                if (this.recognitionEnabled) {
                    this.extractFaceEmbeddings(formattedFaces);
                }

                // SỬA: LUÔN CẬP NHẬT TRACKER ĐỂ HIỂN THỊ KHUÔN MẶT
                const trackedFaces = this.faceTracker.update(formattedFaces, this.faceRecognizer);

                // SỬA: LUÔN VẼ KHUÔN MẶT DÙ CÓ TRACKING HAY KHÔNG
                this.drawMediaPipeDetections(formattedFaces, trackedFaces);

                // 3. Chỉ cập nhật thống kê khi đang tracking
                if (this.isTracking) {
                    this.updateTrackingStats(trackedFaces);
                } else {
                    // KHI KHÔNG TRACKING, VẪN HIỂN THỊ SỐ KHUÔN MẶT HIỆN TẠI
                    if (this.onFaceCountUpdate) {
                        this.onFaceCountUpdate(trackedFaces.length);
                    }
                }
            } else {
                this.drawNoFacesInfo();

                // Cập nhật 0 faces khi không có detection
                if (this.onFaceCountUpdate) {
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

    // THÊM: Phương thức trích xuất embedding (giả lập)
    extractFaceEmbeddings(faces) {
        faces.forEach(face => {
            // Trong thực tế, bạn sẽ dùng FaceNet, InsightFace, hoặc model recognition
            // Ở đây tôi tạo embedding đơn giản dựa trên đặc điểm khuôn mặt
            face.embedding = this.createSimpleEmbedding(face);
        });
    }

    // THÊM: Tạo embedding đơn giản từ các đặc điểm
    createSimpleEmbedding(face) {
        // Sử dụng vị trí tương đối, kích thước, và landmarks để tạo "dấu vân tay" khuôn mặt
        const landmarks = face.landmarks || [];

        // Tạo vector đặc trưng đơn giản
        const embedding = [
            face.width / this.canvas.width,    // Tỷ lệ chiều rộng
            face.height / this.canvas.height,  // Tỷ lệ chiều cao
            face.x / this.canvas.width,        // Vị trí X chuẩn hóa
            face.y / this.canvas.height,       // Vị trí Y chuẩn hóa
            face.confidence                    // Độ tin cậy
        ];

        // Thêm thông tin từ landmarks nếu có
        if (landmarks.length >= 6) {
            // Khoảng cách giữa hai mắt (tính tương đối)
            const eyeDistance = Math.sqrt(
                Math.pow(landmarks[0].x - landmarks[2].x, 2) +
                Math.pow(landmarks[0].y - landmarks[2].y, 2)
            );
            embedding.push(eyeDistance);

            // Tỷ lệ chiều rộng/chiều cao khuôn mặt
            embedding.push(face.width / face.height);
        }

        return embedding;
    }

    formatDetections(detections) {
        console.log(`📊 Formatting ${detections.length} detections`);

        const filteredDetections = detections
            .map((det, index) => {
                // Lọc confidence ngay từ đầu
                if (det.confidence < 0.6) {
                    console.log(`🚫 Skipping low confidence detection: ${det.confidence}`);
                    return null;
                }

                const bbox = det.boundingBox;
                if (!bbox) {
                    console.warn(`⚠️ Detection ${index} has no boundingBox`);
                    return null;
                }

                console.log(`🔍 BoundingBox ${index} structure:`, Object.keys(bbox));

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
                    console.warn(`❌ Unknown boundingBox structure:`, bbox);
                    return null;
                }

                // Kiểm tra kích thước hợp lý
                const minFaceSize = 80;
                const maxFaceSize = 350;

                if (widthPx < minFaceSize || heightPx < minFaceSize ||
                    widthPx > maxFaceSize || heightPx > maxFaceSize) {
                    console.log(`🚫 Skipping invalid size: ${widthPx.toFixed(0)}x${heightPx.toFixed(0)}`);
                    return null;
                }

                // Kiểm tra tỷ lệ khung hình
                const aspectRatio = widthPx / heightPx;
                if (aspectRatio < 0.7 || aspectRatio > 1.5) {
                    console.log(`🚫 Skipping invalid aspect ratio: ${aspectRatio.toFixed(2)}`);
                    return null;
                }

                const centerXPx = startXPx + widthPx / 2;
                const centerYPx = startYPx + heightPx / 2;

                const confidence = det.confidence || 0.8;

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
                    confidence: confidence,
                    rawConfidence: det.confidence
                };

                if (isNaN(faceData.x) || isNaN(faceData.y) || isNaN(faceData.width) || isNaN(faceData.height)) {
                    console.warn(`❌ Invalid face data for detection ${index}:`, faceData);
                    return null;
                }

                console.log(`📝 Formatted face ${index}: confidence=${faceData.confidence}, start=[${startXPx.toFixed(0)},${startYPx.toFixed(0)}], size=${faceData.width.toFixed(0)}x${faceData.height.toFixed(0)}px`);
                return faceData;
            })
            .filter(face => face !== null);

        // Áp dụng NMS trên các detection đã format
        const finalDetections = this.applyNonMaximumSuppression(filteredDetections);
        console.log(`✅ After NMS: ${finalDetections.length} valid faces`);

        return finalDetections;
    }

    // PHƯƠNG THỨC NMS CHO FACE DETECTOR
    applyNonMaximumSuppression(detections, iouThreshold = 0.4) {
        if (detections.length <= 1) {
            console.log('📦 No NMS needed - less than 2 detections');
            return detections;
        }

        console.log(`🔄 Applying NMS to ${detections.length} detections`);

        // Sắp xếp theo confidence giảm dần
        const sortedDetections = [...detections].sort((a, b) => b.confidence - a.confidence);
        const selectedDetections = [];

        while (sortedDetections.length > 0) {
            // Lấy detection có confidence cao nhất
            const bestDetection = sortedDetections.shift();
            selectedDetections.push(bestDetection);

            // Loại bỏ các detection overlap nhiều với best detection
            for (let i = sortedDetections.length - 1; i >= 0; i--) {
                const iou = this.calculateDetectionIoU(bestDetection, sortedDetections[i]);
                console.log(`🔍 Comparing detection - IoU: ${iou.toFixed(3)}`);

                if (iou > iouThreshold) {
                    console.log(`🗑️ Removing overlapping detection (IoU: ${iou.toFixed(3)})`);
                    sortedDetections.splice(i, 1);
                }
            }
        }

        console.log(`🎯 NMS completed: ${selectedDetections.length} detections remaining`);
        return selectedDetections;
    }

    // Helper method để tính IoU cho NMS
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

            const iou = union > 0 ? intersection / union : 0;
            return iou;
        } catch (error) {
            console.error('❌ Error in IoU calculation:', error);
            return 0;
        }
    }

    // Helper method để lấy bounding box từ face data
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

        console.log(`🎯 Drawing ${formattedFaces.length} formatted faces`);

        formattedFaces.forEach((face, index) => {
            // SỬA: formattedFaces ĐÃ CÓ PIXEL COORDINATES, CHỈ CẦN SỬ DỤNG TRỰC TIẾP
            const startX = face.boundingBox.start[0];
            const startY = face.boundingBox.start[1];
            const width = face.width;
            const height = face.height;

            // KIỂM TRA TÍNH HỢP LỆ
            if (isNaN(startX) || isNaN(startY) || isNaN(width) || isNaN(height)) {
                console.warn(`❌ Invalid coordinates for face ${index}: start=[${startX}, ${startY}], size=${width}x${height}`);
                return;
            }

            const start = [startX, startY];
            const size = [width, height];

            console.log(`🎨 Drawing face ${index} at [${startX.toFixed(0)}, ${startY.toFixed(0)}] size ${width.toFixed(0)}x${height.toFixed(0)}`);

            // Tìm face được track
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

            // Vẽ bounding box
            const confidence = face.confidence || 0;
            this.drawStableBoundingBox(start, size, trackedFace, confidence, face.landmarks?.length >= 6);

            // Vẽ landmarks
            this.drawMediaPipeLandmarks(face.landmarks);
        });
    }

    // SỬA: Thêm điều kiện kiểm tra landmarks
    drawStableBoundingBox(start, size, trackedFace, confidence, hasGoodLandmarks) {
        // KIỂM TRA TÍNH HỢP LỆ CỦA TẤT CẢ THAM SỐ
        if (!start || start[0] === undefined || start[1] === undefined ||
            isNaN(start[0]) || isNaN(start[1]) || isNaN(size[0]) || isNaN(size[1])) {
            console.warn('⚠️ Invalid parameters in drawStableBoundingBox:', { start, size });
            return;
        }

        this.ctx.save();

        // QUAN TRỌNG: Reset transform trước khi vẽ bounding box
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Xác định màu sắc
        let boxColor, textColor;

        if (this.isTracking && trackedFace && trackedFace.isTracked) {
            boxColor = '#00ff00'; // Xanh lá - đang tracked
            textColor = '#00ff00';
        } else if (confidence >= 0.7) {
            boxColor = '#00ff00'; // Xanh lá - confidence cao
            textColor = '#00ff00';
        } else if (confidence >= 0.5) {
            boxColor = '#ffff00'; // Vàng - confidence trung bình
            textColor = '#ffff00';
        } else {
            boxColor = '#ff4444'; // Đỏ - confidence thấp
            textColor = '#ff4444';
        }

        this.ctx.strokeStyle = boxColor;
        this.ctx.lineWidth = trackedFace ? 3 : 2;
        this.ctx.shadowBlur = 8;
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

        // QUAN TRỌNG: Khôi phục transform cho video
        this.ctx.translate(this.canvas.width, 0);
        this.ctx.scale(-1, 1);

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

        // Vẽ các điểm landmarks với flip
        landmarks.forEach((landmark, index) => {
            // FLIP landmark theo trục X
            const flippedX = this.canvas.width - (landmark.x * this.canvas.width);
            const y = landmark.y * this.canvas.height;

            this.ctx.beginPath();
            this.ctx.arc(flippedX, y, 3, 0, 2 * Math.PI);
            this.ctx.fill();
        });

        // Vẽ connections cho landmarks face với flip
        this.ctx.beginPath();

        // Right eye (0, 1) - ĐÃ FLIP
        const flippedX0 = this.canvas.width - (landmarks[0].x * this.canvas.width);
        const flippedX1 = this.canvas.width - (landmarks[1].x * this.canvas.width);

        this.ctx.moveTo(flippedX0, landmarks[0].y * this.canvas.height);
        this.ctx.lineTo(flippedX1, landmarks[1].y * this.canvas.height);

        // Left eye (2, 3) - ĐÃ FLIP
        const flippedX2 = this.canvas.width - (landmarks[2].x * this.canvas.width);
        const flippedX3 = this.canvas.width - (landmarks[3].x * this.canvas.width);

        this.ctx.moveTo(flippedX2, landmarks[2].y * this.canvas.height);
        this.ctx.lineTo(flippedX3, landmarks[3].y * this.canvas.height);

        // Nose tip (4) - vẽ chữ thập - ĐÃ FLIP
        const flippedX4 = this.canvas.width - (landmarks[4].x * this.canvas.width);
        this.ctx.moveTo(flippedX4 - 4, landmarks[4].y * this.canvas.height);
        this.ctx.lineTo(flippedX4 + 4, landmarks[4].y * this.canvas.height);
        this.ctx.moveTo(flippedX4, landmarks[4].y * this.canvas.height - 4);
        this.ctx.lineTo(flippedX4, landmarks[4].y * this.canvas.height + 4);

        // Mouth (5) - vẽ đường ngang - ĐÃ FLIP
        const flippedX5 = this.canvas.width - (landmarks[5].x * this.canvas.width);
        this.ctx.moveTo(flippedX5 - 4, landmarks[5].y * this.canvas.height);
        this.ctx.lineTo(flippedX5 + 4, landmarks[5].y * this.canvas.height);

        this.ctx.stroke();
        this.ctx.restore();
    } drawMediaPipeLandmarks(landmarks) {
        if (!landmarks || landmarks.length < 6) {
            return;
        }

        this.ctx.save();

        // QUAN TRỌNG: Reset transform trước khi vẽ landmarks
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);

        this.ctx.fillStyle = '#00ff00';
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 1.5;

        // Vẽ các điểm landmarks với flip chính xác
        landmarks.forEach((landmark, index) => {
            // FLIP landmark theo trục X (giống với bounding box)
            const flippedX = this.canvas.width - (landmark.x * this.canvas.width);
            const y = landmark.y * this.canvas.height;

            this.ctx.beginPath();
            this.ctx.arc(flippedX, y, 3, 0, 2 * Math.PI);
            this.ctx.fill();
        });

        // Vẽ connections cho landmarks face với flip
        this.ctx.beginPath();

        // Right eye (0, 1) - ĐÃ FLIP
        const flippedX0 = this.canvas.width - (landmarks[0].x * this.canvas.width);
        const flippedX1 = this.canvas.width - (landmarks[1].x * this.canvas.width);

        this.ctx.moveTo(flippedX0, landmarks[0].y * this.canvas.height);
        this.ctx.lineTo(flippedX1, landmarks[1].y * this.canvas.height);

        // Left eye (2, 3) - ĐÃ FLIP
        const flippedX2 = this.canvas.width - (landmarks[2].x * this.canvas.width);
        const flippedX3 = this.canvas.width - (landmarks[3].x * this.canvas.width);

        this.ctx.moveTo(flippedX2, landmarks[2].y * this.canvas.height);
        this.ctx.lineTo(flippedX3, landmarks[3].y * this.canvas.height);

        // Nose tip (4) - vẽ chữ thập - ĐÃ FLIP
        const flippedX4 = this.canvas.width - (landmarks[4].x * this.canvas.width);
        this.ctx.moveTo(flippedX4 - 4, landmarks[4].y * this.canvas.height);
        this.ctx.lineTo(flippedX4 + 4, landmarks[4].y * this.canvas.height);
        this.ctx.moveTo(flippedX4, landmarks[4].y * this.canvas.height - 4);
        this.ctx.lineTo(flippedX4, landmarks[4].y * this.canvas.height + 4);

        // Mouth (5) - vẽ đường ngang - ĐÃ FLIP
        const flippedX5 = this.canvas.width - (landmarks[5].x * this.canvas.width);
        this.ctx.moveTo(flippedX5 - 4, landmarks[5].y * this.canvas.height);
        this.ctx.lineTo(flippedX5 + 4, landmarks[5].y * this.canvas.height);

        this.ctx.stroke();
        this.ctx.restore();

        // KHÔI PHỤC TRANSFORM CHO VIDEO
        this.ctx.translate(this.canvas.width, 0);
        this.ctx.scale(-1, 1);
    }

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
        // QUAN TRỌNG: Reset transform trước khi vẽ text
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
        // KHÔI PHỤC transform cho video
        this.ctx.translate(this.canvas.width, 0);
        this.ctx.scale(-1, 1);
    }

    drawStatusInfo() {
        // QUAN TRỌNG: Reset transform trước khi vẽ status
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
            this.ctx.fillText(`Tổng: ${this.totalFacesCount}`, 20, 50);
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
        // KHÔI PHỤC transform cho video
        this.ctx.translate(this.canvas.width, 0);
        this.ctx.scale(-1, 1);
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
            console.log('⏳ Video not ready for drawing');
            // Vẽ màn hình đen với thông báo
            this.ctx.save();
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.fillStyle = '#000000';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('⏳ Đang tải camera...', this.canvas.width / 2, this.canvas.height / 2);
            this.ctx.restore();
            return;
        }

        try {
            // LUÔN reset transform trước khi vẽ video
            this.ctx.save();
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);

            // Xóa toàn bộ canvas
            this.ctx.fillStyle = '#000000';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            // Áp dụng flip cho video (mirror effect)
            this.ctx.translate(this.canvas.width, 0);
            this.ctx.scale(-1, 1);

            // Vẽ video frame
            this.ctx.drawImage(
                this.video,
                0, 0,
                this.canvas.width,
                this.canvas.height
            );

            this.ctx.restore();

            console.log('✅ Video frame drawn successfully');

        } catch (error) {
            console.error('❌ Error drawing video frame:', error);
            // Fallback: vẽ màn hình đen
            this.ctx.save();
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.fillStyle = '#000000';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.restore();
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

        console.log('⏸️ Stopping face tracking (but keeping camera running)...');

        this.isTracking = false;

        const recordingStatus = document.getElementById('recordingStatus');
        if (recordingStatus) {
            recordingStatus.classList.remove('active');
        }

        if (this.timeInterval) {
            clearInterval(this.timeInterval);
            this.timeInterval = null;
        }

        // CHỈ reset tracking stats, không reset camera
        if (this.onFaceCountUpdate) this.onFaceCountUpdate(0);
        if (this.onTotalFacesUpdate) this.onTotalFacesUpdate(0);
        if (this.onTrackingTimeUpdate) this.onTrackingTimeUpdate(0);

        // KHÔNG reset uniqueFaces và totalFacesCount nếu muốn giữ lại lịch sử
        // this.uniqueFaces.clear();
        // this.totalFacesCount = 0;

        this.updateButtonStates();

        // VẪN HIỂN THỊ CAMERA VÀ PHÁT HIỆN KHUÔN MẶT
        console.log('✅ Face tracking stopped, camera continues running');
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
                        // Có thể bắt đầu tracking nếu camera đang chạy và chưa tracking
                        button.disabled = !hasCamera || isTracking;
                        break;
                    case 'stopTracking':
                        // Có thể dừng tracking nếu đang tracking
                        button.disabled = !hasCamera || !isTracking;
                        break;
                }
            }
        }
    }

    stopCamera() {
        console.log('🛑 Stopping camera completely...');
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
            this.video.pause();
            this.video.srcObject = null;
            // KHÔNG xóa video element khỏi DOM, chỉ reset
            // this.video.remove(); // DÒNG NÀY GÂY LỖI
        }

        // Dừng tracking nếu đang chạy
        if (this.isTracking) {
            this.stopTracking();
        }

        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);

            // Hiển thị thông báo khi camera tắt - SỬA LẠI ĐỂ HIỂN THỊ ĐÚNG
            this.ctx.fillStyle = '#000000'; // Nền đen
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

            // CHỈ ĐẾM KHUÔN MẶT KHI: isNew = true VÀ chưa từng được đếm
            trackedFaces.forEach(face => {
                const trackedFace = this.faceTracker.faces.get(face.id);

                if (face.isNew && trackedFace && !trackedFace.hasBeenCounted) {
                    console.log(`🎉 Counting TRULY NEW face: ${face.id}`);
                    this.uniqueFaces.add(face.id);
                    trackedFace.hasBeenCounted = true; // ĐÁNH DẤU ĐÃ ĐẾM
                }
            });

            this.totalFacesCount = this.uniqueFaces.size;

            if (this.onFaceCountUpdate) {
                this.onFaceCountUpdate(currentFaceCount);
            }

            if (this.onTotalFacesUpdate) {
                this.onTotalFacesUpdate(this.totalFacesCount);
            }

            console.log(`📈 Stats: current=${currentFaceCount}, total=${this.totalFacesCount}, unique=${this.uniqueFaces.size}`);

        } catch (error) {
            console.error('❌ Error updating tracking stats:', error);
        }
    }

    // THÊM PHƯƠNG THỨC MỚI: Kiểm tra độ ổn định của khuôn mặt
    isFaceStable(face) {
        // Kiểm tra kích thước hợp lý
        const minStableSize = 100;
        const maxStableSize = 300;

        if (face.width < minStableSize || face.height < minStableSize ||
            face.width > maxStableSize || face.height > maxStableSize) {
            return false;
        }

        // Kiểm tra confidence cao
        if (face.confidence < 0.7) {
            return false;
        }

        // Kiểm tra tỷ lệ khung mặt hợp lý
        const aspectRatio = face.width / face.height;
        if (aspectRatio < 0.8 || aspectRatio > 1.2) {
            return false;
        }

        return true;
    }
}

// CLASS TRACKER - TĂNG ĐỘ CHÍNH XÁC
class ImprovedFaceTracker {
    constructor() {
        this.faces = new Map();
        this.nextId = 1;
        this.maxFramesLost = 20;
        this.trackingThreshold = 0.5;
        this.smoothingFactor = 0.3;
        this.positionHistory = new Map();

        // THÊM: Biến cho recognition
        this.recognitionThreshold = 0.7; // Ngưỡng nhận diện
        this.faceCache = new Map(); // Cache khuôn mặt đã nhận diện
    }

    reset() {
        this.faces.clear();
        this.nextId = 1;
        this.positionHistory.clear();
    }

    update(currentFaces, faceRecognizer = null) {
        console.log(`🔄 Updating tracker with ${currentFaces.length} faces`);

        // Đánh dấu tất cả faces là không seen
        for (const face of this.faces.values()) {
            face.seen = false;
            face.framesLost++;
        }

        const results = [];
        const usedMatches = new Set();

        // Lọc faces có chất lượng tốt
        const validFaces = currentFaces.filter(face =>
            face.confidence >= 0.7 &&
            face.width >= 80 && face.height >= 80 &&
            face.width <= 300 && face.height <= 300
        );

        const sortedDetections = [...validFaces].sort((a, b) => b.confidence - a.confidence);

        // Giai đoạn 1: Match với faces đang được track
        for (const currentFace of sortedDetections) {
            let bestMatch = null;
            let bestScore = 0.6;
            let bestMatchId = null;
            let bestMatchType = 'position'; // 'position' hoặc 'recognition'

            for (const [id, knownFace] of this.faces.entries()) {
                if (knownFace.seen || usedMatches.has(id)) continue;

                let totalScore = 0;
                let matchType = 'position';

                // THÊM: Ưu tiên recognition nếu có
                if (faceRecognizer && currentFace.embedding && knownFace.embedding) {
                    const recognitionScore = faceRecognizer.compareEmbeddings(
                        currentFace.embedding,
                        knownFace.embedding
                    );

                    if (recognitionScore > this.recognitionThreshold) {
                        totalScore = recognitionScore;
                        matchType = 'recognition';
                        console.log(`🎭 RECOGNITION match with face ${id}: score=${recognitionScore.toFixed(3)}`);
                    }
                }

                // Nếu không có recognition match, dùng positional matching
                if (matchType === 'position') {
                    const iouScore = this.calculateIoU(currentFace, knownFace);
                    const centerDistance = this.calculateDistance(currentFace, knownFace);

                    if (iouScore < 0.3 && centerDistance > 80) continue;

                    const sizeSimilarity = this.calculateSizeSimilarity(currentFace, knownFace);

                    const safeIou = isNaN(iouScore) ? 0 : Math.max(0, Math.min(1, iouScore));
                    const safeDistance = isNaN(centerDistance) ? 1000 : centerDistance;
                    const safeSizeSimilarity = isNaN(sizeSimilarity) ? 0 : Math.max(0, Math.min(1, sizeSimilarity));

                    totalScore = (safeIou * 0.7) +
                        (Math.max(0, 1 - safeDistance / 120) * 0.2) +
                        (safeSizeSimilarity * 0.1);
                }

                console.log(`🎯 Matching with face ${id}: ${matchType} score=${totalScore.toFixed(3)}`);

                if (totalScore > bestScore) {
                    bestScore = totalScore;
                    bestMatch = knownFace;
                    bestMatchId = id;
                    bestMatchType = matchType;
                }
            }

            if (bestMatch && bestMatchId) {
                console.log(`✅ ${bestMatchType.toUpperCase()} MATCH with face ${bestMatchId} (score: ${bestScore.toFixed(3)})`);

                // Cập nhật embedding nếu có recognition
                if (bestMatchType === 'recognition' && currentFace.embedding) {
                    bestMatch.embedding = currentFace.embedding;
                    bestMatch.lastRecognition = Date.now();
                }

                this.updateFaceWithSmoothing(bestMatch, currentFace);
                bestMatch.seen = true;
                bestMatch.framesLost = 0;
                bestMatch.isTracked = true;
                bestMatch.confidence = currentFace.confidence;
                bestMatch.lastSeen = Date.now();

                usedMatches.add(bestMatchId);

                results.push({
                    id: bestMatchId,
                    isNew: false, // KHÔNG phải mới vì đã match
                    x: bestMatch.x,
                    y: bestMatch.y,
                    width: bestMatch.width,
                    height: bestMatch.height,
                    confidence: bestMatch.confidence,
                    recognitionScore: bestMatchType === 'recognition' ? bestScore : null
                });
            } else {
                // THÊM: Kiểm tra xem face này đã từng xuất hiện chưa (dựa trên recognition)
                let recognizedId = null;
                if (faceRecognizer && currentFace.embedding) {
                    recognizedId = this.findRecognizedFace(currentFace, faceRecognizer);
                }

                if (recognizedId) {
                    console.log(`🔍 RECOGNITION RE-IDENTIFICATION: face ${recognizedId} reappeared`);

                    const knownFace = this.faces.get(recognizedId);
                    this.updateFaceWithSmoothing(knownFace, currentFace);
                    knownFace.seen = true;
                    knownFace.framesLost = 0;
                    knownFace.isTracked = true;
                    knownFace.confidence = currentFace.confidence;
                    knownFace.lastSeen = Date.now();
                    knownFace.embedding = currentFace.embedding;

                    usedMatches.add(recognizedId);

                    results.push({
                        id: recognizedId,
                        isNew: false, // KHÔNG phải mới, chỉ là reappearance
                        x: knownFace.x,
                        y: knownFace.y,
                        width: knownFace.width,
                        height: knownFace.height,
                        confidence: knownFace.confidence,
                        recognitionScore: 0.8 // Giả định recognition score cao
                    });
                } else {
                    // Tạo face mới thực sự
                    console.log(`🆕 CREATING NEW face ${this.nextId}`);
                    const newFace = this.createNewFace(currentFace);
                    this.faces.set(newFace.id, newFace);

                    // Lưu embedding nếu có
                    if (currentFace.embedding) {
                        newFace.embedding = currentFace.embedding;
                        newFace.firstSeen = Date.now();
                    }

                    this.positionHistory.set(newFace.id, [{
                        x: currentFace.x,
                        y: currentFace.y,
                        width: currentFace.width,
                        height: currentFace.height,
                        timestamp: Date.now()
                    }]);

                    results.push({
                        id: newFace.id,
                        isNew: true, // THỰC SỰ mới
                        x: currentFace.x,
                        y: currentFace.y,
                        width: currentFace.width,
                        height: currentFace.height,
                        confidence: currentFace.confidence
                    });
                }
            }
        }

        // Dọn dẹp faces mất tích
        this.cleanupLostFaces();

        console.log(`📊 Tracker results: ${results.length} faces (active: ${this.faces.size})`);
        return results;
    }

    // THÊM: Tìm khuôn mặt đã nhận diện trước đó
    findRecognizedFace(currentFace, faceRecognizer) {
        for (const [id, knownFace] of this.faces.entries()) {
            if (!knownFace.embedding) continue;

            const recognitionScore = faceRecognizer.compareEmbeddings(
                currentFace.embedding,
                knownFace.embedding
            );

            if (recognitionScore > this.recognitionThreshold) {
                console.log(`🔍 Found recognized face ${id} with score: ${recognitionScore.toFixed(3)}`);
                return id;
            }
        }
        return null;
    }

    // THÊM PHƯƠNG THỨC MỚI: Kiểm tra nghiêm ngặt cho face mới
    isValidNewFace(face) {
        // Kiểm tra confidence rất cao cho face mới
        if (face.confidence < 0.8) {
            console.log(`❌ New face confidence too low: ${face.confidence}`);
            return false;
        }

        // Kiểm tra kích thước ổn định
        const minSize = 100;
        const maxSize = 280;
        if (face.width < minSize || face.height < minSize ||
            face.width > maxSize || face.height > maxSize) {
            console.log(`❌ New face size invalid: ${face.width}x${face.height}`);
            return false;
        }

        // Kiểm tra tỷ lệ khung mặt
        const aspectRatio = face.width / face.height;
        if (aspectRatio < 0.75 || aspectRatio > 1.3) {
            console.log(`❌ New face aspect ratio invalid: ${aspectRatio.toFixed(2)}`);
            return false;
        }

        // Kiểm tra vị trí (không quá gần biên)
        const margin = 50;
        if (face.x < margin || face.x > this.canvas.width - margin ||
            face.y < margin || face.y > this.canvas.height - margin) {
            console.log(`❌ New face too close to edge: [${face.x.toFixed(0)}, ${face.y.toFixed(0)}]`);
            return false;
        }

        console.log(`✅ New face validation PASSED`);
        return true;
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

        // Giới hạn history size
        if (history.length > 5) {
            history.shift();
        }
        this.positionHistory.set(knownFace.id, history);

        // Tính trung bình đơn giản
        const smoothed = this.calculateSimpleAverage(history);

        // Áp dụng smoothing nhẹ
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

    calculateWeightedMovingAverage(history) {
        if (history.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

        let totalWeight = 0;
        const sum = { x: 0, y: 0, width: 0, height: 0 };

        for (let i = 0; i < history.length; i++) {
            const weight = (i + 1) / history.length;
            totalWeight += weight;

            sum.x += history[i].x * weight;
            sum.y += history[i].y * weight;
            sum.width += history[i].width * weight;
            sum.height += history[i].height * weight;
        }

        return {
            x: sum.x / totalWeight,
            y: sum.y / totalWeight,
            width: sum.width / totalWeight,
            height: sum.height / totalWeight
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

    // SỬA: KIỂM TRA NGHIÊM NGẶT HƠN
    isValidFace(face) {
        // KIỂM TRA TÍNH HỢP LỆ CỦA TẤT CẢ TỌA ĐỘ
        if (!face || isNaN(face.x) || isNaN(face.y) || isNaN(face.width) || isNaN(face.height)) {
            console.log(`❌ Invalid face coordinates: x=${face?.x}, y=${face?.y}, width=${face?.width}, height=${face?.height}`);
            return false;
        }

        console.log(`🔍 Validating face: conf=${face.confidence}, size=${face.width.toFixed(0)}x${face.height.toFixed(0)}px, landmarks=${face.landmarks?.length || 0}`);

        // 1. Confidence - TĂNG NGƯỠNG
        if (face.confidence < 0.6) { // Tăng từ 0.3 lên 0.6
            console.log(`❌ Low confidence: ${face.confidence}`);
            return false;
        }

        // 2. Landmarks - YÊU CẦU ĐỦ LANDMARKS
        if (!face.landmarks || face.landmarks.length < 6) {
            console.log(`❌ Insufficient landmarks: ${face.landmarks?.length || 0}`);
            return false;
        }

        // 3. Kích thước - ĐIỀU CHỈNH NGẮT NGẮN HƠN
        const minFaceSize = 80;   // Tăng từ 40 lên 80
        const maxFaceSize = 350;  // Giảm từ 400 xuống 350

        if (face.width < minFaceSize || face.height < minFaceSize) {
            console.log(`❌ Face too small: ${face.width.toFixed(0)}x${face.height.toFixed(0)}px`);
            return false;
        }

        if (face.width > maxFaceSize || face.height > maxFaceSize) {
            console.log(`❌ Face too large: ${face.width.toFixed(0)}x${face.height.toFixed(0)}px`);
            return false;
        }

        // 4. Tỷ lệ - NGẮT NGẮN HƠN
        const aspectRatio = face.width / face.height;
        const validAspectRatio = aspectRatio >= 0.7 && aspectRatio <= 1.5; // Thu hẹp range

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
            lastSeen: Date.now(),
            hasBeenCounted: false,
            embedding: faceData.embedding || null // THÊM: embedding
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
// THÊM: Class đơn giản cho Face Recognition
class SimpleFaceRecognizer {
    constructor() {
        this.faceDatabase = new Map(); // Database khuôn mặt đã biết
        this.similarityThreshold = 0.7; // Ngưỡng similarity
    }

    // So sánh hai embedding
    compareEmbeddings(embedding1, embedding2) {
        if (!embedding1 || !embedding2) return 0;
        if (embedding1.length !== embedding2.length) return 0;

        // Tính cosine similarity đơn giản
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

        if (norm1 === 0 || norm2 === 0) return 0;

        const similarity = dotProduct / (norm1 * norm2);
        return Math.max(0, Math.min(1, similarity));
    }

    // Thêm khuôn mặt vào database
    addFaceToDatabase(faceId, embedding) {
        this.faceDatabase.set(faceId, {
            embedding: embedding,
            addedAt: Date.now()
        });
    }

    // Tìm khuôn mặt phù hợp trong database
    findMatchingFace(embedding) {
        let bestMatch = null;
        let bestScore = 0;

        for (const [faceId, faceData] of this.faceDatabase.entries()) {
            const score = this.compareEmbeddings(embedding, faceData.embedding);

            if (score > bestScore && score > this.similarityThreshold) {
                bestScore = score;
                bestMatch = faceId;
            }
        }

        return bestMatch ? { id: bestMatch, score: bestScore } : null;
    }
}