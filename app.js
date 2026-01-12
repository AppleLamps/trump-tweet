// Trump Twitter Profile Recreation
// Handles loading and displaying tweets with infinite scroll

const TWEETS_PER_PAGE = 20;
const CHUNK_SIZE = 5000; // Load tweets in chunks of 5000
let allTweets = [];
let displayedTweets = []; // Currently displayed tweets (filtered or all)
let currentIndex = 0;
let currentChunk = 0;
let totalChunks = 0;
let isLoading = false;
let isLoadingChunk = false;
let hasLoadError = false;
let totalTweetCount = 0;
let hasFallbackToFullFile = false;
let searchMode = false;
let searchQuery = "";
let searchDebounceTimer = null;

// Format numbers (e.g., 1500 -> 1.5K)
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  }
  return num.toString();
}

// Format date relative to now or as absolute date
function formatDate(timestamp) {
  const date = new Date(timestamp);
  const timeValue = date.getTime();
  if (Number.isNaN(timeValue)) {
    return "Unknown";
  }
  const now = new Date();
  const diffMs = now - date;

  // Handle invalid or future dates
  if (diffMs < 0 || Number.isNaN(diffMs)) {
    return formatAbsoluteDate(date, now);
  }

  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return `${diffSecs}s`;
  } else if (diffMins < 60) {
    return `${diffMins}m`;
  } else if (diffHours < 24) {
    return `${diffHours}h`;
  } else if (diffDays < 7) {
    return `${diffDays}d`;
  } else {
    return formatAbsoluteDate(date, now);
  }
}

function formatAbsoluteDate(date, now) {
  const timeValue = date.getTime();
  if (Number.isNaN(timeValue)) {
    return "Unknown";
  }
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  const currentYear = now.getFullYear();

  if (year === currentYear) {
    return `${month} ${day}`;
  }
  return `${month} ${day}, ${year}`;
}

// Simple hash function for deterministic random values
function hashCode(str) {
  if (str == null) {
    return 0;
  }
  const value = String(str);
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function isValidManifest(manifest) {
  return (
    manifest &&
    Number.isInteger(manifest.totalChunks) &&
    manifest.totalChunks > 0 &&
    Number.isInteger(manifest.totalTweets) &&
    manifest.totalTweets >= 0
  );
}

// Sanitize HTML to prevent XSS - whitelist approach
function sanitizeAndFormatTweet(html) {
  // Create a temporary element to parse HTML
  const temp = document.createElement("div");
  const safeHtml = typeof html === "string" ? html : "";
  temp.innerHTML = safeHtml;

  // Extract text content and rebuild safely
  const result = document.createElement("div");

  function processNode(node, parent) {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.textContent));
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();

      // Handle specific allowed elements
      if (tagName === "p") {
        // Process children, add line break after
        for (const child of node.childNodes) {
          processNode(child, parent);
        }
        parent.appendChild(document.createElement("br"));
      } else if (tagName === "br") {
        parent.appendChild(document.createElement("br"));
      } else if (tagName === "a") {
        // Check if it's a mention, hashtag, or regular link
        const classList = node.className || "";
        const href = node.getAttribute("href") || "#";

        if (classList.includes("mention") || classList.includes("hashtag")) {
          const span = document.createElement("span");
          span.className = classList.includes("hashtag")
            ? "hashtag"
            : "mention";
          span.textContent = node.textContent;
          parent.appendChild(span);
        } else {
          // Regular link - extract visible text
          let linkText = "";
          const visibleSpans = node.querySelectorAll("span:not(.invisible)");
          if (visibleSpans.length > 0) {
            visibleSpans.forEach((s) => {
              if (!s.classList.contains("invisible")) {
                linkText += s.textContent;
              }
            });
          } else {
            linkText = node.textContent;
          }

          linkText = linkText.replace(/https?:\/\//, "");
          if (linkText.length > 35) {
            linkText = linkText.substring(0, 35) + "...";
          }

          const link = document.createElement("a");
          link.href = "#"; // Don't use original href for safety
          link.textContent = linkText;
          link.setAttribute("rel", "noopener noreferrer");
          parent.appendChild(link);
        }
      } else if (tagName === "span") {
        const classList = node.className || "";

        // Skip invisible spans and quote-inline
        if (
          classList.includes("invisible") ||
          classList.includes("quote-inline")
        ) {
          return;
        }

        // Handle h-card mentions
        if (classList.includes("h-card")) {
          const innerLink = node.querySelector("a");
          if (innerLink) {
            const span = document.createElement("span");
            span.className = "mention";
            span.textContent = innerLink.textContent;
            parent.appendChild(span);
          }
          return;
        }

        // Process children for other spans
        for (const child of node.childNodes) {
          processNode(child, parent);
        }
      } else {
        // For other elements, just process children
        for (const child of node.childNodes) {
          processNode(child, parent);
        }
      }
    }
  }

  // Process all children
  for (const child of temp.childNodes) {
    processNode(child, result);
  }

  // Clean up: remove leading/trailing br, collapse multiple br
  let html_result = result.innerHTML;
  html_result = html_result.replace(/^(<br\s*\/?>)+/, "");
  html_result = html_result.replace(/(<br\s*\/?>)+$/, "");
  html_result = html_result.replace(/(<br\s*\/?>){3,}/g, "<br><br>");

  // Remove RT prefix if present
  html_result = html_result.replace(/^RT\s*/, "");

  return html_result;
}

