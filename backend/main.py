import os
import re
import json
import threading
from typing import List, Optional, AsyncGenerator, Dict, Tuple
import requests
from bs4 import BeautifulSoup
import urllib.parse
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import wikipediaapi
from transformers import pipeline
from transformers.generation.streamers import TextIteratorStreamer


class SearchQuery(BaseModel):
    query: str
    max_results: Optional[int] = 1


class SearchResult(BaseModel):
    title: str
    link: str
    content: str


class LanguageModelPrompt(BaseModel):
    query: str
    titles: List[str]
    links: List[str]
    contents: List[str]


class CitationQuery(BaseModel):
    answer: str
    selection: Tuple[int, int]
    prompt: LanguageModelPrompt


def create_app():
    app = FastAPI(title="Search with AT2 Citations API")

    pid = os.getpid()
    devices = os.environ.get("CUDA_VISIBLE_DEVICES").split(",")
    device = devices[pid % len(devices)]
    os.environ["CUDA_VISIBLE_DEVICES"] = device
    print(f"Worker {pid} using GPU: {device}")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "https://bencw99.github.io",
            "http://localhost:5173",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    return app


app = create_app()


# These imports need to be after the app is created because it sets CUDA_VISIBLE_DEVICES
from at2.utils import get_model_and_tokenizer
from at2.tasks import ContextAttributionTask
from at2 import AT2Attributor, AT2ScoreEstimator


CITATION_THRESHOLD = 0.001
MODEL_NAME = "microsoft/Phi-4-mini-instruct"
HUB_MODEL_NAME = f"madrylab/at2-{MODEL_NAME.split('/')[-1].lower()}"
model, tokenizer = get_model_and_tokenizer(MODEL_NAME)
model.config.use_cache = True
pipe = pipeline("text-generation", model=model, tokenizer=tokenizer)
score_estimator = AT2ScoreEstimator.from_hub(HUB_MODEL_NAME)


class QAAttributionTask(ContextAttributionTask):
    def __init__(self, query, titles, contents, model, tokenizer, **kwargs):
        self.query = query
        self.titles = titles
        self.contents = contents
        super().__init__(model, tokenizer, **kwargs)
        self._prompt, self._document_ranges = self.get_prompt_and_document_ranges()

    def get_prompt_and_document_ranges(self):
        prompt = ""
        document_ranges = []
        for title, content in zip(self.titles, self.contents):
            prompt += f"Title: {title}\nContent: "
            document_ranges.append((len(prompt), len(prompt) + len(content)))
            prompt += f"{content}\n\n"
        prompt += f"Query: {self.query}\n\nAnswer the question based on just the provided documents."
        return prompt, document_ranges

    @property
    def prompt(self) -> str:
        return self._prompt

    def _get_document_ranges(self):
        return self._document_ranges


def create_attribution_task(
    prompt: LanguageModelPrompt,
    generation: Optional[str] = None,
):
    task = QAAttributionTask(
        query=prompt.query,
        titles=prompt.titles,
        contents=prompt.contents,
        model=model,
        tokenizer=tokenizer,
        source_type="sentence",
        generate_kwargs={
            "max_new_tokens": 512,
            "temperature": 0.7,
            "do_sample": True,
        },
    )
    if generation is not None:
        task.set_generation(generation)
    return task


def get_streamer(task: QAAttributionTask):
    _, input_tokens = task.get_input_text_and_tokens(return_tensors="pt")
    streamer = TextIteratorStreamer(
        tokenizer,
        skip_prompt=True,
        skip_special_tokens=True,
    )
    generation_kwargs = {
        **input_tokens.to(model.device),
        **task.generate_kwargs,
        "streamer": streamer,
    }
    thread = threading.Thread(target=model.generate, kwargs=generation_kwargs)
    thread.start()
    return streamer


