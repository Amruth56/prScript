// DOM elements
const apiKeyInput = document.getElementById('apiKey');
const saveKeyButton = document.getElementById('saveKey');
const generateButton = document.getElementById('generate');
const testApiButton = document.getElementById('testApi');
const statusDiv = document.getElementById('status');

// Load saved API key on popup open
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getApiKey' });
        if (response.apiKey) {
            // Only show the key in the input if it's a custom key (not the default one)
            if (response.apiKey !== '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') {
                apiKeyInput.value = response.apiKey;
                updateStatus('Custom API key loaded', 'success');
            } else {
                updateStatus('Ready to generate PR descriptions!', 'success');
            }
        } else {
            updateStatus('API key configured and ready!', 'success');
        }
    } catch (error) {
        updateStatus('Error loading API key', 'error');
    }
});

// Save API key
saveKeyButton.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
        updateStatus('Please enter an API key', 'error');
        return;
    }
    
    try {
        const response = await chrome.runtime.sendMessage({ 
            action: 'setApiKey', 
            apiKey: apiKey 
        });
        
        if (response.success) {
            updateStatus('Custom API key saved successfully!', 'success');
        } else {
            updateStatus('Error saving API key', 'error');
        }
    } catch (error) {
        updateStatus('Error saving API key', 'error');
    }
});

// Generate PR description for current page
generateButton.addEventListener('click', async () => {
    updateStatus('Checking current page...', 'info');
    
    try {
        // Get current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                
        if (!tab.url.includes('github.com')) {
            updateStatus('Please navigate to a GitHub page first', 'error');
            return;
        }
        
        if (!tab.url.includes('/compare') && !tab.url.includes('/pull/new') && !tab.url.includes('/pull/')) {
            updateStatus('Please navigate to a GitHub PR creation or edit page', 'error');
            return;
        }
        
        updateStatus('Triggering PR generation...', 'info');
        
        // Send message to content script to trigger generation
        try {
            await chrome.tabs.sendMessage(tab.id, { action: 'triggerGeneration' });
            updateStatus('Generation triggered! Check the GitHub page.', 'success');
            
            // Close popup after a short delay
            setTimeout(() => {
                window.close();
            }, 2000);
        } catch (messageError) {
            console.error('Message error:', messageError);
            updateStatus('Extension not loaded on this page. Try refreshing the page.', 'error');
        }
        
    } catch (error) {
        console.error('Error:', error);
        updateStatus('Error: Make sure you\'re on a GitHub PR page and the extension is loaded', 'error');
    }
});

// Test API key
testApiButton.addEventListener('click', async () => {
    updateStatus('Testing API key...', 'info');
    
    try {
        const response = await chrome.runtime.sendMessage({ action: 'testApiKey' });
        
        if (response.success) {
            updateStatus('API key is working! ✅', 'success');
        } else {
            updateStatus(`API test failed: ${response.error}`, 'error');
        }
    } catch (error) {
        updateStatus('Error testing API key', 'error');
    }
});

// Update status message
function updateStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    
    // Clear status after 5 seconds for non-error messages
    if (type !== 'error') {
        setTimeout(() => {
            statusDiv.textContent = '';
            statusDiv.className = 'status';
        }, 5000);
    }
}

// Handle Enter key in API key input
apiKeyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        saveKeyButton.click();
    }
});
