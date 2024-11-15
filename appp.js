// Import required modules
const express = require('express');
const path = require('path');
require('dotenv').config();
const cors = require('cors');

const http = require('http');
const { RetrievalQAChain, loadQAStuffChain, MultiRetrievalQAChain } = require('langchain/chains');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const fs = require('fs');
//const { Ollama } = require('langchain/llms/ollama');
//const { OpenAI } = require("@langchain/openai");

//const { ChatOpenAI} = require("@langchain/openai");


const { MemoryVectorStore } = require('langchain/vectorstores/memory');
//const { OllamaEmbeddings } = require('langchain/embeddings/ollama');

const { HuggingFaceInferenceEmbeddings } = require("@langchain/community/embeddings/hf");

const{ ChatGroq } =require('@langchain/groq')


const ollama =  new ChatGroq({
    model: "llama3-8b-8192", // Defaults to "gpt-3.5-turbo-instruct" if no model provided.
    temperature: 0.9,
    apiKey: "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", // In Node.js defaults to process.env.OPENAI_API_KEY
  });
// Configure the Ollama embeddings with specific parameters for model and server
const embeddings = new HuggingFaceInferenceEmbeddings({
 // Specified model to use for embeddings
    apiKey:"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"
    
});

// Create an Express application
const app = express();
// Configure the application to parse JSON request bodies
app.use(express.json());
app.use(cors());






// Définir le dossier des vues
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html'); // Si vous utilisez un moteur de template, changez 'html' en conséquence


// Servir les fichiers statiques depuis le dossier 'public'
app.use(express.static(path.join(__dirname, 'public')));


// Route pour la page d'accueil
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
  });


  app.get('/api.json', (req, res) => {
    const apiPath = path.join(__dirname, 'api.json');
    
    if (fs.existsSync(apiPath)) {
        // Ajout du type MIME correct
        res.type('application/json');
        res.sendFile(apiPath);
    } else {
        res.status(404).send('API configuration file not found');
    }
});

// Read a text file and split it into chunks for document processing
const text = fs.readFileSync('./Alpinefull2.txt', 'utf8');
const textSplitter = new RecursiveCharacterTextSplitter(
  chunk_size = 200,
  chunk_overlap = 50,
)

// Print the length of the text
console.log('Length of text:', text.length);

// Split the text into chunks
const tmp = textSplitter.splitText(text);
console.log('Split text:', tmp);

// Main async function to initialize LangChain components
(async () => {
  let docs;
  try {
    docs = await textSplitter.createDocuments([text]);
  } catch (error) {
    console.error('Error creating documents:', error);
    process.exit(1);
  }

// Initialize a vector store using the documents and OpenAI embeddings
  const vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);
  
// Convert the vector store into a retriever
const vectorStoreRetriever = vectorStore.asRetriever();

// Initialize the RetrievalQAChain

const chain = new RetrievalQAChain({
  llm: ollama, // Use your initialized Ollama model here
  combineDocumentsChain:  loadQAStuffChain(ollama),
  retriever: vectorStoreRetriever, // Use your initialized vector store retriever here
  returnSourceDocuments: true,
});


  //Define a route to handle queries 
    app.post('/query', async (req, res) => {     
      
      const System = "You are a concierge for the exclusive Highland House rental property. \
      When the user asks a question you will be given then a truthful answer using the FAQ context data from the FAQ document provided \
      The FAQ is srtructured as question and answer pairs to help you find answers. Do not mention FAQ document when answering. \
      Provide a helpful answer in three sentences.\  Answer only once.  Do not repeat the question.  Do not explain your reasoning.\
      If there is no answer in the context say 'I do not have the answer that question in my knowledgebase.' \
      DO NOT make up answers and you do not repeat yourself. Remember Do not mention FAQ document when answering." 

      //Concatenate system prompt with user query <s>[INST] <<SYS>> \ </SYS>"

      const fullQuery = `${System}\n\nUser Query: ${req.body.query}\n\nAnswer:`;  //Added the oncatenate \n\nAnswer:

      // Log the received query
      //console.log('User query:', req.body.query);
      //console.log('Ollama initialized:', ollama);
      //console.log('Vector Store Retriever initialized:', vectorStoreRetriever);
      //vectorStoreRetriever) is used when doing the stuff method
      
      try {
        // Assuming chain.call is the method you're using and it returns a response
        const result = await chain.call({ query: fullQuery });
        console.log('Result text:', result.text); // Corrected to log result.text
    
        // Send the response back to the client
        res.json(result);
      } catch (error) {
        // Handle any errors that occur during the process
        console.error('Error processing query:', error);
        res.status(500).send('An error occurred while processing your request.');
      }
    });

  // Start the HTTP server on port 3001
  const port = 3001;
  const server = http.createServer(app);
  server.listen(port, () => console.log(`Server started on port localhost:${port}`));
})();