def parse_search_queries(output_text):
    if "```python" in output_text and "```" in output_text.split("```python", 1)[1]:
        code_content = output_text.split("```python", 1)[1].split("```", 1)[0].strip()

        try:
            if code_content.startswith("\n"):
                code_content = code_content[1:]
            search_queries = eval(code_content)
            return (
                search_queries if isinstance(search_queries, list) else [search_queries]
            )
        except:
            pass

    if "[" in output_text and "]" in output_text:
        list_content = output_text[output_text.find("[") + 1 : output_text.find("]")]
        items = [item.strip().strip("\"'") for item in list_content.split(",")]
        return items

    if "[" in output_text and "]" not in output_text:
        list_content = output_text[output_text.find("[") + 1 :]
        items = [
            item.strip().strip("\"'")
            for item in list_content.split(",")
            if item.strip()
        ]
        return items

    return None


def get_search_queries(query, max_new_tokens=64):
    prompt = f'For the query "{query}", list Wikipedia article titles likely to provide helpful information or necessary context. Respond exclusively with a Python list of relevant Wikipedia article titles, avoiding any additional content.'
    messages = [{"role": "user", "content": prompt}]
    chat_prompt = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True,
    )
    output = pipe(chat_prompt, max_new_tokens=max_new_tokens, do_sample=False)
    output_text = output[0]["generated_text"][len(chat_prompt) :]
    return parse_search_queries(output_text)


wiki_wiki = wikipediaapi.Wikipedia(
    user_agent="Ben Cohen-Wang (bencw@mit.edu)", language="en"
)


def get_wikipedia_page_urls(search_queries):
    urls = {}
    if search_queries is not None:
        for search_query in search_queries:
            if len(search_query.strip()) > 0:
                page = wiki_wiki.page(search_query)
                if page.exists() and page.title not in urls:
                    urls[page.title] = page.fullurl
    return urls


async def fetch_wikipedia_content(wiki_url: str) -> Dict[str, str]:
    """Fetch and parse content from a Wikipedia page."""
    try:
        response = requests.get(wiki_url)
        soup = BeautifulSoup(response.text, "html.parser")

        # Find the main content div which contains the article text
        content = soup.find(id="mw-content-text")

        if not content:
            return {"title": "", "content": ""}

        # Extract all paragraphs
        paragraphs = content.find_all("p")

        # Get the full text by joining paragraphs
        full_text = "\n".join([p.get_text() for p in paragraphs])

        # Remove citations of the form [1], [2], etc.
        full_text = re.sub(r"\[\d+\]|\[citation needed\]", "", full_text)

        # Get the title from the HTML
        title_element = soup.find(id="firstHeading")
        page_title = urllib.parse.unquote(
            wiki_url.split("/wiki/")[-1].replace("_", " ")
        )
        title = title_element.text if title_element else page_title

        return {"title": title, "content": full_text}
    except Exception as e:
        print(f"Error fetching Wikipedia content: {str(e)}")
        return {"title": "", "content": ""}


@app.get("/")
def read_root():
    return {"message": "Welcome to the API for searching with AT2 citations"}


MAX_RESULTS = 3


