// public/js/voiceControl.js
class VoiceControl {
    constructor() {
        console.log('🎤 Khởi tạo Voice Control (Continuous Mode)...');

        this.recognition = null;
        this.isListening = false;
        this.shouldAutoRestart = true; // Luôn tự động restart
        this.commands = new Map();
        this.synonyms = {};
        this.lastCommandTime = 0;
        this.commandCooldown = 1000; // Chờ 1 giây trước khi nhận lệnh mới
        this.isProcessing = false;

        this.setupSynonyms();
        this.setupCommands();

        if (this.initialize()) {
            console.log('✅ Voice Control đã sẵn sàng (Continuous Mode)');
            this.showFeedback('Voice Control sẵn sàng. Nói lệnh bất kỳ lúc nào.');
        } else {
            console.warn('⚠️ Trình duyệt không hỗ trợ Speech Recognition');
        }
    }

    setupSynonyms() {
        this.synonyms = {
            'bật': ['mở', 'khởi động', 'start', 'kích hoạt', 'cho phép'],
            'tắt': ['đóng', 'dừng', 'stop', 'ngừng', 'kết thúc'],
            'camera': ['webcam', 'máy ảnh', 'cam', 'camera'],
            'theo dõi': ['tracking', 'đếm', 'nhận diện', 'phát hiện', 'theo dấu'],
            'chụp': ['chụp hình', 'chụp ảnh', 'capture', 'chụp lại', 'chụp nhanh'],
            'lịch sử': ['history', 'video cũ', 'danh sách', 'quá khứ'],
            'live': ['trực tiếp', 'thời gian thực', 'trực tuyến', 'hiện tại'],
            'debug': ['gỡ lỗi', 'kiểm tra', 'test', 'debug'],
            'refresh': ['làm mới', 'tải lại', 'reload', 'refresh'],
            'giúp': ['trợ giúp', 'hỗ trợ', 'hướng dẫn', 'giúp đỡ']
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
            'refresh': 'refresh',
            'trợ giúp': 'showHelp'
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
            'startCamera': () => this.simulateClick('startCamera'),
            'stopCamera': () => this.simulateClick('stopCamera'),
            'startTracking': () => this.simulateClick('startTracking'),
            'stopTracking': () => this.simulateClick('stopTracking'),
            'captureImage': () => this.simulateClick('captureImage'),
            'showHistory': () => this.switchTab('history'),
            'showLive': () => this.switchTab('live'),
            'debug': () => this.simulateClick('debugButton'),
            'refresh': () => this.simulateClick('refreshDisplay'),
            'showHelp': () => this.showHelp()
        };

        if (actions[actionName]) {
            return actions[actionName]();
        }

        return false;
    }

    simulateClick(buttonId) {
        const button = document.getElementById(buttonId);
        if (button && !button.disabled) {
            console.log(`🖱️ Simulating click: ${buttonId}`);

            // Kích hoạt sự kiện click
            button.click();

            // Thêm hiệu ứng visual
            button.classList.add('voice-activated');
            setTimeout(() => {
                button.classList.remove('voice-activated');
            }, 500);

            return true;
        }

        console.warn(`⚠️ Button ${buttonId} not found or disabled`);
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
            console.log(`📱 Switching to tab: ${tabName}`);
            window.faceDetectionApp.switchTab(tabName);

            // Cập nhật UI
            const tabButtons = document.querySelectorAll('.tab-button');
            tabButtons.forEach(btn => {
                if (btn.dataset.tab === tabName) {
                    btn.classList.add('voice-activated');
                    setTimeout(() => btn.classList.remove('voice-activated'), 500);
                }
            });

            return true;
        }

