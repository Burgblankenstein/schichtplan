# 🍴 SchichtPlan – Restaurant Manager

Schichtplanungs-App für dein Restaurant mit Login-System, Benachrichtigungen, Kalenderansicht und Raum-Verwaltung.

---

## 🚀 Deployment-Anleitung (Schritt für Schritt)

### Schritt 1 – Accounts erstellen

Erstelle kostenlose Accounts auf diesen drei Websites:

1. **[github.com](https://github.com)** – registrieren mit E-Mail + Passwort
2. **[supabase.com](https://supabase.com)** – mit GitHub-Account anmelden
3. **[vercel.com](https://vercel.com)** – mit GitHub-Account anmelden

---

### Schritt 2 – Supabase Datenbank einrichten

1. Auf supabase.com: **„New Project"** klicken
2. Name: `schichtplan`, Region: **Europe (Frankfurt)**
3. Ein sicheres Datenbankpasswort vergeben und merken
4. Warten bis das Projekt bereit ist (~1 Minute)
5. Links auf **„SQL Editor"** klicken
6. Den gesamten Inhalt der Datei **`supabase_setup.sql`** kopieren und einfügen
7. Auf **„Run"** klicken – alle Tabellen und Demo-Daten werden angelegt
8. Links auf **„Settings" → „API"** gehen und folgende zwei Werte notieren:
   - **Project URL** (z.B. `https://abcdefgh.supabase.co`)
   - **anon public** Key (langer Code unter „Project API Keys")

---

### Schritt 3 – Code auf GitHub hochladen

1. Auf github.com oben rechts: **„+" → „New repository"**
2. Name: `schichtplan`, auf **„Create repository"** klicken
3. Auf der nächsten Seite: **„uploading an existing file"** klicken
4. **Alle Dateien aus diesem Ordner** in das Upload-Fenster ziehen
   - `index.html`
   - `package.json`
   - `vite.config.js`
   - `.env.example`
   - `.gitignore`
   - `supabase_setup.sql`
   - `README.md`
   - Den gesamten `src/` Ordner
5. Auf **„Commit changes"** klicken

---

### Schritt 4 – App auf Vercel deployen

1. Auf vercel.com: **„Add New Project"** klicken
2. Dein GitHub-Repository **„schichtplan"** auswählen und auf **„Import"** klicken
3. Unter **„Environment Variables"** zwei Einträge hinzufügen:

   | Name | Wert |
   |------|------|
   | `VITE_SUPABASE_URL` | Deine Project URL aus Schritt 2 |
   | `VITE_SUPABASE_ANON_KEY` | Deinen anon key aus Schritt 2 |

4. Auf **„Deploy"** klicken
5. Nach ~2 Minuten bekommst du deine URL, z.B. `schichtplan.vercel.app` ✅

---

## 🔐 Demo-Zugangsdaten

| Rolle | Name | Passwort |
|-------|------|----------|
| 👨‍🍳 Chef | Chef | chef123 |
| 👤 Mitarbeiter | Anna Müller | anna123 |
| 👤 Mitarbeiter | Ben Koch | ben123 |
| 👤 Mitarbeiter | Clara Stern | clara123 |
| 👤 Mitarbeiter | David Braun | david123 |
| 👤 Mitarbeiter | Eva Schäfer | eva123 |
| 👤 Mitarbeiter | Felix Wagner | felix123 |

> **Wichtig:** Passwörter nach dem ersten Login über die Account-Verwaltung (Chef-Ansicht → „Accounts") ändern!

---

## ✨ Funktionen

- **Login-System** – separate Chef- und Mitarbeiter-Accounts
- **Schichtplanung** – Schichten anlegen, Mitarbeiter einteilen, Räume zuweisen
- **Bewerbungssystem** – Mitarbeiter bewerben sich auf passende Schichten
- **Kalenderansicht** – Wochenübersicht für Chef und Mitarbeiter
- **Benachrichtigungen** – automatisch bei Bewerbung, Einteilung und neuer Schicht
- **Account-Verwaltung** – nur für Chef: Accounts erstellen, bearbeiten, löschen
- **Echtzeit-Sync** – Änderungen erscheinen sofort bei allen angemeldeten Nutzern

---

## 🛠 Lokale Entwicklung

```bash
# Abhängigkeiten installieren
npm install

# .env Datei erstellen
cp .env.example .env
# Dann .env öffnen und die Supabase-Werte eintragen

# Entwicklungsserver starten
npm run dev
```

Die App läuft dann unter `http://localhost:5173`

---

## 📁 Projektstruktur

```
schichtplan/
├── index.html              # HTML-Einstiegspunkt
├── package.json            # Abhängigkeiten
├── vite.config.js          # Build-Konfiguration
├── .env.example            # Vorlage für Umgebungsvariablen
├── supabase_setup.sql      # Datenbank-Setup Script
└── src/
    ├── main.jsx            # React-Einstiegspunkt
    ├── App.jsx             # Haupt-App-Komponente
    ├── LoginScreen.jsx     # Login-Seite
    ├── useData.js          # Daten-Hook (Supabase)
    ├── supabase.js         # Supabase-Client
    ├── constants.js        # Gemeinsame Konstanten & Hilfsfunktionen
    └── styles.js           # Alle Styles
```
