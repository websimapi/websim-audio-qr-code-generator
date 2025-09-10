class AudioQRApp {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.startTime = 0;
        this.timerInterval = null;
        this.maxDuration = 2000; // 2 seconds in ms
        this.stream = null;
        this.scanInterval = null;
        
        this.initElements();
        this.initEventListeners();
        this.initCamera();
    }
    
    initElements() {
        // Tab elements
        this.tabBtns = document.querySelectorAll('.tab-btn');
        this.tabContents = document.querySelectorAll('.tab-content');
        
        // Record elements
        this.recordBtn = document.getElementById('recordBtn');
        this.recordIcon = document.getElementById('recordIcon');
        this.progress = document.getElementById('progress');
        this.timeDisplay = document.getElementById('timeDisplay');
        this.message = document.getElementById('message');
        this.qrSection = document.getElementById('qrSection');
        this.qrCanvas = document.getElementById('qrCanvas');
        this.downloadBtn = document.getElementById('downloadBtn');
        
        // Scan elements
        this.video = document.getElementById('video');
        this.scanCanvas = document.getElementById('scanCanvas');
        this.scanMessage = document.getElementById('scanMessage');
        this.audioSection = document.getElementById('audioSection');
        this.audioPlayer = document.getElementById('audioPlayer');
    }
    
    initEventListeners() {
        // Tab switching
        this.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });
        
        // Record button
        this.recordBtn.addEventListener('click', () => this.toggleRecording());
        
        // Download button
        this.downloadBtn.addEventListener('click', () => this.downloadQR());
    }
    
    switchTab(tabName) {
        // Update tab buttons
        this.tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        // Update tab content
        this.tabContents.forEach(content => {
            content.classList.toggle('active', content.id === tabName);
        });
        
        // Handle camera for scanning
        if (tabName === 'scan') {
            this.startScanning();
        } else {
            this.stopScanning();
        }
    }
    
    async toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }
    
    async startRecording() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Use compressed audio settings to reduce file size
            const options = {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 16000 // Low bitrate for compression
            };
            
            // Fallback if the preferred format isn't supported
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = 'audio/webm';
            }
            
            this.mediaRecorder = new MediaRecorder(this.stream, options);
            
            this.audioChunks = [];
            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };
            
            this.mediaRecorder.onstop = () => this.processAudio();
            
            this.mediaRecorder.start();
            this.isRecording = true;
            this.startTime = Date.now();
            
            // Update UI
            this.recordBtn.classList.add('recording');
            this.recordIcon.src = 'icon-stop.png';
            this.hideMessage();
            this.qrSection.classList.remove('show');
            
            // Start timer
            this.timerInterval = setInterval(() => this.updateTimer(), 100);
            
        } catch (error) {
            this.showMessage('Microphone access denied. Please allow access and try again.', 'error');
        }
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            // Stop all tracks
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }
            
            // Update UI
            this.recordBtn.classList.remove('recording');
            this.recordIcon.src = 'icon-record.png';
            clearInterval(this.timerInterval);
            this.progress.style.width = '0%';
            this.timeDisplay.textContent = '0.0s / 2.0s';
        }
    }
    
    updateTimer() {
        const elapsed = Date.now() - this.startTime;
        const seconds = elapsed / 1000;
        
        if (elapsed >= this.maxDuration) {
            this.stopRecording();
            return;
        }
        
        const progress = (elapsed / this.maxDuration) * 100;
        this.progress.style.width = `${progress}%`;
        this.timeDisplay.textContent = `${seconds.toFixed(1)}s / 2.0s`;
    }
    
    async processAudio() {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        // Increased size limit due to base64 encoding overhead
        if (audioBlob.size > 4000) {
            this.showMessage('Recording too long! Please try a shorter recording.', 'error');
            return;
        }
        
        this.showMessage('Generating QR code...', 'success');
        
        try {
            const base64 = await this.blobToBase64(audioBlob);
            const qrData = `https://websim.com/@api/qrtoaudio?data=${base64}`;
            
            // Generate QR code using qrcode library
            QRCode.toCanvas(this.qrCanvas, qrData, {
                width: 256,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            }, (error) => {
                if (error) {
                    this.showMessage('Failed to generate QR code', 'error');
                } else {
                    this.showMessage('QR code generated successfully!', 'success');
                    this.qrSection.classList.add('show');
                }
            });
            
        } catch (error) {
            this.showMessage('Failed to process audio', 'error');
        }
    }
    
    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    
    downloadQR() {
        const link = document.createElement('a');
        link.download = 'audio-qr-code.png';
        link.href = this.qrCanvas.toDataURL();
        link.click();
    }
    
    showMessage(text, type) {
        this.message.textContent = text;
        this.message.className = `message ${type}`;
    }
    
    hideMessage() {
        this.message.className = 'message';
    }
    
    async initCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' } 
            });
            this.video.srcObject = stream;
        } catch (error) {
            console.log('Camera not available for scanning');
        }
    }
    
    startScanning() {
        if (!this.scanInterval) {
            this.scanInterval = setInterval(() => this.scanForQR(), 300);
        }
    }
    
    stopScanning() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
    }
    
    scanForQR() {
        if (this.video.videoWidth === 0) return;
        
        const canvas = this.scanCanvas;
        const ctx = canvas.getContext('2d');
        
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;
        
        ctx.drawImage(this.video, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        
        if (code && code.data.includes('websim.com/@api/qrtoaudio?data=')) {
            this.stopScanning();
            this.playAudioFromQR(code.data);
        }
    }
    
    async playAudioFromQR(qrData) {
        try {
            const base64Data = qrData.split('data=')[1];
            const audioBlob = this.base64ToBlob(base64Data);
            const audioUrl = URL.createObjectURL(audioBlob);
            
            this.audioPlayer.src = audioUrl;
            this.audioSection.classList.add('show');
            this.scanMessage.textContent = 'Audio QR code detected! Playing audio...';
            this.scanMessage.className = 'message success';
            
            this.audioPlayer.play();
        } catch (error) {
            this.scanMessage.textContent = 'Failed to play audio from QR code';
            this.scanMessage.className = 'message error';
        }
    }
    
    base64ToBlob(base64) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: 'audio/webm' });
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AudioQRApp();
});