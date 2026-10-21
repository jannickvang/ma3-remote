# MA3 Remote PWA

Touch-remote (PWA) voor een grandMA3-console, geoptimaliseerd voor iPad. Encoders, shapers, cues & sequences, fixtures en kleurpresets. Commando's gaan als OSC (`/cmd`) via UDP naar de MA3.

## Downloaden en starten

1. Download de nieuwste versie voor jouw platform bij [Releases](../../releases/latest):
   - Windows: `ma3-remote-pwa-win-x64.zip`
   - macOS (Apple Silicon / Intel): `ma3-remote-pwa-macos-arm64.tar.gz` / `ma3-remote-pwa-macos-x64.tar.gz`
   - Linux: `ma3-remote-pwa-linux-x64.tar.gz`
2. Start het programma. Het toont een adres zoals `http://192.168.1.20:3000`.
3. Open dat adres in Safari op de iPad (of een andere browser).
4. Tik rechtsboven op de status en vul het IP-adres en de poort van de MA3 in.

Windows en macOS waarschuwen bij niet-ondertekende programma's: kies "Toch uitvoeren" (macOS: rechtsklik, "Open"). Sta bij de eerste start de firewall-toegang toe.

## MA3 instellen

Setup > In & Out > OSC: maak een regel met dezelfde poort als in de app, zet **Receive Command** op Yes en schakel "Enable Input" in. Zet de readout op **percent**.

## Zelf draaien

```
npm install
npm start            # http://localhost:3000
```

Docker: `docker compose up --build`. Omgevingsvariabelen: `PORT`, `MA3_IP`, `MA3_PORT`, `CONFIG_PATH`, `MA3_ATTRIBUTE_MAP`.

## Zelf bouwen (.exe / binaries)

```
npm run build:exe    # resultaat in dist/
```

## Versiebeheer en releases

Versies volgen [semver](https://semver.org/lang/nl/) en worden getagd als `vX.Y.Z`. Een tag pushen start automatisch de GitHub Action die de binaries bouwt en als release publiceert:

```
npm version patch    # of minor / major: verhoogt package.json en maakt tag + commit
git push --follow-tags
```

## Bijdragen

Issues en pull requests zijn welkom.

## Licentie

[MIT](LICENSE)
