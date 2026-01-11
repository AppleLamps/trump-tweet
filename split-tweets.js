// Node.js script to split trump_tweets.json into smaller chunks
// Run with: node split-tweets.js

const fs = require('fs');
const path = require('path');

const CHUNK_SIZE = 5000;
const INPUT_FILE = 'trump_tweets.json';
const OUTPUT_DIR = 'tweets';

console.log('Reading tweets file...');
const tweets = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));

// Sort by date (newest first)
tweets.sort((a, b) => b.date - a.date);

// Filter out deleted tweets for the count
const nonDeletedTweets = tweets.filter(t => !t.isDeleted);
console.log(`Total tweets: ${tweets.length}`);
console.log(`Non-deleted tweets: ${nonDeletedTweets.length}`);

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

// Split into chunks
const totalChunks = Math.ceil(tweets.length / CHUNK_SIZE);
console.log(`Splitting into ${totalChunks} chunks of ${CHUNK_SIZE} tweets each...`);

for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, tweets.length);
    const chunk = tweets.slice(start, end);

    const outputFile = path.join(OUTPUT_DIR, `chunk_${i}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(chunk));

    const sizeKB = (fs.statSync(outputFile).size / 1024).toFixed(1);
    console.log(`  Created ${outputFile} (${chunk.length} tweets, ${sizeKB} KB)`);
}

// Create manifest
const manifest = {
    totalTweets: nonDeletedTweets.length,
    totalChunks: totalChunks,
    chunkSize: CHUNK_SIZE,
    createdAt: new Date().toISOString()
};

const manifestFile = path.join(OUTPUT_DIR, 'manifest.json');
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
console.log(`\nCreated ${manifestFile}`);

console.log('\nDone! You can now deploy the site with chunked loading.');
console.log('The original trump_tweets.json is kept for backward compatibility.');
