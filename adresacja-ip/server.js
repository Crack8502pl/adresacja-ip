const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { generateAdresacja } = require('./adresacja-generator');

const upload = multer({ dest: 'uploads/' });
const app = express();
const PORT = 3000;

// Stworzenie katalogów output oraz uploads jeśli nie istnieją
['output', 'uploads'].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

app.use(express.static('public'));

app.post('/generate', upload.single('file'), async (req, res) => {
    try {
        const inputCsvPath = req.file.path;
        const dataJsonPath = path.resolve('DATA.json');
        const outputDir = path.resolve('output');
        const outputFileName = await generateAdresacja(inputCsvPath, dataJsonPath, outputDir);
        const outputFilePath = path.join(outputDir, outputFileName);

        res.download(outputFilePath, outputFileName, err => {
            // Po wysłaniu można usunąć plik z uploads
            fs.unlinkSync(inputCsvPath);
        });
    } catch (err) {
        res.status(500).send('Błąd generacji: ' + err.message);
    }
});

app.listen(PORT, () => {
    console.log(`Serwer działa na http://localhost:${PORT}`);
});