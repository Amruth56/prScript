/**
 * GitHub PR Description Generator - Content Script
 * 
 * This content script runs on GitHub pages and provides functionality to:
 * 1. Extract commit messages from PR pages
 * 2. Send them to an AI service to generate PR descriptions
 * 3. Insert the generated descriptions into GitHub's PR form
 * 4. Provide a user-friendly interface with notifications
 */

// ========================================================================================
// UTILITY FUNCTIONS
// ========================================================================================

/**
 * Waits for a DOM element to appear on the page
 * Useful for GitHub's dynamic content that loads after page load
 * 
 * @param {string} selector - CSS selector for the element to wait for
 * @param {number} timeout - Maximum time to wait in milliseconds (default: 10000)
 * @returns {Promise<Element>} - Promise that resolves with the found element
 */
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    // Check if element already exists
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    // Set up a MutationObserver to watch for DOM changes
    const observer = new MutationObserver((mutations, obs) => {
      const element = document.querySelector(selector);
      if (element) {
        obs.disconnect();
        resolve(element);
      }
    });

    // Start observing the document body for changes
    observer.observe(document.body, {
      childList: true,  // Watch for added/removed child nodes
      subtree: true     // Watch the entire subtree, not just direct children
    });

    // Set timeout to avoid waiting indefinitely
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}

// ========================================================================================
// COMMIT MESSAGE EXTRACTION
// ========================================================================================

/**
 * Extracts commit messages from the current GitHub PR page
 * Uses multiple strategies and fallbacks to handle different GitHub layouts
 * 
 * @returns {Array<string>} - Array of extracted commit message strings
 */
function extractCommitMessages() {
  console.log('PR Script: Starting commit extraction...');
  
  // Define multiple CSS selectors to find commit messages
  // GitHub's structure changes over time, so we try multiple approaches
  const commitSelectors = [
    '.commit-message',              // Main commit message container
    '.commit-title',                // Commit title element
    '[data-testid="commit-message"]', // New GitHub structure with test IDs
    '.js-commit-message',           // JavaScript-loaded commits
    '.commit-summary',              // Summary commits view
    '.commit-desc',                 // Commit description
    'a[href*="/commit/"]'          // Links to individual commits
  ];

  let commits = [];

  // Strategy 1: Try each selector until we find commit messages
  for (const selector of commitSelectors) {
    const elements = document.querySelectorAll(selector);
    console.log(`PR Script: Trying selector "${selector}", found ${elements.length} elements`);
    
    if (elements.length > 0) {
      const extractedTexts = Array.from(elements)
        .map(el => {
          // Extract and clean up text content
          let text = (el.textContent || el.innerText || '').trim();
          
          // Filter out elements that aren't actual commit messages
          if (text.length < 10 ||                    // Too short to be meaningful
              text.includes('files changed') ||      // File change indicators
              text.includes('contributor') ||        // Contributor info
              text.includes('commits') ||            // Commit count indicators
              text.match(/^\d+$/) ||                 // Just numbers
              text.includes('committed') ||          // "X committed Y ago" text
              text.includes('ago')) {                // Time indicators
            return null;
          }
          
          // Clean up the extracted text
          text = text.replace(/\s+/g, ' ');                    // Normalize whitespace
          text = text.replace(/committed.*$/i, '');            // Remove "committed X ago" suffix
          text = text.replace(/^\w+\s+committed\s+/i, '');     // Remove "username committed" prefix
          text = text.replace(/view commit details/i, '');     // Remove UI text
          text = text.trim();
          
          return text.length > 10 ? text : null;
        })
        .filter(text => text !== null && text.length > 0);
      
      // If we found valid commits with this selector, use them
      if (extractedTexts.length > 0) {
        commits = extractedTexts;
        console.log(`PR Script: Found ${commits.length} commits using selector: ${selector}`);
        console.log('PR Script: Extracted commits:', commits);
        break;
      }
    }
  }

  // Strategy 2: Fallback method - extract from commit links
  if (commits.length === 0) {
    console.log('PR Script: Trying fallback method - looking for commit links...');
    
    const commitLinks = document.querySelectorAll('a[href*="/commit/"]');
    console.log(`PR Script: Found ${commitLinks.length} commit links`);
    
    commits = Array.from(commitLinks)
      .map(link => {
        // Try to find the commit message near the link using various parent containers
        const messageEl = link.closest('.commit')?.querySelector('.commit-message') ||
                         link.closest('.commit-group-item')?.querySelector('.commit-message') ||
                         link.querySelector('.commit-message') ||
                         link;
        
        let text = (messageEl.textContent || messageEl.innerText || '').trim();
        
        // Apply the same cleaning process as above
        text = text.replace(/\s+/g, ' ');
        text = text.replace(/committed.*$/i, '');
        text = text.replace(/^\w+\s+committed\s+/i, '');
        text = text.replace(/view commit details/i, '');
        text = text.trim();
        
        return text.length > 10 ? text : null;
      })
      .filter(text => text !== null);
    
    console.log('PR Script: Fallback extracted commits:', commits);
  }

  // Strategy 3: Manual text extraction as last resort
  if (commits.length === 0) {
    console.log('PR Script: Trying manual extraction...');
    
    // Get all text content from the page and parse line by line
    const allText = document.body.textContent || document.body.innerText || '';
    const lines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Filter lines that look like commit messages
    const potentialCommits = lines.filter(line => {
      return line.length > 10 &&              // Minimum length
             line.length < 200 &&             // Maximum length (avoid descriptions)
             !line.includes('files changed') &&
             !line.includes('contributor') &&
             !line.includes('committed') &&
             !line.match(/^\d+$/) &&
             !line.includes('ago') &&
             line.includes(' ');               // Should contain spaces (real sentences)
    });
    
    commits = potentialCommits.slice(0, 10); // Limit to prevent overwhelming results
    console.log('PR Script: Manual extraction found:', commits);
  }

  // Strategy 4: Default fallback if all else fails
  if (commits.length === 0) {
    commits = ['cread and add functionalities for the extension', 'updated testing steps'];
    console.log('PR Script: Using default commits as fallback');
  }

  return commits.slice(0, 10); // Limit to 10 commits maximum to avoid overwhelming the AI
}

