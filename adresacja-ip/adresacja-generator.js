/**
 * Funkcje pomocnicze do generatora adresacji IP
 * Funkcje:
 * - Parsowanie CSV i sortowanie wierszy
 * - Parametry IP (konwersje, maski, liczby hostów)
 * - Sprawdzanie dostępnych zakresów IP
 * - Generowanie wierszy wyjściowych
 * - Podsumowanie elementów do adresacji
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

// -- IP utils --

/**
 * Konwersja IP string na liczbę
 */
function ipToNumber(ip) {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

/**
 * Konwersja liczby na string IP
 */
function numberToIp(num) {
    return [
        (num >>> 24) & 255,
        (num >>> 16) & 255,
        (num >>> 8) & 255,
        num & 255
    ].join('.');
}

/**
 * Zamiana maski CIDR na dziesiętną
 */
function cidrToDecimal(cidr) {
    const mask = [];
    for (let i = 0; i < 4; i++) {
        const bits = Math.max(0, Math.min(8, cidr - i * 8));
        mask.push((0xFF << (8 - bits)) & 0xFF);
    }
    return mask.join('.');
}

/**
 * Liczba dostępnych hostów dla danej maski
 */
function hostsForMask(mask) {
    return Math.pow(2, 32 - mask) - 2;
}

// -- DATA.json obsługa (wykorzystane zakresy) --

/**
 * Wczytuje listę zajętych podsieci z DATA.json
 */
function loadUsedRanges(dataPath) {
    try {
        const data = fs.readFileSync(dataPath, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

/**
 * Zapisuje listę zajętych podsieci do DATA.json
 */
function saveUsedRanges(dataPath, ranges) {
    fs.writeFileSync(dataPath, JSON.stringify(ranges, null, 2), 'utf8');
}

/**
 * Sprawdza, czy dany zakres jest dostępny (nie pokrywa się z innym)
 */
function isRangeAvailable(networkNum, mask, usedRanges) {
    const maskSize = Math.pow(2, 32 - mask);
    const rangeStartNum = networkNum;
    const rangeEndNum = networkNum + maskSize - 1;
    for (const used of usedRanges) {
        const usedStart = ipToNumber(used.network);
        const usedEnd = usedStart + Math.pow(2, 32 - used.mask) - 1;
        if (!(rangeEndNum < usedStart || rangeStartNum > usedEnd)) {
            return false;
        }
    }
    return true;
}

/**
 * Znajduje wolny zakres IP spełniający wymagania liczby urządzeń
 */
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

/**
 * Wyznacza najmniejszą maskę dla podanej liczby hostów
 */
function findSmallestMask(hosts) {
    let bitsNeeded = Math.ceil(Math.log2(hosts + 2));
    return 32 - bitsNeeded;
}

/**
 * Sortuje wiersze CSV wg reguł: brak/lan/lanz/lanz1
 */
function sortCsvRows(csvRows) {
    const klasaBrak = csvRows.filter(row => row.klasa === '' || row.klasa === 'brak');
    const klasaLan = csvRows.filter(row => row.klasa === 'lan');
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
    const klasaLanz1 = csvRows.filter(row => row.klasa === 'lanz1');
    return [...klasaBrak, ...klasaLan, ...sortedLanz, ...klasaLanz1];
}

/**
 * Główna funkcja generująca adresację IP na podstawie CSV
 * Zwraca:
 * - wiersze wynikowe
 * - parametry podsieci
 * - nazwę sieci (XXX z wykaz_XXX_YYY)
 */
async function generateAdresacja(inputCsvPath, dataJsonPath, outputDir) {
    const inputCsv = fs.readFileSync(inputCsvPath, 'utf8');
    const records = parse(inputCsv, { delimiter: ';', columns: true, skip_empty_lines: true });

    const csvRows = records.map(row => ({
        nazwaObiektu: (row['Nazwa Obiektu'] || row['nazwa obiektu'] || row['Nazwa Obiekty'] || row['nazwa obiekty'] || "").replace(/^\uFEFF/, '').trim(),
        kategoria: row['Kategoria'] || row['kategoria'] || "",
        nazwa: row['Nazwa'] || row['nazwa'] || "",
        ilosc: parseInt(row['Ilość']) || parseInt(row['Ilosc']) || 1,
        klasa: (row['Klasa'] || row['klasa'] || '').toLowerCase().trim()
    }));
    const sortedRows = sortCsvRows(csvRows);
    const totalDevices = sortedRows.reduce((sum, row) => sum + row.ilosc, 0);
    const devicesWithBuffer = Math.ceil(totalDevices * 1.2);

    const usedRanges = loadUsedRanges(dataJsonPath);

    const baseNetwork = '172.16.0.0';
    const rangeInfo = findAvailableRange(baseNetwork, devicesWithBuffer, usedRanges);

    const rangeStart = numberToIp(ipToNumber(rangeInfo.network) + 1);
    const rangeEnd = numberToIp(ipToNumber(rangeInfo.network) + hostsForMask(rangeInfo.mask));

    // Nazwa sieci: XXX z wykaz_XXX_YYYY.csv
    const fileBase = path.basename(inputCsvPath).replace(/\.[^/.]+$/, "");
    // Wyciągamy XXX ze wzorca wykaz_XXX_YYYY
    let siecNazwa = fileBase;
    const rgx = /^wykaz_([^_]+)_/i;
    const match = fileBase.match(rgx);
    if (match && match[1]) {
        siecNazwa = match[1];
    }

    const outputFileName = `Adresacja_${fileBase}.csv`;

    usedRanges.push({
        network: rangeInfo.network,
        mask: rangeInfo.mask,
        rangeStart,
        rangeEnd,
        assignedTo: outputFileName
    });
    saveUsedRanges(dataJsonPath, usedRanges);

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

    const outputCsv = stringify(outputRows, { header: true, delimiter: ';' });
    fs.writeFileSync(path.join(outputDir, outputFileName), outputCsv, 'utf8');
    return {
        fileName: outputFileName,
        siecNazwa,
        rows: outputRows,
        network: rangeInfo.network,
        mask: rangeInfo.mask,
        rangeStart,
        rangeEnd
    };
}

/**
 * Funkcja podsumowująca wiersze CSV do adresacji
 * Zwraca tablicę z polami + included: czy wiersz będzie adresowany
 * Kolory w tabeli frontendowej
 */
function summaryForCsv(inputCsvPath) {
    const inputCsv = fs.readFileSync(inputCsvPath, 'utf8');
    const records = parse(inputCsv, { delimiter: ';', columns: true, skip_empty_lines: true });
    return records.map(row => {
        const nazwaObiektu = (row['Nazwa Obiektu'] || row['nazwa obiektu'] || row['Nazwa Obiekty'] || row['nazwa obiekty'] || "").replace(/^\uFEFF/, '').trim();
        const klasa = (row['Klasa'] || row['klasa'] || '').toLowerCase().trim();
        // included: tylko te które nie są "lanz1" i mają nazwę obiektu
        const included = klasa !== 'lanz1' && nazwaObiektu !== '';
        return {
            ...row,
            nazwaObiektu,
            included,
        };
    });
}

module.exports = { generateAdresacja, summaryForCsv, hostsForMask, cidrToDecimal };