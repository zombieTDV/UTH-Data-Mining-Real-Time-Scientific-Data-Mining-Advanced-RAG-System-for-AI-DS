class LlmFields:
    LLM_MODE: str = "local"
    LLM_SERVICE_URL: str = "http://localhost:9001/v1"
    OLLAMA_SERVICE_URL: str = "http://localhost:11434/v1"
    LLM_MODEL_PATH: str = "./models/qwen2.5-7b-instruct-q4_k_m/qwen2.5-7b-instruct-q4_k_m.gguf"
    LLM_MAX_TOKENS: int = 1536
    LLM_TEMPERATURE: float = 0.7
    GROQ_API_KEY: str = ""
