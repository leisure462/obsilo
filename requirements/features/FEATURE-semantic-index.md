# Feature: Semantic Index & Retrieval
Priority: P1
Related Epic: `requirements/epics/EPIC-vault-ops.md`

## Description
A local-only vector database that indexes the vault's markdown content to enable semantic search ("Find notes about 'concept X' even if they don't use that exact word"). This powers synthesis and broad research workflows.

## Benefits Hypothesis
- Finding relevant information without exact keyword matches is a core "knowledge work" need.
- Local execution guarantees privacy (no data sent to Pinecone/Qdrant cloud).

## User Stories
- As a user, I want to ask "What have I written about 'Project Planning'?" and get relevant notes, even if I called it "Roadmap" or "Strategy".
- As a user, I want this index to update automatically (or on demand) when I change files.
- As a user, I want this to work offline.

## Acceptance Criteria
- [ ] **Indexing:** A background process iterates over markdown files, chunks them, and generates embeddings locally.
- [ ] **Retrieval:** A tool `search_semantic` accepts a query string and returns relevant chunks/files with similarity scores.
- [ ] **Data Persistence:** The index is stored locally (e.g., in `.kilonote/index`) and persists across restarts.
- [ ] **Vector Model:** Uses a small, high-quality local embedding model (e.g., standard ONNX model) compatible with consumer hardware.

## Success Criteria
- SC-01: Retrieval finds relevant notes in < 1 second for a 1k-file vault.
- SC-02: Indexing uses < 20% CPU in background mode so as not to freeze the UI.

## NFRs (quantified)
- **Repo Size:** The on-disk index size should remain reasonable (target < 200MB for typical 5k-note vault).
- **Startup Time:** Loading the index takes < 2 seconds.

## ASRs
🟡 **ASR-03: Local Vector Store Abstraction**
- Must support pluggable local embedding generation and storage to ensure "Local-Only" constraint.

## Dependencies
- Local Vector DB library (e.g., Orama, Voy, or SQLite VSS).
- ONNX Runtime or similar for local inference.
