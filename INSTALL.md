# Install Hatchmark

Hatchmark is not sold or distributed as a ready-made download. You build it once on your own computer, which takes about ten minutes the first time and needs one short copy-and-paste. You do not need to know how to code.

Works on **macOS** and **Windows**. Linux is on the [roadmap](README.md#roadmap) but not supported yet.

## Before you start

You need two free programs. Check whether you already have them (step 1), and install only what is missing.

| Program | What it is for |
|---|---|
| **Node.js** | Runs the build. Install version **22** (the one this project is tested with). |
| **Git** *(optional)* | Downloads the project and lets you update it later. You can skip it and use the ZIP download instead. |

## Step 1: Open a terminal and check

A terminal is a window where you type commands. Nothing here changes your computer until you press Enter, and every command below is copy-and-paste.

- **macOS:** press `Cmd + Space`, type `Terminal`, press Enter.
- **Windows:** press the Start key, type `PowerShell`, press Enter.

Paste this and press Enter:

```
node --version
```

- It prints `v22.something`: good, go to step 3.
- It prints another number (`v20…`, `v24…`, `v26…`): it may work, but only 22 is tested. If the install fails, install 22 (step 2).
- It says `command not found` or `not recognized`: go to step 2.

## Step 2: Install Node.js (skip if step 1 showed v22)

1. Go to <https://nodejs.org/en/download>.
2. Pick **version 22**, your system (macOS or Windows) and **installer**. If the page only offers a newer version by default, use its version drop-down.
3. Run the installer and keep the default options.
4. **Close the terminal and open a new one.** This step matters: an already-open terminal does not see the new program.
5. Run `node --version` again. You should see `v22…`.

Windows shortcut, if you prefer a command: `winget install OpenJS.NodeJS.LTS`. This installs the current LTS version, which may be newer than 22.

## Step 3: Get the project

**Option A: ZIP (no Git needed)**

1. Open <https://github.com/hugommartins/drawing-practice-timer>.
2. Click the green **Code** button, then **Download ZIP**.
3. Unzip it somewhere you will remember, for example your Documents folder. You get a folder called `drawing-practice-timer-main`.

**Option B: Git** (lets you update with one command later)

```
git clone https://github.com/hugommartins/drawing-practice-timer
```

On a Mac, if it asks to install "command line developer tools", click **Install**, wait, then run the command again.
On Windows, install Git from <https://git-scm.com/download/win> first, then open a new PowerShell.

## Step 4: Open the terminal inside the project folder

- **macOS:** in Terminal type `cd ` (with a space after it), drag the project folder from Finder into the Terminal window, press Enter.
- **Windows:** in File Explorer open the project folder, click the address bar at the top, type `powershell`, press Enter. A terminal opens already in that folder.

Check you are in the right place. This should list a file called `package.json`:

- macOS: `ls`
- Windows: `dir`

## Step 5: Install

**macOS**

```
npm run install:mac
```

**Windows**

```
npm run install:win
```

This downloads what the app needs and builds it. **The first run takes several minutes and downloads a few hundred MB; the terminal may look stuck for a while. That is normal. Wait until the prompt comes back.** At the end it prints `Installed:` and where.

- macOS puts `Hatchmark.app` in `~/Applications` (your user folder, not the main Applications folder). Open it from Spotlight (`Cmd + Space`, type `Hatchmark`) or from that folder.
- Windows installs for your user only (no administrator password) and adds Start menu and desktop shortcuts.

The commands are safe to run again. Running them again also updates the app.

## Your first session

Open the app, go to the **Library**, click **Link a folder** and choose a folder with images. The folder name becomes the drawing type. Then open **Draw**, pick a timer and start. Nothing is uploaded or copied; the app only reads the folder.

## Update later

- Git: open a terminal in the project folder, run `git pull`, then the install command from step 5 again.
- ZIP: download the new ZIP, unzip it, repeat steps 4 and 5 in the new folder.

Your history and settings are kept.

## Uninstall

- **macOS:** drag `~/Applications/Hatchmark.app` to the Bin.
- **Windows:** Settings > Apps > Installed apps > Hatchmark > Uninstall.

Your data stays after uninstalling. To remove it too, delete:
- macOS: `~/Library/Application Support/Hatchmark`
- Windows: `%APPDATA%\Hatchmark` (paste that into the File Explorer address bar)

## Troubleshooting

Find the message you see. Each fix is one thing to try.

### "command not found: npm" / "npm is not recognized" / "node is not recognized"
Node.js is not installed, or the terminal was open before you installed it. Do step 2, then **close the terminal and open a new one**.

### "command not found: git" / "git is not recognized"
Skip Git. Use the **ZIP** option in step 3.

### "Missing script: install:mac" (or `install:win`) / "Could not read package.json"
You are not in the project folder. Redo step 4 and check that `ls` / `dir` shows `package.json`. A common cause is a folder inside a folder after unzipping: open the inner one.

### "npm run install:mac" on Windows, or the other way round
Use the command for your system: `install:mac` on macOS, `install:win` on Windows.

### "Electron failed to install correctly" / "Electron uninstall" / the app opens nothing
The download of the app's engine did not finish. This happened on Node versions newer than 22 without a visible error. Fix:

1. Install Node **22** (step 2) and open a new terminal in the project folder.
2. Delete the `node_modules` folder inside the project folder (drag it to the Bin / Recycle Bin).
3. Run the install command again.

### npm says an install script was blocked / asks you to "approve" something
New npm versions block build scripts until you allow them. In the project folder run:

```
npm install-scripts approve electron
```

Then run the install command again.

### It stops with errors mentioning `EACCES`, "permission denied" or "operation not permitted"
- **macOS:** the project is in a protected folder (Desktop, Documents, Downloads with extra privacy). Move the project folder to your home folder and redo from step 4. Do not use `sudo`.
- **Windows:** move the folder out of `Program Files` or a synced folder (OneDrive can lock files), for example to `C:\Users\<you>\projects`.

### It stops with network errors (`ETIMEDOUT`, `ECONNRESET`, "getaddrinfo", "certificate")
The download was blocked or interrupted. Check your connection, turn off the VPN, and run the install command again. On a work or school network that filters downloads, try another network.

### It downloads and builds but stops with a long red error
Run the command again once. If it fails the same way, [open an issue](https://github.com/hugommartins/drawing-practice-timer/issues) and paste the **last 30 lines** of the terminal. Say your system and the output of `node --version`.

### macOS says the app "is damaged" or "cannot be opened because the developer cannot be verified"
The app is built on your machine and not signed by Apple, which is expected. The installer clears the flag that causes this, so you should not see it. If you do:

1. Right-click (or Control-click) `Hatchmark.app`, choose **Open**, then **Open** in the dialog. You only do this once.
2. Or: System Settings > Privacy & Security, scroll down, click **Open Anyway** next to the Hatchmark message.
3. Or paste this and press Enter: `xattr -cr ~/Applications/Hatchmark.app`

### Windows says "Windows protected your PC" (SmartScreen)
Click **More info**, then **Run anyway**. Building on your computer with `npm run install:win` normally avoids this message.

### Windows blocks the app and offers no "Run anyway" (Smart App Control)
Windows 11 Smart App Control blocks every unsigned app, with no override. Open Windows Security > App & browser control > Smart App Control and switch it off. On many Windows versions it cannot be turned back on without resetting Windows, so decide before you switch it off.

### Antivirus quarantines or deletes the installer
The installer is built on your machine and unsigned, which some antivirus tools flag. Add the project folder to the antivirus exceptions, then run the install command again.

### The app opens but my images do not show
- Link the folder that holds the images (subfolders are included). Supported types are the usual ones: JPG, PNG, WebP, GIF, AVIF, BMP.
- If you added images after linking, click **Rescan** in the Library.
- If the folder moved or was renamed, link it again.

### The screen goes dark or the computer sleeps during a session
Hatchmark keeps the screen awake while a timer is running and lets it sleep again when you pause or end the session. Closing the lid or putting the computer to sleep yourself still pauses the clock, and that time is not counted.

### Where is my data?
- macOS: `~/Library/Application Support/Hatchmark/data/`
- Windows: `%APPDATA%\Hatchmark\data\`

They are plain files you can copy to back up.

### Still stuck
[Open an issue](https://github.com/hugommartins/drawing-practice-timer/issues) with: your system and version, the output of `node --version`, which step failed, and the last 30 lines of the terminal.
