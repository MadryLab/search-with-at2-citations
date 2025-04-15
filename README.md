# Search with AT2 Citations

An application mimicking LLM-powered search engines with citations provided by [AT2](https://github.com/MadryLab/AT2.git).
Given a search query, this application

1. Invokes the [Tavily](https://tavily.com) API to retrieve relevant web pages.
2. Uses an LLM (by default, Microsoft's [Phi-4-mini-instruct](https://huggingface.co/microsoft/Phi-4-mini-instruct)) to respond to the query given information from the relevant web pages.
3. Provides citations, i.e., references to the part of the web pages used by the model, for any part of the response.

## Prerequisites

Running this application requires the following:

- Node.js
- npm
- Python
- [Tavily API key](https://tavily.com/) for search
- GPU with CUDA support for running the LLM

## Installation

### Clone the repository

```bash
git clone https://github.com/MadryLab/search-with-at2-citations.git
cd search-with-at2-citations
```

### Backend Setup

1. Navigate to the backend directory:

```bash
cd backend
```

2. Install the required Python packages:

```bash
pip install -r requirements.txt
```

3. Set your Tavily API key by adding the following to your `.bashrc` or equivalent:

```bash
export TAVILY_API_KEY="your_tavily_api_key_here"
```

### Frontend Setup

1. Navigate to the frontend directory:

```bash
cd ../frontend
```

2. Install the required Node.js packages:

```bash
npm install
```

## Running the Application

You can run both the backend and frontend with the `run.sh` script provided in the root directory:

```bash
./run.sh
```

The frontend will be available at: http://localhost:3000

## API Endpoints

- `GET /`: Welcome message
- `POST /search`: Search for information using the Tavily API
- `POST /answer`: Generate an AI answer based on search results
- `POST /get-citations`: Get citations for a generated answer
