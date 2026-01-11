import requests
import json
import base64
import time
import os

def scrape_all_tweets():
    url = "https://thorin-us-east-1.searchly.com/trump_tweets/_msearch"
    creds = "public-key:mfpzsrhddvm7f54ctotnjbhqczu0z35t"
    encoded_creds = base64.b64encode(creds.encode()).decode()
    
    headers = {
        "Authorization": f"Basic {encoded_creds}",
        "Content-Type": "application/x-ndjson",
        "X-Search-Client": "ReactiveSearch",
        "Origin": "https://www.thetrumparchive.com",
        "Referer": "https://www.thetrumparchive.com/"
    }
    
    output_file = "trump_tweets.json"
    all_tweets = []
    page_size = 1000
    search_after = None
    
    total_scraped = 0
    
    print(f"Starting scrape into {output_file}...")
    
    while True:
        query = {
            "size": page_size,
            "query": {"match_all": {}},
            "sort": [
                {"date": "desc"},
                {"_id": "desc"}
            ]
        }
        
        if search_after:
            query["search_after"] = search_after
            
        body = f'{{}}\n{json.dumps(query)}\n'
        
        try:
            response = requests.post(url, data=body, headers=headers, timeout=30)
            if response.status_code != 200:
                print(f"Error: Received status code {response.status_code}")
                print(response.text)
                break
                
            data = response.json()
            if 'responses' not in data or not data['responses']:
                print("Error: Invalid response structure")
                break
                
            res0 = data['responses'][0]
            if 'error' in res0:
                print(f"Error in Elasticsearch: {res0['error']}")
                break
                
            hits = res0['hits']['hits']
            if not hits:
                print("No more hits found. Scraping complete.")
                break
                
            batch_tweets = [hit['_source'] for hit in hits]
            all_tweets.extend(batch_tweets)
            total_scraped += len(batch_tweets)
            
            print(f"Scraped {total_scraped} tweets so far...")
            
            # Update search_after for next page
            search_after = hits[-1].get('sort')
            
            # Optional: Add a small delay to be polite to the server
            time.sleep(0.5)
            
            # For testing/safety, let's limit to a large number or just let it run
            # The archive has around 50k-60k tweets usually.
            
        except Exception as e:
            print(f"An error occurred: {e}")
            break
            
    # Save to JSON file
    print(f"Saving {len(all_tweets)} tweets to {output_file}...")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_tweets, f, indent=2, ensure_ascii=False)
    
    print("Done!")

if __name__ == "__main__":
    scrape_all_tweets()
