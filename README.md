# PR Script - Auto PR Description Generator

A Chrome extension that automatically generates GitHub pull request titles and descriptions from commit messages using AI (DeepSeek Chat v3).

## Features

- 🤖 **AI-Powered**: Uses DeepSeek Chat v3 model via OpenRouter API
- 🚀 **One-Click Generation**: Simple button to generate PR descriptions
- 📝 **Smart Parsing**: Extracts commit messages from GitHub PR pages
- 🎯 **Auto-Fill**: Automatically fills PR title and description fields
- 🔧 **Pre-configured**: Ready to use with included API key
- 💰 **Free**: Uses free tier of DeepSeek model

## Installation

1. **Download/Clone** this repository to your local machine
2. **Open Chrome** and navigate to `chrome://extensions/`
3. **Enable Developer mode** (toggle in top-right corner)
4. **Click "Load unpacked"** and select the `prScript` folder
5. **Pin the extension** to your toolbar for easy access

## Usage

### Method 1: Using the Floating Button (Recommended)
1. Navigate to any GitHub repository
2. Start creating a new pull request or compare branches
3. Look for the **"🤖 Generate PR Description"** button in the top-right corner
4. Click the button and wait for the AI to generate your PR description
5. The title and description will be automatically filled in the form

### Method 2: Using the Extension Popup
1. Navigate to a GitHub PR creation page
2. Click the extension icon in your toolbar
3. Click **"Generate for Current Page"**
4. The description will be generated and filled automatically

## How It Works

1. **Extracts Commits**: Scans the GitHub page for commit messages
2. **AI Processing**: Sends commit messages to DeepSeek Chat v3 model
3. **Smart Formatting**: AI generates a professional title and description
4. **Auto-Fill**: Automatically populates the GitHub PR form

## API Configuration

The extension comes pre-configured with a DeepSeek API key, so it works out of the box! 

If you want to use your own API key:
1. Get a free API key from [OpenRouter.ai](https://openrouter.ai)
2. Open the extension popup
3. Expand "Change API Key (Optional)"
4. Enter your key and click Save

## Supported GitHub Pages

- `/compare/*` - Branch comparison pages
- `/pull/new/*` - New pull request pages  
- `/pull/*/edit` - Edit existing pull request pages

## Troubleshooting

### "No commit messages found"
- Make sure you're on a GitHub PR page with visible commits
- Try refreshing the page and waiting a moment for GitHub to load
- Check that there are actual commits in your branch comparison

### "API Error"
- Check your internet connection
- The free API has rate limits - wait a moment and try again
- If using a custom API key, verify it's valid

### Button not appearing
- Make sure you're on a supported GitHub page
- Try refreshing the page
- Check that the extension is enabled in `chrome://extensions/`

## Development

### File Structure
```
prScript/
├── manifest.json       # Extension configuration
├── background.js       # Service worker for API calls
├── content.js         # Injected script for GitHub pages
├── popup.html         # Extension popup interface
├── popup.js           # Popup functionality
├── style.css          # Popup styling
└── README.md          # This file
```

### Key Features
- **Manifest V3**: Uses the latest Chrome extension format
- **OpenRouter Integration**: Leverages OpenRouter's API for AI access
- **GitHub DOM Parsing**: Robust commit message extraction
- **Error Handling**: Comprehensive error messages and fallbacks
- **Modern UI**: Clean, GitHub-inspired design

## Contributing

Feel free to submit issues, feature requests, or pull requests to improve this extension!

## License

This project is open source and available under the MIT License.