// Create tweet HTML element
function createTweetElement(tweet, highlightText = "") {
  const tweetEl = document.createElement("article");
  tweetEl.className = "tweet";

  const isRetweet = tweet.isRetweet;
  const date = formatDate(tweet.date);
  const likes = formatNumber(tweet.favorites || 0);
  const retweets = formatNumber(tweet.retweets || 0);

  // Use deterministic values based on tweet ID
  const hash = hashCode(tweet.id ?? tweet.date ?? "");
  const views = formatNumber(
    Math.floor((tweet.favorites || 0) * 15 + (hash % 10000)),
  );
  const replies = formatNumber(
    Math.floor((tweet.favorites || 0) * 0.1 + (hash % 100)),
  );

  // Build the tweet structure safely using DOM methods
  if (isRetweet) {
    const retweetIndicator = document.createElement("div");
    retweetIndicator.className = "retweet-indicator";
    retweetIndicator.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"/>
            </svg>
            <span>Donald J. Trump reposted</span>
        `;
    tweetEl.appendChild(retweetIndicator);
  }

  // Create main tweet container
  const tweetMain = document.createElement("div");
  tweetMain.className = "tweet-main";

  // Avatar
  const avatarDiv = document.createElement("div");
  avatarDiv.className = "tweet-avatar";
  const avatarImg = document.createElement("img");
  avatarImg.src = "profile-picture.jpg";
  avatarImg.alt = "Donald J. Trump";
  avatarImg.loading = "lazy";
  avatarImg.onerror = function () {
    this.src =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%2316181c' width='100' height='100'/%3E%3Ctext x='50' y='55' text-anchor='middle' fill='%2371767b' font-size='40'%3EDT%3C/text%3E%3C/svg%3E";
  };
  avatarDiv.appendChild(avatarImg);
  tweetMain.appendChild(avatarDiv);

  // Content container
  const contentDiv = document.createElement("div");
  contentDiv.className = "tweet-content";

  // Header (built with innerHTML since it's static content)
  const headerDiv = document.createElement("div");
  headerDiv.className = "tweet-header";
  headerDiv.innerHTML = `
        <span class="tweet-name">Donald J. Trump</span>
        <svg viewBox="0 0 22 22" width="18" height="18" class="tweet-verified">
            <path fill="#829AAB" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/>
        </svg>
        <span class="tweet-username">@realDonaldTrump</span>
        <span class="tweet-dot">·</span>
        <a href="#" class="tweet-date">${escapeHtml(date)}</a>
        <button class="tweet-more" aria-label="More options">
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 12c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm9 2c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm7 0c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
            </svg>
        </button>
    `;
  contentDiv.appendChild(headerDiv);

  // Tweet text - sanitized and highlighted
  const textDiv = document.createElement("div");
  textDiv.className = "tweet-text";
  let tweetHTML = sanitizeAndFormatTweet(tweet.text);

  // Highlight search terms if in search mode
  if (highlightText && highlightText.trim()) {
    tweetHTML = highlightSearchTerms(tweetHTML, highlightText);
  }

  textDiv.innerHTML = tweetHTML;
  contentDiv.appendChild(textDiv);

  // Actions
  const actionsDiv = document.createElement("div");
  actionsDiv.className = "tweet-actions";
  actionsDiv.innerHTML = `
        <button class="tweet-action reply" aria-label="Reply">
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"/>
            </svg>
            <span>${escapeHtml(replies)}</span>
        </button>
        <button class="tweet-action retweet" aria-label="Repost">
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"/>
            </svg>
            <span>${escapeHtml(retweets)}</span>
        </button>
        <button class="tweet-action like" aria-label="Like">
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"/>
            </svg>
            <span>${escapeHtml(likes)}</span>
        </button>
        <button class="tweet-action views" aria-label="Views">
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z"/>
            </svg>
            <span>${escapeHtml(views)}</span>
        </button>
        <button class="tweet-action share" aria-label="Share">
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z"/>
            </svg>
        </button>
    `;
  contentDiv.appendChild(actionsDiv);

  tweetMain.appendChild(contentDiv);
  tweetEl.appendChild(tweetMain);

  return tweetEl;
}

// Escape HTML for safe insertion
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Highlight search terms in HTML
function highlightSearchTerms(html, searchText) {
  if (!searchText || !searchText.trim()) return html;

  // Create a temporary div to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Get all text nodes
  const walker = document.createTreeWalker(
    temp,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  const textNodes = [];
  let node;
  while (node = walker.nextNode()) {
    textNodes.push(node);
  }

  // Escape regex special characters
  const escapedSearch = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedSearch})`, 'gi');

  // Replace text nodes with highlighted version
  textNodes.forEach(textNode => {
    const text = textNode.textContent;
    if (regex.test(text)) {
      const span = document.createElement('span');
      span.innerHTML = text.replace(regex, '<span class="search-highlight">$1</span>');
      textNode.parentNode.replaceChild(span, textNode);
    }
  });

  return temp.innerHTML;
}

