import os
import json
from typing import List, Optional, AsyncGenerator, Tuple
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from tavily import TavilyClient

from .rate_limiter import RateLimiter, create_rate_limiter
from .search import tavily_search


# Rate limits in requests per hour
RATE_LIMIT_SEARCH = 20
RATE_LIMIT_ANSWER = 100
RATE_LIMIT_CITATIONS = 500
# Language model for generating answers
MODEL_NAME = "microsoft/Phi-4-mini-instruct"
HUB_MODEL_NAME = f"madrylab/at2-{MODEL_NAME.split('/')[-1].lower()}"


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
        allow_origins=["https://bencw99.github.io"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    return app


app = create_app()
rate_limiter = RateLimiter()


# These imports need to be after the app is created because it sets CUDA_VISIBLE_DEVICES
from .task import create_attribution_task
from .utils import get_streamer
from .citation import get_at2_citations
from at2.utils import get_model_and_tokenizer
from at2 import AT2ScoreEstimator


model, tokenizer = get_model_and_tokenizer(MODEL_NAME)
model.config.use_cache = True
score_estimator = AT2ScoreEstimator.from_hub(HUB_MODEL_NAME)
tavily_api_key = os.environ.get("TAVILY_API_KEY")
tavily_client = TavilyClient(api_key=tavily_api_key)


@app.get("/")
def read_root():
    return {"message": "Welcome to the API for searching with AT2 citations"}


@app.middleware("http")
async def add_rate_limit_headers(request: Request, call_next):
    response = await call_next(request)

    if hasattr(request.state, "rate_limit_headers"):
        for header_name, header_value in request.state.rate_limit_headers.items():
            response.headers[header_name] = header_value

    return response


@app.post("/search", response_model=List[SearchResult])
async def search(
    query: SearchQuery,
    _: str = Depends(create_rate_limiter(rate_limiter, RATE_LIMIT_SEARCH, endpoint="search")),
):
    try:

        async def generate_search_results():
            yield json.dumps({"status": "started"}) + "\n"

            results = tavily_search(tavily_client, query.query)
            results = [SearchResult(**result).model_dump() for result in results]
            yield json.dumps(
                {
                    "status": "complete",
                    "results": results,
                }
            ) + "\n"

        return StreamingResponse(
            generate_search_results(), media_type="application/x-ndjson"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search error: {str(e)}")


@app.post("/answer")
async def answer(
    prompt: LanguageModelPrompt,
    _: str = Depends(create_rate_limiter(rate_limiter, RATE_LIMIT_ANSWER, endpoint="answer")),
):
    try:

        async def generate() -> AsyncGenerator[str, None]:
            yield json.dumps({"status": "started", "text": ""}) + "\n"

            task = create_attribution_task(
                prompt.query, prompt.titles, prompt.contents, model, tokenizer
            )
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
async def get_citations(
    citation_query: CitationQuery,
    _: str = Depends(create_rate_limiter(rate_limiter, RATE_LIMIT_CITATIONS, endpoint="citations")),
):
    try:

        async def generate_citations():
            try:
                yield json.dumps({"status": "started"}) + "\n"

                prompt = citation_query.prompt
                citations = get_at2_citations(
                    query=prompt.query,
                    titles=prompt.titles,
                    contents=prompt.contents,
                    model=model,
                    tokenizer=tokenizer,
                    answer=citation_query.answer,
                    selection=citation_query.selection,
                    score_estimator=score_estimator,
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
