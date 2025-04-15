from typing import Optional
import requests
from bs4 import BeautifulSoup
from tavily import TavilyClient


MAX_RESULTS = 3


def parse_paragraphs(url):
    headers = {
        'User-Agent': (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
            'AppleWebKit/537.36 (KHTML, like Gecko) '
            'Chrome/91.0.4472.124 Safari/537.36'
        )
    }
    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        return None
    soup = BeautifulSoup(response.text, 'html.parser')
    paragraphs = [p.get_text().strip() for p in soup.find_all('p')]
    return "\n\n".join(paragraphs)


def tavily_search(tavily_client: TavilyClient, query: str, max_results: int = MAX_RESULTS, truncate_length: Optional[int] = 20_000):
    response = tavily_client.search(
        query=query,
        include_raw_content=True,
    )

    results = {}
    for result in response["results"]:
        url = result["url"]
        title = result["title"]
        raw_content = result["raw_content"]
        if raw_content is None:
            raw_content = parse_paragraphs(url)
        if raw_content is None:
            raw_content = result["content"]
        if truncate_length is not None:
            raw_content = raw_content[:truncate_length]
        results[url] = {
            "title": title,
            "link": url,
            "content": raw_content,
        }
    results = list(results.values())[:max_results]
    return results
