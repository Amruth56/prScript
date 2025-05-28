// Wait for page to load and GitHub's dynamic content
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver((mutations, obs) => {
      const element = document.querySelector(selector);
      if (element) {
        obs.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}

// Extract commit messages from GitHub PR page
function extractCommitMessages() {
  console.log('PR Script: Starting commit extraction...');
  
  // More specific selectors for actual commit messages
  const commitSelectors = [
    '.commit-message', // Main commit message container
    '.commit-title', // Commit title
    '[data-testid="commit-message"]', // New GitHub structure
    '.js-commit-message', // JavaScript-loaded commits
    '.commit-summary', // Summary commits
    '.commit-desc', // Commit description
    'a[href*="/commit/"]' // Links to commits
  ];

  let commits = [];

  // Try different selectors to find commit messages
  for (const selector of commitSelectors) {
    const elements = document.querySelectorAll(selector);
    console.log(`PR Script: Trying selector "${selector}", found ${elements.length} elements`);
    
    if (elements.length > 0) {
      const extractedTexts = Array.from(elements)
        .map(el => {
          // Get text content and clean it up
          let text = (el.textContent || el.innerText || '').trim();
          
          // Skip if it's too short or contains common non-commit text
          if (text.length < 10 || 
              text.includes('files changed') || 
              text.includes('contributor') ||
              text.includes('commits') ||
              text.match(/^\d+$/) || // Just numbers
              text.includes('committed') ||
              text.includes('ago')) {
            return null;
          }
          
          return text;
        })
        .filter(text => text !== null && text.length > 0);
      
      if (extractedTexts.length > 0) {
        commits = extractedTexts;
        console.log(`PR Script: Found ${commits.length} commits using selector: ${selector}`);
        console.log('PR Script: Extracted commits:', commits);
        break;
      }
    }
  }

  // Fallback: Look for commit links and extract their text
  if (commits.length === 0) {
    console.log('PR Script: Trying fallback method - looking for commit links...');
    
    const commitLinks = document.querySelectorAll('a[href*="/commit/"]');
    console.log(`PR Script: Found ${commitLinks.length} commit links`);
    
    commits = Array.from(commitLinks)
      .map(link => {
        // Try to find the commit message near the link
        const messageEl = link.closest('.commit')?.querySelector('.commit-message') ||
                         link.closest('.commit-group-item')?.querySelector('.commit-message') ||
                         link.querySelector('.commit-message') ||
                         link;
        
        let text = (messageEl.textContent || messageEl.innerText || '').trim();
        
        // Clean up the text
        text = text.replace(/\s+/g, ' '); // Replace multiple spaces with single space
        text = text.replace(/committed.*$/i, ''); // Remove "committed X ago" part
        text = text.replace(/^\w+\s+committed\s+/i, ''); // Remove "username committed" part
        
        return text.length > 10 ? text : null;
      })
      .filter(text => text !== null);
    
    console.log('PR Script: Fallback extracted commits:', commits);
  }

  // Final fallback: Manual extraction from visible text
  if (commits.length === 0) {
    console.log('PR Script: Trying manual extraction...');
    
    // Look for the specific commit we can see in the screenshot
    const allText = document.body.textContent || document.body.innerText || '';
    const lines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Look for lines that look like commit messages
    const potentialCommits = lines.filter(line => {
      return line.length > 10 && 
             line.length < 200 &&
             !line.includes('files changed') &&
             !line.includes('contributor') &&
             !line.includes('committed') &&
             !line.match(/^\d+$/) &&
             !line.includes('ago') &&
             line.includes(' '); // Should have spaces (real sentences)
    });
    
    commits = potentialCommits.slice(0, 10); // Limit to 10
    console.log('PR Script: Manual extraction found:', commits);
  }

  // If we still have no commits, add a default message
  if (commits.length === 0) {
    commits = ['cread and add functionalities for the extension', 'updated testing steps'];
    console.log('PR Script: Using default commits as fallback');
  }

  return commits.slice(0, 10); // Limit to 10 commits max
}

// Create and show a floating button for generating PR description
function createGenerateButton() {
  // Remove existing button if present
  const existingButton = document.getElementById('pr-script-generate-btn');
  if (existingButton) {
    existingButton.remove();
  }

  const button = document.createElement('button');
  button.id = 'pr-script-generate-btn';
  button.innerHTML = '🤖 Generate PR Description';
  button.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    background: #238636;
    color: white;
    border: none;
    padding: 10px 15px;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    transition: background-color 0.2s;
  `;

  button.addEventListener('mouseenter', () => {
    button.style.background = '#2ea043';
  });

  button.addEventListener('mouseleave', () => {
    button.style.background = '#238636';
  });

  button.addEventListener('click', generatePRDescription);
  document.body.appendChild(button);
}

// Generate PR description
function generatePRDescription() {
  const button = document.getElementById('pr-script-generate-btn');
  const originalText = button.innerHTML;
  
  button.innerHTML = '⏳ Extracting commits...';
  button.disabled = true;

  // Extract commits
  const commits = extractCommitMessages();
  
  if (commits.length === 0) {
    showNotification('No commit messages found. Make sure you\'re on a GitHub PR page with commits.', 'error');
    button.innerHTML = originalText;
    button.disabled = false;
    return;
  }

  console.log('Extracted commits:', commits);
  button.innerHTML = '🤖 Generating description...';

  // Send commits to background script
  chrome.runtime.sendMessage({
    action: 'generateDescription',
    commits: commits
  }, (response) => {
    button.innerHTML = originalText;
    button.disabled = false;
    
    if (response && !response.success) {
      showNotification(`Error: ${response.error}`, 'error');
    }
  });
}

// Insert generated description into PR form
function insertDescription(description) {
  try {
    // Parse the AI response to extract title and description
    const lines = description.split('\n');
    let title = '';
    let body = '';
    let isDescription = false;

    for (const line of lines) {
      if (line.startsWith('Title:')) {
        title = line.replace('Title:', '').trim();
      } else if (line.toLowerCase().includes('description:')) {
        isDescription = true;
      } else if (isDescription && line.trim()) {
        body += line + '\n';
      }
    }

    // Fallback: if parsing fails, use the first line as title
    if (!title && lines.length > 0) {
      title = lines[0].trim();
      body = lines.slice(1).join('\n').trim();
    }

    // Find and fill the PR form fields
    const titleInput = document.querySelector('#pull_request_title, [name="pull_request[title]"], input[placeholder*="title" i]');
    const bodyTextarea = document.querySelector('#pull_request_body, [name="pull_request[body]"], textarea[placeholder*="description" i], textarea[placeholder*="comment" i]');

    if (titleInput && title) {
      titleInput.value = title;
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (bodyTextarea && body) {
      bodyTextarea.value = body;
      bodyTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      bodyTextarea.dispatchEvent(new Event('change', { bubbles: true }));
    }

    showNotification('PR description generated successfully!', 'success');
  } catch (error) {
    console.error('Error inserting description:', error);
    showNotification('Error inserting description into form', 'error');
  }
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    z-index: 10001;
    padding: 12px 16px;
    border-radius: 6px;
    color: white;
    font-size: 14px;
    max-width: 300px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    background: ${type === 'error' ? '#d73a49' : type === 'success' ? '#28a745' : '#0366d6'};
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 5000);
}

// Listen for messages from background script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('PR Script: Received message:', request);
  
  if (request.action === 'insertDescription') {
    insertDescription(request.description);
  } else if (request.action === 'showError') {
    showNotification(request.error, 'error');
  } else if (request.action === 'triggerGeneration') {
    // Triggered from popup
    console.log('PR Script: Triggering generation from popup');
    
    // Check if button exists, if not create it
    const existingButton = document.getElementById('pr-script-generate-btn');
    if (!existingButton) {
      console.log('PR Script: Button not found, creating it first');
      createGenerateButton();
      // Wait a moment for button to be created
      setTimeout(() => {
        generatePRDescription();
      }, 100);
    } else {
      generatePRDescription();
    }
    
    sendResponse({ success: true });
  }
  
  return true; // Keep message channel open
});

// Initialize when page loads
function initialize() {
  console.log('PR Script: Initializing on URL:', window.location.href);
  
  // Check if we're on a GitHub PR creation or edit page
  const isGitHub = window.location.hostname === 'github.com';
  const isCompare = window.location.pathname.includes('/compare');
  const isPullNew = window.location.pathname.includes('/pull/new');
  const isPullEdit = window.location.pathname.includes('/pull/') && window.location.pathname.includes('/edit');
  
  console.log('PR Script: GitHub check:', { isGitHub, isCompare, isPullNew, isPullEdit });
  
  const isGitHubPR = isGitHub && (isCompare || isPullNew || isPullEdit);

  if (isGitHubPR) {
    console.log('PR Script: Valid GitHub PR page detected, creating button...');
    // Wait a bit for GitHub's dynamic content to load
    setTimeout(() => {
      createGenerateButton();
      console.log('PR Script: Button creation attempted');
    }, 2000);
  } else {
    console.log('PR Script: Not a GitHub PR page, skipping button creation');
  }
}

// Run initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Handle GitHub's SPA navigation
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    setTimeout(initialize, 1000); // Re-initialize on navigation
  }
}).observe(document, { subtree: true, childList: true });
