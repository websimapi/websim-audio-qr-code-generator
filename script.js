import QRCode from 'qrcode';
import jsQR from 'jsqr';

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
        this.videoStream = null;
        
        this.initElements();
        this.initEventListeners();
        this.log('App initialized.');
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
        this.logOutput = document.getElementById('logOutput');
        
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
    
    log(message) {
        console.log(message);
        const time = new Date().toLocaleTimeString();
        if (this.logOutput) {
            const currentLogs = this.logOutput.textContent;
            const newLog = `[${time}] ${message}\n`;
            this.logOutput.textContent = newLog + currentLogs;

            const lines = this.logOutput.textContent.split('\n');
            if (lines.length > 50) {
                this.logOutput.textContent = lines.slice(0, 50).join('\n');
            }
        }
    }
    
    switchTab(tabName) {
        this.log(`Switching to tab: ${tabName}`);
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
            this.startCamera();
        } else {
            this.stopCamera();
        }
    }
    
    async toggleRecording() {
        if (this.isRecording) {
            this.log('Stop recording button clicked.');
            this.stopRecording();
        } else {
            this.log('Start recording button clicked.');
            await this.startRecording();
        }
    }
    
    async startRecording() {
        this.log('Attempting to start recording...');
        try {
            this.log('Requesting microphone access.');
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                audio: true 
            });
            this.log('Microphone access granted.');
            
            // Use more aggressive compression settings
            const options = {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 6000 // Lower bitrate for smaller files
            };
            
            // Fallback if the preferred format isn't supported
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                this.log(`MimeType ${options.mimeType} not supported. Falling back to default.`);
                options.mimeType = 'audio/webm';
            }
            this.log(`Using MimeType: ${options.mimeType}`);
            
            this.mediaRecorder = new MediaRecorder(this.stream, options);
            
            this.audioChunks = [];
            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
                this.log(`Audio data chunk received. Size: ${event.data.size}`);
            };
            
            this.mediaRecorder.onstop = () => this.processAudio();
            
            this.mediaRecorder.start();
            this.isRecording = true;
            this.startTime = Date.now();
            this.log('Recording started.');
            
            // Update UI
            this.recordBtn.classList.add('recording');
            this.recordIcon.src = 'icon-stop.png';
            this.hideMessage();
            this.qrSection.classList.remove('show');
            
            // Start timer
            this.timerInterval = setInterval(() => this.updateTimer(), 100);
            
        } catch (error) {
            console.error('Recording error:', error);
            this.log(`ERROR: Could not start recording. ${error.message}`);
            this.showMessage('Microphone access denied. Please allow access and try again.', 'error');
        }
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.log('Recording stopped.');
            
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
        this.log('Processing recorded audio...');
        if (this.audioChunks.length === 0) {
            this.log('ERROR: No audio chunks were recorded.');
            this.showMessage('No audio was recorded. Please check microphone permissions and try again.', 'error');
            return;
        }

        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        this.log(`Audio blob size: ${audioBlob.size} bytes`);
        
        // Increased size limit due to base64 encoding overhead
        if (audioBlob.size > 2200) { 
            this.log(`ERROR: Audio blob size (${audioBlob.size} bytes) is too large. Limit is 2200 bytes.`);
            this.showMessage('Recording too long! Please try a shorter recording.', 'error');
            return;
        }
        
        this.showMessage('Generating QR code...', 'success');
        this.log('Converting audio blob to Base64...');
        
        try {
            const base64 = await this.blobToBase64(audioBlob);
            this.log(`Base64 conversion successful. Length: ${base64.length}`);
            
            // Check if base64 data is too long for QR code
            if (base64.length > 2953) { // Absolute max for QR code with low error correction
                this.log(`ERROR: Base64 data length (${base64.length}) is too large for a QR code.`);
                this.showMessage('Audio data too large for QR code. Try a shorter recording.', 'error');
                return;
            }
            
            const qrData = `https://websim.com/@api/qrtoaudio?data=${base64}`;
            this.log(`Total QR data length: ${qrData.length}`);
            this.log('Generating QR code...');
            
            // Generate QR code using the imported QRCode module
            if (typeof QRCode.toCanvas !== 'function') {
                throw new Error('QRCode.toCanvas function not found. Library might be loaded incorrectly.');
            }

            await QRCode.toCanvas(this.qrCanvas, qrData, {
                width: 256,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                },
                errorCorrectionLevel: 'L' // Low error correction for more data capacity
            });
            
            this.log('QR code generated successfully.');
            this.showMessage('QR code generated successfully!', 'success');
            this.qrSection.classList.add('show');
            
        } catch (error) {
            console.error('Audio processing error:', error);
            this.log(`ERROR: Failed to process audio or generate QR code. ${error.message || 'Unknown error'}`);
            this.showMessage(`Failed to process audio: ${error.message || 'Unknown error'}`, 'error');
        }
    }
    
    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                try {
                    const result = reader.result.split(',')[1];
                    resolve(result);
                } catch (error) {
                    reject(new Error('Failed to convert audio to base64'));
                }
            };
            reader.onerror = (error) => reject(new Error('FileReader error: ' + error.message));
            reader.readAsDataURL(blob);
        });
    }
    
    downloadQR() {
        this.log('Download QR button clicked.');
        const link = document.createElement('a');
        link.download = 'audio-qr-code.png';
        link.href = this.qrCanvas.toDataURL('image/png');
        link.click();
    }
    
    showMessage(text, type) {
        this.message.textContent = text;
        this.message.className = `message ${type}`;
    }
    
    hideMessage() {
        this.message.className = 'message';
    }

    // --- Scanning Logic ---

    async startCamera() {
        this.log('Attempting to start camera for scanning.');
        try {
            if (!this.videoStream) {
                this.videoStream = await navigator.mediaDevices.getUserMedia({ 
                    video: { facingMode: 'environment' } 
                });
                this.video.srcObject = this.videoStream;
                this.video.onloadedmetadata = () => {
                    this.log('Camera started, beginning scan.');
                    this.startScanning();
                };
            }
        } catch (error) {
            console.error('Camera error:', error);
            this.log(`ERROR: Could not access camera. ${error.message}`);
            this.scanMessage.textContent = 'Could not access camera. Please grant permission.';
            this.scanMessage.className = 'message error';
        }
    }
    
    stopCamera() {
        this.log('Stopping camera.');
        this.stopScanning();
        if (this.videoStream) {
            this.videoStream.getTracks().forEach(track => track.stop());
            this.videoStream = null;
            this.video.srcObject = null;
        }
    }
    
    startScanning() {
        if (!this.scanInterval) {
            this.scanInterval = setInterval(() => this.scanForQR(), 200);
        }
    }
    
    stopScanning() {
        if (this.scanInterval) {
            this.log('Stopping QR code scan loop.');
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
    }
    
    scanForQR() {
        if (this.video.readyState !== this.video.HAVE_ENOUGH_DATA) return;
        
        const canvas = this.scanCanvas;
        const ctx = canvas.getContext('2d');
        
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;
        ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
        
        try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
        
            if (code && code.data.includes('websim.com/@api/qrtoaudio?data=')) {
                this.log(`QR code detected with valid URL. Data length: ${code.data.length}`);
                this.stopCamera();
                this.playAudioFromQR(code.data);
            }
        } catch (e) {
            // This can happen if the canvas is tainted, though unlikely here.
            console.error("Error scanning QR code:", e);
            this.log(`ERROR scanning QR code: ${e.message}`);
        }
    }
    
    async playAudioFromQR(qrData) {
        this.log('Processing audio from scanned QR code.');
        try {
            const base64Data = qrData.split('data=')[1];
            const audioBlob = this.base64ToBlob(base64Data);
            const audioUrl = URL.createObjectURL(audioBlob);
            
            this.audioPlayer.src = audioUrl;
            this.audioSection.classList.add('show');
            this.scanMessage.textContent = 'Audio QR code detected! Playing audio...';
            this.scanMessage.className = 'message success';
            
            this.audioPlayer.play();
            this.log('Playing audio from QR code.');
        } catch (error) {
            this.log(`ERROR playing audio from QR code: ${error.message}`);
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