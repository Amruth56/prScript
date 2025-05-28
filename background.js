// API configuration
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_NAME = 'deepseek/deepseek-chat-v3-0324:free'; // Updated to use the specific free model
const DEFAULT_API_KEY = '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'; // Your provided API key

// Get API key from storage
async function getApiKey() {
  const result = await chrome.storage.sync.get(['openrouterApiKey']);
  // Return stored key or default key if none is stored
  return result.openrouterApiKey || DEFAULT_API_KEY;
}

// Set API key in storage
async function setApiKey(apiKey) {
  await chrome.storage.sync.set({ openrouterApiKey: apiKey });
}

// Generate PR description using AI
async function generatePRDescription(commits) {
  const apiKey = await getApiKey();
  
  if (!apiKey) {
    throw new Error('API key not configured. Please set your OpenRouter API key in the extension popup.');
  }

  const prompt = `Based on the following commit messages, generate a concise and professional GitHub pull request title and description. 

Commit messages:
${commits.map((commit, index) => `${index + 1}. ${commit}`).join('\n')}

Please format your response as:
Title: [A clear, concise title summarizing the changes]

Description:
[A detailed description explaining what was changed, why it was changed, and any important notes for reviewers]`;

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com',
      'X-Title': 'PR Script Extension'
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`API Error: ${errorData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generateDescription' && request.commits) {
    generatePRDescription(request.commits)
      .then(description => {
        // Send response back to content script
        chrome.tabs.sendMessage(sender.tab.id, { 
          action: 'insertDescription', 
          description: description 
        });
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Error generating description:', error);
        chrome.tabs.sendMessage(sender.tab.id, { 
          action: 'showError', 
          error: error.message 
        });
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'setApiKey') {
    setApiKey(request.apiKey)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true;
  }
  
  if (request.action === 'getApiKey') {
    getApiKey()
      .then(apiKey => sendResponse({ apiKey: apiKey }))
      .catch(error => sendResponse({ error: error.message }));
    
    return true;
  }
});
