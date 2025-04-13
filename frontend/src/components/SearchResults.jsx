import React, { useState, useEffect, useRef } from 'react';

// Maximum height for expanded content scrollable area
const MAX_SCROLL_HEIGHT = '300px';

const SearchResults = ({ results }) => {
  const [expandedSnippets, setExpandedSnippets] = useState({});
  const [highlightedText, setHighlightedText] = useState('');
  const contentRefs = useRef({});
  
  // Toggle expanded/collapsed state for a snippet
  const toggleSnippet = (index) => {
    setExpandedSnippets(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  // Handle citation highlight event
  useEffect(() => {
    const handleHighlightCitation = (event) => {
      const { citationText, sourceTitle } = event.detail;
      
      // Find the index of the search result that matches the citation source
      const resultIndex = results.findIndex(result => 
        result.title.toLowerCase() === sourceTitle.toLowerCase());
      
      if (resultIndex !== -1) {
        // Close all other expanded snippets and only keep the target one expanded
        const newExpandedState = {};
        // Set all to closed
        results.forEach((_, idx) => {
          newExpandedState[idx] = false;
        });
        // Set only the target to expanded
        newExpandedState[resultIndex] = true;
        setExpandedSnippets(newExpandedState);
        
        // Set the highlighted text immediately
        setHighlightedText(citationText);
        
        // Handle the scrolling in a more reliable way with proper sequencing
        setTimeout(() => {
          // First, ensure the complete search result is visible in the viewport
          const resultRef = document.getElementById(`search-result-${resultIndex}`);
          if (resultRef) {
            // Calculate position to scroll the window to show the search result with padding
            const rect = resultRef.getBoundingClientRect();
            const targetY = window.pageYOffset + rect.top - 120; // Add padding at the top
            
            // Scroll the window to show the search result
            window.scrollTo({
              top: targetY,
              behavior: 'auto' // Use auto for immediate scroll
            });
            
            // After the outer scroll completes, handle the content scrolling 
            setTimeout(() => {
              if (contentRefs.current[resultIndex]) {
                const contentDiv = contentRefs.current[resultIndex];
                const textContent = contentDiv.textContent;
                const textIndex = textContent.indexOf(citationText);
                
                if (textIndex !== -1) {
                  // Calculate the position to scroll to
                  const approximatePosition = (textIndex / textContent.length) * contentDiv.scrollHeight;
                  const visibleHeight = contentDiv.clientHeight;
                  
                  // Scroll with smooth behavior for better UX
                  contentDiv.scrollTo({
                    top: Math.max(0, approximatePosition - (visibleHeight / 2)),
                    behavior: 'smooth'
                  });
                }
              }
            }, 50); // Short delay to ensure outer scroll completes first
          }
        }, 50); // Short delay to ensure state updates are applied
      }
    };
    
    document.addEventListener('highlightCitation', handleHighlightCitation);
    
    return () => {
      document.removeEventListener('highlightCitation', handleHighlightCitation);
    };
  }, [results]);

  // Get favicon URL for a given website link
  const getFaviconUrl = (link) => {
    try {
      const url = new URL(link);
      return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`;
    } catch (e) {
      // Default favicon if URL parsing fails
      return 'https://www.google.com/s2/favicons?domain=wikipedia.org&sz=32';
    }
  };

  // Highlight specific text in content
  const highlightContent = (content, textToHighlight) => {
    if (!textToHighlight || textToHighlight.length === 0) {
      return <p className="whitespace-pre-line">{content}</p>;
    }
    
    // Escape special regex characters and create a case-insensitive regex
    const escapedText = textToHighlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedText})`, 'gi');
    
    // Handle cases where the exact match might not be found
    if (!content.match(regex)) {
      // Try to find a fuzzy match by looking for longer phrases that contain the search text
      const words = textToHighlight.split(/\s+/);
      if (words.length > 3) {
        // If we have a longer phrase, try matching just the first few words
        const partialPhrase = words.slice(0, 3).join(' ');
        const partialEscaped = partialPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const partialRegex = new RegExp(`(${partialEscaped})`, 'gi');
        
        if (content.match(partialRegex)) {
          // Use the partial match
          const parts = content.split(partialRegex);
          return (
            <p className="whitespace-pre-line">
              {parts.map((part, i) => 
                part.toLowerCase() === partialPhrase.toLowerCase() ||
                part.toLowerCase().includes(partialPhrase.toLowerCase()) ? 
                  <mark key={i} className="bg-yellow-200 dark:bg-yellow-300 px-1 py-0.5 rounded-sm">
                    {part}
                  </mark> : 
                  part
              )}
            </p>
          );
        }
      }
      
      // If no match is found, just return the original content
      return <p className="whitespace-pre-line">{content}</p>;
    }
    
    // Split the text by the regex and create the highlighted elements
    const parts = content.split(regex);
    
    return (
      <p className="whitespace-pre-line">
        {parts.map((part, i) => 
          part.toLowerCase() === textToHighlight.toLowerCase() ? 
            <mark key={i} className="bg-yellow-200 dark:bg-yellow-300 px-1 py-0.5 rounded-sm">
              {part}
            </mark> : 
            part
        )}
      </p>
    );
  };

  // Render a single search result
  const renderSearchResult = (result, index) => {
    const isExpanded = expandedSnippets[index];
    const faviconUrl = getFaviconUrl(result.link);
    const isLastItem = index === results.length - 1;
    
    return (
      <div 
        key={index}
        id={`search-result-${index}`}
        className={`px-4 py-3 ${!isLastItem ? 'border-b border-gray-200 dark:border-gray-700' : ''}`}
      >
        <div className="flex items-center">
          {/* Favicon */}
          <img 
            src={faviconUrl} 
            alt="Site icon" 
            className="w-5 h-5 mr-3"
            onError={(e) => {e.target.src = 'https://www.google.com/s2/favicons?domain=wikipedia.org&sz=32'}}
          />
          
          {/* Title */}
          <h3 className="text-md font-medium text-blue-600 dark:text-blue-400 mr-3 hover:underline flex-shrink-0">
            <a href={result.link} target="_blank" rel="noopener noreferrer">
              {result.title}
            </a>
          </h3>
          
          {/* Link (truncated) */}
          <div className="text-xs text-green-700 dark:text-green-500 truncate flex-grow mx-2 hidden sm:block">
            {result.link}
          </div>
          
          {/* Show more/less button */}
          <button 
            onClick={() => toggleSnippet(index)}
            className="text-blue-500 hover:text-blue-700 text-sm ml-auto flex-shrink-0 focus:outline-none"
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </button>
        </div>
        
        {/* Expandable content */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <div 
              ref={el => contentRefs.current[index] = el}
              className="overflow-y-auto text-sm text-gray-700 dark:text-gray-300" 
              style={{ maxHeight: MAX_SCROLL_HEIGHT }}
            >
              {highlightContent(result.content, highlightedText)}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Clear highlight when results change
  useEffect(() => {
    setHighlightedText('');
  }, [results]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      {results.length > 0 ? (
        results.map(renderSearchResult)
      ) : (
        <div className="text-center text-gray-500 dark:text-gray-400 py-6">
          No results found
        </div>
      )}
    </div>
  );
};

export default SearchResults; 