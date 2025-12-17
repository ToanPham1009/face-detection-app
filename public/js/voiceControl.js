// public/js/voiceControl.js
class VoiceControl {
    constructor() {
        console.log('🎤 Khởi tạo Voice Control...');
        
        this.recognition = null;
        this.isListening = false;
        this.shouldAutoRestart = false;
        this.commands = new Map();
        this.synonyms = {};
        
        this.setupSynonyms();
        this.setupCommands();
        
        if (this.initialize()) {
            console.log('✅ Voice Control đã sẵn sàng');
        } else {
            console.warn('⚠️ Trình duyệt không hỗ trợ Speech Recognition');
        }
    }

    setupSynonyms() {
        this.synonyms = {
            'bật': ['mở', 'khởi động', 'start', 'kích hoạt'],
            'tắt': ['đóng', 'dừng', 'stop', 'ngừng'],
            'camera': ['webcam', 'máy ảnh', 'cam'],
            'theo dõi': ['tracking', 'đếm', 'nhận diện', 'phát hiện'],
            'chụp': ['chụp hình', 'chụp ảnh', 'capture', 'chụp lại'],
            'lịch sử': ['history', 'video cũ', 'danh sách'],
            'live': ['trực tiếp', 'thời gian thực', 'trực tuyến'],
            'debug': ['gỡ lỗi', 'kiểm tra', 'test'],
            'refresh': ['làm mới', 'tải lại', 'reload']
        };
    }

    setupCommands() {
        // Tạo các command cơ bản
        const baseCommands = {
            'bật camera': 'startCamera',
            'tắt camera': 'stopCamera',
            'bắt đầu theo dõi': 'startTracking',
            'dừng theo dõi': 'stopTracking',
            'chụp hình': 'captureImage',
            'xem lịch sử': 'showHistory',
            'quay lại live': 'showLive',
            'debug': 'debug',
            'refresh': 'refresh'
        };

        // Thêm base commands
        Object.entries(baseCommands).forEach(([command, actionName]) => {
            this.commands.set(command, () => this.executeAction(actionName));
        });

        // Tạo các biến thể từ synonyms
        this.generateCommandVariants();
    }

    generateCommandVariants() {
        const baseCommands = Array.from(this.commands.keys());
        
        baseCommands.forEach(baseCommand => {
            const action = this.commands.get(baseCommand);
            const variants = this.createVariants(baseCommand);
            
            variants.forEach(variant => {
                if (!this.commands.has(variant)) {
                    this.commands.set(variant, action);
                }
            });
        });
    }

    createVariants(text) {
        const variants = new Set();
        const words = text.split(' ');
        
        // Thêm các biến thể đơn giản
        variants.add(`xin ${text}`);
        variants.add(`hãy ${text}`);
        variants.add(`${text} đi`);
        variants.add(`${text} ngay`);
        variants.add(`${text} giúp tôi`);
        
        // Tạo biến thể từ synonyms
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            if (this.synonyms[word]) {
                this.synonyms[word].forEach(synonym => {
                    const newWords = [...words];
                    newWords[i] = synonym;
                    variants.add(newWords.join(' '));
                });
            }
        }
        
        // Thêm các cách nói thông dụng
        if (text.includes('bật camera')) {
            variants.add('bật cam');
            variants.add('mở camera');
            variants.add('khởi động webcam');
        }
        
        if (text.includes('tắt camera')) {
            variants.add('tắt cam');
            variants.add('đóng camera');
            variants.add('ngừng webcam');
        }
        
        if (text.includes('chụp hình')) {
            variants.add('chụp ảnh');
            variants.add('chụp lại');
            variants.add('capture');
        }
        
