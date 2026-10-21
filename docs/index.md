---
title: Handleiding
---

# Handleiding MA3 Remote PWA

Stap voor stap om de app werkend te krijgen. Loopt het mis, ga dan naar [Problemen oplossen](#problemen-oplossen).

## 1. Wat heb je nodig

- Een computer waarop de app draait (Windows, macOS of Linux). Dit hoeft niet de MA3-computer te zijn.
- Een iPad, telefoon of andere browser op **hetzelfde netwerk** als die computer.
- Een grandMA3 die bereikbaar is op dat netwerk.

> **MA3 onPC:** in onze tests verwerkte MA3 onPC de commando's pas nadat er een fysieke MA3-console of -hardware aan gekoppeld was. Zonder hardware kwamen de commando's wel binnen in het OSC-protokol, maar deed de MA niets. Test dus eerst met echte hardware.

## 2. De app starten

1. Download de juiste versie bij [Releases](https://github.com/jannickvang/ma3-remote/releases/latest).
2. Pak het bestand uit en start het programma.
3. **Windows:** bij "Windows heeft uw pc beveiligd" kies je *Meer info* en dan *Toch uitvoeren*. Bij de firewallvraag kies je **Toegang toestaan** (privénetwerk). Zonder dit bereikt de iPad de app niet.
4. **macOS:** rechtsklik op het bestand, kies *Open* en bevestig. Zet het eventueel eerst uitvoerbaar met `chmod +x <bestand>`.
5. Er opent een venster met een adres, bijvoorbeeld `Open op je iPad: http://192.168.1.20:3000`. Laat dit venster open. Sluit je het, dan stopt de app.

Open dat adres op de iPad in Safari. Zet de app eventueel op het beginscherm: Deel-knop, dan *Zet op beginscherm*.

## 3. Verbinding met de MA3 instellen

### In de MA3

1. Ga naar **Setup > In & Out > OSC**.
2. Zet bovenaan **Enable Input** aan.
3. Maak een regel (bijv. regel 3) met:
   - **Destination IP / Remote IP:** het IP-adres van de computer waarop de app draait.
   - **Port:** een vrije poort, bijvoorbeeld `8000`. Onthoud die.
   - **Receive Command:** `Yes`.
4. Zet de **readout op Percent** (anders is een stap van `1` veel groter dan 1%).

### In de app

1. Tik rechtsboven op het **statuslabel**.
2. Vul het **IP-adres van de MA3** en dezelfde **poort** in als op de MA3. Gebruik één en dezelfde poort overal.
3. Tik op **Opslaan**.

Het IP-adres is standaard `127.0.0.1`. Dat werkt alleen als de MA3 op dezelfde computer draait als de app.

## 4. Controleren dat het werkt

- Kijk in de MA3 bij het **OSC-protokol** of de commando's binnenkomen.
- Draai aan een encoder in de app. In de MA3 moet het attribuut veranderen.
- Gebeurt er niets terwijl de commando's wel in het protokol staan, kijk dan bij het kopje hardware hierboven.

## 5. Waar je op moet letten

| Onderwerp | Wat te doen |
|---|---|
| **Poort** | Dezelfde poort in de MA3 en in de app. De app stuurt via UDP naar die poort. |
| **Netwerk** | iPad, computer met de app en MA3 moeten elkaar kunnen bereiken. Gasten- of client-isolatie op de wifi blokkeert dit. |
| **Firewall** | Sta de app toe op privénetwerken (TCP 3000 voor de iPad, UDP voor de MA3-poort). |
| **Readout** | Zet op **Percent**, anders zijn de stappen veel te groot. |
| **Attribuutnamen** | De app gebruikt `Pan`, `Tilt`, `Zoom`, `Focus1`, `Blade 1A` t/m `Blade 4A` en `Blade1 Rot` t/m `Blade4 Rot`. Heten ze bij jouw fixtures anders, pas dan `MA3_ATTRIBUTE_MAP` aan (zie hieronder). |
| **Update** | De Update-knop stuurt `Update /NoConfirmation` gevolgd door `ClearAll`. Zo hoef je niet te bevestigen op de tafel en is de programmer daarna leeg. |
| **Set** | De knop stuurt `Set Selection Property 'Active'`. Dit is bedoeld om na Next/Previous weer de hele groep te selecteren. |
| **Sequences** | Cues & Seq gebruikt standaard start-sequence 201. Een andere waarde wordt per apparaat onthouden. |
| **Kleurpresets** | Het ophalen van presets van de tafel is nog **experimenteel en niet getest**. Rekenen op die functie kan nog niet. |

## 6. Aanpassen

- **Onderste knoppenbalk:** de knoppen zijn instelbaar in de app (volgorde, zichtbaarheid, commando). Standaard: Highlight, Next, Previous, Set, Full, Clear, Esc.
- **Attribuutnamen overschrijven:** zet de omgevingsvariabele `MA3_ATTRIBUTE_MAP` met JSON, bijvoorbeeld `{"Focus":"Focus1"}`.
- **Poort van de app zelf:** standaard 3000. Wijzig met de omgevingsvariabele `PORT`.
- **Instellingen:** de MA3-instellingen staan in `ma3-remote-config.json` naast het programma.

## Problemen oplossen

**De pagina opent niet op de iPad.**
Controleer dat iPad en computer op hetzelfde netwerk zitten, dat het adres uit het venster is gebruikt (niet `localhost`) en dat de firewall de app toestaat.

**Status rechtsboven staat op Offline.**
De iPad bereikt de app niet meer. Controleer of het programma nog draait.

**Commando's komen in het MA3-protokol, maar er gebeurt niets.**
Controleer *Receive Command = Yes* en *Enable Input*. Test met gekoppelde MA3-hardware (zie boven).

**Commando's komen niet binnen op de MA3.**
Controleer IP en poort in de app, de poort in de MA3-regel en de firewall van de MA3-computer (UDP).

**Encoders doen te grote of kleine stappen.**
Zet de readout op **Percent**.

**Een attribuut reageert niet.**
Controleer de naam van het attribuut in de MA3 en pas `MA3_ATTRIBUTE_MAP` aan.

**Na een nieuwe versie zie je de oude app.**
Ververs de pagina hard, of sluit de app volledig op de iPad en open hem opnieuw. De app gebruikt een cache.

**Poort 3000 is bezet.**
Start met een andere poort, bijvoorbeeld `PORT=3100`.