// Search through tweets
function searchTweets(query) {
  if (!query || !query.trim()) {
    // Return to normal mode
    displayedTweets = [];
    searchMode = false;
    searchQuery = "";
    return;
  }

  searchMode = true;
  searchQuery = query.toLowerCase().trim();

  // Filter tweets that contain the search query
  displayedTweets = allTweets.filter(tweet => {
    if (tweet.isDeleted) return false;

    // Search in the text content
    const text = tweet.text ? String(tweet.text).toLowerCase() : '';
    const plainText = text.replace(/<[^>]*>/g, ''); // Strip HTML tags for search
    return plainText.includes(searchQuery);
  });

  // Update results count
  updateSearchResults(displayedTweets.length);

  // Reset index and reload
  currentIndex = 0;
  const container = document.getElementById("tweets-container");
  if (container) {
    container.innerHTML = "";
  }

  loadMoreTweets();
}

// Update search results count
function updateSearchResults(count) {
  const resultsCount = document.getElementById("search-results-count");
  if (resultsCount) {
    if (count === 0) {
      resultsCount.textContent = "No results found";
    } else {
      resultsCount.textContent = `${formatNumber(count)} ${count === 1 ? 'result' : 'results'} found`;
    }
    resultsCount.classList.remove("hidden");
  }
}

