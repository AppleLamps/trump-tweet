import base64
import json

import requests


def test_msearch_index_in_url():
    url = "https://thorin-us-east-1.searchly.com/trump_tweets/_msearch"
    creds = "public-key:mfpzsrhddvm7f54ctotnjbhqczu0z35t"
    encoded_creds = base64.b64encode(creds.encode()).decode()

    headers = {
        "Authorization": f"Basic {encoded_creds}",
        "Content-Type": "application/x-ndjson",
        "X-Search-Client": "ReactiveSearch",
        "Origin": "https://www.thetrumparchive.com",
        "Referer": "https://www.thetrumparchive.com/",
    }

    # ReactiveSearch format
    body = '{}\n{"query":{"match_all":{}},"size":1}\n'

    print(f"Testing _msearch with index in URL...")
    response = requests.post(url, data=body, headers=headers, timeout=30)
    print(f"Status: {response.status_code}")
    print(response.text)


if __name__ == "__main__":
    test_msearch_index_in_url()
