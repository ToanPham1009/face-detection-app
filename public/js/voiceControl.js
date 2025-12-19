// voiceControl.js - Simple and reliable version
class VoiceControl {
    constructor() {
        console.log('🎤 Initializing Voice Control...');
        
        this.recognition = null;
        this.isListening = false;
        this.commands = new Map();
        this.initializeRecognition();
        this.setupCommands();
    }
    
    initializeRecognition() {
        // Check browser support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('Speech Recognition not supported');
            this.showFeedback('Trình duyệt không hỗ trợ nhận diện giọng nói');
            return;
        }
        
        try {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false; // No interim for faster response
            this.recognition.lang = 'vi-VN';
            this.recognition.maxAlternatives = 1;
            
            // Events
            this.recognition.onstart = () => {
                console.log('🎤 Listening...');
                this.isListening = true;
                this.updateUI();
                this.showFeedback('Đang nghe...');
            };
            
            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                console.log('🎯 Recognized:', transcript);
                this.processCommand(transcript);
            };
            
            this.recognition.onerror = (event) => {
                console.error('❌ Recognition error:', event.error);
                
                if (event.error === 'not-allowed') {
                    this.showFeedback('Vui lòng cho phép microphone');
                } else if (event.error === 'no-speech') {
                    console.log('No speech detected');
                }
                
                this.isListening = false;
                this.updateUI();
            };
            
            this.recognition.onend = () => {
                console.log('🔄 Recognition ended, restarting...');
                this.isListening = false;
                this.updateUI();
                
                // Auto restart
                if (this.shouldAutoRestart !== false) {
                    setTimeout(() => this.start(), 300);
                }
            };
            
            console.log('✅ Speech Recognition initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize recognition:', error);
            this.showFeedback('Không thể khởi tạo nhận diện giọng nói');
        }
    }
    
    setupCommands() {
        // Basic commands
        this.commands.set('bật camera', () => this.clickButton('startCamera'));
        this.commands.set('tắt camera', () => this.clickButton('stopCamera'));
        this.commands.set('bắt đầu theo dõi', () => this.clickButton('startTracking'));
        this.commands.set('dừng theo dõi', () => this.clickButton('stopTracking'));
        this.commands.set('chụp hình', () => this.clickButton('captureImage'));
        this.commands.set('xem lịch sử', () => this.switchTab('history'));
        this.commands.set('quay lại live', () => this.switchTab('live'));
        this.commands.set('debug', () => this.clickButton('debugButton'));
        this.commands.set('refresh', () => this.clickButton('refreshDisplay'));
        this.commands.set('trợ giúp', () => this.showHelp());
    }
    
    processCommand(transcript) {
        const normalized = transcript.toLowerCase().trim();
        console.log('🔍 Processing:', normalized);
        
        // Find matching command
        for (const [command, action] of this.commands) {
            if (normalized.includes(command)) {
                console.log(`✅ Matched: ${command}`);
                action();
                this.showFeedback(`Đã thực hiện: ${command}`);
                return;
            }
        }
        
        // Help command
        if (normalized.includes('trợ giúp') || normalized.includes('giúp')) {
            this.showHelp();
            return;
        }
        
        console.log('❌ No command matched');
        this.showFeedback('Không hiểu lệnh. Nói "trợ giúp" để xem danh sách lệnh');
    }
    
    clickButton(buttonId) {
        const button = document.getElementById(buttonId);
        if (button && !button.disabled) {
            button.click();
            console.log(`✅ Clicked: ${buttonId}`);
            
            // Visual feedback
            button.classList.add('voice-activated');
            setTimeout(() => button.classList.remove('voice-activated'), 500);
            
            return true;
        }
        console.warn(`⚠️ Button ${buttonId} not available`);
        return false;
    }
    
    switchTab(tabName) {
        if (window.faceDetectionApp && window.faceDetectionApp.switchTab) {
            window.faceDetectionApp.switchTab(tabName);
            return true;
        }
        return false;
    }
    
    start() {
        if (!this.recognition) {
            this.initializeRecognition();
            if (!this.recognition) return;
        }
        
        try {
            this.shouldAutoRestart = true;
            this.recognition.start();
        } catch (error) {
            console.error('❌ Start error:', error);
            this.showFeedback('Lỗi khi bắt đầu nhận diện');
        }
    }
    
    stop() {
        this.shouldAutoRestart = false;
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }
        this.isListening = false;
        this.updateUI();
        this.showFeedback('Đã dừng');
    }
    
    toggle() {
        if (this.isListening) {
            this.stop();
        } else {
            this.start();
        }
    }
    
    updateUI() {
        const statusElement = document.getElementById('voiceStatus');
        const toggleBtn = document.getElementById('toggleVoice');
        
        if (statusElement) {
            statusElement.textContent = this.isListening ? '🎤 Đang nghe...' : '🎤 Sẵn sàng';
            statusElement.className = this.isListening ? 'voice-status listening' : 'voice-status';
        }
        
        if (toggleBtn) {
            toggleBtn.innerHTML = this.isListening ? 
                '<span class="voice-icon">🛑</span> Dừng voice' : 
                '<span class="voice-icon">🎤</span> Bật voice';
            toggleBtn.className = this.isListening ? 'btn btn-danger' : 'btn btn-success';
        }
    }
    
    showFeedback(message) {
        console.log('💬', message);
        
        // Simple feedback in console for now
        const feedbackElement = document.getElementById('voiceTranscript');
        if (feedbackElement) {
            feedbackElement.textContent = message;
            feedbackElement.className = 'voice-transcript';
            
            setTimeout(() => {
                feedbackElement.textContent = 'Chờ lệnh...';
            }, 2000);
        }
    }
    
    showHelp() {
        const helpModal = document.createElement('div');
        helpModal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            z-index: 1000;
            max-width: 400px;
            width: 90%;
        `;
        
        helpModal.innerHTML = `
            <h3 style="margin-top: 0;">🎤 Lệnh điều khiển bằng giọng nói</h3>
            <ul style="text-align: left; padding-left: 20px;">
                <li><strong>"Bật camera"</strong> - Khởi động camera</li>
                <li><strong>"Tắt camera"</strong> - Dừng camera</li>
                <li><strong>"Bắt đầu theo dõi"</strong> - Bắt đầu tracking</li>
                <li><strong>"Dừng theo dõi"</strong> - Dừng tracking</li>
                <li><strong>"Chụp hình"</strong> - Chụp ảnh từ camera</li>
                <li><strong>"Xem lịch sử"</strong> - Xem video đã lưu</li>
                <li><strong>"Quay lại live"</strong> - Quay về tab live</li>
                <li><strong>"Debug"</strong> - Mở debug console</li>
                <li><strong>"Refresh"</strong> - Làm mới giao diện</li>
                <li><strong>"Trợ giúp"</strong> - Xem lại danh sách này</li>
            </ul>
            <button onclick="this.parentElement.remove()" 
                    style="margin-top: 15px; padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
                Đóng
            </button>
        `;
        
        document.body.appendChild(helpModal);
        
        // Close when clicking outside
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) {
                helpModal.remove();
            }
        });
    }
}

// Also create SimpleVoiceControl alias
window.SimpleVoiceControl = VoiceControl;