// Setup tab switching
function setupTabs() {
  const postsTab = document.getElementById("tab-posts");
  const searchTab = document.getElementById("tab-search");
  const searchPanel = document.getElementById("search-panel");
  const searchInput = document.getElementById("search-input");
  const clearSearchBtn = document.getElementById("clear-search");
  const searchResultsCount = document.getElementById("search-results-count");

  if (!postsTab || !searchTab || !searchPanel || !searchInput) return;

  // Posts tab click
  postsTab.addEventListener("click", () => {
    postsTab.classList.add("active");
    postsTab.setAttribute("aria-selected", "true");
    searchTab.classList.remove("active");
    searchTab.setAttribute("aria-selected", "false");
    searchPanel.classList.add("hidden");

    // Clear search and reset
    if (searchMode) {
      searchInput.value = "";
      searchMode = false;
      searchQuery = "";
      displayedTweets = [];
      currentIndex = 0;

      const container = document.getElementById("tweets-container");
      if (container) {
        container.innerHTML = "";
      }

      loadMoreTweets();
    }
  });

  // Search tab click
  searchTab.addEventListener("click", () => {
    searchTab.classList.add("active");
    searchTab.setAttribute("aria-selected", "true");
    postsTab.classList.remove("active");
    postsTab.setAttribute("aria-selected", "false");
    searchPanel.classList.remove("hidden");

    // Focus on search input
    setTimeout(() => searchInput.focus(), 100);
  });

  // Search input with debounce
  searchInput.addEventListener("input", (e) => {
    const query = e.target.value;

    // Show/hide clear button
    if (clearSearchBtn) {
      if (query.trim()) {
        clearSearchBtn.classList.remove("hidden");
      } else {
        clearSearchBtn.classList.add("hidden");
      }
    }

    // Debounce search
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }

    searchDebounceTimer = setTimeout(() => {
      if (query.trim()) {
        searchTweets(query);
      } else {
        // Reset to all tweets
        searchMode = false;
        searchQuery = "";
        displayedTweets = [];
        currentIndex = 0;

        if (searchResultsCount) {
          searchResultsCount.classList.add("hidden");
        }

        const container = document.getElementById("tweets-container");
        if (container) {
          container.innerHTML = "";
        }

        loadMoreTweets();
      }
    }, 300);
  });

  // Clear search button
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", () => {
      searchInput.value = "";
      clearSearchBtn.classList.add("hidden");
      searchMode = false;
      searchQuery = "";
      displayedTweets = [];
      currentIndex = 0;

      if (searchResultsCount) {
        searchResultsCount.classList.add("hidden");
      }

      const container = document.getElementById("tweets-container");
      if (container) {
        container.innerHTML = "";
      }

      loadMoreTweets();
      searchInput.focus();
    });
  }
}

function setupPlaceholderLinks() {
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const link = event.target.closest('a[href="#"]');
    if (link) {
      event.preventDefault();
    }
  });
}

function renderLoadError(message) {
  const container = document.getElementById("tweets-container");
  if (!container) {
    return;
  }

  let errorEl = document.getElementById("load-error");
  if (!errorEl) {
    errorEl = document.createElement("div");
    errorEl.id = "load-error";
    errorEl.style.padding = "16px";
    errorEl.style.margin = "16px";
    errorEl.style.border = "1px solid var(--border-color)";
    errorEl.style.borderRadius = "12px";
    errorEl.style.textAlign = "center";
    errorEl.style.color = "var(--text-secondary)";
    errorEl.style.background = "var(--bg-secondary)";
    container.appendChild(errorEl);
  }
  errorEl.textContent = message;
}