        return Array.from(variants);
    }

    executeAction(actionName) {
        console.log(`🎯 Thực hiện action: ${actionName}`);
        
        const actions = {
            'startCamera': () => this.clickButton('startCamera'),
            'stopCamera': () => this.clickButton('stopCamera'),
            'startTracking': () => this.clickButton('startTracking'),
            'stopTracking': () => this.clickButton('stopTracking'),
            'captureImage': () => this.clickButton('captureImage'),
            'showHistory': () => this.switchTab('history'),
            'showLive': () => this.switchTab('live'),
            'debug': () => this.clickButton('debugButton'),
            'refresh': () => this.clickButton('refreshDisplay')
        };
        
        if (actions[actionName]) {
            actions[actionName]();
            this.showFeedback(`Đã ${actionName.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
            return true;
        }
        
        return false;
    }

    clickButton(buttonId) {
        const button = document.getElementById(buttonId);
        if (button && !button.disabled) {
            button.click();
            console.log(`✅ Clicked: ${buttonId}`);
            return true;
        }
        console.warn(`⚠️ Button ${buttonId} not found or disabled`);
        return false;
    }

    switchTab(tabName) {
        if (window.faceDetectionApp && window.faceDetectionApp.switchTab) {
            window.faceDetectionApp.switchTab(tabName);
            console.log(`✅ Switched to tab: ${tabName}`);
            return true;
        }
        console.warn('⚠️ FaceDetectionApp not available');
        return false;
    }

    initialize() {
        // Kiểm tra trình duyệt hỗ trợ
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            return false;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        // Cấu hình
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'vi-VN'; // Tiếng Việt
        this.recognition.maxAlternatives = 1;

        // Sự kiện
        this.recognition.onstart = () => {
            console.log('🎤 Bắt đầu nghe giọng nói...');
            this.isListening = true;
            this.updateUI();
            this.showFeedback('Đang nghe...');
        };

        this.recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            // Hiển thị transcript tạm thời
            if (interimTranscript) {
                this.showTranscript(interimTranscript, false);
            }

            // Xử lý khi có kết quả cuối cùng
            if (finalTranscript) {
                console.log('📝 Nhận diện:', finalTranscript);
                this.showTranscript(finalTranscript, true);
                this.processCommand(finalTranscript);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('❌ Lỗi nhận diện:', event.error);
            
            if (event.error === 'not-allowed') {
                this.showFeedback('Vui lòng cho phép sử dụng microphone');
            } else if (event.error === 'no-speech') {
                this.showFeedback('Không phát hiện giọng nói');
            } else {
                this.showFeedback('Lỗi nhận diện giọng nói');
            }
            
            this.isListening = false;
            this.updateUI();
        };

        this.recognition.onend = () => {
            console.log('🛑 Kết thúc nhận diện');
            this.isListening = false;
            this.updateUI();
            
            // Tự động khởi động lại nếu cần
            if (this.shouldAutoRestart) {
                setTimeout(() => {
                    if (this.shouldAutoRestart) {
                        this.start();
                    }
                }, 100);
            }
        };

        return true;
    }

    processCommand(transcript) {
        const normalized = this.normalizeText(transcript);
        console.log('🔍 Xử lý command:', normalized);

        // Tìm command khớp nhất
        let bestMatch = null;
        let bestScore = 0;

        for (const [command] of this.commands) {
            const score = this.calculateMatchScore(normalized, command);
            if (score > bestScore && score >= 0.5) { // Ngưỡng 50%
                bestScore = score;
                bestMatch = command;
            }
        }

        if (bestMatch) {
            console.log(`✅ Khớp lệnh: "${bestMatch}" (độ chính xác: ${(bestScore * 100).toFixed(0)}%)`);
            const action = this.commands.get(bestMatch);
            action();
        } else {
            console.log('❌ Không tìm thấy lệnh phù hợp');
            this.showFeedback('Không hiểu lệnh. Nói "trợ giúp" để xem danh sách lệnh');
            
            // Kiểm tra nếu là lệnh trợ giúp
            if (normalized.includes('trợ giúp') || normalized.includes('giúp đỡ')) {
                this.showHelp();
            }
        }
    }

    normalizeText(text) {
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Xóa dấu
            .replace(/đ/g, 'd') // đ -> d
            .replace(/[^\w\s]/g, '') // Xóa ký tự đặc biệt
            .replace(/\s+/g, ' ') // Xóa khoảng trắng thừa
            .trim();
    }

    calculateMatchScore(text, command) {
        const textWords = this.normalizeText(text).split(' ');
        const commandWords = this.normalizeText(command).split(' ');
        
        let matches = 0;
        
        // Đếm số từ khớp
        for (const cmdWord of commandWords) {
            if (textWords.some(textWord => 
                textWord.includes(cmdWord) || cmdWord.includes(textWord)
            )) {
                matches++;
            }
        }
        
        return matches / commandWords.length;
    }

    start() {
        if (!this.recognition) {
            if (!this.initialize()) {
                this.showFeedback('Trình duyệt không hỗ trợ!');
                return;
            }
        }

        try {
            this.shouldAutoRestart = true;
            this.recognition.start();
            console.log('▶️ Bắt đầu nhận diện giọng nói');
        } catch (error) {
            console.error('❌ Lỗi khi bắt đầu:', error);
            this.showFeedback('Không thể bắt đầu nhận diện');
            
            // Thử lại sau 1 giây
            setTimeout(() => this.start(), 1000);
        }
    }

    stop() {
        this.shouldAutoRestart = false;
        if (this.recognition && this.isListening) {
            this.recognition.stop();
            console.log('⏹️ Dừng nhận diện giọng nói');
        }
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
        // Tạo hoặc cập nhật feedback element
        let feedback = document.getElementById('voiceFeedback');
        
        if (!feedback) {
            feedback = document.createElement('div');
            feedback.id = 'voiceFeedback';
            feedback.className = 'voice-feedback';
            document.body.appendChild(feedback);
        }
        
        feedback.innerHTML = `
            <div class="voice-feedback-content">
                <span class="voice-icon">🎤</span>
                <span class="voice-message">${message}</span>
            </div>
        `;
        
        // Hiển thị
        feedback.classList.add('show');
        
        // Tự động ẩn sau 3 giây
        clearTimeout(this.feedbackTimeout);
        this.feedbackTimeout = setTimeout(() => {
            feedback.classList.remove('show');
        }, 3000);
    }

    showTranscript(text, isFinal = false) {
        const transcriptElement = document.getElementById('voiceTranscript');
        if (!transcriptElement) return;
        
        transcriptElement.textContent = text;
        transcriptElement.className = isFinal ? 'voice-transcript final' : 'voice-transcript';
    }

    showHelp() {
        const helpModal = document.createElement('div');
        helpModal.className = 'voice-help-modal';
        
        const commandsList = Array.from(this.commands.keys())
            .filter(cmd => !cmd.includes('xin ') && !cmd.includes('hãy ') && !cmd.endsWith(' đi'))
            .slice(0, 9); // Lấy 9 command chính
        
        helpModal.innerHTML = `
            <div class="voice-help-content">
                <div class="voice-help-header">
                    <h3><span class="voice-icon">🎤</span> Lệnh điều khiển bằng giọng nói</h3>
                    <button class="close-help">&times;</button>
                </div>
                <div class="voice-help-body">
                    <p class="help-intro">Hãy nói các lệnh sau bằng tiếng Việt:</p>
                    <div class="commands-grid">
                        ${commandsList.map(cmd => `
                            <div class="command-card">
                                <div class="command-text">"${cmd}"</div>
                                <div class="command-desc">${this.getCommandDescription(cmd)}</div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="help-tips">
                        <h4>📝 Mẹo sử dụng:</h4>
                        <ul>
                            <li>Nói rõ ràng, tự nhiên</li>
                            <li>Có thể thêm "xin", "hãy", "...đi"</li>
                            <li>Ví dụ: "Xin bật camera", "Chụp hình đi"</li>
                            <li>Nói "trợ giúp" để xem lại danh sách</li>
                        </ul>
                    </div>
                </div>
                <div class="voice-help-footer">
                    <button id="closeHelpBtn" class="btn btn-primary">Đóng</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(helpModal);
        
        // Close events
        const closeHelp = () => document.body.removeChild(helpModal);
        
        helpModal.querySelector('.close-help').addEventListener('click', closeHelp);
        helpModal.querySelector('#closeHelpBtn').addEventListener('click', closeHelp);
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) closeHelp();
        });
    }

    getCommandDescription(command) {
        const descriptions = {
            'bật camera': 'Khởi động camera',
            'tắt camera': 'Tắt camera',
            'bắt đầu theo dõi': 'Bắt đầu đếm khuôn mặt',
            'dừng theo dõi': 'Dừng đếm khuôn mặt',
            'chụp hình': 'Chụp ảnh từ camera',
            'xem lịch sử': 'Xem video đã lưu',
            'quay lại live': 'Quay về tab live',
            'debug': 'Mở cửa sổ debug',
            'refresh': 'Làm mới giao diện'
        };
        
        return descriptions[command] || 'Thực hiện lệnh';
    }
}