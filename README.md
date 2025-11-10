# Tractivity

Minimalistyczna aplikacja desktopowa (Electron + TypeScript) do śledzenia efektywnego czasu pracy. Pierwsza wersja oferuje pojedynczy licznik czasu z przyciskami Start/Pause oraz Reset.

## Wymagania

- Node.js 18 lub nowszy
- npm 9 lub nowszy

## Instalacja

```bash
npm install
```

## Dostępne skrypty

- `npm start` – kompiluje projekt i uruchamia aplikację Electron.
- `npm run dev` – tryb deweloperski z watcherami (wymaga środowiska graficznego).
- `npm run build` – buduje wersję produkcyjną w katalogu `dist`.
- `npm test` – uruchamia testy Vitest dla logiki timera.
- `npm run lint` – uruchamia ESLint dla plików TypeScript.
- `npm run dist:win` – buduje instalator Windows (`release/`).

## Struktura projektu

```text
src/
  main/       Logika procesu głównego Electron
  preload/    Wystawienie API do procesu renderera
  renderer/   UI timera i logika front-end
tests/        Testy jednostkowe logiki timera
```

## Budowa instalatora Windows

1. Uruchom pakowanie: `npm run dist:win` (skrypt czyści wcześniejszy katalog `release/windows-build`).
2. Procedura automatycznie zbuduje kod TypeScript i przygotuje paczki Windows.
3. Gotowe pliki znajdziesz w katalogu `release/windows-build/` (instalator NSIS oraz wersja portable).

> **Uwaga:** na Windowsie do poprawnego wypakowania narzędzi podpisu wymagana jest możliwość tworzenia dowiązań symbolicznych. Włącz tryb programisty w ustawieniach systemu albo uruchom polecenie w terminalu z uprawnieniami administratora, jeśli podczas budowania pojawi się błąd `A required privilege is not held by the client`.

## Przyszłe kroki

- Dodanie historii sesji i lokalnego magazynu danych.
- Wsparcie dla więcej niż jednego licznika.
- Przygotowanie paczki instalacyjnej na inne platformy.
