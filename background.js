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
async function generatePRDescription(commits, fileChanges = null, detailedAnalysis = false) {
  const provider = PROVIDERS[CURRENT_PROVIDER];
  
  // Local fallback - no API required
  if (CURRENT_PROVIDER === 'local') {
    return generateLocalPRDescription(commits, fileChanges, detailedAnalysis);
  }
  
  const apiKey = await getApiKey();
  
  console.log('PR Script: API Key length:', apiKey ? apiKey.length : 'null');
  console.log('PR Script: Using model:', provider.model);
  console.log('PR Script: Detailed analysis requested:', detailedAnalysis);
  
  if (!apiKey) {
    console.log('PR Script: No API key, falling back to local generation');
    return generateLocalPRDescription(commits, fileChanges, detailedAnalysis);
  }

  let prompt;
  
  if (detailedAnalysis && fileChanges) {
    // Enhanced prompt with file changes
    prompt = `Based on the following commit messages and detailed file changes, generate a comprehensive and professional GitHub pull request title and description.

Commit messages:
${commits.map((commit, index) => `${index + 1}. ${commit}`).join('\n')}

File Changes Summary:
- Files changed: ${fileChanges.stats.filesChanged}
- Lines added: ${fileChanges.stats.additions}
- Lines deleted: ${fileChanges.stats.deletions}

DETAILED CODE ANALYSIS:
${fileChanges.files.map(file => {
  let fileAnalysis = `\n📁 ${file.filename} (${file.status})`;
  if (file.additions > 0 || file.deletions > 0) {
    fileAnalysis += ` [+${file.additions} -${file.deletions} lines]`;
  }
  
  if (file.changes && file.changes.length > 0) {
    fileAnalysis += '\n\nCode Changes:';
    
    file.changes.forEach((change, idx) => {
      if (change.summary) {
        fileAnalysis += `\n  ${idx + 1}. ${change.summary}`;
      }
      
      if (change.added && change.added.length > 0) {
        fileAnalysis += '\n     ➕ Added:';
        change.added.slice(0, 3).forEach(add => {
          fileAnalysis += `\n        - ${add.content}`;
          if (add.type !== 'general' && add.info) {
            fileAnalysis += ` (${add.type}: ${add.info})`;
          }
        });
      }
      
      if (change.removed && change.removed.length > 0) {
        fileAnalysis += '\n     ➖ Removed:';
        change.removed.slice(0, 3).forEach(remove => {
          fileAnalysis += `\n        - ${remove.content}`;
          if (remove.type !== 'general' && remove.info) {
            fileAnalysis += ` (${remove.type}: ${remove.info})`;
          }
        });
      }
      
      if (change.context && change.context.length > 0) {
        fileAnalysis += '\n     📍 Context:';
        change.context.forEach(ctx => {
          fileAnalysis += `\n        - ${ctx.content}`;
        });
      }
    });
  }
  
  return fileAnalysis;
}).join('\n')}

High-level Changes:
${fileChanges.summary.join('\n')}

INSTRUCTIONS:
Analyze the actual code changes above and create a detailed, technical PR description that explains:

1. **WHAT** was implemented (be specific about features, functions, components)
2. **HOW** it was implemented (technical approach, patterns used)
3. **WHY** these changes were made (purpose, benefits)
4. **KEY TECHNICAL DETAILS** from the actual code modifications

Focus on the functionality being added/modified based on the actual code, not just file names.

Format your response as:
Title: [A specific title that reflects the actual functionality implemented]

Description:
${commits.map((commit, index) => `${index + 1}. ${commit}`).join('\n')}

## Key Features Added/Modified
[Go through each file and provide detailed analysis of what was changed in each file. Be specific about the functionality, components, functions, and features that were added or modified. Analyze the actual code changes to explain what each file does and how it contributes to the overall feature.]

Hii Amruth`;
  } else {
    // Standard prompt for commits only
    prompt = `Based on the following commit messages, generate a concise and professional GitHub pull request title and description. 

Commit messages:
${commits.map((commit, index) => `${index + 1}. ${commit}`).join('\n')}

Please format your response as:
Title: [A clear, concise title summarizing the changes]

Description:
${commits.map((commit, index) => `${index + 1}. ${commit}`).join('\n')}

## Key Features Added/Modified
[Provide a detailed explanation of what was changed, why it was changed, and any important notes for reviewers. Focus on the functionality and features that were added or modified.]

Hii Amruth`;
  }

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
    max_tokens: detailedAnalysis ? 1500 : 1000 // More tokens for detailed analysis
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
      return generateLocalPRDescription(commits, fileChanges, detailedAnalysis);
    }

    const data = await response.json();
    console.log('PR Script: Success response:', data);
    return data.choices[0].message.content;
  } catch (error) {
    console.error('PR Script: API request failed:', error);
    console.log('PR Script: Falling back to local generation');
    return generateLocalPRDescription(commits, fileChanges, detailedAnalysis);
  }
}