/**
 * Checks if we're on the Files tab and attempts to get better diff data
 * GitHub shows more detailed diff information on the Files tab
 * 
 * @returns {boolean} - Whether we're on the Files tab or successfully navigated to it
 */
function ensureFilesTabAccess() {
  // Check if we're already on the Files tab
  const currentUrl = window.location.href;
  if (currentUrl.includes('/files')) {
    console.log('PR Script: Already on Files tab');
    return true;
  }

  // Check if Files tab exists and click it programmatically
  const filesTabSelectors = [
    'a[href*="/files"]',
    '.tabnav-tab[href*="/files"]',
    '.UnderlineNav-item[href*="/files"]',
    'a[data-tab-item="pr-files-tab"]'
  ];

  for (const selector of filesTabSelectors) {
    const filesTab = document.querySelector(selector);
    if (filesTab) {
      console.log('PR Script: Found Files tab, attempting to access it');
      
      // Instead of clicking (which would cause navigation), 
      // let's try to extract the href and see if we should recommend it
      const filesUrl = filesTab.href;
      if (filesUrl) {
        console.log('PR Script: Files tab available at:', filesUrl);
        // For now, we'll work with current page but log that Files tab exists
        return false; // We could navigate but we'll work with what we have
      }
    }
  }

  console.log('PR Script: Files tab not found, working with current page');
  return false;
}

/**
 * Extracts detailed file changes and diffs from the GitHub PR page
 * Analyzes modified files, additions, deletions, and code changes
 * 
 * @returns {Object} - Object containing file changes, stats, and diff information
 */
