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
            
            // Khi video đã load metadata, khởi tạo canvas
            this.video.addEventListener('loadedmetadata', () => {
                this.initializeCanvas();
                this.video.play(); // Bắt đầu play video
            });
            
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
            
            // Clear canvas
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            
            // Reset transform
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            
            this.updateButtonStates();
            console.log('Camera stopped');
        }
    }

    startTracking() {
        // Kiểm tra DOM elements trước
        if (!this.video || !this.canvas) {
            console.error('❌ Video or Canvas elements not found');
            alert('Camera elements not ready. Please try again.');
            return;
        }

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

        // Show recording status - THÊM KIỂM TRA NULL
        const recordingStatus = document.getElementById('recordingStatus');
        if (recordingStatus) {
            recordingStatus.classList.add('active');
        }

        // Start face detection loop
        this.trackingInterval = setInterval(() => {
            this.detectFaces();
        }, 200);

        // Update tracking time và kiểm tra lưu theo phút
        this.timeInterval = setInterval(() => {
            if (this.isTracking && this.onTrackingTimeUpdate) {
                const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
                this.onTrackingTimeUpdate(elapsedSeconds);

                // Kiểm tra và lưu dữ liệu mỗi phút
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

        // Lưu dữ liệu phút cuối cùng (nếu có)
        const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
        const currentMinute = Math.floor(elapsedSeconds / 60);

        // Nếu có dữ liệu chưa lưu của phút cuối
        if (currentMinute >= this.lastMinuteSave) {
            this.saveCurrentMinuteData();
        }

        // Lưu dữ liệu tổng thể
        this.saveFinalMinuteData(elapsedSeconds);

        // Hide recording status - THÊM KIỂM TRA NULL
        const recordingStatus = document.getElementById('recordingStatus');
        if (recordingStatus) {
            recordingStatus.classList.remove('active');
        }

        if (this.trackingInterval) {
            clearInterval(this.trackingInterval);
            this.trackingInterval = null;
        }

        if (this.timeInterval) {
            clearInterval(this.timeInterval);
            this.timeInterval = null;
        }

        this.updateButtonStates();
        console.log('Face tracking stopped');
        console.log('Minute intervals saved:', this.minuteIntervals);
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
        if (!this.isTracking || !this.model || !this.stream) return;
        
        try {
            // Vẽ video frame lên canvas
            this.drawVideoFrame();
            
            const predictions = await this.model.estimateFaces(this.video, false);
            
            if (predictions.length > 0) {
                // Update current face count
                if (this.onFaceCountUpdate) {
                    this.onFaceCountUpdate(predictions.length);
                }
                
                // Track unique faces
                const newFacesCount = this.trackUniqueFaces(predictions);
                
                if (newFacesCount > 0 && this.onTotalFacesUpdate) {
                    this.onTotalFacesUpdate(this.totalFacesCount);
                }
                
                // Draw face bounding boxes and landmarks
                this.drawFaceDetections(predictions);
            } else {
                if (this.onFaceCountUpdate) {
                    this.onFaceCountUpdate(0);
                }
                this.faceTracker.update([]);
                
                // Vẽ thông tin khi không có khuôn mặt
                this.drawNoFacesInfo();
            }
            
            // Vẽ thông tin tracking
            this.drawTrackingInfo();
            
        } catch (error) {
            console.error('Error detecting faces:', error);
        }
    }

    // Vẽ video frame lên canvas
    drawVideoFrame() {
        if (this.video.videoWidth === 0 || this.video.videoHeight === 0) return;
        
        try {
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
    trackUniqueFaces(predictions) {
        const faces = predictions.map(pred => {
            const start = pred.topLeft;
            const end = pred.bottomRight;
            return {
                x: (start[0] + end[0]) / 2,
                y: (start[1] + end[1]) / 2,
                width: end[0] - start[0],
                height: end[1] - start[1],
                landmarks: pred.landmarks,
                boundingBox: { start, end }
            };
        });

        const trackedFaces = this.faceTracker.update(faces);
        let newFaces = 0;

        trackedFaces.forEach(face => {
            if (face.isNew) {
                this.uniqueFaces.add(face.id);
                this.totalFacesCount++;
                newFaces++;
            }
        });

        return newFaces;
    }

    // Vẽ detection boxes và landmarks
    drawFaceDetections(predictions) {
        const trackedFaces = this.faceTracker.getCurrentFaces();
        
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
            if (isTracked) {
                this.ctx.strokeStyle = '#00ff00'; // Xanh lá - đang tracked
                this.ctx.fillStyle = '#00ff00';
                this.ctx.lineWidth = 3;
            } else if (faceId !== null) {
                this.ctx.strokeStyle = '#ffff00'; // Vàng - đã biết
                this.ctx.fillStyle = '#ffff00';
                this.ctx.lineWidth = 2;
            } else {
                this.ctx.strokeStyle = '#ff0000'; // Đỏ - mới
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

        // THÊM KIỂM TRA NULL CHO TẤT CẢ BUTTONS
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
}

// Class theo dõi khuôn mặt chuyên dụng
class FaceTracker {
    constructor() {
        this.faces = new Map();
        this.nextId = 1;
        this.maxFramesLost = 10; // Số frame mất tích tối đa trước khi xóa
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

        // Ghép nối faces hiện tại với faces đã biết
        for (const currentFace of currentFaces) {
            let bestMatch = null;
            let bestDistance = Infinity;

            for (const [id, knownFace] of this.faces.entries()) {
                if (knownFace.seen) continue; // Đã được ghép nối

                const distance = Math.sqrt(
                    Math.pow(currentFace.x - knownFace.x, 2) +
                    Math.pow(currentFace.y - knownFace.y, 2)
                );

                // Kiểm tra kích thước tương đồng
                const sizeDiff = Math.abs(currentFace.width - knownFace.width) +
                    Math.abs(currentFace.height - knownFace.height);

                if (distance < 80 && sizeDiff < 60 && distance < bestDistance) {
                    bestDistance = distance;
                    bestMatch = knownFace;
                }
            }

            if (bestMatch) {
                // Cập nhật face đã biết
                bestMatch.x = currentFace.x;
                bestMatch.y = currentFace.y;
                bestMatch.width = currentFace.width;
                bestMatch.height = currentFace.height;
                bestMatch.seen = true;
                bestMatch.framesLost = 0;
                bestMatch.isTracked = true;

                results.push({
                    id: bestMatch.id,
                    isNew: false,
                    ...currentFace
                });
            } else {
                // Face mới
                const newFace = {
                    id: this.nextId++,
                    x: currentFace.x,
                    y: currentFace.y,
                    width: currentFace.width,
                    height: currentFace.height,
                    seen: true,
                    framesLost: 0,
                    isTracked: true
                };

                this.faces.set(newFace.id, newFace);
                results.push({
                    id: newFace.id,
                    isNew: true,
                    ...currentFace
                });
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

    getCurrentFaces() {
        return Array.from(this.faces.values());
    }
}