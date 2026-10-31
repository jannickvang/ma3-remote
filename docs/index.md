---
title: Manual
---

# MA3 Remote PWA manual

Step by step instructions to get the app working. If something goes wrong, see [Troubleshooting](#troubleshooting).

## 1. What you need

- A computer that runs the app (Windows, macOS or Linux). This does not have to be the MA3 computer.
- An iPad, phone or other browser on the **same network** as that computer.
- A grandMA3 that is reachable on that network.

> **MA3 onPC:** in our tests, MA3 onPC only processed the commands after physical MA3 console hardware was connected. Without hardware the commands showed up in the OSC protocol, but the MA did nothing. So test with real hardware first.

## 2. Start the app

1. Download the right version from [Releases](https://github.com/jannickvang/ma3-remote/releases/latest).
2. Unpack the file and start the program.
3. **Windows:** at "Windows protected your PC" choose *More info* and then *Run anyway*. At the firewall prompt choose **Allow access** (private network). Without this the iPad cannot reach the app.
4. **macOS:** right-click the file, choose *Open* and confirm. If needed, make it executable first with `chmod +x <file>`.
5. A window opens with an address, for example `Open on your iPad: http://192.168.1.20:3000`. Keep this window open. If you close it, the app stops.

Open that address on the iPad in Safari. Optionally add the app to the home screen: Share button, then *Add to Home Screen*.

## 3. Connect to the MA3

### In the MA3

1. Go to **Setup > In & Out > OSC**.
2. Turn on **Enable Input** at the top.
3. Create a line (e.g. line 3) with:
   - **Destination IP / Remote IP:** the IP address of the computer running the app.
   - **Port:** a free port, for example `8000`. Remember it.
   - **Receive Command:** `Yes`.
4. Set the **readout to Percent** (otherwise a step of `1` is much larger than 1%).

### In the app

1. Tap the **status label** at the top right.
2. Enter the **IP address of the MA3** and the same **port** as on the MA3. Use one and the same port everywhere.
3. Tap **Save**.

The IP address defaults to `127.0.0.1`. That only works if the MA3 runs on the same computer as the app.

## 4. Check that it works

- Look in the MA3 **OSC protocol** to see whether commands arrive.
- Turn an encoder in the app. The attribute should change in the MA3.
- If nothing happens while the commands do show up in the protocol, see the hardware note above.

## 5. Things to watch out for

| Topic | What to do |
|---|---|
| **Port** | Use the same port in the MA3 and in the app. The app sends over UDP to that port. |
| **Network** | iPad, the computer running the app and the MA3 must be able to reach each other. Guest or client isolation on the wifi blocks this. |
| **Firewall** | Allow the app on private networks (TCP 3000 for the iPad, UDP for the MA3 port). |
| **Readout** | Set to **Percent**, otherwise the steps are far too large. |
| **Attribute names** | The app uses `Pan`, `Tilt`, `Zoom`, `Focus1`, `Blade 1A` to `Blade 4A` and `Blade1 Rot` to `Blade4 Rot`. If your fixtures use other names, adjust `MA3_ATTRIBUTE_MAP` (see below). |
| **Frost presets** | The four frost buttons on the Encoders page recall MA3 presets 5.1 through 5.4 by default. Tap the gear below the buttons to configure the preset numbers per device. |
| **Update** | The Update button sends `Update /NoConfirmation` followed by `ClearAll`. This way you don't have to confirm on the console and the programmer is empty afterwards. |
| **Set** | The button sends `Set Selection Property 'Active'`. It is meant to select the whole group again after Next/Previous. |
| **Sequences** | Cues & Seq uses start sequence 201 by default. Another value is remembered per device. |

## 6. Customize

- **Bottom button bar:** the buttons are configurable in the app (order, visibility, command). Default: Highlight, Next, Previous, Set, Full, Clear, Esc.
- **Override attribute names:** set the environment variable `MA3_ATTRIBUTE_MAP` with JSON, for example `{"Focus":"Focus1"}`.
- **Port of the app itself:** 3000 by default. Change it with the environment variable `PORT`.
- **Settings:** the MA3 settings are stored in `ma3-remote-config.json` next to the program.

## Troubleshooting

**The page does not open on the iPad.**
Check that the iPad and computer are on the same network, that you used the address from the window (not `localhost`), and that the firewall allows the app.

**The status at the top right says Offline.**
The iPad no longer reaches the app. Check that the program is still running.

**Commands appear in the MA3 protocol, but nothing happens.**
Check *Receive Command = Yes* and *Enable Input*. Test with connected MA3 hardware (see above).

**Commands do not arrive at the MA3.**
Check the IP and port in the app, the port in the MA3 line and the firewall of the MA3 computer (UDP).

**Encoders make steps that are too large or small.**
Set the readout to **Percent**.

**An attribute does not respond.**
Check the attribute name in the MA3 and adjust `MA3_ATTRIBUTE_MAP`.

**After a new version you still see the old app.**
Hard refresh the page, or fully close the app on the iPad and reopen it. The app uses a cache.

**Port 3000 is in use.**
Start with another port, for example `PORT=3100`.