function extractFileChanges() {
  console.log('PR Script: Starting file changes extraction...');
  
  // Check if we can access better diff data
  ensureFilesTabAccess();
  
  const fileChanges = {
    files: [],
    stats: {
      filesChanged: 0,
      additions: 0,
      deletions: 0
    },
    summary: []
  };

  // Extract file change statistics from the PR header - try multiple approaches
  const statsSelectors = [
    // GitHub's PR summary at the top
    '.pr-toolbar .diffstat-summary strong',
    '.pr-toolbar .color-fg-success, .pr-toolbar .color-fg-danger',
    '.gh-header-meta .color-fg-success, .gh-header-meta .color-fg-danger',
    // Alternative selectors for stats
    '[data-testid="file-changes"] .color-fg-success, [data-testid="file-changes"] .color-fg-danger',
    '.js-details-target .text-green, .js-details-target .text-red',
    '.diffstat .text-green, .diffstat .text-red',
    // Fallback to any green/red numbers
    '.color-fg-success, .color-fg-danger'
  ];

  // Try to extract overall statistics first
  for (const selector of statsSelectors) {
    const statsElements = document.querySelectorAll(selector);
    if (statsElements.length >= 2) { // Need at least additions and deletions
      console.log(`PR Script: Trying stats selector "${selector}", found ${statsElements.length} elements`);
      
      let foundAdditions = false, foundDeletions = false;
      
      Array.from(statsElements).forEach((el, index) => {
        const text = el.textContent.trim();
        const number = parseInt(text.replace(/[^\d]/g, ''));
        
        console.log(`PR Script: Element ${index}: "${text}" -> ${number}`);
        
        if (!isNaN(number) && number > 0) {
          // Determine if it's additions or deletions based on context
          const parent = el.parentElement?.textContent || '';
          const classList = el.className || '';
          
          console.log(`PR Script: Context - parent: "${parent}", class: "${classList}"`);
          
          if (!foundAdditions && (classList.includes('success') || classList.includes('green') || parent.includes('+') || text.includes('+'))) {
            fileChanges.stats.additions = number;
            foundAdditions = true;
            console.log('PR Script: Found additions:', number);
          } else if (!foundDeletions && (classList.includes('danger') || classList.includes('red') || parent.includes('-') || text.includes('−'))) {
            fileChanges.stats.deletions = number;
            foundDeletions = true;
            console.log('PR Script: Found deletions:', number);
          }
        }
      });
      
      if (foundAdditions || foundDeletions) {
        console.log('PR Script: Successfully extracted stats from selector:', selector);
        break;
      }
    }
  }

  // Alternative approach: Extract from summary text
  if (fileChanges.stats.additions === 0 && fileChanges.stats.deletions === 0) {
    console.log('PR Script: Trying text-based stats extraction...');
    
    const summarySelectors = [
      '.pr-toolbar',
      '.gh-header-meta',
      '.js-details-target',
      '.diffstat-summary'
    ];
    
    for (const selector of summarySelectors) {
      const summaryEl = document.querySelector(selector);
      if (summaryEl) {
        const summaryText = summaryEl.textContent;
        console.log('PR Script: Analyzing summary text:', summaryText);
        
        // Look for patterns like "+123 −45"
        const additionMatch = summaryText.match(/\+(\d+)/);
        const deletionMatch = summaryText.match(/−(\d+)|-(\d+)/);
        
        if (additionMatch) {
          fileChanges.stats.additions = parseInt(additionMatch[1]);
          console.log('PR Script: Found additions from text:', fileChanges.stats.additions);
        }
        
        if (deletionMatch) {
          fileChanges.stats.deletions = parseInt(deletionMatch[1] || deletionMatch[2]);
          console.log('PR Script: Found deletions from text:', fileChanges.stats.deletions);
        }
        
        if (additionMatch || deletionMatch) break;
      }
    }
  }

  // Extract individual file changes with improved selectors
  const fileSelectors = [
    '.file-header',
    '.file .file-header',
    '[data-testid="file-change"] .file-header',
    '.js-file .file-header',
    '.file-diff-split .file-header'
  ];

  for (const selector of fileSelectors) {
    const fileHeaders = document.querySelectorAll(selector);
    console.log(`PR Script: Trying file selector "${selector}", found ${fileHeaders.length} files`);
    
    if (fileHeaders.length > 0) {
      Array.from(fileHeaders).forEach(header => {
        const fileInfo = extractSingleFileChange(header);
        if (fileInfo) {
          fileChanges.files.push(fileInfo);
        }
      });
      
      if (fileChanges.files.length > 0) {
        console.log(`PR Script: Successfully extracted ${fileChanges.files.length} file changes`);
        break;
      }
    }
  }

  // Set files changed count
  fileChanges.stats.filesChanged = fileChanges.files.length;

  // If overall stats are still 0, calculate from individual files
  if (fileChanges.stats.additions === 0 && fileChanges.stats.deletions === 0 && fileChanges.files.length > 0) {
    fileChanges.stats.additions = fileChanges.files.reduce((sum, file) => sum + file.additions, 0);
    fileChanges.stats.deletions = fileChanges.files.reduce((sum, file) => sum + file.deletions, 0);
    console.log('PR Script: Calculated stats from files - additions:', fileChanges.stats.additions, 'deletions:', fileChanges.stats.deletions);
  }

  // Extract high-level changes summary
  fileChanges.summary = generateChangeSummary(fileChanges.files);
  
  console.log('PR Script: File changes extraction complete:', fileChanges);
  return fileChanges;
}

/**
 * Extracts information about a single file change
 * 
 * @param {Element} fileHeader - The file header element
 * @returns {Object|null} - File change information or null if extraction fails
 */
