import requests
import json
import base64

def check_fields():
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

    # Query for non-retweets
    body = '{}\n{"query":{"term":{"isRetweet":false}},"size":5}\n'

    response = requests.post(url, data=body, headers=headers, timeout=30)
    if response.status_code == 200:
        data = response.json()
        print(json.dumps(data, indent=2))
    else:
        print(f"Error: {response.status_code}")

if __name__ == "__main__":
    check_fields()
