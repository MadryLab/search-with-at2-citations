import React, { useState, useEffect, useRef } from 'react';
import SearchForm from './components/SearchForm';
import SearchResults from './components/SearchResults';
import Answer from './components/Answer';

// Configuration
const API_URL = import.meta.env.VITE_API_URL || '/api';
const DEBUG_MODE = true;

// Debug logging utility
const createDebugLogger = () => {
  return (...args) => {
    if (DEBUG_MODE) {
      console.log('[DEBUG]', ...args);
    }
  };
};

// Helper function to format rate limit error messages
const formatRateLimitError = (response, data) => {
  const retryAfter = response.headers.get('Retry-After') || '60';
  const seconds = parseInt(retryAfter);
  
  let timeMessage;
  if (seconds < 60) {
    timeMessage = `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  } else {
    const minutes = Math.ceil(seconds / 60);
    timeMessage = `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  
  return `Rate limit exceeded. Please try again in ${timeMessage}.`;
};

function App() {
  // State management
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAnswerBox, setShowAnswerBox] = useState(false);
  const [isWaitingForResources, setIsWaitingForResources] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Reference to the search results section
  const searchResultsRef = useRef(null);

  const debugLog = createDebugLogger();

  useEffect(() => {
    let resizeTimer;
    const handleResize = () => {
      document.body.classList.remove('ready');
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        document.body.classList.add('ready');
      }, 100);
    };
    window.addEventListener('resize', handleResize);
    document.body.classList.add('ready');
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimer);
    };
  }, []);

  // Listen for citation highlight events to scroll to search results
  useEffect(() => {
    const handleCitationHighlight = () => {
      // Ensure search results are visible by scrolling to them
      if (searchResultsRef.current) {
        // We don't need to do the scrolling here as the SearchResults component now handles it
        // This avoids competing scroll operations
      }
    };

    document.addEventListener('highlightCitation', handleCitationHighlight);
    
    return () => {
      document.removeEventListener('highlightCitation', handleCitationHighlight);
    };
  }, []);

  const resetState = () => {
    setSearchResults([]);
    setAnswer('');
    setError('');
    setShowAnswerBox(false);
  };

  const createSearchStreamProcessor = () => {
    let buffer = '';
    
    const processBuffer = (input) => {
      if (input) buffer += input;
      let finalResults = null;
      
      try {
        let lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const data = JSON.parse(line);
            if (data.status === 'started') {
              setIsWaitingForResources(false);
            } else if (data.status === 'complete' && data.results) {
              setSearchResults(data.results);
              setIsWaitingForResources(false);
              finalResults = data.results;
            }
          } catch (parseError) {
            console.error('Error parsing JSON line:', parseError);
          }
        }
        
        return finalResults;
      } catch (e) {
        console.error('Error processing search response:', e);
        buffer = '';
        return null;
      }
    };
    
    return processBuffer;
  };

  const handleSearch = async (searchQuery) => {
    if (isProcessing) {
      return;
    }

    setQuery(searchQuery);
    setLoading(true);
    setIsProcessing(true);
    resetState();
    
    // Start in waiting state
    setIsWaitingForResources(true);
    
    // Clear previous results after a short delay to allow for transition
    setTimeout(() => {
      if (loading) {
        setSearchResults([]);
      }
    }, 300);
    
    try {
      debugLog('Sending search request to API');
      
      // Use fetch API for streaming support
      const response = await fetch(`${API_URL}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: searchQuery,
          max_results: 3
        }),
      });
      
      if (!response.ok) {
        // Handle rate limiting error specifically
        if (response.status === 429) {
          const data = await response.json();
          throw new Error(formatRateLimitError(response, data));
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      debugLog('Stream response received, status:', response.status);
      
      // Get a reader from the response body stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let finalResults = null;
      
      // Create our buffered processor
      const processChunk = createSearchStreamProcessor();
      
      // Read the stream
      while (true) {
        const { value, done } = await reader.read();
        
        if (done) {
          // Streaming complete
          debugLog('Search streaming complete');
          break;
        }
        
        // Decode the chunk and process it
        const chunk = decoder.decode(value, { stream: true });
        debugLog('Received search chunk, length:', chunk.length);
        
        // Process the search stream chunk
        const results = processChunk(chunk);
        if (results) {
          finalResults = results;
        }
      }
      
      // Automatically generate answer after search results are received
      if (finalResults && finalResults.length > 0) {
        debugLog('Auto-generating answer with', finalResults.length, 'sources');
        // Pass the original searchQuery and results directly to handleAnswer to avoid state timing issues
        handleAnswerWithResults(searchQuery, finalResults);
      } else if (searchResults.length > 0) {
        // Fallback to using state if finalResults not available
        debugLog('Using state searchResults for answer generation');
        handleAnswerWithResults(searchQuery, searchResults);
      } else {
        debugLog('No search results found to generate an answer');
        setError('No results found. Please try a different search query.');
        setIsWaitingForResources(false);
        setIsProcessing(false);
      }
    } catch (err) {
      debugLog('Search error:', err);
      setError(err.message || 'Failed to search. Please try again.');
      console.error(err);
      setIsWaitingForResources(false);
      setIsProcessing(false);
    } finally {
      setLoading(false);
    }
  };

  // New function to handle answer generation with provided results
  const handleAnswerWithResults = (searchQuery, results) => {
    if (!results || results.length === 0) {
      setError('No sources available to generate an answer.');
      setIsWaitingForResources(false);
      setIsProcessing(false);
      return;
    }

    debugLog('Generating answer with', results.length, 'sources for query:', searchQuery);
    setIsGenerating(true);
    // Make sure isProcessing is set to true for the answer generation phase
    setIsProcessing(true);
    // Start in waiting state for answer generation
    setIsWaitingForResources(true);
    
    // Show the answer box immediately
    setShowAnswerBox(true);
    // Only reset answer-related state, not the showAnswerBox
    setError('');
    setAnswer('');
    
    try {
      // Collect content, titles, and links from all sources
      const contents = results.map(source => source.content);
      const titles = results.map(source => source.title);
      const links = results.map(source => source.link);
      
      debugLog('Context contents:', contents.map(c => c.substring(0, 30) + '...'));
      
      // Continue with the existing answer generation code - use the original searchQuery
      generateAnswer(searchQuery, titles, links, contents);
    } catch (err) {
      // Use the actual error message instead of a generic message
      setError(err.message || 'Failed to prepare answer generation. Please try again.');
      console.error(err);
      debugLog('Answer preparation error:', err);
      setIsGenerating(false);
      setIsWaitingForResources(false);
      setIsProcessing(false); // Reset processing flag on error
    }
  };

  // Buffered processor for answer generation stream
  const createAnswerStreamProcessor = () => {
    let buffer = '';
    
    const processBuffer = (input) => {
      if (input) buffer += input;
      
      try {
        // Split buffer by newlines and process each complete JSON object
        let lines = buffer.split('\n');
        // Save the last potentially incomplete line for next time
        buffer = lines.pop() || '';
        
        // Process each complete line as a JSON object
        for (const line of lines) {
          // Skip empty lines
          if (!line.trim()) continue;
          
          try {
            const data = JSON.parse(line);
            debugLog('Parsed answer data:', data);
            
            // Handle status updates from the backend
            if (data.status) {
              if (data.status === 'started') {
                // Backend has started processing
                setIsWaitingForResources(false);
              }
            }
            
            // Update the answer with the latest text
            if (data.text) {
              setAnswer(data.text);
            }
            
            // When we receive the last chunk, mark generation as complete
            if (data.status === 'complete') {
              setIsGenerating(false);
              setIsWaitingForResources(false);
              debugLog('Answer generation complete');
            }
          } catch (parseError) {
            console.error('Error parsing JSON line:', parseError);
            debugLog('Parse error:', parseError.message);
            debugLog('Problematic line:', line.substring(0, 100) + (line.length > 100 ? '...' : ''));
            // Continue processing other lines
          }
        }
      } catch (e) {
        console.error('Error processing answer response:', e);
        debugLog('Process error:', e.message);
        debugLog('Buffer excerpt:', buffer.substring(0, 100) + '...');
        
        // In case of error, reset the buffer
        buffer = '';
      }
    };
    
    // Return the processor function that maintains buffer state
    return processBuffer;
  };

  // Extract the actual answer generation logic to a separate function
  const generateAnswer = async (query, titles, links, contents) => {
    try {
      const requestData = {
        query,
        titles,
        links,
        contents
      };
      
      const response = await fetch(`${API_URL}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });
      
      if (!response.ok) {
        // Handle rate limiting error specifically
        if (response.status === 429) {
          const data = await response.json();
          throw new Error(formatRateLimitError(response, data));
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      debugLog('Stream response received, status:', response.status);
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      // Create buffered processor for the answer stream
      const processChunk = createAnswerStreamProcessor();
      
      while (true) {
        const { value, done } = await reader.read();
        
        if (done) {
          // Streaming complete
          debugLog('Streaming complete');
          setIsGenerating(false);
          setIsWaitingForResources(false);
          setIsProcessing(false);
          break;
        }
        
        // Decode the chunk and process it
        const chunk = decoder.decode(value, { stream: true });
        debugLog('Received answer chunk, length:', chunk.length);
        
        // Process with the buffered processor
        processChunk(chunk);
      }
      
    } catch (err) {
      // Use the actual error message instead of a generic message
      setError(err.message || 'Failed to generate answer. Please try again.');
      console.error(err);
      debugLog('Answer generation error:', err);
      setIsGenerating(false);
      setIsWaitingForResources(false);
      setIsProcessing(false);
    }
  };

  // Render loading indicator with appropriate message
  const renderLoadingIndicator = () => {
    const message = isWaitingForResources ? "Waiting for resources" : "Searching";
    
    return (
      <div className="flex flex-col justify-center items-center mt-8 space-y-3">
        {message && (
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            {message}
          </p>
        )}
        <div className="flex space-x-2">
          <div className="w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full animate-[bounce_0.7s_ease-in-out_infinite_0s]"></div>
          <div className="w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full animate-[bounce_0.7s_ease-in-out_infinite_0.15s]"></div>
          <div className="w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full animate-[bounce_0.7s_ease-in-out_infinite_0.3s]"></div>
        </div>
      </div>
    );
  };

  // Render search section
  const renderSearchSection = () => (
    <div className="max-w-3xl mx-auto mt-8 relative">
      <div className={`text-center transition-all duration-300 ease-in-out absolute top-0 left-0 right-0 ${searchResults.length === 0 && !loading ? 'opacity-100 max-h-[200px] mb-6 z-10' : 'opacity-0 max-h-0 overflow-hidden pointer-events-none'}`}>
        <h1 className="text-4xl font-bold text-blue-600 dark:text-blue-400 mb-4">Search with <span className="text-purple-600 dark:text-purple-400 font-['Roboto Mono']">AT2</span> citations</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">See the sources that a model <strong>uses</strong> to answer your questions</p>
      </div>
      
      <div className={`transition-transform duration-300 ease-in-out ${searchResults.length === 0 && !loading ? 'translate-y-[160px]' : 'translate-y-0'}`}>
        <SearchForm onSearch={handleSearch} isProcessing={isProcessing} />
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mt-4" role="alert">
            <div className="flex items-start">
              <div className="flex-shrink-0 mt-0.5">
                <svg className="h-5 w-5 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-9v4a1 1 0 11-2 0v-4a1 1 0 112 0zm0-4a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium">Error</h3>
                <p className="mt-1 text-sm">{error}</p>
              </div>
            </div>
          </div>
        )}
        
        <div className={`transition-opacity duration-300 ${loading ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>
          {renderLoadingIndicator()}
        </div>
      </div>
    </div>
  );

  // Render results section
  const renderResultsSection = () => (
    <div 
      ref={searchResultsRef}
      className={`max-w-3xl mx-auto mt-4 transition-all duration-300 ease-in-out ${searchResults.length > 0 && !loading ? 'opacity-100 visible' : 'opacity-0 invisible h-0 overflow-hidden'}`}
    >
      <div className="mb-2">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Found {searchResults.length} results for "{query}"
        </p>
      </div>
      <SearchResults results={searchResults} />
    </div>
  );

  // Render answer section
  const renderAnswerSection = () => (
    (showAnswerBox) && (
      <div className="max-w-3xl mx-auto mt-4">
        <Answer 
          answer={answer} 
          sources={searchResults} 
          query={query} 
          isGenerating={isGenerating} 
          isWaitingForResources={isWaitingForResources}
          onRegenerate={() => {
            // Reuse the existing sources to regenerate the answer
            if (searchResults.length > 0) {
              debugLog('Regenerating answer with existing sources');
              // Collect content, titles, and links from all sources
              const contents = searchResults.map(source => source.content);
              const titles = searchResults.map(source => source.title);
              const links = searchResults.map(source => source.link);
              
              // Reset answer state
              setAnswer('');
              setIsGenerating(true);
              setIsWaitingForResources(true);
              setIsProcessing(true); // Set isProcessing to true to prevent new searches during regeneration
              
              // Generate a new answer with the same sources
              generateAnswer(query, titles, links, contents);
            }
          }}
          debugLog={debugLog}
        />
      </div>
    )
  );

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="flex-grow container mx-auto px-4 py-8">
        {renderSearchSection()}
        {renderResultsSection()}
        {renderAnswerSection()}
      </main>
    </div>
  );
}

export default App; 