function extractSingleFileChange(fileHeader) {
  try {
    const fileInfo = {
      filename: '',
      status: 'modified', // modified, added, deleted, renamed
      additions: 0,
      deletions: 0,
      changes: []
    };

    // Extract filename using multiple approaches
    const filenameSelectors = [
      '.file-info a',
      '.file-header-text',
      '.file-path',
      '[data-testid="file-name"]',
      'a[title]',
      '.file-header .Link--primary', // GitHub's newer structure
      '.file-header a[href*="/blob/"]' // Direct links to files
    ];

    for (const selector of filenameSelectors) {
      const filenameEl = fileHeader.querySelector(selector);
      if (filenameEl) {
        fileInfo.filename = (filenameEl.textContent || filenameEl.title || '').trim();
        if (fileInfo.filename) break;
      }
    }

    if (!fileInfo.filename) {
      // Fallback: extract from any link in the header that looks like a filename
      const links = fileHeader.querySelectorAll('a');
      for (const link of links) {
        const text = link.textContent.trim();
        if (text && text.includes('.') && !text.includes('commit') && text.length < 100) {
          fileInfo.filename = text;
          break;
        }
      }
    }

    // Extract file status (added, modified, deleted, renamed)
    const headerText = fileHeader.textContent.toLowerCase();
    if (headerText.includes('added') || headerText.includes('new file')) {
      fileInfo.status = 'added';
    } else if (headerText.includes('deleted') || headerText.includes('removed')) {
      fileInfo.status = 'deleted';
    } else if (headerText.includes('renamed')) {
      fileInfo.status = 'renamed';
    }

    // Extract line changes (additions/deletions) with improved detection
    const diffStatsSelectors = [
      '.diffstat',
      '.file-diff-stats',
      '.file-header .text-green, .file-header .text-red',
      '.file-header .color-fg-success, .file-header .color-fg-danger'
    ];

    for (const selector of diffStatsSelectors) {
      const diffStats = fileHeader.querySelector(selector);
      if (diffStats) {
        const statsText = diffStats.textContent;
        console.log('PR Script: File stats text:', statsText);
        
        // Try multiple patterns for extracting numbers
        const patterns = [
          /\+(\d+)\s*−(\d+)/, // +123 −45
          /\+(\d+)\s*-(\d+)/, // +123 -45
          /(\d+)\s*addition.*?(\d+)\s*deletion/i, // "123 additions, 45 deletions"
          /(\d+)\s*\+.*?(\d+)\s*-/ // "123+ 45-"
        ];
        
        for (const pattern of patterns) {
          const match = statsText.match(pattern);
          if (match) {
            fileInfo.additions = parseInt(match[1]) || 0;
            fileInfo.deletions = parseInt(match[2]) || 0;
            console.log(`PR Script: Extracted file stats: +${fileInfo.additions} -${fileInfo.deletions}`);
            break;
          }
        }
        
        // If we didn't find both, try individual patterns
        if (fileInfo.additions === 0 && fileInfo.deletions === 0) {
          const addMatch = statsText.match(/\+(\d+)/);
          const delMatch = statsText.match(/−(\d+)|-(\d+)/);
          
          if (addMatch) fileInfo.additions = parseInt(addMatch[1]);
          if (delMatch) fileInfo.deletions = parseInt(delMatch[1] || delMatch[2]);
        }
        
        if (fileInfo.additions > 0 || fileInfo.deletions > 0) break;
      }
    }

    // Alternative approach: Count diff lines if stats not found
    if (fileInfo.additions === 0 && fileInfo.deletions === 0) {
      const diffContainer = fileHeader.closest('.file, .js-file')?.querySelector('.js-file-content, .data, .blob-wrapper');
      if (diffContainer) {
        // Count added and removed lines
        const addedLines = diffContainer.querySelectorAll('.blob-addition, .js-addition, tr[data-line-type="add"], .added');
        const removedLines = diffContainer.querySelectorAll('.blob-deletion, .js-deletion, tr[data-line-type="remove"], .removed');
        
        fileInfo.additions = addedLines.length;
        fileInfo.deletions = removedLines.length;
        
        console.log(`PR Script: Counted diff lines: +${fileInfo.additions} -${fileInfo.deletions}`);
      }
    }

    // Extract actual code changes (if diff is visible)
    const diffContainer = fileHeader.closest('.file, .js-file')?.querySelector('.js-file-content, .data');
    if (diffContainer) {
      fileInfo.changes = extractCodeChanges(diffContainer);
    }

    return fileInfo.filename ? fileInfo : null;
  } catch (error) {
    console.error('PR Script: Error extracting file info:', error);
    return null;
  }
}

/**
 * Extracts specific code changes from a diff container
 * Now captures actual code content with context for AI analysis
 * 
 * @param {Element} diffContainer - The diff container element
 * @returns {Array} - Array of detailed code change objects
 */
