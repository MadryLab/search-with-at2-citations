import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import CitationSidebar from './CitationSidebar';
import nlp from 'compromise';

// Configuration
const API_URL = import.meta.env.VITE_API_URL || '/api';

// Helper function to improve sentence splitting
const splitIntoSentences = (text) => {
  if (!text) return [];
  
  const doc = nlp(text);
  const sentencesArray = doc.sentences().out('array');
  
  const sentences = [];
  let currentPosition = 0;
  
  for (const sentence of sentencesArray) {
    const sentenceStart = text.indexOf(sentence, currentPosition);
    if (sentenceStart !== -1) {
      const sentenceEnd = sentenceStart + sentence.length;
      
      sentences.push({
        text: sentence,
        start: sentenceStart,
        end: sentenceEnd
      });
      
      currentPosition = sentenceEnd;
    }
  }
  
  return sentences;
};

const Answer = ({ answer, sources, query, isGenerating, isWaitingForResources, processingState, onRegenerate, debugLog = console.log }) => {
  // State management
  const [isExpanded, setIsExpanded] = useState(true);
  const [sentences, setSentences] = useState([]);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(null);
  const [citations, setCitations] = useState([]);
  const [showCitations, setShowCitations] = useState(false);
  const [isLoadingCitations, setIsLoadingCitations] = useState(false);
  const [citationStatus, setCitationStatus] = useState(""); // Track the citation status
  const answerRef = useRef(null);
  
  // Process answer text when it changes
  useEffect(() => {
    debugLog('Answer component received new answer or sources');
    if (answer) {
      // Only process into sentences when not streaming
      if (!isGenerating) {
        // Use our improved sentence splitting function
        const extractedSentences = splitIntoSentences(answer);
        setSentences(extractedSentences);
      }
    }
    
    if (!isGenerating) {
      setShowCitations(false);
      setCitations([]);
      setActiveSentenceIndex(null);
    }
  }, [answer, isGenerating, debugLog]);

  // Process answer into sentences when generation completes
  useEffect(() => {
    if (!isGenerating && answer) {
      debugLog('Generation completed, processing answer into sentences');
      // Use our improved sentence splitting function
      const extractedSentences = splitIntoSentences(answer);
      setSentences(extractedSentences);
    }
  }, [isGenerating, answer, debugLog]);

  // Fetch citations for a specific sentence
  const fetchCitations = async (sentenceText, sentenceIndex) => {
    try {
      debugLog('Fetching citations for sentence:', sentenceText);
      
      // Set loading state
      setIsLoadingCitations(true);
      setCitationStatus("waiting"); // Set initial status to waiting
      
      let start, end;
      
      if (isGenerating) {
        // During streaming, we still need to find the position in the current answer
        start = Math.max(0, answer.indexOf(sentenceText));
        end = start + sentenceText.length;
        
        // If can't find exact match (streaming might have partial sentences), use best guess
        if (start < 0) {
          // As a fallback, just use the whole answer
          start = 0;
          end = answer.length;
        }
      } else {
        // Use the position information directly from our sentence objects
        const sentence = sentences[sentenceIndex];
        if (sentence) {
          start = sentence.start;
          end = sentence.end;
        } else {
          // Fallback if sentence not found
          start = 0;
          end = answer.length;
        }
      }
      
      // Prepare request data
      const requestData = {
        answer: answer,
        selection: [start, end],
        prompt: {
          query: query,
          titles: sources.map(source => source.title),
          links: sources.map(source => source.link),
          contents: sources.map(source => source.content || '')
        }
      };
      
      // Use fetch for streaming support
      const response = await fetch(`${API_URL}/get-citations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // Get a reader from the response body stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      // Create our buffered processor for citations
      const processChunk = createCitationStreamProcessor();
      
      // Read the stream
      while (true) {
        const { value, done } = await reader.read();
        
        if (done) {
          // Streaming complete
          debugLog('Citation streaming complete');
          break;
        }
        
        // Decode the chunk and process it
        const chunk = decoder.decode(value, { stream: true });
        debugLog('Received citation chunk:', chunk.substring(0, 50) + '...');
        
        processChunk(chunk);
      }
    } catch (error) {
      debugLog('Error fetching citations:', error);
      setCitations([{
        title: "Error",
        link: "#",
        text: "Error fetching citations. Please try again.",
        isError: true
      }]);
      setIsLoadingCitations(false);
    }
  };
  
  // Create buffered processor for citation streaming
  const createCitationStreamProcessor = () => {
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
            debugLog('Parsed citation data:', data);
            
            // Handle status updates
            if (data.status) {
              // Update the citation status based on backend status
              setCitationStatus(data.status);
              
              if (data.status === 'started' || data.status === 'processing') {
                // Keep loading, but we're no longer waiting for resources
                debugLog(`Citation status: ${data.status}`);
              }
              else if (data.status === 'complete' && data.citations) {
                // We received the citations
                if (data.citations.length > 0) {
                  setCitations(data.citations);
                } else {
                  // No citations found
                  setCitations([{
                    title: "No Citations",
                    link: "#",
                    text: "No citations found.",
                    isNoCitation: true
                  }]);
                }
                setIsLoadingCitations(false);
                setCitationStatus("");
              }
            }
          } catch (parseError) {
            console.error('Error parsing citation JSON line:', parseError);
            debugLog('Citation parse error:', parseError.message);
            debugLog('Problematic line:', line.substring(0, 100) + (line.length > 100 ? '...' : ''));
            // Continue processing other lines
          }
        }
      } catch (e) {
        console.error('Error processing citation response:', e);
        debugLog('Process error:', e.message);
        debugLog('Buffer excerpt:', buffer.substring(0, 100) + '...');
        
        // In case of error, reset the buffer
        buffer = '';
      }
    };
    
    // Return the processor function that maintains buffer state
    return processBuffer;
  };
  
  // Process streaming response chunks for citations (deprecated - kept for compatibility)
  const processCitationStreamChunk = (chunk) => {
    // This function is kept for backward compatibility
    // Create and use our buffered processor for a one-time processing
    const processChunk = createCitationStreamProcessor();
    processChunk(chunk);
  };
  
  // Handle sentence hover
  const handleSentenceHover = (index) => {
    // Only change hover state if we're not showing citations
    if (!showCitations && index !== activeSentenceIndex) {
      setActiveSentenceIndex(index);
    }
  };

  // Handle sentence click
  const handleSentenceClick = async (sentenceText, index, event) => {
    // If we're already showing citations for this sentence, close it
    if (showCitations && activeSentenceIndex === index) {
      closeCitations();
      return;
    }
    
    // Show the sidebar immediately with loading state
    setShowCitations(true);
    
    // Keep track of which sentence is active (even when mouse leaves)
    setActiveSentenceIndex(index);
    
    // Fetch citations for the selected sentence
    await fetchCitations(sentenceText, index);
  };

  // Close citations sidebar
  const closeCitations = () => {
    debugLog('Closing citations sidebar');
    setShowCitations(false);
    setCitations([]);
    setIsLoadingCitations(false);
    setCitationStatus("");
    setActiveSentenceIndex(null); // Reset the active sentence when closing
    
    // Restore any scroll behavior that might have been affected
    document.body.style.overflow = '';
  };

  // Render loading indicator with appropriate message
  const renderLoadingIndicator = () => {
    const message = isWaitingForResources ? "Waiting for resources" : "Preparing to generate";
    
    return (
      <div className="flex flex-col justify-center items-center py-8 space-y-3">
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

  // Render streaming answer (word-by-word)
  const renderStreamingAnswer = () => (
    <div className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
      {answer}
    </div>
  );

  // Render sentence-based answer
  const renderSentenceBasedAnswer = () => {
    // Create an array of text segments with highlighting information
    const segments = [];
    let lastEnd = 0;
    
    // Process each sentence - ensure sentences is an array
    if (Array.isArray(sentences)) {
      sentences.forEach((sentence, index) => {
        // Add any text between the last sentence and this one
        if (sentence.start > lastEnd) {
          segments.push({
            text: answer.substring(lastEnd, sentence.start),
            isHighlightable: false,
            index: null
          });
        }
        
        // Add the sentence as a highlightable segment
        segments.push({
          text: answer.substring(sentence.start, sentence.end),
          isHighlightable: true,
          index
        });
        
        lastEnd = sentence.end;
      });
    }
    
    // Add any remaining text after the last sentence
    if (lastEnd < answer.length) {
      segments.push({
        text: answer.substring(lastEnd),
        isHighlightable: false,
        index: null
      });
    }
    
    return (
      <div className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
        {segments.map((segment, segmentIndex) => {
          if (!segment.isHighlightable) {
            return <span key={`non-highlight-${segmentIndex}`}>{segment.text}</span>;
          }
          
          // Determine if this sentence should be highlighted
          const isHovered = activeSentenceIndex === segment.index && !showCitations;
          const isActive = activeSentenceIndex === segment.index && showCitations;
          
          return (
            <span 
              key={`sentence-${segment.index}-${segmentIndex}`}
              className={`sentence-highlight cursor-pointer 
                ${isHovered ? 'bg-blue-100 dark:bg-blue-900' : ''}
                ${isActive ? 'active' : ''}`}
              onMouseEnter={() => !showCitations && handleSentenceHover(segment.index)}
              onMouseLeave={() => !showCitations && setActiveSentenceIndex(null)}
              onClick={(e) => handleSentenceClick(segment.text, segment.index, e)}
            >
              {segment.text}
            </span>
          );
        })}
      </div>
    );
  };

  // Handle regenerate button click
  const handleRegenerate = () => {
    if (onRegenerate && typeof onRegenerate === 'function') {
      debugLog('Regenerating answer');
      // Close citations sidebar before regenerating
      if (showCitations) {
        closeCitations();
      }
      onRegenerate();
    }
  };

  // Render the content of the answer box
  const renderAnswerContent = () => {
    // When generating with no text yet, show a loading indicator
    if ((isGenerating && !answer) || isWaitingForResources) {
      return renderLoadingIndicator();
    }
    
    // When streaming or completely done, just show the answer content without status message
    const answerContent = (
      <div 
        ref={answerRef}
        className={`prose prose-sm sm:prose lg:prose-lg dark:prose-invert max-w-none ${!isExpanded ? 'max-h-72 overflow-hidden' : ''}`}
      >
        {isGenerating ? renderStreamingAnswer() : renderSentenceBasedAnswer()}
      </div>
    );
    
    return answerContent;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 relative">
        <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200">Answer</h2>
        <div className="absolute top-4 right-4 flex items-center space-x-2">
          {!isGenerating && (
            <button
              onClick={handleRegenerate}
              className="flex items-center text-xs bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-300 p-2 rounded-md shadow-sm border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-800 transition-colors"
              disabled={isGenerating}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Regenerate</span>
            </button>
          )}
          <div className="flex items-center text-xs bg-green-50 dark:bg-green-900 text-green-600 dark:text-green-300 p-2 rounded-md shadow-sm border border-green-200 dark:border-green-800">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Click below for citations</span>
          </div>
        </div>
      </div>
      
      <div className="flex flex-row transition-all duration-300 ease-in-out flex-grow min-h-[200px] relative">
        <div className={`p-4 relative ${showCitations ? 'w-[calc(100%-300px)]' : 'w-full'} transition-all duration-300 ease-in-out h-full`}>
          {renderAnswerContent()}
        </div>
        
        {showCitations && (
          <div className="h-full overflow-hidden">
            <CitationSidebar 
              citations={citations} 
              onClose={closeCitations} 
              isLoading={isLoadingCitations}
              status={citationStatus}
              debugLog={debugLog}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Answer; 
