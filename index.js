const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const dotenv = require('dotenv');
const SFTPClient = require('ssh2-sftp-client');
const fs = require('fs');
const vault = require('node-vault');

dotenv.config();

const serverIP = process.env.SFTP_SERVER_IP;
const vaultClient = vault({ endpoint: process.env.VAULT_ENDPOINT, token: process.env.VAULT_TOKEN });
const app = express();
const port = 3000;

let sessionSecret = 'fallback_secret_key';

// Récupérer la clé depuis Vault
(async () => {
    try {
        const secret = await vaultClient.read(process.env.SESSION_KEY_PATH);
        sessionSecret = secret.data.secret_key;
        console.log('Clé de session récupérée depuis Vault avec succès.');
    } catch (err) {
        console.error('Erreur lors de la récupération de la clé depuis Vault :', err.message);
        console.log('Utilisation de la clé de session par défaut.');
    }
})();

// Middleware de session
app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, httpOnly: true },
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
const upload = multer({ dest: 'uploads/' });

function validateInput(input) {
    const regex = /^[a-zA-Z0-9@._-]+$/;
    return regex.test(input);
}

app.get('/', (req, res) => {
    console.log('Accès à la page de connexion.');
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    console.log('Tentative de connexion pour l\'utilisateur :', username);

    if (!validateInput(username) || !validateInput(password)) {
        console.log('Validation des entrées échouée pour l\'utilisateur :', username);
        return res.status(400).send('Entrées invalides.');
    }

    const sftp = new SFTPClient();
    try {
        console.log('Connexion SFTP en cours...');
        await sftp.connect({ host: serverIP, port: 22, username, password });
        console.log('Connexion SFTP réussie pour l\'utilisateur :', username);
        req.session.sshConfig = { username, password };
        req.session.isAuthenticated = true;
        await sftp.end();
        res.redirect('/user');
    } catch (err) {
        console.error('Erreur de connexion SFTP pour l\'utilisateur', username, ':', err.message);
        res.status(401).send(`Connexion échouée : ${err.message}`);
    }
});

app.get('/user', (req, res) => {
    if (!req.session.isAuthenticated) {
        console.log('Accès non autorisé à /user. Redirection vers /');
        return res.redirect('/');
    }
    console.log('Accès autorisé à /user pour l\'utilisateur :', req.session.sshConfig.username);
    res.sendFile(path.join(__dirname, 'views', 'user.html'));
});

app.get('/user/files', async (req, res) => {
    const { username, password } = req.session.sshConfig;
    const sftp = new SFTPClient();

    console.log('Récupération des fichiers pour l\'utilisateur :', username);

    try {
        await sftp.connect({ host: serverIP, port: 22, username, password });
        const files = await sftp.list(`/home/${username}`);
        console.log(`Fichiers récupérés pour l'utilisateur ${username} :`, files.map(file => file.name));
        res.json(files.map(file => file.name));
    } catch (err) {
        console.error('Erreur lors de la récupération des fichiers pour l\'utilisateur', username, ':', err.message);
        res.status(500).send('Erreur lors de la récupération des fichiers.');
    } finally {
        await sftp.end();
    }
});

app.post('/upload', upload.single('file'), async (req, res) => {
    const { username, password } = req.session.sshConfig;
    const localPath = req.file.path;
    const remotePath = `/home/${username}/${req.file.originalname}`;
    const sftp = new SFTPClient();

    console.log(`Tentative d'upload du fichier ${req.file.originalname} pour l'utilisateur :`, username);

    try {
        await sftp.connect({ host: serverIP, port: 22, username, password });
        await sftp.put(localPath, remotePath);
        console.log(`Upload réussi du fichier ${req.file.originalname} pour l'utilisateur :`, username);
        res.redirect('/user');
    } catch (err) {
        console.error('Erreur lors de l\'upload du fichier', req.file.originalname, 'pour l\'utilisateur', username, ':', err.message);
        res.status(500).send(`Erreur lors de l'upload : ${err.message}`);
    } finally {
        if (fs.existsSync(localPath)) {
            fs.unlinkSync(localPath);
            console.log('Fichier temporaire local supprimé :', localPath);
        }
        await sftp.end();
    }
});

app.get('/logout', (req, res) => {
    console.log('Déconnexion pour l\'utilisateur :', req.session.sshConfig?.username);
    req.session.destroy(() => res.redirect('/'));
});

app.listen(port, () => {
    console.log(`Serveur démarré sur http://localhost:${port}`);
});
