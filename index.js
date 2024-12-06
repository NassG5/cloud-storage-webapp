require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vault = require('node-vault')({
    endpoint: process.env.VAULT_ENDPOINT,
    token: process.env.VAULT_TOKEN,
});
const SFTPClient = require('ssh2-sftp-client');

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret',
    resave: false,
    saveUninitialized: true,
}));

const upload = multer({ dest: 'uploads/' });

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    req.session.sshConfig = { username, password };
    req.session.isAuthenticated = true;
    res.redirect('/user');
});

app.get('/user', (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'views', 'user.html'));
});

// Function to encrypt files
async function encryptFile(filePath, encryptedPath) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);

    return new Promise((resolve, reject) => {
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        const input = fs.createReadStream(filePath);
        const output = fs.createWriteStream(encryptedPath);

        input.pipe(cipher).pipe(output);

        output.on('finish', async () => {
            const fileName = path.basename(encryptedPath);
            try {
                await vault.write(`secret/encrypted_files/${fileName}`, {
                    key: key.toString('hex'),
                    iv: iv.toString('hex'),
                });
                resolve();
            } catch (err) {
                reject(err);
            }
        });

        output.on('error', (err) => reject(err));
    });
}

// Route to list files
app.get('/user/files', async (req, res) => {
    const { username, password } = req.session.sshConfig;
    const sftp = new SFTPClient();

    try {
        console.log(`Connexion au SFTP pour l'utilisateur : ${username}`);
        await sftp.connect({ host: process.env.SFTP_HOST, port: 22, username, password });

        const files = await sftp.list(`/home/${username}`);
        const visibleFiles = files.filter(file => !file.name.startsWith('.')).map(file => file.name);

        res.json(visibleFiles);
    } catch (err) {
        console.error('Erreur lors de la récupération des fichiers :', err.message);
        res.status(500).send('Erreur lors de la récupération des fichiers.');
    } finally {
        await sftp.end();
    }
});

// Route to upload files
app.post('/upload', upload.single('file'), async (req, res) => {
    const { username, password } = req.session.sshConfig;
    const localPath = req.file.path; // Chemin temporaire du fichier uploadé
    const encryptedPath = `${localPath}.enc`; // Chemin pour le fichier chiffré
    const remotePath = `/home/${username}/${req.file.originalname}.enc`; // Chemin distant sur le serveur SFTP

    const sftp = new SFTPClient();

    try {
        console.log('--- Début de la route /upload ---');
        console.log(`Fichier uploadé reçu : ${localPath}`);
        console.log(`Chemin prévu pour le fichier chiffré : ${encryptedPath}`);
        console.log(`Chemin distant prévu pour l'upload : ${remotePath}`);

        // Étape 1 : Chiffrement du fichier
        console.log('Chiffrement du fichier...');
        await encryptFile(localPath, encryptedPath);
        console.log(`Fichier chiffré avec succès : ${encryptedPath}`);

        // Étape 2 : Connexion au SFTP
        console.log('Connexion au serveur SFTP...');
        await sftp.connect({ host: process.env.SFTP_HOST, port: 22, username, password });
        console.log('Connexion SFTP réussie.');

        // Étape 3 : Upload du fichier chiffré
        console.log(`Upload du fichier vers : ${remotePath}`);
        await sftp.put(encryptedPath, remotePath);
        console.log(`Fichier uploadé avec succès vers ${remotePath}`);

        res.send('Fichier chiffré et uploadé avec succès.');
    } catch (err) {
        console.error('Erreur lors de la route /upload :', err.message);
        res.status(500).send(`Erreur lors de l'upload : ${err.message}`);
    } finally {
        console.log('Nettoyage des fichiers temporaires...');
        if (fs.existsSync(localPath)) {
            console.log(`Suppression du fichier temporaire local : ${localPath}`);
            fs.unlinkSync(localPath);
        }
        if (fs.existsSync(encryptedPath)) {
            console.log(`Suppression du fichier temporaire chiffré : ${encryptedPath}`);
            fs.unlinkSync(encryptedPath);
        }
        await sftp.end();
        console.log('--- Fin de la route /upload ---');
    }
});


// Route to share files
app.post('/user/files/share', async (req, res) => {
    const { username, password } = req.session.sshConfig;
    const { fileName, targetUser } = req.body;

    const sftp = new SFTPClient();
    const sourcePath = `/home/${username}/${fileName}.enc`;
    const targetPath = `/home/${targetUser}/${fileName}.enc`;

    try {
        await sftp.connect({ host: process.env.SFTP_HOST, port: 22, username, password });
        await sftp.fastPut(sourcePath, targetPath);
        res.send(`Fichier partagé avec succès avec ${targetUser}.`);
    } catch (err) {
        console.error('Erreur lors du partage :', err.message);
        res.status(500).send('Erreur lors du partage.');
    } finally {
        await sftp.end();
    }
});

// Route to download files
app.get('/user/files/download/:fileName', async (req, res) => {
    const { username, password } = req.session.sshConfig;
    const fileName = req.params.fileName;
    const encryptedPath = `/home/${username}/${fileName}.enc`;
    const localEncryptedPath = `./uploads/${fileName}.enc`;
    const localDecryptedPath = `./uploads/${fileName}`;
    const sftp = new SFTPClient();

    try {
        await sftp.connect({ host: process.env.SFTP_HOST, port: 22, username, password });
        await sftp.get(encryptedPath, localEncryptedPath);

        const secret = await vault.read(`secret/encrypted_files/${fileName}`);
        const key = Buffer.from(secret.data.key, 'hex');
        const iv = Buffer.from(secret.data.iv, 'hex');

        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        const input = fs.createReadStream(localEncryptedPath);
        const output = fs.createWriteStream(localDecryptedPath);

        input.pipe(decipher).pipe(output);

        output.on('finish', () => {
            res.download(localDecryptedPath, fileName, () => {
                if (fs.existsSync(localEncryptedPath)) fs.unlinkSync(localEncryptedPath);
                if (fs.existsSync(localDecryptedPath)) fs.unlinkSync(localDecryptedPath);
            });
        });
    } catch (err) {
        console.error('Erreur lors du téléchargement/déchiffrement :', err.message);
        res.status(500).send('Erreur lors du téléchargement.');
    } finally {
        await sftp.end();
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Serveur démarré sur http://localhost:${port}`);
});
