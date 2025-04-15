from at2.tasks import ContextAttributionTask
from typing import Optional, List, Any


GENERATE_KWARGS = {
    "max_new_tokens": 512,
    "temperature": 0.7,
    "do_sample": True,
}
SOURCE_TYPE = "sentence"


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
    query: str,
    titles: List[str],
    contents: List[str],
    model: Any,
    tokenizer: Any,
    generation: Optional[str] = None,
):
    task = QAAttributionTask(
        query=query,
        titles=titles,
        contents=contents,
        model=model,
        tokenizer=tokenizer,
        source_type=SOURCE_TYPE,
        generate_kwargs=GENERATE_KWARGS,
    )
    if generation is not None:
        task.set_generation(generation)
    return task
