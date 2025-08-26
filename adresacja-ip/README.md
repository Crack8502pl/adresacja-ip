# Generator Adresacji IP

Automatyczny generator adresacji IP z obsługą zajętych pul (DATA.json). Interfejs webowy, backend Node.js.

## Szybki start

1. **Zainstaluj zależności**
   ```
   npm install
   ```

2. **Uruchom serwer**
   ```
   npm start
   ```

3. **Otwórz przeglądarkę**
   ```
   http://localhost:3000
   ```

4. **Wgraj plik wsadowy CSV**
   - Format: `Nazwa Obiektu;Kategoria;Nazwa;Ilość;Klasa`
   - Przykład:
     ```
     Nazwa Obiektu;Kategoria;Nazwa;Ilość;Klasa
     Obiekt1;kat1;WV-U1532LA-cam;2;brak
     Obiekt2;kat2;UrządzenieA;1;lan
     Obiekt1;kat1;WV-S1536LTN-cam;1;lanz
     Obiekt3;kat3;UrządzenieDHCP;1;lanz1
     ```

5. **Pobierz plik adresacji**
   - Wynikowy plik: `Adresacja_{nazwa_pliku_wejściowego}.csv`
   - Kolejne generacje biorą pod uwagę zajęte pule w pliku DATA.json.

6. **DATA.json**
   - Plik z zapisanymi pulami (tworzony automatycznie).
   - Nie kasuj, jeśli chcesz zachować historię zajętych zakresów!

---

## Zasada działania
- Dobierana jest najmniejsza możliwa maska, uwzględniając bufor 20%.
- Jeśli maska nie wystarcza, wybierany jest większy zakres.
- Generator nie nadpisuje istniejących zakresów (DATA.json).
- Obsługuje klasy: brak, lan, lanz, lanz1 (DHCP).
- Wynikowa adresacja jest gotowa do wdrożenia.

---

## Zaawansowane
- Możesz ręcznie edytować DATA.json, jeśli chcesz zwolnić pulę.
- Dodaj kolejne pliki wsadowe – generator sam dobierze kolejne wolne zakresy.

---

## Wymagania
- Node.js 18+