function extractCodeChanges(diffContainer) {
  const changes = [];
  
  try {
    console.log('PR Script: Extracting detailed code changes...');
    
    // Look for different types of diff structures
    const diffSelectors = [
      '.blob-code-addition, .blob-code-deletion', // Standard GitHub diff
      '.js-file-line-container', // File line containers
      'tr[data-line-type]', // Table-based diffs
      '.highlight .line' // Highlighted code lines
    ];

    let diffLines = [];
    
    // Try different selectors to find diff lines
    for (const selector of diffSelectors) {
      diffLines = diffContainer.querySelectorAll(selector);
      if (diffLines.length > 0) {
        console.log(`PR Script: Found ${diffLines.length} diff lines using selector: ${selector}`);
        break;
      }
    }

    // Extract meaningful code changes with context
    let currentContext = null;
    let addedChunk = [];
    let removedChunk = [];
    let contextLines = [];

    Array.from(diffLines).forEach((line, index) => {
      const lineText = line.textContent || line.innerText || '';
      const cleanText = lineText.replace(/^\s*[\+\-\s]*\d+\s*/, '').trim(); // Remove line numbers and diff markers
      
      // Skip empty lines and very short lines
      if (cleanText.length < 3) return;
      
      // Determine line type
      const isAddition = line.classList.contains('blob-code-addition') || 
                        line.classList.contains('js-addition') ||
                        line.getAttribute('data-line-type') === 'add' ||
                        lineText.startsWith('+');
                        
      const isDeletion = line.classList.contains('blob-code-deletion') || 
                        line.classList.contains('js-deletion') ||
                        line.getAttribute('data-line-type') === 'remove' ||
                        lineText.startsWith('-');

      const isContext = !isAddition && !isDeletion;

      // Extract meaningful code patterns
      const codePatterns = {
        function: /(?:function|const|let|var)\s+(\w+)|class\s+(\w+)|(\w+)\s*[:=]\s*(?:function|\()/,
        import: /import\s+.*?from\s+['"]([^'"]+)['"]/,
        export: /export\s+(?:default\s+)?(?:function|class|const|let|var)?\s*(\w+)/,
        component: /<(\w+)[^>]*>|React\.createElement\((\w+)/,
        api: /(?:fetch|axios|api)\s*\(\s*['"`]([^'"`]+)['"`]/,
        state: /useState\(|setState\(|this\.state/,
        props: /props\.(\w+)|this\.props\.(\w+)/,
        method: /(\w+)\s*\([^)]*\)\s*{/,
        // Enhanced patterns for better functionality detection
        stateManagement: /useContext\(|createContext\(|useReducer\(|useState\(|zustand|redux|context/i,
        hooks: /use[A-Z]\w*\(|useEffect\(|useMemo\(|useCallback\(/,
        routing: /useRouter\(|useNavigate\(|Route\s+|router\.|navigate\(/,
        styling: /styled\.|css`|className=|\.module\.|tailwind|@apply/,
        database: /prisma\.|mongoose\.|sequelize\.|sql`|query\(/,
        auth: /auth\.|login\(|logout\(|signin\(|authenticate\(/,
        validation: /yup\.|joi\.|zod\.|validate\(|schema\./,
        testing: /test\(|it\(|describe\(|expect\(|jest\.|vitest\./,
        config: /process\.env\.|config\.|\.env|environment/,
        apiIntegration: /axios\.|fetch\(|api\.|endpoint|http\./,
        eventHandling: /onClick|onChange|onSubmit|addEventListener|on[A-Z]/,
        dataFetching: /useQuery\(|useMutation\(|SWR|react-query|apollo/,
        formHandling: /useForm\(|formik|react-hook-form|onSubmit/
      };

      // Identify what type of code this is
      let codeType = 'general';
      let extractedInfo = '';
      let functionalityContext = '';
      
      for (const [type, pattern] of Object.entries(codePatterns)) {
        const match = cleanText.match(pattern);
        if (match) {
          codeType = type;
          extractedInfo = match[1] || match[2] || match[0];
          
          // Add context for better understanding
          if (type === 'stateManagement') {
            if (cleanText.includes('zustand')) functionalityContext = 'Zustand state management';
            else if (cleanText.includes('redux')) functionalityContext = 'Redux state management';
            else if (cleanText.includes('context')) functionalityContext = 'React Context API';
            else if (cleanText.includes('useState')) functionalityContext = 'React local state';
          } else if (type === 'auth') {
            functionalityContext = 'Authentication system';
          } else if (type === 'apiIntegration') {
            functionalityContext = 'API integration';
          } else if (type === 'formHandling') {
            functionalityContext = 'Form handling';
          } else if (type === 'routing') {
            functionalityContext = 'Navigation/routing';
          } else if (type === 'dataFetching') {
            functionalityContext = 'Data fetching';
          }
          
          break;
        }
      }

      if (isAddition) {
        addedChunk.push({
          content: cleanText,
          type: codeType,
          info: extractedInfo,
          context: functionalityContext,
          lineNumber: index
        });
      } else if (isDeletion) {
        removedChunk.push({
          content: cleanText,
          type: codeType,
          info: extractedInfo,
          context: functionalityContext,
          lineNumber: index
        });
      } else if (isContext && cleanText.length > 5) {
        contextLines.push({
          content: cleanText,
          type: codeType,
          info: extractedInfo,
          context: functionalityContext,
          lineNumber: index
        });
      }

      // Process chunks when we hit a context line or end of changes
      if ((isContext || index === diffLines.length - 1) && (addedChunk.length > 0 || removedChunk.length > 0)) {
        const change = {
          type: 'modification',
          context: contextLines.slice(-2), // Last 2 context lines for reference
          added: addedChunk,
          removed: removedChunk,
          summary: generateChangeSummary(addedChunk, removedChunk)
        };
        
        changes.push(change);
        
        // Reset chunks
        addedChunk = [];
        removedChunk = [];
      }
    });

    console.log(`PR Script: Extracted ${changes.length} meaningful code changes`);
    return changes.slice(0, 15); // Limit to prevent overwhelming the AI
    
  } catch (error) {
    console.error('PR Script: Error extracting code changes:', error);
    
    // Fallback: simple text extraction
    return extractSimpleCodeChanges(diffContainer);
  }
}

/**
 * Generates a summary of what changed in a code chunk
 * 
 * @param {Array} added - Added lines
 * @param {Array} removed - Removed lines
 * @returns {string} - Summary of the change
 */
function generateChangeSummary(added, removed) {
  const addedTypes = [...new Set(added.map(a => a.type))];
  const removedTypes = [...new Set(removed.map(r => r.type))];
  const addedContexts = [...new Set(added.map(a => a.context).filter(c => c))];
  const removedContexts = [...new Set(removed.map(r => r.context).filter(c => c))];
  
  // Check for state management changes
  if (addedContexts.some(c => c.includes('state')) || removedContexts.some(c => c.includes('state'))) {
    const addedStateTypes = addedContexts.filter(c => c.includes('state'));
    const removedStateTypes = removedContexts.filter(c => c.includes('state'));
    
    if (addedStateTypes.length > 0 && removedStateTypes.length > 0) {
      return `State management: Changed from ${removedStateTypes.join(', ')} to ${addedStateTypes.join(', ')}`;
    } else if (addedStateTypes.length > 0) {
      return `Added ${addedStateTypes.join(', ')} implementation`;
    } else if (removedStateTypes.length > 0) {
      return `Removed ${removedStateTypes.join(', ')} implementation`;
    }
  }
  
  // Check for authentication changes
  if (addedContexts.includes('Authentication system') || removedContexts.includes('Authentication system')) {
    return 'Updated authentication system implementation';
  }
  
  // Check for API changes
  if (addedContexts.includes('API integration') || removedContexts.includes('API integration')) {
    const apiMethods = added.filter(a => a.type === 'apiIntegration').map(a => a.info);
    if (apiMethods.length > 0) {
      return `API integration: Updated endpoints (${apiMethods.join(', ')})`;
    }
    return 'Updated API integration logic';
  }
  
  // Check for routing changes
  if (addedContexts.includes('Navigation/routing') || removedContexts.includes('Navigation/routing')) {
    return 'Updated navigation and routing implementation';
  }
  
  // Check for form handling changes
  if (addedContexts.includes('Form handling') || removedContexts.includes('Form handling')) {
    return 'Updated form handling and validation logic';
  }
  
  // Check for data fetching changes
  if (addedContexts.includes('Data fetching') || removedContexts.includes('Data fetching')) {
    return 'Updated data fetching and caching logic';
  }
  
  // Function-specific changes
  if (addedTypes.includes('function') || removedTypes.includes('function')) {
    const addedFunctions = added.filter(a => a.type === 'function').map(a => a.info);
    const removedFunctions = removed.filter(r => r.type === 'function').map(r => r.info);
    
    if (addedFunctions.length > 0 && removedFunctions.length === 0) {
      return `Added new functions: ${addedFunctions.join(', ')}`;
    } else if (removedFunctions.length > 0 && addedFunctions.length === 0) {
      return `Removed functions: ${removedFunctions.join(', ')}`;
    } else if (addedFunctions.length > 0 && removedFunctions.length > 0) {
      return `Refactored functions: replaced ${removedFunctions.join(', ')} with ${addedFunctions.join(', ')}`;
    } else {
      return `Modified function implementations`;
    }
  }
  
  // Import/dependency changes
  if (addedTypes.includes('import') || removedTypes.includes('import')) {
    const addedImports = added.filter(a => a.type === 'import').map(a => a.info);
    const removedImports = removed.filter(r => r.type === 'import').map(r => r.info);
    
    if (addedImports.length > 0 && removedImports.length > 0) {
      return `Dependencies: Replaced ${removedImports.join(', ')} with ${addedImports.join(', ')}`;
    } else if (addedImports.length > 0) {
      return `Added new dependencies: ${addedImports.join(', ')}`;
    } else if (removedImports.length > 0) {
      return `Removed dependencies: ${removedImports.join(', ')}`;
    }
  }
  
  // Component changes
  if (addedTypes.includes('component')) {
    const components = added.filter(a => a.type === 'component').map(a => a.info);
    return `Updated React components: ${components.join(', ')}`;
  }
  
  // Configuration changes
  if (addedTypes.includes('config') || removedTypes.includes('config')) {
    return 'Updated configuration and environment settings';
  }
  
  // Styling changes
  if (addedTypes.includes('styling')) {
    return 'Updated styling and UI components';
  }
  
  // Testing changes
  if (addedTypes.includes('testing')) {
    return 'Added/updated test cases and testing logic';
  }
  
  // Generic summary with better context
  if (addedContexts.length > 0) {
    return `Updated ${addedContexts.join(', ').toLowerCase()} implementation`;
  }
  
  // Fallback summaries
  if (added.length > removed.length) {
    return `Added ${added.length} lines of new functionality`;
  } else if (removed.length > added.length) {
    return `Removed ${removed.length} lines of code and refactored implementation`;
  } else {
    return `Refactored ${Math.max(added.length, removed.length)} lines of code`;
  }
}

/**
 * Fallback simple code change extraction
 * 
 * @param {Element} diffContainer - The diff container element
 * @returns {Array} - Array of simple code changes
 */
function extractSimpleCodeChanges(diffContainer) {
  const changes = [];
  
  try {
    // Simple fallback extraction
    const addedLines = diffContainer.querySelectorAll('.blob-addition, .js-addition, tr[data-line-type="add"]');
    const removedLines = diffContainer.querySelectorAll('.blob-deletion, .js-deletion, tr[data-line-type="remove"]');
    
    // Extract meaningful added content
    Array.from(addedLines).slice(0, 10).forEach(line => {
      const content = line.textContent.trim().replace(/^\+\s*/, '');
      if (content && content.length > 10 && !content.match(/^\s*[{}()[\];,]\s*$/)) {
        changes.push({
          type: 'addition',
          content: content,
          context: 'code'
        });
      }
    });

    // Extract meaningful removed content
    Array.from(removedLines).slice(0, 10).forEach(line => {
      const content = line.textContent.trim().replace(/^-\s*/, '');
      if (content && content.length > 10 && !content.match(/^\s*[{}()[\];,]\s*$/)) {
        changes.push({
          type: 'deletion',
          content: content,
          context: 'code'
        });
      }
    });

  } catch (error) {
    console.error('PR Script: Error in simple extraction:', error);
  }
  
  return changes.slice(0, 10);
}

/**
 * Generates a high-level summary of changes based on file modifications
 * 
 * @param {Array} files - Array of file change objects
 * @returns {Array} - Array of summary strings
 */
function generateChangeSummary(files) {
  const summary = [];
  const fileTypes = {};
  const actions = {
    added: [],
    modified: [],
    deleted: [],
    renamed: []
  };

  files.forEach(file => {
    // Categorize by file type
    const ext = file.filename.split('.').pop()?.toLowerCase();
    if (ext) {
      fileTypes[ext] = (fileTypes[ext] || 0) + 1;
    }

    // Categorize by action
    actions[file.status].push(file.filename);
  });

  // Generate summary based on patterns
  if (actions.added.length > 0) {
    summary.push(`Added ${actions.added.length} new file(s): ${actions.added.slice(0, 3).join(', ')}`);
  }
  
  if (actions.modified.length > 0) {
    summary.push(`Modified ${actions.modified.length} file(s): ${actions.modified.slice(0, 3).join(', ')}`);
  }
  
  if (actions.deleted.length > 0) {
    summary.push(`Deleted ${actions.deleted.length} file(s): ${actions.deleted.slice(0, 3).join(', ')}`);
  }

  // Add file type summary
  const topFileTypes = Object.entries(fileTypes)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([type, count]) => `${count} ${type} file(s)`)
    .join(', ');
  
  if (topFileTypes) {
    summary.push(`Primarily affected: ${topFileTypes}`);
  }

  return summary;
}

// ========================================================================================
// UI COMPONENTS
// ========================================================================================

/**
 * Creates and displays a floating button that triggers PR description generation
 * The button appears in the top-right corner of GitHub pages
 */
function createGenerateButton() {
  // Remove any existing button to prevent duplicates
  const existingButton = document.getElementById('pr-script-generate-btn');
  if (existingButton) {
    existingButton.remove();
  }

  // Create the button element
  const button = document.createElement('button');
  button.id = 'pr-script-generate-btn';
  button.innerHTML = '🤖 Generate PR Description';
  
  // Style the button with GitHub-like colors and positioning
  button.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    background: #238636;        /* GitHub green */
    color: white;
    border: none;
    padding: 10px 15px;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    transition: background-color 0.2s;
  `;

  // Add hover effects for better UX
  button.addEventListener('mouseenter', () => {
    button.style.background = '#2ea043';
  });

  button.addEventListener('mouseleave', () => {
    button.style.background = '#238636';
  });

  // Attach click handler for the main functionality
  button.addEventListener('click', generatePRDescription);
  
  // Add button to the page
  document.body.appendChild(button);
}

// ========================================================================================
// PR DESCRIPTION GENERATION
// ========================================================================================

/**
 * Main function that orchestrates the PR description generation process
 * 1. Extracts commit messages from the page
 * 2. Extracts detailed file changes and diffs
 * 3. Sends them to the background script for AI processing
 * 4. Handles user feedback through button state changes
 */
function generatePRDescription() {
  const button = document.getElementById('pr-script-generate-btn');
  const originalText = button.innerHTML;
  
  // Update button to show progress
  button.innerHTML = '⏳ Extracting commits...';
  button.disabled = true;

  // Extract commit messages from the current page
  const commits = extractCommitMessages();
  
  // Check if we successfully found any commits
  if (commits.length === 0) {
    showNotification('No commit messages found. Make sure you\'re on a GitHub PR page with commits.', 'error');
    button.innerHTML = originalText;
    button.disabled = false;
    return;
  }

  console.log('Extracted commits:', commits);
  button.innerHTML = '📁 Analyzing file changes...';

  // Extract detailed file changes and diffs
  const fileChanges = extractFileChanges();

  console.log('Extracted file changes:', fileChanges);
  button.innerHTML = '🤖 Generating detailed description...';

  // Send both commits and file changes to background script for AI processing
  chrome.runtime.sendMessage({
    action: 'generateDescription',
    commits: commits,
    fileChanges: fileChanges,
    detailedAnalysis: true // Flag to indicate we want detailed analysis
  }, (response) => {
    // Reset button state regardless of outcome
    button.innerHTML = originalText;
    button.disabled = false;
    
    // Handle any errors from the background script
    if (response && !response.success) {
      showNotification(`Error: ${response.error}`, 'error');
    }
  });
}

// ========================================================================================
// FORM INTEGRATION
// ========================================================================================

/**
 * Inserts the AI-generated description into GitHub's PR creation form
 * Parses the response to separate title and description, then fills the appropriate fields
 * 
 * @param {string} description - The AI-generated PR description text
 */
function insertDescription(description) {
  try {
    // Parse the AI response to extract title and description
    const lines = description.split('\n');
    let title = '';
    let body = '';
    let isDescription = false;

    // Parse the response format (assuming "Title:" and "Description:" sections)
    for (const line of lines) {
      if (line.startsWith('Title:')) {
        title = line.replace('Title:', '').trim();
      } else if (line.toLowerCase().includes('description:')) {
        isDescription = true;
      } else if (isDescription && line.trim()) {
        body += line + '\n';
      }
    }

    // Fallback parsing: use first line as title if structured parsing fails
    if (!title && lines.length > 0) {
      title = lines[0].trim();
      body = lines.slice(1).join('\n').trim();
    }

    // Find GitHub's PR form fields using multiple possible selectors
    const titleInput = document.querySelector('#pull_request_title, [name="pull_request[title]"], input[placeholder*="title" i]');
    const bodyTextarea = document.querySelector('#pull_request_body, [name="pull_request[body]"], textarea[placeholder*="description" i], textarea[placeholder*="comment" i]');

    // Fill the title field if found
    if (titleInput && title) {
      titleInput.value = title;
      // Trigger events to ensure GitHub's JavaScript detects the change
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Fill the description field if found
    if (bodyTextarea && body) {
      bodyTextarea.value = body;
      // Trigger events to ensure GitHub's JavaScript detects the change
      bodyTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      bodyTextarea.dispatchEvent(new Event('change', { bubbles: true }));
    }

    showNotification('PR description generated successfully!', 'success');
  } catch (error) {
    console.error('Error inserting description:', error);
    showNotification('Error inserting description into form', 'error');
  }
}

// ========================================================================================
// USER FEEDBACK
// ========================================================================================

/**
 * Shows a temporary notification to the user
 * Appears below the generate button with appropriate styling based on message type
 * 
 * @param {string} message - The message to display
 * @param {string} type - Notification type: 'info', 'success', or 'error'
 */
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  
  // Style based on notification type
  const colors = {
    error: '#d73a49',    // Red for errors
    success: '#28a745',  // Green for success
    info: '#0366d6'      // Blue for info
  };
  
  notification.style.cssText = `
    position: fixed;
    top: 80px;                    /* Below the generate button */
    right: 20px;
    z-index: 10001;               /* Above the button */
    padding: 12px 16px;
    border-radius: 6px;
    color: white;
    font-size: 14px;
    max-width: 300px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    background: ${colors[type] || colors.info};
  `;
  
  notification.textContent = message;
  document.body.appendChild(notification);

  // Auto-remove notification after 5 seconds
  setTimeout(() => {
    notification.remove();
  }, 5000);
}

// ========================================================================================
// MESSAGE HANDLING & COMMUNICATION
// ========================================================================================

/**
 * Handles messages from the extension's background script and popup
 * This enables communication between different parts of the Chrome extension
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('PR Script: Received message:', request);
  
  if (request.action === 'insertDescription') {
    // Background script has generated a description, insert it into the form
    insertDescription(request.description);
    
  } else if (request.action === 'showError') {
    // Background script encountered an error, show it to the user
    showNotification(request.error, 'error');
    
  } else if (request.action === 'triggerGeneration') {
    // Popup requested to trigger generation (alternative to clicking button)
    console.log('PR Script: Triggering generation from popup');
    
    // Check if button exists, create it if needed
    const existingButton = document.getElementById('pr-script-generate-btn');
    if (!existingButton) {
      console.log('PR Script: Button not found, creating it first');
      createGenerateButton();
      // Wait for button creation before triggering
      setTimeout(() => {
        generatePRDescription();
      }, 100);
    } else {
      generatePRDescription();
    }
    
    sendResponse({ success: true });
  }
  
  return true; // Keep message channel open for asynchronous responses
});

// ========================================================================================
// INITIALIZATION & PAGE DETECTION
// ========================================================================================

/**
 * Initializes the extension on the current page
 * Checks if we're on a valid GitHub PR page before creating the UI
 */
function initialize() {
  console.log('PR Script: Initializing on URL:', window.location.href);
  
  // Check if we're on a GitHub PR creation or edit page
  const isGitHub = window.location.hostname === 'github.com';
  const isCompare = window.location.pathname.includes('/compare');        // Creating new PR
  const isPullNew = window.location.pathname.includes('/pull/new');       // New PR form
  const isPullEdit = window.location.pathname.includes('/pull/') && 
                     window.location.pathname.includes('/edit');          // Editing existing PR
  
  console.log('PR Script: GitHub check:', { isGitHub, isCompare, isPullNew, isPullEdit });
  
  const isGitHubPR = isGitHub && (isCompare || isPullNew || isPullEdit);

  if (isGitHubPR) {
    console.log('PR Script: Valid GitHub PR page detected, creating button...');
    // Wait for GitHub's dynamic content to load before adding our button
    setTimeout(() => {
      createGenerateButton();
      console.log('PR Script: Button creation attempted');
    }, 2000);
  } else {
    console.log('PR Script: Not a GitHub PR page, skipping button creation');
  }
}

// ========================================================================================
// PAGE LOAD & NAVIGATION HANDLING
// ========================================================================================

// Initialize when page loads (handle both loaded and loading states)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Handle GitHub's Single Page Application (SPA) navigation
// GitHub doesn't do full page reloads when navigating, so we need to detect URL changes
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    // Re-initialize when navigating to a new page
    setTimeout(initialize, 1000);
  }
}).observe(document, { 
  subtree: true,    // Watch entire document tree
  childList: true   // Watch for added/removed elements
});
