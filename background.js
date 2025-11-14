// API configuration
import { OPENROUTER_API_URL, MODEL_NAME, DEFAULT_API_KEY } from './env.js';

// Get API key from storage
async function getApiKey() {
  try {
    const result = await chrome.storage.sync.get(['openrouterApiKey']);
    
    const storedKey = result.openrouterApiKey;
    const finalKey = storedKey || DEFAULT_API_KEY;
    
    return finalKey;
  } catch (error) {
    console.error('Error retrieving API key from storage:', error);
    return DEFAULT_API_KEY;
  }
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

  const requestBody = {
    model: MODEL_NAME,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.7,
    max_tokens: 1000
  };

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com',
    'X-Title': 'PR Script Extension',
    'User-Agent': 'PR-Script-Extension/1.0'
  };

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('PR Script: Error response:', errorText);
    
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch (e) {
      errorData = { error: { message: errorText } };
    }
    
    throw new Error(`API Error: ${errorData.error?.message || errorData.message || 'Unknown error'}`);
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
  
  if (request.action === 'testApiKey') {
    // Test API key with a simple request
    (async () => {
      try {
        const apiKey = await getApiKey();
        
        const testResponse = await fetch(OPENROUTER_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com',
            'X-Title': 'PR Script Extension',
            'User-Agent': 'PR-Script-Extension/1.0'
          },
          body: JSON.stringify({
            model: MODEL_NAME,
            messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
            max_tokens: 50
          })
        });
        
        if (!testResponse.ok) {
          const errorText = await testResponse.text();
          console.error('PR Script: Test API error:', errorText);
          sendResponse({ success: false, error: errorText });
        } else {
          const testData = await testResponse.json();
          sendResponse({ success: true, data: testData });
        }
      } catch (error) {
        console.error('PR Script: Test error:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true;
  }
});