///////////////////////////////////////////////////////////////// LANGINDEX.JS SeCOURS

/*//langindex.js - Separation of concerns for Langchain response handling
import { handleDIDStreaming } from '../../js/streaming-client-api.js';

document.addEventListener('DOMContentLoaded', () => {
  // Getting references to various elements on the page
  const userInputField = document.getElementById('user-input-field');
  const startButton = document.getElementById('talk-button');
  const responseContainer = document.getElementById('response-container');
  const readAloudCheckbox = document.getElementById('toggleReadAloud');
  const toggleDIDCheckbox = document.getElementById('toggleDID');
  
  // Global variable to store the last response
  let lastResponse = '';

  // Event listener for the "Start" button click
  startButton.addEventListener('click', async () => {
    // Retrieve user input from the input field
    const userInput = userInputField.value;
    try {
      // Play typing sound
      playTypingSound();

      // Cancel any ongoing speech synthesis
      window.speechSynthesis.cancel();

      // Send the user input to the server via a POST request
      const response = await fetch('http://localhost:3001/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userInput })
      });

      // Check if the server response is OK
      if (!response.ok) {
        throw new Error(`Server responded with status code: ${response.status}`);
      }

      // Parse the server's JSON response
      const responseData = await response.json();
      let chatText = responseData.text ? responseData.text.trim() : '';

      // Replace a generic "I don't know" response with a more informative message
      if (chatText === "I don't know.") {
        chatText = "That information is not in my knowledge base, please ask another question.";
      }
      // Update lastResponse with the new chat response
      lastResponse = responseData.text;
      console.log("New chat response:", lastResponse);

      // Stream the new response and check if it should be read aloud
      responseContainer.innerHTML = '';
      streamText(chatText, responseContainer, 50); // Streaming text with 50ms delay

      if (readAloudCheckbox.checked && chatText) {
        lastResponse = chatText; // Store the response to replay later
        speak(chatText);
      };

      // Check if streaming to D-ID is enabled
      if (toggleDIDCheckbox.checked) {
        handleDIDStreaming(lastResponse);
      }
    } catch (error) {
      console.error('Error sending query to the server:', error);
      responseContainer.textContent = 'Error: Could not get a response.';
    }
  });

  // Event listener for the Replay button on Voice only
  const replayButton = document.getElementById('replay-button');
  replayButton.addEventListener('click', () => {
    if (lastResponse) {
      speak(lastResponse); // Replay the last response
    } else {
      console.log("No response to replay.");
    }
  });

  // Default streaming to D-ID is off
  let shouldStreamToDID = false;

  toggleDIDCheckbox.addEventListener('change', () => {
    shouldStreamToDID = toggleDIDCheckbox.checked;
  });

  // Function to create a stream text effect into our container element, character by character
  function streamText(responseText, container, interval = 50) {
    const words = responseText.split(' '); // Split response into individual words
    let currentIndex = 0;

    // Interval function to add words one by one into the container
    const wordStreamer = setInterval(() => {
      if (currentIndex < words.length) {
        container.innerHTML += words[currentIndex] + ' ';
        currentIndex++;
      } else {
        clearInterval(wordStreamer); // Stop streaming when all words are added
      }
    }, interval);
  }

  // Function to use local speech synthesis voice to read out text (Voice requested must be installed)
  function speak(text) {
    const synth = window.speechSynthesis; // Reference to speech synthesis interface

    // Function to set the voice and speak the text
    function setVoiceAndSpeak() {
      const voices = synth.getVoices();
      let selectedVoice = voices.find(voice => voice.name === "Microsoft Clara Online (Natural) - English (Canada)");

      // Default to an English voice if the desired voice isn't found
      if (!selectedVoice) {
        selectedVoice = voices.find(voice => voice.lang === 'en-US');
        console.log('Desired voice not found, using default English voice:', selectedVoice ? selectedVoice.name : 'none found');
      }

      const utterance = new SpeechSynthesisUtterance(text);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      // Speak the text
      synth.speak(utterance);
    }

    // Handle case where voices haven't loaded yet
    if (synth.getVoices().length === 0) {
      synth.onvoiceschanged = () => {
        setVoiceAndSpeak();
        synth.onvoiceschanged = null; // Remove event listener after setting voice
      };
    } else {
      setVoiceAndSpeak();
    }
  }


  // Function to play typing sound
  function playTypingSound() {
    

    const audio = new Audio('/audio/typing.wav');
    audio.play();
  }
});
*/


