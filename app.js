// app.js

const express = require('express');
const path = require('path');
const QRCode = require('qrcode');
const session = require('express-session');
const cors = require('cors');
const fs = require('fs');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const mysql = require('mysql2');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config(); // Charger les variables d'environnement depuis le fichier .env

// Importation des modèles IA (selon votre code existant)
const { RetrievalQAChain, loadQAStuffChain } = require('langchain/chains');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const { HuggingFaceInferenceEmbeddings } = require("@langchain/community/embeddings/hf");
const { ChatGroq } = require('@langchain/groq');

// Création de l'application Express
const app = express();

// Configuration de la connexion MySQL
const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root', // Remplacez par vos informations
  password: process.env.DB_PASSWORD || 'votre_mot_de_passe',
  database: process.env.DB_NAME || 'votre_base_de_donnees'
});

db.connect((err) => {
  if (err) {
    console.error('Erreur de connexion à la base de données MySQL :', err);
    return;
  }
  console.log('Connecté à la base de données MySQL');
});





// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));

// Gestion des sessions


app.use(session({
  secret: process.env.SESSION_SECRET || 'votre_cle_secrete', // Utilisez une variable d'environnement sécurisée
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Doit être 'true' si vous utilisez HTTPS
    httpOnly: true
  }
}));


// Initialiser Passport.js
app.use(passport.initialize());
app.use(passport.session());

// Configuration de la stratégie Google avec Passport.js
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID, // Votre ID client Google
    clientSecret: process.env.GOOGLE_CLIENT_SECRET, // Votre clé secrète client Google
    callbackURL: '/auth/google/callback'
  },
  (accessToken, refreshToken, profile, done) => {
    // Vérifier si l'utilisateur existe dans la base de données
    db.query('SELECT * FROM users WHERE google_id = ?', [profile.id], (err, results) => {
      if (err) return done(err);

      if (results.length > 0) {
        // L'utilisateur existe déjà
        return done(null, results[0]);
      } else {
        // Créer un nouvel utilisateur
        const newUser = {
          google_id: profile.id,
          display_name: profile.displayName,
          first_name: profile.name.givenName,
          last_name: profile.name.familyName,
          email: (profile.emails[0].value || '').toLowerCase(),
          profile_photo: profile.photos[0].value
        };

        db.query('INSERT INTO users SET ?', newUser, (err, res) => {
          if (err) return done(err);
          newUser.id = res.insertId;
          return done(null, newUser);
        });
      }
    });
  }
));

// Sérialisation et désérialisation de l'utilisateur
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  db.query('SELECT * FROM users WHERE id = ?', [id], (err, results) => {
    if (err) return done(err);
    done(null, results[0]);
  });
});

// Middleware pour vérifier si l'utilisateur est authentifié
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/');
}

// Configuration des modèles IA
const ollama = new ChatGroq({
    model: "llama3-8b-8192",
    temperature: 0.9,
    apiKey: "" // Utilisez une variable d'environnement
});

const embeddings = new HuggingFaceInferenceEmbeddings({
    apiKey: process.env.HF_API_KEY // Utilisez une variable d'environnement
});

// Stockage des informations de propriété et des chaînes
const propertyChains = new Map();

// Routes

// Servir la page d'accueil
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'home.html'));
});

// Routes d'authentification
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    // Authentification réussie
    res.redirect('/dashboard');
  }
);

// Route de déconnexion
app.get('/logout', (req, res, next) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    res.redirect('/');
  });
});

// Route protégée
app.get('/dashboard', isAuthenticated, (req, res) => {
  // Servir la page du tableau de bord ou rediriger vers generate.html
  res.sendFile(path.join(__dirname, 'views', 'generate.html'));
});

// Point de terminaison API pour api.json
app.get('/api.json', (req, res) => {
  const apiPath = path.join(__dirname, 'api.json');
  
  if (fs.existsSync(apiPath)) {
      // Ajouter le type MIME correct
      res.type('application/json');
      res.sendFile(apiPath);
  } else {
      res.status(404).send('Fichier de configuration API introuvable');
  }
});

// Générer un code QR pour une propriété
app.post('/generate-qr', isAuthenticated, async (req, res) => {
    try {
        const propertyInfo = req.body.propertyInfo;
        
        // Générer un ID unique pour cette propriété
        const propertyId = crypto.randomBytes(16).toString('hex');
        
        // Créer et stocker la base de connaissances
        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 200,
            chunkOverlap: 50,
        });
        
        const docs = await textSplitter.createDocuments([propertyInfo]);
        const vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);
        
        // Créer et stocker la chaîne
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

        // Générer l'URL du code QR
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
        console.error('Erreur lors de la génération du code QR :', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Route de l'interface de chat
app.get('/chat/:propertyId', isAuthenticated, (req, res) => {
    const propertyId = req.params.propertyId;
    const propertyData = propertyChains.get(propertyId);
    
    if (!propertyData) {
        return res.status(404).send('Propriété introuvable');
    }
    
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Point de terminaison pour les requêtes du chatbot
app.post('/query/:propertyId', isAuthenticated, async (req, res) => {
    try {
        const propertyId = req.params.propertyId;
        const propertyData = propertyChains.get(propertyId);
        
        if (!propertyData) {
            return res.status(404).json({ error: 'Propriété introuvable' });
        }

        const system = `You are a french real estate assistant for a specific property. 
        Answer questions about the property using the provided property information.
        Keep responses concise and professional. If information isn't available in the
        property details, say "I don't have that specific information about this property."`;

        const fullQuery = `${system}\n\nUser Query: ${req.body.query}\n\nAnswer:`;
        
        const result = await propertyData.chain.call({ 
            query: fullQuery 
        });

        res.json(result);

    } catch (error) {
        console.error('Erreur lors du traitement de la requête :', error);
        res.status(500).json({ error: error.message });
    }
});

// Middleware de gestion des erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Une erreur est survenue !');
});

// Démarrer le serveur
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Serveur en cours d'exécution sur le port ${PORT}`);
});
