from tavily import TavilyClient


MAX_RESULTS = 5


def tavily_search(tavily_client: TavilyClient, query: str, max_results: int = MAX_RESULTS):
    response = tavily_client.search(
        query=query,
        include_raw_content=True,
    )

    results = {}
    for result in response["results"]:
        results[result["url"]] = {
            "title": result["title"],
            "link": result["url"],
            "content": result["raw_content"],
        }
    results = list(results.values())[:max_results]
    return results
