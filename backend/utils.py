import threading
from transformers.generation.streamers import TextIteratorStreamer
from at2.tasks import ContextAttributionTask


def get_streamer(task: ContextAttributionTask):
    _, input_tokens = task.get_input_text_and_tokens(return_tensors="pt")
    streamer = TextIteratorStreamer(
        task.tokenizer,
        skip_prompt=True,
        skip_special_tokens=True,
    )
    generation_kwargs = {
        **input_tokens.to(task.model.device),
        **task.generate_kwargs,
        "streamer": streamer,
    }
    thread = threading.Thread(target=task.model.generate, kwargs=generation_kwargs)
    thread.start()
    return streamer