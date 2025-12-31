// Video recording and management với Cloudinary
class VideoManager {
    constructor() {
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.currentSessionId = null;
    }

    async startRecording(videoElement) {
        try {
            if (!videoElement || !videoElement.srcObject) {
                throw new Error('Video element or stream not available');
            }

            const stream = videoElement.srcObject;

            // Tạo MediaRecorder
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp9',
                videoBitsPerSecond: 2500000
            });

            this.recordedChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            // Bắt đầu recording
            this.mediaRecorder.start(1000);
            this.isRecording = true;

            console.log('🎥 Recording started');
            return true;

        } catch (error) {
            console.error('Error starting recording:', error);
            throw error;
        }
    }

    async saveRecordingToCloudinary() {
        if (this.recordedChunks.length === 0) {
            console.log('No recording data to save');
            return { filename: null, sessionId: this.currentSessionId };
        }

        try {
            const blob = new Blob(this.recordedChunks, { type: 'video/webm' });

            if (blob.size === 0) {
                console.log('Empty video blob, skipping upload');
                return { filename: null, sessionId: this.currentSessionId };
            }

            const formData = new FormData();
            formData.append('video', blob, `${this.currentSessionId}.webm`);
            formData.append('sessionId', this.currentSessionId);

            console.log('📤 Uploading video to server...');

            const response = await fetch('/api/videos/upload', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ Video uploaded to Cloudinary:', result);
                return {
                    filename: result.filename,
                    sessionId: this.currentSessionId,
                    public_id: result.public_id
                };
            } else {
                const error = await response.json();
                console.error('❌ Failed to upload video:', error);
                return { filename: null, sessionId: this.currentSessionId };
            }

        } catch (error) {
            console.error('❌ Error uploading video:', error);
            return { filename: null, sessionId: this.currentSessionId };
        }
    }

    // Trong videoManager.js
    async stopRecording() {
        try {
            if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
                console.log('⚠️ No active recording to stop');
                return null;
            }

            console.log('⏹️ Stopping video recording...');

            return new Promise((resolve) => {
                this.mediaRecorder.onstop = async () => {
                    try {
                        console.log('🎬 Recording stopped, creating blob...');
                        const videoBlob = new Blob(this.recordedChunks, { type: 'video/webm' });
                        this.recordedChunks = [];

                        console.log('📦 Video blob created, size:', videoBlob.size);

                        // QUAN TRỌNG: Lấy sessionId từ FaceDetectionApp
                        const sessionId = window.faceDetectionApp?.faceDetector?.sessionId;
                        console.log('🎯 Current sessionId for video upload:', sessionId);

                        // Upload video với sessionId
                        const uploadResult = await this.uploadToCloudinary(videoBlob, sessionId);

                        resolve({
                            filename: uploadResult.filename,
                            public_id: uploadResult.public_id,
                            sessionId: sessionId, // Đảm bảo trả về sessionId
                            duration: uploadResult.duration,
                            blob: videoBlob
                        });

                    } catch (error) {
                        console.error('❌ Error in recording stop process:', error);
                        resolve(null);
                    }
                };

                this.mediaRecorder.stop();
                console.log('✅ MediaRecorder stop() called');
            });

        } catch (error) {
            console.error('❌ Error stopping recording:', error);
            return null;
        }
    }

    // Trong videoManager.js
    async uploadToCloudinary(videoBlob, sessionId) {
        try {
            console.log('📤 Uploading video to Cloudinary with sessionId:', sessionId);

            const formData = new FormData();
            formData.append('video', videoBlob, `recording_${Date.now()}.webm`);

            // QUAN TRỌNG: Gửi sessionId lên server
            if (sessionId) {
                formData.append('sessionId', sessionId);
            }

            const response = await fetch('/api/videos/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Upload failed: ${errorText}`);
            }

            const result = await response.json();
            console.log('✅ Video uploaded to Cloudinary:', result);
            return result;

        } catch (error) {
            console.error('❌ Error uploading video:', error);
            throw error;
        }
    }

    getSupportedMimeType() {
        const types = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
            'video/mp4'
        ];

        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return null;
    }
}