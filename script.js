const tabCreate = document.getElementById('tab-create');
const tabScan = document.getElementById('tab-scan');
const createView = document.getElementById('create-view');
const scanView = document.getElementById('scan-view');
const recordButton = document.getElementById('record-button');
const recordIcon = document.getElementById('record-icon');
const timerDisplay = document.getElementById('timer-display');
const timerProgress = document.getElementById('timer-progress');
const messageArea = document.getElementById('message-area');
const qrcodeContainer = document.getElementById('qrcode');
const downloadLink = document.getElementById('download-qr');

const scanResult = document.getElementById('scan-result');
const audioPlayer = document.getElementById('audio-player');
const audioPlayback = document.getElementById('audio-playback');

const MAX_DURATION_S = 2;
const MAX_BLOB_SIZE_BYTES = 2048; // A safe size for QR code capacity
const QR_URL_PREFIX = 'https://websim.com/@api/qrtoaudio?data=';

let mediaRecorder;
let audioChunks = [];
let timerInterval;
let recordingStartTime;
let qrcodeInstance;
let html5QrCode;

// --- Tab Navigation ---

function showView(viewToShow) {
    [createView, scanView].forEach(view => view.classList.remove('active'));
    viewToShow.classList.add('active');

    if (viewToShow === scanView) {
        startScanner();
    } else {
        stopScanner();
    }
}

tabCreate.addEventListener('click', () => {
    tabCreate.classList.add('active');
    tabScan.classList.remove('active');
    showView(createView);
});

tabScan.addEventListener('click', () => {
    tabScan.classList.add('active');
    tabCreate.classList.remove('active');
    showView(scanView);
});

// --- Audio Recording ---

recordButton.addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecording();
    } else {
        await startRecording();
    }
});

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
        
        audioChunks = [];
        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = processAudio;

        mediaRecorder.start();
        updateUIAfterRecordingStart();
    } catch (err) {
        showMessage('Microphone access was denied. Please allow access in your browser settings.', 'error');
        console.error('Error accessing microphone:', err);
    }
}

function stopRecording() {
    if (mediaRecorder) {
        mediaRecorder.stop();
        updateUIAfterRecordingStop();
    }
}

function updateUIAfterRecordingStart() {
    recordButton.classList.add('recording');
    recordIcon.src = 'icon-stop.png';
    messageArea.style.display = 'none';
    qrcodeContainer.innerHTML = '';
    downloadLink.classList.add('hidden');
    
    recordingStartTime = Date.now();
    timerInterval = setInterval(updateTimer, 100);
}

function updateUIAfterRecordingStop() {
    recordButton.classList.remove('recording');
    recordIcon.src = 'icon-record.png';
    clearInterval(timerInterval);
    timerProgress.style.width = '0%';
    timerDisplay.textContent = `0.0s / ${MAX_DURATION_S}.0s`;
}

function updateTimer() {
    const elapsedSeconds = (Date.now() - recordingStartTime) / 1000;
    if (elapsedSeconds >= MAX_DURATION_S) {
        stopRecording();
    } else {
        timerDisplay.textContent = `${elapsedSeconds.toFixed(1)}s / ${MAX_DURATION_S}.0s`;
        timerProgress.style.width = `${(elapsedSeconds / MAX_DURATION_S) * 100}%`;
    }
}

// --- Audio Processing and QR Generation ---

async function processAudio() {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

    if (audioBlob.size > MAX_BLOB_SIZE_BYTES) {
        const excessBytes = audioBlob.size - MAX_BLOB_SIZE_BYTES;
        showMessage(`Recording is too long! It's ${excessBytes} bytes over the limit. Please try a shorter recording.`, 'error');
        return;
    }

    showMessage('Audio recorded successfully! Generating QR Code...', 'success');
    const base64String = await blobToBase64(audioBlob);
    generateQRCode(base64String);
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function generateQRCode(data) {
    qrcodeContainer.innerHTML = '';
    const fullUrl = `${QR_URL_PREFIX}${data}`;

    // The library's `makeCode` method is used to update an existing QRCode instance
    // or to generate the first one. Let's ensure an instance exists first.
    if (!qrcodeInstance) {
        qrcodeInstance = new QRCode(qrcodeContainer, {
            text: fullUrl,
            width: 256,
            height: 256,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.L
        });
    } else {
        qrcodeInstance.makeCode(fullUrl);
    }

    setTimeout(() => {
        // The library generates an `img` tag inside the container.
        const img = qrcodeContainer.querySelector('img');
        if (img) {
            downloadLink.href = img.src;
            downloadLink.classList.remove('hidden');
        }
    }, 100); // Wait for QR code to render
}


// --- QR Code Scanning and Playback ---

function startScanner() {
    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("reader");
    }

    const qrCodeSuccessCallback = (decodedText, decodedResult) => {
        if (decodedText.startsWith(QR_URL_PREFIX)) {
            stopScanner();
            scanResult.textContent = 'Audio QR Code detected!';
            scanResult.className = 'message-area success';
            const base64Data = decodedText.substring(QR_URL_PREFIX.length);
            playAudioFromBase64(base64Data);
        } else {
            scanResult.textContent = 'This is not a valid Audio QR Code.';
            scanResult.className = 'message-area error';
        }
    };

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback)
        .catch(err => {
            console.error("Unable to start scanning.", err);
            scanResult.textContent = 'Could not start camera. Please grant permission.';
            scanResult.className = 'message-area error';
        });
}

function stopScanner() {
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(err => {
            console.error("Failed to stop scanning.", err);
        });
    }
}

function playAudioFromBase64(base64String) {
    try {
        const byteCharacters = atob(base64String);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {type: 'audio/webm'});
        
        const audioUrl = URL.createObjectURL(blob);
        audioPlayback.src = audioUrl;
        audioPlayer.classList.remove('hidden');
        audioPlayback.play();
    } catch (e) {
        console.error("Error decoding or playing audio:", e);
        scanResult.textContent = 'Could not play the audio from this QR code.';
        scanResult.className = 'message-area error';
        audioPlayer.classList.add('hidden');
    }
}

// --- Utility ---
function showMessage(msg, type = 'info') {
    messageArea.textContent = msg;
    messageArea.className = `message-area ${type}`;
}