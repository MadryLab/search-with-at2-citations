import React, { useEffect, useState } from 'react';

const CitationSidebar = ({ citations, onClose, isLoading = false, status = "", debugLog = console.log }) => {
  // If no citations and not loading, don't render anything
  if (!isLoading && (!citations || citations.length === 0)) {
    debugLog('No citations to display');
    return null;
  }

  debugLog('Rendering citation sidebar with', citations?.length || 0, 'citations, isLoading:', isLoading);

  // Handle component lifecycle
  useEffect(() => {
    debugLog('CitationSidebar mounted');
    
    // Add event listener to close sidebar when pressing Escape key
    const handleEscKey = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscKey);
    
    return () => {
      document.removeEventListener('keydown', handleEscKey);
      debugLog('CitationSidebar unmounted');
    };
  }, [onClose, debugLog]);

  // Render a single citation item
  const renderCitationItem = (citation, index) => {
    // Common onClick handler for the entire citation
    const handleClick = () => {
      // Create and dispatch a custom event for highlighting the citation in search results
      const event = new CustomEvent('highlightCitation', {
        detail: {
          citationText: citation.text,
          sourceTitle: citation.title
        }
      });
      document.dispatchEvent(event);
    };
    
    return (
      <div 
        key={index} 
        className="text-sm py-2 border-b border-gray-100 dark:border-gray-800 last:border-0 cursor-pointer group"
        onClick={handleClick}
      >
        {/* Title row with citation number and source */}
        {!citation.isNoCitation && !citation.isError && (
          <div className="flex items-center mb-1.5">
            <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full w-5 h-5 flex items-center justify-center mr-2 flex-shrink-0">
              {index + 1}
            </span>
            <span className="font-medium text-gray-700 dark:text-gray-300">
              From {citation.title && <span className="text-blue-600 dark:text-blue-400">{citation.title}</span>}
            </span>
          </div>
        )}
        
        {/* Citation text using full width */}
        <p className="text-gray-600 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 pl-0.5">
          {citation.text}
        </p>
      </div>
    );
  };

  // Render loading indicator
  const renderLoadingIndicator = () => {
    let message = "Processing citations";
    
    // Show specific message based on status
    if (status === "waiting") {
      message = "Waiting for resources";
    } else if (status === "started") {
      message = "Finding citations";
    } else if (status === "processing") {
      message = "Finding sources";
    }
    
    return (
      <div className="flex flex-col justify-center items-center py-8 space-y-3">
        <p className="text-gray-600 dark:text-gray-400 text-sm">
          {message}
        </p>
        <div className="flex space-x-2">
          <div className="w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full animate-[bounce_0.7s_ease-in-out_infinite_0s]"></div>
          <div className="w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full animate-[bounce_0.7s_ease-in-out_infinite_0.15s]"></div>
          <div className="w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full animate-[bounce_0.7s_ease-in-out_infinite_0.3s]"></div>
        </div>
      </div>
    );
  };

  return (
    <div className="border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 w-full flex-shrink-0 citation-sidebar-container flex flex-col h-full">
      <div className="sticky top-0 bg-gray-50 dark:bg-gray-900 p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center z-10 flex-shrink-0">
        <h3 className="text-md font-medium text-gray-700 dark:text-gray-300">Citations</h3>
        <button 
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
          aria-label="Close citations"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="p-4 space-y-3 citation-content overflow-y-auto max-h-[calc(100vh-70px)] scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
        {isLoading 
          ? renderLoadingIndicator() 
          : citations.map(renderCitationItem)
        }
      </div>
    </div>
  );
};

export default CitationSidebar; 