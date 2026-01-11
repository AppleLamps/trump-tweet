# Trump Twitter Archive

A recreation of Donald Trump's Twitter/X profile page, displaying an archive of tweets with infinite scroll functionality.

## Features

- Faithful recreation of the X (Twitter) profile UI
- Infinite scroll loading with chunked data for performance
- Responsive design
- Sanitized tweet content to prevent XSS
- Retweet indicators
- Relative and absolute date formatting

## Project Structure

```
├── index.html              # Main HTML page
├── app.js                  # Tweet loading and rendering logic
├── styles.css              # X-style CSS
├── trump_tweets.json       # Full tweet archive (fallback)
├── tweets/                 # Chunked tweet data for performance
│   ├── manifest.json       # Chunk metadata
│   └── chunk_*.json        # Individual tweet chunks
├── profile-picture.jpg     # Profile image
├── banner-picture.jpg      # Banner image
├── vercel.json             # Vercel deployment config
├── split-tweets.js         # Script to split tweets into chunks
└── post-puller-script/     # Scripts for fetching tweet data
```

## Setup

1. Clone the repository
2. Serve the files with any static file server

Using Python:
```bash
python -m http.server 8000
```

Using Node.js:
```bash
npx serve
```

3. Open `http://localhost:8000` in your browser

## Deployment

The project is configured for Vercel deployment. Simply connect your repository to Vercel for automatic deployments.

## Data Processing

The `post-puller-script/` directory contains utilities for fetching and processing tweet data:

- `scrape_tweets.py` - Fetch tweets from source
- `clean_empty_text.py` - Clean up tweet data
- `check_fields.py` - Validate tweet fields

To split the main tweet file into chunks for better performance:
```bash
node split-tweets.js
```

## License

This project is for educational and archival purposes.