@app.post("/search", response_model=List[SearchResult])
async def search(query: SearchQuery):
    try:

        async def generate_search_results():
            yield json.dumps({"status": "started"}) + "\n"

            # search_queries = get_search_queries(query.query)
            # print(f"Search queries: {search_queries}")
            # urls = get_wikipedia_page_urls(search_queries)
            # results = [{"href": url, "title": title} for title, url in urls.items()][:MAX_RESULTS]

            # Mock results for testing - in production, use actual search API
            results = [
                {"href": "https://en.wikipedia.org/wiki/Cactus", "title": "Cactus"},
                {"href": "https://en.wikipedia.org/wiki/Saguaro", "title": "Saguaro"},
            ]

            formatted_results = []
            for result in results:
                wiki_url = result.get("href", "")
                if "wikipedia.org" not in wiki_url:
                    continue

                content = await fetch_wikipedia_content(wiki_url)

                if content["content"]:
                    formatted_results.append(
                        SearchResult(
                            title=content["title"],
                            link=wiki_url,
                            content=content["content"],
                        )
                    )

            yield json.dumps(
                {
                    "status": "complete",
                    "results": [result.dict() for result in formatted_results],
                }
            ) + "\n"

        return StreamingResponse(
            generate_search_results(), media_type="application/x-ndjson"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search error: {str(e)}")


# @app.post("/fetch-content")
# async def fetch_content(url: str):
#     try:
#         async with httpx.AsyncClient() as client:
#             response = await client.get(url, follow_redirects=True, timeout=10.0)
#             response.raise_for_status()
#             return {"content": response.text}
#     except Exception as e:
#         raise HTTPException(
#             status_code=500, detail=f"Failed to fetch content: {str(e)}"
#         )


@app.post("/answer")
async def answer(prompt: LanguageModelPrompt):
    try:

        async def generate() -> AsyncGenerator[str, None]:
            yield json.dumps({"status": "started", "text": ""}) + "\n"

            task = create_attribution_task(prompt)
            streamer = get_streamer(task)
            text = ""

            for cur_text in streamer:
                text += cur_text
                response_data = {
                    "token": cur_text,
                    "text": text,
                }
                yield json.dumps(response_data) + "\n"

            yield json.dumps({"status": "complete", "text": text}) + "\n"

        return StreamingResponse(generate(), media_type="application/x-ndjson")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Streaming error: {str(e)}")


@app.post("/get-citations")
async def get_citations(citation_query: CitationQuery):
    try:

        async def generate_citations():
            try:
                yield json.dumps({"status": "started"}) + "\n"

                prompt = citation_query.prompt
                answer = citation_query.answer
                task = create_attribution_task(prompt, generation=answer)
                attributor = AT2Attributor(task, score_estimator)
                start, end = citation_query.selection

                scores = attributor.get_attribution_scores(start=start, end=end)
                citation_indices = [
                    i for i, score in enumerate(scores) if score > CITATION_THRESHOLD
                ]
                citation_indices.sort(key=lambda i: scores[i], reverse=True)
                citations = []
                for source_index in citation_indices:
                    cited_text = attributor.task.get_source(source_index)
                    text_fragment = cited_text.strip()
                    text_fragment = re.sub(r"\s+", " ", text_fragment)
                    encoded_fragment = urllib.parse.quote(text_fragment)
                    document_index = attributor.task._source_to_document[source_index]
                    base_link = prompt.links[document_index]
                    enhanced_link = f"{base_link}#:~:text={encoded_fragment}"

                    citations.append(
                        {
                            "title": prompt.titles[document_index],
                            "link": enhanced_link,
                            "text": cited_text,
                            "score": float(scores[source_index]),
                        }
                    )

                yield json.dumps({"status": "complete", "citations": citations}) + "\n"
            except Exception as e:
                error_message = str(e)
                print(f"Citation generation error: {error_message}")
                yield json.dumps({"status": "error", "error": error_message}) + "\n"

        return StreamingResponse(
            generate_citations(), media_type="application/x-ndjson"
        )
    except Exception as e:
        error_message = str(e)
        print(f"Citation endpoint error: {error_message}")
        raise HTTPException(status_code=500, detail=f"Citation error: {error_message}")


# @app.middleware("http")
# async def catch_exceptions_middleware(request, call_next):
#     try:
#         return await call_next(request)
#     except Exception as e:
#         error_message = f"Unhandled error: {str(e)}"
#         print(error_message)
#         return HTTPException(status_code=500, detail=error_message)


if __name__ == "__main__":
    import uvicorn
    import sys

    try:
        uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
    except KeyboardInterrupt:
        print("Server shutting down gracefully...")
        sys.exit(0)
    except Exception as e:
        print(f"Server crashed with error: {str(e)}")
        sys.exit(1)
