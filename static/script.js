// static/script.js

// --- 1. DOM Elements & State Variables ---
const startBtn = document.getElementById('start-btn');
const statusText = document.getElementById('status-text');
const aiMessageText = document.getElementById('ai-message');
const userTranscriptionText = document.getElementById('user-transcription');
const serviceChecks = document.querySelectorAll('.service-check');

const TOTAL_INSTRUCTIONS = 10;
let servicesStatus = [];
let currentServiceIndex = 0;
// isListening is our "master switch". It means "should the app be trying to listen right now?"
let isListening = false; 

// --- 2. Web Speech API Setup ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
    alert("Sorry, your browser doesn't support automatic voice detection. Try Chrome or Edge.");
}
const recognition = new SpeechRecognition();
recognition.continuous = false;
recognition.lang = 'en-US';
recognition.interimResults = false;

// --- 3. Game Logic ---
function startGame() {
    startBtn.disabled = true;
    startBtn.textContent = 'Game in Progress...';
    servicesStatus = Array(TOTAL_INSTRUCTIONS).fill('pending');
    currentServiceIndex = 0;
    updateCheckboxesUI();
    promptForInstruction(currentServiceIndex);
}

function promptForInstruction(index) {
    if (index >= TOTAL_INSTRUCTIONS) {
        endGame();
        return;
    }
    const serviceNum = index + 1;
    aiMessageText.textContent = `Please state the instruction for Service ${serviceNum}.`;
    userTranscriptionText.textContent = '...';
    // Start the listening process
    listenForResponse();
}

function listenForResponse() {
    if (isListening) return; // Don't start if already in a listening state
    isListening = true;
    statusText.textContent = 'Listening...';
    statusText.classList.add('listening');
    try {
        recognition.start();
    } catch (e) {
        console.error("Error starting recognition (might already be active):", e);
    }
}

// Gracefully stop the listening loop
function stopListening() {
    isListening = false;
    recognition.stop();
}

// --- 4. Speech Recognition Event Handlers ---

recognition.onresult = (event) => {
    // A valid result was received. We can stop the loop.
    isListening = false; 
    
    const transcript = event.results[0][0].transcript;
    userTranscriptionText.textContent = transcript;
    
    // We stop recognition explicitly here, which will then trigger the 'onend' event.
    // The loop will NOT restart because isListening is now false.
    recognition.stop(); 
    
    checkGuessWithAI(transcript, currentServiceIndex);
};

recognition.onerror = (event) => {
    // Don't set isListening = false here. Let the onend handler manage the state.
    if (event.error !== 'no-speech') {
        console.error('Speech recognition error:', event.error);
        statusText.textContent = `Error: ${event.error}.`;
    }
};

// **** THIS IS THE KEY FIX ****
// This event fires whenever recognition stops for ANY reason (result, error, or timeout).
recognition.onend = () => {
    statusText.classList.remove('listening');
    
    // Check our master switch. If we are still supposed to be listening,
    // it means the service stopped without a valid result (e.g., timeout).
    // So, we immediately restart it.
    if (isListening) {
        console.log("Recognition service ended, restarting for next attempt...");
        try {
            recognition.start(); // The loop continues
        } catch(e) {
            console.error("Error restarting recognition:", e);
        }
    }
};

// --- 5. Backend Communication and Game State ---
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
        
        if (currentServiceIndex >= TOTAL_INSTRUCTIONS) {
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
    stopListening(); // Ensure the listening loop is fully stopped
    const allPassed = servicesStatus.every(s => s === 'passed');
    if (allPassed) aiMessageText.textContent = '🎉 Congratulations! All services passed.';
    else aiMessageText.textContent = 'Game Over! You can start a new game.';
    
    statusText.textContent = 'Game Ended.';
    startBtn.disabled = false;
    startBtn.textContent = 'Start New Game';
}

// --- 6. Event Listener ---
startBtn.addEventListener('click', startGame);