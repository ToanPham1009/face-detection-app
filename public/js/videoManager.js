// Video recording and management với Cloudinary
class VideoManager {
    constructor() {
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.currentSessionId = null;
    }
    
    async startRecording() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error('MediaDevices API not supported');
            return;
        }
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 640 }, 
                    height: { ideal: 480 } 
                },
                audio: false
            });
            
            const mimeType = this.getSupportedMimeType();
            if (!mimeType) {
                console.warn('No supported MIME type found for recording');
                return;
            }
            
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: mimeType
            });
            
            this.recordedChunks = [];
            this.currentSessionId = Date.now().toString();
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                this.saveRecordingToCloudinary();
            };
            
            this.mediaRecorder.start(1000);
            this.isRecording = true;
            
            console.log('🎥 Recording started');
            
        } catch (error) {
            console.error('Error starting recording:', error);
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
    
    async stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            // Stop all tracks
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            
            console.log('⏹️ Recording stopped');
            
            // Wait for upload to complete
            return await this.saveRecordingToCloudinary();
        }
        return { filename: null, sessionId: this.currentSessionId };
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