// Local PR description generation (no API required)
function generateLocalPRDescription(commits, fileChanges = null, detailedAnalysis = false) {
  console.log('PR Script: Generating local PR description');
  console.log('PR Script: File changes provided:', !!fileChanges);
  console.log('PR Script: Detailed analysis:', detailedAnalysis);
  
  // Simple rule-based generation
  const cleanCommits = commits.filter(commit => 
    commit && 
    commit.length > 5 && 
    !commit.toLowerCase().includes('view commit details')
  );
  
  // Generate title based on file changes and commits
  let title = '';
  if (detailedAnalysis && fileChanges && fileChanges.files.length > 0) {
    // Generate title based on file changes
    const addedFiles = fileChanges.files.filter(f => f.status === 'added');
    const modifiedFiles = fileChanges.files.filter(f => f.status === 'modified');
    const deletedFiles = fileChanges.files.filter(f => f.status === 'deleted');
    
    if (addedFiles.length > 0) {
      const fileTypes = [...new Set(addedFiles.map(f => f.filename.split('.').pop()))];
      title = `Add ${addedFiles.length > 1 ? 'new components and features' : 'new functionality'}`;
      if (fileTypes.length === 1) {
        title += ` (${fileTypes[0]} files)`;
      }
    } else if (modifiedFiles.length > 0) {
      title = `Update and improve existing functionality`;
    } else if (deletedFiles.length > 0) {
      title = `Remove deprecated code and files`;
    } else {
      title = 'Refactor and optimize codebase';
    }
  } else {
    // Fallback to commit-based title generation
    if (cleanCommits.length === 1) {
      title = cleanCommits[0];
    } else if (cleanCommits.length > 1) {
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
  }
  
  // Generate detailed description
  let description = '';
  
  if (detailedAnalysis && fileChanges && fileChanges.files.length > 0) {
    description = `${cleanCommits.map((commit, index) => `${index + 1}. ${commit}`).join('\n')}

## Key Features Added/Modified

${generateDetailedFileAnalysis(fileChanges.files)}

Hii Amruth`;
  } else {
    // Standard description without file details
    description = `${cleanCommits.map((commit, index) => `${index + 1}. ${commit}`).join('\n')}

## Key Features Added/Modified

${generateBasicFeatureSummary(cleanCommits)}

Hii Amruth`;
  }

  return `Title: ${title}

Description:
${description}`;
}

/**
 * Generates a technical summary based on code changes
 * 
 * @param {Array} files - Array of file change objects
 * @returns {string} - Technical summary
 */
function generateTechnicalSummary(files) {
  const technologies = new Set();
  const patterns = new Set();
  
  files.forEach(file => {
    // Analyze file extensions
    const ext = file.filename.split('.').pop()?.toLowerCase();
    if (ext) {
      const techMap = {
        'js': 'JavaScript',
        'jsx': 'React/JSX',
        'ts': 'TypeScript', 
        'tsx': 'React/TypeScript',
        'css': 'CSS',
        'scss': 'SCSS',
        'html': 'HTML',
        'json': 'JSON',
        'md': 'Markdown'
      };
      if (techMap[ext]) technologies.add(techMap[ext]);
    }
    
    // Analyze code patterns
    if (file.changes) {
      file.changes.forEach(change => {
        if (change.added) {
          change.added.forEach(add => {
            if (add.type !== 'general') patterns.add(add.type);
          });
        }
        if (change.removed) {
          change.removed.forEach(remove => {
            if (remove.type !== 'general') patterns.add(remove.type);
          });
        }
      });
    }
  });
  
  let summary = '';
  if (technologies.size > 0) {
    summary += `Technologies: ${Array.from(technologies).join(', ')}`;
  }
  if (patterns.size > 0) {
    if (summary) summary += '\n';
    summary += `Code patterns modified: ${Array.from(patterns).join(', ')}`;
  }
  
  return summary || 'Code refactoring and improvements';
}

/**
 * Generates a feature summary based on code analysis
 * 
 * @param {Array} files - Array of file change objects
 * @returns {string} - Feature summary
 */
function generateFeatureSummary(files) {
  const features = [];
  const componentChanges = [];
  const apiChanges = [];
  const stateChanges = [];
  
  files.forEach(file => {
    if (file.changes) {
      file.changes.forEach(change => {
        // Analyze added code for features
        if (change.added) {
          change.added.forEach(add => {
            switch (add.type) {
              case 'function':
                if (add.info) features.push(`Added function: ${add.info}`);
                break;
              case 'component':
                if (add.info) componentChanges.push(add.info);
                break;
              case 'api':
                if (add.info) apiChanges.push(add.info);
                break;
              case 'state':
                stateChanges.push('State management updates');
                break;
              case 'import':
                if (add.info) features.push(`New dependency: ${add.info}`);
                break;
            }
          });
        }
      });
    }
    
    // Analyze by filename patterns
    if (file.status === 'added') {
      if (file.filename.includes('component') || file.filename.includes('Component')) {
        features.push(`New component: ${file.filename.split('/').pop()}`);
      } else if (file.filename.includes('api') || file.filename.includes('service')) {
        features.push(`New API service: ${file.filename.split('/').pop()}`);
      } else if (file.filename.includes('hook') || file.filename.includes('Hook')) {
        features.push(`New React hook: ${file.filename.split('/').pop()}`);
      }
    }
  });
  
  // Compile feature summary
  let summary = '';
  if (componentChanges.length > 0) {
    summary += `• React components: ${componentChanges.join(', ')}\n`;
  }
  if (apiChanges.length > 0) {
    summary += `• API endpoints: ${apiChanges.join(', ')}\n`;
  }
  if (stateChanges.length > 0) {
    summary += `• ${Array.from(new Set(stateChanges)).join(', ')}\n`;
  }
  if (features.length > 0) {
    summary += `• ${features.slice(0, 5).join(', ')}`;
  }
  
  return summary || 'Code improvements and enhancements';
}

/**
 * Analyzes code changes to extract meaningful patterns
 * 
 * @param {Array} changes - Array of code change objects
 * @returns {Array} - Array of change descriptions
 */
function analyzeCodeChanges(changes) {
  const analysis = [];
  
  changes.forEach(change => {
    if (change.summary) {
      analysis.push(change.summary);
    }
    
    // Analyze specific patterns
    if (change.added) {
      const addedTypes = change.added.map(a => a.type);
      if (addedTypes.includes('function')) {
        const functions = change.added.filter(a => a.type === 'function').map(a => a.info);
        analysis.push(`Added functions: ${functions.join(', ')}`);
      }
      if (addedTypes.includes('import')) {
        analysis.push('Updated imports');
      }
      if (addedTypes.includes('component')) {
        analysis.push('React component changes');
      }
    }
    
    if (change.removed) {
      const removedTypes = change.removed.map(r => r.type);
      if (removedTypes.includes('function')) {
        analysis.push('Removed/refactored functions');
      }
    }
  });
  
  return [...new Set(analysis)]; // Remove duplicates
}

/**
 * Generates detailed analysis for each file with specific changes
 * 
 * @param {Array} files - Array of file change objects
 * @returns {string} - Detailed file-by-file analysis
 */
function generateDetailedFileAnalysis(files) {
  return files.map(file => {
    let analysis = `**${file.filename}**`;
    if (file.status !== 'modified') {
      analysis += ` (${file.status})`;
    }
    analysis += `:\n`;
    
    // Analyze what the file does based on its name and changes
    const fileName = file.filename.split('/').pop();
    const fileExt = fileName.split('.').pop()?.toLowerCase();
    
    // Determine file purpose
    let purpose = '';
    if (fileName.toLowerCase().includes('api') || fileName.toLowerCase().includes('service')) {
      purpose = 'API service file';
    } else if (fileName.toLowerCase().includes('component')) {
      purpose = 'React component';
    } else if (fileName.toLowerCase().includes('hook')) {
      purpose = 'React hook';
    } else if (fileExt === 'css' || fileExt === 'scss') {
      purpose = 'Styling file';
    } else if (fileExt === 'js' || fileExt === 'jsx') {
      purpose = 'JavaScript functionality';
    } else if (fileExt === 'html') {
      purpose = 'HTML structure';
    } else if (fileExt === 'json') {
      purpose = 'Configuration file';
    } else {
      purpose = 'Code file';
    }
    
    analysis += `- ${purpose} handling `;
    
    // Add specific functionality based on code changes
    if (file.changes && file.changes.length > 0) {
      const functionalities = [];
      const addedFunctions = [];
      const apiCalls = [];
      const components = [];
      const contexts = [];
      
      file.changes.forEach(change => {
        if (change.summary) {
          functionalities.push(change.summary);
        }
        
        if (change.added) {
          change.added.forEach(add => {
            if (add.type === 'function' && add.info) {
              addedFunctions.push(add.info);
            } else if (add.type === 'apiIntegration' && add.info) {
              apiCalls.push(add.info);
            } else if (add.type === 'component' && add.info) {
              components.push(add.info);
            }
            
            // Collect context information
            if (add.context) {
              contexts.push(add.context);
            }
          });
        }
        
        if (change.removed) {
          change.removed.forEach(remove => {
            if (remove.context) {
              contexts.push(`removed ${remove.context.toLowerCase()}`);
            }
          });
        }
      });
      
      // Build description based on what was found
      const descriptions = [];
      
      // Use functionality summaries first (most specific)
      if (functionalities.length > 0) {
        descriptions.push(...functionalities);
      }
      
      // Add context-based descriptions
      const uniqueContexts = [...new Set(contexts)];
      if (uniqueContexts.length > 0) {
        descriptions.push(...uniqueContexts.map(ctx => ctx.toLowerCase()));
      }
      
      // Add specific technical details
      if (addedFunctions.length > 0) {
        descriptions.push(`new functions (${addedFunctions.join(', ')})`);
      }
      
      if (apiCalls.length > 0) {
        descriptions.push(`API endpoints (${apiCalls.join(', ')})`);
      }
      
      if (components.length > 0) {
        descriptions.push(`React components (${components.join(', ')})`);
      }
      
      if (descriptions.length > 0) {
        // Remove duplicates and join
        const uniqueDescriptions = [...new Set(descriptions)];
        analysis += uniqueDescriptions.join(', ');
      } else {
        analysis += 'code improvements and functionality updates';
      }
    } else {
      // Fallback based on file status and name
      if (file.status === 'added') {
        analysis += `new ${purpose.toLowerCase()} implementation`;
      } else {
        analysis += 'existing functionality updates';
      }
    }
    
    // Add line change info
    if (file.additions > 0 || file.deletions > 0) {
      analysis += ` (+${file.additions} -${file.deletions} lines)`;
    }
    
    return analysis;
  }).join('\n');
}

/**
 * Generates basic feature summary from commit messages
 * 
 * @param {Array} commits - Array of commit messages
 * @returns {string} - Basic feature summary
 */
function generateBasicFeatureSummary(commits) {
  const features = [];
  
  commits.forEach(commit => {
    const lowerCommit = commit.toLowerCase();
    
    if (lowerCommit.includes('add') || lowerCommit.includes('create')) {
      features.push(`Added new functionality as described in commit: "${commit}"`);
    } else if (lowerCommit.includes('fix') || lowerCommit.includes('bug')) {
      features.push(`Fixed issues as described in commit: "${commit}"`);
    } else if (lowerCommit.includes('update') || lowerCommit.includes('improve')) {
      features.push(`Updated and improved functionality as described in commit: "${commit}"`);
    } else if (lowerCommit.includes('remove') || lowerCommit.includes('delete')) {
      features.push(`Removed/cleaned up code as described in commit: "${commit}"`);
    } else {
      features.push(`Implemented changes as described in commit: "${commit}"`);
    }
  });
  
  return features.join('\n');
}

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generateDescription' && request.commits) {
    // Extract additional parameters for detailed analysis
    const fileChanges = request.fileChanges || null;
    const detailedAnalysis = request.detailedAnalysis || false;
    
    console.log('PR Script: Generating description with detailed analysis:', detailedAnalysis);
    console.log('PR Script: File changes provided:', !!fileChanges);
    
    generatePRDescription(request.commits, fileChanges, detailedAnalysis)
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
          // Test local generation with detailed analysis
          const testResult = generateLocalPRDescription(
            ['test commit message'], 
            {
              files: [{ filename: 'test.js', status: 'modified', additions: 5, deletions: 2 }],
              stats: { filesChanged: 1, additions: 5, deletions: 2 },
              summary: ['Modified 1 JavaScript file']
            }, 
            true
          );
          sendResponse({ success: true, data: { message: 'Local generation with detailed analysis working!', result: testResult } });
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
          
          // Test local fallback with detailed analysis
          const localResult = generateLocalPRDescription(
            ['test commit message'], 
            {
              files: [{ filename: 'test.js', status: 'modified', additions: 5, deletions: 2 }],
              stats: { filesChanged: 1, additions: 5, deletions: 2 },
              summary: ['Modified 1 JavaScript file']
            }, 
            true
          );
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
        
        // Test local fallback with detailed analysis
        const localResult = generateLocalPRDescription(
          ['test commit message'], 
          {
            files: [{ filename: 'test.js', status: 'modified', additions: 5, deletions: 2 }],
            stats: { filesChanged: 1, additions: 5, deletions: 2 },
            summary: ['Modified 1 JavaScript file']
          }, 
          true
        );
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
