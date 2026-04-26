# Kalender V2 und Report-Export

## Ziel

Punkt 2 und 3 aus dem Produktabgleich schließen zwei Lücken:

1. Kalender V2:
   Monat, Woche und Jahr in einem zusammenhängenden Review-Flow.
2. Exportierbare Reports:
   Die vorhandene Analyse als verteilbaren PDF-Report nutzbar machen.

Beide Features greifen auf dieselbe Trade-Datenbasis zu und sollen ohne neuen Backend-Service auskommen.

## Produktplanung

### 1. Kalender V2

#### Nutzerziel

Ein Trader soll drei Fragen direkt beantworten können:

1. Welche Tage, Wochen und Monate waren stark oder schwach?
2. Welche Trades stecken hinter einem einzelnen Tag?
3. Wie komme ich von der Übersicht direkt in die Tages-Review?

#### UX-Scope

- Drei Modi: `Monat`, `Woche`, `Jahr`
- Navigation pro Modus:
  - Monat: Monatsweise
  - Woche: 7-Tage-Schritte
  - Jahr: Jahresweise
- Gemeinsame Summary-Karten für den sichtbaren Bereich
- Drilldown rechts:
  - ausgewählter Handelstag
  - Tages-P&L
  - Trades / Win-Loss-Sicht
  - Tagesliste aller Trades
- Deep Link in `Daily`

#### Fachliche Regeln

- Auswertung nach Markt-Tag statt rohem UTC-Datum
- Trades nach `exitTime` einem Handelstag zuordnen
- Für Tagesabfragen und Kalenderaggregation den Query-Bereich um +/- 1 Tag erweitern
- Danach per lokalem Markt-Datum filtern

#### Technische Umsetzung

- Neue Hilfsbibliothek: `src/lib/calendar-utils.ts`
- Einmaliges Laden der Jahresdaten über `CalendarService.getDailyPnL`
- Monat/Woche/Jahr werden nur aus dem bereits geladenen Jahresdatensatz abgeleitet
- Tages-Detaildaten separat über `TradeService.getByMarketDate`

### 2. Exportierbare Reports

#### Nutzerziel

Ein Trader soll die bereits berechneten Reports als PDF exportieren können, ohne Screenshots oder manuelle Nacharbeit.

#### UX-Scope

- Export-Button direkt in `Reports`
- Export nutzt den aktuell geladenen Report-Zustand
- PDF soll enthalten:
  - KPI-Überblick
  - Highlights
  - Performance nach Uhrzeit und Wochentag
  - Symbol- und Setup-Tabellen
  - Long/Short-Vergleich
  - Monats-Performance
  - Verteilungsübersicht

#### Technische Umsetzung

- Client-seitiger Export mit `jspdf` und `jspdf-autotable`
- Kein neuer API-Endpunkt
- Keine zweite Report-Berechnung nur für Export
- Multipage-Layout mit wiederholbarem Footer und Seitenzahl

## Implementierungsentscheidung

### Warum kein eigener Report-Export-Service?

- Die Daten liegen im Frontend bereits vollständig vor.
- Es gibt keine PDF-spezifische Backend-Logik.
- Der client-seitige Export reduziert Komplexität und spart Auth-/Storage-Aufwand.

### Warum Jahresdaten für den Kalender vorladen?

- Jahr-, Monat- und Wochenansicht greifen auf dieselbe tägliche Aggregation zu.
- Das verhindert wiederholte Netzwerkanfragen beim Wechsel der Tabs.
- Nur der Tages-Drilldown lädt zusätzliche Daten.

## Umgesetzte Dateien

- `src/app/(dashboard)/calendar/page.tsx`
- `src/app/(dashboard)/daily/page.tsx`
- `src/app/(dashboard)/reports/page.tsx`
- `src/lib/calendar-utils.ts`
- `src/lib/report-export.ts`
- `src/lib/models.ts`
- `src/lib/market-time.ts`
- `package.json`
- `package-lock.json`

## Verifikation

Lokal verifiziert:

- `npm run lint`
- `npm run build`
- `docker compose up -d --build`
- Browser-Check mit Playwright:
  - Reports lädt Kennzahlen
  - PDF-Download funktioniert
  - Kalender zeigt Monat/Woche/Jahr
  - Tages-Drilldown zeigt konkrete Trades

Artefakte liegen in `output/playwright/`.

## Deployment

Unraid:

- Zielpfad: `/mnt/user/appdata/tradinghub`
- Geänderte App-Dateien plus `package.json` und `package-lock.json` synchronisiert
- Stack aktualisiert mit `docker compose up -d --build app app_warmer`
- Healthcheck geprüft über `http://10.10.20.200:3001/api/health`

## Nächste sinnvolle Schritte

1. PDF-Branding mit Logo, Zeitraum und Nutzername ergänzen
2. CSV- und PNG-Export neben PDF ergänzen
3. Kalender um Filter nach Symbol, Setup und Side erweitern
4. Wochen- und Monatsreviews direkt aus der Kalenderseite erzeugen
