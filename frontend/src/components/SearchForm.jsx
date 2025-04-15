import React, { useState } from 'react';

// Default search query
const DEFAULT_QUERY = 'How does GPT-4.5 compare to o3-mini?';
// const DEFAULT_QUERY = 'Which is taller: the Empire State Building or 10 blue whales?';

const SearchForm = ({ onSearch, isProcessing }) => {
  const [query, setQuery] = useState(DEFAULT_QUERY);

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim() && !isProcessing) {
      onSearch(query);
    }
  };

  // Render search input with button
  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask a question..."
            className="w-full p-4 pl-5 pr-16 text-base border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
            disabled={isProcessing}
            required
          />
          <button
            type="submit"
            className={`absolute right-2 top-1/2 transform -translate-y-1/2 ${
              isProcessing 
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            } text-white p-2 rounded-full transition-colors duration-300 w-10 h-10 flex items-center justify-center`}
            aria-label="Search"
            disabled={isProcessing}
          >
            {isProcessing ? (
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SearchForm; 