async function loadAllTweetsFallback(reason) {
  if (hasFallbackToFullFile) {
    return false;
  }
  hasFallbackToFullFile = true;
  hasLoadError = false;
  isLoadingChunk = false;
  currentChunk = 0;
  totalChunks = 0;
  currentIndex = 0;
  allTweets = [];

  const container = document.getElementById("tweets-container");
  if (container) {
    container.innerHTML = "";
  }

  updateLoadingText("Loading tweets...");
  try {
    const response = await fetch("trump_tweets.json");
    if (!response.ok) {
      throw new Error("Failed to load tweets");
    }

    updateLoadingText("Processing tweets...");
    allTweets = await response.json();

    // Sort by date (newest first)
    allTweets.sort((a, b) => b.date - a.date);

    // Filter out deleted tweets for count
    const nonDeletedCount = allTweets.filter((t) => !t.isDeleted).length;

    // Update post count in header
    const postCountEl = document.querySelector(".post-count");
    if (postCountEl) {
      postCountEl.textContent = formatNumber(nonDeletedCount) + " posts";
    }

    updateLoadingText("");
    loadMoreTweets();
    return true;
  } catch (error) {
    console.error("Fallback load failed:", reason, error);
    hasLoadError = true;
    renderLoadError("Failed to load tweets. Please refresh the page.");
    cleanup();
    document.getElementById("loading").classList.add("hidden");
    return false;
  }
}

// Load more tweets from current chunk
function loadMoreTweets() {
  if (isLoading || hasLoadError) return;

  // Determine which tweet array to use
  const tweetsToDisplay = searchMode ? displayedTweets : allTweets;

  // Check if we need to load more chunks (only when not in search mode)
  if (!searchMode && currentIndex >= allTweets.length && currentChunk < totalChunks) {
    loadNextChunk();
    return;
  }

  if (currentIndex >= tweetsToDisplay.length) {
    document.getElementById("loading").classList.add("hidden");
    return;
  }

  isLoading = true;
  const loadingEl = document.getElementById("loading");
  loadingEl.classList.remove("hidden");

  // Use requestAnimationFrame for smoother rendering
  requestAnimationFrame(() => {
    const container = document.getElementById("tweets-container");
    const fragment = document.createDocumentFragment();

    let rendered = 0;
    const endIndex = Math.min(currentIndex + TWEETS_PER_PAGE, tweetsToDisplay.length);

    for (let i = currentIndex; i < endIndex; i++) {
      const tweet = tweetsToDisplay[i];
      // Skip deleted tweets
      if (tweet.isDeleted) continue;

      const tweetEl = createTweetElement(tweet, searchMode ? searchQuery : "");
      fragment.appendChild(tweetEl);
      rendered++;
    }

    container.appendChild(fragment);
    currentIndex = endIndex;
    isLoading = false;

    // Check if we need more chunks (only when not in search mode)
    if (!searchMode && currentIndex >= allTweets.length && currentChunk < totalChunks) {
      // Don't hide loading, we'll load more chunks
    } else if (currentIndex >= tweetsToDisplay.length) {
      loadingEl.classList.add("hidden");
    }
  });
}

// Load next chunk of tweets
async function loadNextChunk() {
  if (isLoadingChunk || currentChunk >= totalChunks || hasLoadError) return;

  isLoadingChunk = true;
  const loadingEl = document.getElementById("loading");
  loadingEl.classList.remove("hidden");

  try {
    const response = await fetch(`tweets/chunk_${currentChunk}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load chunk ${currentChunk}`);
    }

    const chunkData = await response.json();
    allTweets = allTweets.concat(chunkData);
    currentChunk++;
    isLoadingChunk = false;

    // Continue loading tweets
    loadMoreTweets();
  } catch (error) {
    console.error("Error loading chunk:", error);
    if (currentChunk === 0) {
      const fallbackSucceeded = await loadAllTweetsFallback(error);
      if (fallbackSucceeded) {
        return;
      }
    }
    isLoadingChunk = false;
    hasLoadError = true;
    updateLoadingText("Failed to load tweets. Please refresh the page.");
    renderLoadError("Failed to load tweets. Please refresh the page.");
    cleanup();
  }
}

// Setup infinite scroll
let scrollObserver = null;
let scrollFallbackHandler = null;

