// API configuration
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_NAME = 'deepseek/deepseek-chat-v3-0324:free'; // Back to DeepSeek model
const DEFAULT_API_KEY = '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'; // Updated API key

// Get API key from storage
async function getApiKey() {
  try {
    const result = await chrome.storage.sync.get(['openrouterApiKey']);
    console.log('PR Script: Storage result:', result);
    
    const storedKey = result.openrouterApiKey;
    const finalKey = storedKey || DEFAULT_API_KEY;
    
    console.log('PR Script: Stored key exists:', !!storedKey);
    console.log('PR Script: Using default key:', !storedKey);
    console.log('PR Script: Final key length:', finalKey ? finalKey.length : 'null');
    console.log('PR Script: Final key starts with:', finalKey ? finalKey.substring(0, 10) + '...' : 'null');
    
    return finalKey;
  } catch (error) {
    console.error('PR Script: Error getting API key:', error);
    console.log('PR Script: Falling back to default key');
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
  
  console.log('PR Script: API Key length:', apiKey ? apiKey.length : 'null');
  console.log('PR Script: Using model:', MODEL_NAME);
  
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

  console.log('PR Script: Making API request to:', OPENROUTER_API_URL);

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

  console.log('PR Script: Request body:', requestBody);

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com',
    'X-Title': 'PR Script Extension',
    'User-Agent': 'PR-Script-Extension/1.0'
  };

  console.log('PR Script: Request headers:', headers);
  console.log('PR Script: Authorization header:', headers.Authorization.substring(0, 20) + '...');

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody)
  });

  console.log('PR Script: Response status:', response.status);
  console.log('PR Script: Response headers:', Object.fromEntries(response.headers.entries()));

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
  console.log('PR Script: Success response:', data);
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
        console.log('PR Script: Testing API key...');
        
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

        console.log('PR Script: Test response status:', testResponse.status);
        
        if (!testResponse.ok) {
          const errorText = await testResponse.text();
          console.error('PR Script: Test API error:', errorText);
          sendResponse({ success: false, error: errorText });
        } else {
          const testData = await testResponse.json();
          console.log('PR Script: Test API success:', testData);
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
