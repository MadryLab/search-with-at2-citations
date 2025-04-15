from typing import Tuple, List, Any, Optional
import numpy as np
from at2 import AT2Attributor, AT2ScoreEstimator

from .task import create_attribution_task


ABSOLUTE_THRESHOLD = 0.0005
RELATIVE_THRESHOLD = None


def select_citation_indices(
    scores: List[float],
    absolute_threshold: float = ABSOLUTE_THRESHOLD,
    relative_threshold: Optional[float] = RELATIVE_THRESHOLD,
) -> List[int]:
    max_score = np.max(scores)
    def filter_fn(score: float) -> bool:
        if relative_threshold is None:
            return score >= absolute_threshold
        else:
            return score >= absolute_threshold and score >= max_score * relative_threshold
    return [
        i
        for i, score in enumerate(scores)
        if filter_fn(score)
    ]



def get_at2_citations(
    query: str,
    titles: List[str],
    contents: List[str],
    model: Any,
    tokenizer: Any,
    answer: str,
    selection: Tuple[int, int],
    score_estimator: AT2ScoreEstimator,
    absolute_threshold: float = ABSOLUTE_THRESHOLD,
    relative_threshold: float = RELATIVE_THRESHOLD,
):
    task = create_attribution_task(
        query, titles, contents, model, tokenizer, generation=answer
    )
    attributor = AT2Attributor(task, score_estimator)
    start, end = selection

    scores = attributor.get_attribution_scores(start=start, end=end)
    citation_indices = select_citation_indices(
        scores, absolute_threshold, relative_threshold
    )
    citation_indices.sort(key=lambda i: scores[i], reverse=True)
    citations = []
    for source_index in citation_indices:
        cited_text = attributor.task.get_source(source_index)
        document_index = attributor.task._source_to_document[source_index]

        citations.append(
            {
                "title": titles[document_index],
                "text": cited_text.strip(),
                "score": float(scores[source_index]),
            }
        )
    return citations