        console.warn('⚠️ FaceDetectionApp not available');
        return false;
    }

    initialize() {
        // Kiểm tra trình duyệt hỗ trợ
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            this.showFeedback('Trình duyệt không hỗ trợ nhận diện giọng nói');
            return false;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();

        // CẤU HÌNH QUAN TRỌNG: ĐỂ NHẬN LỆNH LIÊN TỤC
        this.recognition.continuous = true; // Nghe liên tục
        this.recognition.interimResults = true; // Hiển thị kết quả tạm thời
        this.recognition.lang = 'vi-VN'; // Tiếng Việt
        this.recognition.maxAlternatives = 3; // Tăng alternatives để chính xác hơn

        // KHÔNG tự động stop khi có kết quả
        this.recognition.stopOnResult = false;

        // Sự kiện
        this.recognition.onstart = () => {
            console.log('🎤 Bắt đầu nghe giọng nói liên tục...');
            this.isListening = true;
            this.updateUI();
            this.showFeedback('Đang nghe... Nói lệnh bất kỳ lúc nào');
        };

        this.recognition.onresult = (event) => {
            if (this.isProcessing) return; // Tránh xử lý chồng chéo

            let finalTranscript = '';

            // Chỉ xử lý kết quả FINAL
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }

            // Nếu có kết quả cuối cùng
            if (finalTranscript) {
                console.log('📝 Nhận diện FINAL:', finalTranscript);
                this.showTranscript(finalTranscript, true);

                // Xử lý command NGAY LẬP TỨC
                this.processCommand(finalTranscript);

                // Xóa transcript sau 2 giây
                setTimeout(() => {
                    this.showTranscript('', false);
                }, 2000);
            } else {
                // Hiển thị interim transcript
                let interimTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (!event.results[i].isFinal) {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                if (interimTranscript) {
                    this.showTranscript(interimTranscript, false);
                }
            }
        };

        this.recognition.onerror = (event) => {
            console.error('❌ Lỗi nhận diện:', event.error);

            if (event.error === 'not-allowed') {
                this.showFeedback('Vui lòng cho phép sử dụng microphone', 'error');
                this.stop();
            } else if (event.error === 'no-speech') {
                // Không nói gì - tiếp tục nghe
                console.log('🔇 Không phát hiện giọng nói, tiếp tục nghe...');
            } else if (event.error === 'network') {
                this.showFeedback('Lỗi mạng, thử lại...', 'warning');
                setTimeout(() => this.restart(), 1000);
            } else {
                console.log('⚠️ Lỗi nhỏ, tiếp tục nghe...');
                this.restart();
            }
        };

        this.recognition.onend = () => {
            console.log('🔄 Kết thúc nhận diện, tự động khởi động lại...');
            this.isListening = false;
            this.updateUI();

            // TỰ ĐỘNG KHỞI ĐỘNG LẠI (continuous mode)
            if (this.shouldAutoRestart) {
                setTimeout(() => {
                    if (this.shouldAutoRestart && !this.isListening) {
                        this.start();
                    }
                }, 100);
            }
        };

        return true;
    }

    processCommand(transcript) {
        // Kiểm tra cooldown
        const now = Date.now();
        if (now - this.lastCommandTime < this.commandCooldown) {
            console.log('⏳ Đang trong cooldown, bỏ qua command');
            return;
        }

        this.lastCommandTime = now;
        this.isProcessing = true;

        const normalized = this.normalizeText(transcript);
        console.log('🔍 Xử lý command:', normalized);

        // Kiểm tra lệnh trợ giúp trước
        if (normalized.includes('trợ giúp') || normalized.includes('giúp')) {
            console.log('✅ Phát hiện lệnh trợ giúp');
            this.showHelp();
            this.isProcessing = false;
            return;
        }

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

        if (bestMatch && bestMatch !== 'trợ giúp') {
            console.log(`✅ Khớp lệnh: "${bestMatch}" (${(bestScore * 100).toFixed(0)}%)`);

            // Thực hiện action NGAY
            try {
                const action = this.commands.get(bestMatch);
                action();
                this.showFeedback(`Đã thực hiện: ${bestMatch}`, 'success');
            } catch (error) {
                console.error('❌ Lỗi thực hiện command:', error);
                this.showFeedback(`Lỗi: ${error.message}`, 'error');
            }
        } else {
            console.log('❌ Không tìm thấy lệnh phù hợp');

            // Hiển thị gợi ý
            if (!normalized.includes('trợ giúp')) {
                this.showFeedback('Không hiểu lệnh. Nói "trợ giúp" để xem danh sách lệnh', 'warning');
            }
        }

        this.isProcessing = false;
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
                this.showFeedback('Không thể khởi tạo voice control', 'error');
                return;
            }
        }

        try {
            this.shouldAutoRestart = true;
            this.recognition.start();
            console.log('▶️ Bắt đầu nhận diện giọng nói (Continuous Mode)');
        } catch (error) {
            console.error('❌ Lỗi khi bắt đầu:', error);

            // Thử lại sau 1 giây
            setTimeout(() => this.start(), 1000);
        }
    }

    stop() {
        console.log('⏹️ Dừng voice control');
        this.shouldAutoRestart = false;
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }
        this.isListening = false;
        this.updateUI();
        this.showFeedback('Đã dừng voice control', 'info');
    }

    toggle() {
        if (this.isListening) {
            this.stop();
        } else {
            this.start();
        }
    }

    restart() {
        if (this.isListening) {
            this.recognition.stop();
        }
        setTimeout(() => this.start(), 100);
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

    showFeedback(message, type = 'info') {
        let feedback = document.getElementById('voiceFeedback');

        if (!feedback) {
            feedback = document.createElement('div');
            feedback.id = 'voiceFeedback';
            feedback.className = 'voice-feedback';
            document.body.appendChild(feedback);
        }

        const icons = {
            'success': '✅',
            'error': '❌',
            'warning': '⚠️',
            'info': '🎤'
        };

        feedback.className = `voice-feedback ${type}`;
        feedback.innerHTML = `
        <div class="voice-feedback-content">
            <span class="voice-icon">${icons[type] || '🎤'}</span>
            <span class="voice-message">${message}</span>
        </div>
    `;

        feedback.classList.add('show');

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