/////////////////////////////////////////////////////////////////////////APP

/*
// app.js
const express = require('express');
const path = require('path');
const QRCode = require('qrcode');
const session = require('express-session');
const cors = require('cors');
const fs = require('fs');
const { RetrievalQAChain, loadQAStuffChain } = require('langchain/chains');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const { HuggingFaceInferenceEmbeddings } = require("@langchain/community/embeddings/hf");
const { ChatGroq } = require('@langchain/groq');
const crypto = require('crypto');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Configure AI models
const ollama = new ChatGroq({
    model: "llama3-8b-8192",
    temperature: 0.9,
    apiKey: "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"
});

const embeddings = new HuggingFaceInferenceEmbeddings({
    apiKey: "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"
});

// Store property information and chains
const propertyChains = new Map();

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'generate.html'));
});

// Route pour la page d'accueil
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'home.html'));
});


app.get('/api.json', (req, res) => {
  const apiPath = path.join(__dirname, 'api.json');
  
  if (fs.existsSync(apiPath)) {
      // Ajout du type MIME correct
      res.type('application/json');
      res.sendFile(apiPath);
  } else {
      res.status(404).send('API configuration file not found');
  }
});




// Generate QR Code for a property
app.post('/generate-qr', async (req, res) => {
    try {
        const propertyInfo = req.body.propertyInfo;
        
        // Generate unique ID for this property
        const propertyId = crypto.randomBytes(16).toString('hex');
        
        // Create and store the knowledge base
        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 200,
            chunkOverlap: 50,
        });
        
        const docs = await textSplitter.createDocuments([propertyInfo]);
        const vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);
        
        // Create and store the chain
        const chain = new RetrievalQAChain({
            llm: ollama,
            combineDocumentsChain: loadQAStuffChain(ollama),
            retriever: vectorStore.asRetriever(),
            returnSourceDocuments: true,
        });
        
        propertyChains.set(propertyId, {
            chain,
            info: propertyInfo
        });

        // Generate QR code URL
        const chatUrl = `${req.protocol}://${req.get('host')}/chat/${propertyId}`;
        const qrCodeDataUrl = await QRCode.toDataURL(chatUrl, {
            color: {
                dark: '#6e48aa',
                light: '#ffffff'
            },
            width: 400,
            margin: 2
        });

        res.json({ 
            success: true, 
            qrCode: qrCodeDataUrl,
            propertyId: propertyId 
        });

    } catch (error) {
        console.error('Error generating QR code:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Chat interface route
app.get('/chat/:propertyId', (req, res) => {
    const propertyId = req.params.propertyId;
    const propertyData = propertyChains.get(propertyId);
    
    if (!propertyData) {
        return res.status(404).send('Property not found');
    }
    
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Query endpoint for the chatbot
app.post('/query/:propertyId', async (req, res) => {
    try {
        const propertyId = req.params.propertyId;
        const propertyData = propertyChains.get(propertyId);
        
        if (!propertyData) {
            return res.status(404).json({ error: 'Property not found' });
        }

        const system = `You are a real estate assistant for a specific property. 
        Answer questions about the property using the provided property information.
        Keep responses concise and professional. If information isn't available in the
        property details, say "I don't have that specific information about this property."`;

        const fullQuery = `${system}\n\nUser Query: ${req.body.query}\n\nAnswer:`;
        
        const result = await propertyData.chain.call({ 
            query: fullQuery 
        });

        res.json(result);

    } catch (error) {
        console.error('Error processing query:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});*/