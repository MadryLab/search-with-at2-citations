import React, { useState, useEffect } from 'react';

// Maximum length for snippet preview
const MAX_SNIPPET_LENGTH = 300;
// Maximum height for expanded content scrollable area
const MAX_SCROLL_HEIGHT = '300px';

const SearchResults = ({ results }) => {
  const [expandedSnippets, setExpandedSnippets] = useState({});
  const [truncatedSnippets, setTruncatedSnippets] = useState({});
  
  // Process snippets when results change
  useEffect(() => {
    processTruncatedSnippets();
  }, [results]);
  
  // Process snippets for truncation
  const processTruncatedSnippets = () => {
    const truncated = {};
    
    results.forEach((result, index) => {
      if (result.content && result.content.length > MAX_SNIPPET_LENGTH) {
        truncated[index] = {
          text: result.content.substring(0, MAX_SNIPPET_LENGTH) + '...',
          isTruncated: true
        };
      } else {
        truncated[index] = {
          text: result.content,
          isTruncated: false
        };
      }
    });
    
    setTruncatedSnippets(truncated);
    // Reset expanded state when results change
    setExpandedSnippets({});
  };

  // Toggle expanded/collapsed state for a snippet
  const toggleSnippet = (index) => {
    setExpandedSnippets(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  // Render a single search result
  const renderSearchResult = (result, index) => {
    const isExpanded = expandedSnippets[index];
    const snippetInfo = truncatedSnippets[index] || { text: result.content, isTruncated: false };
    
    return (
      <div 
        key={index} 
        className="border rounded-lg shadow-sm p-4 mb-4 bg-white dark:bg-gray-800 dark:border-gray-700"
      >
        <div>
          <div className="text-sm text-green-700 dark:text-green-500 mb-1 truncate">
            {result.link}
          </div>
          <h3 className="text-xl font-medium text-blue-600 dark:text-blue-400 mb-2 hover:underline">
            <a href={result.link} target="_blank" rel="noopener noreferrer">
              {result.title}
            </a>
          </h3>
          <div className="text-sm text-gray-700 dark:text-gray-300">
            {isExpanded ? (
              <div 
                className="overflow-y-auto" 
                style={{ maxHeight: MAX_SCROLL_HEIGHT }}
              >
                <p className="whitespace-pre-line">{result.content}</p>
              </div>
            ) : (
              <p>{snippetInfo.text}</p>
            )}
            {snippetInfo.isTruncated && (
              <button 
                onClick={() => toggleSnippet(index)}
                className="text-blue-500 hover:text-blue-700 text-sm mt-2 focus:outline-none"
              >
                {isExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {results.map(renderSearchResult)}
    </div>
  );
};

export default SearchResults; 