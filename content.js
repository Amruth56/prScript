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
  const commitSelectors = [
    '.commit-message a.message', // Old GitHub structure
    '.commit-message .message', // Alternative structure
    '[data-testid="commit-message"]', // New GitHub structure
    '.js-commit-message', // JavaScript-loaded commits
    '.commit-title', // Another possible selector
    '.commit-summary' // Summary commits
  ];

  let commits = [];

  // Try different selectors to find commit messages
  for (const selector of commitSelectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      commits = Array.from(elements)
        .map(el => el.textContent || el.innerText)
        .map(text => text.trim())
        .filter(text => text.length > 0);
      
      if (commits.length > 0) {
        console.log(`Found ${commits.length} commits using selector: ${selector}`);
        break;
      }
    }
  }

  // Fallback: look for any element containing commit-like text
  if (commits.length === 0) {
    const allElements = document.querySelectorAll('*');
    for (const element of allElements) {
      const text = element.textContent || element.innerText;
      if (text && text.includes('commit') && text.length < 200) {
        // This is a very basic fallback - you might need to refine this
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        if (lines.length > 0) {
          commits.push(...lines.slice(0, 10)); // Limit to 10 potential commits
        }
      }
    }
  }

  return commits.slice(0, 20); // Limit to 20 commits max
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
  if (request.action === 'insertDescription') {
    insertDescription(request.description);
  } else if (request.action === 'showError') {
    showNotification(request.error, 'error');
  } else if (request.action === 'triggerGeneration') {
    // Triggered from popup
    generatePRDescription();
  }
});

// Initialize when page loads
function initialize() {
  // Check if we're on a GitHub PR creation or edit page
  const isGitHubPR = window.location.hostname === 'github.com' && 
    (window.location.pathname.includes('/compare') || 
     window.location.pathname.includes('/pull/new') ||
     window.location.pathname.includes('/pull/') && window.location.pathname.includes('/edit'));

  if (isGitHubPR) {
    // Wait a bit for GitHub's dynamic content to load
    setTimeout(() => {
      createGenerateButton();
    }, 2000);
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
