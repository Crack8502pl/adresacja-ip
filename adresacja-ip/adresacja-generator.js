const fs = require('fs');
const path = require('path');
const csvParse = require('csv-parse/lib/sync');
const csvStringify = require('csv-stringify/lib/sync');

// --- IP utils ---
function ipToNumber(ip) {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}
function numberToIp(num) {
    return [
        (num >>> 24) & 255,
        (num >>> 16) & 255,
        (num >>> 8) & 255,
        num & 255
    ].join('.');
}
function cidrToDecimal(cidr) {
    const mask = [];
    for (let i = 0; i < 4; i++) {
        const bits = Math.max(0, Math.min(8, cidr - i * 8));
        mask.push((0xFF << (8 - bits)) & 0xFF);
    }
    return mask.join('.');
}
function hostsForMask(mask) {
    return Math.pow(2, 32 - mask) - 2;
}

// --- DATA.json obsługa ---
function loadUsedRanges(dataPath) {
    try {
        const data = fs.readFileSync(dataPath, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}
function saveUsedRanges(dataPath, ranges) {
    fs.writeFileSync(dataPath, JSON.stringify(ranges, null, 2), 'utf8');
}

// Sprawdź czy zakres jest wolny
function isRangeAvailable(networkNum, mask, usedRanges) {
    const maskSize = Math.pow(2, 32 - mask);
    const rangeStartNum = networkNum;
    const rangeEndNum = networkNum + maskSize - 1;
    for (const used of usedRanges) {
        const usedStart = ipToNumber(used.network);
        const usedEnd = usedStart + Math.pow(2, 32 - used.mask) - 1;
        // Nakładają się?
        if (!(rangeEndNum < usedStart || rangeStartNum > usedEnd)) {
            return false;
        }
    }
    return true;
}

// Znajdź najmniejszy dostępny zakres dla żądanej liczby urządzeń
function findAvailableRange(baseNetwork, minRequired, usedRanges) {
    let mask = findSmallestMask(minRequired);
    let candidateNetNum = ipToNumber(baseNetwork);
    let maxTries = 512; // np. dla 172.16.x.0, 512 podsieci /24

    while (mask <= 30) {
        let tries = maxTries;
        candidateNetNum = ipToNumber(baseNetwork);
        while (tries--) {
            if (isRangeAvailable(candidateNetNum, mask, usedRanges)) {
                return { network: numberToIp(candidateNetNum), mask };
            }
            candidateNetNum += Math.pow(2, 32 - mask);
        }
        mask++;
    }
    throw new Error("Brak wolnych pul adresowych!");
}

// Najmniejsza maska dla liczby hostów
function findSmallestMask(hosts) {
    let bitsNeeded = Math.ceil(Math.log2(hosts + 2));
    return 32 - bitsNeeded;
}

// Sortowanie zgodnie z wymaganiami
function sortCsvRows(csvRows) {
    // 1. Klasa "brak" - wszystkie obiekty po kolei
    const klasaBrak = csvRows.filter(row => row.klasa === '' || row.klasa === 'brak');
    // 2. Klasa "lan" - wszystkie obiekty po kolei
    const klasaLan = csvRows.filter(row => row.klasa === 'lan');
    // 3. Klasa "lanz" - w ramach obiektu: najpierw WV-U1532LA, potem WV-S1536LTN, potem reszta
    const klasaLanz = csvRows.filter(row => row.klasa === 'lanz');
    const grupyLanz = {};
    klasaLanz.forEach(row => {
        if (!grupyLanz[row.nazwaObiektu]) grupyLanz[row.nazwaObiektu] = [];
        grupyLanz[row.nazwaObiektu].push(row);
    });
    let sortedLanz = [];
    Object.values(grupyLanz).forEach(grupa => {
        const wvU1532LA = grupa.filter(row => row.nazwa.includes('WV-U1532LA'));
        const wvS1536LTN = grupa.filter(row => row.nazwa.includes('WV-S1536LTN'));
        const reszta = grupa.filter(row => !row.nazwa.includes('WV-U1532LA') && !row.nazwa.includes('WV-S1536LTN'));
        sortedLanz.push(...wvU1532LA, ...wvS1536LTN, ...reszta);
    });
    // 4. Klasa "lanz1"
    const klasaLanz1 = csvRows.filter(row => row.klasa === 'lanz1');
    return [...klasaBrak, ...klasaLan, ...sortedLanz, ...klasaLanz1];
}

// Główna funkcja serwerowa
async function generateAdresacja(inputCsvPath, dataJsonPath, outputDir) {
    // 1. Wczytaj CSV
    const inputCsv = fs.readFileSync(inputCsvPath, 'utf8');
    const records = csvParse(inputCsv, { delimiter: ';', columns: true, skip_empty_lines: true });
    // 2. Przetwórz dane
    const csvRows = records.map(row => ({
        nazwaObiektu: row['Nazwa Obiektu'],
        kategoria: row['Kategoria'],
        nazwa: row['Nazwa'],
        ilosc: parseInt(row['Ilość']) || 1,
        klasa: (row['Klasa'] || '').toLowerCase()
    }));
    const sortedRows = sortCsvRows(csvRows);

    // 3. Policz urządzenia (z buforem)
    const totalDevices = sortedRows.reduce((sum, row) => sum + row.ilosc, 0);
    const devicesWithBuffer = Math.ceil(totalDevices * 1.2);

    // 4. Wczytaj DATA.json
    const usedRanges = loadUsedRanges(dataJsonPath);

    // 5. Znajdź wolną pulę i maskę
    const baseNetwork = '172.16.0.0';
    const rangeInfo = findAvailableRange(baseNetwork, devicesWithBuffer, usedRanges);

    // 6. Zapisz pulę do DATA.json
    const rangeStart = numberToIp(ipToNumber(rangeInfo.network) + 1);
    const rangeEnd = numberToIp(ipToNumber(rangeInfo.network) + hostsForMask(rangeInfo.mask));
    const outputFileName = `Adresacja_${path.basename(inputCsvPath).replace(/\.[^/.]+$/, "")}.csv`;
    usedRanges.push({
        network: rangeInfo.network,
        mask: rangeInfo.mask,
        rangeStart,
        rangeEnd,
        assignedTo: outputFileName
    });
    saveUsedRanges(dataJsonPath, usedRanges);

    // 7. Wygeneruj adresy
    let currentIP = ipToNumber(rangeStart);
    const outputRows = [];
    sortedRows.forEach(row => {
        for (let i = 0; i < row.ilosc; i++) {
            let adresIP;
            if (row.klasa === 'lanz1') {
                adresIP = 'DHCP';
            } else {
                adresIP = numberToIp(currentIP);
                currentIP++;
            }
            outputRows.push({
                'Nazwa Obiektu': row.nazwaObiektu,
                'Kategoria': row.kategoria,
                'Nazwa': row.nazwa,
                'Adres ip V4': adresIP,
                'Maska': row.klasa === 'lanz1' ? 'DHCP' : cidrToDecimal(rangeInfo.mask),
                'Brama domyślna': row.klasa === 'lanz1' ? 'DHCP' : rangeStart,
                'Serwer NTP': row.klasa === 'lanz1' ? 'DHCP' : rangeStart
            });
        }
    });

    // 8. Zapisz CSV
    const outputCsv = csvStringify(outputRows, { header: true, delimiter: ';' });
    fs.writeFileSync(path.join(outputDir, outputFileName), outputCsv, 'utf8');
    return outputFileName;
}

module.exports = { generateAdresacja };