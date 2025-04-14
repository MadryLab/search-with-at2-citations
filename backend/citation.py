from typing import Tuple, List, Any
from at2 import AT2Attributor, AT2ScoreEstimator

from .task import create_attribution_task


CITATION_THRESHOLD = 0.001


def get_citations(
    query: str,
    titles: List[str],
    links: List[str],
    contents: List[str],
    model: Any,
    tokenizer: Any,
    answer: str,
    selection: Tuple[int, int],
    score_estimator: AT2ScoreEstimator,
    citation_threshold: float = CITATION_THRESHOLD,
):
    task = create_attribution_task(query, titles, contents, model, tokenizer, generation=answer)
    attributor = AT2Attributor(task, score_estimator)
    start, end = selection

    scores = attributor.get_attribution_scores(start=start, end=end)
    citation_indices = [
        i for i, score in enumerate(scores) if score > citation_threshold
    ]
    citation_indices.sort(key=lambda i: scores[i], reverse=True)
    citations = []
    for source_index in citation_indices:
        cited_text = attributor.task.get_source(source_index)
        text_fragment = cited_text.strip()
        document_index = attributor.task._source_to_document[source_index]

        citations.append(
            {
                "title": titles[document_index],
                "text": cited_text,
                "score": float(scores[source_index]),
            }
        )
    return citations
