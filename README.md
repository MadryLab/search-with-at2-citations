# QA Citations Application

A minimal application for question answering with citations using LLMs. This application uses DuckDuckGo for search and Microsoft's Phi-4-mini model for generating answers with proper citations.

## Features

- Search for relevant information using DuckDuckGo
- Select relevant sources to use as context
- Generate answers to questions using Phi-4-mini
- Properly cite sources in the answers
- Clean, modern UI with dark mode support

## Project Structure

```
qa-citations/
├── backend/             # FastAPI backend
│   ├── main.py          # Main API endpoints
│   ├── requirements.txt # Python dependencies
│   └── run.sh           # Script to run the backend
└── frontend/            # React frontend
    ├── src/             # React source code
    ├── index.html       # HTML entry point
    ├── package.json     # NPM dependencies
    └── vite.config.js   # Vite configuration
```

## Setup and Running

### Backend

1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

3. Run the backend server:
   ```
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```
   Or use the provided script:
   ```
   ./run.sh
   ```

### Frontend

1. Navigate to the frontend directory:
   ```
   cd frontend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Run the development server:
   ```
   npm run dev
   ```

## API Endpoints

- `GET /`: Welcome message
- `POST /search`: Search for relevant information
- `POST /fetch-content`: Fetch content from a URL
- `POST /answer`: Generate an answer based on the provided context with proper citations

## Technologies Used

- **Backend**: FastAPI, Transformers, DuckDuckGo Search
- **Frontend**: React, Vite, Tailwind CSS
- **Models**: Microsoft Phi-4-mini

## License

MIT 

## Citation Feature

The QA Citations system includes a powerful citation feature that allows users to see the source of information for any part of the generated answer:

1. **Text Selection**: Simply highlight any text in the answer to see relevant citations from the source documents.
2. **Citation Popup**: A popup will appear showing which sources contain information related to the selected text.
3. **Source Linking**: Each citation includes a link to the original source for further reading.

### How It Works

The citation system uses a combination of techniques to match answer text with relevant source content:

- Text matching to find direct quotes or paraphrased content
- Semantic similarity to identify conceptually related information
- Entity recognition to link named entities to their source mentions

### Implementation Details

The citation system is implemented in `backend/citer.py` with a clean abstraction that can be extended with more sophisticated matching algorithms. 