// static/script.js

// --- 1. DOM Elements & State Variables ---
const startBtn = document.getElementById('start-btn');
const statusText = document.getElementById('status-text');
const aiMessageText = document.getElementById('ai-message');
const userTranscriptionText = document.getElementById('user-transcription');
const servicesContainer = document.getElementById('services-container');
const instructionDisplayContainer = document.getElementById('instruction-display');
const instructionText = document.getElementById('instruction-text');

let serviceChecks; // Will be populated after fetching instructions
let instructionsList = [];
let servicesStatus = [];
let currentServiceIndex = 0;
let isListening = false;

// --- 2. Web Speech API Setup ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
if (!SpeechRecognition) {
    alert("Sorry, your browser doesn't support automatic voice detection. Try Chrome or Edge.");
} else {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
}

// --- 3. App Initialization ---
async function initializeApp() {
    if (!recognition) {
        statusText.textContent = 'Error: Voice Recognition not supported.';
        return;
    }
    try {
        const response = await fetch('/get-instructions');
        if (!response.ok) throw new Error('Could not fetch instructions');
        const data = await response.json();
        instructionsList = data.instructions;
        
        // Dynamically create service check UI
        servicesContainer.innerHTML = ''; // Clear any existing
        instructionsList.forEach((_, index) => {
            const serviceNum = index + 1;
            const serviceItem = document.createElement('div');
            serviceItem.className = 'service-item';
            serviceItem.innerHTML = `
                <div class="service-check" id="service-check-${index}"></div>
                <span>Service ${serviceNum}</span>
            `;
            servicesContainer.appendChild(serviceItem);
        });
        serviceChecks = document.querySelectorAll('.service-check');

        // App is ready
        statusText.textContent = 'Ready to Start';
        aiMessageText.textContent = 'Click "Start Game" to begin.';
        startBtn.disabled = false;
        startBtn.textContent = 'Start Game';

    } catch (error) {
        console.error('Initialization failed:', error);
        statusText.textContent = 'Error: Could not load game data.';
        aiMessageText.textContent = 'Failed to connect to the server. Please refresh the page.';
        startBtn.disabled = true;
    }
}


// --- 4. Game Logic ---
function startGame() {
    startBtn.disabled = true;
    startBtn.textContent = 'Game in Progress...';
    servicesStatus = Array(instructionsList.length).fill('pending');
    currentServiceIndex = 0;
    updateCheckboxesUI();
    promptForInstruction(currentServiceIndex);
}

function promptForInstruction(index) {
    if (index >= instructionsList.length) {
        endGame();
        return;
    }
    const serviceNum = index + 1;
    aiMessageText.textContent = `Please state the instruction for Service ${serviceNum}.`;
    userTranscriptionText.textContent = '...';

    // Display the target instruction phrase
    instructionText.textContent = `"${instructionsList[index]}"`;
    instructionDisplayContainer.style.display = 'block';
    
    listenForResponse();
}

function listenForResponse() {
    if (isListening || !recognition) return;
    isListening = true;
    statusText.textContent = 'Listening...';
    statusText.classList.add('listening');
    try {
        recognition.start();
    } catch (e) {
        console.error("Error starting recognition (might already be active):", e);
    }
}

function stopListening() {
    if (!recognition) return;
    isListening = false;
    recognition.stop();
}

// --- 5. Speech Recognition Event Handlers ---
recognition.onresult = (event) => {
    isListening = false; 
    const transcript = event.results[0][0].transcript;
    userTranscriptionText.textContent = transcript;
    recognition.stop(); 
    checkGuessWithAI(transcript, currentServiceIndex);
};

recognition.onerror = (event) => {
    if (event.error !== 'no-speech') {
        console.error('Speech recognition error:', event.error);
        statusText.textContent = `Error: ${event.error}.`;
    }
};

recognition.onend = () => {
    statusText.classList.remove('listening');
    if (isListening) {
        console.log("Recognition service ended, restarting for next attempt...");
        try {
            recognition.start();
        } catch(e) {
            console.error("Error restarting recognition:", e);
        }
    }
};

// --- 6. Backend Communication and Game State ---
async function checkGuessWithAI(transcript, index) {
    statusText.textContent = 'AI is checking...';
    const serviceNum = index + 1;
    
    try {
        const response = await fetch('/check-text-guess', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userGuess: transcript,
                currentIndex: index
            })
        });

        if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
        const result = await response.json();
        
        if (result.is_match) {
            servicesStatus[index] = 'passed';
            aiMessageText.textContent = `✅ Service ${serviceNum} passed! Well done.`;
            currentServiceIndex++;
        } else {
            servicesStatus[index] = 'failed';
            aiMessageText.textContent = `❌ Incorrect for Service ${serviceNum}. Please try again.`;
        }
        
        updateCheckboxesUI();
        
        if (currentServiceIndex >= instructionsList.length) {
            endGame();
        } else {
            setTimeout(() => promptForInstruction(currentServiceIndex), 2000);
        }
    } catch (error) {
        console.error('Failed to check guess:', error);
        statusText.textContent = 'Error contacting AI. Retrying...';
        setTimeout(() => promptForInstruction(index), 2000);
    }
}

function updateCheckboxesUI() {
    servicesStatus.forEach((status, index) => {
        const checkElement = serviceChecks[index];
        checkElement.classList.remove('passed', 'failed');
        if (status === 'passed') checkElement.classList.add('passed');
        else if (status === 'failed') checkElement.classList.add('failed');
    });
}

function endGame() {
    stopListening();
    instructionDisplayContainer.style.display = 'none';

    const allPassed = servicesStatus.every(s => s === 'passed');
    if (allPassed) {
        aiMessageText.textContent = '🎉 Congratulations! All services passed.';
    } else {
        aiMessageText.textContent = 'Game Over! You can start a new game.';
    }
    
    statusText.textContent = 'Game Ended.';
    startBtn.disabled = false;
    startBtn.textContent = 'Start New Game';
}

// --- 7. Event Listeners ---
document.addEventListener('DOMContentLoaded', initializeApp);
startBtn.addEventListener('click', startGame);