function setupInfiniteScroll() {
  const loadingEl = document.getElementById("loading");
  if (!loadingEl) {
    return;
  }

  if (!("IntersectionObserver" in window)) {
    const threshold = 400;
    scrollFallbackHandler = () => {
      if (hasLoadError || isLoading || isLoadingChunk) {
        return;
      }
      const scrollPosition = window.innerHeight + window.scrollY;
      const pageHeight = document.documentElement.scrollHeight;
      if (scrollPosition >= pageHeight - threshold) {
        loadMoreTweets();
      }
    };
    window.addEventListener("scroll", scrollFallbackHandler, { passive: true });
    window.addEventListener("resize", scrollFallbackHandler);
    scrollFallbackHandler();
    return;
  }

  const options = {
    root: null,
    rootMargin: "400px",
    threshold: 0,
  };

  scrollObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (
        entry.isIntersecting &&
        !isLoading &&
        !isLoadingChunk &&
        !hasLoadError
      ) {
        loadMoreTweets();
      }
    });
  }, options);

  scrollObserver.observe(loadingEl);
}

// Cleanup function for scroll observers
function cleanup() {
  if (scrollObserver) {
    scrollObserver.disconnect();
    scrollObserver = null;
  }
  if (scrollFallbackHandler) {
    window.removeEventListener("scroll", scrollFallbackHandler);
    window.removeEventListener("resize", scrollFallbackHandler);
    scrollFallbackHandler = null;
  }
}

// Cleanup on page unload
window.addEventListener("beforeunload", cleanup);
window.addEventListener("pagehide", cleanup);

// Update loading text
function updateLoadingText(text) {
  const loadingTextEl = document.getElementById("loading-text");
  if (loadingTextEl) {
    loadingTextEl.textContent = text;
  }
}

// Initialize
async function init() {
  try {
    // Show loading state
    const loadingEl = document.getElementById("loading");
    loadingEl.classList.remove("hidden");
    updateLoadingText("Connecting...");
    setupPlaceholderLinks();
    setupTabs();

    // First, try to load the manifest to see if we have chunked data
    let useChunks = false;
    try {
      updateLoadingText("Loading tweet index...");
      const manifestResponse = await fetch("tweets/manifest.json");
      if (manifestResponse.ok) {
        const manifest = await manifestResponse.json();
        if (isValidManifest(manifest)) {
          totalChunks = manifest.totalChunks;
          totalTweetCount = manifest.totalTweets;
          useChunks = true;

          // Update post count immediately
          const postCountEl = document.querySelector(".post-count");
          if (postCountEl) {
            postCountEl.textContent = formatNumber(totalTweetCount) + " posts";
          }
        } else {
          console.warn(
            "Invalid manifest.json, falling back to full tweet file.",
          );
        }
      }
    } catch (e) {
      // Manifest doesn't exist, fall back to single file
    }

    if (useChunks) {
      // Load first chunk
      updateLoadingText("Loading tweets (1/" + totalChunks + ")...");
      currentChunk = 0;
      await loadNextChunk();
    } else {
      // Fall back to loading the entire file (for backward compatibility)
      updateLoadingText("Loading tweets...");
      const response = await fetch("trump_tweets.json");
      if (!response.ok) {
        throw new Error("Failed to load tweets");
      }

      updateLoadingText("Processing tweets...");
      allTweets = await response.json();

      // Sort by date (newest first)
      allTweets.sort((a, b) => b.date - a.date);

      // Filter out deleted tweets for count
      const nonDeletedCount = allTweets.filter((t) => !t.isDeleted).length;

      // Update post count in header
      const postCountEl = document.querySelector(".post-count");
      if (postCountEl) {
        postCountEl.textContent = formatNumber(nonDeletedCount) + " posts";
      }

      totalChunks = 0; // No more chunks to load
    }

    // Setup infinite scroll
    setupInfiniteScroll();

    // Load initial tweets if not using chunks (chunks auto-load)
    if (!useChunks) {
      loadMoreTweets();
    }

    // Clear loading text after initial load
    updateLoadingText("");
  } catch (error) {
    console.error("Error loading tweets:", error);
    hasLoadError = true;
    renderLoadError("Failed to load tweets. Please refresh the page.");
    cleanup();
    document.getElementById("loading").classList.add("hidden");
  }
}

// Start when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
