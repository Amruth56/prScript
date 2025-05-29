// API configuration - Multiple providers
const PROVIDERS = {
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'deepseek/deepseek-chat-v3-0324:free',
    apiKey: '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',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com',
      'X-Title': 'PR Script Extension',
      'User-Agent': 'PR-Script-Extension/1.0'
    })
  },
  huggingface: {
    url: 'https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium',
    model: 'microsoft/DialoGPT-medium',
    apiKey: 'hf_demo', // Demo key for testing
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    })
  },
  // Fallback: Local generation without API
  local: {
    url: null,
    model: 'local-fallback',
    apiKey: null,
    headers: () => ({})
  }
};

const CURRENT_PROVIDER = 'openrouter'; // Can be changed to 'huggingface' or 'local'

// Get API key from storage
async function getApiKey() {
  try {
    const result = await chrome.storage.sync.get(['openrouterApiKey']);
    console.log('PR Script: Storage result:', result);
    
    const storedKey = result.openrouterApiKey;
    const finalKey = storedKey || PROVIDERS[CURRENT_PROVIDER].apiKey;
    
    console.log('PR Script: Stored key exists:', !!storedKey);
    console.log('PR Script: Using default key:', !storedKey);
    console.log('PR Script: Final key length:', finalKey ? finalKey.length : 'null');
    console.log('PR Script: Final key starts with:', finalKey ? finalKey.substring(0, 10) + '...' : 'null');
    
    return finalKey;
  } catch (error) {
    console.error('PR Script: Error getting API key:', error);
    console.log('PR Script: Falling back to default key');
    return PROVIDERS[CURRENT_PROVIDER].apiKey;
  }
}

// Set API key in storage
async function setApiKey(apiKey) {
  await chrome.storage.sync.set({ openrouterApiKey: apiKey });
}

// Generate PR description using AI
async function generatePRDescription(commits) {
  const provider = PROVIDERS[CURRENT_PROVIDER];
  
  // Local fallback - no API required
  if (CURRENT_PROVIDER === 'local') {
    return generateLocalPRDescription(commits);
  }
  
  const apiKey = await getApiKey();
  
  console.log('PR Script: API Key length:', apiKey ? apiKey.length : 'null');
  console.log('PR Script: Using model:', provider.model);
  
  if (!apiKey) {
    console.log('PR Script: No API key, falling back to local generation');
    return generateLocalPRDescription(commits);
  }

  const prompt = `Based on the following commit messages, generate a concise and professional GitHub pull request title and description. 

Commit messages:
${commits.map((commit, index) => `${index + 1}. ${commit}`).join('\n')}

Please format your response as:
Title: [A clear, concise title summarizing the changes]

Description:
[A detailed description explaining what was changed, why it was changed, and any important notes for reviewers]`;

  console.log('PR Script: Making API request to:', provider.url);

  const requestBody = {
    model: provider.model,
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

  const headers = provider.headers(apiKey);

  console.log('PR Script: Request headers:', headers);
  if (headers.Authorization) {
    console.log('PR Script: Authorization header:', headers.Authorization.substring(0, 20) + '...');
  }

  try {
    const response = await fetch(provider.url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    console.log('PR Script: Response status:', response.status);
    console.log('PR Script: Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('PR Script: Error response:', errorText);
      
      // Fallback to local generation on API error
      console.log('PR Script: API failed, falling back to local generation');
      return generateLocalPRDescription(commits);
    }

    const data = await response.json();
    console.log('PR Script: Success response:', data);
    return data.choices[0].message.content;
  } catch (error) {
    console.error('PR Script: API request failed:', error);
    console.log('PR Script: Falling back to local generation');
    return generateLocalPRDescription(commits);
  }
}

// Local PR description generation (no API required)
function generateLocalPRDescription(commits) {
  console.log('PR Script: Generating local PR description');
  
  // Simple rule-based generation
  const cleanCommits = commits.filter(commit => 
    commit && 
    commit.length > 5 && 
    !commit.toLowerCase().includes('view commit details')
  );
  
  // Generate title
  let title = '';
  if (cleanCommits.length === 1) {
    title = cleanCommits[0];
  } else if (cleanCommits.length > 1) {
    // Look for common patterns
    const hasFeature = cleanCommits.some(c => c.toLowerCase().includes('add') || c.toLowerCase().includes('feature'));
    const hasFix = cleanCommits.some(c => c.toLowerCase().includes('fix') || c.toLowerCase().includes('bug'));
    const hasUpdate = cleanCommits.some(c => c.toLowerCase().includes('update') || c.toLowerCase().includes('improve'));
    
    if (hasFeature) {
      title = 'Add new features and improvements';
    } else if (hasFix) {
      title = 'Fix bugs and issues';
    } else if (hasUpdate) {
      title = 'Update and improve functionality';
    } else {
      title = 'Multiple improvements and changes';
    }
  } else {
    title = 'Code improvements';
  }
  
  // Generate description
  const description = `## Changes Made

${cleanCommits.map((commit, index) => `${index + 1}. ${commit}`).join('\n')}

## Summary

This pull request includes ${cleanCommits.length} commit${cleanCommits.length !== 1 ? 's' : ''} with various improvements and changes to the codebase.

## Review Notes

Please review the individual commits for detailed information about each change.

---
*This description was generated automatically by PR Script extension.*`;

  return `Title: ${title}

Description:
${description}`;
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
        const provider = PROVIDERS[CURRENT_PROVIDER];
        
        if (CURRENT_PROVIDER === 'local') {
          // Test local generation
          const testResult = generateLocalPRDescription(['test commit message']);
          sendResponse({ success: true, data: { message: 'Local generation working!', result: testResult } });
          return;
        }
        
        const apiKey = await getApiKey();
        console.log('PR Script: Testing API key...');
        
        const testResponse = await fetch(provider.url, {
          method: 'POST',
          headers: provider.headers(apiKey),
          body: JSON.stringify({
            model: provider.model,
            messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
            max_tokens: 50
          })
        });

        console.log('PR Script: Test response status:', testResponse.status);
        
        if (!testResponse.ok) {
          const errorText = await testResponse.text();
          console.error('PR Script: Test API error:', errorText);
          
          // Test local fallback
          const localResult = generateLocalPRDescription(['test commit message']);
          sendResponse({ 
            success: false, 
            error: errorText, 
            fallback: true,
            localResult: localResult
          });
        } else {
          const testData = await testResponse.json();
          console.log('PR Script: Test API success:', testData);
          sendResponse({ success: true, data: testData });
        }
      } catch (error) {
        console.error('PR Script: Test error:', error);
        
        // Test local fallback
        const localResult = generateLocalPRDescription(['test commit message']);
        sendResponse({ 
          success: false, 
          error: error.message,
          fallback: true,
          localResult: localResult
        });
      }
    })();
    
    return true;
  }
});
