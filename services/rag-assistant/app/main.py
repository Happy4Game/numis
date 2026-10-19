"""Assistant opérateur local (RAG) — aide à comprendre l'incident et à consulter les procédures.

IMPORTANT (sujet §3.3) : cet assistant est DISTINCT du moteur de remédiation. Il ne dispose
d'AUCUN privilège sur le système : il lit seulement la documentation (/docs, monté en lecture
seule) et répond en langage naturel. Il n'exécute jamais d'action.

Pile : Ollama (LLM local ≤ 8B, défaut qwen2.5:3b) + LangChain + Chroma (vecteurs).
"""
import os
import threading
import glob
import logging, json, sys, time

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

SERVICE = "rag-assistant"
_h = logging.StreamHandler(sys.stdout)
class _F(logging.Formatter):
    def format(self, r):
        return json.dumps({"ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(r.created)),
                           "level": r.levelname, "service": SERVICE, "msg": r.getMessage()}, ensure_ascii=False)
_h.setFormatter(_F())
logging.getLogger().handlers = [_h]
logging.getLogger().setLevel(os.getenv("LOG_LEVEL", "INFO").upper())
log = logging.getLogger(SERVICE)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
EMBED_MODEL = os.getenv("EMBED_MODEL", "nomic-embed-text")
DOCS_PATH = os.getenv("DOCS_PATH", "/docs")

app = FastAPI(title="RSA RAG Assistant")
_rag = {"chain": None, "status": "indexing", "chunks": 0, "error": None}


class AskIn(BaseModel):
    question: str


PROMPT = (
    "Tu es l'assistant opérateur de la plateforme RESILIENCE-ALPHA. Réponds en français, "
    "de façon concise et factuelle, EN T'APPUYANT UNIQUEMENT sur le contexte fourni. "
    "Si l'information n'y est pas, dis-le clairement.\n\n"
    "Contexte :\n{context}\n\nQuestion : {question}\nRéponse :"
)


def build_index():
    try:
        from langchain_ollama import ChatOllama, OllamaEmbeddings
        from langchain_chroma import Chroma
        from langchain_community.document_loaders import TextLoader
        from langchain_text_splitters import RecursiveCharacterTextSplitter
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_core.runnables import RunnablePassthrough
        from langchain_core.output_parsers import StrOutputParser

        docs = []
        for path in glob.glob(f"{DOCS_PATH}/**/*.md", recursive=True):
            docs.extend(TextLoader(path, encoding="utf-8").load())
        if not docs:
            _rag.update(status="empty")
            log.warning("aucun document trouvé à indexer")
            return

        splits = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100).split_documents(docs)
        emb = OllamaEmbeddings(base_url=OLLAMA_URL, model=EMBED_MODEL)
        store = Chroma.from_documents(splits, emb, persist_directory="/tmp/chroma")
        retriever = store.as_retriever(search_kwargs={"k": 4})
        llm = ChatOllama(base_url=OLLAMA_URL, model=MODEL, temperature=0.1)
        prompt = ChatPromptTemplate.from_template(PROMPT)

        def fmt(d):
            return "\n\n".join(x.page_content for x in d)

        _rag["chain"] = (
            {"context": retriever | fmt, "question": RunnablePassthrough()}
            | prompt | llm | StrOutputParser()
        )
        _rag.update(status="ready", chunks=len(splits))
        log.info("index prêt", )
    except Exception as e:  # pragma: no cover
        _rag.update(status="error", error=str(e))
        log.error(f"échec indexation: {e}")


@app.on_event("startup")
def _start():
    threading.Thread(target=build_index, daemon=True).start()


@app.get("/health")
def health():
    return {"status": "ok", "index": _rag["status"], "chunks": _rag["chunks"]}


@app.post("/reindex")
def reindex():
    _rag.update(status="indexing")
    threading.Thread(target=build_index, daemon=True).start()
    return {"status": "indexing"}


@app.post("/ask")
def ask(body: AskIn):
    if _rag["status"] != "ready" or _rag["chain"] is None:
        raise HTTPException(503, f"index indisponible (état: {_rag['status']})")
    answer = _rag["chain"].invoke(body.question)
    return {"question": body.question, "answer": answer}
