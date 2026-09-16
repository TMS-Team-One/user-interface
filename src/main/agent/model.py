from __future__ import annotations

import os
from typing import Any

from langchain.chat_models import init_chat_model
from langchain_core.language_models.chat_models import BaseChatModel


DEFAULT_PROVIDER = "openai"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"

# Alternatives
# Anthropic
# - pip install langchain-anthropic
# - provider="anthropic", model="claude-haiku-4-5-20251001"
# Google
# - pip install langchain-google-genai
# - provider="google_genai", model="gemini-3.5-flash-lite"


def create_chat_model(*, provider: str | None = None, model: str | None = None, **model_options: Any) -> BaseChatModel:
    """Create a LangChain chat model without coupling the graph to a provider."""
    selected_provider = provider or os.getenv(
        "PROBE_PILOT_MODEL_PROVIDER", DEFAULT_PROVIDER
    )
    selected_model = model or os.getenv(
        "PROBE_PILOT_MODEL",
        DEFAULT_OPENAI_MODEL if selected_provider == "openai" else "",
    )
    if not selected_model:
        raise ValueError("A model name is required for non-OpenAI providers.")
    if selected_provider == "openai" and not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError(
            "OPENAI_API_KEY is missing. Add it to the project .env file before using Chat."
        )

    return init_chat_model(
        model=selected_model,
        model_provider=selected_provider,
        **model_options,
    )
